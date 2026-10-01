import { store } from "@/lib/db/store";
import { env, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const slot = await store().slotHolder();
  return json({ busy: Boolean(slot.holder), leaseUntil: slot.leaseUntil, publicLive: env.publicLive() });
}
