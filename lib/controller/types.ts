export type Arousal = "UNKNOWN" | "LOW" | "WINDOW" | "HIGH" | "OVERLOAD";

export type IntentKind = "closer" | "back" | "pause" | "resume" | "end" | "safe";

export type TherapistKind =
  | "approach"
  | "retreat"
  | "vary"
  | "ev_now"
  | "end_trial";

export type SudsSample = {
  value: number;
  ageS: number;
};

export type TickInput = {
  chunkIndex: number;
  arousal: Arousal;
  suds: SudsSample | null;
  intent: IntentKind | null;
  therapist: TherapistKind | null;
  generationComplete: boolean;
};

export type ActionKind =
  | "none"
  | "up"
  | "selfApproach"
  | "down"
  | "ev"
  | "hold"
  | "vary"
  | "pause"
  | "resume"
  | "end_trial"
  | "nudge"
  /** Patient's safe place: the subject leaves the scene (level 0) and the controller pauses. */
  | "safe";

export type ReasonCode =
  | "PAUSE"
  | "RESUME"
  | "PAUSED"
  | "TRIAL_MAX"
  | "PATIENT_END"
  | "THERAPIST_END"
  | "LANDING"
  | "CEILING_SUDS"
  | "CEILING_BODY"
  | "PATIENT_BACK"
  | "PATIENT_SAFE"
  | "THERAPIST_BACK"
  | "COOLDOWN"
  | "CEILING_HOLD"
  | "NO_SIGNAL"
  | "THERAPIST"
  | "PATIENT_CLOSER"
  | "EXPECTANCY_TEST"
  | "EV_HELD"
  | "UNDER_ENGAGED"
  | "STALL_NUDGE"
  | "VARIABILITY"
  | "THERAPIST_VARY"
  | "IN_WINDOW"
  | "SUBJECT_ENTER"
  | "ENDED";

export type QueuedIntent = { kind: IntentKind; chunk: number };

export type ControllerConfig = {
  cap: number;
  autoMode: boolean;
  trialMax: number;
};

export type ControllerState = {
  config: ControllerConfig;
  level: number;
  paused: boolean;
  ended: boolean;
  /** Chunk index of the first tick; every "chunks since" counter is a chunk-index distance. */
  trialStartChunk: number | null;
  lastSendChunk: number;
  cooldownUntil: number;
  lastCeilingChunk: number;
  lowStreakChunks: number;
  levelSinceChunk: number | null;
  nudgedLevels: number[];
  evChunk: number | null;
  queuedIntent: QueuedIntent | null;
};

export type EffectiveSignal = {
  arousal: Arousal;
  sudsFresh: boolean;
  sudsValue: number | null;
  ceilingActive: boolean;
  ceilingFromSuds: boolean;
  newSudsHigh: boolean;
  noSignal: boolean;
};

export type Decision = {
  chunk: number;
  action: ActionKind;
  reason: ReasonCode;
  levelBefore: number;
  levelAfter: number;
  sends: boolean;
  askSuds: boolean;
  signal: EffectiveSignal;
};

export const SENDING_ACTIONS: ReadonlySet<ActionKind> = new Set([
  "up",
  "selfApproach",
  "down",
  "ev",
  "vary",
  "safe",
]);
