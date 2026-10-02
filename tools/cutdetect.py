#!/usr/bin/env python3
"""Hard-cut detector for E4 continuity scoring (PRD §5.3).

A cut is a frame whose HSV histogram correlates with the previous frame below
the threshold. The threshold is calibrated once on known cuts (E4 restart
baselines plus spliced clips) and then frozen before any morph run is scored.

Usage:
    python tools/cutdetect.py run.webm [more.webm ...]          # JSON per file to stdout
    python tools/cutdetect.py run.webm --out cuts.json
    python tools/cutdetect.py --calibrate spliced_a.mp4 restart_b.webm [--cuts-per-clip 1]

Calibration ground truth: if `<clip>.cuts.json` exists next to a clip, it must
hold a list of cut frame indices. Otherwise the clip is assumed to contain
exactly --cuts-per-clip cuts, taken as its lowest-correlation frames.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

# Frozen on 2026-10-01 from `tools/campaign_report.py calibrate` (evidence/ablation/calibration.json):
# 10 spliced same-scene clips against 2,814 continuous frames. The ranges overlap, so this is the
# value with the fewest misclassifications: it catches 7 of 10 same-scene splices and flags no
# continuous frame. Cuts between similar views of one scene can still pass under it. Must not
# change after scoring.
FROZEN_THRESHOLD = 0.8171

H_BINS, S_BINS, V_BINS = 32, 16, 8


def frame_hist(frame: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [H_BINS, S_BINS, V_BINS], [0, 180, 0, 256, 0, 256])
    return cv2.normalize(hist, hist).flatten()


def correlations(path: Path) -> tuple[list[float], float, list[float]]:
    """Correlation of each frame with its predecessor (index i is frame i+1),
    the container fps, and each frame's decode timestamp in seconds.
    MediaRecorder webm is variable-rate and often reports a bogus fps, so cut
    times come from timestamps, not frame / fps."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise SystemExit(f"cannot open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    corrs: list[float] = []
    times: list[float] = []
    prev = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        times.append(cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0)
        hist = frame_hist(frame)
        if prev is not None:
            corrs.append(float(cv2.compareHist(prev, hist, cv2.HISTCMP_CORREL)))
        prev = hist
    cap.release()
    return corrs, fps, times


def detect(path: Path, threshold: float) -> dict:
    corrs, fps, times = correlations(path)
    cuts = [
        {"frame": i + 1, "t": round(times[i + 1], 3), "corr": round(c, 4)}
        for i, c in enumerate(corrs) if c < threshold
    ]
    return {"file": str(path), "frames": len(times), "fps": round(fps, 3),
            "cuts": cuts, "threshold": threshold}


def known_cut_frames(path: Path, corrs: list[float], cuts_per_clip: int) -> set[int]:
    sidecar = path.with_name(path.name + ".cuts.json")
    if sidecar.exists():
        return set(json.loads(sidecar.read_text()))
    lowest = np.argsort(corrs)[:cuts_per_clip]
    return {int(i) + 1 for i in lowest}


def calibrate(paths: list[Path], cuts_per_clip: int) -> dict:
    cut_corrs: list[float] = []
    other_corrs: list[float] = []
    for path in paths:
        corrs, _, _ = correlations(path)
        cut_frames = known_cut_frames(path, corrs, cuts_per_clip)
        for i, c in enumerate(corrs):
            (cut_corrs if i + 1 in cut_frames else other_corrs).append(c)
    if not cut_corrs or not other_corrs:
        raise SystemExit("calibration needs clips with both cut and non-cut frames")

    highest_cut, lowest_other = max(cut_corrs), min(other_corrs)
    if highest_cut < lowest_other:
        suggested = (highest_cut + lowest_other) / 2
        errors = 0
    else:
        candidates = sorted(set(cut_corrs + other_corrs))
        def misclassified(th: float) -> int:
            return sum(c >= th for c in cut_corrs) + sum(c < th for c in other_corrs)
        suggested = min(candidates, key=misclassified)
        errors = misclassified(suggested)
    return {
        "clips": [str(p) for p in paths],
        "cut_frames": len(cut_corrs), "non_cut_frames": len(other_corrs),
        "cut_corr_max": round(highest_cut, 4), "non_cut_corr_min": round(lowest_other, 4),
        "non_cut_corr_p01": round(float(np.percentile(other_corrs, 1)), 4),
        "separable": highest_cut < lowest_other,
        "suggested_threshold": round(suggested, 4), "misclassified_at_suggested": errors,
        "frozen_threshold": FROZEN_THRESHOLD,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", type=Path, help="videos to score")
    parser.add_argument("--threshold", type=float, default=FROZEN_THRESHOLD)
    parser.add_argument("--calibrate", nargs="+", type=Path, metavar="CLIP", help="known-cut clips")
    parser.add_argument("--cuts-per-clip", type=int, default=1)
    parser.add_argument("--out", type=Path, help="write JSON here instead of stdout")
    args = parser.parse_args()

    if args.calibrate:
        result: object = calibrate(args.calibrate, args.cuts_per_clip)
    elif args.files:
        reports = [detect(p, args.threshold) for p in args.files]
        result = reports[0] if len(reports) == 1 else reports
    else:
        parser.error("pass videos to score or --calibrate CLIP...")
    text = json.dumps(result, indent=1)
    if args.out:
        args.out.write_text(text + "\n")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
