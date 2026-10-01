"use client";

import { useEffect, useRef, useState } from "react";

import type { ChannelMessages } from "@/lib/realtime/channel";

import type { PatientState } from "./model";

type TherapistMessageKind = ChannelMessages["therapist"]["kind"];
export type SendTherapist = (kind: TherapistMessageKind, value?: number | boolean) => Promise<void>;

const CAP_MIN = 1;
const CAP_MAX = 6;
const ACK_MS = 1_800;

const STEP_ACTIONS: { kind: TherapistMessageKind; label: string; hint: string }[] = [
  { kind: "approach", label: "Approach", hint: "One level closer at the next step" },
  { kind: "retreat", label: "Retreat", hint: "One level back at the next step" },
  { kind: "vary", label: "Vary", hint: "Same level, a different take" },
  { kind: "ev_now", label: "Expectancy test now", hint: "Hold here and test the prediction" },
];

type Ack = { text: string; tone: "ok" | "error" };

type ControlsProps = { patient: PatientState | null; linkUp: boolean; onSend: SendTherapist };

export function Controls({ patient, linkUp, onSend }: ControlsProps) {
  const [ack, setAck] = useState<Ack | null>(null);
  const [deepenedArmed, setDeepenedArmed] = useState(false);
  const [confirmEndTrial, setConfirmEndTrial] = useState<number | null>(null);
  const ackTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(ackTimer.current), []);

  const canConfigure = linkUp && patient !== null;
  const canStep = canConfigure && patient.phase === "trial";
  const confirming = canStep && confirmEndTrial === patient.trial;

  const showAck = (next: Ack) => {
    window.clearTimeout(ackTimer.current);
    setAck(next);
    ackTimer.current = window.setTimeout(() => setAck(null), ACK_MS);
  };

  const send = async (label: string, kind: TherapistMessageKind, value?: number | boolean) => {
    try {
      await onSend(kind, value);
      showAck({ text: `Sent: ${label}`, tone: "ok" });
    } catch (error) {
      console.warn("[remote] send failed", kind, error);
      showAck({ text: `Couldn't send ${label}. Check the connection and try again.`, tone: "error" });
    }
  };

  const cap = patient?.cap ?? null;

  return (
    <div className="r-panel r-controls">
      <div className="r-lane-head">
        <h2>Steer the next step</h2>
      </div>

      <div className="r-actions">
        {STEP_ACTIONS.map((action) => (
          <button
            key={action.kind}
            type="button"
            className="r-btn"
            disabled={!canStep}
            onClick={() => void send(action.label, action.kind)}
          >
            <span className="r-btn-label">{action.label}</span>
            <span className="r-btn-hint">{action.hint}</span>
          </button>
        ))}
      </div>

      <div className="r-field">
        <div className="r-field-row">
          <label htmlFor="r-deepened" className="r-field-label">
            Deepened cue
          </label>
          <Switch id="r-deepened" checked={deepenedArmed} onChange={setDeepenedArmed} />
        </div>
        <p className="r-help">Adds a mildly more intense, harmless cue at the next step. Off by default.</p>
        {deepenedArmed && (
          <button type="button" className="r-btn r-btn-compact" disabled={!canStep} onClick={() => void send("Deepened cue", "deepened")}>
            Send deepened cue
          </button>
        )}
      </div>

      <div className="r-field">
        {confirming ? (
          <div className="r-confirm" role="group" aria-label="Confirm end trial">
            <p>End trial {patient.trial} now?</p>
            <div className="r-confirm-actions">
              <button
                type="button"
                className="r-btn r-btn-compact r-btn-danger"
                onClick={() => {
                  setConfirmEndTrial(null);
                  void send("End trial", "end_trial");
                }}
              >
                End trial
              </button>
              <button type="button" className="r-btn r-btn-compact" onClick={() => setConfirmEndTrial(null)}>
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="r-btn r-btn-compact r-btn-quiet-danger"
            disabled={!canStep}
            onClick={() => patient && setConfirmEndTrial(patient.trial)}
          >
            End trial…
          </button>
        )}
      </div>

      <div className="r-field">
        <div className="r-field-row">
          <span className="r-field-label" id="r-cap-label">
            Cap
          </span>
          <div className="r-stepper" role="group" aria-labelledby="r-cap-label">
            <button
              type="button"
              aria-label="Lower the cap by one level"
              disabled={!canConfigure || cap === null || cap <= CAP_MIN}
              onClick={() => cap !== null && void send(`Cap ${cap - 1}`, "cap", cap - 1)}
            >
              −
            </button>
            <output className="r-mono" aria-live="polite" aria-label="Current cap">
              {cap ?? "--"}
            </output>
            <button
              type="button"
              aria-label="Raise the cap by one level"
              disabled={!canConfigure || cap === null || cap >= CAP_MAX}
              onClick={() => cap !== null && void send(`Cap ${cap + 1}`, "cap", cap + 1)}
            >
              +
            </button>
          </div>
        </div>
        <p className="r-help">Levels {CAP_MIN} to {CAP_MAX}. The scene may set a lower ceiling.</p>
      </div>

      <div className="r-field">
        <div className="r-field-row">
          <label htmlFor="r-auto" className="r-field-label">
            Auto-escalate
          </label>
          <Switch
            id="r-auto"
            checked={patient?.autoMode ?? false}
            disabled={!canConfigure}
            onChange={(next) => void send(next ? "Auto-escalate on" : "Auto-escalate off", "auto", next)}
          />
        </div>
        <p className="r-help">When off, the scene only steps closer when you or the patient ask.</p>
      </div>

      <p className={`r-ack ${ack ? `r-ack-${ack.tone}` : ""}`} role="status" aria-live="polite">
        {ack?.text ?? (canConfigure ? "" : "Controls unlock once the patient screen is sending.")}
      </p>

      <p className="r-help r-rule">
        The patient&apos;s own step back, pause and the overwhelm rule always win. You can&apos;t push past a ceiling.
      </p>
    </div>
  );
}

type SwitchProps = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

function Switch({ id, checked, disabled, onChange }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="r-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="r-switch-thumb" aria-hidden />
    </button>
  );
}
