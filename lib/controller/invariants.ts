import { POLICY } from "./policy";
import type { ControllerState, Decision } from "./types";

export type InvariantViolation = { id: string; chunk: number; detail: string };

/**
 * PRD §4.4 invariants, checked against one decision and the state it was made from.
 * Violations are logged into the receipt, never thrown at the person.
 */
export function checkInvariants(
  before: ControllerState,
  decision: Decision,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { chunk, action, signal } = decision;
  const flag = (id: string, detail: string) =>
    violations.push({ id, chunk, detail });

  const approaching =
    action === "up" || action === "selfApproach" || action === "ev";
  if (
    approaching &&
    (signal.ceilingActive || chunk < before.cooldownUntil || signal.noSignal)
  ) {
    flag("INV1", `${action} while ceiling, cooldown or no signal`);
  }

  // One step at a time, except the patient's safe place, which drops straight to 0 (C8).
  const delta = decision.levelAfter - decision.levelBefore;
  const safePlace = action === "safe" && decision.levelAfter === 0;
  if (Math.abs(delta) > 1 && !safePlace) flag("INV2", `level jumped by ${delta}`);
  if (decision.levelAfter < 0 || decision.levelAfter > before.config.cap) {
    flag("INV2", `level ${decision.levelAfter} outside [0, ${before.config.cap}]`);
  }

  if (decision.sends && chunk - before.lastSendChunk < POLICY.minChunksBetweenSends) {
    flag("INV3", `send ${chunk - before.lastSendChunk} chunks after the last`);
  }

  const eligibleForRetreat =
    before.level > 0 &&
    !before.paused &&
    chunk - before.lastSendChunk >= POLICY.minChunksBetweenSends &&
    chunk - (before.trialStartChunk ?? chunk) < before.config.trialMax;
  if (
    eligibleForRetreat &&
    signal.ceilingActive &&
    (signal.newSudsHigh ||
      chunk >= before.lastCeilingChunk + POLICY.ceilingRefireChunks) &&
    action !== "down" &&
    action !== "safe" &&
    action !== "pause" &&
    action !== "end_trial"
  ) {
    flag("INV4", `retreat owed but action was ${action}`);
  }
  if (
    (decision.reason === "CEILING_SUDS" || decision.reason === "CEILING_BODY") &&
    !signal.newSudsHigh &&
    chunk - before.lastCeilingChunk < POLICY.ceilingRefireChunks
  ) {
    flag("INV4", "automatic retreats closer than the refire window");
  }

  if (before.queuedIntent?.kind === "pause" && !before.paused && action !== "pause") {
    flag("INV5", "pause not honoured on the next tick");
  }

  if (decision.reason === "STALL_NUDGE" && decision.sends) {
    flag("INV8", "STALL_NUDGE sent a prompt");
  }

  return violations;
}
