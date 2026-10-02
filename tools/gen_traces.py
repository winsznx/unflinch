#!/usr/bin/env python3
"""Deterministic controller trace generator for E2 (PRD §5.2).

Each trace is a fixed trial config plus one input record per chunk tick. The
generator only produces inputs. It knows nothing about the controller or the
oracle, so neither can shape the traces they are scored on (PRD §5.3).

Usage:
    python tools/gen_traces.py [--n 100] [--seed 2026] [--out evidence/controller/traces]
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

SCHEMA = "unflinch.controller_trace.v1"
CHUNK_S = 1.833
TRIAL_MAX = 48
START_LEVEL = 1

AROUSAL_CALM = ("LOW", "WINDOW", "HIGH")
INTENTS = ("closer", "back")
THERAPIST_COMMANDS = ("approach", "retreat", "vary", "ev_now")


class TraceBuilder:
    """Mutable per-tick input arrays that scenario planters write into."""

    def __init__(self, rng: random.Random, n_ticks: int):
        self.rng = rng
        self.n = n_ticks
        self.arousal = self._base_arousal()
        self.suds_reports: dict[int, int] = {}
        self.suds_blackout: set[int] = set()
        self.intent: list[str | None] = [None] * n_ticks
        self.therapist: list[str | None] = [None] * n_ticks
        self.generation_complete_from: int | None = None
        self.tags: list[list[str]] = [[] for _ in range(n_ticks)]

    def _base_arousal(self) -> list[str]:
        """Sticky random walk over the calm classes, biased toward LOW/WINDOW."""
        weights = {"LOW": 0.45, "WINDOW": 0.4, "HIGH": 0.15}
        state = self.rng.choice(("LOW", "WINDOW"))
        out = []
        for _ in range(self.n):
            if self.rng.random() < 0.18:
                state = self.rng.choices(list(weights), list(weights.values()))[0]
            out.append(state)
        return out

    def free_slot(self, lo: int, hi: int) -> int:
        return self.rng.randint(max(0, lo), max(0, min(self.n - 1, hi)))

    def paint(self, start: int, length: int, value: str, tag: str) -> None:
        for i in range(start, min(self.n, start + length)):
            self.arousal[i] = value
            self.tags[i].append(tag)


def plant_spike(b: TraceBuilder) -> None:
    """Keyboard-sim `S`: rate spike that the classifier reports as HIGH then OVERLOAD."""
    start = b.free_slot(4, b.n - 8)
    b.paint(start, 1, "HIGH", "spike_onset")
    b.paint(start + 1, b.rng.randint(3, 9), "OVERLOAD", "spike")


def plant_breath_hold(b: TraceBuilder) -> None:
    """Keyboard-sim `H`: a 15 s hold crosses holdBreathS=12 late, so OVERLOAD is brief."""
    start = b.free_slot(4, b.n - 6)
    b.paint(start, b.rng.randint(5, 6), "WINDOW", "breath_hold")
    b.paint(start + 6, b.rng.randint(2, 3), "OVERLOAD", "breath_hold_overload")


def plant_dropout(b: TraceBuilder) -> None:
    """Sensor unplugged: arousal UNKNOWN and the SUDS channel shows nothing."""
    start = b.free_slot(3, b.n - 5)
    length = b.rng.randint(3, 10)
    b.paint(start, length, "UNKNOWN", "dropout")
    b.suds_blackout.update(range(start, min(b.n, start + length)))


def plant_low_stretch(b: TraceBuilder) -> None:
    """Long under-engaged stretch so autoMode climbs toward the cap and the EV path runs."""
    start = b.free_slot(0, b.n // 3)
    b.paint(start, b.rng.randint(14, 34), "LOW", "low_stretch")


def plant_suds_high(b: TraceBuilder) -> None:
    t = b.free_slot(5, b.n - 3)
    b.suds_reports[t] = b.rng.choice((9, 10))
    b.tags[t].append("suds_high")


def plant_suds_low_streak(b: TraceBuilder) -> None:
    """Patient reports ≤2 while breath reads elevated, which tests the SUDS override."""
    t = b.free_slot(3, b.n - 8)
    for k in range(b.rng.randint(1, 3)):
        tick = t + k * b.rng.randint(3, 6)
        if tick < b.n:
            b.suds_reports[tick] = b.rng.choice((0, 1, 2))
            b.tags[tick].append("suds_low")
    if b.rng.random() < 0.5:
        b.paint(t, 4, "HIGH", "suds_low_vs_high_body")


def plant_routine_suds(b: TraceBuilder) -> None:
    t = b.rng.randint(0, 6)
    while t < b.n:
        b.suds_reports.setdefault(t, b.rng.randint(3, 8))
        t += b.rng.randint(6, 18)


def plant_intents(b: TraceBuilder) -> None:
    for _ in range(b.rng.randint(1, 5)):
        t = b.free_slot(2, b.n - 2)
        if b.intent[t] is None:
            b.intent[t] = b.rng.choice(INTENTS)
            b.tags[t].append("intent")


def plant_pause(b: TraceBuilder) -> None:
    t = b.free_slot(6, b.n - 12)
    gap = b.rng.randint(2, 8)
    b.intent[t] = "pause"
    b.tags[t].append("pause")
    if t + gap < b.n:
        b.intent[t + gap] = "resume"
        b.tags[t + gap].append("resume")
    if b.rng.random() < 0.3:
        mid = t + b.rng.randint(1, gap - 1) if gap > 1 else None
        if mid is not None and b.intent[mid] is None:
            b.intent[mid] = b.rng.choice(("closer", "back", "pause"))
            b.tags[mid].append("intent_while_paused")


def plant_safe(b: TraceBuilder) -> None:
    """A safe place (C8), sometimes during a spike, followed by a resume."""
    t = b.free_slot(6, b.n - 12)
    b.intent[t] = "safe"
    b.tags[t].append("safe")
    gap = b.rng.randint(3, 10)
    if t + gap < b.n and b.intent[t + gap] is None:
        b.intent[t + gap] = "resume"
        b.tags[t + gap].append("resume")


def plant_stray_resume(b: TraceBuilder) -> None:
    t = b.free_slot(2, b.n - 2)
    if b.intent[t] is None:
        b.intent[t] = "resume"
        b.tags[t].append("stray_resume")


def plant_therapist(b: TraceBuilder) -> None:
    for _ in range(b.rng.randint(1, 4)):
        t = b.free_slot(2, b.n - 2)
        if b.therapist[t] is None:
            b.therapist[t] = b.rng.choice(THERAPIST_COMMANDS)
            b.tags[t].append("therapist")


def plant_end(b: TraceBuilder) -> None:
    t = b.free_slot(20, b.n - 1)
    if b.rng.random() < 0.5:
        b.intent[t] = "end"
    else:
        b.therapist[t] = "end_trial"
    b.tags[t].append("end_request")


def plant_generation_complete(b: TraceBuilder) -> None:
    b.generation_complete_from = b.free_slot(20, b.n - 1)


PLANTERS = (
    (plant_spike, 0.85, (1, 3)),
    (plant_breath_hold, 0.5, (1, 2)),
    (plant_dropout, 0.6, (1, 2)),
    (plant_low_stretch, 0.75, (1, 2)),
    (plant_suds_high, 0.6, (1, 3)),
    (plant_suds_low_streak, 0.4, (1, 1)),
    (plant_intents, 0.8, (1, 1)),
    (plant_pause, 0.45, (1, 1)),
    (plant_stray_resume, 0.1, (1, 1)),
    (plant_therapist, 0.45, (1, 1)),
    (plant_end, 0.12, (1, 1)),
    (plant_generation_complete, 0.15, (1, 1)),
    (plant_safe, 0.35, (1, 1)),
)


def suds_channel(b: TraceBuilder) -> list[dict | None]:
    """Latest-sample view per tick. A new report resets ageS to < 1 chunk, so
    consumers can detect arrivals by ageS dropping. The view goes null during
    a dropout and stays null until the next report."""
    out: list[dict | None] = []
    latest: tuple[int, float] | None = None
    for i in range(b.n):
        if i in b.suds_reports and i not in b.suds_blackout:
            latest = (b.suds_reports[i], round(b.rng.uniform(0.0, 1.5), 3))
            out.append({"value": latest[0], "ageS": latest[1]})
            continue
        if i in b.suds_blackout:
            latest = None
        if latest is None:
            out.append(None)
            continue
        latest = (latest[0], round(latest[1] + CHUNK_S, 3))
        out.append({"value": latest[0], "ageS": latest[1]})
    return out


def build_trace(index: int, seed: int) -> dict:
    rng = random.Random(seed * 1_000_003 + index)
    b = TraceBuilder(rng, rng.randint(60, 100))
    plant_routine_suds(b)
    for planter, probability, (lo, hi) in PLANTERS:
        if rng.random() < probability:
            for _ in range(rng.randint(lo, hi)):
                planter(b)

    suds = suds_channel(b)
    ticks = []
    for i in range(b.n):
        ticks.append({
            "chunkIndex": i,
            "arousal": b.arousal[i],
            "suds": suds[i],
            "intent": b.intent[i],
            "therapist": b.therapist[i],
            "generationComplete": b.generation_complete_from is not None and i >= b.generation_complete_from,
            "tags": b.tags[i],
        })
    return {
        "schema": SCHEMA,
        "id": f"trace_{index:03d}",
        "seed": seed,
        "config": {
            "cap": rng.randint(4, 6),
            "autoMode": rng.random() < 0.7,
            "trialMax": TRIAL_MAX,
            "startLevel": START_LEVEL,
        },
        "chunkS": CHUNK_S,
        "ticks": ticks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=100)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--out", type=Path, default=Path("evidence/controller/traces"))
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    for index in range(args.n):
        trace = build_trace(index, args.seed)
        (args.out / f"{trace['id']}.json").write_text(json.dumps(trace, indent=1) + "\n")
    print(f"wrote {args.n} traces to {args.out} (seed {args.seed})")


if __name__ == "__main__":
    main()
