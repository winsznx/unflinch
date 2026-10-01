import {
  median,
  metricsOf,
  type Receipt,
  type ReceiptLabel,
  type RunMetrics,
} from "@/lib/orbis/receipts";

export const LABEL_TEXT: Record<ReceiptLabel, string> = {
  LIVE: "LIVE",
  RECORDED: "RECORDED",
  SIMULATED_INPUT: "SIMULATED INPUT",
  BUILDER_DEMO: "BUILDER DEMO",
  REPLAY: "REPLAY",
};

export type TrialSummary = RunMetrics & {
  medianAcceptMs: number | null;
  medianLandingChunks: number | null;
  /** Decision to the start of the landed chunk, in seconds, from chunk timestamps. */
  landingSeconds: number[];
  landedBy: { active_prompt: number; next_boundary: number };
  retreatsByReason: [string, number][];
};

export function summarize(receipt: Receipt): TrialSummary {
  const metrics = metricsOf(receipt);
  const chunkT = new Map(receipt.chunks.map((chunk) => [chunk.i, chunk.t]));
  const landed = receipt.decisions.filter((d) => d.prompt !== null && d.landed_chunk !== null);

  const landingSeconds = landed
    .map((d) => {
      const t = chunkT.get(d.landed_chunk!);
      return t === undefined ? null : (t - d.t) / 1000;
    })
    .filter((s): s is number => s !== null && s >= 0);

  const retreats = new Map<string, number>();
  for (const d of receipt.decisions) {
    if (d.kind === "down") retreats.set(d.reason, (retreats.get(d.reason) ?? 0) + 1);
  }

  return {
    ...metrics,
    medianAcceptMs: median(metrics.acceptedMs),
    medianLandingChunks: median(metrics.landingChunks),
    landingSeconds,
    landedBy: {
      active_prompt: landed.filter((d) => d.landed_by === "active_prompt").length,
      next_boundary: landed.filter((d) => d.landed_by === "next_boundary").length,
    },
    retreatsByReason: [...retreats].sort((a, b) => b[1] - a[1]),
  };
}

/** Level after each step, starting level first. Feeds the OG sparkline. */
export function levelPath(receipt: Receipt): number[] {
  const path = [receipt.start.level];
  for (const d of receipt.decisions) {
    if (d.level_after !== path[path.length - 1]) path.push(d.level_after);
  }
  return path;
}

export function seconds(ms: number, digits = 1): string {
  return (ms / 1000).toFixed(digits);
}
