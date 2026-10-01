#!/usr/bin/env python3
"""Independent controller oracle for E2 (PRD §4.4, §4.5, §5.3).

Written only from the PRD decision table, policy constants and invariants.
It never reads the TypeScript controller. Every place where the PRD leaves a
choice open is marked `INTERPRETATION:` here and listed in tools/README.md.

Usage:
    python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle
    python tools/oracle_controller.py --traces evidence/controller/traces --out evidence/controller/oracle \
        --compare evidence/controller/ts
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

# PRD §4.4 POLICY, controller-relevant subset. Signal thresholds (overload,
# high, low, sensorStaleS) live upstream in the classifier; traces carry the
# already-classified arousal class.
MIN_CHUNKS_BETWEEN_SENDS = 2
COOLDOWN_CHUNKS_AFTER_RETREAT = 6
CEILING_REFIRE_CHUNKS = 6
SUDS_CEILING = 9
SUDS_LOW = 2
SUDS_MAX_AGE_S = 30
LOW_STABLE_CHUNKS = 6
VARY_EVERY_CHUNKS = 6
STALL_NUDGE_CHUNKS = 10
EV_HOLD_CHUNKS = 10
INTENT_TTL_CHUNKS = 6

AGREEMENT_PASS_PCT = 99.0
MISMATCH_SAMPLE = 50

SEND_ACTIONS = {"up", "selfApproach", "down", "ev", "vary"}
LEVEL_DELTA = {"up": 1, "selfApproach": 1, "down": -1}
CEILING_REASONS = {"CEILING_SUDS", "CEILING_BODY"}
KNOWN_REASONS = {
    "PAUSE", "RESUME", "TRIAL_MAX", "LANDING", "CEILING_SUDS", "CEILING_BODY",
    "PATIENT_BACK", "THERAPIST_BACK", "COOLDOWN", "CEILING_HOLD", "NO_SIGNAL",
    "THERAPIST", "PATIENT_CLOSER", "EXPECTANCY_TEST", "EV_HELD", "UNDER_ENGAGED",
    "STALL_NUDGE", "VARIABILITY", "IN_WINDOW",
    "THERAPIST_VARY",  # C5
    # Not in the PRD table; see INTERPRETATION notes below.
    "PAUSED", "PATIENT_END", "THERAPIST_END",
}


# ---------------------------------------------------------------------------
# Signal derivation shared by the simulator and the invariant checker. This is
# §4.5 input conditioning only, not decision logic.
# ---------------------------------------------------------------------------

def fresh_suds(tick: dict) -> int | None:
    # INTERPRETATION: "fresh" means ageS <= sudsMaxAgeS (30 s), inclusive.
    suds = tick.get("suds")
    if suds is None or suds["ageS"] > SUDS_MAX_AGE_S:
        return None
    return suds["value"]


def effective_arousal(tick: dict) -> str:
    # INTERPRETATION: fresh SUDS <= 2 replaces the breath class with LOW,
    # including UNKNOWN and OVERLOAD ("SUDS is the authority at the extremes").
    # Fresh SUDS >= 9 does not change the class; it raises ceilingActive directly.
    value = fresh_suds(tick)
    if value is not None and value <= SUDS_LOW:
        return "LOW"
    return tick["arousal"]


def suds_ceiling(tick: dict) -> bool:
    value = fresh_suds(tick)
    return value is not None and value >= SUDS_CEILING


def ceiling_active(tick: dict) -> bool:
    return suds_ceiling(tick) or effective_arousal(tick) == "OVERLOAD"


def no_signal(tick: dict) -> bool:
    return effective_arousal(tick) == "UNKNOWN" and fresh_suds(tick) is None


ARRIVAL_EPSILON_CHUNKS = 1e-6
DEFAULT_CHUNK_S = 1.833


class SudsArrivals:
    """C7: a SUDS sample is a new report when its arrival chunk
    (chunkIndex − ageS / chunkS) is later than the previous sample's arrival
    by more than ARRIVAL_EPSILON_CHUNKS. A sample that only aged keeps the
    same arrival and is not new. Null ticks don't reset the previous arrival."""

    def __init__(self, chunk_s: float):
        self.chunk_s = chunk_s
        self.last_arrival: float | None = None

    def observe(self, tick: dict) -> bool:
        suds = tick.get("suds")
        if suds is None:
            return False
        arrival = tick["chunkIndex"] - suds["ageS"] / self.chunk_s
        if self.last_arrival is not None and arrival <= self.last_arrival + ARRIVAL_EPSILON_CHUNKS:
            return False
        self.last_arrival = arrival
        return True


