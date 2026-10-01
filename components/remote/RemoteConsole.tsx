"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Mark } from "@/components/brand/Logo";
import { SessionChannel, isType, type ChannelMessages, type Envelope } from "@/lib/realtime/channel";

import { Controls, type SendTherapist } from "./Controls";
import { EMPTY_FRAME, buildFrame, type Frame } from "./frame";
import { Lanes } from "./Lanes";
import {
  FRAME_MS,
  PHASE_LABEL,
  Ring,
  decisionTag,
  parseKey,
  toArousal,
  type DecisionEntry,
  type HistorySample,
  type PatientState,
  type WaveSample,
} from "./model";

const WAVE_CAPACITY = 1_200;
const HISTORY_CAPACITY = 2_000;
const DECISION_LIMIT = 60;

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readKey = () => parseKey(window.location.hash);
/** `undefined` during SSR and hydration: the fragment never reaches the server. */
const readKeyOnServer = () => undefined;

export function RemoteConsole({ sessionId }: { sessionId: string }) {
  const signKey = useSyncExternalStore(subscribeHash, readKey, readKeyOnServer);

  return (
    <div className="r-root">
      <p className="r-banner" role="note">
        Not a medical device. Don&apos;t enter identifying information.
      </p>
      {signKey === undefined ? (
        <p className="r-notice">Opening the session…</p>
      ) : signKey === null ? (
        <p className="r-notice r-notice-error" role="alert">
          This link is missing its key. Copy the full therapist link from the patient&apos;s screen.
        </p>
      ) : (
        <ConsoleSession key={signKey} sessionId={sessionId} signKey={signKey} />
      )}
    </div>
  );
}

