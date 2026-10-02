# Gates

Each gate from PRD §6.1, with its result and the artifact that proves it. Failures stay in the log.

| Gate | Status | Evidence | Notes |
|---|---|---|---|
| G0 Setup | in progress | | Starter imported, pnpm, icon and `/api/og` render locally. Vercel preview pending. |
| G1 Orbis truth | partial | `docs/DECISIONS.md` M1–M4, `evidence/live/0d8a26be-4785-46b9-a7db-7f0f8a63ba4f/` | Four live runs on 2026-10-01 measured chunk period, first-chunk frames, `active_prompt` absence and ack latency. Drift onset, seed hunt and the restate-vs-delta A/B are not run: the Reactor credit balance ran out (402 `credits_depleted`) after the fourth run. |
| G3 Live loop (sim input) | **pass** | `evidence/live/0d8a26be-4785-46b9-a7db-7f0f8a63ba4f/` | Simulated spike → `CEILING_BODY` retreat, SUDS 9 → `CEILING_SUDS` retreat, step closer → `PATIENT_CLOSER`. Reason codes logged, receipts saved and verified with `pnpm verify:receipt`. Two rounds ran with reset and a context change (park → sidewalk). |
| G7 Therapist + "your street" | **built**, live check pending credits | `app/remote/[id]`, `app/api/anchor`, `lib/ladder/anchor.ts` | Signed remote commands are verified client-side; unsigned or stale ones are dropped. The place anchor was tested end to end against Gemini: photo → place description → lint-clean place context in 10.6 s. Image cleanup was unavailable on the free Gemini tier, so the confirmed-photo path ran; the refusal path for unconfirmed photos returns 422. An anchored Orbis round is not run yet (Reactor credits). |
| G3b Full ladder live (sim input) | partial | `evidence/live/82697d2c-8e77-4d26-bd36-2729f35e4a43/` | First run on production to climb L1→L6 and reach the expectancy test (52.5 s), with the scene recorded. 0 cuts in 67 s (cutdetect at the uncalibrated 0.5; lowest correlations inspected by eye, both camera drift). Finding: the dog stayed lying by the bench from L2 to L6 while the camera crept closer, so the top levels were weaker on screen than the ladder says. Acked prompts did not guarantee the visual step. | Fixed: a step closer now sends the level's `up` prompt (the subject's own step) instead of a camera move. Rerun `evidence/live/ba018aa9-996d-40b5-975f-efb695ac43da/`: the dog now gets up and moves at every step, 0 cuts in 1242 frames, but L5 to L6 still stop short of the lens and Orbis drew a pug for the 'wiry terrier'. |
| E3/E4/E9 campaign (sim input) | ran | `evidence/campaign/`, `evidence/ablation/`, `evidence/live/latency.csv` | 26 live runs on 2026-10-01, conditions interleaved. F-RESP fails (median 3 chunks, n = 25). E4: restart is 3x slower to acknowledge (5.8 s vs 1.84 s). Cut detection inconclusive after calibration. E9 recorded, blind rating outstanding. Details in [CLAIM_LEDGER](CLAIM_LEDGER.md). |
| G2 Controller (offline) | **pass** | `evidence/controller/agreement.json`, `evidence/controller/oracle_invariants.json` | TS controller vs independent Python oracle on 100 seeded traces (4,646 ticks; re-run on 2026-10-02 after the C8 safe place was added to both sides and planted in 41 traces, previously 4,573 ticks): 100% agreement (4,646 / 4,646), 0 invariant violations from the TS runtime checker and from the oracle's independent checker. |

## G2 log

1. First comparison: 52.7% agreement. Every first divergence was an open reading of the decision table. Settled as C1–C6 in `docs/DECISIONS.md`. The oracle was updated from that document only.
2. Second comparison: 99.41%. The oracle placed therapist `ev_now` / `vary` on PRD rows 12 and 16. TS had them earlier, so TS moved to match the table.
3. Third comparison: 99.65% (pass). The 16 remaining ticks come from 2 first divergences, both the same case. A second SUDS 9 report arrives less than one chunk after a ceiling retreat. TS computes the arrival chunk from `ageS` and counts it as a new report, so it retreats again as INV4 requires. The oracle detects new reports only when `ageS` drops, so it misses the second press. The oracle's checker flags the TS retreat as INV4 (refire too soon), so this is a real spec gap rather than noise. Settled as C7 in `docs/DECISIONS.md`.
4. Fourth comparison, after the oracle applied C7: 100% agreement and 0 INV violations on both checkers. G2 passes.

Reproduce:

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/gen_traces.py
pnpm controller:run
tools/.venv/bin/python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle --compare evidence/controller/ts
```
