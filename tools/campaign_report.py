"""Proof-campaign report (E3, E4, E9, F4). Reads only exported receipts, event logs and recordings,
never app code, like the other tools here.

    tools/.venv/bin/python tools/campaign_report.py calibrate   # build spliced known-cut clips, suggest a threshold
    tools/.venv/bin/python tools/campaign_report.py report      # score every trial with the frozen threshold

Inputs: evidence/campaign/<experiment>/<session>/{trial-1.receipt.json, events.json} from
`pnpm campaign:export`, recordings in .data/campaign/<session>.webm.

Calibration uses only spliced clips: two different campaign recordings joined at a known frame, so
the ground truth doesn't depend on the detector. Restart-baseline clips are not used as known cuts:
the baseline hands off the last frame, so whether a restart shows as a hard cut is itself an E4 result.
"""
from __future__ import annotations

import csv
import json
import statistics
import subprocess
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).parent))
import cutdetect  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CAMPAIGN = ROOT / "evidence/campaign"
VIDEOS = ROOT / ".data/campaign"
SPLICES = VIDEOS / "splices"
MORPH = {"morph", "e3", "safe"}


def trials() -> list[dict]:
    out = []
    for receipt_path in sorted(CAMPAIGN.glob("*/*/trial-1.receipt.json")):
        exp, session = receipt_path.parent.parent.name, receipt_path.parent.name
        receipt = json.loads(receipt_path.read_text())
        events = json.loads((receipt_path.parent / "events.json").read_text())
        video = VIDEOS / f"{session}.webm"
        out.append({"exp": exp, "session": session, "receipt": receipt, "events": events,
                    "video": video if video.exists() else None})
    return out


def frame_count(path: Path) -> int:
    cap = cv2.VideoCapture(str(path))
    n = 0
    while cap.read()[0]:
        n += 1
    cap.release()
    return n


def splice(a: Path, b: Path, out: Path, a_from: float, b_from: float, seconds: float = 8.0) -> None:
    """A[a_from, +seconds] then B[b_from, +seconds], re-encoded so the join is a real hard cut."""
    parts = []
    for i, (src, start) in enumerate(((a, a_from), (b, b_from))):
        part = out.with_name(f"{out.stem}.part{i}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-i", str(src), "-t", str(seconds),
                        "-an", "-vf", "fps=18,scale=1280:720", "-c:v", "libx264", "-crf", "18", str(part)], check=True)
        parts.append(part)
    listing = out.with_suffix(".txt")
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-c", "copy", str(out)], check=True)
    first = frame_count(parts[0])
    out.with_name(out.name + ".cuts.json").write_text(json.dumps([first]))
    for p in parts:
        p.unlink()
    listing.unlink()


def duration(path: Path) -> float:
    _, _, times = cutdetect.correlations(path)
    return times[-1] - times[0] if len(times) > 1 else 0.0


def calibrate() -> None:
    # Sources must be continuous: restart-baseline recordings contain restarts, which would enter the
    # calibration as mislabelled non-cut frames.
    clips = [t["video"] for t in trials() if t["video"] is not None and (t["receipt"].get("condition") or {}).get("mode") != "restart"]
    clips = [c for c in clips if duration(c) >= 50]
    if len(clips) < 4:
        raise SystemExit("need at least 4 continuous recordings of 50 s or more")
    SPLICES.mkdir(parents=True, exist_ok=True)
    for old in SPLICES.glob("*"):
        old.unlink()
    made = []
    # Pair recordings from different runs; vary the offsets so joins land on different scene states.
    for i in range(min(10, len(clips) - 1)):
        out = SPLICES / f"splice_{i:02d}.mp4"
        splice(clips[i], clips[i + 1], out, a_from=10 + 4 * (i % 4), b_from=26 + 5 * (i % 3))
        made.append(out)
    result = cutdetect.calibrate(made, cuts_per_clip=1)
    result["clips"] = [p.name for p in made]
    result["method"] = "spliced pairs of different campaign recordings, 8 s each side, re-encoded at 18 fps"
    result["cut_corrs"] = sorted(round(c, 4) for c in result.pop("cut_corr_list", []))
    (ROOT / "evidence/ablation").mkdir(parents=True, exist_ok=True)
    (ROOT / "evidence/ablation/calibration.json").write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps(result, indent=1))


def landed_chunks(d: dict) -> int | None:
    return None if d.get("landed_chunk") is None else d["landed_chunk"] - d["chunk"]


