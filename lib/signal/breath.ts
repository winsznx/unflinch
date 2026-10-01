/**
 * Phone-on-chest breath estimator (PRD §4.5). Runs on the phone.
 * DeviceMotion samples → 25 Hz resample → rolling PCA of the gravity vector (adapts to placement)
 * → detrend → 0.1–0.7 Hz band-pass → prominence peaks → rate, cv, amp, hold time, confidence.
 */

export const FS = 25;
const WINDOW_S = 20;
const DETREND_S = 8;
const MIN_PEAK_SPACING_S = 1.5;
const PROMINENCE_IQR = 0.35;
const ROTATION_ARTIFACT_DPS = 30;
const PEAK_CONFIRM_S = 2.5;

export type MotionSample = {
  t: number;
  ax: number;
  ay: number;
  az: number;
  rotation: number;
};

export type BreathEstimate = {
  t: number;
  rate: number | null;
  cv: number | null;
  amp: number | null;
  holdS: number;
  conf: number;
};

/** RBJ cookbook band-pass (constant 0 dB peak gain), centred on the geometric mean of the band. */
class BandPass {
  private b0: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(lowHz: number, highHz: number, fs: number) {
    const f0 = Math.sqrt(lowHz * highHz);
    const q = f0 / (highHz - lowHz);
    const w0 = (2 * Math.PI * f0) / fs;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  step(x: number): number {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function principalAxis(window: [number, number, number][], prior: [number, number, number]) {
  const n = window.length;
  const mean = [0, 0, 0];
  for (const v of window) for (let i = 0; i < 3; i += 1) mean[i]! += v[i]! / n;
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const v of window) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) cov[i]![j]! += ((v[i]! - mean[i]!) * (v[j]! - mean[j]!)) / n;
    }
  }
  let axis: [number, number, number] = [...prior];
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const next: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) next[i] += cov[i]![j]! * axis[j]!;
    }
    const norm = Math.hypot(...next) || 1;
    axis = [next[0] / norm, next[1] / norm, next[2] / norm];
  }
  // Keep the sign stable so the projected waveform doesn't flip between windows.
  if (axis[0] * prior[0] + axis[1] * prior[1] + axis[2] * prior[2] < 0) {
    axis = [-axis[0], -axis[1], -axis[2]];
  }
  return axis;
}

export class BreathEstimator {
  private raw: [number, number, number][] = [];
  private rotations: number[] = [];
  private projected: number[] = [];
  private filtered: number[] = [];
  private times: number[] = [];
  private axis: [number, number, number] = [0, 0, 1];
  private filter = new BandPass(0.1, 0.7, FS);
  private nextSampleT: number | null = null;
  private lastMotion: MotionSample | null = null;
  private peaks: number[] = [];

  /** Feed raw DeviceMotion events; they are resampled to 25 Hz by zero-order hold. */
  push(sample: MotionSample) {
    if (this.nextSampleT === null) this.nextSampleT = sample.t;
    const previous = this.lastMotion ?? sample;
    while (this.nextSampleT <= sample.t) {
      this.ingest(this.nextSampleT, previous);
      this.nextSampleT += 1000 / FS;
    }
    this.lastMotion = sample;
  }

  private ingest(t: number, s: MotionSample) {
    const cap = FS * (WINDOW_S + DETREND_S);
    this.raw.push([s.ax, s.ay, s.az]);
    this.rotations.push(s.rotation);
    if (this.raw.length > cap) {
      this.raw.shift();
      this.rotations.shift();
    }

    if (this.raw.length % FS === 0 && this.raw.length >= FS * 4) {
      this.axis = principalAxis(this.raw.slice(-FS * WINDOW_S), this.axis);
    }

    const v = this.raw[this.raw.length - 1]!;
    const value = v[0] * this.axis[0] + v[1] * this.axis[1] + v[2] * this.axis[2];
    this.projected.push(value);
    if (this.projected.length > FS * DETREND_S) this.projected.shift();
    const trend = this.projected.reduce((sum, x) => sum + x, 0) / this.projected.length;
    const y = this.filter.step(value - trend);

    this.filtered.push(y);
    this.times.push(t);
    if (this.filtered.length > FS * WINDOW_S) {
      this.filtered.shift();
      this.times.shift();
    }
    this.detectPeak();
  }

