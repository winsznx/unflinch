import { z } from "zod";

import { store } from "@/lib/db/store";
import { fail, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.uuid(),
  key: z.string().min(16),
  events: z
    .array(
      z.object({
        trial: z.number().int().min(0).nullable(),
        t: z.number(),
        kind: z.string().max(40),
        payload: z.unknown(),
      }),
    )
    .max(200),
});

/** Batched every 2 s from the patient browser. */
export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await authorizedSession(body.sessionId, body.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");
  await store().insertEvents(
    body.events.map((e) => ({ session_id: session.id, trial_idx: e.trial, t_ms: Math.round(e.t), kind: e.kind, payload: e.payload ?? null })),
  );
  return new Response(null, { status: 204 });
}