def last_before(events: list[dict], kinds: set[str], t: float, match=None) -> float | None:
    best = None
    for e in events:
        if e["kind"] in kinds and e["t_ms"] <= t and (match is None or match(e)):
            best = e["t_ms"]
    return best


INPUT_FOR = {
    "CEILING_BODY": ({"sim"}, lambda e: e["payload"].get("mode") == "spike"),
    "CEILING_SUDS": ({"suds"}, lambda e: e["payload"].get("v", 0) >= 9),
    "PATIENT_CLOSER": ({"intent"}, lambda e: e["payload"].get("kind") == "closer"),
    "PATIENT_SAFE": ({"intent"}, lambda e: e["payload"].get("kind") == "safe"),
}


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


CHUNK_S = 1.833
INTENT_TTL_S = 6 * CHUNK_S
SAFETY_HOLDS = {"COOLDOWN", "CEILING_HOLD", "NO_SIGNAL", "CEILING_BODY", "CEILING_SUDS"}


def refusals(t: dict) -> list[dict]:
    """Every step-closer request and what the controller did with it within the intent's lifetime."""
    r, events = t["receipt"], t["events"]
    decisions = sorted(r["decisions"], key=lambda d: d["t"])
    if not decisions:
        return []
    end_t = decisions[-1]["t"]
    cap = max([d["level_after"] for d in decisions if d["reason"] == "EXPECTANCY_TEST"] or [6])
    rows = []
    for e in events:
        if e["kind"] != "intent" or e["payload"].get("kind") != "closer" or e["t_ms"] > end_t:
            continue
        t0 = e["t_ms"]
        before = [d for d in decisions if d["t"] <= t0]
        level = before[-1]["level_after"] if before else 1
        window = [d for d in decisions if t0 <= d["t"] <= t0 + INTENT_TTL_S * 1000]
        honored = next((d for d in window if d["reason"] == "PATIENT_CLOSER"), None)
        if honored:
            held = [d["reason"] for d in window if d["t"] < honored["t"] and d["reason"] in SAFETY_HOLDS]
            outcome = "deferred" if held else "honored"
            why, delay = (held[0] if held else ""), round(honored["t"] - t0)
        else:
            reasons = [d["reason"] for d in window]
            if level >= cap:
                why = "AT_CAP"
            elif before and before[-1]["reason"] in ("PATIENT_SAFE", "PAUSE") or "PAUSED" in reasons:
                why = "PAUSED"
            else:
                why = next((x for x in reasons if x in SAFETY_HOLDS), reasons[0] if reasons else "LANDING")
            outcome, delay = "refused", None
        rows.append({"experiment": t["exp"], "session": t["session"], "t_ms": t0, "level": level,
                     "outcome": outcome, "reason": why, "delay_ms": delay})
    return rows


