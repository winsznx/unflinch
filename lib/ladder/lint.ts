import type { Ladder } from "./schema";

export const LINT = {
  maxWordsAbsolute: 100,
  maxWordsTransition: 30,
  negation: /\b(no|not|without|never|nobody|nothing|isn't|doesn't|don't|won't)\b/i,
  harm: /\b(bite|bites|biting|attack|lunge|growl|snarl|crash|drown|sting|blood|injur\w*|wound|scream)\b/i,
  /** "fall" is harm unless something weather-like is what falls (rain, snow, leaves, night, light). */
  fall: /\b(fall|falls|falling|fell)\b/i,
  benignFall: /\b(rain|raindrops?|snow|snowflakes?|leaves|leaf|petals?|night|dusk|darkness|light|sunlight|shadows?|drizzle|hail|water|droplets?)\b[^.,;]{0,32}\b(fall|falls|falling|fell)\b/i,
  people: /\b(man|woman|person|people|boy|girl|child|crowd|face|owner|stranger)\b/i,
  intentAdjectives: /\b(cinematic|dramatic|dynamic|beautiful|scary|terrifying|calming|peaceful)\b/i,
  cameraFraming: /\b(wide shot|medium wide|medium shot|medium close-up|close-up)\b/i,
  cameraMotion: /\b(static camera|handheld|pan|tilt|zoom|POV)\b/i,
  bannedConnective: /\bthen\b/i,
  maxAnd: 2,
  maxCommas: 2,
} as const;

export type PromptKind = "absolute" | "transition";

export type LintIssue = { path: string; rule: string; text: string };

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** Every string that can reach Orbis passes through here. Absolute prompts carry their own camera. */
export function lintPrompt(text: string, kind: PromptKind, path = "prompt"): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (rule: string) => issues.push({ path, rule, text });

  if (!text.trim()) add("empty");
  for (const rule of ["negation", "harm", "people", "intentAdjectives"] as const) {
    if (LINT[rule].test(text)) add(rule);
  }
  if (LINT.fall.test(text) && !LINT.benignFall.test(text)) add("harm");

  if (kind === "absolute") {
    if (wordCount(text) > LINT.maxWordsAbsolute) add("maxWordsAbsolute");
    if (!LINT.cameraFraming.test(text)) add("cameraFraming");
    if (!LINT.cameraMotion.test(text)) add("cameraMotion");
  } else {
    if (wordCount(text) > LINT.maxWordsTransition) add("maxWordsTransition");
    if (LINT.bannedConnective.test(text)) add("bannedConnective");
    if (count(text, /\band\b/gi) > LINT.maxAnd) add("maxAnd");
    if (count(text, /,/g) > LINT.maxCommas) add("maxCommas");
  }
  return issues;
}

export function lintLadder(ladder: Ladder): LintIssue[] {
  const issues: LintIssue[] = [];
  ladder.contexts.forEach((context, c) => {
    const base = `contexts[${c}]`;
    issues.push(...lintPrompt(context.safe, "absolute", `${base}.safe`));
    issues.push(...lintPrompt(context.enter, "transition", `${base}.enter`));
    issues.push(...lintPrompt(context.exit, "transition", `${base}.exit`));
    context.levels.forEach((level, l) => {
      const lp = `${base}.levels[${l}]`;
      if (level.level !== l + 1) {
        issues.push({ path: `${lp}.level`, rule: "levelOrder", text: String(level.level) });
      }
      issues.push(...lintPrompt(level.state, "absolute", `${lp}.state`));
      issues.push(...lintPrompt(level.up, "transition", `${lp}.up`));
      issues.push(...lintPrompt(level.down, "transition", `${lp}.down`));
      if (level.selfApproach) {
        issues.push(...lintPrompt(level.selfApproach, "transition", `${lp}.selfApproach`));
      }
      level.holds.forEach((hold, h) =>
        issues.push(...lintPrompt(hold, "transition", `${lp}.holds[${h}]`)),
      );
    });
  });
  ladder.ev.forEach((test, e) =>
    issues.push(...lintPrompt(test.prompt, "transition", `ev[${e}].prompt`)),
  );
  ladder.deepened.forEach((cue, d) =>
    issues.push(...lintPrompt(cue, "transition", `deepened[${d}]`)),
  );
  return issues;
}

export function formatLintIssues(issues: LintIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.rule}: "${issue.text}"`).join("\n");
}
