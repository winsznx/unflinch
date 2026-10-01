# Claim ledger

Every public claim about Unflinch, with the threshold fixed before any run, the artifact that holds the evidence and its current status. The source of truth is [`evidence/manifest.json`](../evidence/manifest.json). `/proof`, the landing page and the Open Graph proof card all read it, so a status changes there and nowhere else.

Statuses are `pending`, `pass`, `fail` and `withdrawn`. Thresholds do not move after results arrive. A failed or withdrawn claim stays in this table.

## Claims

| ID | Claim | Metric | Threshold | Artifact | Status | Result (n) |
|---|---|---|---|---|---|---|
| F-TTF | Sentence to live scene | Median seconds from intake submit to first real frame | median 60 s or less | `evidence/breadth/ttf.csv` | pending | none |
| F-RESP | Eases off after overwhelm | Decision to changed prompt, in chunks | median 2 or less, p90 3 or less, n 20 or more | `evidence/live/latency.csv` | pending | none |
| F-CUT | Within-trial cuts | Hard cuts inside a trial | 0 in 15 or more live trials | `evidence/ablation/cuts.csv` | pending | none |
| F-PERSIST | Same subject throughout | Blind rater, same subject across a sequence | 80% of sequences or more | `evidence/live/persistence.csv` | pending | none |
| F-BREADTH | Any fear from a sentence | Fears with 5 of 7 levels matching the description | 7 of 10 fears or more | `evidence/breadth/` | pending | none |
| F-SIGNAL | Phone tracks breathing | Paced-breath mean absolute error, bpm | 2.0 bpm or less | `evidence/breath/accuracy.csv` | pending | none |
| F-CTRL | Controller is correct | Oracle agreement and invariant violations on 100 traces | 99% or more and 0 violations | `evidence/controller/agreement.json` | pass | 100% agreement, 0 violations (n = 100 traces, 4,573 ticks) |
| F-HEALTHY | Does not fire blindly | Automatic retreats per 10 min of calm breathing | 1 or fewer | `evidence/live/healthy.json` | pending | none |
| F-NEUTRAL | Changes come from decisions | Decision-linked change rate over the spontaneous rate | 3 times or more | `evidence/live/neutral.csv` | pending | none |

Two further rows from the design spec carry no measurement:

| Claim | Basis | Status |
|---|---|---|
| Clinical rules come from inhibitory learning | Craske et al. 2014 | cited |
| Any efficacy or anxiety reduction | none | never claimed |

## What the one pass means

F-CTRL says the TypeScript controller agrees tick for tick with a separate Python implementation of the decision table on 100 generated traces, and that neither implementation breaks invariants INV1 to INV6 and INV8 on them. INV7 (prompt lint) is not applicable to traces because they carry no prompt text.

It does not say the controller is clinically right, and it says nothing about Orbis. Two disclosures:

- The oracle was written from the PRD table without reading the TypeScript. The first comparison agreed on 52.7% of ticks. Each first divergence was a place the PRD left open, and the answers were recorded as C1 to C7 in [DECISIONS](DECISIONS.md). The oracle was then updated from that document, not from the TypeScript source. G2 passed on the fourth comparison.
- The traces come from a separate generator and are reproducible from seed 2026. See [GATES](GATES.md) for the log and the commands.

## We never claim

- That Unflinch "treats" or "cures" anything.
- That it "reduces anxiety".
- That it is "clinically validated".
- That it is "safe for everyone".
- That it "uses heart rate". The signal is breathing rate from a phone accelerometer.
- Builder ratings as patient outcomes. Runs recorded by the builder carry the `BUILDER_DEMO` label, and keyboard-driven runs carry `SIMULATED_INPUT`.

Public claims stay at the level of proxies that can be measured in this event: time to first scene, response time from input to changed prompt, cut count against a baseline, subject persistence and trials per session. The link from those proxies to benefit is an untested assumption, described in [THESIS](THESIS.md).

## Keeping it in sync

When a claim is measured, update `evidence/manifest.json` (status, value, n), commit the artifact, run `pnpm build:evidence` and update this table in the same commit. The README, the video, the submission form and `/proof` must quote the same numbers.
