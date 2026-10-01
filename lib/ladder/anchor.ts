import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { NANO_BANANA_MODEL } from "@/lib/nano-banana";

import { callModels, LIVE_MODELS } from "./generate";
import { lintContext, lintPrompt, type LintIssue } from "./lint";
import { Context, type Ladder, type LadderContext } from "./schema";

/**
 * "Your street" anchor (PRD §2.5 multiple contexts, G7). A photo of a real place becomes the last round:
 * people and text are removed when an image model is available, the place is described as a safe scene,
 * and one ladder context is generated there for the person's feared subject.
 */

const IMAGE_MODELS = [NANO_BANANA_MODEL, "gemini-3.1-flash-lite-image"];
const BUDGET_MS = 60_000;
export const ANCHOR_CONTEXT_ID = "yourplace";

const EDIT_PROMPT = `Edit this photo of a real place for use as the opening frame of a calm video.
Remove every person, face, body part, and any readable text, signs, house numbers and license plates, filling the gaps naturally.
Keep the place itself, its layout, light and season. Leave the scene empty of animals.
Return one photorealistic image with a 16:9 landscape composition.`;

const DESCRIBE_SYSTEM = `You describe a photographed place as the opening shot for a live video world model.
Write one paragraph under 70 words: the place, surfaces, light and weather, in present tense, ending with exactly
"Wide shot, eye-level, static camera, deep depth of field."
Describe only the place. Never mention people, faces, text, signs or animals. Positive phrasing only: never write no, not, without, never, nothing.
No adjectives of intent such as cinematic, dramatic, beautiful, scary, calming, peaceful.
Return only the paragraph.`;

export type AnchorResult =
  | {
      ok: true;
      image: { data: string; mimeType: string };
      edited: boolean;
      placePrompt: string;
      context: LadderContext;
      model: string | null;
    }
  | { ok: false; reason: string; lint?: LintIssue[] };

function client(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

/** Remove people and text with the image model. Null when no image model is reachable. */
async function cleanPhoto(ai: GoogleGenAI, data: string, mimeType: string) {
  for (const model of IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: EDIT_PROMPT }, { inlineData: { mimeType, data } }],
        config: { abortSignal: AbortSignal.timeout(40_000) },
      });
      const output = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (output?.data) return { data: output.data, mimeType: output.mimeType ?? "image/png", model };
    } catch (error) {
      console.error(`[anchor] ${model} edit failed:`, error instanceof Error ? error.message.slice(0, 200) : error);
    }
  }
  return null;
}

async function describePlace(ai: GoogleGenAI, data: string, mimeType: string, deadline: number) {
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await callModels(ai, LIVE_MODELS, {
      contents: [
        { text: feedback ? `Your last description failed these checks, fix them:\n${feedback}` : "Describe this place." },
        { inlineData: { mimeType, data } },
      ],
      schema: null,
      json: false,
      system: DESCRIBE_SYSTEM,
      deadline,
    });
    const text = response.text.trim().replace(/\s+/g, " ");
    const issues = lintPrompt(text, "absolute", "placePrompt");
    if (!issues.length) return text;
    feedback = issues.map((issue) => issue.rule).join(", ");
  }
  return null;
}

function subjectHint(ladder: Ladder): string {
  const first = ladder.contexts[0]!;
  return [
    `Feared subject: ${ladder.subject} (fearId ${ladder.fearId}).`,
    `How it arrives in another place: "${first.enter}"`,
    `How it approaches there: ${first.levels.slice(1).map((level) => `"${level.up}"`).join(" ")}`,
  ].join("\n");
}

function anchorIssues(context: LadderContext, placePrompt: string): LintIssue[] {
  const issues = lintContext(context, ANCHOR_CONTEXT_ID);
  if (context.safe !== placePrompt) issues.push({ path: "safe", rule: "safeEqualsPlace", text: "safe must repeat the place prompt exactly" });
  if (context.levels.length < 5) issues.push({ path: "levels", rule: "minLevels", text: `${context.levels.length} levels; write 5 or 6` });
  const first = context.levels[0];
  if (first && first.up !== context.enter) issues.push({ path: "levels[0].up", rule: "upEqualsEnter", text: "levels[0].up must repeat enter" });
  if (first && first.down !== context.exit) issues.push({ path: "levels[0].down", rule: "downEqualsExit", text: "levels[0].down must repeat exit" });
  return issues;
}

async function generateContext(ai: GoogleGenAI, ladder: Ladder, placePrompt: string, deadline: number) {
  const schema = z.toJSONSchema(Context);
  let feedback = "";
  let lastIssues: LintIssue[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prompt = [
      `Write ONE context object (not a whole ladder) with id "${ANCHOR_CONTEXT_ID}".`,
      `Its "safe" prompt is exactly: ${placePrompt}`,
      `Every level "state" restates this place, the subject's pose and the same camera sentence.`,
      subjectHint(ladder),
      `Keep the subject wording identical in every prompt and fit each step to this place's own distances.`,
      feedback && `Your previous context failed these checks. Fix every one:\n${feedback}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const response = await callModels(ai, LIVE_MODELS, { contents: prompt, schema, deadline });
    let parsed: z.ZodSafeParseResult<LadderContext>;
    try {
      parsed = Context.safeParse(JSON.parse(response.text));
    } catch {
      feedback = "The response was not valid JSON.";
      continue;
    }
    if (!parsed.success) {
      feedback = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
      continue;
    }
    const context = { ...parsed.data, id: ANCHOR_CONTEXT_ID };
    lastIssues = anchorIssues(context, placePrompt);
    if (!lastIssues.length) return { context, model: response.model };
    feedback = lastIssues.map((issue) => `${issue.path}: ${issue.rule}: ${issue.text}`).join("\n");
  }
  return { context: null, lint: lastIssues };
}

export async function buildAnchor(args: {
  ladder: Ladder;
  photo: { data: string; mimeType: string };
  confirmedClean: boolean;
}): Promise<AnchorResult> {
  const ai = client();
  if (!ai) return { ok: false, reason: "GEMINI_API_KEY is not configured" };
  const deadline = Date.now() + BUDGET_MS;

  const cleaned = await cleanPhoto(ai, args.photo.data, args.photo.mimeType);
  if (!cleaned && !args.confirmedClean) {
    return {
      ok: false,
      reason: "We couldn't remove people and text from the photo right now. Confirm the photo shows neither to use it as is.",
    };
  }
  const image = cleaned ? { data: cleaned.data, mimeType: cleaned.mimeType } : args.photo;

  try {
    const placePrompt = await describePlace(ai, image.data, image.mimeType, deadline);
    if (!placePrompt) return { ok: false, reason: "The place description didn't pass the safety checks." };
    const generated = await generateContext(ai, args.ladder, placePrompt, deadline);
    if (!generated.context) {
      return { ok: false, reason: "The steps for this place didn't pass the safety checks.", lint: generated.lint };
    }
    return {
      ok: true,
      image,
      edited: Boolean(cleaned),
      placePrompt,
      context: generated.context,
      model: generated.model ?? null,
    };
  } catch (error) {
    return { ok: false, reason: (error instanceof Error ? error.message : String(error)).slice(0, 240) };
  }
}
