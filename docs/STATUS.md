# Status

What works, what is measured, what failed and what is still open, as of 2026-10-02. Every number links to its artifact. Claims and thresholds are in [CLAIM_LEDGER](CLAIM_LEDGER.md), the experiments in [EVAL_CAMPAIGN](EVAL_CAMPAIGN.md).

## Works, live

- **Live loop on Orbis.** The controller reads breathing, distress ratings and step-closer choices every chunk and morphs one continuous scene. 30 live sessions ran on 2026-10-01: the four builder runs in `evidence/live/` and 26 campaign runs in `evidence/campaign/`, all with simulated input and labelled that way.
- **Receipts.** Every round writes a receipt with each decision, its reason code, acknowledgement time and landing chunk. `pnpm verify:receipt` checks one.
- **Curated and generated ladders.** Dogs and heights are hand-written. The other nine catalog fears are generated and pass lint. Free-text fears generate live.
- **"Your street" round.** A photo becomes the last round's opening frame (`lib/ladder/anchor.ts`).

## Measured

| Claim | Result | Status | Artifact |
|---|---|---|---|
| F-CTRL: controller matches an independent oracle | 100% of 4,646 ticks on 100 traces, 0 invariant violations | **pass** | `evidence/controller/agreement.json` |
| F-RESP: ceiling retreat lands within 2 chunks (median) | median 3, p90 3 chunks (n = 25) | **fail** | `evidence/live/latency.csv` |
| Safe place | decided at the tap, exit acknowledged in 0.8 s (median, n = 8) | measured, no claim attached | `evidence/live/latency.csv` |
| Step-closer requests | 117: 95 honored (median 1.0 s), 2 held by cooldown, 20 refused at the cap | measured | `evidence/live/refusals.csv` |
| E4 latency: morph vs restart-per-step | acknowledged in 1.84 s vs 5.8 s (medians, n = 105 and 55) | measured, no claim attached | `evidence/ablation/latency.csv` |
| Orbis timing (F8) | start to first frame 3.7 s, chunk period 1.84 s, first chunk 0 frames | measured | [SPONSOR_FINDINGS](SPONSOR_FINDINGS.md) |

Why F-RESP fails, and why the rule wasn't changed: Orbis doesn't report which prompt is active, so landing is inferred as one boundary after the first chunk that follows the acknowledgement. That may count one chunk too many. The rule was fixed before the run. A blind human marking visible onset on the recordings is the check that can settle it.

## Open

| Item | Why it's open | What closes it |
|---|---|---|
| F-CUT, no hard cuts in a trial | The histogram detector, calibrated on spliced same-scene clips, catches 7 of 10 splices but also flags Orbis's own lighting flicker and camera drift. 18 flagged pairs in product trials were all continuous footage when viewed by the builder. | A detector that separates same-scene cuts, or a blind rater on the 18 pairs |
| F-NEUTRAL, scene changes come from decisions | 4 no-decision control trials are recorded, none rated | A blind rater marking approach and retreat events |
| F-PERSIST, same subject throughout | Recordings exist, no blind rating yet | A blind rater |
| F-SIGNAL, F-HEALTHY | Need a real phone on a real chest | E1 and E8 with at least two people |
| F-TTF, F-BREADTH | Need generated-fear runs (E6) | 10 fears from one sentence each |
| Phone canonical run | `/runs/canonical` is a simulated-input run | One session with the phone sensor |

## Known limitations

- **The top dog steps fall short.** After the step-closer fix the dog walks closer at every level, but at L5 and L6 it often stops a few metres from the camera, and Orbis drew a pug for the "wiry terrier". See `evidence/live/ba018aa9-996d-40b5-975f-efb695ac43da/`. Two prompt rewordings didn't change it, and restating each level's full scene made it worse: the dog stayed out of frame until the top levels while the camera moved instead (2 of 2 restate runs inspected, [SPONSOR_FINDINGS](SPONSOR_FINDINGS.md) F4).
- **Connection drops.** Orbis dropped the WebRTC connection in 3 of 28 campaign and test runs (2 restart, 1 morph). The app ends the round, saves the receipt and recording, and offers a new take.
- **One live session at a time.** The slot is shared by everyone using `/try`.
- **Not a medical device.** Every number above is a mechanism proxy. Nothing here measures fear or benefit.

## Considered and declined

- **Heart rate.** The claim ledger rules it out: the signal is breathing from a phone accelerometer, and adding a second unvalidated sensor late would leave another claim pending.
- **Webcam lean-in and lean-back.** Interesting as a no-hardware signal, but unvalidated. Distress ratings (0 to 9) already run the controller without a phone.
- **Breath-paced audio.** Pacing breathing during exposure works as a safety behaviour, which inhibitory-learning practice (Craske et al. 2014, the basis of the clinical rules here) advises against during trials. The person keeps control through step back, pause and the safe place.

## Fixed on 2026-10-01 after live runs

- A step closer sent a camera-move prompt, so the level rose while the dog stayed put. It now sends the subject's own step.
- Recordings were lost when a round ended by End, by a dropped connection, or by ending right after rating.
- Ending while the next round was starting still started that round.
- The session page rendered different markup on the server and in the browser (a hydration error on every load); storage is now read after mount.
- When one round ended and the next started, the next run's first chunks could be appended to the finished round's receipt, which a late upload then re-saved. Found by `verify:receipt` on four safe-place runs (kept in `evidence/campaign/excluded/`); the finished receipt is now detached first.

## Added on 2026-10-02

- **Safe place.** One tap (or Esc) backs the subject out of the scene by the ladder's own exit line and pauses, while Orbis keeps rendering the calm, empty scene. It's a controller row (C8 in [DECISIONS](DECISIONS.md)) covered by the invariants and by the independent oracle, which still agrees on every tick (4,646 of 4,646, with safe places planted in 41 traces). Measured in 4 live runs with 2 safe places each (`pnpm campaign safe`, n = 8): decided at the tap, exit prompt acknowledged in a median of 0.8 s, 0 invariant violations, every resume clean. Visually, about 11 s later, of the 6 where the dog was on screen at the tap, it was gone in 1, walking away in 3 and still in place in 2 (builder viewing, not blind). Four earlier safe runs are excluded because a since-fixed bug polluted their receipts (`evidence/campaign/excluded/`). The controller stops escalating at once; the subject leaving is up to Orbis, the same gap as the top ladder steps. While resting, the caption says "You look settled" once breathing has been calm for about 7 s; it never resumes by itself.