function ConsoleSession({ sessionId, signKey }: { sessionId: string; signKey: string }) {
  const channelRef = useRef<SessionChannel | null>(null);
  const waveRef = useRef(new Ring<WaveSample>(WAVE_CAPACITY));
  const historyRef = useRef(new Ring<HistorySample>(HISTORY_CAPACITY));
  const lastStateAtRef = useRef<number | null>(null);
  const seenDecisionsRef = useRef(new Set<string>());

  const [patient, setPatient] = useState<PatientState | null>(null);
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [linkUp, setLinkUp] = useState(false);
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);

  useEffect(() => {
    const wave = waveRef.current;
    const history = historyRef.current;
    const seen = seenDecisionsRef.current;

    const ingestState = (state: PatientState) => {
      const at = Date.now();
      lastStateAtRef.current = at;
      setPatient(state);

      const sample: HistorySample = {
        t: at,
        suds: state.suds,
        arousal: toArousal(state.arousal),
        level: state.level,
        cap: state.cap,
      };
      const prev = history.last();
      const changed =
        !prev ||
        prev.suds !== sample.suds ||
        prev.arousal !== sample.arousal ||
        prev.level !== sample.level ||
        prev.cap !== sample.cap;
      if (changed) history.push(sample);

      const decision = state.lastDecision;
      if (!decision || decision.action === "none") return;
      const id = `${decision.chunk}:${decision.reason}`;
      if (seen.has(id)) return;
      seen.add(id);
      setDecisions((list) => [{ id, at, ...decision }, ...list].slice(0, DECISION_LIMIT));
    };

    const ingestWave = ({ t0, dt, s }: ChannelMessages["wave"]) => {
      const lastT = wave.last()?.t ?? -Infinity;
      s.forEach((v, i) => {
        const t = t0 + i * dt;
        if (t > lastT && Number.isFinite(v)) wave.push({ t, v });
      });
    };

    const onMessage = (envelope: Envelope) => {
      if (envelope.from !== "patient") return;
      if (isType(envelope, "state")) ingestState(envelope.payload);
      else if (isType(envelope, "wave")) ingestWave(envelope.payload);
      else if (isType(envelope, "bye")) lastStateAtRef.current = null;
    };

    const open = () => {
      const channel: SessionChannel = new SessionChannel({
        sessionId,
        role: "remote",
        signKey,
        verifyKeys: { patient: signKey },
        onMessage,
        onStatus: (ok) => {
          if (channelRef.current !== channel) return;
          setLinkUp(ok);
          if (!ok) return;
          channel
            .send("hello", { t: Date.now(), role: "remote" })
            .catch((error: unknown) => console.warn("[remote] hello failed", error));
        },
      });
      channelRef.current = channel;
    };

    const shut = () => {
      const channel = channelRef.current;
      if (!channel) return;
      channelRef.current = null;
      setLinkUp(false);
      channel.close();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !channelRef.current) open();
    };

    open();
    window.addEventListener("pagehide", shut);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", shut);
      window.removeEventListener("pageshow", onPageShow);
      shut();
    };
  }, [sessionId, signKey]);

  useEffect(() => {
    const draw = () => {
      if (document.hidden) return;
      setFrame(buildFrame(Date.now(), waveRef.current, historyRef.current, lastStateAtRef.current));
    };
    draw();
    const timer = window.setInterval(draw, FRAME_MS);
    return () => window.clearInterval(timer);
  }, []);

  const send = useCallback<SendTherapist>(async (kind, value) => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Not connected");
    const payload: ChannelMessages["therapist"] = value === undefined ? { t: Date.now(), kind } : { t: Date.now(), kind, value };
    await channel.send("therapist", payload);
  }, []);

  const latest = decisions[0];
  const latestTag = latest ? decisionTag(latest.action) : null;
  const phaseLabel = patient ? (PHASE_LABEL[patient.phase] ?? patient.phase) : "Waiting for the patient screen";
  const announcement = latest
    ? `${phaseLabel}. Last decision: ${latestTag ?? latest.action}, ${latest.reason}.`
    : `${phaseLabel}.`;

  return (
    <>
      <header className="r-header">
        <div className="r-title">
          <Mark size={22} />
          <h1>Therapist console</h1>
          <span className="r-mono r-session-id" title={sessionId}>
            {sessionId.slice(0, 8)}
          </span>
        </div>
        <StatusBar patient={patient} connected={frame.connected} linkUp={linkUp} />
      </header>

      <div className="r-sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <main className="r-layout">
        <section className="r-lanes-col" aria-label="Live signals">
          <Lanes frame={frame} patient={patient} decisions={decisions} />
        </section>
        <aside className="r-controls-col" aria-label="Controls">
          <Controls patient={patient} linkUp={linkUp} onSend={send} />
        </aside>
      </main>
    </>
  );
}

const SENSOR_TEXT: Record<PatientState["sensor"], string> = {
  live: "Sensor live",
  stale: "Sensor stale",
  none: "No sensor",
};

function StatusBar({ patient, connected, linkUp }: { patient: PatientState | null; connected: boolean; linkUp: boolean }) {
  return (
    <dl className="r-status">
      <div className={`r-chip ${connected ? "r-chip-ok" : "r-chip-off"}`}>
        <dt className="r-sr-only">Patient screen</dt>
        <dd>
          <span className="r-dot" aria-hidden />
          {connected ? "Patient screen connected" : linkUp ? "Patient screen not connected" : "Connecting to channel"}
        </dd>
      </div>
      {patient && (
        <>
          <div className="r-chip">
            <dt>Phase</dt>
            <dd>{PHASE_LABEL[patient.phase] ?? patient.phase}</dd>
          </div>
          <div className="r-chip">
            <dt>Trial</dt>
            <dd className="r-mono">
              {patient.trial}/{patient.trials}
            </dd>
          </div>
          <div className={`r-chip r-chip-sensor-${patient.sensor}`}>
            <dt className="r-sr-only">Sensor</dt>
            <dd>
              <span className="r-dot" aria-hidden />
              {SENSOR_TEXT[patient.sensor]}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}
