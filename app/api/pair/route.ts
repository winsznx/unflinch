import { z } from "zod";

import { store } from "@/lib/db/store";
import { fail, json, parseBody } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().trim().toUpperCase().length(6) });

/** Single use, 15-minute pairing code → the phone's channel and signing key. */
export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await store().pairByCode(body.code);
  if (!session) return fail(409, "CODE_INVALID", "This code was already used or has expired.");
  return json({ sessionId: session.id, phoneKey: session.phone_key, fear: session.fear });
}
