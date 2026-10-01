# Submission

What was submitted to the Visko Orbis Online Challenge form. Numbers stay pending until measured, and every line here matches [CLAIM_LEDGER](CLAIM_LEDGER.md).

## Entry

| Field | Value |
|---|---|
| Name | Unflinch |
| One-liner | Exposure practice that moves at the speed of your nervous system. |
| License | MIT |
| Built with | Visko Orbis through Reactor, Next.js, Supabase, Gemini, Vercel |
| Team | Solo, Timothy Popoola (winsznx) |

## What it is

Specific phobias are common, and graded exposure is the best-supported treatment, but the feared thing has to be present at the right intensity. Therapists improvise with screen-shared videos that cannot wait, press on or back off. Unflinch generates a person's fear as one live scene on Orbis. A deterministic controller reads breathing from a phone on the chest, distress ratings and the person's own step-closer choices on every chunk, and changes the scene with one single-action prompt at most every two chunks. Each trial ends by staging a harmless version of the dreaded outcome, then asks the person to re-rate it. Dogs and heights have hand-written ladders and other fears are generated and linted. It is a practice tool for clients and therapists, not a medical device. Controller correctness is measured: 100% agreement with an independent oracle on 100 traces, 0 invariant violations. Live runs on Orbis measured a 1.84 s chunk period and a prompt acknowledgement of about 1.8 s. Latency, cut count and persistence stay pending until the proof campaign runs.

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
| `/runs/canonical` | A real two-round live Orbis session (park, then sidewalk) driven by `pnpm test:live` with simulated input, labelled as such. It will be replaced by the phone-sensor canonical run (PRD §6.2). |
| `/proof` and `evidence/controller` | Offline results. The 100 controller traces are generated inputs, not people. |

Live measurements so far are in [DECISIONS](DECISIONS.md) M1–M4 and [GATES](GATES.md) G1 and G3.

## Judge path

| Step | Where |
|---|---|
| Watch | `/runs/canonical` |
| Try | `/try`, no phone and no signup, capped at 4 minutes |
| Verify | `/proof`, `pnpm test`, `pnpm verify:receipt evidence/live/<run-id>/trial-1.receipt.json`, `python tools/cutdetect.py <webm>` |

If the Orbis slot is busy, `/try` says so and offers the recorded run.

## Form fields

| Field | Value |
|---|---|
| Team Name | Unflinch |
| Team Members and Emails | Timothy Popoola, winsznx@gmail.com |
| Project Description | "What it is" and "How Orbis is used" above, plus the live links |
| Project Repository URL | https://github.com/winsznx/unflinch |
| Demo Video URL | https://youtu.be/2KqNIp9v5wA |
| Additional materials | Screenshots of the landing page, a live judge session, the run receipt page and /proof |

## Links

- Repo: https://github.com/winsznx/unflinch
- Live URL: https://unflinch-zeta.vercel.app
- Video: https://youtu.be/2KqNIp9v5wA (2-minute walkthrough of the deployed site)
- Launch post: https://x.com/winsznx/status/2105730115267395604
- Proof: https://unflinch-zeta.vercel.app/proof
- Watch a run: https://unflinch-zeta.vercel.app/runs/canonical (builder test run with simulated input until the phone canonical run is recorded)
- Try it: https://unflinch-zeta.vercel.app/try

## Limitations

- Not a medical device. No treatment claims.
- Breathing rate is a proxy for arousal, not a measure of fear.
- One live Orbis session at a time.
- Social fears, needles and blood, vomit, faces and trauma cues are excluded.
- Nothing has run against a live Orbis session yet, so the hand-written ladders and the generator are not live-validated.

## Form fields

To be pasted from the real form.
