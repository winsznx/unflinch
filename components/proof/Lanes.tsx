import type { ActionKind, Arousal } from "@/lib/controller/types";
import type { Receipt, ReceiptDecision } from "@/lib/orbis/receipts";

const WIDTH = 1000;
const LABEL_W = 116;
const PAD_R = 16;
const PLOT_W = WIDTH - LABEL_W - PAD_R;
const GAP = 18;
const MAX_LEVEL = 6;

const LANES = {
  breath: 92,
  band: 8,
  suds: 56,
  level: 76,
  decisions: 40,
  chunks: 22,
  axis: 22,
} as const;

const AROUSAL_CLASS: Record<Arousal, string> = {
  UNKNOWN: "p-arousal-unknown",
  LOW: "p-arousal-calm",
  WINDOW: "p-arousal-calm",
  HIGH: "p-arousal-high",
  OVERLOAD: "p-arousal-overload",
};

type Mark = { cls: string; shape: "up" | "down" | "diamond" | "bar" };

function markFor(kind: ActionKind): Mark {
  if (kind === "down") return { cls: "p-mark-retreat", shape: "down" };
  if (kind === "up" || kind === "selfApproach") return { cls: "p-mark-approach", shape: "up" };
  if (kind === "ev") return { cls: "p-mark-ev", shape: "diamond" };
  return { cls: "p-mark-hold", shape: "bar" };
}

function niceStep(durationS: number): number {
  const target = durationS / 8;
  return [1, 2, 5, 10, 15, 20, 30, 60, 120, 300].find((step) => step >= target) ?? 600;
}

