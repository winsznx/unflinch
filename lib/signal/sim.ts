import type { BreathSample } from "./arousal";

const BASE_BPM = 12;
const SPIKE_BPM = 28;
const EPISODE_MS = 15_000;

export type SimMode = "calm" | "spike" | "hold";

/**
 * Keyboard-driven breath simulator for judge mode (PRD §4.5).
 * Every sample is tagged source:"sim" and the UI shows SIMULATED INPUT.
 */
export class BreathSim {
  private mode: SimMode = "calm";
  private modeUntil = 0;
  private phase = 0;
  private lastT: number | null = null;
  private lastPeakT = 0;
  private spikeRate = SPIKE_BPM;

  trigger(mode: Exclude<SimMode, "calm">, now: number) {
    this.mode = mode;
    this.modeUntil = now + EPISODE_MS;
    this.spikeRate = SPIKE_BPM + (Math.random() * 8 - 4);
  }

  current(now: number): SimMode {
    if (this.mode !== "calm" && now >= this.modeUntil) this.mode = "calm";
    return this.mode;
  }

  private rate(now: number) {
    const mode = this.current(now);
    if (mode === "spike") return this.spikeRate + (Math.random() * 4 - 2);
    return BASE_BPM + Math.sin(now / 9000) * 0.8 + (Math.random() * 0.6 - 0.3);
  }

  /** Advance the synthetic waveform and return the display value plus a 2 Hz estimate. */
  sample(now: number): { wave: number; estimate: BreathSample } {
    const mode = this.current(now);
    const dt = this.lastT === null ? 0 : (now - this.lastT) / 1000;
    this.lastT = now;
    const rate = this.rate(now);

    if (mode !== "hold") {
      const before = this.phase;
      this.phase += (2 * Math.PI * rate * dt) / 60;
      if (Math.floor(before / (2 * Math.PI)) !== Math.floor(this.phase / (2 * Math.PI))) {
        this.lastPeakT = now;
      }
    }
    const irregular = mode === "spike" ? 0.25 * Math.sin(this.phase * 2.7) : 0;
    const wave = mode === "hold" ? 0.05 * Math.sin(now / 300) : Math.sin(this.phase) + irregular;

    return {
      wave,
      estimate: {
        t: now,
        rate: mode === "hold" ? null : Math.round(rate * 10) / 10,
        cv: mode === "spike" ? 0.38 : 0.08,
        amp: mode === "hold" ? 0.05 : 1,
        conf: 0.92,
        holdS: mode === "hold" ? (now - this.lastPeakT) / 1000 : 0,
        source: "sim",
      },
    };
  }
}

export const SIM_BASELINE_BPM = BASE_BPM;
