const TRACE_W = 320;
const TRACE_H = 72;
const TRACE_RANGE = 1.5;

/** Polyline of a ±1.5 normalised waveform, oldest sample on the left. */
export function MiniTrace({ samples, label }: { samples: number[]; label: string }) {
  const step = samples.length > 1 ? TRACE_W / (samples.length - 1) : 0;
  const points = samples
    .map((v, i) => {
      const y = TRACE_H / 2 - (v / TRACE_RANGE) * (TRACE_H / 2 - 4);
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="s-trace" viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" x2={TRACE_W} y1={TRACE_H / 2} y2={TRACE_H / 2} className="s-trace-mid" />
      {samples.length > 1 ? <polyline points={points} className="s-trace-line" /> : null}
    </svg>
  );
}

export function signalLabel(conf: number | null): "Good" | "Weak" | "No signal" {
  if (conf === null || conf < 0.3) return "No signal";
  return conf >= 0.6 ? "Good" : "Weak";
}

export function SignalBar({ conf }: { conf: number | null }) {
  const value = conf ?? 0;
  return (
    <div className="s-signal">
      <div className="s-signal-head">
        <span>Signal</span>
        <strong>{signalLabel(conf)}</strong>
      </div>
      <div
        className="s-signal-track"
        role="meter"
        aria-label="Signal"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={signalLabel(conf)}
      >
        <div className="s-signal-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

/** Outline torso with a phone lying flat on the chest. */
export function ChestIllustration() {
  return (
    <svg className="s-illustration" viewBox="0 0 200 160" fill="none" aria-hidden="true">
      <path
        d="M100 14c-11 0-19 8-19 19s8 19 19 19 19-8 19-19-8-19-19-19Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M88 52v10c-22 4-40 12-50 24-6 8-9 24-10 66M112 52v10c22 4 40 12 50 24 6 8 9 24 10 66"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M62 120v32M138 120v32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="84" y="76" width="32" height="54" rx="6" className="s-illustration-phone" strokeWidth="1.5" />
      <path d="M95 82h10" className="s-illustration-phone" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M70 100c-4 4-4 12 0 16M130 100c4 4 4 12 0 16"
        className="s-illustration-breath"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
