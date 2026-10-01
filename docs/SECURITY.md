# Security

This is the PRD threat model (§4.14) checked against what the code does today. Each control below was read in the source. Controls that depend on Reactor or Supabase behavior are marked as unverified because no live run has happened yet (gate G1 in [GATES](GATES.md)).

Unflinch is not a medical device and is not HIPAA compliant. It has no accounts and no login. The Supabase anon key is public by design.

## Threat model

| Threat | Impact | Control in the code | Where |
|---|---|---|---|
| Reactor or Gemini key leak | Credit drain | `REACTOR_API_KEY`, `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in server code. `lib/server/reactor.ts`, `lib/server/http.ts`, `lib/db/store.ts` and `lib/db/supabase.ts` import `server-only`. `lib/ladder/generate.ts` has no such import and is used only by `/api/ladder`. The browser receives a JWT from `/api/token` and nothing else. Only `NEXT_PUBLIC_*` values reach the client bundle. | `lib/server/reactor.ts`, `lib/db/supabase.ts` |
| Stolen or overused JWT | One session runs longer or in parallel | The JWT expires after 900 s and is scoped to model `reactor/visko-orbis-stable` with `max_sessions: 1` and `max_session_duration_seconds` set to 240 s in judge mode and 600 s in self and therapist mode. Enforcement of these constraints is Reactor's. Not yet verified live. | `lib/server/reactor.ts`, `app/api/token/route.ts` |
| Public abuse of `/try` | Credits burned, slot starved | `/api/token` takes the single slot lease (`acquire_slot`, lease = session length plus 60 s), bumps a per-IP daily counter (`PUBLIC_SESSIONS_PER_IP`, default 2) on a session's first connect, and returns 503 when `PUBLIC_LIVE=0`. The client ends a session 5 s before the issued cap. | `app/api/token/route.ts`, `supabase/migrations/0001_init.sql` |
| IP privacy in the quota | Raw IPs stored | Only `HMAC-SHA256(IP_HASH_SALT, ip)` is stored in `ip_quota`, keyed by day. If `IP_HASH_SALT` is unset a fixed development salt is used, so set it in production. | `lib/crypto.ts` |
| Another site calls the credit routes from a browser | Credits burned from a visitor's browser | `/api/session` and `/api/token` reject a request whose `Origin` host differs from the request host (403 `CROSS_ORIGIN`). | `lib/server/http.ts` |
| Pairing code guessing or reuse | Someone else pairs a phone | Codes are 6 characters from a 32-symbol alphabet, drawn with `crypto.randomInt`. Pairing is one conditional update: the code must match, be unpaired and unexpired (15 minutes). A used or expired code returns 409. | `lib/crypto.ts`, `lib/db/store.ts`, `app/api/pair/route.ts` |
| Channel snooping or spoofing | Fake signals or commands steer a session | Every realtime message is HMAC-SHA256 signed over `type\|from\|t\|payload` with a per-session 32-byte key. The patient drops messages with an unknown sender, a bad signature or a timestamp more than 10 s from its own clock. Phone and remote use different keys, so one cannot sign as the other. Therapist commands are applied only in therapist mode. | `lib/realtime/channel.ts`, `lib/session/runtime.ts` |
| Therapist key exposure | Anyone with the link can steer | The key sits in the URL fragment (`/remote/<id>#k=<key>`), which browsers do not send to servers. The patient's screen shows the link with the key masked and puts the full link on the clipboard when copied. | `components/player/SessionApp.tsx`, `components/remote/RemoteConsole.tsx` |
| Direct database access with the anon key | Reading or writing session data | Row level security is on for all six tables with no policies, and execute on the three functions is revoked from `public`, `anon` and `authenticated`. All table access goes through route handlers using the service role. The `recordings` bucket is private and the migration adds no storage policies. | `supabase/migrations/0001_init.sql` |
| Harmful prompt reaches Orbis | A distressing scene | The start prompt and every controller-chosen transition pass `lintPrompt` at send time (harm words, negation, people and faces, intent adjectives, length and structure rules). A failing start prompt aborts the run. A failing transition is dropped and logged as INV7. The `enter` prompt is linted at send time too, and a failure ends the run. | `lib/ladder/lint.ts`, `lib/session/runtime.ts`, `lib/ladder/generate.ts` |
| Feared-outcome text reaches Orbis | The model renders the dreaded harm | The runtime never puts the text in a prompt. It is used only to pick one of the ladder's expectancy-test prompts by word overlap. For fears without a curated ladder, Gemini sees the text and writes a benign resolution prompt, which is linted like every other prompt. | `lib/ladder/resolve.ts`, `lib/ladder/generate.ts` |
| Prompt injection through the fear text | The generator emits off-policy content | Fear and outcome are cut to 240 characters, the reply must parse against the zod ladder schema, `lintLadder` checks every string, and any failure falls back to a curated ladder. The intake form's exclusion list for fears (people, needles, blood and so on) runs in the browser only. | `lib/ladder/generate.ts`, `components/intake/IntakeForm.tsx` |
| Recording privacy | A person's session is stored | A recording starts only when the consent box was ticked and `/api/recording` returns 403 `NO_CONSENT` otherwise. The recorded stream is the Orbis video and audio tracks. The app never calls `getUserMedia` or opens a camera or microphone. Files go to the private `recordings` bucket through a signed upload URL. | `lib/session/runtime.ts`, `lib/orbis/recorder.ts`, `app/api/recording/route.ts` |
| Leaked billing session | Credits keep burning | The slot is released on end and by a `sendBeacon` on `pagehide`. The lease expires on its own. A session ends after 3 minutes paused, 60 s on the rating sheet, or at the cap. In development the starter wrapper deletes sessions recorded by the `/lab/orbis` playground at startup and on exit. Sessions from `/try` and `/start` are not registered with it. | `lib/session/runtime.ts`, `scripts/dev-with-session-cleanup.mjs` |

