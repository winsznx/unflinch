"use client";

import { Reactor, type ReactorStatus } from "@reactor-team/js-sdk";

import { ORBIS_MODEL_NAME, ORBIS_TRACKS, unwrapOrbisMessage, type OrbisMessage } from "@/lib/orbis/model";

export const SDK_VERSION = "@reactor-team/js-sdk@3.0.2";

export type ChunkComplete = {
  chunkIndex: number;
  framesEmitted: number;
  activePrompt: string | null;
  receivedAt: number;
};

export type RunStarted = {
  maxChunks: number | null;
  fps: number | null;
  resolution: string | null;
  imageConditioned: boolean | null;
  at: number;
};

export type OrbisEvents = {
  status: (status: ReactorStatus) => void;
  chunk: (chunk: ChunkComplete) => void;
  started: (run: RunStarted) => void;
  complete: (totalChunks: number | null) => void;
  commandError: (command: string, reason: string) => void;
  stream: (stream: MediaStream) => void;
  error: (message: string) => void;
};

type Listener<K extends keyof OrbisEvents> = OrbisEvents[K];

export type PromptAck = { accepted: boolean; ms: number; reason?: string };

const READY_TIMEOUT_MS = 15_000;
// PRD §4.2 said 2 s. Measured in G1: prompt_accepted arrives at the next chunk boundary, 1.72–1.95 s after
// sending (n = 9), so 2 s timed out on normal acks. Two chunks leaves room without hiding a real stall.
const ACK_TIMEOUT_MS = 3_700;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Thin imperative wrapper over the Reactor SDK for one Orbis session.
 * Encodes the PRD §4.2 run start order and turns raw broadcasts into typed events.
 */
export class OrbisClient {
  private reactor: Reactor;
  private listeners: { [K in keyof OrbisEvents]: Set<Listener<K>> } = {
    status: new Set(),
    chunk: new Set(),
    started: new Set(),
    complete: new Set(),
    commandError: new Set(),
    stream: new Set(),
    error: new Set(),
  };
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private waiters = new Map<string, (message: OrbisMessage) => void>();
  availableResolutions: string[] = [];
  status: ReactorStatus = "disconnected";
  sessionId: string | null = null;
  readonly stream = new MediaStream();

  constructor(jwt: () => Promise<string>) {
    this.reactor = new Reactor({
      modelName: ORBIS_MODEL_NAME,
      apiUrl: "https://api.reactor.inc",
      modelTracks: ORBIS_TRACKS.map((track) => ({ ...track })),
      jwt,
    });
    this.reactor.on("statusChanged", (status) => {
      this.status = status;
      this.emit("status", status);
    });
    this.reactor.on("sessionIdChanged", (id) => {
      this.sessionId = id ?? null;
    });
    this.reactor.on("error", (error) => this.emit("error", `${error.code}: ${error.message}`));
    this.reactor.on("trackReceived", (name, track) => this.attachTrack(name, track));
    this.reactor.on("message", (raw) => this.handle(unwrapOrbisMessage(raw)));
  }

