# Evaluation tools

Python tools for the proof campaign (PRD §5). They're kept apart from the app
so the numbers they produce don't depend on the code they score.

## Setup

```sh
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
```

All commands run from the repo root.

## Independence statement

`oracle_controller.py` was written only from the PRD: §4.4 (inputs, POLICY,
definitions, decision table rows 1–17, invariants), §4.5 (arousal classes and
SUDS overrides) and §5.1–5.3. Its author didn't read anything under `lib/` or
any `.ts`/`.tsx` file. `gen_traces.py` produces inputs only and shares no code
with the oracle or the TS controller. `cutdetect.py` knows nothing about which
condition a clip came from. Where the PRD leaves a choice open, the oracle
picks the most literal reading and says so below. Those choices get
reconciled with the TS controller by changing whichever side is wrong
against the PRD and recording the decision in GATES.md, never by copying TS
behaviour into the oracle.

## gen_traces.py (E2 inputs)

```sh
tools/.venv/bin/python tools/gen_traces.py --n 100 --seed 2026 --out evidence/controller/traces
```

Writes `trace_000.json` … `trace_099.json`. Same seed gives byte-identical
files. Each trace:

```json
{
  "schema": "unflinch.controller_trace.v1", "id": "trace_003", "seed": 2026,
  "config": { "cap": 4, "autoMode": true, "trialMax": 48, "startLevel": 1 },
  "chunkS": 1.833,
  "ticks": [
    { "chunkIndex": 0, "arousal": "LOW", "suds": { "value": 3, "ageS": 0.7 },
      "intent": null, "therapist": null, "generationComplete": false, "tags": [] }
  ]
}
```

60–100 ticks per trace. `arousal` is the already-classified §4.5 class.
`suds` is the latest-sample view: a new report resets `ageS` below one chunk,
then it grows by 1.833 s per tick. It's `null` before the first report and
during a sensor dropout. `tags` name the planted scenario and are for humans
only; controllers must ignore them.

Planted scenarios: OVERLOAD spikes of 3–9 chunks, breath holds that cross
into OVERLOAD briefly, dropouts (UNKNOWN with no SUDS), long LOW stretches
that drive autoMode up to the cap and through the expectancy test, SUDS 9/10
reports, SUDS ≤ 2 reports (some against a HIGH breath class), closer/back
intents, pause/resume pairs (some with intents arriving while paused), stray
resumes, therapist approach/retreat/vary/ev_now, end requests and
`generationComplete`.

## oracle_controller.py (E2 expected decisions)

```sh
tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle
```

Writes one file per trace into `evidence/controller/oracle/` with
`decisions: [{chunk, action, reason, level, inputs}]` and per-trace invariant
results, plus `evidence/controller/oracle_invariants.json` with totals and a
reason histogram. Exit code is non-zero if any invariant fails.

`action` is one of `none | up | selfApproach | down | ev | hold | vary |
pause | resume | end_trial | nudge`. `level` is the level after the decision.
The decision list stops at the tick that ends the trial.

Compare mode, once the TS controller CLI has written its outputs with the
same filenames (either `{ "decisions": [...] }` or a bare list, each entry
with at least `chunk`, `action`, `reason`, `level`):

```sh
tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces \
  --out evidence/controller/oracle --compare evidence/controller/ts
```

This writes `evidence/controller/agreement.json`:
`{traces, ticks, agree, agreement_pct, pass, threshold_pct, ts_invariant_violations, mismatches}`.
Agreement is per tick on `(action, reason)` over the union of chunks both
sides emitted, so a tick only one side produced counts as a mismatch.
`mismatches` holds the first 50. The same invariant checker also runs on the
TS output and its counts land in `ts_invariant_violations`. Exit code is
non-zero if agreement is below 99% or an oracle invariant fails.

The invariant checker re-derives everything from the trace inputs and the
decision list, so it isn't the simulator grading itself. It was
mutation-tested: dropping a ceiling retreat, an `up` during cooldown, a send
during LANDING, an ignored pause, a nudge that sends and an early body refire
are each caught. INV7 (prompt lint) is N/A here because traces carry no
prompt text. It's covered by the §4.6 lint.

## cutdetect.py (E4 continuity)

```sh
tools/.venv/bin/python tools/cutdetect.py recordings/trial.webm --out evidence/ablation/trial.cuts.json
tools/.venv/bin/python tools/cutdetect.py --calibrate known/restart_*.webm known/spliced_*.mp4
```

It compares HSV histograms (32×16×8 bins) of consecutive frames with
`cv2.HISTCMP_CORREL`, and a frame below the threshold counts as a cut. The
output is `{file, frames, fps, cuts: [{frame, t, corr}], threshold}`. `t`
comes from decode timestamps because MediaRecorder webm is variable-rate and
its reported fps can't be trusted.

Calibration takes known-cut clips (E4 restart baselines and spliced clips).
If `<clip>.cuts.json` holds a list of cut frame indices it's used as ground
truth. Otherwise each clip is assumed to hold `--cuts-per-clip` cuts (default
1) at its lowest-correlation frames. It prints the cut and non-cut
correlation ranges and a suggested threshold: the midpoint when the two
ranges are separable, otherwise the value with the fewest misclassifications.

