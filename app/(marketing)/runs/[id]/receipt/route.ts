import { loadRun } from "@/lib/proof/runs";
import { canonicalJson } from "@/lib/orbis/receipts";

/** Serves the canonical bytes, so `shasum -a 256` on the download matches the hash on the page. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trialParam = new URL(request.url).searchParams.get("trial");
  const run = await loadRun(id);
  const trial = run?.trials.find((t) => String(t.n) === trialParam) ?? run?.trials[0];
  if (!run || !trial) return new Response("Receipt not found", { status: 404 });

  return new Response(canonicalJson(trial.receipt), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${run.id}-trial-${trial.n}.receipt.json"`,
      "cache-control": "no-store",
    },
  });
}
