import { CHUNK_SECONDS, POLICY } from "./policy";
import {
  SENDING_ACTIONS,
  type ActionKind,
  type ControllerConfig,
  type ControllerState,
  type Decision,
  type EffectiveSignal,
  type QueuedIntent,
  type ReasonCode,
  type TickInput,
} from "./types";

const NEVER = Number.NEGATIVE_INFINITY;

export function initialControllerState(
  config: ControllerConfig,
  startLevel = 1,
): ControllerState {
  return {
    config,
    level: Math.min(Math.max(startLevel, 0), config.cap),
    paused: false,
    ended: false,
    lastSendChunk: NEVER,
    cooldownUntil: NEVER,
    lastCeilingChunk: NEVER,
    lowStreakChunks: 0,
    chunksSinceVary: 0,
    chunksAtLevel: 0,
    nudgedLevels: [],
    evDone: false,
    chunksSinceEv: 0,
    trialChunks: 0,
    queuedIntent: null,
  };
}

/**
 * SUDS is the authority at the extremes (PRD §4.5): a fresh rating ≤ sudsLow forces LOW,
 * a fresh rating ≥ sudsCeiling forces the ceiling. Breath only decides the middle.
 */
export function effectiveSignal(
  state: ControllerState,
  input: TickInput,
): EffectiveSignal {
  const sudsFresh =
    input.suds !== null && input.suds.ageS <= POLICY.sudsMaxAgeS;
  const sudsValue = sudsFresh ? input.suds!.value : null;
  const arousal =
    sudsValue !== null && sudsValue <= POLICY.sudsLow ? "LOW" : input.arousal;
  const ceilingFromSuds = sudsValue !== null && sudsValue >= POLICY.sudsCeiling;
  const arrivalChunk = sudsFresh
    ? input.chunkIndex - input.suds!.ageS / CHUNK_SECONDS
    : NEVER;

  return {
    arousal,
    sudsFresh,
    sudsValue,
    ceilingFromSuds,
    ceilingActive: ceilingFromSuds || arousal === "OVERLOAD",
    newSudsHigh: ceilingFromSuds && arrivalChunk > state.lastCeilingChunk,
    noSignal: input.arousal === "UNKNOWN" && !sudsFresh,
  };
}

function liveIntent(
  queued: QueuedIntent | null,
  chunk: number,
): QueuedIntent | null {
  if (!queued) return null;
  return chunk - queued.chunk < POLICY.intentTtlChunks ? queued : null;
}

type Verdict = {
  action: ActionKind;
  reason: ReasonCode;
  consumeIntent?: boolean;
  askSuds?: boolean;
};

/** The PRD §4.4 decision table. First match wins. */
function choose(
  state: ControllerState,
  input: TickInput,
  signal: EffectiveSignal,
  intent: QueuedIntent | null,
): Verdict {
  const { level, config } = state;
  const chunk = input.chunkIndex;
  const therapist = input.therapist;

  if (intent?.kind === "pause" && !state.paused) {
    return { action: "pause", reason: "PAUSE", consumeIntent: true };
  }
  if (state.paused) {
    if (intent?.kind === "resume") {
      return { action: "resume", reason: "RESUME", consumeIntent: true };
    }
    return { action: "none", reason: "PAUSED" };
  }
  if (state.trialChunks >= config.trialMax || input.generationComplete) {
    return { action: "end_trial", reason: "TRIAL_MAX" };
  }
  if (intent?.kind === "end") {
    return { action: "end_trial", reason: "PATIENT_END", consumeIntent: true };
  }
  if (therapist === "end_trial") {
    return { action: "end_trial", reason: "THERAPIST_END" };
  }
  if (chunk - state.lastSendChunk < POLICY.minChunksBetweenSends) {
    return { action: "none", reason: "LANDING" };
  }
  if (
    level > 0 &&
    signal.ceilingActive &&
    (signal.newSudsHigh ||
      chunk >= state.lastCeilingChunk + POLICY.ceilingRefireChunks)
  ) {
    return {
      action: "down",
      reason: signal.ceilingFromSuds ? "CEILING_SUDS" : "CEILING_BODY",
    };
  }
  if (level > 0 && intent?.kind === "back") {
    return { action: "down", reason: "PATIENT_BACK", consumeIntent: true };
  }
  if (level > 0 && therapist === "retreat") {
    return { action: "down", reason: "THERAPIST_BACK" };
  }
  if (chunk < state.cooldownUntil) return { action: "hold", reason: "COOLDOWN" };
  if (signal.ceilingActive) return { action: "hold", reason: "CEILING_HOLD" };
  if (signal.noSignal) {
    return { action: "hold", reason: "NO_SIGNAL", askSuds: true };
  }
  if (therapist === "approach" && level < config.cap) {
    return { action: "up", reason: "THERAPIST" };
  }
  if (therapist === "ev_now" && level > 0 && !state.evDone) {
    return { action: "ev", reason: "EXPECTANCY_TEST" };
  }
  if (therapist === "vary" && level > 0) {
    return { action: "vary", reason: "THERAPIST_VARY" };
  }
  if (intent?.kind === "closer" && level < config.cap) {
    return {
      action: "selfApproach",
      reason: "PATIENT_CLOSER",
      consumeIntent: true,
    };
  }
  if (level === config.cap && !state.evDone) {
    return { action: "ev", reason: "EXPECTANCY_TEST" };
  }
  if (state.evDone && state.chunksSinceEv >= POLICY.evHoldChunks) {
    return { action: "end_trial", reason: "EV_HELD" };
  }
  if (
    config.autoMode &&
    state.lowStreakChunks >= POLICY.lowStableChunks &&
    level < config.cap
  ) {
    return { action: "up", reason: "UNDER_ENGAGED" };
  }
  if (
    level < config.cap &&
    state.chunksAtLevel >= POLICY.stallNudgeChunks &&
    !state.nudgedLevels.includes(level)
  ) {
    return { action: "nudge", reason: "STALL_NUDGE" };
  }
  if (level > 0 && state.chunksSinceVary >= POLICY.varyEveryChunks) {
    return { action: "vary", reason: "VARIABILITY" };
  }
  return { action: "none", reason: "IN_WINDOW" };
}

