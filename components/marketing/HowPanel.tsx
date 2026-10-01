"use client";

import { useState } from "react";

const HOW_STEPS = [
  {
    title: "Name the fear and the outcome you dread",
    description: "“Dogs. I think it will jump on me. 80% likely.”",
    stat: "1",
    statLabel: "sentence in, no pre-made assets",
    note: "Curated ladders for dogs and heights; others generated and linted",
  },
  {
    title: "Phone flat on your chest",
    description: "The accelerometer reads breathing. No headset, no app install.",
    stat: "45 s",
    statLabel: "calibration on an empty scene",
    note: "No phone? Rate distress 0–9 on the keyboard",
  },
  {
    title: "Face it live, every two chunks",
    description: "The scene presses on, holds, or eases off. You can step closer, step back or pause.",
    stat: "~3.7 s",
    statLabel: "between controller decisions",
    note: "Target until measured on /proof",
  },
  {
    title: "End on your prediction",
    description: "Each trial stages a harmless version of what you feared, then you re-rate it.",
    stat: "0–100%",
    statLabel: "expectancy, before and after",
    note: "Trials end on the test, not on calming down",
  },
];

export function HowPanel() {
  const [active, setActive] = useState(2);
  const current = HOW_STEPS[active] ?? HOW_STEPS[0]!;
  return (
    <div className="m-solutions-panel">
      <div className="m-step-list" aria-label="How a session runs">
        {HOW_STEPS.map((step, index) => (
          <button
            key={step.title}
            type="button"
            aria-pressed={active === index}
            aria-controls="how-art"
            onClick={() => setActive(index)}
            className={`m-step ${active === index ? "is-active" : ""}`}
          >
            <span className="m-step-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </button>
        ))}
      </div>
      <div id="how-art" className="m-solutions-art m-art-cool" aria-live="polite">
        <div className="m-glass-stat">
          <strong>{current.stat}</strong>
          <span>{current.statLabel}</span>
          <span className="m-glass-note">{current.note}</span>
        </div>
      </div>
    </div>
  );
}
