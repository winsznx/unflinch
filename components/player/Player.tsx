"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { LocalSession } from "@/lib/session/local";
import type { Rating, SessionRuntime, Snapshot } from "@/lib/session/runtime";

import { Report } from "./Report";
import { TraceLanes } from "./TraceLanes";

const LABEL_TEXT: Record<string, string> = {
  LIVE: "LIVE",
  SIMULATED_INPUT: "SIMULATED INPUT",
  BUILDER_DEMO: "BUILDER DEMO",
};

export function Player({ runtime, snap, local }: { runtime: SessionRuntime; snap: Snapshot; local: LocalSession }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const judge = local.mode === "judge";
  const [muted, setMuted] = useState(!local.audio);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !snap.stream) return;
    if (video.srcObject !== snap.stream) video.srcObject = snap.stream;
    void video.play().catch(() => undefined);
    runtime.attachVideo(video);
  }, [runtime, snap.stream]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowUp") runtime.intent("closer");
      else if (event.key === "ArrowDown") runtime.intent("back");
      else if (event.key === " ") {
        event.preventDefault();
        runtime.intent(runtime.getSnapshot().phase === "paused" ? "resume" : "pause");
      } else if (/^[0-9]$/.test(event.key)) runtime.reportSuds(Number(event.key));
      else if (judge && (event.key === "s" || event.key === "S")) runtime.simTrigger("spike");
      else if (judge && (event.key === "h" || event.key === "H")) runtime.simTrigger("hold");
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runtime, judge]);

  if (snap.phase === "report" || snap.phase === "ended") {
    return <Report snap={snap} local={local} />;
  }

  const live = ["trial", "paused", "calibrating", "priming", "handoff", "rating"].includes(snap.phase);
  const showBuilding = live && (!snap.hasFrames || snap.phase === "priming");

  return (
    <div className={`pl-shell ${judge ? "is-judge" : ""}`}>
      <div className="pl-stage">
        <video ref={videoRef} className="pl-video" playsInline autoPlay muted={muted} />

        {showBuilding && (
          <div className="pl-overlay" aria-live="polite">
            <span className="pl-spinner" aria-hidden="true" />
            <p>Building your scene…</p>
          </div>
        )}
        {snap.phase === "connecting" && (
          <div className="pl-overlay" aria-live="polite">
            <span className="pl-spinner" aria-hidden="true" />
            <p>Connecting to the live world…</p>
          </div>
        )}
        {snap.phase === "paused" && (
          <div className="pl-overlay is-soft" aria-live="polite">
            <p className="pl-overlay-title">Take your time.</p>
            <p>Resume when ready.</p>
            <button type="button" className="pl-pill" onClick={() => runtime.intent("resume")}>
              Resume
            </button>
          </div>
        )}
        {snap.phase === "busy" && (
          <div className="pl-overlay is-panel">
            <p className="pl-overlay-title">Someone is in a live session right now.</p>
            <p>
              Orbis runs one live session at a time.
              {snap.busyUntil && ` The slot frees up by ${new Date(snap.busyUntil).toLocaleTimeString()}.`}
            </p>
            <div className="pl-overlay-actions">
              <button type="button" className="pl-pill" onClick={() => void runtime.start()}>
                Try again
              </button>
              <Link className="pl-pill is-ghost" href="/runs/canonical">
                Watch a live run
              </Link>
            </div>
          </div>
        )}
        {snap.phase === "lost" && (
          <div className="pl-overlay is-panel">
            <p className="pl-overlay-title">Connection lost.</p>
            <p>Resuming starts a new take of this round.</p>
            <button type="button" className="pl-pill" onClick={() => void runtime.retryAfterLoss()}>
              Resume
            </button>
          </div>
        )}
        {snap.phase === "error" && (
          <div className="pl-overlay is-panel">
            <p className="pl-overlay-title">The live scene couldn&apos;t start.</p>
            <p>{snap.error}</p>
            <div className="pl-overlay-actions">
              <Link className="pl-pill" href="/runs/canonical">
                Watch a recorded run
              </Link>
              <Link className="pl-pill is-ghost" href="/start">
                Start over
              </Link>
            </div>
          </div>
        )}
        {snap.phase === "rating" && <RatingSheet runtime={runtime} snap={snap} />}

        <div className="pl-labels">
          {snap.labels.map((label) => (
            <span key={label} className="pl-label">
              {LABEL_TEXT[label] ?? label}
            </span>
          ))}
          {snap.maxSessionS && (
            <span className="pl-label is-quiet">
              {Math.max(0, snap.maxSessionS - snap.elapsedS)}s left
            </span>
          )}
        </div>

        {live && snap.phase !== "rating" && <Hud runtime={runtime} snap={snap} muted={muted} onMute={() => setMuted((m) => !m)} />}
      </div>

      {judge && <JudgePanel runtime={runtime} snap={snap} />}
    </div>
  );
}

