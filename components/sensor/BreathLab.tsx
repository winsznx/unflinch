"use client";

import { useEffect, useRef, useState } from "react";

import { BreathEstimator, type BreathEstimate } from "@/lib/signal/breath";

import { requestMotionAccess, useDeviceMotion, useMotionApi, useWakeLock } from "./motion";
import { MiniTrace, SignalBar } from "./parts";
import "./sensor.css";

const TARGETS = [6, 10, 15, 20] as const;
const PLACEMENTS = ["seated chest", "reclined chest"] as const;
const RUN_MS = 60_000;
const SAMPLE_MS = 500;
const TRACE_POINTS = 200;
const CSV_HEADER = "person,placement,target_bpm,measured_bpm,abs_error,median_conf,n_samples,started_at";

type Target = (typeof TARGETS)[number];
type Placement = (typeof PLACEMENTS)[number];
type RunMeta = { person: string; placement: Placement; target: Target; startedAt: number };
type CompletedRun = RunMeta & { samples: BreathEstimate[] };
type Readout = { rate: number | null; conf: number; trace: number[] };
type SensorProblem = "denied" | "unsupported" | null;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** `n_samples` counts the 2 Hz estimates that carried a rate, i.e. the ones the median is taken over. */
function summarise(run: CompletedRun) {
  const rates = run.samples.flatMap((s) => (s.rate === null ? [] : [s.rate]));
  const measured = median(rates);
  return {
    measured,
    absError: measured === null ? null : Math.abs(measured - run.target),
    medianConf: median(run.samples.map((s) => s.conf)),
    nSamples: rates.length,
  };
}

const fixed = (value: number | null, digits: number) => (value === null ? "" : value.toFixed(digits));

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(runs: CompletedRun[]): string {
  const rows = runs.map((run) => {
    const s = summarise(run);
    return [
      csvField(run.person),
      run.placement,
      String(run.target),
      fixed(s.measured, 2),
      fixed(s.absError, 2),
      fixed(s.medianConf, 2),
      String(s.nSamples),
      new Date(run.startedAt).toISOString(),
    ].join(",");
  });
  return [CSV_HEADER, ...rows].join("\n") + "\n";
}

