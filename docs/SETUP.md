# Setup

## Prerequisites

- Node.js 20.9 or newer (the Next.js 16 requirement) and pnpm. `pnpm-lock.yaml` is the only lockfile.
- Python 3 with `venv` for the evaluation tools. The local venv used during development is Python 3.14.
- Optional: the Supabase CLI for migrations, a Vercel account for deploy.

```bash
pnpm install
cp .env.example .env.local
pnpm dev          # http://localhost:3000
```

## Environment variables

`.env.local` is gitignored. `.env.example` is the template. Server variables must never get a `NEXT_PUBLIC_` prefix.

| Variable | Scope | Default | What it does | Without it |
|---|---|---|---|---|
| `REACTOR_API_KEY` | server | none | `/api/token` uses it to mint the scoped Reactor JWT. The dev wrapper uses it to delete leftover playground sessions. | `/api/token` returns 503 `REACTOR_NOT_CONFIGURED`. No live scene. |
| `GEMINI_API_KEY` | server | none | Generates ladders for fears without a curated ladder. Also used by the starter playground routes. | Those fears fall back to the closest curated ladder. |
| `GEMINI_MODEL` | server | `gemini-3.8-flash` | Model for ladder generation. | Default is used. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | none | Service-role client for all table access, the slot lease and signed recording URLs. | With the URL also unset, the app uses the local file store. |
| `IP_HASH_SALT` | server | fixed development salt | Salt for hashing IPs in the daily quota. | The development salt is used. Set a random value in production, for example `openssl rand -hex 32`. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | none | Project URL for the server client and the browser's realtime channel. | Realtime falls back to same-browser `BroadcastChannel`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | none | Lets browsers join broadcast channels. Every message is signed, see [SECURITY](SECURITY.md). | Same fallback. |
| `NEXT_PUBLIC_SITE_URL` | public | `http://localhost:3000` | Base for canonical and Open Graph URLs. | Metadata points at localhost. |
| `PUBLIC_LIVE` | server | on | Set to `0` to refuse new tokens (503 `PUBLIC_LIVE_OFF`). `/try` shows live sessions as paused. | Live sessions allowed. |
| `PUBLIC_MAX_SESSION_S` | server | `240` | Session length in seconds for judge-mode tokens. Self and therapist sessions are fixed at 600 s in the code. | 240 s. |
| `PUBLIC_SESSIONS_PER_IP` | server | `2` | Sessions per hashed IP per day, counted when a session first connects. | 2. |
| `SEED_LOCKED` | server | `2026` | Orbis seed stored on each new session and sent with `set_seed`. | 2026. |
| `CANONICAL_RUN_ID` | server | empty | Run id that `/runs/canonical` redirects to. A committed folder name under `evidence/live/` or a stored session id. Lowercase letters, digits and hyphens, up to 64 characters, or a UUID. | `/runs/canonical` shows "No canonical run yet". |

`NEXT_PUBLIC_*` values are inlined at build time, so a change needs a new build.

## Running without keys

With an empty `.env.local` you can run the landing page, `/proof`, `/start` through the plan screen, `pnpm test`, the controller CLI, the oracle and the receipt verifier. Sessions and trials go to `.data/store.json`. Realtime stays inside one browser, so a phone on another device cannot pair. Pressing Start fails with the `REACTOR_NOT_CONFIGURED` message.

## Supabase

1. Create a project at supabase.com.
2. In the project's API settings, copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`, the anon key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the service role key into `SUPABASE_SERVICE_ROLE_KEY`.
3. Apply `supabase/migrations/0001_init.sql` with either route:
   - CLI: `supabase link --project-ref <ref>` then `supabase db push`. Add `--dry-run` to `db push` to preview. The repo has no `supabase/config.toml`, so if the CLI asks for one, run `supabase init` first.
   - Dashboard: paste the file into the SQL editor and run it.
