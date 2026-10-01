# Thesis

Condensed from PRD sections 5.0 and 5.1. Current status of each falsifier is in [CLAIM_LEDGER](CLAIM_LEDGER.md). How each is measured is in [EVAL_CAMPAIGN](EVAL_CAMPAIGN.md).

## Native unit of value

The unit is a titrated trial: one continuous exposure that reaches the person's tolerated level, ends on an expectancy test, and has the prediction re-rated.

Only proxies can be measured during the event: time to first scene, response latency, cut count, subject persistence and trials completed per session. Public claims stay at that level.

The link from proxy to value:

1. Discomfort drives exposure drop-out. A stimulus that eases off at overwhelm and presses on when the person is under-engaged targets that.
2. Inhibitory learning puts the active ingredient in expectancy violation (Craske et al. 2014), and every trial ends on one.
3. Continuity matters because a cut breaks the graded approach the person just made. This is an inference.

The untested assumption is that completing titrated trials predicts approach behavior later. A behavioral approach test before and after, in a therapist pilot, would test it. No such test has been run.

## Thesis

Under the same ladder and the same input script, Orbis per-chunk morphing lets a deterministic controller change the feared stimulus within about 2 chunks of an input, with no cuts inside a trial. Re-rendering per step is the strongest baseline from inside the sponsor's own tooling, and it cannot do that. The reason is that morphing keeps the subject in the model's memory across state transitions, while a restart pays warm-up and a hard cut.

## Pre-registered falsifiers

| ID | Claim | Metric | Pass | If it fails |
|---|---|---|---|---|
| F-RESP | Moves with you | Decision to first chunk with a changed `active_prompt` | median 2 chunks or less, p90 3 or less, n 20 or more ceiling events | Withdraw "every 2 s" and claim the measured number. If the median is above 4, drop the body loop and offer therapist-paced live exposure |
| F-CUT | One continuous take | Within-trial hard cuts | 0 in 15 or more live trials | Withdraw "never a cut" and report the rate |
| F-PERSIST | Same dog throughout | Blind rater: same subject across a sequence | 80% of sequences or more | Shorten ladders and anchor each trial with `set_image` |
| F-BREADTH | Any fear from a sentence | Blind rater: 5 of 7 levels match the description | 7 of 10 fears or more | Restrict the catalog to passing fears and claim the exact count |
| F-TTF | Sentence to live scene | Intake submit to first real frame | median 60 s or less | Claim the measured time |
| F-SIGNAL | Phone tracks breathing | Paced-breath mean absolute error | 2.0 bpm or less | Show the trace but drop it from decisions (ratings only) and withdraw the body claim |
| F-CTRL | Controller is correct | Oracle agreement and invariants | 99% or more and 100% invariants held on 100 traces | No live runs until fixed |
| F-HEALTHY | It does not fire blindly | Automatic retreats during calm baseline breathing | 1 or fewer per 10 min across 3 trials | Raise the overload thresholds. If it still fails, use a ratings-only ceiling |
| F-NEUTRAL | Changes come from decisions, not drift | Approach or retreat-like events within 2 chunks after a decision, against the per-chunk spontaneous rate in runs that send nothing, blind-rated | decision-linked rate 3 times the spontaneous rate or more | Withdraw "moves with you" and report both rates |

The thresholds do not move after results are seen. A failed falsifier is published with its raw data.

## What a hundred runs would look like

The design is 100 controller traces (free, done) plus about 40 live trials across the latency, continuity, breadth, safety and control experiments. Each live trial adds a latency, cut and persistence row to `/proof`. None is a replay of the same demo. The live count scales toward 100 if more Orbis credit becomes available.
