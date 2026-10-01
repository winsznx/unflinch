import { z } from "zod";

import { store } from "@/lib/db/store";
import { RECEIPT_SCHEMA, type Receipt } from "@/lib/orbis/receipts";
import { fail, json, parseBody } from "@/lib/server/http";
import { authorizedSession } from "@/lib/server/session-auth";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.uuid(),
  key: z.string().min(16),
  receipt: z.looseObject({
    schema: z.literal(RECEIPT_SCHEMA),
    session: z.uuid(),
    trial: z.number().int().min(1),
    ladder: z.looseObject({ context: z.string() }),
    start: z.looseObject({ level: z.number().int() }),
    decisions: z.array(z.looseObject({ level_after: z.number().int() })),
    recording: z.looseObject({ path: z.string(), sha256: z.string() }).nullable(),
  }),
});

export async function POST(request: Request) {
  const body = await parseBody(request, Body);
  if (body instanceof Response) return body;
  const session = await authorizedSession(body.sessionId, body.key);
  if (!session || body.receipt.session !== session.id) return fail(404, "SESSION_NOT_FOUND");

  const receipt = body.receipt as unknown as Receipt;
  const levels = [receipt.start.level, ...receipt.decisions.map((d) => d.level_after)];
  const row = await store().upsertTrial({
    session_id: session.id,
    idx: receipt.trial,
    context: receipt.ladder.context,
    start_level: receipt.start.level,
    max_level: Math.max(...levels),
    receipt,
    recording_path: receipt.recording?.path ?? null,
    recording_sha256: receipt.recording?.sha256 ?? null,
  });
  return json({ id: row.id });
}