def new_high_suds_chunks(trace: dict) -> set[int]:
    """Chunks on which a new SUDS >= 9 report arrived (C7)."""
    arrivals = SudsArrivals(trace.get("chunkS", DEFAULT_CHUNK_S))
    return {
        t["chunkIndex"] for t in trace["ticks"]
        if arrivals.observe(t) and t["suds"]["value"] >= SUDS_CEILING
    }


# ---------------------------------------------------------------------------
# Controller simulation
# ---------------------------------------------------------------------------

@dataclass
class ControllerState:
    level: int
    cap: int
    auto_mode: bool
    trial_max: int
    paused: bool = False
    # INTERPRETATION: nothing has been sent before the first tick, so LANDING
    # cannot block chunk 0. The trial-start `state` prompt is not a decision.
    last_send_chunk: int | None = None
    cooldown_until: int = 0
    last_ceiling_chunk: int | None = None
    last_high_suds_chunk: int | None = None
    low_streak: int = 0
    # C1: every "chunks since X" is chunk − eventChunk; trial start is the
    # first tick's chunk, set in simulate().
    trial_start_chunk: int = 0
    level_since_chunk: int = 0
    last_vary_chunk: int = 0
    ev_done: bool = False
    ev_chunk: int | None = None
    nudged_levels: set[int] = field(default_factory=set)
    # INTERPRETATION: one queued-intent slot; a newer intent replaces an older one.
    queued_intent: str | None = None
    queued_at: int | None = None


def _decision(chunk: int, action: str, reason: str, state: ControllerState, inputs: dict) -> dict:
    return {"chunk": chunk, "action": action, "reason": reason, "level": state.level, "inputs": inputs}


def _ceiling_reason(tick: dict) -> str:
    # INTERPRETATION: when fresh SUDS >= 9 and OVERLOAD hold together, SUDS is
    # named because it is the authority at the extremes.
    return "CEILING_SUDS" if suds_ceiling(tick) else "CEILING_BODY"


