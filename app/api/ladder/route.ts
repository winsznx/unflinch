import { z } from "zod";

import { canonicalJson } from "@/lib/orbis/receipts";
import { sha256Hex } from "@/lib/crypto";
import { store } from "@/lib/db/store";
import { generateLadder } from "@/lib/ladder/generate";
import { fail, json, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ sessionId: z.uuid(), key: z.string().min(16) });

export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await authorizedSession(body.sessionId, body.key);
  if (!session) return fail(404, "SESSION_NOT_FOUND");

  const db = store();
  const fearHash = sha256Hex(`${session.fear.toLowerCase()}\u0000${(session.feared_outcome ?? "").toLowerCase()}`);
  const started = Date.now();

  const cached = await db.getLadderByHash(fearHash);
  if (cached) {
    await db.updateSession(session.id, { ladder_id: cached.id });
    return json({
      ladder: cached.plan,
      ladderId: cached.id,
      source: cached.source,
      sha256: sha256Hex(canonicalJson(cached.plan)),
      lint: cached.lint ?? [],
      fallbackReason: null,
      generatedMs: 0,
    });
  }

  const result = await generateLadder(session.fear, session.feared_outcome ?? "");
  const generatedMs = Date.now() - started;
  // A fallback is never cached: the next request for this fear should try generation again.
  let ladderId: string | null = null;
  if (result.source !== "fallback") {
    const row = await db.saveLadder({
      fear_hash: fearHash,
      fear: session.fear,
      source: result.source,
      plan: result.ladder,
      lint: result.lint.length ? result.lint : null,
    });
    ladderId = row.id;
    await db.updateSession(session.id, { ladder_id: row.id });
  } else {
    console.error(`[ladder] fell back for "${session.fear}": ${result.error}`);
  }

  return json({
    ladder: result.ladder,
    ladderId,
    source: result.source,
    sha256: sha256Hex(canonicalJson(result.ladder)),
    lint: result.lint,
    fallbackReason: result.error,
    generatedMs,
  });
}
