# Gates

Each gate from PRD §6.1, with its result and the artifact that proves it. Failures stay in the log.

| Gate | Status | Evidence | Notes |
|---|---|---|---|
| G0 Setup | in progress | | Starter imported, pnpm, icon and `/api/og` render locally. Vercel preview pending. |
| G1 Orbis truth | blocked | | Needs `REACTOR_API_KEY`. |
| G2 Controller (offline) | **pass** | `evidence/controller/agreement.json`, `evidence/controller/oracle_invariants.json` | TS controller vs independent Python oracle on 100 seeded traces (4,573 ticks): 100% agreement (4,573 / 4,573), 0 invariant violations from the TS runtime checker and from the oracle's independent checker. |

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