function levelDelta(action: ActionKind): number {
  if (action === "up" || action === "selfApproach") return 1;
  if (action === "down") return -1;
  return 0;
}

export type Step = { decision: Decision; state: ControllerState };

export function decide(state: ControllerState, input: TickInput): Step {
  const chunk = input.chunkIndex;
  const signal = effectiveSignal(state, input);

  if (state.ended) {
    return {
      state,
      decision: {
        chunk,
        action: "none",
        reason: "ENDED",
        levelBefore: state.level,
        levelAfter: state.level,
        sends: false,
        askSuds: false,
        signal,
      },
    };
  }

  const incoming: QueuedIntent | null = input.intent
    ? { kind: input.intent, chunk }
    : null;
  let queued = liveIntent(incoming ?? state.queuedIntent, chunk);
  // Stepping closer at the cap has nowhere to go; the UI says so and the intent is dropped.
  if (queued?.kind === "closer" && state.level >= state.config.cap) queued = null;

  const verdict = choose(state, input, signal, queued);
  const sends = SENDING_ACTIONS.has(verdict.action);
  const levelAfter = Math.min(
    Math.max(state.level + levelDelta(verdict.action), 0),
    state.config.cap,
  );
  const levelChanged = levelAfter !== state.level;
  const isCeiling =
    verdict.reason === "CEILING_SUDS" || verdict.reason === "CEILING_BODY";
  const isApproach =
    verdict.action === "up" || verdict.action === "selfApproach";

  const next: ControllerState = {
    ...state,
    level: levelAfter,
    paused:
      verdict.action === "pause"
        ? true
        : verdict.action === "resume"
          ? false
          : state.paused,
    ended: verdict.action === "end_trial",
    lastSendChunk: sends ? chunk : state.lastSendChunk,
    lastCeilingChunk: isCeiling ? chunk : state.lastCeilingChunk,
    cooldownUntil: isCeiling
      ? chunk + POLICY.cooldownChunksAfterRetreat
      : state.cooldownUntil,
    lowStreakChunks:
      signal.arousal === "LOW" && !isApproach ? state.lowStreakChunks + 1 : 0,
    chunksSinceVary: sends ? 0 : state.chunksSinceVary + 1,
    chunksAtLevel: levelChanged ? 0 : state.chunksAtLevel + 1,
    nudgedLevels:
      verdict.action === "nudge"
        ? [...state.nudgedLevels, state.level]
        : state.nudgedLevels,
    evDone: state.evDone || verdict.action === "ev",
    chunksSinceEv:
      verdict.action === "ev"
        ? 0
        : state.evDone
          ? state.chunksSinceEv + 1
          : 0,
    trialChunks: state.paused ? state.trialChunks : state.trialChunks + 1,
    queuedIntent: verdict.consumeIntent ? null : queued,
  };

  return {
    state: next,
    decision: {
      chunk,
      action: verdict.action,
      reason: verdict.reason,
      levelBefore: state.level,
      levelAfter,
      sends,
      askSuds: verdict.askSuds ?? false,
      signal,
    },
  };
}

/** Therapist-console settings that change the controller's frame, never a single decision. */
export function applyConfig(
  state: ControllerState,
  patch: Partial<ControllerConfig>,
): ControllerState {
  const config = { ...state.config, ...patch };
  config.cap = Math.min(Math.max(Math.round(config.cap), 1), 6);
  return { ...state, config, level: Math.min(state.level, config.cap) };
}
