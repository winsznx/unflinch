import Link from "next/link";

import { Eyebrow } from "@/components/marketing/primitives";
import { store } from "@/lib/db/store";
import { CLAIMS, formatClaimValue, type Claim, type ClaimStatus } from "@/lib/evidence/claims";
import type { ReceiptLabel } from "@/lib/orbis/receipts";
import { LABEL_TEXT } from "@/lib/proof/metrics";
import { listRepoRunIds, loadEvidenceHashes, loadRun, type EvidenceHashes } from "@/lib/proof/runs";
import campaign from "@/evidence/campaign/summary.json";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import "../proof.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Proof campaign",
  description:
    "Pre-registered claims, thresholds and results for Unflinch, with raw evidence, failures and withdrawn claims kept in view.",
  path: "/proof",
  og: "kind=proof",
});

const RECENT_LIMIT = 10;

const STATUS_TEXT: Record<ClaimStatus, string> = {
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  withdrawn: "Withdrawn",
};

const FOOL_US = [
  {
    risk: "Picking a lucky seed",
    guard: "The seed search is published, rejected seeds included.",
  },
  {
    risk: "Simulated input isn't anxiety",
    guard: "Runs driven by scripted breath are labelled SIMULATED INPUT and only test the mechanism.",
  },
  {
    risk: "The builder isn't phobic",
    guard: "Builder ratings carry BUILDER DEMO and are never shown as outcomes.",
  },
  {
    risk: "A prompt change isn't a visible change",
    guard: "Latency is reported from the model's active prompt and from a person marking when the change shows on screen.",
  },
  {
    risk: "Tuning the cut threshold until it passes",
    guard: "The threshold is set on known cuts and frozen before any morph run is scored.",
  },
  {
    risk: "A weak baseline",
    guard: "The restart baseline gets the same seed, a last-frame handoff and the best absolute prompt.",
  },
  {
    risk: "The service drifts over time",
    guard: "Every receipt keeps timestamps and session ids, and conditions are interleaved.",
  },
  {
    risk: "The scene moves on its own",
    guard: "A no-decision control run measures how often the subject wanders without being told to.",
  },
  {
    risk: "Easing off rewards panic",
    guard: "Automatic retreat is rate limited, stepping back stays the person's choice, and every trial still ends on an expectancy test.",
  },
] as const;

const INDEPENDENCE = [
  "The controller oracle is Python written from the PRD decision table. Its author didn't read the TypeScript source.",
  "Test traces come from a separate generator that shares no code with the controller or the oracle.",
  "The cut detector threshold is calibrated on known cuts and frozen before scoring.",
  "Breathing accuracy is checked against an external on-screen pacer, not the estimator.",
  "Subject persistence and fidelity are rated blind, in random order, by someone who didn't build Unflinch.",
  "Response latency is reported twice: as the model reports it, and as a person annotates the visible change.",
] as const;

const REPRODUCE = [
  { what: "Controller and invariant tests", cmd: "pnpm test" },
  { what: "Run the TS controller over the shared traces", cmd: "pnpm controller:run" },
  {
    what: "Compare against the independent Python oracle",
    cmd: "tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle --compare evidence/controller/ts",
  },
  { what: "Check a receipt: hash, metrics, ordering, lint", cmd: "pnpm verify:receipt <file>" },
  { what: "Count hard cuts in a recording", cmd: "tools/.venv/bin/python tools/cutdetect.py <webm>" },
] as const;

const LIMITATIONS = [
  `${SITE.disclaimer} Unflinch is a practice tool and makes no treatment claims.`,
  "Breathing rate is a proxy for arousal. It is not a measure of fear.",
  "There is one Orbis slot, so one live session runs at a time.",
  "Social fears, needles and blood, vomit, faces and trauma cues are excluded.",
  "Ratings from the builder are labelled BUILDER DEMO. They describe a demo, not an outcome.",
] as const;

type RecentRun = {
  id: string;
  fear: string;
  trials: number;
  labels: ReceiptLabel[];
  source: "repo" | "store";
  when: string | null;
};