Procedure: run calibration, set `FROZEN_THRESHOLD` in `cutdetect.py` to the
suggested value, commit it with the calibration output in
`evidence/ablation/`, and only then score E4 morph runs. Don't change the
constant after that. The shipped `0.5` is provisional until calibration
runs.

## campaign_report.py (E3, E4, E9 and the restate A/B)

```sh
pnpm campaign <experiment> <runs>            # live runs, see scripts/campaign.ts
pnpm campaign:export                         # receipts + events to evidence/campaign/, videos to .data/campaign/
tools/.venv/bin/python tools/campaign_report.py calibrate
tools/.venv/bin/python tools/campaign_report.py report
```

It reads only exported receipts, event logs and recordings, never app code.

`calibrate` builds the known-cut set for `cutdetect.py`: pairs of different
campaign recordings joined at a known frame (8 s each side, re-encoded at
18 fps), each with a `.cuts.json` sidecar holding the join frame. It writes
`evidence/ablation/calibration.json` with the suggested threshold. Restart
baseline clips are deliberately left out of calibration: the baseline hands
off the last frame, so whether a restart shows up as a hard cut is a result
to measure, not ground truth to tune on.

`report` scores every exported trial with the frozen threshold and writes
`evidence/ablation/cuts.csv` (per trial), `evidence/live/latency.csv` (per
sent decision: input to decision in ms, accept in ms, decision to landing in
chunks and how the landing is known), `evidence/live/neutral.csv` (E9 trials,
with empty rater columns for the blind rating) and
`evidence/campaign/summary.json`.

Input-to-decision time pairs each decision with the latest matching input
event before it: a simulated spike for CEILING_BODY, a SUDS of 9 or more for
CEILING_SUDS, a step-closer intent for PATIENT_CLOSER.

## Ambiguities

Every open item below is also marked `INTERPRETATION:` in
`oracle_controller.py`. Numbers in the text refer to decision-table rows.
Items marked "Resolved by Cn" now follow `docs/DECISIONS.md` (controller spec
clarifications C1–C7), and the matching code carries a `Cn` comment. The
oracle was updated from that document, not from the TS source.

Signal and SUDS

1. Fresh SUDS means `ageS ≤ sudsMaxAgeS` (30 s), inclusive.
2. Fresh SUDS ≤ 2 replaces the breath class with LOW, whatever it was,
   UNKNOWN and OVERLOAD included. So fresh SUDS ≤ 2 with OVERLOAD breath is
   not `ceilingActive`, and it clears NO_SIGNAL.
3. Fresh SUDS ≥ 9 leaves the breath class alone and sets `ceilingActive`
   directly.
