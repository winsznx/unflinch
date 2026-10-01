import type { ChannelMessages } from "@/lib/realtime/channel";

export type PatientState = ChannelMessages["state"];
export type Arousal = "UNKNOWN" | "LOW" | "WINDOW" | "HIGH" | "OVERLOAD";

export const WINDOW_MS = 90_000;
export const CONNECTED_MS = 6_000;
export const FRAME_MS = 100;

/** Fixed-capacity buffer that overwrites its oldest entry once full. */
export class Ring<T> {
  private items: (T | undefined)[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(item: T) {
    this.items[(this.head + this.size) % this.capacity] = item;
    if (this.size < this.capacity) this.size += 1;
    else this.head = (this.head + 1) % this.capacity;
  }

  last(): T | undefined {
    return this.size ? this.items[(this.head + this.size - 1) % this.capacity] : undefined;
  }

  /** Oldest first. */
  forEach(visit: (item: T) => void) {
    for (let i = 0; i < this.size; i += 1) visit(this.items[(this.head + i) % this.capacity] as T);
  }
}

export type WaveSample = { t: number; v: number };

export type HistorySample = {
  t: number;
  suds: number | null;
  arousal: Arousal;
  level: number;
  cap: number;
};

export type DecisionEntry = {
  id: string;
  at: number;
  chunk: number;
  action: string;
  reason: string;
};

const AROUSALS: ReadonlySet<string> = new Set(["UNKNOWN", "LOW", "WINDOW", "HIGH", "OVERLOAD"]);

export function toArousal(value: string): Arousal {
  return AROUSALS.has(value) ? (value as Arousal) : "UNKNOWN";
}

export function decisionTag(action: string): "Retreat" | "Approach" | null {
  if (action === "down") return "Retreat";
  if (action === "up" || action === "selfApproach") return "Approach";
  return null;
}

/** `#k=<hex>` from the URL fragment. Null when absent or not a plausible HMAC key. */
export function parseKey(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, "")).get("k");
  if (!key || key.length < 32 || key.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(key)) return null;
  return key;
}

export const PHASE_LABEL: Record<string, string> = {
  ready: "Ready",
  connecting: "Connecting",
  priming: "Building scene",
  calibrating: "Calibrating",
  trial: "In trial",
  paused: "Paused",
  handoff: "Between trials",
  rating: "Rating",
  report: "Report",
  ended: "Ended",
  busy: "Waiting for a slot",
  lost: "Connection lost",
  error: "Error",
};

export const AROUSAL_LABEL: Record<Arousal, string> = {
  UNKNOWN: "Unknown",
  LOW: "Low",
  WINDOW: "In window",
  HIGH: "High",
  OVERLOAD: "Overload",
};
