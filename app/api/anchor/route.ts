import { store } from "@/lib/db/store";
import { buildAnchor } from "@/lib/ladder/anchor";
import { generateLadder } from "@/lib/ladder/generate";
import { fail, json, sameOrigin } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** One "your street" anchor per session on this server instance. The photo is processed in memory and never stored. */
const builtFor = new Set<string>();

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "CROSS_ORIGIN");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_BODY");
  }
  const sessionId = String(form.get("sessionId") ?? "");
  const key = String(form.get("key") ?? "");
  const photo = form.get("photo");
  const confirmedClean = form.get("confirmedClean") === "true";

  const session = await authorizedSession(sessionId, key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  if (!(photo instanceof File) || !PHOTO_TYPES.has(photo.type)) return fail(400, "PHOTO_TYPE", "Use a JPEG, PNG or WebP photo.");
  if (photo.size > MAX_PHOTO_BYTES) return fail(413, "PHOTO_TOO_LARGE", "The photo must be 4 MB or smaller.");
  if (builtFor.has(session.id)) return fail(409, "ANCHOR_EXISTS", "This session already has a place.");
  builtFor.add(session.id);

  const cached = session.ladder_id ? await store().getLadder(session.ladder_id) : null;
  const ladder = cached?.plan ?? (await generateLadder(session.fear, session.feared_outcome ?? "")).ladder;

  const result = await buildAnchor({
    ladder,
    photo: { data: Buffer.from(await photo.arrayBuffer()).toString("base64"), mimeType: photo.type },
    confirmedClean,
  });
  if (!result.ok) {
    builtFor.delete(session.id);
    return json({ error: "ANCHOR_FAILED", message: result.reason, lint: result.lint ?? [] }, 422);
  }
  return json(result);
}
