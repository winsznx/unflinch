import { describe, expect, it } from "vitest";

import { ArousalClassifier, type BreathSample } from "@/lib/signal/arousal";
import { BreathEstimator } from "@/lib/signal/breath";

function chest(bpm: number, seconds: number, noise = 0.002) {
  const estimator = new BreathEstimator();
  // Phone tilted on the chest: breathing rocks it about an axis that isn't aligned with the device.
  for (let t = 0; t < seconds * 1000; t += 1000 / 60) {
    const breath = 0.04 * Math.sin((2 * Math.PI * bpm * t) / 60000);
    const n = () => (Math.random() - 0.5) * noise;
    estimator.push({ t, ax: 0.3 * breath + n(), ay: 3 + 0.6 * breath + n(), az: 9.3 + breath + n(), rotation: 2 });
  }
  return estimator.estimate(seconds * 1000);
}

describe("BreathEstimator", () => {
  for (const bpm of [6, 10, 15, 20]) {
    it(`tracks ${bpm} bpm within 2 bpm`, () => {
      const estimate = chest(bpm, 60);
      expect(estimate.rate).not.toBeNull();
      expect(Math.abs(estimate.rate! - bpm)).toBeLessThanOrEqual(2);
      expect(estimate.conf).toBeGreaterThanOrEqual(0.5);
    });
  }
});

describe("ArousalClassifier", () => {
  const sample = (patch: Partial<BreathSample>): BreathSample => ({
    t: 0, rate: 12, cv: 0.1, amp: 1, conf: 0.9, holdS: 0, source: "sim", ...patch,
  });

  it("needs overload sustained for two chunks", () => {
    const c = new ArousalClassifier(12);
    expect(c.classify(sample({ t: 0, rate: 30 }), 0)).toBe("HIGH");
    expect(c.classify(sample({ t: 4000, rate: 30 }), 4000)).toBe("OVERLOAD");
  });
  it("treats a long breath hold as overload", () => {
    expect(new ArousalClassifier(12).classify(sample({ holdS: 13 }), 0)).toBe("OVERLOAD");
  });
  it("is UNKNOWN when stale or low confidence", () => {
    const c = new ArousalClassifier(12);
    expect(c.classify(sample({ conf: 0.3 }), 0)).toBe("UNKNOWN");
    expect(c.classify(sample({ t: 0 }), 6000)).toBe("UNKNOWN");
  });
  it("is LOW near baseline with regular breathing", () => {
    expect(new ArousalClassifier(12).classify(sample({ rate: 12.2, cv: 0.1 }), 0)).toBe("LOW");
  });
});
