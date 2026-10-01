"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import type { IntentKind, TherapistKind } from "@/lib/controller/types";

export type Sender = "phone" | "remote" | "patient";

export type ChannelMessages = {
  breath: { t: number; rate: number | null; cv: number | null; amp: number | null; conf: number; holdS: number };
  wave: { t0: number; dt: number; s: number[] };
  suds: { t: number; v: number };
  intent: { t: number; kind: IntentKind };
  therapist: { t: number; kind: TherapistKind | "cap" | "auto" | "deepened"; value?: number | boolean };
  state: {
    phase: string;
    level: number;
    cap: number;
    trial: number;
    trials: number;
    arousal: string;
    autoMode: boolean;
    caption: string | null;
    lastDecision: { chunk: number; action: string; reason: string } | null;
    sensor: "live" | "stale" | "none";
    breathBpm: number | null;
    baselineBpm: number | null;
    suds: number | null;
    signal: "phone" | "sim" | "suds";
  };
  hello: { t: number; role: Sender };
  bye: { t: number; role: Sender };
};

export type MessageType = keyof ChannelMessages;

export type Envelope<T extends MessageType = MessageType> = {
  type: T;
  from: Sender;
  t: number;
  payload: ChannelMessages[T];
  sig: string;
};

const MAX_AGE_MS = 10_000;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(hex: string): Promise<CryptoKey> {
  let key = keyCache.get(hex);
  if (!key) {
    const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
    key = crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(hex, key);
  }
  return key;
}

const signingInput = (type: string, from: string, t: number, payload: unknown) =>
  encoder.encode(`${type}|${from}|${t}|${JSON.stringify(payload)}`);

async function sign(keyHex: string, type: string, from: Sender, t: number, payload: unknown): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(keyHex), signingInput(type, from, t, payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verify(keyHex: string, envelope: Envelope): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(envelope.sig)) return false;
  const mac = new Uint8Array(envelope.sig.match(/../g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(keyHex),
    mac,
    signingInput(envelope.type, envelope.from, envelope.t, envelope.payload),
  );
}

interface Transport {
  send(envelope: Envelope): Promise<void>;
  close(): void;
}

function supabaseTransport(name: string, onMessage: (raw: unknown) => void, onStatus: (ok: boolean) => void): Transport | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const channel: RealtimeChannel = client.channel(name, { config: { broadcast: { self: false, ack: false } } });
  channel.on("broadcast", { event: "m" }, ({ payload }) => onMessage(payload));
  channel.subscribe((status) => onStatus(status === "SUBSCRIBED"));
  return {
    async send(envelope) {
      await channel.send({ type: "broadcast", event: "m", payload: envelope });
    },
    close() {
      void client.removeChannel(channel);
    },
  };
}

function localTransport(name: string, onMessage: (raw: unknown) => void, onStatus: (ok: boolean) => void): Transport {
  const channel = new BroadcastChannel(name);
  channel.onmessage = (event) => onMessage(event.data);
  queueMicrotask(() => onStatus(true));
  return {
    async send(envelope) {
      channel.postMessage(envelope);
    },
    close() {
      channel.close();
    },
  };
}

export type ChannelOptions = {
  sessionId: string;
  role: Sender;
  /** Key this end signs with. */
  signKey: string;
  /** Keys this end accepts messages from, by sender. Unlisted senders are dropped. */
  verifyKeys: Partial<Record<Sender, string>>;
  onMessage: (envelope: Envelope) => void;
  onStatus?: (connected: boolean) => void;
};

/**
 * `unflinch:{sessionId}` broadcast channel. Every message is HMAC-signed by its sender; receivers drop
 * unsigned, mis-signed and stale (>10 s) messages, so knowing the channel name isn't enough to steer.
 */
export class SessionChannel {
  private transport: Transport;
  readonly kind: "supabase" | "local";

  constructor(private options: ChannelOptions) {
    const name = `unflinch:${options.sessionId}`;
    const onRaw = (raw: unknown) => void this.receive(raw);
    const onStatus = (ok: boolean) => options.onStatus?.(ok);
    const remote = supabaseTransport(name, onRaw, onStatus);
    this.kind = remote ? "supabase" : "local";
    this.transport = remote ?? localTransport(name, onRaw, onStatus);
  }

  private async receive(raw: unknown) {
    const envelope = raw as Envelope;
    if (!envelope || typeof envelope.type !== "string" || typeof envelope.t !== "number") return;
    const key = this.options.verifyKeys[envelope.from];
    if (!key) return;
    if (Math.abs(Date.now() - envelope.t) > MAX_AGE_MS) return;
    if (!(await verify(key, envelope))) return;
    this.options.onMessage(envelope);
  }

  /** `key` overrides the default signing key, so the patient can address the phone and the therapist separately. */
  async send<T extends MessageType>(type: T, payload: ChannelMessages[T], key = this.options.signKey): Promise<void> {
    const t = Date.now();
    const sig = await sign(key, type, this.options.role, t, payload);
    await this.transport.send({ type, from: this.options.role, t, payload, sig });
  }

  close() {
    void this.send("bye", { t: Date.now(), role: this.options.role }).finally(() => this.transport.close());
  }
}

export function isType<T extends MessageType>(envelope: Envelope, type: T): envelope is Envelope<T> {
  return envelope.type === type;
}
