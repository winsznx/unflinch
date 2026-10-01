import type { Snapshot } from "@/lib/session/runtime";

const W = 320;
const H = 60;
const WINDOW_MS = 30_000;

/** Last 30 s of breath waveform and level, drawn on a shared clock. */
export function TraceLanes({ snap }: { snap: Snapshot }) {
  const end = snap.wave.at(-1)?.t ?? Date.now();
  const start = end - WINDOW_MS;
  const x = (t: number) => ((t - start) / WINDOW_MS) * W;

  const wave = snap.wave
    .map((p) => `${x(p.t).toFixed(1)},${(H / 2 - Math.max(-1.5, Math.min(1.5, p.v)) * (H / 3.4)).toFixed(1)}`)
    .join(" ");

  const cap = Math.max(snap.cap, 1);
  const levelY = (level: number) => H - 6 - (level / cap) * (H - 12);
  const steps: string[] = [];
  const visible = snap.levels.filter((p) => p.t >= start);
  const before = [...snap.levels].reverse().find((p) => p.t < start);
  let current = before?.level ?? visible[0]?.level ?? snap.level;
  steps.push(`0,${levelY(current)}`);
  for (const point of visible) {
    steps.push(`${x(point.t).toFixed(1)},${levelY(current)}`, `${x(point.t).toFixed(1)},${levelY(point.level)}`);
    current = point.level;
  }
  steps.push(`${W},${levelY(current)}`);

  return (
    <div className="pl-lanes">
      <div className="pl-lane">
        <span>
          Breath {snap.breathBpm !== null ? `${Math.round(snap.breathBpm)} bpm` : "…"}
          {snap.baselineBpm !== null && <small> · baseline {Math.round(snap.baselineBpm)}</small>}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Breath waveform, last 30 seconds">
          <polyline points={wave} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="pl-lane">
        <span>
          Level L{snap.level} of {snap.cap}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Level over the last 30 seconds, now ${snap.level}`}>
          <polyline points={steps.join(" ")} fill="none" stroke="var(--ink)" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}
