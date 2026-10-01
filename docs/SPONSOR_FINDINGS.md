# Sponsor findings

Places where the Orbis Stable documentation disagrees with itself or with a third-party report, and what Unflinch's code does about each. The Measured column stays "pending G1" until a live Orbis run settles it. G1 is blocked on `REACTOR_API_KEY` (see [GATES](GATES.md)), so none of this has been measured by us.

The doc columns come from the PRD's research notes. On 2026-10-01 the public pages were fetched and searched again to see which statements still hold. Pages: [Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api), [schema](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/schema), [prompt guide](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide), [Orbis Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api). The Beacon claims come from the third-party [Beacon repo](https://github.com/Gentle-mann/beacon) and were not re-checked.

| ID | Doc A says | Doc B says | Public docs on 2026-10-01 | What the code does today | Measured |
|---|---|---|---|---|---|
| F1 | API page example reads `session_chunk` | Schema: `chunk_complete.chunk_index`, `state.current_chunk`. Beacon reports `chunk_index` | Still true. The API page example logs `msg.session_chunk` and lists `state.session_chunk`. The schema has `chunk_index` and `current_chunk` | `lib/orbis/client.ts` reads `chunk_index`, falls back to `session_chunk`, then 0 | pending G1 |
| F2 | API page: `set_audio_prompt` applies from the next `start` | Schema: valid mid-run, from the next chunk | Still true. The API page says `audio_prompt_accepted` "applies from the next start". The schema says "valid at any time" | Never sends `set_audio_prompt`. Audio is one `set_audio_enabled` before `start` | pending G1 |
| F3 | Schema: `max_chunks` up to 229 (about 7 min) | Prompt guide: up to 2000 (about 61 min) | Fixed. The schema, the guide and the Dynamic page now all say 2000 (about 61 min). No 229 found | Reads `generation_started.max_chunks`. Trial length is `min((max_chunks or 229) - 2, 48)` chunks, so 48 (about 88 s) is the cap under any of these | pending G1 (value to read live) |
| F4 | API page: restate setting and subject in every prompt | Prompt guide: do not restate the world | Still true. The API page says "Re-establish the setting and subject in every prompt you send". The guide says "do not restate the world" | Transition prompts carry only the change. Absolute prompts start a trial. The restate-versus-delta A/B has not been run | pending G1 |
| F5 | Docs: the first chunk emits 0 frames | Beacon: the first chunk emits frames | Docs side unchanged. The API page and the Dynamic page both say 0 frames. The starter README in this repo says the same | Takes first-frame time from `requestVideoFrameCallback` on the video element, so it works either way. `frames_emitted` is stored per chunk in each receipt | pending G1 |
| F6 | Spec: 18 fps | Schema example: `generation_started.fps: 24` | Still true. The tracks table and the API page say 18 fps. The `generation_started` example shows `fps: 24` | `CHUNK_FPS = 18`, so a chunk is 33 / 18 = 1.833 s. That constant turns a SUDS report's age into a chunk index and sets how long a fast breath rate must last before OVERLOAD. `generation_started.fps` is parsed and unused | pending G1 |
| F7 | API page and prompt guide: `passthrough` on `set_prompt` | Schema table lists only `prompt` | Fixed. The schema's `set_prompt` table now lists `passthrough` (bool, default false) | Sends `{prompt}` only and never `passthrough`. The planned A/B was not run | pending G1 (A/B only) |
| F8 | API page: startup measured in minutes | Beacon: about 17 s warm-up | Docs side unchanged. The API page says session startup "is measured in minutes" | Waits up to 15 s for `conditions_ready`, 30 s for `generation_started` and 2 s for each `set_prompt` ack. Intake-to-first-frame time is stored in the receipt `timing` block and as a `first_frame` event | pending G1 (feeds F-TTF) |
| F9 | Dynamic API page: connect can return 429 when "the deployment's single session slot" is held | Beacon: a `concurrent_sessions_per_model = 1` quota | Docs side unchanged. The Dynamic page says "Connect can return 429 no available capacity when the deployment's single session slot is held" | The token carries `max_sessions: 1` and the app keeps its own Postgres lease. The lease only coordinates Unflinch sessions and cannot see other teams. A Reactor 429 gets no special handling | pending G1: open sessions from two accounts at once |
| F10 | The design assumes `chunk_complete` carries `active_prompt` | The published schema has no such field (DECISIONS P5) | Still true. The API page example logs `msg.active_prompt` on `chunk_complete` and lists `state.active_prompt`. The schema's `chunk_complete` has `chunk_index`, `frames_emitted` and `audio_samples` | If `active_prompt` is on `chunk_complete`, the first changed value marks a send as landed (`landed_by: active_prompt`). If not, the boundary after the acknowledgement is recorded and labelled `landed_by: next_boundary`, an inference. The code does not read `state.active_prompt` | pending G1 |

If F9 shows a deployment-wide slot, judges can collide with other teams' sessions and `/runs/canonical` becomes the primary judge path.

## Upstream issue draft

Send once each remaining item has a measured value and a log. Until then this is a template. F3 and F7 are fixed in the docs, so they are left out. Fill the blanks from `evidence/g1/`.

**To:** support@visko.ai, or an issue on `Visko-Platform/orbis-online-hackathon-starter`

**Title:** Orbis Stable docs: eight places where the API page, schema and prompt guide disagree

**Body:**

I'm building Unflinch for the Orbis Online Challenge and drive Orbis from a controller that sends `set_prompt` on every chunk. While wiring it I found these inconsistencies. For each one I list what the docs say and what I measured on a live run, with the session id and a log in the attached folder. The code that handles each case is in `lib/orbis/client.ts` and `lib/session/runtime.ts` at https://github.com/winsznx/unflinch.

1. Chunk counter name. The API page example reads `msg.session_chunk` and `state.session_chunk`. The schema says `chunk_complete.chunk_index` and `state.current_chunk`. Measured: [fill in].
2. `set_audio_prompt` timing. The API page says `audio_prompt_accepted` applies from the next `start`. The schema says it is valid mid-run, from the next chunk. Measured: [fill in].
4. Restating the world. The API page says to re-establish the setting and subject in every prompt. The prompt guide says not to restate the world. Result of a restate versus delta comparison, [n] runs each, rated blind: [fill in].
5. First chunk frames. The docs say the first chunk emits 0 frames. Another team reports it emits frames. `frames_emitted` on chunk 0: [fill in].
6. Frame rate. The spec says 18 fps. The schema example shows `generation_started.fps: 24`. Reported `fps` and measured chunk period: [fill in].
8. Startup time. The API page says session startup is measured in minutes. Another team reports about 17 s. Connect to ready, start to first frame, and reset plus start to first frame: [fill in].
9. Session slot scope. The Dynamic API page describes "the deployment's single session slot". Another team reports a per-model quota of 1. Result of opening sessions from two accounts at once: [fill in].
10. `active_prompt`. The API page example reads it on `chunk_complete` and lists it on `state`. The published `chunk_complete` schema omits it. Present on live messages: [fill in]. Documenting it in the schema would help anyone who steers per chunk.

Happy to share receipts and the raw logs. Thanks for the model and the starter.

Timothy Popoola (winsznx)