def step(state: ControllerState, tick: dict, new_suds_report: bool) -> dict:
    """Process one chunk tick. Returns the decision; mutates state."""
    chunk = tick["chunkIndex"]
    intent = tick.get("intent")
    therapist = tick.get("therapist")
    arousal = effective_arousal(tick)

    # C2: lowStreakChunks counts consecutive effective-LOW ticks including
    # this one; _send() resets it after up/selfApproach. Paused ticks count (C1).
    state.low_streak = state.low_streak + 1 if arousal == "LOW" else 0
    if new_suds_report and tick["suds"]["value"] >= SUDS_CEILING:  # C7
        state.last_high_suds_chunk = chunk

    # INTERPRETATION: queued intents expire INTENT_TTL_CHUNKS after the chunk
    # they arrived on (valid while chunk - queued_at < 6).
    if state.queued_intent and chunk - state.queued_at >= INTENT_TTL_CHUNKS:
        state.queued_intent = None

    ceiling = ceiling_active(tick)
    trial_chunks = chunk - state.trial_start_chunk  # C1
    chunks_at_level = chunk - state.level_since_chunk
    chunks_since_vary = chunk - state.last_vary_chunk
    chunks_since_ev = chunk - state.ev_chunk if state.ev_done else None
    inputs = {
        "arousal": tick["arousal"], "effectiveArousal": arousal, "suds": tick.get("suds"),
        "intent": intent, "queuedIntent": state.queued_intent, "therapist": therapist,
        "ceilingActive": ceiling, "cooldownUntil": state.cooldown_until,
        "lastSendChunk": state.last_send_chunk, "lastCeilingChunk": state.last_ceiling_chunk,
        "lowStreakChunks": state.low_streak, "chunksAtLevel": chunks_at_level,
        "chunksSinceVary": chunks_since_vary, "evDone": state.ev_done,
        "chunksSinceEv": chunks_since_ev, "trialChunks": trial_chunks, "paused": state.paused,
    }

    # Rows 1-2 and the pause gate.
    # C6: intents that arrive while paused are dropped, except resume.
    # INTERPRETATION: every paused tick is `none`/PAUSED, and therapist
    # commands that arrive while paused are dropped too.
    if state.paused:
        if intent == "resume":
            state.paused = False
            return _decision(chunk, "resume", "RESUME", state, inputs)
        return _decision(chunk, "none", "PAUSED", state, inputs)
    if intent == "pause":
        state.paused = True
        return _decision(chunk, "pause", "PAUSE", state, inputs)

    # INTERPRETATION: intents arrive into the single queue slot here. `resume`
    # while not paused is ignored. `end` is handled at row 3 and never queued.
    if intent in ("closer", "back"):
        state.queued_intent, state.queued_at = intent, chunk

    # Row 3.
    # INTERPRETATION: patient `end` and therapist `end_trial` end the trial at
    # row-3 priority with invented codes PATIENT_END / THERAPIST_END.
    # generationComplete is read per tick (the generator keeps it set once seen).
    if trial_chunks >= state.trial_max or tick.get("generationComplete"):
        return _decision(chunk, "end_trial", "TRIAL_MAX", state, inputs)
    if intent == "end":
        return _decision(chunk, "end_trial", "PATIENT_END", state, inputs)
    if therapist == "end_trial":
        return _decision(chunk, "end_trial", "THERAPIST_END", state, inputs)

    # Row 4.
    # INTERPRETATION: therapist commands are not queued; one that lands on a
    # LANDING tick (or any tick where a higher row wins) is dropped.
    if state.last_send_chunk is not None and chunk - state.last_send_chunk < MIN_CHUNKS_BETWEEN_SENDS:
        return _decision(chunk, "none", "LANDING", state, inputs)

    # Row 5.
    new_suds_high = state.last_high_suds_chunk is not None and (
        state.last_ceiling_chunk is None or state.last_high_suds_chunk > state.last_ceiling_chunk
    )
    refire_ok = state.last_ceiling_chunk is None or chunk >= state.last_ceiling_chunk + CEILING_REFIRE_CHUNKS
    if state.level > 0 and ceiling and (new_suds_high or refire_ok):
        state.last_ceiling_chunk = chunk
        state.cooldown_until = chunk + COOLDOWN_CHUNKS_AFTER_RETREAT
        return _send(state, chunk, "down", _ceiling_reason(tick), inputs)

    # Row 6.
    # INTERPRETATION: a queued `back` takes precedence over therapist retreat
    # when both are present; a patient or therapist retreat does not set
    # cooldownUntil (only row 5 does, per the table).
    if state.level > 0 and state.queued_intent == "back":
        state.queued_intent = None
        return _send(state, chunk, "down", "PATIENT_BACK", inputs)
    if state.level > 0 and therapist == "retreat":
        return _send(state, chunk, "down", "THERAPIST_BACK", inputs)

    # Rows 7-9. Holds without a prompt are not sends; the queued intent stays.
    if chunk < state.cooldown_until:
        return _decision(chunk, "hold", "COOLDOWN", state, inputs)
    if ceiling:
        return _decision(chunk, "hold", "CEILING_HOLD", state, inputs)
    if no_signal(tick):
        return _decision(chunk, "hold", "NO_SIGNAL", state, inputs)

    # Rows 10-11.
    if therapist == "approach" and state.level < state.cap:
        return _send(state, chunk, "up", "THERAPIST", inputs)
    if state.queued_intent == "closer" and state.level < state.cap:
        state.queued_intent = None
        return _send(state, chunk, "selfApproach", "PATIENT_CLOSER", inputs)

    # Row 12.
    # INTERPRETATION: therapist `ev_now` is an extra trigger for row 12 below
    # the cap, provided the expectancy test has not run yet. C5: it needs level > 0.
    ev_now = therapist == "ev_now" and state.level > 0
    if not state.ev_done and (state.level == state.cap or ev_now):
        state.ev_done, state.ev_chunk = True, chunk
        return _send(state, chunk, "ev", "EXPECTANCY_TEST", inputs)

    # Row 13.
    if state.ev_done and chunks_since_ev >= EV_HOLD_CHUNKS:
        return _decision(chunk, "end_trial", "EV_HELD", state, inputs)

    # Row 14.
    if state.auto_mode and state.low_streak >= LOW_STABLE_CHUNKS and state.level < state.cap:
        return _send(state, chunk, "up", "UNDER_ENGAGED", inputs)

    # Row 15.
    # INTERPRETATION: "reaches 10 (once per level)" fires at the first tick
    # where row 15 is evaluated with chunksAtLevel >= 10, at most once per
    # level number per trial.
    if (chunks_at_level >= STALL_NUDGE_CHUNKS and state.level < state.cap
            and state.level not in state.nudged_levels):
        state.nudged_levels.add(state.level)
        return _decision(chunk, "nudge", "STALL_NUDGE", state, inputs)

    # Row 16.
    # C3: chunksSinceVary counts from the last send of any kind (_send resets it).
    # C4: no hold variant at L0, automatic or therapist.
    # C5: therapist vary reports THERAPIST_VARY.
    # INTERPRETATION: therapist `vary` forces row 16 regardless of the counter,
    # and when it coincides with a due automatic variant the therapist code wins.
    if state.level > 0:
        if therapist == "vary":
            return _send(state, chunk, "vary", "THERAPIST_VARY", inputs)
        if chunks_since_vary >= VARY_EVERY_CHUNKS:
            return _send(state, chunk, "vary", "VARIABILITY", inputs)

    return _decision(chunk, "none", "IN_WINDOW", state, inputs)


