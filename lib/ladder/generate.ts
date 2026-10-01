import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { closestCurated, matchCurated } from "./curated";
import { formatLintIssues, lintLadder, type LintIssue } from "./lint";
import { Ladder, type LadderSource } from "./schema";

const MAX_RETRIES = 2;

const SYSTEM = `You write exposure-practice ladders for Visko Orbis, a live video world model that morphs one continuous scene at each chunk boundary.

Output one JSON object matching the schema. Rules:
- Photoreal, ordinary daylight scenes. Animals, places and camera moves only. Never include people, faces, hands or text.
- One context per distinct place (1 to 3 contexts). Each context has its own distance scale and 4 to 6 levels of rising proximity or engagement.
- "safe": the empty scene before the subject arrives. WHO + WHAT + WHERE + camera, under 100 words, ending with framing and camera motion, e.g. "Wide shot, eye-level, static camera, deep depth of field."
- "state" for each level: an absolute prompt that restates subject, pose, place and the same camera sentence, under 100 words.
- "enter": the subject arrives by action. "exit": the subject leaves by action. For a place-based fear (heights, bridges), the camera moves instead.
- "up" (level-1 to level), "down" (level to level-1), "selfApproach" (the camera moves closer) and each "holds" item: one visible action, under 30 words, at most two "and", at most two commas, never the word "then".
- Use the same subject wording in every prompt. Positive phrasing only: never write no, not, without, never, nothing.
- Never describe harm: no biting, attacking, lunging, growling, falling, crashing, drowning, stinging, blood, injury, screaming.
- No adjectives of intent such as cinematic, dramatic, beautiful, scary, calming.
- "ev": the benign resolution of the feared outcome the person stated, staged at the top level. Show the feared thing happening harmlessly, never the harm.
- "deepened": at most one mildly more intense but harmless cue for a therapist.`;

export type GenerateResult = {
  ladder: Ladder;
  source: LadderSource;
  attempts: number;
  lint: LintIssue[];
  model: string | null;
};

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

export async function generateLadder(fear: string, fearedOutcome: string): Promise<GenerateResult> {
  const curated = matchCurated(fear);
  if (curated) return { ladder: curated, source: "curated", attempts: 0, lint: [], model: null };

  const ai = client();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!ai) {
    return { ladder: closestCurated(fear), source: "fallback", attempts: 0, lint: [], model: null };
  }

  const schema = z.toJSONSchema(Ladder);
  let feedback = "";
  let lastIssues: LintIssue[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    const prompt = [
      `Fear (subject, max 240 chars): ${fear.slice(0, 240)}`,
      `Feared outcome the person stated: ${fearedOutcome.slice(0, 240)}`,
      `Use a short lowercase fearId slug.`,
      feedback && `Your previous ladder failed lint. Fix every issue:\n${feedback}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0.4,
        },
      });
      const parsed = Ladder.safeParse(JSON.parse(response.text ?? ""));
      if (!parsed.success) {
        feedback = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
        continue;
      }
      lastIssues = lintLadder(parsed.data);
      if (lastIssues.length === 0) {
        return { ladder: parsed.data, source: "generated", attempts: attempt, lint: [], model };
      }
      feedback = formatLintIssues(lastIssues);
    } catch (error) {
      feedback = `The response was not valid JSON (${error instanceof Error ? error.message : String(error)}).`;
    }
  }

  return { ladder: closestCurated(fear), source: "fallback", attempts: MAX_RETRIES + 1, lint: lastIssues, model };
}
