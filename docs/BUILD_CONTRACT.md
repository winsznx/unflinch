# Build contract

Rules for anyone changing this repo, human or coding agent. They come from the PRD build gates (section 6.1).

1. The PRD is the source of truth for design. It is private, so [DECISIONS](DECISIONS.md) records every place the code settled something it left open. Measured facts from the live Orbis gate (G1) override the PRD and get written back to it.
2. Never fabricate metrics, logs, users, ratings or recordings.
3. Every displayed number traces to an artifact with an n and a provenance.
4. Simulated input is always labelled.
5. No silent fallback from Orbis to anything else while claiming live.
6. Thresholds in [THESIS](THESIS.md) do not move after seeing results.

## Where the repo holds each rule

| Rule | How it is held today |
|---|---|
| 2 and 3 | `/proof`, the landing page and the Open Graph card read `evidence/manifest.json` through `lib/evidence/claims.ts`. A pending claim renders as "Pending", never a placeholder number. Each row names its artifact and shows its SHA-256 from `evidence/hashes.json`. |
| 3 | Receipts store every chunk, decision, input snapshot and landing. `pnpm verify:receipt` recomputes the hash and metrics from the file. |
| 4 | `ReceiptLabel` carries `LIVE`, `RECORDED`, `SIMULATED_INPUT`, `BUILDER_DEMO` and `REPLAY`. The player shows the labels, the receipt stores them, and `/proof` lists only runs that carry `SIMULATED_INPUT` or `BUILDER_DEMO`. |
| 5 | The only renderer is Orbis. A failed start shows an error overlay with a link to a recorded run, and the plan screen tells the user when a curated ladder replaced a generated one. Nothing swaps in another renderer. |
| 6 | Thresholds sit in the manifest and in the claim ledger. Changing one is a visible diff. |

## Rules for changes

- Keep `lib/controller` pure and covered by `pnpm test` and the oracle comparison. A change to a decision row means a new entry in DECISIONS and an updated oracle, made from the spec and not from the TypeScript.
- A change to any prompt that can reach Orbis must keep `tests/ladder.test.ts` green. Do not loosen `lib/ladder/lint.ts` to make a prompt pass.
- Do not add efficacy language anywhere. The never-claim list is in [CLAIM_LEDGER](CLAIM_LEDGER.md).
- Keep server keys out of `NEXT_PUBLIC_*` variables and out of client components.
- Log a gate result in [GATES](GATES.md) with the artifact that proves it. Failures stay in the log.
