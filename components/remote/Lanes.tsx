import type { ReactNode } from "react";

import { AROUSAL_H, BREATH_H, LANE_WIDTH, LEVEL_H, SUDS_H, type Frame } from "./frame";
import { AROUSAL_LABEL, decisionTag, toArousal, type DecisionEntry, type PatientState } from "./model";

/** Arousal segments narrower than this (viewBox units, 100 ms each) get no inline label. */
const MIN_LABELLED_SEGMENT = 80;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const fmtBpm = (bpm: number | null) => (bpm === null ? "--" : bpm.toFixed(1));

type LanesProps = { frame: Frame; patient: PatientState | null; decisions: DecisionEntry[] };

export function Lanes({ frame, patient, decisions }: LanesProps) {
  const arousal = toArousal(patient?.arousal ?? "UNKNOWN");

  return (
    <>
      <div className="r-panel r-lanes">
        <Lane
          name="Breath"
          meta={
            <>
              <span>
                <span className="r-mono r-num">{fmtBpm(patient?.breathBpm ?? null)}</span> /min
              </span>
              <span className="r-muted">
                baseline <span className="r-mono">{fmtBpm(patient?.baselineBpm ?? null)}</span>
              </span>
              {patient && <SignalSource signal={patient.signal} />}
            </>
          }
        >
          <svg
            className="r-svg"
            viewBox={`0 0 ${LANE_WIDTH} ${BREATH_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Breath trace, last 90 seconds"
            style={{ height: BREATH_H }}
          >
            <line className="r-grid" x1={0} x2={LANE_WIDTH} y1={BREATH_H / 2} y2={BREATH_H / 2} />
            <path className="r-breath" d={frame.breathPath} />
          </svg>
          {!frame.breathPath && <p className="r-empty">Waiting for breath data</p>}
        </Lane>

        <Lane
          name="SUDS"
          meta={
            <span>
              <span className="r-mono r-num">{patient?.suds ?? "--"}</span>
              <span className="r-muted"> / 10</span>
            </span>
          }
        >
          <svg
            className="r-svg"
            viewBox={`0 0 ${LANE_WIDTH} ${SUDS_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="SUDS rating from 0 to 10, last 90 seconds"
            style={{ height: SUDS_H }}
          >
            <line className="r-grid" x1={0} x2={LANE_WIDTH} y1={SUDS_H / 2} y2={SUDS_H / 2} />
            <path className="r-step r-step-suds" d={frame.sudsPath} />
          </svg>
          {!frame.sudsPath && <p className="r-empty">No SUDS rating yet</p>}
        </Lane>

        <Lane name="Arousal" meta={<span className={`r-arousal-label r-arousal-${arousal}`}>{AROUSAL_LABEL[arousal]}</span>}>
          <div className="r-band" style={{ height: AROUSAL_H }} role="img" aria-label={`Arousal class, now ${AROUSAL_LABEL[arousal]}`}>
            {frame.arousal.map((segment, i) => (
              <span
                key={i}
                className={`r-band-seg r-arousal-${segment.arousal}`}
                style={{ left: `${(segment.x / LANE_WIDTH) * 100}%`, width: `${(segment.w / LANE_WIDTH) * 100}%` }}
              >
                {segment.w >= MIN_LABELLED_SEGMENT ? AROUSAL_LABEL[segment.arousal] : null}
              </span>
            ))}
          </div>
        </Lane>

        <Lane
          name="Level"
          meta={
            <span>
              <span className="r-mono r-num">{patient?.level ?? "--"}</span>
              <span className="r-muted">
                {" "}
                of cap <span className="r-mono">{patient?.cap ?? "--"}</span>
              </span>
            </span>
          }
        >
          <svg
            className="r-svg"
            viewBox={`0 0 ${LANE_WIDTH} ${LEVEL_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Exposure level over the last 90 seconds, dashed line is the cap`}
            style={{ height: LEVEL_H }}
          >
            <path className="r-step r-step-cap" d={frame.capPath} />
            <path className="r-step r-step-level" d={frame.levelPath} />
          </svg>
        </Lane>

        <div className="r-axis r-mono" aria-hidden>
          <span>-90 s</span>
          <span>-60 s</span>
          <span>-30 s</span>
          <span>now</span>
        </div>
      </div>

      <DecisionLog decisions={decisions} />
    </>
  );
}

function Lane({ name, meta, children }: { name: string; meta: ReactNode; children: ReactNode }) {
  return (
    <div className="r-lane">
      <div className="r-lane-head">
        <h2>{name}</h2>
        <div className="r-lane-meta">{meta}</div>
      </div>
      <div className="r-lane-plot">{children}</div>
    </div>
  );
}

function SignalSource({ signal }: { signal: PatientState["signal"] }) {
  if (signal === "sim") return <span className="r-pill r-pill-sim">SIMULATED INPUT</span>;
  return <span className="r-pill">{signal === "phone" ? "Phone sensor" : "SUDS only"}</span>;
}

function DecisionLog({ decisions }: { decisions: DecisionEntry[] }) {
  return (
    <div className="r-panel r-log">
      <div className="r-lane-head">
        <h2>Decisions</h2>
        <span className="r-muted">newest first</span>
      </div>
      {decisions.length === 0 ? (
        <p className="r-log-empty">No decisions yet. Each step the controller takes shows up here with its reason.</p>
      ) : (
        <ol className="r-log-list">
          {decisions.map((d) => {
            const tag = decisionTag(d.action);
            return (
              <li key={d.id} className="r-log-row">
                <time className="r-mono r-muted" dateTime={new Date(d.at).toISOString()}>
                  {timeFormat.format(d.at)}
                </time>
                {tag ? (
                  <span className={`r-tag r-tag-${tag.toLowerCase()}`}>{tag}</span>
                ) : (
                  <span className="r-tag r-mono">{d.action}</span>
                )}
                <code className="r-mono r-reason">{d.reason}</code>
                <span className="r-mono r-muted r-chunk">chunk {d.chunk}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
