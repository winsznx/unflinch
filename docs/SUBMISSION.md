# Submission

Draft for the Visko Orbis Online Challenge form. The form needs Google sign-in, so its real fields are not known yet. Paste them under "Form fields" once the form is open. Numbers stay pending until measured, and every line here must match [CLAIM_LEDGER](CLAIM_LEDGER.md) when the form is sent.

## Entry

| Field | Value |
|---|---|
| Name | Unflinch |
| One-liner | Exposure practice that moves at the speed of your nervous system. |
| License | MIT |
| Built with | Visko Orbis through Reactor, Next.js, Supabase, Gemini, Vercel (deploy target, not deployed yet) |
| Team | Solo, Timothy Popoola (winsznx) |

## What it is

Specific phobias are common, and graded exposure is the best-supported treatment, but the feared thing has to be present at the right intensity. Therapists improvise with screen-shared videos that cannot wait, press on or back off. Unflinch generates a person's fear as one live scene on Orbis. A deterministic controller reads breathing from a phone on the chest, distress ratings and the person's own step-closer choices on every chunk, and changes the scene with one single-action prompt at most every two chunks. Each trial ends by staging a harmless version of the dreaded outcome, then asks the person to re-rate it. Dogs and heights have hand-written ladders and other fears are generated and linted. It is a practice tool for clients and therapists, not a medical device. Controller correctness is measured: 100% agreement with an independent oracle on 100 traces. Latency, cut count and persistence are pending live runs.

## How Orbis is used

- Per-chunk morph as the titration step: one `set_prompt` per controller decision, never more than one per two chunks, and no restart inside a trial.
- Persistent subject across approach and retreat: one subject description, transitions that carry only the change.
- `set_image` handoff between trials: the last frame of a trial starts the next trial of the same context.
- Seed-locked reproducibility: one seed, sent before every trial and stored in every receipt.

## Live, recorded and simulated

| Surface | What it is |
|---|---|
| `/try` | Live Orbis generation and a live controller. The breathing input is simulated from the keyboard and labelled SIMULATED INPUT. |
| `/start` | Live Orbis generation. Breathing comes from a phone on the chest, or from distress ratings. |
| `/runs/canonical` | A recorded run from a real live session, once it is recorded. Fast breathing in it is induced on purpose and labelled so. Ratings are labelled BUILDER DEMO. |
| `/proof` and `evidence/controller` | Offline results. The 100 controller traces are generated inputs, not people. |

No live Orbis measurement exists yet.

## Judge path

| Step | Where |
|---|---|
| Watch | `/runs/canonical` |
| Try | `/try`, no phone and no signup, capped at 4 minutes |
| Verify | `/proof`, `pnpm test`, `pnpm verify:receipt evidence/live/<run-id>/trial-1.receipt.json`, `python tools/cutdetect.py <webm>` |

If the Orbis slot is busy, `/try` says so and offers the recorded run.

## Links

- Repo: https://github.com/winsznx/unflinch
- Live URL: to be added after deploy
- Video: to be added after recording ([DEMO_SCRIPT](DEMO_SCRIPT.md))
- Proof: `/proof` on the live URL

## Limitations

- Not a medical device. No treatment claims.
- Breathing rate is a proxy for arousal, not a measure of fear.
- One live Orbis session at a time.
- Social fears, needles and blood, vomit, faces and trauma cues are excluded.
- Nothing has run against a live Orbis session yet, so the hand-written ladders and the generator are not live-validated.

## Form fields

To be pasted from the real form.