def _send(state: ControllerState, chunk: int, action: str, reason: str, inputs: dict) -> dict:
    state.last_send_chunk = chunk
    state.last_vary_chunk = chunk  # C3
    if action in ("up", "selfApproach"):
        state.low_streak = 0  # C2
    delta = LEVEL_DELTA.get(action, 0)
    if delta:
        state.level += delta
        state.level_since_chunk = chunk
    return _decision(chunk, action, reason, state, inputs)


def simulate(trace: dict) -> list[dict]:
    cfg = trace["config"]
    # INTERPRETATION: trials start at config.startLevel, defaulting to L1.
    state = ControllerState(
        level=cfg.get("startLevel", 1), cap=cfg["cap"],
        auto_mode=cfg["autoMode"], trial_max=cfg["trialMax"],
    )
    if trace["ticks"]:
        first = trace["ticks"][0]["chunkIndex"]
        state.trial_start_chunk = state.level_since_chunk = state.last_vary_chunk = first  # C1
    arrivals = SudsArrivals(trace.get("chunkS", DEFAULT_CHUNK_S))
    decisions = []
    for tick in trace["ticks"]:
        decision = step(state, tick, arrivals.observe(tick))
        decisions.append(decision)
        if decision["action"] == "end_trial":
            break
    return decisions


# ---------------------------------------------------------------------------
# Invariants (PRD §4.4). Recomputed from trace inputs plus the decision list,
# so they can be run on any controller's output, not only the oracle's.
# ---------------------------------------------------------------------------

