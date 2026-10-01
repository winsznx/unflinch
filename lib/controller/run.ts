import { decide, initialControllerState } from "./decide";
import { checkInvariants, type InvariantViolation } from "./invariants";
import type { ControllerConfig, Decision, TickInput } from "./types";

export type Trace = {
  config: ControllerConfig & { startLevel?: number };
  ticks: TickInput[];
};

export type TraceRun = {
  decisions: Decision[];
  violations: InvariantViolation[];
};

export function runTrace(trace: Trace): TraceRun {
  let state = initialControllerState(trace.config, trace.config.startLevel ?? 1);
  const decisions: Decision[] = [];
  const violations: InvariantViolation[] = [];
  for (const tick of trace.ticks) {
    const step = decide(state, tick);
    violations.push(...checkInvariants(state, step.decision));
    decisions.push(step.decision);
    state = step.state;
    if (state.ended) break;
  }
  return { decisions, violations };
}
