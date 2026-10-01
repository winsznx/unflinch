import { Badge, Tile } from "@/components/marketing/primitives";

const DECISIONS = [
  { level: "L3", rule: "CEILING_BODY · down 1", detail: "Chunk 18 · breath above ceiling", badge: "Retreat", keep: false },
  { level: "L4", rule: "PATIENT_CLOSER · selfApproach", detail: "Chunk 31 · you chose to step closer", badge: "Approach", keep: true },
  { level: "L4", rule: "VARIABILITY · hold", detail: "Chunk 40 · same level, new angle", badge: "Vary", keep: true },
] as const;

/** Hero mockup: one live trial as the patient sees it. Illustrative UI, not a measured run. */
export function SessionSummaryCard() {
  return (
    <div className="m-app-card">
      <div className="m-app-head">
        <span className="m-avatar" aria-hidden="true">
          D
        </span>
        <div>
          <strong>Dogs · park</strong>
          <span>Trial 2 of 3 · phone sensor</span>
        </div>
        <span className="m-app-bell" aria-hidden="true">
          ◎
        </span>
      </div>

      <div className="m-app-panel">
        <div className="m-app-panel-top">
          <span>Current level</span>
          <span className="m-app-chip">Cap 6</span>
        </div>
        <div className="m-app-readout">
          <strong>L4</strong>
          <span>of 6 · terrier three metres away</span>
        </div>

        <div className="m-app-rails" aria-label="Trial signals">
          <div className="m-rail m-rail-closing">
            <span className="m-rail-line" aria-hidden="true" />
            Prediction: it will jump on me · 80%
          </div>
          <div className="m-rail m-rail-preserved">
            <span className="m-rail-line" aria-hidden="true" />
            Breath in window · 14 bpm
          </div>
        </div>

        <div className="m-quick-actions">
          <div>
            <span className="m-quick-icon" aria-hidden="true">
              ↑
            </span>
            Closer
          </div>
          <div>
            <span className="m-quick-icon" aria-hidden="true">
              ↓
            </span>
            Back
          </div>
          <div>
            <span className="m-quick-icon" aria-hidden="true">
              Ⅱ
            </span>
            Pause
          </div>
          <div>
            <span className="m-quick-icon" aria-hidden="true">
              0–9
            </span>
            SUDS
          </div>
        </div>
      </div>

      <div className="m-app-grants" aria-label="Controller decisions">
        {DECISIONS.map((decision) => (
          <div key={decision.rule} className="m-app-grant">
            <Tile tone={decision.keep ? "accent" : "soft"} mono>
              {decision.level}
            </Tile>
            <div>
              <strong>{decision.rule}</strong>
              <small>{decision.detail}</small>
            </div>
            <Badge keep={decision.keep}>{decision.badge}</Badge>
          </div>
        ))}
      </div>

      <div className="m-app-cta">
        <span className="m-dot" aria-hidden="true">
          ↳
        </span>
        <div>
          <strong>Before we go on</strong>
          <small>Did what you expected happen?</small>
        </div>
        <span aria-hidden="true">›</span>
      </div>
    </div>
  );
}