  private detectPeak() {
    const n = this.filtered.length;
    if (n < FS * 4) return;
    const half = Math.round(FS * 0.75);
    // Confirm a peak once the slowest breath in band has had time to fall away from it.
    const center = n - 1 - Math.round(FS * PEAK_CONFIRM_S);
    if (center < half) return;
    const value = this.filtered[center]!;
    for (let k = center - half; k <= center + half; k += 1) {
      if (this.filtered[k]! > value) return;
    }
    const sorted = [...this.filtered].sort((a, b) => a - b);
    const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
    const leftMin = Math.min(...this.filtered.slice(Math.max(0, center - FS * 3), center));
    const rightMin = Math.min(...this.filtered.slice(center + 1, n));
    if (value - Math.max(leftMin, rightMin) < PROMINENCE_IQR * iqr) return;
    const t = this.times[center]!;
    const last = this.peaks[this.peaks.length - 1];
    if (last !== undefined && t - last < MIN_PEAK_SPACING_S * 1000) return;
    this.peaks.push(t);
    if (this.peaks.length > 12) this.peaks.shift();
  }

  /** Latest 10 Hz display waveform, normalised to roughly ±1. */
  waveform(count = 5): number[] {
    const step = FS / 10;
    const out: number[] = [];
    const sorted = [...this.filtered].map(Math.abs).sort((a, b) => a - b);
    const scale = (sorted.length ? quantile(sorted, 0.95) : 1) || 1;
    for (let k = count - 1; k >= 0; k -= 1) {
      const index = this.filtered.length - 1 - Math.round(k * step);
      out.push(index >= 0 ? Math.max(-1.5, Math.min(1.5, this.filtered[index]! / scale)) : 0);
    }
    return out;
  }

  estimate(now: number): BreathEstimate {
    const intervals: number[] = [];
    for (let i = 1; i < this.peaks.length; i += 1) {
      intervals.push((this.peaks[i]! - this.peaks[i - 1]!) / 1000);
    }
    const lastFour = intervals.slice(-4);
    const lastSix = intervals.slice(-6);
    const rate = lastFour.length >= 2 ? 60 / median(lastFour) : null;
    let cv: number | null = null;
    if (lastSix.length >= 3) {
      const mean = lastSix.reduce((a, b) => a + b, 0) / lastSix.length;
      const sd = Math.sqrt(lastSix.reduce((a, b) => a + (b - mean) ** 2, 0) / lastSix.length);
      cv = sd / mean;
    }
    const lastPeak = this.peaks[this.peaks.length - 1];
    const holdS = lastPeak === undefined ? 0 : (now - lastPeak) / 1000;
    const amp = this.filtered.length
      ? Math.max(...this.filtered) - Math.min(...this.filtered)
      : null;
    return { t: now, rate, cv, amp, holdS, conf: this.confidence(rate) };
  }

  /** Band SNR, cut down by rotation and high-frequency handling artefacts. */
  private confidence(rate: number | null): number {
    if (this.filtered.length < FS * 8 || this.projected.length < FS * 4) return 0;
    const band = this.filtered.reduce((sum, y) => sum + y * y, 0) / this.filtered.length;
    const recent = this.projected.slice(-FS * 4);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    let jitter = 0;
    for (let i = 1; i < recent.length; i += 1) jitter += (recent[i]! - recent[i - 1]!) ** 2;
    jitter /= recent.length;
    const total = recent.reduce((sum, x) => sum + (x - mean) ** 2, 0) / recent.length;
    const snr = band / (jitter + 1e-9);
    let conf = Math.min(1, Math.log10(1 + snr) / 2);
    if (total < 1e-7) conf = 0;
    const rotationNow = this.rotations.slice(-FS * 2);
    if (rotationNow.some((r) => r > ROTATION_ARTIFACT_DPS)) conf *= 0.3;
    if (rate === null || rate < 4 || rate > 45) conf *= 0.5;
    return Math.round(conf * 100) / 100;
  }
}
