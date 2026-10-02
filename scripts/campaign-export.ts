/**
 * Exports every campaign run in evidence/campaign/runs.jsonl: the trial receipt and the session's event
 * log go to evidence/campaign/<experiment>/<session>/, the scene recording to .data/campaign/<session>.webm
 * (too large for git; the receipt carries its sha256). Needs SUPABASE_SERVICE_ROLE_KEY.
 *   pnpm campaign:export
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type Run = { experiment: string; session: string; trial: number; outcome?: string };

const RUNS = "evidence/campaign/runs.jsonl";
const VIDEO_DIR = ".data/campaign";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const runs = readFileSync(RUNS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Run);
  mkdirSync(VIDEO_DIR, { recursive: true });

  for (const run of runs) {
    const dir = path.join("evidence/campaign", run.experiment, run.session);
    mkdirSync(dir, { recursive: true });
    const { data: trial, error } = await db
      .from("trials")
      .select("receipt, recording_path, recording_sha256")
      .eq("session_id", run.session)
      .eq("idx", run.trial)
      .single();
    if (error || !trial) {
      console.log(`${run.experiment} ${run.session}: no trial (${error?.message ?? "missing"})`);
      continue;
    }
    writeFileSync(path.join(dir, `trial-${run.trial}.receipt.json`), `${JSON.stringify(trial.receipt, null, 1)}\n`);
    const { data: events, error: eventsError } = await db
      .from("events")
      .select("t_ms, trial_idx, kind, payload")
      .eq("session_id", run.session)
      .order("t_ms");
    if (eventsError) throw new Error(`events for ${run.session}: ${eventsError.message}`);
    writeFileSync(path.join(dir, "events.json"), `${JSON.stringify(events ?? [], null, 1)}\n`);

    const video = path.join(VIDEO_DIR, `${run.session}.webm`);
    let note = "no recording";
    if (trial.recording_path && !existsSync(video)) {
      const objectPath = String(trial.recording_path).replace(/^recordings\//, "");
      const { data: blob, error: downloadError } = await db.storage.from("recordings").download(objectPath);
      if (blob) writeFileSync(video, Buffer.from(await blob.arrayBuffer()));
      else note = `download failed: ${downloadError?.message}`;
    }
    if (existsSync(video)) {
      const sha = createHash("sha256").update(readFileSync(video)).digest("hex");
      note = sha === trial.recording_sha256 ? "recording ok" : `sha256 mismatch (${sha.slice(0, 12)})`;
    }
    console.log(`${run.experiment} ${run.session}: ${note}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
