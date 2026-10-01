import { z } from "zod";

import { store } from "@/lib/db/store";
import { env, fail, json, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.uuid(), key: z.string().min(16) });

/** Extends the lease in 2-minute steps. The Reactor JWT's max_session_duration_seconds is the hard ceiling. */
export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await authorizedSession(body.sessionId, body.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  const capS = session.mode === "judge" ? env.publicMaxSessionS() : 600;
  const ok = await store().acquireSlot(session.id, Math.min(120, capS));
  return ok ? json({ ok: true }) : fail(409, "SLOT_LOST");
}
