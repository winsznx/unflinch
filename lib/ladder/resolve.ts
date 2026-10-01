import type { ActionKind } from "@/lib/controller/types";
import type { Ladder, LadderContext } from "./schema";

export function contextById(ladder: Ladder, contextId: string): LadderContext {
  return ladder.contexts.find((context) => context.id === contextId) ?? ladder.contexts[0]!;
}

export function capOf(context: LadderContext): number {
  return context.levels.length;
}

/** Absolute prompt that starts a trial at `level`; level 0 is the safe scene. */
export function absolutePrompt(context: LadderContext, level: number): string {
  if (level <= 0) return context.safe;
  return context.levels[Math.min(level, context.levels.length) - 1]!.state;
}

const words = (text: string) =>
  new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);

/** Pick the expectancy test whose feared outcome shares the most words with what the person wrote. */
export function pickExpectancyTest(ladder: Ladder, fearedOutcome: string): string {
  const target = words(fearedOutcome);
  let best = ladder.ev[0]!;
  let bestScore = -1;
  for (const test of ladder.ev) {
    let score = 0;
    for (const word of words(test.fearedOutcome)) if (target.has(word)) score += 1;
    if (score > bestScore) {
      best = test;
      bestScore = score;
    }
  }
  return best.prompt;
}

export type PromptChoice = { prompt: string; holdIndex?: number };

/**
 * Map one controller action onto a single-action prompt. Holds rotate and never repeat the last one.
 * Returns null when the action sends nothing.
 */
export function promptFor(
  action: ActionKind,
  args: {
    ladder: Ladder;
    context: LadderContext;
    levelBefore: number;
    levelAfter: number;
    fearedOutcome: string;
    lastHoldIndex: number | null;
  },
): PromptChoice | null {
  const { context, levelBefore, levelAfter } = args;
  switch (action) {
    case "up":
      return { prompt: context.levels[levelAfter - 1]!.up };
    // A patient's step closer shows the subject's step up the ladder. A camera-move prompt left the
    // subject where it was, so the level rose while the scene stayed at L1 (evidence/live/82697d2c…).
    case "selfApproach":
      return { prompt: context.levels[levelAfter - 1]!.up };
    case "down":
      return { prompt: context.levels[levelBefore - 1]!.down };
    case "ev":
      return { prompt: pickExpectancyTest(args.ladder, args.fearedOutcome) };
    case "vary": {
      const holds = context.levels[Math.max(levelBefore, 1) - 1]!.holds;
      const start = args.lastHoldIndex === null ? 0 : args.lastHoldIndex + 1;
      const holdIndex = start % holds.length;
      return { prompt: holds[holdIndex]!, holdIndex };
    }
    default:
      return null;
  }
}

/** Plain-language caption for the patient HUD. Never alarming, never red. */
export function captionFor(action: ActionKind, reason: string, context: LadderContext): string | null {
  switch (action) {
    case "down":
      return reason.startsWith("CEILING") ? "Easing off. You're in control." : "Stepping back.";
    case "up":
      return "Moving a little closer.";
    case "selfApproach":
      return "You're stepping closer.";
    case "ev":
      return "Here's the moment you predicted.";
    case "vary":
      return null;
    case "hold":
      return reason === "NO_SIGNAL" ? "How are you now? 0–9" : "Let's hold here a moment.";
    case "nudge":
      return "Ready to step closer?";
    case "pause":
      return "Take your time. Resume when ready.";
    default:
      return context ? null : null;
  }
}
