"use client";

import { applyConfig, decide, initialControllerState } from "@/lib/controller/decide";
import { checkInvariants } from "@/lib/controller/invariants";
import { CHUNK_SECONDS, POLICY } from "@/lib/controller/policy";
import type {
  Arousal,
  ControllerState,
  Decision,
  IntentKind,
  TherapistKind,
  TickInput,
} from "@/lib/controller/types";
import { lintPrompt } from "@/lib/ladder/lint";
import { absolutePrompt, captionFor, capOf, promptFor } from "@/lib/ladder/resolve";
import type { Ladder, LadderContext, LadderSource } from "@/lib/ladder/schema";
import { OrbisClient, SDK_VERSION, type ChunkComplete } from "@/lib/orbis/client";
import { captureFrame, sha256OfBlob } from "@/lib/orbis/handoff";
import { ORBIS_MODEL_NAME } from "@/lib/orbis/model";
import {
  RECEIPT_SCHEMA,
  type Receipt,
  type ReceiptDecision,
  type ReceiptLabel,
  type SessionMode,
  type SignalMode,
} from "@/lib/orbis/receipts";
import { TrialRecorder } from "@/lib/orbis/recorder";
import { isType, SessionChannel, type ChannelMessages, type Envelope } from "@/lib/realtime/channel";
import { ArousalClassifier, computeBaseline, type BreathSample } from "@/lib/signal/arousal";
import { BreathSim, SIM_BASELINE_BPM, type SimMode } from "@/lib/signal/sim";

export type Phase =
  | "ready"
  | "connecting"
  | "priming"
  | "calibrating"
  | "trial"
  | "paused"
  | "handoff"
  | "rating"
  | "report"
  | "ended"
  | "busy"
  | "lost"
  | "error";

export type SessionConfig = {
  sessionId: string;
  key: string;
  phoneKey: string;
  mode: SessionMode;
  signal: SignalMode;
  fear: string;
  fearedOutcome: string;
  expectancyPre: number | null;
  consent: boolean;
  seed: number;
  trials: number;
  ladder: Ladder;
  ladderSource: LadderSource;
  ladderSha256: string;
  audio: boolean;
  intakeAt: number | null;
  builderDemo: boolean;
};

export type Rating = {
  happened: "yes" | "no" | "partly";
  expectancyAfter: number;
  suds: number;
  feeling: string | null;
};

export type TrialSummary = {
  trial: number;
  context: string;
  maxLevel: number;
  cap: number;
  secondsAtLevel: Record<number, number>;
  retreats: { reason: string; chunk: number }[];
  expectancyBefore: number | null;
  expectancyAfter: number | null;
  happened: Rating["happened"] | null;
  sudsPeak: number | null;
  trialId: string | null;
  endedBy: string | null;
};

export type WavePoint = { t: number; v: number };
export type LevelPoint = { t: number; level: number };

export type Snapshot = {
  phase: Phase;
  orbisStatus: string;
  stream: MediaStream | null;
  hasFrames: boolean;
  trial: number;
  trials: number;
  context: string;
  level: number;
  cap: number;
  caption: string | null;
  nudge: boolean;
  askSuds: boolean;
  atCapNotice: boolean;
  arousal: Arousal;
  breathBpm: number | null;
  breathConf: number | null;
  baselineBpm: number | null;
  calibrationLeftS: number | null;
  calibrationHint: string | null;
  sensor: "live" | "stale" | "none";
  suds: number | null;
  autoMode: boolean;
  wave: WavePoint[];
  levels: LevelPoint[];
  sudsTrace: { t: number; v: number }[];
  decisions: ReceiptDecision[];
  summaries: TrialSummary[];
  error: string | null;
  busyUntil: string | null;
  labels: ReceiptLabel[];
  elapsedS: number;
  maxSessionS: number | null;
  remoteConnected: boolean;
  phoneConnected: boolean;
  channelKind: "supabase" | "local" | null;
};

const CALIBRATION_S: Record<SignalMode, number> = { phone: 45, sim: 10, suds: 10 };
const CALIBRATION_MAX_S = 90;
const PAUSE_LIMIT_MS = 3 * 60_000;
const RATING_IDLE_MS = 60_000;
const WAVE_WINDOW_MS = 30_000;
const EVENT_FLUSH_MS = 2_000;
const HEARTBEAT_MS = 60_000;
const UNLANDED_CHUNKS = 4;

type PendingSend = {
  decision: ReceiptDecision;
  ackedAtChunk: number | null;
  activeBefore: string | null;
};

const now = () => Date.now();

