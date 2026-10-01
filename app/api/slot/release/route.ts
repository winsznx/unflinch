import { z } from "zod";

import { store } from "@/lib/db/store";
import { fail, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.uuid(), key: z.string().min(16), end: z.boolean().default(true) });

/** Called on end and from navigator.sendBeacon on pagehide. Idempotent. */
export async function POST(request: Request) {
  const raw = await request.text();
  const parsed = Body.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) return fail(400, "INVALID_BODY");
  const session = await authorizedSession(parsed.data.sessionId, parsed.data.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  const db = store();
  await db.releaseSlot(session.id);
  if (parsed.data.end && !session.ended_at) {
    await db.updateSession(session.id, { status: "ended", ended_at: new Date().toISOString() });
  }
  return new Response(null, { status: 204 });
}