4. Resolved by C7. A SUDS sample is a new report when its arrival chunk,
   `chunkIndex − ageS / chunkS` with `chunkS` from the trace, is later than
   the previous sample's arrival by more than 1e-6. A sample that only aged
   isn't new, and a null tick doesn't reset the previous arrival. The old
   "ageS dropped" rule missed a second report landing on the next tick with a
   larger `ageS`. Still an interpretation: `newSudsHigh` means the latest
   SUDS ≥ 9 report arrived on a chunk strictly greater than
   `lastCeilingChunk` (or there's been no ceiling yet). The INV4 obligation
   and its refire exemption use the same C7 arrivals.
5. When fresh SUDS ≥ 9 and OVERLOAD hold at once, row 5 reports
   `CEILING_SUDS`.
6. One SUDS 9 stays fresh for about 16 chunks, so it keeps `ceilingActive`
   on and can drive a retreat every 6 chunks (rows 5 and 7 together) until it
   goes stale. That's the literal reading. Flagging it because it can mean
   two or three retreats from a single report.

Counters

7. Resolved by C1. Every counter is a chunk-index distance from its event,
   and paused ticks count. Trial start is the first tick's chunk, so
   `trialChunks = chunk − firstChunk` and TRIAL_MAX fires at chunk 48 on these
   traces. `chunksAtLevel = chunk − chunk of the last level change` and
   `chunksSinceEv = chunk − chunk of the ev`.
8. Resolved by C2. `lowStreakChunks` counts consecutive effective-LOW ticks,
   this one included, and resets to 0 after any `up` or `selfApproach`. That
   gives one approach per stable-low window. The earlier literal reading,
   where `up` fired every 2 chunks until the cap, is gone.
9. Resolved by C3. `chunksSinceVary` counts from the last send of any kind
   (up, selfApproach, down, ev, vary). Trial start is the first tick's chunk.
10. `lastSendChunk` starts unset, so LANDING can't fire before the first
    decision send. The trial-start `state` prompt isn't a decision.
    `cooldownUntil` starts at 0 and `lastCeilingChunk` unset, which makes the
    row-5 refire clause true until the first ceiling retreat.

Sends and actions

11. Sends are `up`, `selfApproach`, `down`, `ev` and `vary` (VARIABILITY or
    THERAPIST_VARY sends a hold variant prompt, never at L0 per C4). These set `lastSendChunk`. Not sends:
    `none` (LANDING, IN_WINDOW, PAUSED), `hold` (COOLDOWN, CEILING_HOLD,
    NO_SIGNAL), `nudge`, `pause`, `resume` and `end_trial`.
12. Level deltas are `up` +1, `selfApproach` +1, `down` −1, `ev` 0 and
    `vary` 0.
13. `ev` sets `evDone` and records its chunk for row 13.
14. Row 9's "ask for SUDS" is a UI side effect. The decision is
    `hold`/NO_SIGNAL.
15. Row 16's "never repeat the last" variant is about prompt choice, which
    the oracle can't see. It's not modeled.

Intents and pause

16. There's one queued-intent slot and a newer `closer`/`back` replaces an
    older one. An intent is valid while `chunk − queuedAt < 6`, so it's gone
    on the 6th chunk after arrival. It's consumed only when its own row fires
    (6 for `back`, 11 for `closer`). When a higher row wins (LANDING,
    ceiling retreat, COOLDOWN, CEILING_HOLD, NO_SIGNAL and so on) it stays
    queued. A `back` at level 0 or a `closer` at the cap stays queued until
    it expires.
17. `pause` and `resume` act on the tick they arrive and are never queued. A
    `resume` while not paused is ignored.
18. While paused, every tick is `none`/`PAUSED` (an invented reason code)
    except a `resume`, which is `resume`/`RESUME` and does nothing else that
    tick. Resolved by C6: intents that arrive while paused are dropped,
    except `resume`. Still an interpretation: therapist commands that arrive
    while paused are dropped too. A `pause` while already paused is `PAUSED`. TRIAL_MAX and
    `generationComplete` are deferred to the first tick after the resume
    tick.
19. Patient `end` and therapist `end_trial` aren't in the table. They end the
    trial at row-3 priority with invented codes `PATIENT_END` and
    `THERAPIST_END`, checked after TRIAL_MAX/`generationComplete`.
20. `generationComplete` is read per tick. The generator keeps it true from
    the first tick it's set.
21. `end_trial` (TRIAL_MAX, EV_HELD, PATIENT_END, THERAPIST_END) is the last
    decision. Later ticks produce nothing.

Therapist

22. Therapist commands aren't queued. One that arrives on a tick where a
    higher row wins, LANDING included, is dropped.
23. In row 6 a queued patient `back` wins over therapist `retreat` on the
    same tick. Row 6 retreats don't set `cooldownUntil` or `lastCeilingChunk`
    (the table only gives row 5 those effects), and they can fire during a
    cooldown because row 6 comes before row 7.
24. Therapist `ev_now` isn't in the table. It triggers row 12 below the cap
    if `evDone` is false. Resolved by C5 in part: it needs `level > 0`.
25. Therapist `vary` isn't in the table. It triggers row 16 whatever the
    value of `chunksSinceVary`. Resolved by C4 and C5 in part: it needs
    `level > 0`, like automatic VARIABILITY (C4), and it reports
    `THERAPIST_VARY` (C5). Still an interpretation: when a therapist `vary`
    lands on a tick where an automatic variant is also due, the decision is
    `THERAPIST_VARY`.

Rows 12–15 and the start level

26. STALL_NUDGE fires at the first tick where row 15 is reached with
    `chunksAtLevel ≥ 10`, at most once per level number per trial, only below
    the cap, and it never sends.
27. Trials start at `config.startLevel`, default L1, matching the receipt
    example and the S0→L1 `enter` transition.

Invariant checks

28. INV4 "first eligible tick": a new SUDS ≥ 9 arrival, or an OVERLOAD onset
    outside the 6-chunk refire window, creates an obligation. Paused ticks,
    pause/resume ticks and LANDING ticks aren't eligible. The obligation is
    dropped if the ceiling clears, the level is 0 or the trial ends. The
    first eligible tick must be a `down` with a CEILING_* reason. The second
    half of INV4 requires automatic retreats to be ≥ 6 chunks apart unless a
    new SUDS ≥ 9 arrived in between.
29. INV5: a `pause` intent on an unpaused tick must produce `pause` on that
    same tick, and nothing but `none`/`resume` may happen while paused.
30. INV6 is checked as "every send has a known reason code and an `inputs`
    snapshot".
31. INV7 is N/A for controller traces.

Safe place (C8, added 2026-10-02)

32. A `safe` intent is queued like `closer` and `back`, so it survives a
    LANDING tick. It is checked right after LANDING and before every retreat
    row. At level > 0 it sends (`safe`, `PATIENT_SAFE`), the level becomes 0
    and the controller pauses. At level 0 it is `pause` with the same reason.
    INV2 allows the drop to 0 for `safe` only, INV4 treats it as discharging
    a pending retreat, and INV5 counts it as pausing. Taken from the C8 row in
    `docs/DECISIONS.md`, not from the TypeScript.
