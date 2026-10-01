import { z } from "zod";

import { supabaseAdmin } from "@/lib/db/supabase";
import { fail, json, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.uuid(),
  key: z.string().min(16),
  trial: z.number().int().min(1).max(20),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive().max(500 * 1024 * 1024),
});

/** Signed upload URL for one trial's recording. Only with recording consent. */
export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await authorizedSession(body.sessionId, body.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  if (!session.consent_record) return fail(403, "NO_CONSENT");

  const db = supabaseAdmin();
  if (!db) return fail(503, "STORAGE_NOT_CONFIGURED", "Recordings need Supabase Storage.");
  const path = `${session.id}/${body.trial}.webm`;
  const { data, error } = await db.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return fail(502, "STORAGE_ERROR", error?.message);
  return json({ uploadUrl: data.signedUrl, token: data.token, path: `recordings/${path}` });
}
