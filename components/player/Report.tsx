"use client";

import Link from "next/link";

import type { LocalSession } from "@/lib/session/local";
import type { Snapshot } from "@/lib/session/runtime";

const HAPPENED: Record<string, string> = { yes: "Yes", partly: "Partly", no: "No" };

export function Report({ snap, local }: { snap: Snapshot; local: LocalSession }) {
  const first = snap.summaries[0];
  const last = snap.summaries.at(-1);

  function exportJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: "unflinch.report.v1",
            session: local.id,
            fear: local.fear,
            feared_outcome: local.fearedOutcome,
            labels: snap.labels,
            trials: snap.summaries,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unflinch-${local.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="pl-report m-container">
      <span className="m-eyebrow">
        <span className="m-small-mark" aria-hidden="true">
          ✳
        </span>
        Session report
      </span>
      <h1>What you predicted vs what happened.</h1>
      {snap.labels.includes("SIMULATED_INPUT") && (
        <p className="pl-report-note">Simulated input. These ratings are a demo, not outcomes.</p>
      )}

      {first && last ? (
        <div className="pl-report-hero">
          <div>
            <span>You predicted</span>
            <strong>{local.fearedOutcome}</strong>
          </div>
          <div>
            <span>Likelihood before</span>
            <strong>{first.expectancyBefore ?? "?"}%</strong>
          </div>
          <div>
            <span>Likelihood after the last round</span>
            <strong>{last.expectancyAfter ?? "?"}%</strong>
          </div>
        </div>
      ) : (
        <p>The session ended before a round finished, so there&apos;s nothing to compare yet.</p>
      )}

      {snap.summaries.length > 0 && (
        <table className="pl-report-table">
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Context</th>
              <th scope="col">Closest step held</th>
              <th scope="col">Time at each step</th>
              <th scope="col">Easing off</th>
              <th scope="col">Did it happen?</th>
              <th scope="col">Likelihood</th>
              <th scope="col">Peak distress</th>
            </tr>
          </thead>
          <tbody>
            {snap.summaries.map((s) => (
              <tr key={s.trial}>
                <td>{s.trial}</td>
                <td>{s.context}</td>
                <td>
                  L{s.maxLevel} of {s.cap}
                </td>
                <td className="pl-mono">
                  {Object.entries(s.secondsAtLevel)
                    .map(([level, seconds]) => `L${level} ${Math.round(seconds)}s`)
                    .join(" · ")}
                </td>
                <td>
                  {s.retreats.length
                    ? s.retreats.map((r) => (r.reason.startsWith("CEILING") ? "auto" : "you")).join(", ")
                    : "none"}
                </td>
                <td>{s.happened ? HAPPENED[s.happened] : "Not rated"}</td>
                <td>
                  {s.expectancyBefore ?? "?"}% → {s.expectancyAfter ?? "?"}%
                </td>
                <td>{s.sudsPeak ?? "?"}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pl-report-actions">
        <button type="button" className="m-button" onClick={exportJson}>
          Export JSON
        </button>
        <button type="button" className="m-button m-button-secondary" onClick={() => window.print()}>
          Print therapist note
        </button>
        <Link className="m-button m-button-secondary" href={`/runs/${local.id}`}>
          Open the run receipt
        </Link>
        <Link className="m-final-secondary" href="/start">
          Start another session
        </Link>
      </div>
      <p className="pl-fineprint">Not a medical device. Unflinch makes no treatment claims.</p>
    </main>
  );
}