def report() -> None:
    threshold = cutdetect.FROZEN_THRESHOLD
    rows_cuts, rows_lat, rows_neutral, rows_refusal = [], [], [], []
    for t in trials():
        r, events = t["receipt"], t["events"]
        sent = [d for d in r["decisions"] if d.get("prompt") and d.get("outcome") != "not_sent"]
        restarts = sum(1 for d in sent if d.get("landed_by") == "restart")
        if t["video"] is not None:
            det = cutdetect.detect(t["video"], threshold)
            corrs, _, times = cutdetect.correlations(t["video"])
            rows_cuts.append({
                "experiment": t["exp"], "session": t["session"], "condition": json.dumps(r.get("condition")),
                "duration_s": round(times[-1] - times[0], 1) if len(times) > 1 else 0, "frames": det["frames"],
                "cuts": len(det["cuts"]), "restarts": restarts, "min_corr": round(min(corrs), 4) if corrs else None,
                "threshold": threshold, "ended_by": r.get("ended_by"),
            })
        for d in sent:
            kinds, match = INPUT_FOR.get(d["reason"], (set(), None))
            src = last_before(events, kinds, d["t"], match) if kinds else None
            rows_lat.append({
                "experiment": t["exp"], "session": t["session"], "chunk": d["chunk"], "reason": d["reason"],
                "kind": d["kind"], "level_before": d["level_before"], "level_after": d["level_after"],
                "input_to_decision_ms": None if src is None else round(d["t"] - src),
                "accepted_ms": d.get("accepted_ms"), "landed_chunks": landed_chunks(d), "landed_by": d.get("landed_by"),
                "outcome": d.get("outcome"),
            })
        if t["exp"] in MORPH:
            rows_refusal.extend(refusals(t))
        if t["exp"] == "nosend":
            withheld = [d for d in r["decisions"] if d.get("outcome") == "not_sent"]
            rows_neutral.append({
                "session": t["session"], "duration_s": rows_cuts[-1]["duration_s"] if t["video"] else None,
                "decisions_withheld": len(withheld), "levels_reached": max([d["level_after"] for d in withheld], default=1),
                "rater_approach_events": "", "rater_retreat_events": "", "rater": "",
            })

    def write(path: str, rows: list[dict]) -> None:
        if not rows:
            return
        out = ROOT / path
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    write("evidence/ablation/cuts.csv", rows_cuts)
    write("evidence/live/latency.csv", rows_lat)
    write("evidence/live/neutral.csv", rows_neutral)
    write("evidence/ablation/latency.csv", [row for row in rows_lat if row["experiment"] in {"morph", "restart"}])
    write("evidence/live/refusals.csv", rows_refusal)

    def by(exp: set[str], rows: list[dict]) -> list[dict]:
        return [row for row in rows if row["experiment"] in exp]

    retreats = [row for row in by(MORPH, rows_lat) if row["reason"].startswith("CEILING") and row["landed_chunks"] is not None]
    landed = [row["landed_chunks"] for row in retreats]
    summary = {
        "threshold": threshold,
        "cuts": {
            exp: {"trials": len(by({exp}, rows_cuts)), "trials_with_cuts": sum(1 for row in by({exp}, rows_cuts) if row["cuts"] > 0),
                  "cuts": sum(row["cuts"] for row in by({exp}, rows_cuts)), "restarts": sum(row["restarts"] for row in by({exp}, rows_cuts))}
            for exp in sorted({row["experiment"] for row in rows_cuts})
        },
        "ceiling_retreats_morph": {
            "n": len(landed), "median_landed_chunks": median(landed),
            "p90_landed_chunks": pct(landed, 0.9),
            "median_input_to_decision_ms": median([row["input_to_decision_ms"] for row in retreats if row["input_to_decision_ms"] is not None]),
            "landed_by": sorted({row["landed_by"] for row in retreats}),
        },
        "accept_ms": {
            exp: median([row["accepted_ms"] for row in by({exp}, rows_lat) if row["accepted_ms"] is not None])
            for exp in sorted({row["experiment"] for row in rows_lat})
        },
        "nosend": {"trials": len(rows_neutral), "rated": 0},
        "approach_requests": {
            "n": len(rows_refusal),
            "honored": sum(1 for row in rows_refusal if row["outcome"] == "honored"),
            "median_honor_delay_ms": median([row["delay_ms"] for row in rows_refusal if row["outcome"] == "honored"]),
            "deferred": sum(1 for row in rows_refusal if row["outcome"] == "deferred"),
            "median_deferred_delay_ms": median([row["delay_ms"] for row in rows_refusal if row["outcome"] == "deferred"]),
            "deferred_by_reason": dict(sorted(
                ((reason, sum(1 for row in rows_refusal if row["outcome"] == "deferred" and row["reason"] == reason)) for reason in
                 {row["reason"] for row in rows_refusal if row["outcome"] == "deferred"}),
                key=lambda kv: -kv[1])),
            "refused_by_reason": dict(sorted(
                ((reason, sum(1 for row in rows_refusal if row["reason"] == reason)) for reason in
                 {row["reason"] for row in rows_refusal if row["outcome"] == "refused"}),
                key=lambda kv: -kv[1])),
        },
        "safe_place": {
            "n": len([row for row in rows_lat if row["reason"] == "PATIENT_SAFE"]),
            "median_input_to_decision_ms": median([row["input_to_decision_ms"] for row in rows_lat if row["reason"] == "PATIENT_SAFE" and row["input_to_decision_ms"] is not None]),
            "median_accepted_ms": median([row["accepted_ms"] for row in rows_lat if row["reason"] == "PATIENT_SAFE" and row["accepted_ms"] is not None]),
            "median_landed_chunks": median([row["landed_chunks"] for row in rows_lat if row["reason"] == "PATIENT_SAFE" and row["landed_chunks"] is not None]),
        },
    }
    (ROOT / "evidence/campaign/summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    {"calibrate": calibrate, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
