import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow } from "@/components/marketing/primitives";
import { Lanes, LanesLegend } from "@/components/proof/Lanes";
import { RunEmpty } from "@/components/proof/RunEmpty";
import { median, type ReceiptDecision, type SignalMode } from "@/lib/orbis/receipts";
import { LABEL_TEXT, levelPath, seconds, summarize } from "@/lib/proof/metrics";
import { loadRun, type Run, type RunTrial } from "@/lib/proof/runs";
import { pageMetadata } from "@/lib/seo";
import "../../proof.css";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trial?: string | string[] }>;
};

const MAX_OG_LEVELS = 64;
const SIGNAL_TEXT: Record<SignalMode, string> = {
  phone: "Breath from a phone on the chest",
  sim: "Simulated breath input",
  suds: "Distress ratings only",
};
const PROMPT_PREVIEW = 64;

function isCanonicalPlaceholder(id: string): boolean {
  return id.includes("CANONICAL_RUN_ID");
}

async function safeLoadRun(id: string): Promise<{ run: Run | null; failed: boolean }> {
  try {
    return { run: await loadRun(id), failed: false };
  } catch (error) {
    console.error(`[proof] failed to load run ${id}:`, error);
    return { run: null, failed: true };
  }
}

function headline(run: Run): { cuts: number | null; responseS: number | null } {
  const measured = run.trials.filter((t) => t.cuts !== null);
  const cuts = measured.length ? measured.reduce((sum, t) => sum + t.cuts!.cuts, 0) : null;
  const responseS = median(run.trials.flatMap((t) => summarize(t.receipt).landingSeconds));
  return { cuts, responseS };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { run } = await safeLoadRun(id);
  if (!run) {
    return pageMetadata({
      title: isCanonicalPlaceholder(id) ? "No canonical run yet" : "Run not found",
      description: "Live exposure runs with their receipts, timelines and recordings.",
      og: "kind=run",
    });
  }

  const { cuts, responseS } = headline(run);
  const measurable = cuts !== null && responseS !== null;
  const og = new URLSearchParams({
    kind: "run",
    id: run.id,
    fear: run.fear,
    levels: levelPath(run.trials[0]!.receipt).slice(0, MAX_OG_LEVELS).join(","),
  });
  if (cuts !== null) og.set("cuts", String(cuts));
  if (responseS !== null) og.set("resp", `${responseS.toFixed(1)}s`);

  return pageMetadata({
    title: measurable
      ? `Live run · ${run.fear} · ${cuts} cuts · ${responseS.toFixed(1)}s response`
      : `Live run · ${run.fear}`,
    description: `${run.trials.length} trial${run.trials.length === 1 ? "" : "s"} of live exposure practice for ${run.fear}, with the decision log, timeline and a verifiable receipt.`,
    path: `/runs/${run.id}`,
    og: og.toString(),
  });
}

function MetricCard({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: string;
  unit?: string;
  foot?: string;
}) {
  const muted = value === "Not measured" || value === "None" || value === "No data";
  return (
    <article className="p-metric">
      <h3>{label}</h3>
      <strong className={muted ? "is-muted" : undefined}>
        {value}
        {unit && !muted ? <small>{unit}</small> : null}
      </strong>
      {foot ? <p>{foot}</p> : null}
    </article>
  );
}

function Recording({ run, trial }: { run: Run; trial: RunTrial }) {
  const src =
    trial.recording?.kind === "file"
      ? `/runs/${run.id}/recording?trial=${trial.n}`
      : trial.recording?.kind === "url"
        ? trial.recording.url
        : null;
  if (!src) {
    return (
      <div className="p-video p-video-empty">
        <p>Recording not stored for this run</p>
        <small>Recordings are only kept with consent. The receipt below still has every decision.</small>
      </div>
    );
  }
  return (
    <div className="p-video">
      <video controls playsInline preload="metadata" src={src} aria-label="Recording of the generated scene" />
    </div>
  );
}

