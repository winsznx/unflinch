# Evaluation campaign

Ten experiments, E0 to E9, each tied to a falsifier in [THESIS](THESIS.md). E2 is done. E0, E3, E4 and E9 ran live on 2026-10-01 (26 runs, `evidence/campaign/`); their results and what is still missing are below. E1, E5 to E8 need a real phone or a blind rater. Status per claim is in [CLAIM_LEDGER](CLAIM_LEDGER.md).

| ID | Question | Status |
|---|---|---|
| E0 | What does Orbis actually do (docs F1 to F10, timing, drift)? | partly measured: timing, frames, `active_prompt`, restate A/B mechanics ([SPONSOR_FINDINGS](SPONSOR_FINDINGS.md)). Drift onset and seed hunt not run |
| E1 | How accurate is the phone's breathing estimate? | pending |
| E2 | Does the controller match an independent oracle? | done, pass |
| E3 | How fast does the scene respond to a decision? | model side measured: F-RESP fails (median 3 chunks, n = 25). Human-marked onset not done |
| E4 | Does morphing avoid the cuts that restarting causes? | latency measured (1.84 s vs 5.8 s). Cuts inconclusive: the detector can't separate same-scene cuts from Orbis's own changes |
| E5 | Does the same subject persist? | pending |
| E6 | Does a one-sentence fear produce a usable ladder? | pending |
| E7 | Do the safety rails hold live? | pending |
| E8 | Does it stay quiet on calm breathing? | pending |
| E9 | Does the scene move on its own without decisions? | 4 control trials recorded, blind rating not done |

## How each is run

| ID | Design | Run today with | Output |
|---|---|---|---|
| E0 | Connect to ready, start to first frame, reset plus start to first frame, chunk period, drift onset over 3 runs of 180 s, checks of F1 to F10 in [SPONSOR_FINDINGS](SPONSOR_FINDINGS.md), restate-versus-delta A/B (5 runs each, rated blind), 8-seed hunt of 60 s on the dog park scene | Manual. The `/lab/orbis` playground (dev only) and receipts from `/try`. No script exists | `evidence/g1/*.json` and the Measured column of SPONSOR_FINDINGS |
| E1 | Paced breathing at 6, 10, 15 and 20 bpm for 60 s, in two placements (seated chest, reclined chest), at least 2 people | `/lab/breath` on a phone. It shows an on-screen pacer, runs the same `BreathEstimator` as production and exports a CSV with columns `person,placement,target_bpm,measured_bpm,abs_error,median_conf,n_samples,started_at`. The page returns 404 in production builds, so serve it from `pnpm dev` through an HTTPS tunnel (iOS needs HTTPS for motion access). No script draws the Bland-Altman plot | `evidence/breath/accuracy.csv` and a plot |
| E2 | 100 generated traces with planted spikes, holds, dropouts, SUDS reports and intents. The TS controller and a separate Python oracle each decide every tick | `tools/gen_traces.py`, `pnpm controller:run`, `tools/oracle_controller.py --compare` (commands in [SETUP](SETUP.md)) | `evidence/controller/agreement.json` |
| E3 | Seed-locked dog ladder, scripted spikes, at least 20 ceiling events across at least 5 trials. Log input to decision and decision to landing separately. A blind human marks the visible retreat onset on 20 clips | A `/try` session with the `S` key and `9` rating produces receipts. Each decision stores `accepted_ms`, `landed_chunk` and `landed_by`, and each chunk stores `active_prompt`. `pnpm verify:receipt` prints the median accept time and landing chunks per receipt. `pnpm campaign e3` runs it; `tools/campaign_report.py report` writes the table. No annotation tool for the human-marked onset yet | `evidence/live/latency.csv` |
| E4 | 10 live-morph trials against 5 restart-per-step trials on the same ladder and input script. The baseline uses a last-frame handoff and an absolute prompt | `tools/cutdetect.py` counts hard cuts in a recording (HSV histogram correlation, threshold provisional at 0.5 until calibrated on known cuts, then frozen before scoring). `pnpm campaign morph` and `pnpm campaign restart` run both conditions with the same input script. The threshold is frozen at 0.8171 after calibration on spliced clips (`evidence/ablation/calibration.json`) | `evidence/ablation/cuts.csv`, `evidence/ablation/latency.csv` |
| E5 | A blind rater scores E3 and E4 sequences for subject persistence | Recordings from E3 and E4. No rating form exists | `evidence/live/persistence.csv` |
| E6 | 10 fears from one sentence each, generated ladder, one trial each, with time to first frame and a blind fidelity rating | `/start` with a Gemini key. `timing.intake_to_first_frame_ms` in the receipt gives the first number | `evidence/breadth/*.json`, `evidence/breadth/ttf.csv` |
| E7 | Sensor unplugged mid-trial (expect a NO_SIGNAL hold), SUDS 9 (expect a retreat at the next eligible tick), Pause (expect paused after the next chunk), lint on every generated prompt | A live session with the phone. The same rules are unit-tested offline in `tests/controller.test.ts` and held by the oracle invariants. The live check is separate | `evidence/live/safety.json` |
| E8 | 3 trials of calm baseline breathing on a real phone, no SUDS 9, no intents | `/start` in phone mode. Count decisions with reason `CEILING_BODY` per 10 minutes | `evidence/live/healthy.json` |
| E9 | 5 seed-locked runs of the dog ladder with no decisions sent. A blind rater marks approach or retreat-like events | `pnpm campaign nosend`: the subject enters, then the controller decides every tick and sends nothing (`outcome: not_sent` in the receipt). `evidence/live/neutral.csv` has empty rater columns | `evidence/live/neutral.csv` |

Common to all live experiments: label simulated input and builder runs, commit the receipts under `evidence/live/<run-id>/`, run `pnpm verify:receipt` on each, then `pnpm build:evidence` and update `evidence/manifest.json`.

## Evaluation independence

- The oracle was written from the PRD decision table, policy constants and invariants without reading the TypeScript. Its ambiguity list is in `tools/README.md`.
- The trace generator shares no code with the controller or the oracle.
- The cut threshold is calibrated on known cuts (restart baselines and spliced clips) and frozen before any morph run is scored.
- Breathing ground truth is the on-screen pacer.
- Persistence and fidelity ratings come from someone who did not build Unflinch, blind to condition, in random order.
- Latency is reported as the model reports it (`active_prompt`) and as a human marks the visible change.

## How this could fool us

| Risk | Guard |
|---|---|
| Seed cherry-picking | Publish the seed hunt, rejected seeds included |
| Simulated input is not anxiety | Labelled `SIMULATED_INPUT`. E3 measures the mechanism only |
| The builder is not phobic | Demo ratings carry `BUILDER_DEMO` and are never presented as outcomes |
| A changed `active_prompt` is not a visible change | Human-marked onset alongside |
| Cut threshold tuned to pass | Calibrated on independent known cuts and frozen first |
| Weak baseline | The restart baseline gets the same seed, last-frame handoff and best absolute prompt |
| Service drift over time | Timestamps and session ids recorded, conditions interleaved |
| Orbis moves on its own | E9 measures that base rate |
| The ceiling rewards panic | Automatic retreat is rate-limited, the person owns step back and pause, and trials end on an expectancy test |
