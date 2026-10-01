# Hackathon delta

What came from the starter and what was built during the event.

## Base

Commit `3aac594`, "chore: import Visko Orbis hackathon starter as base", is the base. It imports [`Visko-Platform/orbis-online-hackathon-starter`](https://github.com/Visko-Platform/orbis-online-hackathon-starter) at `e7d224a`. Every commit after `3aac594` is in-event work.

```bash
git log --oneline 3aac594..HEAD
git diff --stat 3aac594 HEAD
```

## Kept from the starter

These files are unchanged since the import:

| File | Role today |
|---|---|
| `scripts/dev-with-session-cleanup.mjs` | Still the `pnpm dev` entry point. It deletes leftover Orbis sessions that the playground registered. |
| `app/api/session-cleanup/route.ts`, `app/api/session-registry/route.ts`, `lib/server/reactor-session-registry.ts` | Session cleanup and the dev-only registry, used by the playground hook. |
| `app/api/nano-banana/route.ts`, `app/api/orbis-prompt/route.ts`, `lib/nano-banana.ts`, `lib/orbis-prompt.ts`, `components/nano-banana-example.tsx`, `dog.png` | The Nano Banana kickoff example. It now lives in the playground at `/lab/orbis`, which returns 404 in production. |
| `components/orbis-controls.tsx`, `components/orbis-player.tsx` | Playground controls and player. |
| `tsconfig.json` | Unchanged. |

## Changed from the starter

| File | Change |
|---|---|
| `app/api/token/route.ts` | Rewritten. It now checks origin, session key, kill switch, IP quota and the slot lease before minting a scoped JWT. |
| `hooks/use-orbis-session.ts` | Import path only. |
| `components/orbis-demo.tsx` | Imports `requestReactorJwt` from `lib/orbis/model.ts`, which creates a throwaway judge session and then asks `/api/token` for a JWT. |
| `app/layout.tsx` | Fonts, metadata and Open Graph defaults. |
| `lib/orbis.ts` | Renamed to `lib/orbis/model.ts` and extended with the token helper. |
| `app/styles.css` | Renamed to `app/lab/orbis/lab.css`. |
| `app/page.tsx` | Deleted. The starter home became `/lab/orbis` and `/` is the Unflinch landing page. |
| `package-lock.json` | Deleted. The repo uses pnpm and `pnpm-lock.yaml`. |
| `package.json`, `.env.example`, `.gitignore`, `next.config.ts` | Renamed the package and added scripts, dependencies and settings for the work below. |
| `README.md` | Replaced. |

## Built in the event

| Area | What |
|---|---|
| Controller | `decide()`, policy, invariants and trace runner in `lib/controller`, with `tests/controller.test.ts` |
| Ladders | Schema, prompt lint, Gemini generator and the curated dogs and heights ladders in `lib/ladder` |
| Signal | Phone breath estimator, arousal classes and keyboard simulator in `lib/signal` |
| Session runtime | Calibration, trials, handoff, rating, receipts and recording in `lib/session` and `lib/orbis` |
| Realtime | HMAC-signed Supabase broadcast channel with a local fallback in `lib/realtime` |
| Server | Session, pairing, ladder, token, slot, events, trial and recording routes, the Supabase schema and the local store |
| Surfaces | Landing, `/start`, `/try`, patient player, phone sensor, therapist console, `/runs/[id]`, `/proof`, `/lab/breath`, icon and Open Graph images |
| Evaluation | Independent Python oracle, trace generator and cut detector in `tools/`, controller evidence in `evidence/controller`, `scripts/verify-receipt.ts`, `scripts/build-evidence.ts` |
| Docs | Everything under `docs/` and the root README |
