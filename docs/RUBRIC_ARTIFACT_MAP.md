# Rubric to artifact map

Visko judges on three criteria: real-time interaction, creativity and functionality. This maps each to the claim Unflinch makes and the artifact a judge can open. "Now" says whether the artifact exists today. Claims here follow [CLAIM_LEDGER](CLAIM_LEDGER.md).

| Criterion | Claim | Artifact | Now | Limitation |
|---|---|---|---|---|
| Real-time interaction | The controller decides on every Orbis chunk from the body and patient signals and can change the scene at most every two chunks | `lib/controller/decide.ts` and `lib/session/runtime.ts` | exists | Breath is an arousal proxy. It is induced in the demo. No latency is measured yet |
| | | `pnpm test` and the oracle comparison (`evidence/controller/agreement.json`) | exists | Offline, on generated traces |
| | | Synced lanes on `/runs/canonical` | pending, needs the canonical run | |
| | | `evidence/live/latency.csv` | pending | |
| | | Video 0:40 to 1:35 ([DEMO_SCRIPT](DEMO_SCRIPT.md)) | pending | |
| Creativity | Live exposure practice for a named fear and a named dreaded outcome, with clinical rules from the inhibitory learning literature. A scan of Orbis entries found none in this area | Design rules in [ARCHITECTURE](ARCHITECTURE.md) and the ladder code in `lib/ladder` | exists | The scan is the builder's own and is not exhaustive. Fears with people or faces are excluded |
| | Fears beyond dogs and heights come from one sentence and are linted | Generator and lint tests (`tests/ladder.test.ts`) | exists | Not validated live |
| | | `/proof` breadth row and `evidence/breadth/` | pending | |
| | | Video 1:45 to 2:05 | pending | |
| Functionality | A deployed, end-to-end, recorded and verifiable core interaction | `/try` on the live URL | pending, no deploy yet | One Orbis slot. A busy slot shows a message and a recorded run |
| | | `pnpm verify:receipt` on a committed receipt | tool exists, no receipt committed yet | |
| | | Canonical receipt with SHA-256 | pending | |
| | | E7 safety run (`evidence/live/safety.json`) | pending | |
