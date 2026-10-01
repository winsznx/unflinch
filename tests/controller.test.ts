import { describe, expect, it } from "vitest";

import { decide, initialControllerState } from "@/lib/controller/decide";
import { checkInvariants } from "@/lib/controller/invariants";
import type { Arousal, ControllerState, TickInput } from "@/lib/controller/types";

const config = { cap: 6, autoMode: true, trialMax: 48 };

function tick(chunkIndex: number, patch: Partial<TickInput> = {}): TickInput {
  return {
    chunkIndex,
    arousal: "WINDOW",
    suds: null,
    intent: null,
    therapist: null,
    generationComplete: false,
    ...patch,
  };
}

function run(state: ControllerState, ticks: TickInput[]) {
  const decisions = [];
  for (const input of ticks) {
    const step = decide(state, input);
    expect(checkInvariants(state, step.decision)).toEqual([]);
    decisions.push(step.decision);
    state = step.state;
  }
  return { decisions, state };
}

describe("decide", () => {
  it("retreats on the first eligible tick after SUDS 9", () => {
    const start = { ...initialControllerState(config, 4), lastSendChunk: 9 };
    const { decisions } = run(start, [
      tick(10, { suds: { value: 9, ageS: 0 } }),
      tick(11, { suds: { value: 9, ageS: 1.8 } }),
    ]);
    expect(decisions[0]!.reason).toBe("LANDING");
    expect(decisions[1]).toMatchObject({ action: "down", reason: "CEILING_SUDS", levelAfter: 3 });
  });

  it("rate-limits automatic body retreats to one per refire window", () => {
    const ticks = Array.from({ length: 14 }, (_, i) => tick(i, { arousal: "OVERLOAD" as Arousal }));
    const { decisions } = run(initialControllerState(config, 5), ticks);
    const retreats = decisions.filter((d) => d.reason === "CEILING_BODY").map((d) => d.chunk);
    expect(retreats).toEqual([0, 6, 12]);
  });

  it("never approaches without a signal", () => {
    const ticks = Array.from({ length: 10 }, (_, i) => tick(i, { arousal: "UNKNOWN", intent: i === 0 ? "closer" : null }));
    const { decisions } = run(initialControllerState(config, 1), ticks);
    expect(decisions.every((d) => d.action !== "selfApproach" && d.action !== "up")).toBe(true);
    expect(decisions[0]).toMatchObject({ reason: "NO_SIGNAL", askSuds: true });
  });

  it("honours pause on the next tick and only resumes on request", () => {
    const { decisions } = run(initialControllerState(config, 2), [
      tick(0, { intent: "pause" }),
      tick(1, { intent: "closer" }),
      tick(2, { intent: "resume" }),
    ]);
    expect(decisions.map((d) => d.action)).toEqual(["pause", "none", "resume"]);
  });

  it("steps closer on patient intent, runs the expectancy test at the cap, and ends after it holds", () => {
    const start = initialControllerState({ ...config, cap: 2, autoMode: false }, 1);
    const ticks = [tick(0, { intent: "closer" }), ...Array.from({ length: 14 }, (_, i) => tick(i + 1))];
    const { decisions } = run(start, ticks);
    expect(decisions[0]).toMatchObject({ action: "selfApproach", reason: "PATIENT_CLOSER", levelAfter: 2 });
    const ev = decisions.find((d) => d.action === "ev")!;
    expect(ev.chunk).toBe(2);
    expect(decisions.find((d) => d.action === "end_trial")).toMatchObject({ reason: "EV_HELD", chunk: 13 });
  });

  it("presses on when under-engaged in auto mode", () => {
    const ticks = Array.from({ length: 8 }, (_, i) => tick(i, { suds: { value: 1, ageS: 0 } }));
    const { decisions } = run(initialControllerState(config, 1), ticks);
    expect(decisions.find((d) => d.reason === "UNDER_ENGAGED")?.chunk).toBe(6);
  });

  it("nudges once on a stall without sending", () => {
    const ticks = Array.from({ length: 24 }, (_, i) => tick(i));
    const { decisions } = run(initialControllerState({ ...config, autoMode: false }, 1), ticks);
    const nudges = decisions.filter((d) => d.reason === "STALL_NUDGE");
    expect(nudges).toHaveLength(1);
    expect(nudges[0]!.sends).toBe(false);
  });

  it("ends at trial max", () => {
    const ticks = Array.from({ length: 6 }, (_, i) => tick(i));
    const { decisions } = run(initialControllerState({ ...config, trialMax: 5 }, 1), ticks);
    expect(decisions.at(-1)).toMatchObject({ action: "end_trial", reason: "TRIAL_MAX" });
  });
});
