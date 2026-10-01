"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createSession } from "@/lib/session/local";

type SlotStatus = { busy: boolean; leaseUntil: string | null; publicLive: boolean };

const PRESETS = [
  { fear: "Dogs", outcome: "It will jump on me", likelihood: 80 },
  { fear: "Heights", outcome: "I'll lose my balance", likelihood: 70 },
  { fear: "Spiders", outcome: "It will crawl onto me", likelihood: 75 },
];

export function TryLauncher() {
  const router = useRouter();
  const [slot, setSlot] = useState<SlotStatus | null>(null);
  const [preset, setPreset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/slot/status", { cache: "no-store" })
        .then((response) => response.json() as Promise<SlotStatus>)
        .then((status) => {
          if (!cancelled) setSlot(status);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const choice = PRESETS[preset]!;
    try {
      const session = await createSession({
        fear: choice.fear,
        fearedOutcome: choice.outcome,
        expectancyPre: choice.likelihood,
        mode: "judge",
        signal: "sim",
        consent: false,
        audio: true,
      });
      router.push(`/session/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  const unavailable = slot && (!slot.publicLive || slot.busy);

  return (
    <div className="in-form">
      <div className="in-step">
        <p className="in-legend">Pick a fear</p>
        <div className="in-modes">
          {PRESETS.map((choice, index) => (
            <label key={choice.fear} className={`in-mode ${preset === index ? "is-active" : ""}`}>
              <input type="radio" name="preset" checked={preset === index} onChange={() => setPreset(index)} />
              <strong>{choice.fear}</strong>
              <small>
                &ldquo;{choice.outcome}&rdquo; · {choice.likelihood}%
              </small>
            </label>
          ))}
        </div>
        <p className="in-help">Dogs and heights use hand-written ladders. Spiders is generated from one sentence.</p>
      </div>

      <div className="in-step">
        <p className="in-legend">Live slot</p>
        <p className="in-slot" aria-live="polite">
          <span className={`in-slot-dot ${slot ? (unavailable ? "is-busy" : "is-free") : ""}`} aria-hidden="true" />
          {!slot && "Checking…"}
          {slot && !slot.publicLive && "Live sessions are paused right now."}
          {slot && slot.publicLive && slot.busy && "Someone is in a live session. You can wait or watch a recorded run."}
          {slot && slot.publicLive && !slot.busy && "Free. Your session can start now."}
        </p>
        <p className="in-help">Orbis runs one live session at a time. Sessions are capped at four minutes.</p>
      </div>

      {error && (
        <p className="in-error" role="alert">
          {error}
        </p>
      )}
      <div className="in-actions">
        <button type="button" className="m-button" disabled={busy || Boolean(slot && !slot.publicLive)} onClick={() => void start()}>
          {busy ? "Preparing…" : unavailable ? "Queue anyway" : "Start live session"}
        </button>
        <Link className="m-button m-button-secondary" href="/runs/canonical">
          Watch a live run
        </Link>
      </div>
    </div>
  );
}
