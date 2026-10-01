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

  let row = await db.getLadderByHash(fearHash);
  if (!row) {
    const result = await generateLadder(session.fear, session.feared_outcome ?? "");
    row = await db.saveLadder({
      fear_hash: fearHash,
      fear: session.fear,
      source: result.source,
      plan: result.ladder,
      lint: result.lint.length ? result.lint : null,
    });
  }
  await db.updateSession(session.id, { ladder_id: row.id });

  return json({
    ladder: row.plan,
    ladderId: row.id,
    source: row.source,
    sha256: sha256Hex(canonicalJson(row.plan)),
    lint: row.lint ?? [],
    cached: Date.now() - started < 50,
  });
}
