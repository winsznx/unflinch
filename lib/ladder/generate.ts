import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

import { CATALOG_FEARS } from "./catalog-fears";
import { CATALOG } from "./catalog";
import { closestCurated, matchCurated } from "./curated";
import { formatLintIssues, lintLadder, type LintIssue } from "./lint";
import { Ladder, type LadderSource } from "./schema";

const MAX_RETRIES = 2;
const TRANSIENT_RETRIES = 2;

/** Intake path: fast models, minimal thinking, a hard budget so sentence → scene stays near a minute. */
export const LIVE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const LIVE_BUDGET_MS = 50_000;

/** Offline catalog generation (scripts/generate-catalog.ts): stronger model, no deadline. */
export const CATALOG_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

export type GenerateOptions = { models?: string[]; budgetMs?: number | null; attempts?: number };

const thinkingFor = (model: string) => (model.includes("lite") ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW);

export const SYSTEM = `You write exposure-practice ladders for Visko Orbis, a live video world model that morphs one continuous scene at each chunk boundary.

Output one JSON object matching the schema. Rules:
- Photoreal, ordinary daylight scenes. Animals, places and camera moves only. Never include people, faces, hands or text.
- 2 or 3 contexts, each a distinct ordinary place (for spiders: a garden shed, a living room, a garage). Each context has its own distance scale and 5 or 6 levels of rising proximity or engagement. Level 1 is the subject far away and calm; the top level is right beside the camera. Every step up brings the subject closer to the camera or makes it more active near the camera. A higher level never moves the subject away, out of frame or out of reach.
- "safe": the empty scene before the subject arrives. WHO + WHAT + WHERE + camera, under 100 words, ending with framing and camera motion, e.g. "Wide shot, eye-level, static camera, deep depth of field."
- "state" for each level: an absolute prompt that restates subject, pose, place and the same camera sentence, under 100 words.
- "enter": the subject arrives by action. "exit": the subject leaves by action. For a place-based fear (heights, bridges), the camera moves instead.
- Direction matters. levels[k].up moves the scene from level k-1 INTO level k, so levels[0].up is exactly the same text as "enter". levels[k].down moves the scene from level k BACK to level k-1, so levels[0].down is exactly the same text as "exit". holds are small actions that keep the subject at that level.
- "up", "down", "enter", "exit" and each "holds" item: one visible action, under 30 words, at most two "and", at most two commas, never the word "then". Transitions describe only what changes, without camera framing words.
- Use the same subject wording in every prompt. Positive phrasing only: never write no, not, without, never, nothing.
- Never describe harm: no biting, attacking, lunging, growling, falling, crashing, drowning, stinging, blood, injury, screaming.
- No adjectives of intent such as cinematic, dramatic, beautiful, scary, calming.
- "ev": the benign resolution of the feared outcome the person stated, staged at the top level. Show the feared thing happening harmlessly, never the harm. Each ev prompt is a transition like "up": one action sentence under 30 words, with no shot, framing or camera sentence after it.
- "deepened": at most one mildly more intense but harmless cue for a therapist.`;

export type GenerateResult = {
  ladder: Ladder;
  source: LadderSource;
  attempts: number;
  lint: LintIssue[];
  model: string | null;
  /** Why generation fell back, when it did. */
  error: string | null;
};

