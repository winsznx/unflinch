import { CHUNK_SECONDS, POLICY } from "@/lib/controller/policy";
import type { Arousal } from "@/lib/controller/types";

export type BreathSample = {
  t: number;
  rate: number | null;
  cv: number | null;
  amp: number | null;
  conf: number;
  holdS: number;
  source: "phone" | "sim";
};

/**
 * Per-tick arousal class (PRD §4.5). Overload needs the fast rate sustained for two chunks,
 * or a breath hold long enough to matter. Stale or low-confidence input is UNKNOWN, never calm.
 */
export class ArousalClassifier {
  private overloadSince: number | null = null;

  constructor(private baselineBpm: number) {}

  get baseline() {
    return this.baselineBpm;
  }

  classify(sample: BreathSample | null, now: number): Arousal {
    if (!sample || sample.conf < 0.5 || (now - sample.t) / 1000 > POLICY.sensorStaleS) {
      this.overloadSince = null;
      return "UNKNOWN";
    }
    if (sample.holdS >= POLICY.overload.holdBreathS) return "OVERLOAD";
    if (sample.rate === null) return "UNKNOWN";

    const fast =
      sample.rate >= Math.max(POLICY.overload.rateRatio * this.baselineBpm, POLICY.overload.rateAbs);
    if (fast) {
      this.overloadSince ??= now;
      const sustainedS = (now - this.overloadSince) / 1000;
      if (sustainedS >= POLICY.overload.sustainChunks * CHUNK_SECONDS) return "OVERLOAD";
    } else {
      this.overloadSince = null;
    }

    const cv = sample.cv ?? 0;
    if (fast || sample.rate >= POLICY.high.rateRatio * this.baselineBpm || cv >= POLICY.high.cv) {
      return "HIGH";
    }
    if (sample.rate <= POLICY.low.rateRatio * this.baselineBpm && cv < POLICY.low.cv) return "LOW";
    return "WINDOW";
  }
}

/** Baseline = median rate over the calibration window, only if confidence held for ≥ 30 s. */
export function computeBaseline(samples: BreathSample[]): { bpm: number | null; confidentS: number } {
  const confident = samples.filter((s) => s.conf >= 0.6 && s.rate !== null);
  const confidentS = confident.length / 2;
  if (confidentS < 30) return { bpm: null, confidentS };
  const rates = confident.map((s) => s.rate!).sort((a, b) => a - b);
  return { bpm: rates[rates.length >> 1]!, confidentS };
}