def check_invariants(trace: dict, decisions: list[dict]) -> dict[str, list[str]]:
    cfg = trace["config"]
    cap = cfg["cap"]
    ticks = {t["chunkIndex"]: t for t in trace["ticks"]}
    new_high = new_high_suds_chunks(trace)  # C7
    v: dict[str, list[str]] = {f"INV{i}": [] for i in range(1, 9)}

    level = cfg.get("startLevel", 1)
    cooldown_until = 0
    last_send = None
    last_ceiling = None
    paused = False
    prev_overload = False
    pending_retreat: list[tuple[int, str]] = []

    for d in decisions:
        c, action, reason = d["chunk"], d["action"], d["reason"]
        tick = ticks.get(c)
        if tick is None:
            v["INV2"].append(f"chunk {c}: decision for a chunk not in the trace")
            continue
        ceiling = ceiling_active(tick)
        is_send = action in SEND_ACTIONS

        # INV1
        if action in ("up", "selfApproach", "ev"):
            if ceiling:
                v["INV1"].append(f"chunk {c}: {action} while ceilingActive")
            if c < cooldown_until:
                v["INV1"].append(f"chunk {c}: {action} during cooldown (until {cooldown_until})")
            if no_signal(tick):
                v["INV1"].append(f"chunk {c}: {action} with NO_SIGNAL")

        # INV2
        expected = level + LEVEL_DELTA.get(action, 0)
        if d["level"] != expected:
            v["INV2"].append(f"chunk {c}: level {d['level']} after {action} from {level}")
        if abs(d["level"] - level) > 1 or not 0 <= d["level"] <= cap:
            v["INV2"].append(f"chunk {c}: level {level}->{d['level']} outside |Δ|≤1 or [0,{cap}]")
        level = d["level"]

        # INV3
        if is_send:
            if last_send is not None and c - last_send < MIN_CHUNKS_BETWEEN_SENDS:
                v["INV3"].append(f"chunk {c}: send {c - last_send} chunk(s) after previous send")

        # INV4, part 1: a new SUDS >= 9 or an OVERLOAD onset opens a pending
        # retreat obligation, discharged at the first eligible tick.
        overload = effective_arousal(tick) == "OVERLOAD"
        if c in new_high:
            pending_retreat.append((c, "new SUDS>=9"))
        if overload and not prev_overload:
            refire_ok = last_ceiling is None or c >= last_ceiling + CEILING_REFIRE_CHUNKS
            if refire_ok:
                pending_retreat.append((c, "OVERLOAD onset"))
        prev_overload = overload
        if pending_retreat:
            if action == "end_trial" or not ceiling or level - LEVEL_DELTA.get(action, 0) == 0:
                pending_retreat.clear()
            elif not paused and action not in ("pause", "resume"):
                eligible = last_send is None or c - last_send >= MIN_CHUNKS_BETWEEN_SENDS
                if eligible:
                    if not (action == "down" and reason in CEILING_REASONS):
                        origin, why = pending_retreat[0]
                        v["INV4"].append(f"chunk {c}: first eligible tick after {why} at {origin} was {action}/{reason}")
                    pending_retreat.clear()

        # INV4, part 2: automatic retreats >= 6 apart unless a new SUDS >= 9 arrived between.
        if action == "down" and reason in CEILING_REASONS:
            if last_ceiling is not None and c - last_ceiling < CEILING_REFIRE_CHUNKS:
                if not any(last_ceiling < k <= c for k in new_high):
                    v["INV4"].append(f"chunk {c}: automatic retreat {c - last_ceiling} chunks after the last one")
            last_ceiling = c
            cooldown_until = c + COOLDOWN_CHUNKS_AFTER_RETREAT

        # INV5
        if tick.get("intent") == "pause" and not paused and action != "pause":
            v["INV5"].append(f"chunk {c}: pause intent not honored (got {action})")
        if paused and action not in ("none", "resume"):
            v["INV5"].append(f"chunk {c}: {action} while paused")
        if action == "pause":
            paused = True
        elif action == "resume":
            paused = False

        # INV6
        if is_send and reason not in KNOWN_REASONS:
            v["INV6"].append(f"chunk {c}: send without a known reason code ({reason!r})")
        if is_send and "inputs" not in d:
            v["INV6"].append(f"chunk {c}: send without an input snapshot")

        # INV8
        if reason == "STALL_NUDGE" and (is_send or action != "nudge"):
            v["INV8"].append(f"chunk {c}: STALL_NUDGE produced {action}")

        if is_send:
            last_send = c
    # INV7 (prompt lint) does not apply: controller traces carry no prompt text.
    v.pop("INV7")
    return v


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def load_decisions(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    return data["decisions"] if isinstance(data, dict) else data


def run_oracle(traces_dir: Path, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    totals = {f"INV{i}": 0 for i in (1, 2, 3, 4, 5, 6, 8)}
    examples: dict[str, list[str]] = {k: [] for k in totals}
    reason_counts: dict[str, int] = {}
    files = sorted(traces_dir.glob("trace_*.json"))
    tick_count = 0
    for path in files:
        trace = json.loads(path.read_text())
        decisions = simulate(trace)
        violations = check_invariants(trace, decisions)
        tick_count += len(decisions)
        for d in decisions:
            reason_counts[d["reason"]] = reason_counts.get(d["reason"], 0) + 1
        for key, items in violations.items():
            totals[key] += len(items)
            examples[key].extend(f"{trace['id']} {item}" for item in items[: max(0, 5 - len(examples[key]))])
        (out_dir / path.name).write_text(json.dumps({
            "schema": "unflinch.controller_decisions.v1",
            "trace": trace["id"],
            "producer": "oracle_controller.py",
            "config": trace["config"],
            "decisions": decisions,
            "invariants": {k: {"pass": not items, "violations": items} for k, items in violations.items()},
        }, indent=1) + "\n")

    summary = {
        "traces": len(files),
        "ticks": tick_count,
        "invariants": {
            k: {"pass": totals[k] == 0, "violations": totals[k], "examples": examples[k]}
            for k in totals
        } | {"INV7": {"pass": None, "note": "N/A: controller traces carry no prompt text; lint is checked in §4.6"}},
        "reasons": dict(sorted(reason_counts.items(), key=lambda kv: -kv[1])),
    }
    (out_dir.parent / "oracle_invariants.json").write_text(json.dumps(summary, indent=1) + "\n")
    return summary


def compare(oracle_dir: Path, ts_dir: Path, traces_dir: Path, out_path: Path) -> dict:
    ticks = agree = 0
    mismatches: list[dict] = []
    ts_invariant_violations: dict[str, int] = {}
    files = sorted(oracle_dir.glob("trace_*.json"))
    for path in files:
        oracle = {d["chunk"]: d for d in load_decisions(path)}
        ts_path = ts_dir / path.name
        ts = {d["chunk"]: d for d in load_decisions(ts_path)} if ts_path.exists() else {}
        if ts_path.exists():
            trace = json.loads((traces_dir / path.name).read_text())
            for key, items in check_invariants(trace, list(ts.values())).items():
                ts_invariant_violations[key] = ts_invariant_violations.get(key, 0) + len(items)
        for chunk in sorted(set(oracle) | set(ts)):
            ticks += 1
            o, t = oracle.get(chunk), ts.get(chunk)
            o_key = (o["action"], o["reason"]) if o else None
            t_key = (t["action"], t["reason"]) if t else None
            if o_key == t_key:
                agree += 1
            elif len(mismatches) < MISMATCH_SAMPLE:
                mismatches.append({
                    "trace": path.stem, "chunk": chunk,
                    "oracle": {"action": o["action"], "reason": o["reason"], "level": o["level"]} if o else None,
                    "ts": {"action": t["action"], "reason": t["reason"], "level": t.get("level")} if t else None,
                })
    pct = round(100.0 * agree / ticks, 3) if ticks else 0.0
    result = {
        "traces": len(files), "ticks": ticks, "agree": agree, "agreement_pct": pct,
        "pass": pct >= AGREEMENT_PASS_PCT, "threshold_pct": AGREEMENT_PASS_PCT,
        "ts_invariant_violations": ts_invariant_violations,
        "mismatches": mismatches,
    }
    out_path.write_text(json.dumps(result, indent=1) + "\n")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--traces", type=Path, default=Path("evidence/controller/traces"))
    parser.add_argument("--out", type=Path, default=Path("evidence/controller/oracle"))
    parser.add_argument("--compare", type=Path, help="directory of TS controller outputs, same filenames as traces")
    parser.add_argument("--agreement-out", type=Path, default=Path("evidence/controller/agreement.json"))
    args = parser.parse_args()

    summary = run_oracle(args.traces, args.out)
    failed = [k for k, r in summary["invariants"].items() if r["pass"] is False]
    print(f"oracle: {summary['traces']} traces, {summary['ticks']} ticks, "
          f"invariants {'all pass' if not failed else 'FAIL ' + ','.join(failed)}")

    if args.compare is None:
        return 1 if failed else 0
    result = compare(args.out, args.compare, args.traces, args.agreement_out)
    print(f"agreement: {result['agree']}/{result['ticks']} = {result['agreement_pct']}% "
          f"({'pass' if result['pass'] else 'FAIL'}, threshold {AGREEMENT_PASS_PCT}%)")
    return 0 if result["pass"] and not failed else 1


if __name__ == "__main__":
    sys.exit(main())