/** Shape rules the resolver depends on, checked on generated ladders only (curated heights has one context). */
export function structureIssues(ladder: Ladder): LintIssue[] {
  const issues: LintIssue[] = [];
  if (ladder.contexts.length < 2) {
    issues.push({ path: "contexts", rule: "minContexts", text: `${ladder.contexts.length} context; write 2 or 3 distinct places` });
  }
  ladder.contexts.forEach((context, c) => {
    if (context.levels.length < 5) {
      issues.push({ path: `contexts[${c}].levels`, rule: "minLevels", text: `${context.levels.length} levels; write 5 or 6` });
    }
    const first = context.levels[0];
    if (first && first.up !== context.enter) {
      issues.push({ path: `contexts[${c}].levels[0].up`, rule: "upEqualsEnter", text: "levels[0].up must repeat enter exactly" });
    }
    if (first && first.down !== context.exit) {
      issues.push({ path: `contexts[${c}].levels[0].down`, rule: "downEqualsExit", text: "levels[0].down must repeat exit exactly" });
    }
  });
  return issues;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /"code":\s*(429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|ECONNRESET|fetch failed/i.test(message);
}

/** One structured call, retried on overload and walked down the model chain before giving up. */
export async function callModels(
  ai: GoogleGenAI,
  models: string[],
  args: { contents: string | object[]; schema: unknown; deadline: number | null; system?: string; json?: boolean },
): Promise<{ text: string; model: string }> {
  let lastError: unknown = null;
  for (const model of models) {
    for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
      if (args.deadline !== null && Date.now() > args.deadline) throw new Error("Ladder generation ran out of time");
      try {
        const response = await ai.models.generateContent({
          model,
          contents: args.contents,
          config: {
            systemInstruction: args.system ?? SYSTEM,
            ...(args.json === false ? {} : { responseMimeType: "application/json", responseJsonSchema: args.schema }),
            temperature: 0.4,
            thinkingConfig: { thinkingLevel: thinkingFor(model) },
            ...(args.deadline !== null ? { abortSignal: AbortSignal.timeout(Math.max(1000, args.deadline - Date.now())) } : {}),
          },
        });
        return { text: response.text ?? "", model };
      } catch (error) {
        lastError = error;
        if (!isTransient(error)) break;
        await sleep(600 * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function generateLadder(
  fear: string,
  fearedOutcome: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const curated = matchCurated(fear);
  if (curated) return { ladder: curated, source: "curated", attempts: 0, lint: [], model: null, error: null };

  // Catalog fears were generated offline with the stronger model and linted (G6); reuse them.
  const catalogId = options.models ? null : CATALOG_FEARS.find((f) => f.match.test(fear))?.id;
  const entry = catalogId ? CATALOG[catalogId] : undefined;
  if (entry && lintLadder(entry.ladder).length === 0) {
    return { ladder: entry.ladder, source: "generated", attempts: entry.meta.attempts, lint: [], model: entry.meta.model, error: null };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ladder: closestCurated(fear),
      source: "fallback",
      attempts: 0,
      lint: [],
      model: null,
      error: "GEMINI_API_KEY is not configured",
    };
  }
  const ai = new GoogleGenAI({ apiKey });
  const configured = process.env.GEMINI_MODEL;
  const chain = options.models ?? LIVE_MODELS;
  const models = configured && !options.models ? [configured, ...chain.filter((m) => m !== configured)] : chain;
  const budget = options.budgetMs === undefined ? LIVE_BUDGET_MS : options.budgetMs;
  const deadline = budget === null ? null : Date.now() + budget;
  const schema = z.toJSONSchema(Ladder);

  let model: string | null = models[0] ?? null;
  let feedback = "";
  let lastIssues: LintIssue[] = [];
  let lastError: string | null = null;

  const maxAttempts = options.attempts ?? MAX_RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = [
      `Fear (subject, max 240 chars): ${fear.slice(0, 240)}`,
      `Feared outcome the person stated: ${fearedOutcome.slice(0, 240)}`,
      `Use a short lowercase fearId slug.`,
      feedback && `Your previous ladder failed lint. Fix every issue:\n${feedback}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    let text: string;
    try {
      const response = await callModels(ai, models, { contents: prompt, schema, deadline });
      model = response.model;
      text = response.text;
    } catch (error) {
      // The API itself failed after retries on every model; lint feedback won't help.
      lastError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      break;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      feedback = `The response was not valid JSON (${error instanceof Error ? error.message : String(error)}).`;
      continue;
    }
    const parsed = Ladder.safeParse(raw);
    if (!parsed.success) {
      feedback = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
      continue;
    }
    lastIssues = [...structureIssues(parsed.data), ...lintLadder(parsed.data)];
    if (lastIssues.length === 0) {
      return { ladder: parsed.data, source: "generated", attempts: attempt, lint: [], model, error: null };
    }
    feedback = formatLintIssues(lastIssues);
  }

  return {
    ladder: closestCurated(fear),
    source: "fallback",
    attempts: maxAttempts,
    lint: lastIssues,
    model,
    error: lastError ?? (lastIssues.length ? "Generated ladder failed lint on every attempt" : "Generated ladder failed the schema"),
  };
}
