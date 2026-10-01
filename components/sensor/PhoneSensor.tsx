"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { isType, SessionChannel, type ChannelMessages, type MessageType } from "@/lib/realtime/channel";
import { BreathEstimator } from "@/lib/signal/breath";

import {
  requestMotionAccess,
  useBatteryPercent,
  useDeviceMotion,
  useMotionApi,
  useWakeLock,
  vibrate,
} from "./motion";
import { ChestIllustration, MiniTrace, SignalBar } from "./parts";
import "./sensor.css";

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const TICK_MS = 500;
const WAVE_DT_MS = 100;
const WAVE_CHUNK = 5;
/** 20 s of the 10 Hz display waveform. */
const TRACE_POINTS = 200;
const EASING_OFF = "Easing off. You're in control.";

type Pairing = { sessionId: string; phoneKey: string };
type PairResult = { ok: true; pairing: Pairing } | { ok: false; message: string; retry: boolean };
type PatientState = ChannelMessages["state"];
type SensorAccess = "idle" | "live" | "denied" | "unsupported";
type Readout = { rate: number | null; conf: number; trace: number[] };

export function PhoneSensor({ code }: { code: string }) {
  if (code === "ENTER") return <CodeEntry />;
  if (!CODE_PATTERN.test(code)) {
    return <CodeEntry notice="That code doesn't look right. It's the six characters shown on the laptop." />;
  }
  return <PairedSensor key={code} code={code} />;
}

function Shell({ children, connection }: { children: ReactNode; connection?: ReactNode }) {
  return (
    <div className="s-page">
      <header className="s-header">
        <Logo size={22} />
        {connection}
      </header>
      <main className="s-main">{children}</main>
    </div>
  );
}

function CodeEntry({ notice }: { notice?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const valid = CODE_PATTERN.test(value);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) router.push(`/s/${value}`);
  }

  return (
    <Shell>
      <section className="s-panel s-stack">
        <h1 className="s-title">Pair this phone</h1>
        <p className="s-body">Type the six-character code shown on the laptop.</p>
        {notice ? <p className="s-notice">{notice}</p> : null}
        <form className="s-stack" onSubmit={submit}>
          <label className="s-label" htmlFor="s-code">
            Pairing code
          </label>
          <input
            id="s-code"
            className="s-code-input"
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder="ABC234"
          />
          <button type="submit" className="s-button s-button-primary" disabled={!valid}>
            Pair phone
          </button>
        </form>
      </section>
    </Shell>
  );
}

const storageKey = (code: string) => `unflinch:pair:${code}`;

function readStoredPairing(code: string): Pairing | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(code));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "sessionId" in parsed &&
      "phoneKey" in parsed &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.phoneKey === "string"
    ) {
      return { sessionId: parsed.sessionId, phoneKey: parsed.phoneKey };
    }
    return null;
  } catch {
    return null;
  }
}

function storePairing(code: string, pairing: Pairing) {
  try {
    window.sessionStorage.setItem(storageKey(code), JSON.stringify(pairing));
  } catch (error) {
    console.warn("[sensor] could not keep the pairing for reloads", error);
  }
}

async function requestPairing(code: string): Promise<PairResult> {
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.status === 409) {
      return {
        ok: false,
        retry: false,
        message: "This code was already used or has expired. Ask for a new one on the laptop.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        retry: response.status >= 500,
        message:
          response.status >= 500
            ? "Unflinch couldn't pair right now. Try again in a moment."
            : "That code doesn't look right. Check the six characters on the laptop.",
      };
    }
    const body = (await response.json()) as { sessionId: string; phoneKey: string };
    const pairing = { sessionId: body.sessionId, phoneKey: body.phoneKey };
    storePairing(code, pairing);
    return { ok: true, pairing };
  } catch {
    return { ok: false, retry: true, message: "Couldn't reach Unflinch. Check your connection and try again." };
  }
}

/**
 * Pairing is single use on the server, so concurrent mounts (Strict Mode, fast remounts) must share one
 * request. Failed attempts are dropped so "Try again" makes a fresh one.
 */
const pairingRequests = new Map<string, Promise<PairResult>>();

function pair(code: string): Promise<PairResult> {
  const stored = readStoredPairing(code);
  if (stored) return Promise.resolve({ ok: true, pairing: stored });
  let request = pairingRequests.get(code);
  if (!request) {
    request = requestPairing(code);
    pairingRequests.set(code, request);
    void request.then((result) => {
      if (!result.ok) pairingRequests.delete(code);
    });
  }
  return request;
}