function downloadCsv(runs: CompletedRun[]) {
  const url = URL.createObjectURL(new Blob([toCsv(runs)], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `breath-accuracy-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Raised-cosine pacer: smallest at the start of each breath, largest at the switch from in to out. */
function pacerAt(elapsedMs: number, target: Target) {
  const periodMs = 60_000 / target;
  const phase = (elapsedMs % periodMs) / periodMs;
  return {
    scale: 0.45 + 0.55 * ((1 - Math.cos(2 * Math.PI * phase)) / 2),
    cue: phase < 0.5 ? "Breathe in" : "Breathe out",
  };
}

export function BreathLab() {
  const motionApi = useMotionApi();
  const [person, setPerson] = useState("");
  const [target, setTarget] = useState<Target>(10);
  const [placement, setPlacement] = useState<Placement>("seated chest");
  const [active, setActive] = useState<RunMeta | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [runs, setRuns] = useState<CompletedRun[]>([]);
  const [problem, setProblem] = useState<SensorProblem>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const estimatorRef = useRef<BreathEstimator | null>(null);
  const samplesRef = useRef<BreathEstimate[]>([]);

  const running = active !== null;
  const screenOn = useWakeLock(running);

  useDeviceMotion(
    running,
    (sample) => estimatorRef.current?.push(sample),
    () => {
      setActive(null);
      setProblem("unsupported");
    },
  );

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const estimator = estimatorRef.current;
      if (!estimator) return;
      const now = Date.now();
      const estimate = estimator.estimate(now);
      samplesRef.current.push(estimate);
      setReadout({ rate: estimate.rate, conf: estimate.conf, trace: estimator.waveform(TRACE_POINTS) });
      if (now - active.startedAt >= RUN_MS) {
        const samples = samplesRef.current;
        setRuns((previous) => [...previous, { ...active, samples }]);
        setActive(null);
      }
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      setElapsed(Math.min(RUN_MS, Date.now() - active.startedAt));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  async function start() {
    const access = await requestMotionAccess();
    if (access !== "granted") {
      setProblem(access);
      return;
    }
    setProblem(null);
    estimatorRef.current = new BreathEstimator();
    samplesRef.current = [];
    setReadout(null);
    setElapsed(0);
    setActive({ person: person.trim(), placement, target, startedAt: Date.now() });
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(runs, null, 2));
      setCopyStatus("Copied raw samples.");
    } catch {
      setCopyStatus("Copy failed. The browser blocked clipboard access.");
    }
  }

  const pacer = active ? pacerAt(elapsed, active.target) : null;
  const remainingS = Math.ceil((RUN_MS - elapsed) / 1000);

  return (
    <div className="s-page">
      <main className="s-main s-lab">
        <header className="s-stack">
          <h1 className="s-title">Breath lab</h1>
          <p className="s-body">
            Experiment E1. Put this phone flat on your chest, follow the circle for 60 seconds, then compare the
            measured rate with the target.
          </p>
        </header>

        <section className="s-panel s-stack" aria-label="Run setup">
          <label className="s-label" htmlFor="s-person">
            Person
          </label>
          <input
            id="s-person"
            className="s-text-input"
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            placeholder="Initials or id"
            disabled={running}
          />
          <fieldset className="s-fieldset" disabled={running}>
            <legend className="s-label">Target</legend>
            <div className="s-segmented">
              {TARGETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="s-segment"
                  aria-pressed={target === value}
                  onClick={() => setTarget(value)}
                >
                  {value} bpm
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="s-fieldset" disabled={running}>
            <legend className="s-label">Placement</legend>
            <div className="s-segmented">
              {PLACEMENTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="s-segment"
                  aria-pressed={placement === value}
                  onClick={() => setPlacement(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          {!motionApi || problem === "unsupported" ? (
            <p className="s-notice" role="status">
              This page needs a phone with motion sensors.
            </p>
          ) : null}
          {problem === "denied" ? (
            <p className="s-notice" role="status">
              Motion access was denied. Tap start to ask again.
            </p>
          ) : null}
          {running ? (
            <button type="button" className="s-button s-button-secondary" onClick={() => setActive(null)}>
              Stop without saving
            </button>
          ) : (
            <button
              type="button"
              className="s-button s-button-primary"
              disabled={!motionApi || person.trim() === ""}
              onClick={() => void start()}
            >
              Start 60 s run
            </button>
          )}
        </section>

        <section className="s-panel s-stack s-pacer-panel" aria-label="Pacer">
          <div className="s-pacer">
            <div className="s-pacer-circle" style={{ transform: `scale(${pacer?.scale ?? 0.45})` }} />
            <span className="s-pacer-cue" aria-live="polite">
              {pacer?.cue ?? "Ready"}
            </span>
          </div>
          <div className="s-readout">
            <div>
              <span className="s-label">{running ? `${remainingS} s left` : "Measured"}</span>
              <strong className="s-rate">
                {readout?.rate != null ? `${readout.rate.toFixed(1)} bpm` : "…"}
              </strong>
            </div>
            <SignalBar conf={readout?.conf ?? null} />
          </div>
          <MiniTrace samples={readout?.trace ?? []} label="Breathing trace, last 20 seconds" />
          {running ? (
            <p className="s-hint">{screenOn ? "Screen stays on" : "Keep the screen awake manually"}</p>
          ) : null}
        </section>

        <section className="s-panel s-stack" aria-label="Results">
          <h2 className="s-subtitle">Runs</h2>
          {runs.length ? (
            <div className="s-table-wrap">
              <table className="s-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Placement</th>
                    <th scope="col">Target</th>
                    <th scope="col">Measured</th>
                    <th scope="col">Error</th>
                    <th scope="col">Conf</th>
                    <th scope="col">n</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const s = summarise(run);
                    return (
                      <tr key={run.startedAt}>
                        <td>{run.person}</td>
                        <td>{run.placement}</td>
                        <td>{run.target}</td>
                        <td>{s.measured === null ? "No rate" : s.measured.toFixed(1)}</td>
                        <td>{s.absError === null ? "" : s.absError.toFixed(1)}</td>
                        <td>{fixed(s.medianConf, 2)}</td>
                        <td>{s.nSamples}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="s-body">Finished runs show up here.</p>
          )}
          <div className="s-row">
            <button
              type="button"
              className="s-button s-button-primary"
              disabled={!runs.length}
              onClick={() => downloadCsv(runs)}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="s-button s-button-secondary"
              disabled={!runs.length}
              onClick={() => void copyJson()}
            >
              Copy JSON
            </button>
          </div>
          {copyStatus ? (
            <p className="s-hint" role="status">
              {copyStatus}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