export class SessionRuntime {
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  private client: OrbisClient | null = null;
  private channel: SessionChannel | null = null;
  private sim: BreathSim | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private classifier: ArousalClassifier | null = null;
  private latestBreath: BreathSample | null = null;
  private calibrationSamples: BreathSample[] = [];
  private latestSuds: { v: number; t: number } | null = null;
  private pendingIntent: IntentKind | null = null;
  private pendingTherapist: TherapistKind | null = null;
  private pendingDeepened = false;
  private controller: ControllerState | null = null;
  private context!: LadderContext;
  private receipt: Receipt | null = null;
  private pending: PendingSend[] = [];
  private lastChunk = -1;
  private lastActivePrompt: string | null = null;
  private lastHoldIndex: number | null = null;
  private generationComplete = false;
  private recorder = new TrialRecorder();
  private video: HTMLVideoElement | null = null;
  private anchor: Blob | null = null;
  private startedAt = 0;
  private trialStartedAt = 0;
  private pausedAt: number | null = null;
  private ratingShownAt: number | null = null;
  private eventQueue: { trial: number | null; t: number; kind: string; payload: unknown }[] = [];
  private nudgeUntilChunk = -1;
  private atCapUntil = 0;
  private lastSudsAsk = 0;
  private ending = false;
  private firstFrameAt: number | null = null;
  private calibrationStartedAt = 0;
  private sessionDeadline: number | null = null;
  private saved = new Set<number>();

  constructor(readonly config: SessionConfig) {
    this.context = config.ladder.contexts[0]!;
    this.snap = {
      phase: "ready",
      orbisStatus: "disconnected",
      stream: null,
      hasFrames: false,
      trial: 0,
      trials: config.trials,
      context: this.context.id,
      level: 0,
      cap: capOf(this.context),
      caption: null,
      nudge: false,
      askSuds: false,
      atCapNotice: false,
      arousal: "UNKNOWN",
      breathBpm: null,
      breathConf: null,
      baselineBpm: null,
      calibrationLeftS: null,
      calibrationHint: null,
      sensor: config.signal === "phone" ? "none" : "live",
      suds: null,
      autoMode: config.mode !== "therapist",
      wave: [],
      levels: [],
      sudsTrace: [],
      decisions: [],
      summaries: [],
      error: null,
      busyUntil: null,
      labels: this.labels(),
      elapsedS: 0,
      maxSessionS: null,
      remoteConnected: false,
      phoneConnected: false,
      channelKind: null,
    };
    if (config.signal === "sim") this.startSim();
    this.openChannel();
  }