## What these controls do not cover

- Realtime messages are signed and carry no end-to-end encryption. The anon key and the session id are enough to read a live session's breath rate, distress ratings, level and captions. The session id also appears in the patient URL, the therapist link and `/runs/<id>`.
- The 10 s freshness check compares the sender's clock with the receiver's. There is no nonce, so a captured message can be replayed inside the window. A phone whose clock is more than 10 s off is ignored.
- A verified sender is trusted for ratings and intents. A holder of the phone key or the remote key could send a distress rating of 0 to 2, which overrides a body overload signal. The remote console does not offer this.
- Both keys are bearer credentials for the server routes. `authorizedSession` accepts either one, so the therapist link can also call `/api/token`, `/api/ladder`, `/api/events` and `/api/trial` for that session.
- `/api/pair` has no rate limit. The code space is about 1.07 billion and a code lives 15 minutes.
- The same-origin check passes requests with no `Origin` header, so scripted clients are not stopped by it. `/api/ladder` and the other session routes rely on the session key instead.
- Session creation has no quota. The IP quota is counted when a session first connects to Orbis. The IP comes from the first `x-forwarded-for` entry, then `x-real-ip`, which is only trustworthy behind a proxy that sets them.
- The quota counter is charged after the slot is acquired, so waiting for a busy slot is free. A first connect that gets the slot but then fails to mint a token still uses one of the day's sessions.
- `PUBLIC_LIVE=0` blocks new tokens. A session that already holds a token keeps running until its own cap.
- The heartbeat extends the lease by `min(120, cap)` seconds each call and has no absolute server-side ceiling. The hard stops are the token's `max_session_duration_seconds` and the client's `SESSION_CAP`.
- `/api/nano-banana` and `/api/orbis-prompt` come from the starter and spend `GEMINI_API_KEY` without a session key. They return 404 in production; only the dev playground at `/lab/orbis` uses them.
- `/runs/<session id>` serves that session's stored receipts, and with consent a one-hour signed recording URL, to anyone who has the id. `/proof` lists only runs labelled `SIMULATED_INPUT` or `BUILDER_DEMO`. There is no access control beyond the unguessable UUID, and the recording consent checkbox says so.
- The recording SHA-256 is computed in the browser and stored as sent. The server does not recompute it. `pnpm verify:receipt` checks a recording file against the receipt.
- There is no self-serve deletion. Removing a person's data is a manual delete in Supabase.

## Data stored

| Where | What |
|---|---|
| `sessions` | Fear text, feared outcome, expectancy before, mode, consent flag, seed, both keys, pairing code, timestamps. No name, email or account. |
| `ladders` | Fear text and the generated or curated plan, cached by hash. |
| `trials` | The full receipt per trial: prompts, decisions, breath rate samples, distress ratings, post-trial ratings and the optional feeling word. |
| `events` | Batched client events: decisions, ratings, intents, simulator triggers, first-frame timing. |
| `ip_quota` | Salted IP hash, day, session count. |
| Storage `recordings` | Orbis output video, only with consent. |

Local development without Supabase writes the same data to `.data/store.json`, which is gitignored.

## Reporting a problem

Open an issue on [github.com/winsznx/unflinch](https://github.com/winsznx/unflinch). Do not post keys or session ids.
