// Start values from PRD §4.4. Tune only through G1/E3 evidence and log every change in docs/GATES.md.
export const POLICY = {
  minChunksBetweenSends: 2,
  cooldownChunksAfterRetreat: 6,
  ceilingRefireChunks: 6,
  sudsCeiling: 9,
  sudsLow: 2,
  sudsMaxAgeS: 30,
  sudsReaskS: 25,
  lowStableChunks: 6,
  varyEveryChunks: 6,
  stallNudgeChunks: 10,
  evHoldChunks: 10,
  trialMaxChunks: 48,
  intentTtlChunks: 6,
  overload: { rateRatio: 1.5, rateAbs: 24, holdBreathS: 12, sustainChunks: 2 },
  high: { rateRatio: 1.25, cv: 0.35 },
  low: { rateRatio: 1.05, cv: 0.2 },
  sensorStaleS: 5,
} as const;

export const CHUNK_FRAMES = 33;
export const CHUNK_FPS = 18;
export const CHUNK_SECONDS = CHUNK_FRAMES / CHUNK_FPS;

export type Policy = typeof POLICY;