function Hud({
  runtime,
  snap,
  muted,
  onMute,
}: {
  runtime: SessionRuntime;
  snap: Snapshot;
  muted: boolean;
  onMute: () => void;
}) {
  const caption =
    snap.atCapNotice
      ? "This is the closest point for this round."
      : snap.nudge
        ? "Ready to step closer?"
        : snap.askSuds
          ? "How are you now? 0–9"
          : snap.phase === "calibrating"
            ? snap.calibrationHint ?? snap.caption
            : snap.caption;
  const sensorText =
    snap.sensor === "live" ? "Sensor connected" : snap.sensor === "stale" ? "Check sensor" : "No sensor";

  return (
    <div className="pl-hud">
      <div className="pl-hud-top">
        <div className="pl-dots" aria-label={`Step ${snap.level} of ${snap.cap}`}>
          {Array.from({ length: snap.cap + 1 }, (_, level) => (
            <span key={level} className={level <= snap.level ? "is-on" : ""} />
          ))}
        </div>
        <p className="pl-caption" aria-live="polite">
          {caption ?? (snap.phase === "calibrating" ? "Just watch the scene." : " ")}
        </p>
        <span className="pl-meta">
          Round {snap.trial || 1} of {snap.trials}
          {snap.phase === "calibrating" && snap.calibrationLeftS !== null && ` · ${snap.calibrationLeftS}s`}
        </span>
      </div>
      <div className="pl-hud-bottom">
        <div className="pl-buttons">
          <button type="button" onClick={() => runtime.intent("closer")} disabled={snap.phase !== "trial"}>
            <span aria-hidden="true">↑</span> Step closer
          </button>
          <button type="button" onClick={() => runtime.intent("back")} disabled={snap.phase !== "trial"}>
            <span aria-hidden="true">↓</span> Step back
          </button>
          <button
            type="button"
            onClick={() => runtime.intent(snap.phase === "paused" ? "resume" : "pause")}
            disabled={snap.phase !== "trial" && snap.phase !== "paused"}
          >
            {snap.phase === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
        <div className="pl-hud-right">
          <span className="pl-suds-hint">
            {snap.suds !== null ? `Feeling ${snap.suds}/10` : "Press 0–9 to rate"}
          </span>
          <span className={`pl-sensor is-${snap.sensor}`}>
            <i aria-hidden="true" />
            {sensorText}
          </span>
          <button type="button" className="pl-icon" onClick={onMute} aria-label={muted ? "Unmute scene" : "Mute scene"}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" className="pl-icon" onClick={() => void runtime.end()}>
            End
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingSheet({ runtime, snap }: { runtime: SessionRuntime; snap: Snapshot }) {
  const [happened, setHappened] = useState<Rating["happened"] | null>(null);
  const [likelihood, setLikelihood] = useState(snap.summaries.at(-1)?.expectancyAfter ?? 50);
  const [suds, setSuds] = useState(snap.suds ?? 5);
  const [feeling, setFeeling] = useState("");
  const [busy, setBusy] = useState(false);
  const last = snap.trial >= snap.trials;

  async function submit() {
    if (!happened) return;
    setBusy(true);
    await runtime.submitRating({ happened, expectancyAfter: likelihood, suds, feeling: feeling.trim() || null });
  }

  return (
    <div className="pl-sheet" role="dialog" aria-modal="true" aria-labelledby="rating-title">
      <h2 id="rating-title">Before we go on, did what you expected happen?</h2>
      <div className="pl-segment" role="radiogroup" aria-label="Did it happen?">
        {(["yes", "partly", "no"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={happened === value}
            className={happened === value ? "is-active" : ""}
            onClick={() => setHappened(value)}
          >
            {value === "yes" ? "Yes" : value === "partly" ? "Partly" : "No"}
          </button>
        ))}
      </div>
      <label className="pl-field">
        <span>How likely does it feel now?</span>
        <div className="pl-range">
          <input type="range" min={0} max={100} step={5} value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))} />
          <output>{likelihood}%</output>
        </div>
      </label>
      <label className="pl-field">
        <span>How distressed are you right now?</span>
        <div className="pl-range">
          <input type="range" min={0} max={10} step={1} value={suds} onChange={(e) => setSuds(Number(e.target.value))} />
          <output>{suds}/10</output>
        </div>
      </label>
      <label className="pl-field">
        <span>One word for the feeling (optional)</span>
        <input className="pl-text" value={feeling} maxLength={40} onChange={(e) => setFeeling(e.target.value)} placeholder="Tense" />
      </label>
      <button type="button" className="m-button" disabled={!happened || busy} onClick={() => void submit()}>
        {busy ? "Saving…" : last ? "See what changed" : "Next round"}
      </button>
    </div>
  );
}

function JudgePanel({ runtime, snap }: { runtime: SessionRuntime; snap: Snapshot }) {
  return (
    <aside className="pl-judge" aria-label="Live signal and decisions">
      <div className="pl-judge-head">
        <span className="pl-label is-dark">SIMULATED INPUT</span>
        <span className="pl-judge-arousal">
          Arousal <strong>{snap.arousal}</strong>
        </span>
      </div>
      <TraceLanes snap={snap} />
      <div className="pl-judge-keys">
        <button type="button" onClick={() => runtime.simTrigger("spike")}>
          <kbd>S</kbd> Breath spike
        </button>
        <button type="button" onClick={() => runtime.simTrigger("hold")}>
          <kbd>H</kbd> Breath hold
        </button>
        <span>
          <kbd>0</kbd>–<kbd>9</kbd> SUDS · <kbd>↑</kbd>/<kbd>↓</kbd> step · <kbd>Space</kbd> pause
        </span>
      </div>
      <ol className="pl-log">
        {[...snap.decisions]
          .reverse()
          .filter((d) => d.kind !== "hold")
          .slice(0, 12)
          .map((d) => (
          <li key={`${d.chunk}-${d.reason}-${d.t}`} className={`is-${d.kind}`}>
            <code>c{d.chunk}</code>
            <span>{d.reason}</span>
            <small>
              L{d.level_before}→L{d.level_after}
              {d.accepted_ms !== null && ` · ack ${d.accepted_ms}ms`}
              {d.landed_chunk !== null && ` · landed c${d.landed_chunk}`}
            </small>
          </li>
        ))}
      </ol>
    </aside>
  );
}