async function recentRuns(): Promise<{ runs: RecentRun[]; storeFailed: boolean }> {
  const runs = new Map<string, RecentRun>();

  for (const id of await listRepoRunIds()) {
    const run = await loadRun(id).catch((error: unknown) => {
      console.error(`[proof] committed run ${id} is unreadable:`, error);
      return null;
    });
    if (!run) continue;
    runs.set(id, {
      id,
      fear: run.fear,
      trials: run.trials.length,
      labels: [...new Set(run.trials.flatMap((t) => t.receipt.labels))],
      source: "repo",
      when: null,
    });
  }

  let storeFailed = false;
  try {
    for (const row of await store().listRecentTrials(RECENT_LIMIT)) {
      if (!row.receipt) continue;
      // Only judge runs (simulated input) and builder demos are public. A real person's session is never listed.
      const publicRun = row.receipt.labels.some((l) => l === "SIMULATED_INPUT" || l === "BUILDER_DEMO");
      if (!publicRun) continue;
      const existing = runs.get(row.session_id);
      if (existing) {
        if (existing.source === "store") {
          existing.trials += 1;
          existing.labels = [...new Set([...existing.labels, ...row.receipt.labels])];
        }
        continue;
      }
      runs.set(row.session_id, {
        id: row.session_id,
        fear: row.receipt.ladder.fearId,
        trials: 1,
        labels: row.receipt.labels,
        source: "store",
        when: row.created_at,
      });
    }
  } catch (error) {
    console.error("[proof] listing recent trials failed:", error);
    storeFailed = true;
  }

  return { runs: [...runs.values()].slice(0, RECENT_LIMIT), storeFailed };
}

function ArtifactCell({ claim, hashes }: { claim: Claim; hashes: EvidenceHashes | null }) {
  const hash = hashes?.files[claim.artifact]?.sha256;
  return (
    <>
      <a href={`${SITE.repo}/tree/main/${claim.artifact}`} target="_blank" rel="noreferrer" className="p-link">
        {claim.artifact}
      </a>
      {hash ? (
        <small className="p-hash" title={`SHA-256 ${hash}`}>
          sha256 {hash.slice(0, 12)}
        </small>
      ) : null}
    </>
  );
}

