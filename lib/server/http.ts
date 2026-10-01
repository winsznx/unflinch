import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, code: string, message?: string) {
  return json({ error: code, message: message ?? code }, status);
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "INVALID_JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "INVALID_BODY", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

/** Browsers send Origin on POST; a mismatch means another site is calling our credit-spending routes. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

export const env = {
  publicLive: () => process.env.PUBLIC_LIVE !== "0",
  publicMaxSessionS: () => Number(process.env.PUBLIC_MAX_SESSION_S ?? 240),
  seed: () => Number(process.env.SEED_LOCKED ?? 2026),
  quotaPerDay: () => Number(process.env.PUBLIC_SESSIONS_PER_IP ?? 2),
};