  on<K extends keyof OrbisEvents>(event: K, listener: OrbisEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  private emit<K extends keyof OrbisEvents>(event: K, ...args: Parameters<OrbisEvents[K]>) {
    for (const listener of this.listeners[event]) {
      (listener as (...a: Parameters<OrbisEvents[K]>) => void)(...args);
    }
  }

  private attachTrack(name: string, track: MediaStreamTrack) {
    const previous = name === "main_video" ? this.videoTrack : name === "main_audio" ? this.audioTrack : null;
    if (previous) this.stream.removeTrack(previous);
    if (name === "main_video") this.videoTrack = track;
    else if (name === "main_audio") this.audioTrack = track;
    else return;
    this.stream.addTrack(track);
    this.emit("stream", this.stream);
  }

  private handle(message: OrbisMessage & Record<string, unknown>) {
    const type = message.type ?? "";
    this.waiters.get(type)?.(message);
    this.waiters.delete(type);

    switch (type) {
      case "state":
        if (Array.isArray(message.available_resolutions)) {
          this.availableResolutions = message.available_resolutions.map(String);
        }
        break;
      case "chunk_complete":
        this.emit("chunk", {
          chunkIndex: Number(message.chunk_index ?? message.session_chunk ?? 0),
          framesEmitted: Number(message.frames_emitted ?? 0),
          activePrompt: typeof message.active_prompt === "string" ? message.active_prompt : null,
          receivedAt: performance.now(),
        });
        break;
      case "generation_started":
        this.emit("started", {
          maxChunks: typeof message.max_chunks === "number" ? message.max_chunks : null,
          fps: typeof message.fps === "number" ? message.fps : null,
          resolution: typeof message.resolution === "string" ? message.resolution : null,
          imageConditioned: typeof message.image_conditioned === "boolean" ? message.image_conditioned : null,
          at: performance.now(),
        });
        break;
      case "generation_complete":
        this.emit("complete", typeof message.total_chunks === "number" ? message.total_chunks : null);
        break;
      case "command_error":
        this.emit("commandError", String(message.command ?? "command"), String(message.reason ?? "rejected"));
        break;
    }
  }

  private waitFor(type: string, ms = READY_TIMEOUT_MS): Promise<OrbisMessage> {
    return withTimeout(
      new Promise<OrbisMessage>((resolve) => this.waiters.set(type, resolve)),
      ms,
      `Orbis ${type}`,
    ).finally(() => this.waiters.delete(type));
  }

  async connect(): Promise<void> {
    await this.reactor.connect();
  }

  async disconnect(): Promise<void> {
    try {
      await this.reactor.disconnect();
    } finally {
      this.waiters.clear();
    }
  }

  private async command(name: string, data: Record<string, unknown> = {}): Promise<OrbisMessage | null> {
    const reply = await this.reactor.sendCommand(name, data);
    if (!reply) return null;
    const message = unwrapOrbisMessage(reply);
    if (message.type === "command_error") throw new Error(`${name}: ${message.reason ?? "rejected"}`);
    return message;
  }

  /** PRD §4.2 run start order: resolution → audio → seed → image → prompt → start. */
  async startRun(args: { prompt: string; seed: number; image?: Blob | null; audio: boolean }): Promise<RunStarted> {
    // The first state snapshot can land after connect() resolves; without it set_resolution is skipped
    // and Orbis falls back to its 2k default (seen in the first live run).
    const until = Date.now() + 5_000;
    while (!this.availableResolutions.length && Date.now() < until) {
      await this.waitFor("state", until - Date.now()).catch(() => undefined);
    }
    const resolution =
      this.availableResolutions.find((r) => r === "1080p") ?? this.availableResolutions[0] ?? null;
    if (resolution) await this.command("set_resolution", { resolution });
    await this.command("set_audio_enabled", { audio_enabled: args.audio });
    await this.command("set_seed", { seed: args.seed });

    if (args.image) {
      const file = new File([args.image], "anchor.jpg", { type: "image/jpeg" });
      const uploaded = await this.reactor.uploadFile(file, { name: file.name });
      const reply = await this.command("set_image", { image: uploaded });
      if (reply?.type !== "image_accepted") throw new Error("Orbis did not accept the anchor image");
    }

    const ready = this.waitFor("conditions_ready");
    await this.command("set_prompt", { prompt: args.prompt });
    await ready;

    const started = new Promise<RunStarted>((resolve) => {
      const off = this.on("started", (run) => {
        off();
        resolve(run);
      });
    });
    await this.command("start");
    return withTimeout(started, 30_000, "generation_started");
  }

  /** One live steer. The awaited reply is the acknowledgement (SDK 3.x). */
  async setPrompt(prompt: string): Promise<PromptAck> {
    const sentAt = performance.now();
    try {
      const reply = await withTimeout(
        this.reactor.sendCommand("set_prompt", { prompt }),
        ACK_TIMEOUT_MS,
        "prompt_accepted",
      );
      const message = reply ? unwrapOrbisMessage(reply) : null;
      const ms = Math.round(performance.now() - sentAt);
      if (message?.type === "prompt_accepted") return { accepted: true, ms };
      return { accepted: false, ms, reason: message?.reason ?? message?.type ?? "no reply" };
    } catch (error) {
      return { accepted: false, ms: Math.round(performance.now() - sentAt), reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async pause() {
    await this.command("pause");
  }

  async resume() {
    await this.command("resume");
  }

  async reset() {
    await this.command("reset");
  }
}