function PairedSensor({ code }: { code: string }) {
  const [result, setResult] = useState<PairResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    void pair(code).then((next) => {
      if (!ignore) setResult(next);
    });
    return () => {
      ignore = true;
    };
  }, [code, attempt]);

  if (!result) {
    return (
      <Shell>
        <section className="s-panel s-stack" aria-live="polite">
          <h1 className="s-title">Pairing</h1>
          <p className="s-body">Connecting this phone to your session.</p>
        </section>
      </Shell>
    );
  }

  if (!result.ok) {
    return (
      <Shell>
        <section className="s-panel s-stack" role="alert">
          <h1 className="s-title">Couldn&apos;t pair</h1>
          <p className="s-body">{result.message}</p>
          {result.retry ? (
            <button
              type="button"
              className="s-button s-button-primary"
              onClick={() => {
                setResult(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          ) : (
            <Link className="s-button s-button-secondary" href="/s/enter">
              Enter a new code
            </Link>
          )}
        </section>
      </Shell>
    );
  }

  return <SensorSession sessionId={result.pairing.sessionId} phoneKey={result.pairing.phoneKey} />;
}

const PHASE_TEXT: Record<string, string> = {
  ready: "Ready. The session starts on the laptop.",
  connecting: "Getting the scene ready.",
  priming: "Building your scene.",
  calibrating: "Let's get a feel for your normal breathing.",
  paused: "Take your time. Resume when ready.",
  handoff: "Before we go on, did what you expected happen?",
  rating: "Answer the short questions on the laptop.",
  lost: "The laptop lost its connection. Resume there when ready.",
  report: "Session finished. You can take the phone off your chest.",
  ended: "Session finished. You can take the phone off your chest.",
};

function patientMessage(state: PatientState): string | null {
  if (state.caption) return state.caption;
  if (state.lastDecision?.action === "down") return EASING_OFF;
  return PHASE_TEXT[state.phase] ?? null;
}

function SensorSession({ sessionId, phoneKey }: Pairing) {
  const motionApi = useMotionApi();
  const [access, setAccess] = useState<SensorAccess>("idle");
  const [connected, setConnected] = useState(false);
  const [patient, setPatient] = useState<PatientState | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [suds, setSuds] = useState(0);
  const [sudsSent, setSudsSent] = useState(false);
  const [estimator] = useState(() => new BreathEstimator());
  const channelRef = useRef<SessionChannel | null>(null);
  const lastSudsRef = useRef<number | null>(null);

  const live = access === "live";
  const screenOn = useWakeLock(live);
  const battery = useBatteryPercent();

  useDeviceMotion(
    live,
    (sample) => estimator.push(sample),
    () => setAccess("unsupported"),
  );

  useEffect(() => {
    let closed = false;
    let staleBefore = false;
    const channel = new SessionChannel({
      sessionId,
      role: "phone",
      signKey: phoneKey,
      verifyKeys: { patient: phoneKey },
      onMessage: (envelope) => {
        if (!isType(envelope, "state")) return;
        const stale = envelope.payload.sensor === "stale";
        if (stale && !staleBefore) vibrate([80, 60, 80]);
        staleBefore = stale;
        setPatient(envelope.payload);
      },
      onStatus: (ok) => {
        if (closed) return;
        setConnected(ok);
        if (ok) void channel.send("hello", { t: Date.now(), role: "phone" }).catch(logSendError);
      },
    });
    channelRef.current = channel;

    const close = () => {
      if (closed) return;
      closed = true;
      channelRef.current = null;
      channel.close();
    };
    // A page restored from the back/forward cache has a closed channel; the stored pairing makes a reload cheap.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", onPageShow);
      close();
    };
  }, [sessionId, phoneKey]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const { t, rate, cv, amp, conf, holdS } = estimator.estimate(now);
      const s = estimator.waveform(WAVE_CHUNK);
      send(channelRef.current, "breath", { t, rate, cv, amp, conf, holdS });
      send(channelRef.current, "wave", { t0: now - (s.length - 1) * WAVE_DT_MS, dt: WAVE_DT_MS, s });
      setReadout({ rate, conf, trace: estimator.waveform(TRACE_POINTS) });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [live, estimator]);

  async function startSensor() {
    vibrate(30);
    const result = await requestMotionAccess();
    setAccess(result === "granted" ? "live" : result);
  }

  function commitSuds(value: number) {
    if (lastSudsRef.current === value) return;
    lastSudsRef.current = value;
    setSudsSent(true);
    send(channelRef.current, "suds", { t: Date.now(), v: value });
  }

  function sendIntent(kind: ChannelMessages["intent"]["kind"]) {
    vibrate(30);
    send(channelRef.current, "intent", { t: Date.now(), kind });
  }

  const paused = patient?.phase === "paused";
  const message = patient ? patientMessage(patient) : null;
  const sensorBlocked = !motionApi || access === "unsupported";

  return (
    <Shell
      connection={
        <span className="s-pill" data-on={connected} role="status">
          <span className="s-pill-dot" aria-hidden="true" />
          {connected ? "Connected" : "Connecting"}
        </span>
      }
    >
      {live ? (
        <section className="s-panel s-stack" aria-label="Breathing sensor">
          <div className="s-readout">
            <div>
              <span className="s-label">Breathing</span>
              <strong className="s-rate">
                {readout?.rate != null ? `${Math.round(readout.rate)} bpm` : "…"}
              </strong>
            </div>
            <SignalBar conf={readout?.conf ?? null} />
          </div>
          <MiniTrace samples={readout?.trace ?? []} label="Breathing trace, last 20 seconds" />
          <p className="s-hint">Lie back or sit still with the phone flat on your chest.</p>
        </section>
      ) : (
        <section className="s-panel s-stack s-place">
          <ChestIllustration />
          <h1 className="s-title">Place your phone flat on your chest</h1>
          {sensorBlocked ? (
            <p className="s-notice" role="status">
              This page needs a phone with motion sensors. You can still rate how you feel and use the buttons
              below.
            </p>
          ) : access === "denied" ? (
            <>
              <p className="s-notice" role="status">
                Motion access was denied. You can still rate how you feel below.
              </p>
              <button type="button" className="s-button s-button-primary" onClick={() => void startSensor()}>
                Try again
              </button>
            </>
          ) : (
            <>
              <p className="s-body">Screen facing up, top of the phone toward your chin. Then tap start.</p>
              <button type="button" className="s-button s-button-primary" onClick={() => void startSensor()}>
                Start sensor
              </button>
            </>
          )}
        </section>
      )}

      <section className="s-panel s-stack" aria-label="Session" aria-live="polite">
        {patient ? (
          <>
            <div className="s-session-head">
              {patient.trial > 0 ? (
                <span className="s-label">
                  Trial {patient.trial} of {patient.trials}
                </span>
              ) : (
                <span className="s-label">Session</span>
              )}
              <LevelDots level={patient.level} cap={patient.cap} />
            </div>
            {message ? <p className="s-caption">{message}</p> : null}
          </>
        ) : (
          <p className="s-body">Waiting for the laptop.</p>
        )}
      </section>

      <section className="s-panel s-stack" aria-label="How distressed are you">
        <label className="s-label" htmlFor="s-suds">
          How distressed are you right now?
        </label>
        <output className="s-suds-value" htmlFor="s-suds" aria-live="polite">
          {suds}
        </output>
        <input
          id="s-suds"
          className="s-slider"
          type="range"
          min={0}
          max={10}
          step={1}
          value={suds}
          onChange={(event) => setSuds(Number(event.target.value))}
          onPointerUp={(event) => commitSuds(Number(event.currentTarget.value))}
          onKeyUp={(event) => commitSuds(Number(event.currentTarget.value))}
          onBlur={(event) => commitSuds(Number(event.currentTarget.value))}
          aria-valuetext={`${suds} out of 10`}
        />
        <div className="s-scale" aria-hidden="true">
          <span>0 calm</span>
          <span>10 worst</span>
        </div>
        {sudsSent ? null : <p className="s-hint">Slide and let go to send.</p>}
      </section>

      <section className="s-controls" aria-label="Controls">
        <button type="button" className="s-button s-button-secondary" disabled={!connected} onClick={() => sendIntent("closer")}>
          Step closer
        </button>
        <button type="button" className="s-button s-button-secondary" disabled={!connected} onClick={() => sendIntent("back")}>
          Step back
        </button>
        <button
          type="button"
          className="s-button s-button-primary s-button-wide"
          disabled={!connected}
          aria-pressed={paused}
          onClick={() => sendIntent(paused ? "resume" : "pause")}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </section>

      <footer className="s-status">
        {live ? <span>{screenOn ? "Screen stays on" : "Keep the screen awake manually"}</span> : null}
        {battery !== null ? <span>Battery {battery}%</span> : null}
      </footer>
    </Shell>
  );
}

function LevelDots({ level, cap }: { level: number; cap: number }) {
  return (
    <span className="s-dots" role="img" aria-label={`Level ${level} of ${cap}`}>
      {Array.from({ length: cap + 1 }, (_, i) => (
        <span key={i} className="s-dot" data-on={i <= level} />
      ))}
    </span>
  );
}

function logSendError(error: unknown) {
  console.warn("[sensor] message not sent", error);
}

function send<T extends MessageType>(channel: SessionChannel | null, type: T, payload: ChannelMessages[T]) {
  if (!channel) return;
  channel.send(type, payload).catch(logSendError);
}