4. Realtime needs no setup. Broadcast is on by default and the app uses only broadcast channels named `unflinch:<session id>`. It reads no tables through Realtime.
5. The migration creates the private `recordings` storage bucket.

The CLI route and the dashboard route have not been run against a real project yet. The SQL itself is the file in the repo.

## Vercel

1. Import the GitHub repo. `vercel.json` already sets the Next.js preset, `pnpm install --frozen-lockfile` and `pnpm build`.
2. In Project Settings, Environment Variables, add every variable from the table for Production, and for Preview if you want previews to go live. Set `NEXT_PUBLIC_SITE_URL` to the deployed origin.
3. Vercel applies variable changes to new deployments, so redeploy after editing any of them.
4. `vercel.json` also sets `Permissions-Policy` for `/s/*` and `/lab/breath` (accelerometer, gyroscope and screen wake lock for the page itself) and `X-Content-Type-Options` and `Referrer-Policy` for every route.
5. iOS grants motion access only on HTTPS inside a tap, so test the phone sensor on the deployed URL or a tunnel.
6. Kill switch: set `PUBLIC_LIVE=0` and redeploy.

### Publishing the canonical run (gate G10)

1. Record the run, then create `evidence/live/<run-id>/` with:
   - `trial-1.receipt.json`, `trial-2.receipt.json` and so on. Download them from `/runs/<session id>/receipt?trial=N` and save them under those names.
   - Optional `run.json` with `fear`, `note`, `cap` and `recordings` (a map from trial number to a file name in the same folder, or an https URL).
   - Optional `cuts.json`, one object or a list of `{trial, cuts, tool, threshold}`, from `tools/cutdetect.py`.
   - The recordings, `.webm` or `.mp4`.
2. Run `pnpm build:evidence` to refresh `evidence/hashes.json`, and update `evidence/manifest.json` for any claim you measured.
3. Commit, then set `CANONICAL_RUN_ID=<run-id>` in Vercel and redeploy. `next.config.ts` bundles `evidence/live/**` into the `/runs/*` and `/proof` functions, so the folder must be in the repo at build time.

## Python tools

```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt   # numpy, opencv-python-headless
```

| Tool | Command |
|---|---|
| Trace generator | `tools/.venv/bin/python tools/gen_traces.py --n 100 --seed 2026 --out evidence/controller/traces` |
| Controller oracle | `tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle --compare evidence/controller/ts` |
| Cut detector | `tools/.venv/bin/python tools/cutdetect.py <recording.webm> --out cuts.json` |
| Cut threshold calibration | `tools/.venv/bin/python tools/cutdetect.py --calibrate <known-cut clips>` |

The oracle in compare mode writes `evidence/controller/agreement.json` unless you pass `--agreement-out`. The cut threshold in `tools/cutdetect.py` is still the provisional 0.5 until calibration runs on known cuts. See `tools/README.md` for the independence statement and the list of interpreted ambiguities.

## Tests and checks

| Command | What it does |
|---|---|
| `pnpm test` | Vitest, 3 files, 23 tests: controller and invariants, ladder schema and lint, breath estimator and arousal classes. |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm typecheck` | `tsc --noEmit`. `pnpm lint` runs the same command. |
| `pnpm build` | Production build. |
| `pnpm controller:run` | Runs the TS controller over `evidence/controller/traces` and writes `evidence/controller/ts` (gitignored). Takes optional input and output directories. |
| `pnpm build:evidence` | Rewrites `evidence/hashes.json` with the SHA-256 of every evidence file that git does not ignore. |
| `pnpm verify:receipt <receipt.json> [recording.webm]` | Recomputes the receipt hash and metrics, checks ordering and reasons, re-lints prompts and optionally checks the recording hash. Exit 1 on any failure. |

Offline reproduction of the controller result, from a clean checkout:

```bash
pnpm install
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
pnpm controller:run
tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle --compare evidence/controller/ts
```

The last line prints `agreement: 4573/4573 = 100.0% (pass, threshold 99.0%)`. There is no live test suite and no CI workflow in the repo yet.
