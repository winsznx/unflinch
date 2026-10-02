# Unflinch

> Face your fear at your pace.

Name a fear and the outcome you dread. Unflinch generates it as one live scene on Visko Orbis. A deterministic controller reads your breathing, your distress rating and your own choices on every Orbis chunk (1.83 s at the documented 18 fps) and sends at most one scene change every two chunks: step closer, hold, or back off.

Measured so far:

| Claim | Result | Threshold | Status |
|---|---|---|---|
| Controller agrees with an independent oracle | 100% agreement on 100 traces (4,646 ticks), 0 invariant violations | 99% agreement, 0 violations | **pass** |
| Eases off after overwhelm (decision to landing) | median 3, p90 3 chunks (n = 25 live retreats) | median 2 or less, p90 3 or less | **fail** |
| Live morph vs restart-per-step, acknowledge time | 1.84 s vs 5.8 s (medians, n = 105 and 55) | none set | measured |
| Hard cuts inside a trial | detector can't separate same-scene cuts from Orbis's own changes | 0 in 15 or more live trials | pending |

These come from 30 live Orbis sessions on 2026-10-01 (4 builder runs in `evidence/live/`, 26 campaign runs in `evidence/campaign/`), all with simulated input and labelled that way. The failed claim stays failed: the threshold was fixed before the run. Six claims still need a blind rater or a real phone. Every claim has a threshold, an artifact and an n in [docs/CLAIM_LEDGER.md](docs/CLAIM_LEDGER.md).

Where things stand, including what failed: [docs/STATUS.md](docs/STATUS.md).