function trialMetrics(run: Run, trial: RunTrial) {
  const { receipt } = trial;
  const s = summarize(receipt);
  const evS = receipt.ev ? seconds(receipt.ev.t - receipt.start.t) : null;
  const { expectancy_before: before, expectancy_after: after } = receipt.ratings;
  const builderDemo = receipt.labels.includes("BUILDER_DEMO");

  return [
    {
      label: "Decision → accept",
      value: s.medianAcceptMs === null ? "No data" : s.medianAcceptMs.toFixed(0),
      unit: "ms",
      foot: `median, n = ${s.acceptedMs.length}`,
    },
    {
      label: "Decision → landed",
      value: s.medianLandingChunks === null ? "No data" : String(s.medianLandingChunks),
      unit: "chunks",
      foot: `median, n = ${s.landingChunks.length}. landed_by: active_prompt ${s.landedBy.active_prompt} | next_boundary ${s.landedBy.next_boundary} (inferred)`,
    },
    {
      label: "Within-trial cuts",
      value: trial.cuts ? String(trial.cuts.cuts) : "Not measured",
      foot: trial.cuts
        ? `${trial.cuts.tool}${trial.cuts.threshold !== null ? `, threshold ${trial.cuts.threshold}` : ""}`
        : "Cut detector output not committed for this trial",
    },
    {
      label: "Expectancy test at",
      value: evS ?? "None",
      unit: "s",
      foot: evS ? "from trial start" : "This trial ended before the expectancy test",
    },
    {
      label: "Expectancy before → after",
      value: before === null && after === null ? "No data" : `${before ?? "?"} → ${after ?? "?"}`,
      foot: builderDemo ? "BUILDER DEMO rating, not an outcome" : "self-rated likelihood of the feared outcome",
    },
    {
      label: "Max level",
      value: `L${s.maxLevel}`,
      unit: run.cap !== null ? `of ${run.cap}` : undefined,
      foot: `started at L${receipt.start.level}`,
    },
    {
      label: "Retreats",
      value: String(s.retreats),
      foot: s.retreatsByReason.length
        ? s.retreatsByReason.map(([reason, count]) => `${reason} ${count}`).join(", ")
        : "No step-backs in this trial",
    },
  ];
}

function rel(t: number, t0: number): string {
  return seconds(t - t0);
}

function inputsOf(d: ReceiptDecision): string {
  const parts: string[] = [d.inputs.arousal];
  if (d.inputs.suds !== null) parts.push(`SUDS ${d.inputs.suds}`);
  if (d.inputs.breath_bpm !== null) parts.push(`${d.inputs.breath_bpm.toFixed(1)} bpm`);
  return parts.join(", ");
}

