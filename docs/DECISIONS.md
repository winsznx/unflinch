# Decisions

Short records of choices that the PRD left open or that measurement changed. Newest last.

## Controller spec clarifications (E2)

The independent oracle (`tools/oracle_controller.py`) was written from PRD §4.4 without reading the TypeScript controller. The first comparison agreed on 52.7% of ticks. Every first-divergence was traced to a reading of the decision table that the PRD left open. The table below is the spec both implementations follow from now on. The oracle was updated from this document, not from the TS source.

| ID | Question the PRD left open | Decision | Why |
|---|---|---|---|
| C1 | Are "chunks since X" counted in ticks or chunk-index distance? | Chunk-index distance from the event (`chunk − eventChunk`). Trial start is the first tick's chunk. Paused ticks count, but Orbis emits no chunks while paused, so in practice they don't occur. | One definition for every counter. The TS ticks-counted version was off by one. |
| C2 | Does `lowStreakChunks` reset after the controller presses on? | It counts consecutive effective-LOW chunks including the current one, and resets to 0 after any `up` or `selfApproach`. | The literal reading fires `UNDER_ENGAGED` every 2 chunks until the cap once someone is calm, which skips the person past every level. One approach per stable-low window matches graded exposure. |
| C3 | What resets `chunksSinceVary`? | Any prompt send (up, selfApproach, down, ev, vary). | A level change is already a visible change, so a variant 2 chunks after an approach is noise on top of the step the person is processing. |
| C4 | Can a hold variant run at L0? | No. Rows 16 (`VARIABILITY`) and therapist `vary` need `level > 0`. | L0 is the safe scene with no subject. Hold prompts describe the subject ("The terrier scratches behind its ear"), so a variant at L0 would make the feared subject appear without an `enter` decision. |
| C5 | Reason code for a therapist "vary". | `THERAPIST_VARY`, distinct from automatic `VARIABILITY`. Therapist `ev_now` also needs `level > 0`. | INV6 asks every send to carry its provenance, so the receipt should show who caused the change. |
| C6 | What happens to intents typed while paused? | Dropped, except `resume`. | Matches the pause screen ("Take your time. Resume when ready."), so nothing queued before resuming fires on resume. |
| C7 | When is a SUDS sample a *new* report (for `newSudsHigh`)? | Its arrival chunk is `chunkIndex − ageS / chunkS`. A sample is new when that arrival is later than the previous sample's arrival. Growth in `ageS` doesn't matter. | Detecting new reports only when `ageS` drops misses a second press that lands within one chunk of the first. INV4 owes a retreat for every new SUDS ≥ 9. |

Other interpretations from the oracle README (`tools/README.md`, Ambiguities) were already shared by both implementations.

## Platform

| ID | Decision | Why |
|---|---|---|
| P1 | `/runs/canonical` is a page that redirects to `CANONICAL_RUN_ID`, not a `vercel.json` route. | Vercel rejects `routes` alongside `headers`, and the phone page needs the Permissions-Policy header. PRD §4.11 names this fallback. |
| P2 | The landing, intake, proof and report use the Closeout marketing system (white canvas, grey panels, black pills, blue accent, Instrument Sans + IBM Plex Mono) instead of the PRD's neon `#0a0a0f` / `#00ff94` system. | Owner's direction. The patient view keeps the PRD exception: dark stage, no red, no glow, HUD text at 70%. |
| P3 | One run = one session id. `/runs/[id]` shows every trial of a session, with a trial switcher. | The canonical run spans two contexts (park, sidewalk), so its receipts belong together. |
| P4 | Supabase is optional in development. Without it, the same `Store` interface writes to `.data/store.json` and realtime falls back to `BroadcastChannel`. | Lets the whole judge path run locally before keys exist. Phone pairing across devices needs Supabase. |
| P5 | `chunk_complete.active_prompt` isn't in the published schema. When it's absent, a send is marked landed at the boundary after its acknowledgement and labelled `landed_by: next_boundary`. | Receipts must say how the landing chunk is known. Measured, not assumed, once G1 confirms the field. |
