import type { ActionKind, Arousal, ReasonCode } from "@/lib/controller/types";
import type { LadderSource } from "@/lib/ladder/schema";

export const RECEIPT_SCHEMA = "unflinch.receipt.v1";

export type ReceiptLabel = "LIVE" | "RECORDED" | "SIMULATED_INPUT" | "BUILDER_DEMO" | "REPLAY";

export type SessionMode = "self" | "therapist" | "judge";
export type SignalMode = "phone" | "sim" | "suds";

export type ReceiptChunk = {
  i: number;
  t: number;
  active_prompt: string | null;
  frames: number;
};

export type ReceiptDecision = {
  t: number;
  chunk: number;
  kind: ActionKind;
  reason: ReasonCode;
  level_before: number;
  level_after: number;
  inputs: {
    arousal: Arousal;
    suds: number | null;
    breath_bpm: number | null;
    breath_conf: number | null;
    intent: string | null;
    therapist: string | null;
  };
  prompt: string | null;
  accepted_ms: number | null;
  /** Chunk where the prompt took effect. `landed_by` says how we know. */
  landed_chunk: number | null;
  landed_by: "active_prompt" | "next_boundary" | null;
  outcome: "requested" | "acknowledged" | "executed" | "unacked" | "unlanded" | null;
};

export type Receipt = {
  schema: typeof RECEIPT_SCHEMA;
  session: string;
  trial: number;
  mode: SignalMode;
  model: string;
  sdk: string;
  seed: number;
  resolution: string | null;
  audio_enabled: boolean;
  max_chunks: number | null;
  ladder: { fearId: string; context: string; source: LadderSource; sha256: string };
  start: { t: number; level: number; prompt: string; image_sha256: string | null };
  chunks: ReceiptChunk[];
  signal: {
    source: SignalMode;
    baseline_bpm: number | null;
    samples: { t: number; rate: number | null; conf: number; arousal: Arousal }[];
  };
  suds: { t: number; v: number }[];
  decisions: ReceiptDecision[];
  ev: { t: number; prompt: string } | null;
  ratings: {
    expectancy_before: number | null;
    expectancy_after: number | null;
    happened: "yes" | "no" | "partly" | null;
    suds_peak: number | null;
    feeling: string | null;
  };
  recording: { path: string; sha256: string; bytes: number } | null;
  invariant_violations: { id: string; chunk: number; detail: string }[];
  timing: { first_frame_ms: number | null; intake_to_first_frame_ms: number | null };
  labels: ReceiptLabel[];
  ended_by: ReasonCode | "CONNECTION_LOST" | "USER_END" | "SESSION_CAP" | null;
};

export type RunMetrics = {
  decisions: number;
  sends: number;
  retreats: number;
  ceilingRetreats: number;
  maxLevel: number;
  /** decision → first chunk where the prompt took effect, in chunks */
  landingChunks: number[];
  acceptedMs: number[];
  evAtS: number | null;
};

export function metricsOf(receipt: Receipt): RunMetrics {
  const sends = receipt.decisions.filter((d) => d.prompt !== null);
  const landingChunks = sends
    .filter((d) => d.landed_chunk !== null)
    .map((d) => d.landed_chunk! - d.chunk);
  const acceptedMs = sends.filter((d) => d.accepted_ms !== null).map((d) => d.accepted_ms!);
  const levels = [receipt.start.level, ...receipt.decisions.map((d) => d.level_after)];
  return {
    decisions: receipt.decisions.length,
    sends: sends.length,
    retreats: receipt.decisions.filter((d) => d.kind === "down").length,
    ceilingRetreats: receipt.decisions.filter((d) => d.reason.startsWith("CEILING")).length,
    maxLevel: Math.max(...levels),
    landingChunks,
    acceptedMs,
    evAtS: receipt.ev ? Math.round((receipt.ev.t - receipt.start.t) / 100) / 10 : null,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Canonical JSON (sorted keys) so the receipt hash is reproducible anywhere. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
