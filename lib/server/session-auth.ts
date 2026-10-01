import "server-only";

import { safeEqual } from "@/lib/crypto";
import { store, type SessionRow } from "@/lib/db/store";

/**
 * The patient browser proves ownership of a session with the remote key it was minted
 * (it holds both keys; only the patient screen ever shows them).
 */
export async function authorizedSession(sessionId: string, key: string | null): Promise<SessionRow | null> {
  const session = await store().getSession(sessionId);
  if (!session || !key) return null;
  return safeEqual(session.remote_key, key) || safeEqual(session.phone_key, key) ? session : null;
}