Demo video (2 min): [youtu.be/2KqNIp9v5wA](https://youtu.be/2KqNIp9v5wA) · Launch post: [x.com/winsznx](https://x.com/winsznx/status/2105730115267395604).

Routes: `/runs/canonical` (watch a recorded live run), `/try` (try it, no signup), `/proof` (claims and raw evidence). Live URL: [https://unflinch-zeta.vercel.app](https://unflinch-zeta.vercel.app). Not a medical device.

## What it is

Unflinch is a browser tool for practising exposure to a specific phobia. You enter a fear, the outcome you dread and how likely it feels. The app builds a short ladder of single-action scene steps: hand-written for dogs and heights, pre-generated and linted for nine more catalog fears, and generated live by Gemini for anything else. Each round is one continuous Orbis generation that ends on a harmless staging of your prediction, then asks you to re-rate it. The intended first users are telehealth therapists who run exposure with clients. This is a hackathon build with no clinical evidence behind it.

What's in it beyond the core loop:

- **Your own street.** An optional photo of a real place becomes the last round's opening frame. People and readable text are removed first and the photo is never stored ([`lib/ladder/anchor.ts`](lib/ladder/anchor.ts)).
- **Therapist console.** A signed remote link lets a therapist step closer or back, vary the scene, call the expectancy test, end a round, set a level cap and switch auto mode. Commands are inputs to the controller, not overrides: a therapist's step closer is refused during a cooldown, a breathing ceiling or a missing signal, and the refusal is logged. Every command is logged in the receipt ([`app/remote/[id]`](app/remote)).
- **Safe place.** One tap (or Esc) backs the subject out of the scene and pauses while the calm, empty scene keeps playing. Going back is the person's choice; once breathing has settled the caption says so.
- **Session report.** Per-round time at each level, retreats, ratings before and after, as JSON or a printable PDF.
- **No phone needed.** Without the chest sensor, distress ratings (0 to 9) drive the controller.

## Judge path

| Step | Where | Needs |
|---|---|---|
| Watch | `/runs/canonical`: recording, synced lanes, decision log, receipt with SHA-256 | Nothing. Today it's a real two-round Orbis session driven by simulated input, labelled that way, until the phone-sensor run is recorded. |
| Try | `/try`: a live session capped at 4 minutes. The keyboard stands in for a breathing sensor and every such input is labelled SIMULATED INPUT. Keys: `S` fast breathing for 15 s, `H` breath hold for 15 s, `0` to `9` distress (9 eases the scene off), arrow up and down to step, space to pause. | A browser. One Orbis session runs at a time; when the slot is busy the page offers the recorded run. |
| Verify | `/proof`, plus the commands below | A clone of this repo |

```bash
pnpm install
pnpm test                    # controller, invariants, ladder lint, signal
pnpm controller:run          # run the TS controller over evidence/controller/traces
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/oracle_controller.py \
  --traces evidence/controller/traces --out evidence/controller/oracle \
  --compare evidence/controller/ts
pnpm verify:receipt evidence/live/ba018aa9-996d-40b5-975f-efb695ac43da/trial-1.receipt.json
tools/.venv/bin/python tools/cutdetect.py <recording.webm>
```

`pnpm verify:receipt` recomputes the receipt hash and headline metrics, checks ordering, re-lints every prompt that reached the model and, if you pass a recording, checks its SHA-256. Committed receipts are in `evidence/live/` and `evidence/campaign/`; all of them pass.

## How Orbis is used

- Per-chunk morph as the titration step. `lib/session/runtime.ts` calls `decide()` on every `chunk_complete`. A step is one `set_prompt` carrying a single-action transition such as "The terrier walks closer and stops about three meters from the camera, tail wagging." The run is never restarted inside a trial.
- Persistent subject. Every prompt in a ladder uses the same subject wording and transitions describe only what changes. The Orbis prompt guide says subjects persist until removed by action. Whether the same dog survives a whole trial is claim F-PERSIST, which waits for a blind rater; the recordings exist.
- `set_image` handoff between trials. At trial end the app pauses, captures the last frame as an 854 by 480 JPEG and starts the next trial of the same context from it. The heights ladder has one context, so its trials chain. The dogs ladder rotates park, sidewalk and living room, so each new context starts from a fresh absolute prompt.
- Seed lock. `SEED_LOCKED` (default 2026) is sent with `set_seed` before every trial and stored in the receipt.

## Architecture

```
phone: breath, ratings, buttons --+
therapist remote: commands -------+--> Supabase Realtime (HMAC-signed) --+
                                                                         v
keyboard: ratings, step, pause (local) ----------> patient browser: SessionRuntime
                                                     arousal class -> decide() -> lint -> prompt
                                                         |  set_prompt, set_image
                                                         v
                                       Orbis via Reactor (browser holds a scoped JWT)
                                                         |  video, audio, chunk_complete
                                                         v
                                   receipt per trial -> /api/trial -> Supabase -> /runs, /proof
```

Server routes mint the Reactor JWT, hold the Orbis slot lease, build ladders and store receipts. The full picture, with a data-flow chart and the session state machine, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run locally

Needs Node.js 20.9 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` runs the starter's session-cleanup wrapper. It deletes Orbis sessions that a previous dev server left open, but it only tracks sessions started from the `/lab/orbis` playground.

| Works with no keys | Needs a key |
|---|---|
| Landing page, `/proof`, `/start` intake and plan (dogs and heights use curated ladders, other fears fall back to the closest curated ladder), session setup up to the Start button, `pnpm test`, `pnpm controller:run`, the Python oracle, `pnpm verify:receipt`. Sessions and trials go to a local file store (`.data/store.json`) and realtime falls back to same-browser `BroadcastChannel`. | Any live scene needs `REACTOR_API_KEY` (without it `/api/token` returns `REACTOR_NOT_CONFIGURED`). Generated ladders need `GEMINI_API_KEY`. Phone pairing across devices, the therapist link across devices, recordings and stored runs need the Supabase variables. |

Full variable list and the Supabase and Vercel steps are in [docs/SETUP.md](docs/SETUP.md).

## Repo layout

```
app/                  Next.js App Router
  (marketing)/        landing, /start, /try, /proof, /runs/[id], /runs/canonical
  session/[id]/       patient player
  s/[code]/           phone sensor
  remote/[id]/        therapist console
  lab/                dev-only pages (/lab/breath, /lab/orbis), 404 in production
  api/                route handlers
components/           UI by surface: player, sensor, remote, proof, marketing, intake
lib/
  controller/         decide(), policy, invariants, trace runner
  ladder/             schema, lint, Gemini generator, curated dogs and heights
  signal/             breath estimator, arousal classes, keyboard simulator
  session/            session runtime and per-tab session storage
  orbis/              Reactor client, frame handoff, recorder, receipts
  realtime/           HMAC-signed broadcast channel
  db/                 Supabase store and local JSON store
  proof/, evidence/   run loader, claim manifest reader
  server/             server-only helpers
supabase/migrations/  schema, slot lease, IP quota
scripts/              controller CLI, receipt verifier, evidence hasher, dev wrapper
tools/                independent Python evaluation: oracle, trace generator, cut detector
tests/                vitest suites for controller, ladder, signal
evidence/             manifest.json, hashes.json, controller traces and oracle output
docs/                 documentation set (below)
```

## Docs

| Doc | What it covers |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Components, data flow, runtime lifecycle, controller, data model |
| [SECURITY](docs/SECURITY.md) | Threat model checked against the code, known gaps |
| [SETUP](docs/SETUP.md) | Environment, Supabase, Vercel, Python tools, tests |
| [CLAIM_LEDGER](docs/CLAIM_LEDGER.md) | Every claim, its threshold, artifact and status |
| [THESIS](docs/THESIS.md) | The thesis and the pre-registered falsifiers |
| [EVAL_CAMPAIGN](docs/EVAL_CAMPAIGN.md) | Experiments E0 to E9, how each is run, what is done |
| [SPONSOR_FINDINGS](docs/SPONSOR_FINDINGS.md) | Orbis documentation inconsistencies and an upstream issue draft |
| [DECISIONS](docs/DECISIONS.md) | Spec clarifications and platform choices |
| [GATES](docs/GATES.md) | Build gates and their results |
| [BUILD_CONTRACT](docs/BUILD_CONTRACT.md) | Rules for anyone changing this repo |
| [STATUS](docs/STATUS.md) | What works, what's measured, what failed, what's open |
| [DEMO_SCRIPT](docs/DEMO_SCRIPT.md) | The 2:30 video plan |
| [SUBMISSION](docs/SUBMISSION.md) | Submission draft |
| [HACKATHON_DELTA](docs/HACKATHON_DELTA.md) | What came from the starter and what was built in the event |
| [RUBRIC_ARTIFACT_MAP](docs/RUBRIC_ARTIFACT_MAP.md) | Judging criteria mapped to artifacts |
| [JUDGE_SCORECARD](docs/JUDGE_SCORECARD.md) | Predicted scores, labelled as predictions |
| [CONTRIBUTIONS](docs/CONTRIBUTIONS.md) | Who built what |

The design spec (the PRD) is private and is not in this repo. Docs cite it as PRD followed by a section number where a decision traces back to it. Everything a reader needs to check is restated in these docs.

## Safety and claims

Unflinch is not a medical device. It is a practice tool and makes no treatment claims.

- Never rendered: harm. Every prompt sent to Orbis passes a lint that rejects bite, attack, fall, crash, blood, injury and similar words, negation, people and faces.
- Out of scope: social fears, needles and blood, vomit, faces and clowns, trauma cues. The intake form refuses them.
- You stay in control. Space or the Pause button pauses at any time. A distress rating of 9 or an overwhelm signal eases the scene off one step. It repeats at most once every 6 chunks unless a fresh rating of 9 arrives.
- Labels. Keyboard input is labelled SIMULATED INPUT. Builder demo ratings are labelled BUILDER DEMO and are never outcomes.
- We never claim that Unflinch "treats", "cures", "reduces anxiety", is "clinically validated" or "safe for everyone", or that it "uses heart rate". The signal is breathing rate from a phone accelerometer, which is a proxy for arousal.

The full list and the status of each claim are in [docs/CLAIM_LEDGER.md](docs/CLAIM_LEDGER.md).

## Credits

Built on the [Visko Orbis hackathon starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter) and the Reactor SDK (`@reactor-team/js-sdk`). Ladder generation uses Gemini. Clinical design rules follow Craske et al. 2014 on inhibitory learning. What came from the starter is listed in [docs/HACKATHON_DELTA.md](docs/HACKATHON_DELTA.md).

## License

MIT. See [LICENSE](LICENSE).
