"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { SessionMode, SignalMode } from "@/lib/orbis/receipts";
import { createSession } from "@/lib/session/local";

const FEAR_CHIPS = [
  "Dogs",
  "Heights",
  "Spiders",
  "Snakes",
  "Birds",
  "Flying",
  "Thunderstorms",
  "Deep water",
  "Elevators",
  "High bridges",
  "Darkness",
];

const EXCLUDED = /\b(social|crowd|people|public speaking|needle|blood|injection|injur|vomit|clown|face|trauma|assault|war)\w*/i;

type Mode = { mode: SessionMode; signal: SignalMode; label: string; detail: string };

const MODES: Mode[] = [
  { mode: "self", signal: "phone", label: "Phone on my chest", detail: "Your phone reads breathing. Best experience." },
  { mode: "self", signal: "suds", label: "Keyboard only", detail: "No phone. You rate distress 0–9 as you go." },
  { mode: "therapist", signal: "phone", label: "With my therapist", detail: "Phone on chest, plus a remote link for your therapist." },
];

export function IntakeForm() {
  const router = useRouter();
  const [fear, setFear] = useState("");
  const [outcome, setOutcome] = useState("");
  const [likelihood, setLikelihood] = useState(70);
  const [modeIndex, setModeIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excluded = EXCLUDED.test(fear);
  const canSubmit = fear.trim().length >= 2 && outcome.trim().length >= 2 && !excluded && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const choice = MODES[modeIndex]!;
    try {
      const session = await createSession({
        fear: fear.trim(),
        fearedOutcome: outcome.trim(),
        expectancyPre: likelihood,
        mode: choice.mode,
        signal: choice.signal,
        consent,
        audio,
      });
      router.push(`/session/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <form className="in-form" onSubmit={submit}>
      <fieldset className="in-step">
        <legend>
          <span className="in-step-number">01</span>
          What are you afraid of?
        </legend>
        <input
          className="in-input"
          value={fear}
          onChange={(event) => setFear(event.target.value)}
          placeholder="Dogs"
          maxLength={240}
          aria-describedby="fear-help"
          required
        />
        <div className="in-chips" role="list">
          {FEAR_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              role="listitem"
              className={`in-chip ${fear === chip ? "is-active" : ""}`}
              onClick={() => setFear(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <p id="fear-help" className="in-help">
          {excluded
            ? "Unflinch doesn't support fears involving people, needles, blood, vomit or trauma cues yet. Please practise those with your clinician."
            : "Dogs and heights have hand-written ladders. Others are generated and checked before anything is shown."}
        </p>
      </fieldset>

      <fieldset className="in-step">
        <legend>
          <span className="in-step-number">02</span>
          What do you think will happen if it gets close?
        </legend>
        <input
          className="in-input"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          placeholder="It will jump on me"
          maxLength={240}
          required
        />
        <p className="in-help">Each round ends by showing a harmless version of this, so you can test the prediction.</p>
      </fieldset>

      <fieldset className="in-step">
        <legend>
          <span className="in-step-number">03</span>
          How likely does that feel?
        </legend>
        <div className="in-slider">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={likelihood}
            onChange={(event) => setLikelihood(Number(event.target.value))}
            aria-valuetext={`${likelihood} percent`}
          />
          <output>{likelihood}%</output>
        </div>
      </fieldset>

      <fieldset className="in-step">
        <legend>
          <span className="in-step-number">04</span>
          How will you practise?
        </legend>
        <div className="in-modes">
          {MODES.map((choice, index) => (
            <label key={choice.label} className={`in-mode ${modeIndex === index ? "is-active" : ""}`}>
              <input
                type="radio"
                name="mode"
                checked={modeIndex === index}
                onChange={() => setModeIndex(index)}
              />
              <strong>{choice.label}</strong>
              <small>{choice.detail}</small>
            </label>
          ))}
        </div>
        <label className="in-check">
          <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
          Play scene sound
        </label>
        <label className="in-check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          Save a recording of the generated scene. Anyone with this session's run link can watch it. Unflinch never opens your camera.
        </label>
      </fieldset>

      {MODES[modeIndex]!.mode === "therapist" && (
        <p className="in-banner">Not a medical device. Don&apos;t enter identifying information.</p>
      )}
      {error && (
        <p className="in-error" role="alert">
          {error}
        </p>
      )}
      <div className="in-actions">
        <button className="m-button" type="submit" disabled={!canSubmit}>
          {busy ? "Preparing your plan…" : "Build my plan"}
        </button>
        <span className="in-help">You can pause any time with Space or the Pause button.</span>
      </div>
    </form>
  );
}
