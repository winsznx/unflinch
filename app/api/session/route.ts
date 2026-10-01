import { z } from "zod";

import { pairingCode, randomHex } from "@/lib/crypto";
import { store } from "@/lib/db/store";
import { env, fail, json, parseBody, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({
  fear: z.string().trim().min(2).max(240),
  fearedOutcome: z.string().trim().max(240).default(""),
  expectancyPre: z.number().int().min(0).max(100).nullable().default(null),
  mode: z.enum(["self", "therapist", "judge"]),
  consent: z.boolean().default(false),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "CROSS_ORIGIN");
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;

  const session = await store().createSession({
    code: pairingCode(),
    phone_key: randomHex(32),
    remote_key: randomHex(32),
    mode: body.mode,
    fear: body.fear,
    feared_outcome: body.fearedOutcome || null,
    expectancy_pre: body.expectancyPre,
    seed: env.seed(),
    consent_record: body.consent,
  });

  return json({
    id: session.id,
    code: session.code,
    codeExpiresAt: session.code_expires_at,
    phoneKey: session.phone_key,
    remoteKey: session.remote_key,
    seed: session.seed,
  });
}
