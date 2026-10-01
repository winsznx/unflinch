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

Other interpretations from the oracle README (`tools/README.md`, Ambiguities) were already shared by both implementations.