function stepPath(points: { x: number; y: number }[], endX: number): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  let d = `M${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
  for (const p of rest) d += `H${p.x.toFixed(1)}V${p.y.toFixed(1)}`;
  return `${d}H${endX.toFixed(1)}`;
}

function MarkShape({ shape, x, y }: { shape: Mark["shape"]; x: number; y: number }) {
  if (shape === "up") return <path d={`M${x} ${y - 7}L${x + 6} ${y + 5}H${x - 6}Z`} />;
  if (shape === "down") return <path d={`M${x} ${y + 7}L${x + 6} ${y - 5}H${x - 6}Z`} />;
  if (shape === "diamond") return <path d={`M${x} ${y - 7}L${x + 7} ${y}L${x} ${y + 7}L${x - 7} ${y}Z`} />;
  return <rect x={x - 1.5} y={y - 7} width={3} height={14} rx={1.5} />;
}

function decisionTitle(d: ReceiptDecision): string {
  const parts = [`chunk ${d.chunk}`, d.reason];
  if (d.prompt) parts.push(d.prompt);
  return parts.join(" · ");
}

function summaryOf(receipt: Receipt, durationS: number): string {
  const retreats = receipt.decisions.filter((d) => d.kind === "down").length;
  const approaches = receipt.decisions.filter((d) => d.kind === "up" || d.kind === "selfApproach").length;
  const levels = [receipt.start.level, ...receipt.decisions.map((d) => d.level_after)];
  const rates = receipt.signal.samples.map((s) => s.rate).filter((r): r is number => r !== null);
  const breath = rates.length
    ? `breath ${Math.min(...rates).toFixed(0)} to ${Math.max(...rates).toFixed(0)} breaths per minute`
    : "no breath samples";
  const ev = receipt.ev ? `, expectancy test at ${((receipt.ev.t - receipt.start.t) / 1000).toFixed(1)} s` : "";
  return `Trial timeline over ${durationS.toFixed(0)} s: ${breath}, ${receipt.suds.length} distress ratings, level from L${receipt.start.level} up to L${Math.max(...levels)}, ${receipt.decisions.length} decisions with ${approaches} approaches and ${retreats} retreats${ev}, ${receipt.chunks.length} chunks.`;
}

export function Lanes({ receipt }: { receipt: Receipt }) {
  const t0 = receipt.start.t;
  const lastT = Math.max(
    t0 + 1000,
    ...receipt.chunks.map((c) => c.t),
    ...receipt.signal.samples.map((s) => s.t),
    ...receipt.decisions.map((d) => d.t),
    ...receipt.suds.map((s) => s.t),
    receipt.ev?.t ?? t0,
  );
  const durationS = (lastT - t0) / 1000;
  const x = (t: number) => LABEL_W + (Math.max(0, t - t0) / 1000 / durationS) * PLOT_W;
  const endX = LABEL_W + PLOT_W;

  let cursor = 8;
  const place = (height: number) => {
    const top = cursor;
    cursor += height + GAP;
    return top;
  };
  const breathTop = place(LANES.breath + 6 + LANES.band);
  const bandTop = breathTop + LANES.breath + 6;
  const sudsTop = place(LANES.suds);
  const levelTop = place(LANES.level);
  const decisionsTop = place(LANES.decisions);
  const chunksTop = place(LANES.chunks);
  const axisTop = cursor - GAP + 6;
  const height = axisTop + LANES.axis;

  const rated = receipt.signal.samples.filter((s) => s.rate !== null);
  const rates = rated.map((s) => s.rate!);
  const rateMin = rates.length ? Math.floor(Math.min(...rates) - 2) : 0;
  const rateMax = rates.length ? Math.ceil(Math.max(...rates) + 2) : 30;
  const rateY = (rate: number) => breathTop + LANES.breath - ((rate - rateMin) / (rateMax - rateMin)) * LANES.breath;

  const breathSegments: string[] = [];
  let segment = "";
  for (const sample of receipt.signal.samples) {
    if (sample.rate === null) {
      if (segment) breathSegments.push(segment);
      segment = "";
      continue;
    }
    segment += `${segment ? "L" : "M"}${x(sample.t).toFixed(1)} ${rateY(sample.rate).toFixed(1)}`;
  }
  if (segment) breathSegments.push(segment);

  const samples = receipt.signal.samples;
  const bands = samples.map((sample, i) => {
    const x0 = x(sample.t);
    const x1 = i + 1 < samples.length ? x(samples[i + 1]!.t) : endX;
    return { key: i, x0, w: Math.max(0.5, x1 - x0), cls: AROUSAL_CLASS[sample.arousal], arousal: sample.arousal };
  });

  const sudsY = (v: number) => sudsTop + LANES.suds - (v / 10) * LANES.suds;
  const sudsPath = stepPath(receipt.suds.map((s) => ({ x: x(s.t), y: sudsY(s.v) })), endX);

  const levelY = (level: number) => levelTop + LANES.level - (level / MAX_LEVEL) * LANES.level;
  const levelPoints = [
    { x: x(t0), y: levelY(receipt.start.level) },
    ...receipt.decisions
      .filter((d) => d.level_after !== d.level_before)
      .map((d) => ({ x: x(d.t), y: levelY(d.level_after) })),
  ];
  const levelPath = stepPath(levelPoints, endX);

  const tickStep = niceStep(durationS);
  const ticks: number[] = [];
  for (let s = 0; s <= durationS + 1e-6; s += tickStep) ticks.push(s);

  const laneLabel = (top: number, h: number, text: string, sub?: string) => (
    <g>
      <text className="p-lane-label" x={0} y={top + h / 2 - (sub ? 3 : -4)}>
        {text}
      </text>
      {sub ? (
        <text className="p-lane-sub" x={0} y={top + h / 2 + 13}>
          {sub}
        </text>
      ) : null}
    </g>
  );

  const hairline = (y: number) => <line className="p-hairline" x1={0} x2={WIDTH} y1={y} y2={y} />;

  return (
    <svg
      className="p-lanes"
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={summaryOf(receipt, durationS)}
    >
      {ticks.map((s) => (
        <line key={`grid-${s}`} className="p-grid" x1={x(t0 + s * 1000)} x2={x(t0 + s * 1000)} y1={4} y2={axisTop} />
      ))}

      {laneLabel(breathTop, LANES.breath, "Breath", "breaths/min")}
      <text className="p-scale" x={LABEL_W - 8} y={breathTop + 10} textAnchor="end">
        {rateMax}
      </text>
      <text className="p-scale" x={LABEL_W - 8} y={breathTop + LANES.breath} textAnchor="end">
        {rateMin}
      </text>
      {breathSegments.length ? (
        breathSegments.map((d, i) => <path key={i} className="p-line-breath" d={d} />)
      ) : (
        <text className="p-empty" x={LABEL_W + 8} y={breathTop + LANES.breath / 2}>
          No breath samples (distress ratings only)
        </text>
      )}
      <text className="p-lane-sub" x={0} y={bandTop + LANES.band}>
        arousal
      </text>
      {bands.map((band) => (
        <rect key={band.key} className={band.cls} x={band.x0} y={bandTop} width={band.w} height={LANES.band}>
          <title>{band.arousal}</title>
        </rect>
      ))}
      {hairline(sudsTop - GAP / 2)}

      {laneLabel(sudsTop, LANES.suds, "Distress", "SUDS 0 to 10")}
      <line className="p-baseline" x1={LABEL_W} x2={endX} y1={sudsY(0)} y2={sudsY(0)} />
      {sudsPath ? (
        <path className="p-line-suds" d={sudsPath} />
      ) : (
        <text className="p-empty" x={LABEL_W + 8} y={sudsTop + LANES.suds / 2}>
          No ratings in this trial
        </text>
      )}
      {receipt.suds.map((s, i) => (
        <circle key={i} className="p-dot-suds" cx={x(s.t)} cy={sudsY(s.v)} r={3}>
          <title>{`SUDS ${s.v} at ${((s.t - t0) / 1000).toFixed(1)} s`}</title>
        </circle>
      ))}
      {hairline(levelTop - GAP / 2)}

      {laneLabel(levelTop, LANES.level, "Level", "ladder step")}
      {[0, 2, 4, 6].map((level) => (
        <g key={level}>
          <line className="p-baseline" x1={LABEL_W} x2={endX} y1={levelY(level)} y2={levelY(level)} />
          <text className="p-scale" x={LABEL_W - 8} y={levelY(level) + 4} textAnchor="end">
            L{level}
          </text>
        </g>
      ))}
      <path className="p-line-level" d={levelPath} />
      {hairline(decisionsTop - GAP / 2)}

      {laneLabel(decisionsTop, LANES.decisions, "Decisions")}
      {receipt.decisions.map((d, i) => {
        const mark = markFor(d.kind);
        return (
          <g key={i} className={mark.cls}>
            <title>{decisionTitle(d)}</title>
            <MarkShape shape={mark.shape} x={x(d.t)} y={decisionsTop + LANES.decisions / 2} />
          </g>
        );
      })}
      {hairline(chunksTop - GAP / 2)}

      {laneLabel(chunksTop, LANES.chunks, "Chunks")}
      {receipt.chunks.map((chunk) => (
        <rect
          key={chunk.i}
          className={chunk.active_prompt ? "p-chunk is-prompt" : "p-chunk"}
          x={x(chunk.t) - 1}
          y={chunksTop + 3}
          width={2}
          height={LANES.chunks - 6}
        >
          <title>{chunk.active_prompt ? `chunk ${chunk.i} · ${chunk.active_prompt}` : `chunk ${chunk.i}`}</title>
        </rect>
      ))}

      {hairline(axisTop)}
      {ticks.map((s) => (
        <text key={`tick-${s}`} className="p-scale" x={x(t0 + s * 1000)} y={axisTop + 16} textAnchor="middle">
          {s}s
        </text>
      ))}
    </svg>
  );
}

export function LanesLegend() {
  return (
    <ul className="p-legend" aria-label="Lane legend">
      <li>
        <svg viewBox="-8 -8 16 16" aria-hidden="true" className="p-mark-approach">
          <MarkShape shape="up" x={0} y={0} />
        </svg>
        Approach
      </li>
      <li>
        <svg viewBox="-8 -8 16 16" aria-hidden="true" className="p-mark-retreat">
          <MarkShape shape="down" x={0} y={0} />
        </svg>
        Retreat
      </li>
      <li>
        <svg viewBox="-8 -8 16 16" aria-hidden="true" className="p-mark-ev">
          <MarkShape shape="diamond" x={0} y={0} />
        </svg>
        Expectancy test
      </li>
      <li>
        <svg viewBox="-8 -8 16 16" aria-hidden="true" className="p-mark-hold">
          <MarkShape shape="bar" x={0} y={0} />
        </svg>
        Hold or vary
      </li>
      <li>
        <i className="p-swatch p-arousal-calm" aria-hidden="true" />
        Calm or in window
      </li>
      <li>
        <i className="p-swatch p-arousal-high" aria-hidden="true" />
        High
      </li>
      <li>
        <i className="p-swatch p-arousal-overload" aria-hidden="true" />
        Overload
      </li>
      <li>
        <i className="p-swatch p-arousal-unknown" aria-hidden="true" />
        No signal
      </li>
    </ul>
  );
}
