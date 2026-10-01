# Contributions

## Team

Unflinch is a solo build by Timothy Popoola (GitHub `winsznx`). Product, design, controller, ladders, signal processing, server, interface and evaluation are one person's work during the event.

## Independent evaluation

The controller oracle (`tools/oracle_controller.py`) was written from the PRD decision table, policy constants and invariants without reading any TypeScript under `lib/`. `tools/gen_traces.py` shares no code with the oracle or the controller. `tools/README.md` holds the independence statement and every interpretation the oracle had to make.

The independence has one limit worth stating. After the first comparison agreed on 52.7% of ticks, the open readings were settled as C1 to C7 in [DECISIONS](DECISIONS.md), and the oracle was then updated from that document, not from the TypeScript. The result in [CLAIM_LEDGER](CLAIM_LEDGER.md) is agreement after that reconciliation. The log is in [GATES](GATES.md).

Planned human ratings (subject persistence, fear fidelity, visible retreat onset) are meant to come from someone other than the builder, blind to condition. None has been collected.

## Starter and third parties

- The Visko Orbis hackathon starter is the base, see [HACKATHON_DELTA](HACKATHON_DELTA.md).
- Orbis runs on Reactor through `@reactor-team/js-sdk`. Ladders are generated with Gemini.
- Clinical design follows Craske, Treanor, Conway, Zbozinek and Vervliet (2014) on inhibitory learning.
- Libraries are listed in `package.json` and `tools/requirements.txt`.

## Upstream

A draft issue listing the eight Orbis documentation inconsistencies that still hold is in [SPONSOR_FINDINGS](SPONSOR_FINDINGS.md). It has not been sent. Each item waits for a live measurement.