function ClaimsTable({ hashes }: { hashes: EvidenceHashes | null }) {
  return (
    <div className="p-table-wrap" tabIndex={0} role="region" aria-label="Claims, scrolls sideways">
      <table className="p-table p-claims">
        <caption className="p-sr-only">
          Every pre-registered claim with its metric, threshold, current result, sample size, status and raw
          evidence.
        </caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Claim</th>
            <th scope="col">Metric</th>
            <th scope="col">Threshold</th>
            <th scope="col">Result</th>
            <th scope="col">n</th>
            <th scope="col">Status</th>
            <th scope="col">Artifact</th>
          </tr>
        </thead>
        <tbody>
          {CLAIMS.map((claim) => (
            <tr key={claim.id}>
              <th scope="row" className="p-code">
                {claim.id}
              </th>
              <td>{claim.label}</td>
              <td className="p-secondary">{claim.metric}</td>
              <td>{claim.threshold}</td>
              <td className={claim.status === "pending" ? "p-secondary" : "p-strong"}>{formatClaimValue(claim)}</td>
              <td className="p-num">{claim.n}</td>
              <td>
                <span className="p-status" data-status={claim.status}>
                  {STATUS_TEXT[claim.status]}
                </span>
              </td>
              <td>
                <ArtifactCell claim={claim} hashes={hashes} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProofPage() {
  const [{ runs, storeFailed }, hashes] = await Promise.all([recentRuns(), loadEvidenceHashes()]);
  const hashedFiles = hashes ? Object.keys(hashes.files).length : 0;

  return (
    <main className="m-container p-page">
      <header className="p-proof-head">
        <Eyebrow>Proof campaign</Eyebrow>
        <div className="m-section-heading">
          <div>
            <h1 className="p-display">Claims, thresholds, results.</h1>
          </div>
          <p>
            Thresholds were set before any run and don&rsquo;t move after results. Failures and withdrawn
            claims stay on this page.
          </p>
        </div>
      </header>

      <ClaimsTable hashes={hashes} />
      <p className="p-note">
        {hashes ? (
          <>
            {hashedFiles} evidence files are listed with their SHA-256 in{" "}
            <a className="p-link" href={`${SITE.repo}/blob/main/evidence/hashes.json`} target="_blank" rel="noreferrer">
              evidence/hashes.json
            </a>
            . Rebuild it with <code>pnpm build:evidence</code> and diff.
          </>
        ) : (
          <>
            Evidence hashes haven&rsquo;t been built yet. Run <code>pnpm build:evidence</code> to write
            evidence/hashes.json.
          </>
        )}
      </p>

      <CampaignFindings />

      <section className="p-block" aria-labelledby="fool">
        <div className="p-block-head">
          <h2 id="fool">How this could fool us</h2>
          <p>The ways these numbers could look better than they are, and what each run does about it.</p>
        </div>
        <ul className="p-risks">
          {FOOL_US.map((item) => (
            <li key={item.risk}>
              <strong>{item.risk}</strong>
              <span>{item.guard}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="p-block" aria-labelledby="independence">
        <div className="p-block-head">
          <h2 id="independence">Independence</h2>
          <p>Nothing that scores the system shares code or judgement with the system it scores.</p>
        </div>
        <ul className="p-bullets">
          {INDEPENDENCE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="p-block" aria-labelledby="reproduce">
        <div className="p-block-head">
          <h2 id="reproduce">Reproduce</h2>
          <p>
            All offline, no keys. Python tools need{" "}
            <code>python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt</code> first.
          </p>
        </div>
        <ol className="p-commands">
          {REPRODUCE.map((step) => (
            <li key={step.cmd}>
              <span>{step.what}</span>
              <pre className="p-command">
                <code>{step.cmd}</code>
              </pre>
            </li>
          ))}
        </ol>
      </section>

      <section className="p-block" aria-labelledby="recent">
        <div className="p-block-head">
          <h2 id="recent">Recent runs</h2>
          <p>Committed runs from evidence/live and the latest stored trials. Each links to its timeline and receipt.</p>
        </div>
        {runs.length ? (
          <ul className="p-runs">
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`}>
                  <strong>{run.fear}</strong>
                  <span className="p-hash">{run.id.length > 18 ? `${run.id.slice(0, 8)}…` : run.id}</span>
                  <span>
                    {run.trials} trial{run.trials === 1 ? "" : "s"}
                    {run.source === "repo" ? ", committed" : ""}
                    {run.when ? `, ${run.when.slice(0, 10)}` : ""}
                  </span>
                  <span className="p-labels">
                    {run.labels.map((label) => (
                      <span key={label} className="p-label" data-label={label}>
                        {LABEL_TEXT[label]}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-empty-panel">
            <p>No runs yet.</p>
            <small>
              Live runs appear here once a trial finishes with a receipt.{" "}
              <Link className="p-link" href="/try">
                Try one yourself
              </Link>
              .
            </small>
          </div>
        )}
        {storeFailed ? <p className="p-note">Stored runs couldn&rsquo;t be loaded right now. Committed runs are still listed.</p> : null}
      </section>

      <section className="p-block" aria-labelledby="limits">
        <div className="p-block-head">
          <h2 id="limits">Limitations</h2>
          <p>What these results don&rsquo;t show.</p>
        </div>
        <ul className="p-bullets">
          {LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? "n/a" : `${(ms / 1000).toFixed(1)} s`);

/** Live campaign results that carry no pre-set claim, read straight from evidence/campaign/summary.json. */
function CampaignFindings() {
  const requests = campaign.approach_requests;
  const safe = campaign.safe_place;
  const morph = campaign.accept_ms.morph;
  const restart = campaign.accept_ms.restart;
  const findings = [
    {
      title: "Live morph vs restarting each step",
      detail: `A step is acknowledged in ${seconds(morph)} as a live morph and ${seconds(restart)} as a restart from the last frame (medians).`,
    },
    {
      title: "Ceiling retreats",
      detail: `${campaign.ceiling_retreats_morph.n} retreats landed a median of ${campaign.ceiling_retreats_morph.median_landed_chunks} chunks after the decision. That misses the F-RESP target of 2, shown above.`,
    },
    {
      title: "Safe place",
      detail: `${safe.n} safe places: decided ${(safe.median_input_to_decision_ms ?? 0) < 100 ? "immediately on the tap" : `${seconds(safe.median_input_to_decision_ms)} after the tap`}, exit prompt acknowledged ${seconds(safe.median_accepted_ms)} later (medians). About 11 s later, of the 6 where the dog was on screen at the tap, it was gone in 1, walking away in 3 and still in place in 2 (builder viewing, not blind). The controller stops escalating at once; the subject leaving is up to Orbis.`,
    },
    {
      title: "When the controller said wait or no",
      detail: `${requests.n} step-closer requests: ${requests.honored} honored (median ${seconds(requests.median_honor_delay_ms)}), ${requests.deferred} held back by a safety rule until it cleared, ${Object.entries(requests.refused_by_reason).map(([reason, n]) => `${n} refused (${reason.replace("_", " ").toLowerCase()})`).join(", ") || "none refused"}.`,
    },
    {
      title: "Restating the scene",
      detail: "Sending each level's full scene instead of only the change kept the dog out of the picture until the top levels in both runs inspected. Unflinch sends changes only.",
    },
  ];
  return (
    <section className="p-block" aria-labelledby="campaign">
      <div className="p-block-head">
        <h2 id="campaign">Live campaign, 2026-10-01</h2>
        <p>
          Runs on Orbis with simulated input, conditions interleaved. Raw data:{" "}
          <a className="p-link" href={`${SITE.repo}/tree/main/evidence/campaign`} target="_blank" rel="noreferrer">
            evidence/campaign
          </a>
          .
        </p>
      </div>
      <ul className="p-risks">
        {findings.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

