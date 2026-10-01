import { CONNECTED_MS, WINDOW_MS, type Arousal, type HistorySample, type Ring, type WaveSample } from "./model";

/** Lanes share one horizontal scale: 1 viewBox unit per 100 ms, so 90 s spans 900 units. */
export const LANE_WIDTH = WINDOW_MS / 100;
export const BREATH_H = 120;
export const SUDS_H = 64;
export const AROUSAL_H = 28;
export const LEVEL_H = 72;

const PAD = 6;
const WAVE_GAP_MS = 1_000;

export type ArousalSegment = { x: number; w: number; arousal: Arousal };

export type Frame = {
  now: number;
  connected: boolean;
  breathPath: string;
  sudsPath: string;
  levelPath: string;
  capPath: string;
  levelMax: number;
  arousal: ArousalSegment[];
};

export const EMPTY_FRAME: Frame = {
  now: 0,
  connected: false,
  breathPath: "",
  sudsPath: "",
  levelPath: "",
  capPath: "",
  levelMax: 6,
  arousal: [],
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function breathPath(wave: Ring<WaveSample>, start: number): string {
  let peak = 0.5;
  wave.forEach((s) => {
    if (s.t >= start) peak = Math.max(peak, Math.abs(s.v));
  });
  const mid = BREATH_H / 2;
  const half = mid - PAD;
  let d = "";
  let prevT = -Infinity;
  wave.forEach((s) => {
    if (s.t < start) return;
    const cmd = s.t - prevT > WAVE_GAP_MS ? "M" : "L";
    d += `${cmd}${r1((s.t - start) / 100)} ${r1(mid - (s.v / peak) * half)}`;
    prevT = s.t;
  });
  return d;
}

/** Step path over the window; the sample in force at the window's left edge starts at x = 0. */
function stepPath(
  history: HistorySample[],
  start: number,
  now: number,
  value: (s: HistorySample) => number | null,
  y: (v: number) => number,
): string {
  let d = "";
  let open = false;
  history.forEach((s, i) => {
    const v = value(s);
    const x0 = Math.max(0, (s.t - start) / 100);
    const next = history[i + 1];
    const x1 = ((next ? next.t : now) - start) / 100;
    if (x1 <= 0) return;
    if (v === null) {
      open = false;
      return;
    }
    const yy = r1(y(v));
    d += `${open ? "L" : "M"}${r1(x0)} ${yy}H${r1(x1)}`;
    open = true;
  });
  return d;
}

function arousalSegments(history: HistorySample[], start: number, now: number): ArousalSegment[] {
  const segments: ArousalSegment[] = [];
  history.forEach((s, i) => {
    const next = history[i + 1];
    const x0 = Math.max(0, (s.t - start) / 100);
    const x1 = ((next ? next.t : now) - start) / 100;
    if (x1 <= x0) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.arousal === s.arousal && Math.abs(prev.x + prev.w - x0) < 0.01) prev.w = x1 - prev.x;
    else segments.push({ x: x0, w: x1 - x0, arousal: s.arousal });
  });
  return segments;
}

export function buildFrame(
  now: number,
  wave: Ring<WaveSample>,
  historyRing: Ring<HistorySample>,
  lastStateAt: number | null,
): Frame {
  const start = now - WINDOW_MS;
  const history: HistorySample[] = [];
  historyRing.forEach((s) => history.push(s));

  let levelMax = 1;
  for (const s of history) levelMax = Math.max(levelMax, s.cap, s.level);

  const sudsY = (v: number) => SUDS_H - PAD - (v / 10) * (SUDS_H - 2 * PAD);
  const levelY = (v: number) => LEVEL_H - PAD - (v / levelMax) * (LEVEL_H - 2 * PAD);

  return {
    now,
    connected: lastStateAt !== null && now - lastStateAt < CONNECTED_MS,
    breathPath: breathPath(wave, start),
    sudsPath: stepPath(history, start, now, (s) => s.suds, sudsY),
    levelPath: stepPath(history, start, now, (s) => s.level, levelY),
    capPath: stepPath(history, start, now, (s) => s.cap, levelY),
    levelMax,
    arousal: arousalSegments(history, start, now),
  };
}