function DecisionLog({ trial }: { trial: RunTrial }) {
  const { receipt } = trial;
  if (!receipt.decisions.length) {
    return <p className="p-note">The controller made no decisions in this trial.</p>;
  }
  return (
    <div className="p-table-wrap" tabIndex={0} role="region" aria-label="Decision log, scrolls sideways">
      <table className="p-table">
        <caption className="p-sr-only">
          Every controller decision in trial {trial.n}, with the inputs it saw and when the model took it up.
        </caption>
        <thead>
          <tr>
            <th scope="col">t (s)</th>
            <th scope="col">Chunk</th>
            <th scope="col">Kind</th>
            <th scope="col">Reason</th>
            <th scope="col">Level</th>
            <th scope="col">Inputs</th>
            <th scope="col">Prompt</th>
            <th scope="col">Accepted</th>
            <th scope="col">Landed</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {receipt.decisions.map((d, i) => (
            <tr key={i} data-kind={d.kind}>
              <td className="p-num">{rel(d.t, receipt.start.t)}</td>
              <td className="p-num">{d.chunk}</td>
              <td>{d.kind}</td>
              <td className="p-code">{d.reason}</td>
              <td className="p-num">
                L{d.level_before} → L{d.level_after}
              </td>
              <td>{inputsOf(d)}</td>
              <td className="p-prompt" title={d.prompt ?? undefined}>
                {d.prompt
                  ? d.prompt.length > PROMPT_PREVIEW
                    ? `${d.prompt.slice(0, PROMPT_PREVIEW).trimEnd()}…`
                    : d.prompt
                  : "None sent"}
              </td>
              <td className="p-num">{d.accepted_ms === null ? "" : `${d.accepted_ms} ms`}</td>
              <td className="p-num">
                {d.landed_chunk === null ? "" : `c${d.landed_chunk}`}
                {d.landed_by ? <small>{d.landed_by}</small> : null}
              </td>
              <td>{d.outcome ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptPanel({ run, trial }: { run: Run; trial: RunTrial }) {
  const file = trial.receiptFile ?? `${run.id}-trial-${trial.n}.receipt.json`;
  const { receipt } = trial;
  return (
    <div className="p-receipt">
      <dl>
        <div>
          <dt>Receipt SHA-256</dt>
          <dd className="p-hash">{trial.receiptSha256}</dd>
        </div>
        <div>
          <dt>Recording SHA-256</dt>
          <dd className="p-hash">{receipt.recording?.sha256 ?? "No recording in this receipt"}</dd>
        </div>
        <div>
          <dt>Pinned</dt>
          <dd>
            {receipt.model}, {receipt.sdk}, seed {receipt.seed}, ladder {receipt.ladder.source}{" "}
            <span className="p-hash">{receipt.ladder.sha256.slice(0, 12)}</span>
          </dd>
        </div>
        <div>
          <dt>Invariant violations</dt>
          <dd>
            {receipt.invariant_violations.length === 0
              ? "0"
              : receipt.invariant_violations.map((v) => `${v.id} at c${v.chunk}: ${v.detail}`).join("; ")}
          </dd>
        </div>
      </dl>
      <div className="p-receipt-actions">
        <a className="m-button" href={`/runs/${run.id}/receipt?trial=${trial.n}`} download>
          Download receipt
        </a>
        <p>The download is the canonical JSON, so its SHA-256 matches the hash above. Check it offline:</p>
        <pre className="p-command">
          <code>pnpm verify:receipt {file}</code>
        </pre>
      </div>
    </div>
  );
}

export default async function RunPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { run, failed } = await safeLoadRun(id);

  if (!run) {
    if (failed) {
      return (
        <RunEmpty
          title="This run couldn't be loaded"
          copy="The run store didn't answer. Reload in a moment, or open the proof campaign for committed runs."
        />
      );
    }
    if (isCanonicalPlaceholder(id)) {
      return (
        <RunEmpty
          title="No canonical run yet"
          copy="The canonical run is published once it has been recorded and checked. Until then, try it yourself or read the proof campaign."
        />
      );
    }
    return (
      <RunEmpty
        title="Run not found"
        copy="There's no run with this id. It may never have finished a trial, or the link is incomplete."
      />
    );
  }

  const requested = Number(Array.isArray(query.trial) ? query.trial[0] : query.trial);
  const trial = run.trials.find((t) => t.n === requested) ?? run.trials[0]!;
  const { receipt } = trial;

  return (
    <main className="m-container p-page">
      <header className="p-run-head">
        <div className="p-labels">
          <Eyebrow>Live run</Eyebrow>
          {receipt.labels.map((label) => (
            <span key={label} className="p-label" data-label={label}>
              {LABEL_TEXT[label]}
            </span>
          ))}
        </div>
        <h1>
          {run.fear}
          <span>, {run.context}</span>
        </h1>
        <p className="p-run-meta">
          {SIGNAL_TEXT[receipt.mode]}, {receipt.chunks.length} chunks. Run{" "}
          <span className="p-hash">{run.id}</span>
        </p>
        {run.note ? <p className="p-note">{run.note}</p> : null}
        {run.trials.length > 1 ? (
          <nav className="p-tabs" aria-label="Trials">
            {run.trials.map((t) => (
              <Link
                key={t.n}
                href={`/runs/${run.id}?trial=${t.n}`}
                aria-current={t.n === trial.n ? "page" : undefined}
                scroll={false}
              >
                Trial {t.n} of {run.trials.length}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="p-run-meta">Trial 1 of 1</p>
        )}
      </header>

      <Recording run={run} trial={trial} />

      <section className="p-block" aria-labelledby="timeline">
        <div className="p-block-head">
          <h2 id="timeline">Timeline</h2>
          <p>One time axis for body, ratings, level and decisions. Hover a mark for the reason code and prompt.</p>
        </div>
        <div className="p-lanes-panel">
          <div className="p-lanes-scroll">
            <Lanes receipt={receipt} />
          </div>
          <LanesLegend />
        </div>
      </section>

      <section className="p-block" aria-labelledby="metrics">
        <div className="p-block-head">
          <h2 id="metrics">Measured in this trial</h2>
          <p>Computed from the receipt. Numbers with small n are single-trial readings, not campaign results.</p>
        </div>
        <div className="p-metrics">
          {trialMetrics(run, trial).map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="p-block" aria-labelledby="log">
        <div className="p-block-head">
          <h2 id="log">Decision log</h2>
          <p>Each row is one controller tick that did something, with the rule that fired.</p>
        </div>
        <DecisionLog trial={trial} />
      </section>

      <section className="p-block" aria-labelledby="receipt">
        <div className="p-block-head">
          <h2 id="receipt">Receipt</h2>
          <p>Trial {trial.n} as recorded. Anyone can recompute the metrics above from this file.</p>
        </div>
        <ReceiptPanel run={run} trial={trial} />
      </section>
    </main>
  );
}