  // ---------- store plumbing (useSyncExternalStore) ----------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  private labels(): ReceiptLabel[] {
    const labels: ReceiptLabel[] = ["LIVE"];
    if (this.config.signal === "sim") labels.push("SIMULATED_INPUT");
    if (this.config.builderDemo) labels.push("BUILDER_DEMO");
    return labels;
  }

  private log(kind: string, payload: unknown) {
    this.eventQueue.push({ trial: this.snap.trial || null, t: now(), kind, payload });
  }

  attachVideo(video: HTMLVideoElement | null) {
    this.video = video;
    if (!video) return;
    const markFrame = () => {
      if (!this.firstFrameAt && video.videoWidth > 0) {
        this.firstFrameAt = now();
        this.log("first_frame", { ms_from_intake: this.config.intakeAt ? this.firstFrameAt - this.config.intakeAt : null });
      }
      this.set({ hasFrames: true });
    };
    // requestVideoFrameCallback fires on the first decoded frame, after the upscaler's empty first chunk.
    video.requestVideoFrameCallback(() => markFrame());
  }

  // ---------- realtime ----------

  private openChannel() {
    this.channel = new SessionChannel({
      sessionId: this.config.sessionId,
      role: "patient",
      signKey: this.config.key,
      verifyKeys: { phone: this.config.phoneKey, remote: this.config.key },
      onMessage: (envelope) => this.onChannel(envelope),
      onStatus: () => undefined,
    });
    this.set({ channelKind: this.channel.kind });
  }

  private onChannel(envelope: Envelope) {
    if (envelope.from === "phone") this.set({ phoneConnected: true });
    if (envelope.from === "remote") this.set({ remoteConnected: true });
    if (isType(envelope, "bye")) {
      if (envelope.from === "phone") this.set({ phoneConnected: false });
      if (envelope.from === "remote") this.set({ remoteConnected: false });
      return;
    }
    if (isType(envelope, "breath") && envelope.from === "phone" && this.config.signal === "phone") {
      this.ingestBreath({ ...envelope.payload, t: envelope.t, source: "phone" });
    } else if (isType(envelope, "wave") && envelope.from === "phone" && this.config.signal === "phone") {
      const { t0, dt, s } = envelope.payload;
      this.pushWave(s.map((v, i) => ({ t: t0 + i * dt, v })));
    } else if (isType(envelope, "suds")) {
      this.reportSuds(envelope.payload.v);
    } else if (isType(envelope, "intent")) {
      this.intent(envelope.payload.kind);
    } else if (isType(envelope, "therapist") && envelope.from === "remote") {
      this.therapist(envelope.payload);
    }
  }

  private broadcastState(lastDecision: Decision | null = null) {
    if (!this.channel) return;
    const s = this.snap;
    const payload: ChannelMessages["state"] = {
      phase: s.phase,
      level: s.level,
      cap: s.cap,
      trial: s.trial,
      trials: s.trials,
      arousal: s.arousal,
      autoMode: s.autoMode,
      caption: s.caption,
      lastDecision: lastDecision
        ? { chunk: lastDecision.chunk, action: lastDecision.action, reason: lastDecision.reason }
        : null,
      sensor: s.sensor,
      breathBpm: s.breathBpm,
      baselineBpm: s.baselineBpm,
      suds: s.suds,
      signal: this.config.signal,
    };
    void this.channel.send("state", payload, this.config.key);
    void this.channel.send("state", payload, this.config.phoneKey);
    if (this.config.signal !== "phone" && s.wave.length) {
      const recent = s.wave.slice(-5);
      void this.channel.send(
        "wave",
        { t0: recent[0]!.t, dt: 100, s: recent.map((p) => Math.round(p.v * 1000) / 1000) },
        this.config.key,
      );
    }
  }

  // ---------- signals ----------

  private startSim() {
    this.sim = new BreathSim();
    let lastEstimate = 0;
    this.simTimer = setInterval(() => {
      const t = now();
      const { wave, estimate } = this.sim!.sample(t);
      this.pushWave([{ t, v: wave }]);
      if (t - lastEstimate >= 500) {
        lastEstimate = t;
        this.ingestBreath(estimate);
      }
    }, 100);
  }

  simTrigger(mode: Exclude<SimMode, "calm">) {
    if (!this.sim) return;
    this.sim.trigger(mode, now());
    this.log("sim", { mode });
  }

  private pushWave(points: WavePoint[]) {
    const cutoff = now() - WAVE_WINDOW_MS;
    const wave = [...this.snap.wave, ...points].filter((p) => p.t >= cutoff);
    this.set({ wave });
  }

  private ingestBreath(sample: BreathSample) {
    this.latestBreath = sample;
    if (this.snap.phase === "calibrating") this.calibrationSamples.push(sample);
    const arousal = this.classifier?.classify(sample, now()) ?? "UNKNOWN";
    this.set({
      breathBpm: sample.rate,
      breathConf: sample.conf,
      arousal: this.classifier ? arousal : this.snap.arousal,
      sensor: "live",
    });
  }

  reportSuds(v: number) {
    const value = Math.max(0, Math.min(10, Math.round(v)));
    this.latestSuds = { v: value, t: now() };
    this.lastSudsAsk = now();
    this.set({ suds: value, askSuds: false, sudsTrace: [...this.snap.sudsTrace, { t: now(), v: value }].slice(-400) });
    if (this.receipt) this.receipt.suds.push({ t: now(), v: value });
    this.log("suds", { v: value });
  }

  intent(kind: IntentKind) {
    this.log("intent", { kind });
    if (kind === "closer" && this.controller && this.controller.level >= this.controller.config.cap) {
      this.atCapUntil = now() + 4000;
      this.set({ atCapNotice: true });
      return;
    }
    this.pendingIntent = kind;
    // Pause, resume and end act now rather than waiting for a chunk that may never come.
    if ((kind === "pause" || kind === "resume" || kind === "end") && this.controller) {
      void this.tick(null);
    }
  }

  private therapist(message: ChannelMessages["therapist"]) {
    if (this.config.mode !== "therapist") return;
    this.log("therapist", message);
    if (!this.controller) return;
    if (message.kind === "cap" && typeof message.value === "number") {
      this.controller = applyConfig(this.controller, { cap: Math.min(message.value, capOf(this.context)) });
      this.set({ cap: this.controller.config.cap });
    } else if (message.kind === "auto" && typeof message.value === "boolean") {
      this.controller = applyConfig(this.controller, { autoMode: message.value });
      this.set({ autoMode: message.value });
    } else if (message.kind === "deepened") {
      this.pendingDeepened = true;
      this.pendingTherapist = "vary";
    } else if (message.kind !== "cap" && message.kind !== "auto") {
      this.pendingTherapist = message.kind;
      if (message.kind === "end_trial") void this.tick(null);
    }
    this.broadcastState();
  }

  // ---------- lifecycle ----------

  async start() {
    if (this.snap.phase !== "ready" && this.snap.phase !== "lost" && this.snap.phase !== "busy") return;
    this.set({ phase: "connecting", error: null });
    const token = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key }),
    });
    const body = (await token.json().catch(() => ({}))) as {
      jwt?: string;
      error?: string;
      message?: string;
      leaseUntil?: string;
      maxSessionS?: number;
    };
    if (token.status === 409) {
      this.set({ phase: "busy", busyUntil: body.leaseUntil ?? null, error: body.message ?? "The live slot is busy." });
      return;
    }
    if (!token.ok || !body.jwt) {
      this.set({ phase: "error", error: body.message ?? body.error ?? "Could not start a live session." });
      return;
    }
    const jwt = body.jwt;
    if (body.maxSessionS) {
      this.sessionDeadline = now() + body.maxSessionS * 1000 - 5000;
      this.set({ maxSessionS: body.maxSessionS });
    }

    this.client = new OrbisClient(async () => jwt);
    this.wireClient(this.client);
    this.startTimers();
    try {
      await this.client.connect();
      this.startedAt = now();
      this.set({ phase: "priming", stream: this.client.stream });
      await this.startTrialRun(1, true);
    } catch (error) {
      await this.fail(error);
    }
  }

  private wireClient(client: OrbisClient) {
    client.on("status", (status) => {
      this.set({ orbisStatus: status });
      if (status === "disconnected" && !this.ending && ["trial", "calibrating", "paused", "priming"].includes(this.snap.phase)) {
        this.controller = null;
        this.log("connection_lost", {});
        void this.finalizeTrial("CONNECTION_LOST");
        this.set({ phase: "lost", error: "Connection lost. Resume starts a new take." });
      }
    });
    client.on("stream", (stream) => this.set({ stream }));
    client.on("chunk", (chunk) => void this.onChunk(chunk));
    client.on("complete", () => {
      this.generationComplete = true;
    });
    client.on("commandError", (command, reason) => {
      this.log("command_error", { command, reason });
      this.set({ error: `${command}: ${reason}` });
    });
    client.on("error", (message) => this.log("reactor_error", { message }));
  }

  private startTimers() {
    this.timers.push(
      setInterval(() => void this.flushEvents(), EVENT_FLUSH_MS),
      setInterval(() => void this.heartbeat(), HEARTBEAT_MS),
      setInterval(() => this.housekeeping(), 1000),
    );
    window.addEventListener("pagehide", this.onPageHide);
  }

  private onPageHide = () => {
    navigator.sendBeacon(
      "/api/slot/release",
      new Blob([JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key })], { type: "application/json" }),
    );
  };

  private housekeeping() {
    const t = now();
    const patch: Partial<Snapshot> = { elapsedS: this.startedAt ? Math.round((t - this.startedAt) / 1000) : 0 };
    if (this.config.signal === "phone" && this.latestBreath) {
      patch.sensor = (t - this.latestBreath.t) / 1000 > POLICY.sensorStaleS ? "stale" : "live";
    }
    if (this.snap.atCapNotice && t > this.atCapUntil) patch.atCapNotice = false;
    if (this.snap.phase === "trial" && this.needsSudsPrompt(t)) patch.askSuds = true;
    if (this.snap.phase === "calibrating") this.calibrationTick(t, patch);
    this.set(patch);

    if (this.pausedAt && t - this.pausedAt > PAUSE_LIMIT_MS) void this.end("PAUSE_TIMEOUT");
    if (this.ratingShownAt && t - this.ratingShownAt > RATING_IDLE_MS) void this.end("IDLE");
    if (this.sessionDeadline && t > this.sessionDeadline && !this.ending) void this.end("SESSION_CAP");
  }

  private needsSudsPrompt(t: number): boolean {
    // Without a live breath signal the controller holds on NO_SIGNAL, so keep asking for a rating.
    if (this.config.signal !== "suds" && this.snap.sensor === "live") return false;
    return t - this.lastSudsAsk > POLICY.sudsReaskS * 1000;
  }

  private async heartbeat() {
    if (!this.client || this.ending) return;
    const response = await fetch("/api/slot/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key }),
    }).catch(() => null);
    if (response && !response.ok) this.log("heartbeat_failed", { status: response.status });
  }

  private async flushEvents() {
    if (!this.eventQueue.length) return;
    const events = this.eventQueue.splice(0, 200);
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key, events }),
      keepalive: true,
    }).catch(() => this.eventQueue.unshift(...events));
  }

  // ---------- calibration ----------

  private calibrationTick(t: number, patch: Partial<Snapshot>) {
    const elapsed = (t - this.calibrationStartedAt) / 1000;
    const target = CALIBRATION_S[this.config.signal];
    patch.calibrationLeftS = Math.max(0, Math.ceil(target - elapsed));
    if (elapsed < target) return;

    let baseline: number | null = null;
    if (this.config.signal === "sim") baseline = SIM_BASELINE_BPM;
    if (this.config.signal === "phone") {
      baseline = computeBaseline(this.calibrationSamples).bpm;
      if (baseline === null && elapsed < CALIBRATION_MAX_S) {
        patch.calibrationHint = "Adjust the phone so it lies flat on your chest.";
        return;
      }
      if (baseline === null) patch.calibrationHint = "We'll go by your ratings instead of breathing.";
    }
    if (baseline !== null) this.classifier = new ArousalClassifier(baseline);
    patch.baselineBpm = baseline;
    patch.calibrationLeftS = null;
    this.log("calibrated", { baseline_bpm: baseline, samples: this.calibrationSamples.length });
    void this.enterSubject();
  }

  // ---------- trials ----------

  private contextForTrial(trial: number): LadderContext {
    const contexts = this.config.ladder.contexts;
    return contexts[(trial - 1) % contexts.length]!;
  }

  private async startTrialRun(trial: number, withCalibration: boolean) {
    const client = this.client!;
    this.context = this.contextForTrial(trial);
    const sameContext = trial > 1 && this.contextForTrial(trial - 1).id === this.context.id;
    const image = sameContext ? this.anchor : null;
    const startLevel = withCalibration ? 0 : 1;
    const prompt = absolutePrompt(this.context, startLevel);
    if (lintPrompt(prompt, "absolute").length) throw new Error("Start prompt failed lint");

    this.generationComplete = false;
    this.lastChunk = -1;
    this.lastActivePrompt = null;
    this.pending = [];
    this.set({ phase: "priming", trial, context: this.context.id, level: startLevel, cap: capOf(this.context), caption: null, nudge: false });

    const run = await client.startRun({ prompt, seed: this.config.seed, image, audio: this.config.audio });
    this.trialStartedAt = now();
    this.receipt = this.newReceipt(trial, startLevel, prompt, image ? await sha256OfBlob(image) : null, run.maxChunks, run.resolution);
    if (this.config.consent && this.snap.stream && TrialRecorder.supported()) this.recorder.start(this.snap.stream);
    this.log("run_started", { trial, context: this.context.id, image: Boolean(image), max_chunks: run.maxChunks });

    if (withCalibration) {
      this.calibrationStartedAt = now();
      this.calibrationSamples = [];
      this.set({
        phase: "calibrating",
        caption: "Let's get a feel for your normal breathing. Just watch the scene.",
        levels: [...this.snap.levels, { t: now(), level: 0 }],
      });
    } else {
      this.beginController(1, run.maxChunks);
    }
  }

  /** After calibration the subject arrives by action; that send opens trial 1. */
  private async enterSubject() {
    if (!this.client || !this.receipt) return;
    const prompt = this.context.enter;
    this.receipt.start = { ...this.receipt.start, level: 1, prompt, t: now() };
    this.beginController(1, this.receipt.max_chunks);
    // The enter prompt counts as a send, so the first decision respects the landing window.
    this.controller = { ...this.controller!, lastSendChunk: Math.max(this.lastChunk, 0) };
    const ack = await this.client.setPrompt(prompt);
    this.log("enter", { prompt, ack });
  }

  private beginController(startLevel: number, maxChunks: number | null) {
    const cap = capOf(this.context);
    const trialMax = Math.min((maxChunks ?? 229) - 2, POLICY.trialMaxChunks);
    this.controller = initialControllerState(
      { cap, autoMode: this.snap.autoMode, trialMax },
      startLevel,
    );
    this.set({
      phase: "trial",
      level: startLevel,
      cap,
      caption: this.config.signal === "suds" ? "How are you now? 0–9" : null,
      levels: [...this.snap.levels, { t: now(), level: startLevel }],
    });
    this.lastSudsAsk = now();
    this.broadcastState();
  }

  private newReceipt(
    trial: number,
    level: number,
    prompt: string,
    imageSha: string | null,
    maxChunks: number | null,
    resolution: string | null,
  ): Receipt {
    return {
      schema: RECEIPT_SCHEMA,
      session: this.config.sessionId,
      trial,
      mode: this.config.signal,
      model: ORBIS_MODEL_NAME,
      sdk: SDK_VERSION,
      seed: this.config.seed,
      resolution,
      audio_enabled: this.config.audio,
      max_chunks: maxChunks,
      ladder: {
        fearId: this.config.ladder.fearId,
        context: this.context.id,
        source: this.config.ladderSource,
        sha256: this.config.ladderSha256,
      },
      start: { t: now(), level, prompt, image_sha256: imageSha },
      chunks: [],
      signal: { source: this.config.signal, baseline_bpm: this.snap.baselineBpm, samples: [] },
      suds: [],
      decisions: [],
      ev: null,
      ratings: {
        expectancy_before: trial === 1 ? this.config.expectancyPre : (this.snap.summaries.at(-1)?.expectancyAfter ?? null),
        expectancy_after: null,
        happened: null,
        suds_peak: null,
        feeling: null,
      },
      recording: null,
      invariant_violations: [],
      timing: {
        first_frame_ms: this.firstFrameAt && this.startedAt ? this.firstFrameAt - this.startedAt : null,
        intake_to_first_frame_ms:
          trial === 1 && this.firstFrameAt && this.config.intakeAt ? this.firstFrameAt - this.config.intakeAt : null,
      },
      labels: this.labels(),
      ended_by: null,
    };
  }

  private receiptDecision(
    d: Pick<Decision, "chunk" | "action" | "reason" | "levelBefore" | "levelAfter">,
    prompt: string | null,
  ): ReceiptDecision {
    return {
      t: now(),
      chunk: d.chunk,
      kind: d.action,
      reason: d.reason,
      level_before: d.levelBefore,
      level_after: d.levelAfter,
      inputs: {
        arousal: this.snap.arousal,
        suds: this.latestSuds?.v ?? null,
        breath_bpm: this.latestBreath?.rate ?? null,
        breath_conf: this.latestBreath?.conf ?? null,
        intent: this.pendingIntent,
        therapist: this.pendingTherapist,
      },
      prompt,
      accepted_ms: null,
      landed_chunk: null,
      landed_by: null,
      outcome: prompt ? "requested" : null,
    };
  }

  private async onChunk(chunk: ChunkComplete) {
    this.lastChunk = chunk.chunkIndex;
    if (this.receipt) {
      this.receipt.chunks.push({
        i: chunk.chunkIndex,
        t: now(),
        active_prompt: chunk.activePrompt,
        frames: chunk.framesEmitted,
      });
      if (this.latestBreath) {
        this.receipt.signal.samples.push({
          t: now(),
          rate: this.latestBreath.rate,
          conf: this.latestBreath.conf,
          arousal: this.snap.arousal,
        });
      }
    }
    this.trackLanding(chunk);
    if (this.snap.phase === "trial") await this.tick(chunk);
  }

  /** Executed = first chunk with a changed active_prompt; without it, the boundary after the ack (inferred). */
  private trackLanding(chunk: ChunkComplete) {
    const changed = chunk.activePrompt !== null && chunk.activePrompt !== this.lastActivePrompt;
    if (chunk.activePrompt !== null) this.lastActivePrompt = chunk.activePrompt;
    for (const send of this.pending) {
      if (send.decision.landed_chunk !== null || send.decision.outcome === "unacked") continue;
      if (changed) {
        send.decision.landed_chunk = chunk.chunkIndex;
        send.decision.landed_by = "active_prompt";
        send.decision.outcome = "executed";
      } else if (chunk.activePrompt === null && send.ackedAtChunk !== null && chunk.chunkIndex > send.ackedAtChunk) {
        send.decision.landed_chunk = chunk.chunkIndex + 1;
        send.decision.landed_by = "next_boundary";
        send.decision.outcome = "executed";
      } else if (send.ackedAtChunk !== null && chunk.chunkIndex - send.ackedAtChunk > UNLANDED_CHUNKS) {
        send.decision.outcome = "unlanded";
      }
    }
    this.pending = this.pending.filter((p) => p.decision.landed_chunk === null && p.decision.outcome !== "unlanded");
  }

  private tickInput(chunkIndex: number): TickInput {
    const t = now();
    const arousal: Arousal =
      this.config.signal === "suds" || !this.classifier
        ? "UNKNOWN"
        : this.classifier.classify(this.latestBreath, t);
    const input: TickInput = {
      chunkIndex,
      arousal,
      suds: this.latestSuds ? { value: this.latestSuds.v, ageS: (t - this.latestSuds.t) / 1000 } : null,
      intent: this.pendingIntent,
      therapist: this.pendingTherapist,
      generationComplete: this.generationComplete,
    };
    this.set({ arousal });
    return input;
  }

  private async tick(chunk: ChunkComplete | null) {
    if (!this.controller || !this.receipt || !this.client) return;
    const chunkIndex = chunk ? chunk.chunkIndex : Math.max(this.lastChunk, 0);
    const input = this.tickInput(chunkIndex);
    const before = this.controller;
    const step = decide(before, input);
    const decision = step.decision;
    this.controller = step.state;
    this.pendingIntent = null;
    this.pendingTherapist = null;

    const violations = checkInvariants(before, decision);
    this.receipt.invariant_violations.push(...violations);

    let prompt: string | null = null;
    if (decision.sends) {
      const choice = promptFor(decision.action, {
        ladder: this.config.ladder,
        context: this.context,
        levelBefore: decision.levelBefore,
        levelAfter: decision.levelAfter,
        fearedOutcome: this.config.fearedOutcome,
        lastHoldIndex: this.lastHoldIndex,
      });
      prompt = choice?.prompt ?? null;
      if (decision.reason === "THERAPIST_VARY" && this.pendingDeepened && this.config.ladder.deepened[0]) {
        prompt = this.config.ladder.deepened[0];
        this.pendingDeepened = false;
      }
      if (choice?.holdIndex !== undefined) this.lastHoldIndex = choice.holdIndex;
      if (prompt && lintPrompt(prompt, "transition").length) {
        this.receipt.invariant_violations.push({ id: "INV7", chunk: chunkIndex, detail: "prompt failed lint; not sent" });
        prompt = null;
      }
    }

    const record = this.receiptDecision(decision, prompt);
    record.inputs.intent = input.intent;
    record.inputs.therapist = input.therapist;
    record.inputs.arousal = decision.signal.arousal;
    if (decision.action !== "none") {
      this.receipt.decisions.push(record);
      this.log("decision", record);
    }
    if (decision.action === "ev" && prompt) this.receipt.ev = { t: now(), prompt };

    if (decision.action === "nudge") this.nudgeUntilChunk = chunkIndex + POLICY.intentTtlChunks;
    const caption = captionFor(decision.action, decision.reason, this.context);
    this.set({
      level: decision.levelAfter,
      caption: caption ?? (decision.action === "none" ? this.snap.caption : null),
      nudge: chunkIndex <= this.nudgeUntilChunk && decision.levelAfter < this.controller.config.cap,
      askSuds: decision.askSuds || this.snap.askSuds,
      decisions: decision.action !== "none" ? [...this.snap.decisions, record].slice(-200) : this.snap.decisions,
      levels:
        decision.levelAfter !== decision.levelBefore
          ? [...this.snap.levels, { t: now(), level: decision.levelAfter }]
          : this.snap.levels,
    });
    this.broadcastState(decision);

    if (prompt) await this.send(record, prompt);
    if (decision.action === "pause") await this.pauseRun();
    if (decision.action === "resume") await this.resumeRun();
    if (decision.action === "end_trial") await this.finalizeTrial(decision.reason);
  }

  private async send(record: ReceiptDecision, prompt: string) {
    const client = this.client!;
    const pending: PendingSend = { decision: record, ackedAtChunk: null, activeBefore: this.lastActivePrompt };
    this.pending.push(pending);
    let ack = await client.setPrompt(prompt);
    if (!ack.accepted) {
      this.log("prompt_unacked", { prompt, reason: ack.reason });
      ack = await client.setPrompt(prompt);
    }
    record.accepted_ms = ack.ms;
    if (ack.accepted) {
      record.outcome = "acknowledged";
      pending.ackedAtChunk = this.lastChunk;
    } else {
      record.outcome = "unacked";
      this.set({ error: "The scene didn't respond. Pausing so you stay in control." });
      this.intent("pause");
    }
  }

  private async pauseRun() {
    this.pausedAt = now();
    this.set({ phase: "paused", caption: "Take your time. Resume when ready." });
    await this.client?.pause().catch((error: unknown) => this.log("pause_failed", { error: String(error) }));
    this.broadcastState();
  }

  private async resumeRun() {
    this.pausedAt = null;
    this.set({ phase: "trial", caption: null });
    await this.client?.resume().catch((error: unknown) => this.log("resume_failed", { error: String(error) }));
    this.broadcastState();
  }

  private summarize(receipt: Receipt, trialId: string | null): TrialSummary {
    const secondsAtLevel: Record<number, number> = {};
    const changes = [{ t: receipt.start.t, level: receipt.start.level }, ...receipt.decisions.filter((d) => d.level_after !== d.level_before).map((d) => ({ t: d.t, level: d.level_after }))];
    const endT = receipt.decisions.at(-1)?.t ?? now();
    changes.forEach((change, i) => {
      const until = changes[i + 1]?.t ?? endT;
      secondsAtLevel[change.level] = Math.round(((secondsAtLevel[change.level] ?? 0) + (until - change.t) / 1000) * 10) / 10;
    });
    return {
      trial: receipt.trial,
      context: receipt.ladder.context,
      maxLevel: Math.max(receipt.start.level, ...receipt.decisions.map((d) => d.level_after)),
      cap: capOf(this.context),
      secondsAtLevel,
      retreats: receipt.decisions.filter((d) => d.kind === "down").map((d) => ({ reason: d.reason, chunk: d.chunk })),
      expectancyBefore: receipt.ratings.expectancy_before,
      expectancyAfter: receipt.ratings.expectancy_after,
      happened: receipt.ratings.happened,
      sudsPeak: receipt.ratings.suds_peak,
      trialId,
      endedBy: receipt.ended_by,
    };
  }

  private async finalizeTrial(reason: Receipt["ended_by"] | string) {
    if (!this.receipt || this.snap.phase === "rating" || this.snap.phase === "handoff") return;
    this.controller = null;
    this.receipt.ended_by = reason as Receipt["ended_by"];
    this.set({ phase: "handoff", caption: "Before we go on, did what you expected happen?", nudge: false });
    await this.client?.pause().catch(() => undefined);
    if (this.video) this.anchor = await captureFrame(this.video).catch(() => null);
    const recording = await this.recorder.stop().catch(() => null);
    if (recording) {
      this.receipt.recording = { path: "", sha256: recording.sha256, bytes: recording.bytes };
      void this.upload(this.receipt, recording.blob);
    }
    if (reason === "CONNECTION_LOST") {
      void this.saveTrial(this.receipt);
      return;
    }
    this.ratingShownAt = now();
    this.set({ phase: "rating" });
    this.broadcastState();
  }

  private async upload(receipt: Receipt, blob: Blob) {
    const recording = receipt.recording!;
    const response = await fetch("/api/recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: this.config.sessionId,
        key: this.config.key,
        trial: receipt.trial,
        sha256: recording.sha256,
        bytes: recording.bytes,
      }),
    }).catch(() => null);
    if (!response?.ok) return;
    const { uploadUrl, path } = (await response.json()) as { uploadUrl: string; path: string };
    const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "video/webm" } }).catch(() => null);
    if (!put?.ok) return;
    recording.path = path;
    this.log("recording_uploaded", { trial: receipt.trial, path, sha256: recording.sha256, bytes: recording.bytes });
    // The receipt may already be stored without the path; upsert it again.
    if (this.saved.has(receipt.trial)) await this.saveTrial(receipt);
  }

  private async saveTrial(receipt: Receipt): Promise<string | null> {
    const response = await fetch("/api/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key, receipt }),
    }).catch(() => null);
    if (!response?.ok) return null;
    this.saved.add(receipt.trial);
    return ((await response.json()) as { id: string }).id;
  }

  async submitRating(rating: Rating) {
    if (!this.receipt || this.snap.phase !== "rating") return;
    this.ratingShownAt = null;
    const peak = Math.max(rating.suds, ...this.receipt.suds.map((s) => s.v));
    this.receipt.ratings = {
      ...this.receipt.ratings,
      expectancy_after: rating.expectancyAfter,
      happened: rating.happened,
      suds_peak: peak,
      feeling: rating.feeling,
    };
    this.log("rating", rating);
    const receipt = this.receipt;
    const trialId = await this.saveTrial(receipt);
    this.set({ summaries: [...this.snap.summaries, this.summarize(receipt, trialId)] });

    if (receipt.trial >= this.config.trials) {
      await this.end("COMPLETE");
      return;
    }
    try {
      this.set({ phase: "priming", caption: null });
      await this.client!.reset();
      await this.startTrialRun(receipt.trial + 1, false);
    } catch (error) {
      await this.fail(error);
    }
  }

  async retryAfterLoss() {
    if (this.snap.phase !== "lost") return;
    this.ending = false;
    await this.client?.disconnect().catch(() => undefined);
    this.client = null;
    this.set({ phase: "ready" });
    await this.start();
  }

  private async fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.log("fatal", { message });
    this.set({ phase: "error", error: message });
    await this.teardown();
  }

  async end(reason: string = "USER_END") {
    if (this.ending) return;
    this.ending = true;
    this.log("end", { reason });
    if (this.receipt && ["trial", "paused", "calibrating", "priming"].includes(this.snap.phase)) {
      this.receipt.ended_by = reason === "SESSION_CAP" ? "SESSION_CAP" : "USER_END";
      const recording = await this.recorder.stop().catch(() => null);
      if (recording) this.receipt.recording = { path: "", sha256: recording.sha256, bytes: recording.bytes };
      const trialId = await this.saveTrial(this.receipt);
      this.set({ summaries: [...this.snap.summaries, this.summarize(this.receipt, trialId)] });
    }
    await this.teardown();
    this.set({ phase: this.snap.summaries.length ? "report" : "ended", caption: null });
  }

  private async teardown() {
    this.controller = null;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    window.removeEventListener("pagehide", this.onPageHide);
    await this.flushEvents();
    try {
      await this.client?.reset();
    } catch {
      this.log("reset_on_end_failed", {});
    }
    await this.client?.disconnect().catch(() => undefined);
    await fetch("/api/slot/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.config.sessionId, key: this.config.key }),
      keepalive: true,
    }).catch(() => undefined);
    this.broadcastState();
  }

  dispose() {
    if (this.simTimer) clearInterval(this.simTimer);
    this.channel?.close();
    if (!this.ending && this.client) void this.end("UNMOUNT");
  }

  get receiptsSoFar(): number {
    return this.snap.summaries.length;
  }

  static chunkSeconds = CHUNK_SECONDS;
}
