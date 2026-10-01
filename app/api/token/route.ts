import { z } from "zod";

import { hashIp } from "@/lib/crypto";
import { store } from "@/lib/db/store";
import { clientIp, env, fail, json, parseBody, sameOrigin } from "@/lib/server/http";
import { mintReactorJwt, ReactorConfigError } from "@/lib/server/reactor";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({ sessionId: z.uuid(), key: z.string().min(16) });

const SESSION_S = { judge: () => env.publicMaxSessionS(), self: () => 600, therapist: () => 600 } as const;

/** Session exists + kill switch + IP quota + the single Orbis slot, then a scoped JWT. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "CROSS_ORIGIN");
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;

  const session = await authorizedSession(body.sessionId, body.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  if (!env.publicLive()) return fail(503, "PUBLIC_LIVE_OFF", "Live sessions are paused. Watch the recorded run instead.");

  const db = store();
  const firstConnect = session.status === "created";
  const sessionS = SESSION_S[session.mode]();
  if (!(await db.acquireSlot(session.id, sessionS + 60))) {
    const slot = await db.slotHolder();
    return json({ error: "SLOT_BUSY", message: "Someone is in a live session right now.", leaseUntil: slot.leaseUntil }, 409);
  }
  // Quota is charged only once a session actually gets the slot, so waiting in the queue is free.
  if (firstConnect && !(await db.bumpQuota(hashIp(clientIp(request)), env.quotaPerDay()))) {
    await db.releaseSlot(session.id);
    return fail(429, "QUOTA", "You've used today's live sessions from this network.");
  }

  try {
    const jwt = await mintReactorJwt(sessionS);
    if (firstConnect) await db.updateSession(session.id, { status: "live" });
    return json({ jwt, maxSessionS: sessionS, leaseUntil: new Date(Date.now() + (sessionS + 60) * 1000).toISOString() });
  } catch (error) {
    await db.releaseSlot(session.id);
    if (error instanceof ReactorConfigError) return fail(503, "REACTOR_NOT_CONFIGURED", error.message);
    return fail(502, "REACTOR_TOKEN_FAILED", error instanceof Error ? error.message : String(error));
  }
}
