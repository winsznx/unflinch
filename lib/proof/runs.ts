import "server-only";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { store } from "@/lib/db/store";
import { supabaseAdmin } from "@/lib/db/supabase";
import { capOf } from "@/lib/ladder/resolve";
import { canonicalJson, RECEIPT_SCHEMA, type Receipt } from "@/lib/orbis/receipts";

const LIVE_DIR = path.join(process.cwd(), "evidence", "live");
const RUN_ID = /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[a-z0-9-]{1,64})$/;
const RECEIPT_FILE = /^trial-(\d+)\.receipt\.json$/;
const SIGNED_URL_TTL_S = 3600;
const RECORDING_BUCKET = "recordings";
const VIDEO_EXT = /\.(webm|mp4)$/i;
const SAFE_NAME = /^[\w.-]+$/;

export type RecordingSource =
  | { kind: "file"; absPath: string }
  | { kind: "url"; url: string };

export type CutMeasurement = { trial: number; cuts: number; tool: string; threshold: number | null };

export type RunTrial = {
  n: number;
  receipt: Receipt;
  receiptSha256: string;
  /** Repo-relative path when the receipt is a committed file, for `pnpm verify:receipt`. */
  receiptFile: string | null;
  recording: RecordingSource | null;
  cuts: CutMeasurement | null;
};

export type Run = {
  id: string;
  source: "repo" | "store";
  fear: string;
  context: string;
  note: string | null;
  cap: number | null;
  trials: RunTrial[];
};

type RunManifest = {
  fear?: string;
  labels?: string[];
  note?: string;
  cap?: number;
  recordings?: Record<string, string>;
};

export function isRunId(id: string): boolean {
  return RUN_ID.test(id);
}

export function receiptSha256(receipt: Receipt): string {
  return createHash("sha256").update(canonicalJson(receipt)).digest("hex");
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isReceipt(value: unknown): value is Receipt {
  return Boolean(value && typeof value === "object" && (value as Receipt).schema === RECEIPT_SCHEMA);
}

/** Resolves a recording reference from run.json or the receipt, refusing anything outside the run folder. */
async function resolveRepoRecording(id: string, ref: string | undefined): Promise<RecordingSource | null> {
  if (!ref) return null;
  if (/^https?:\/\//.test(ref)) return { kind: "url", url: ref };
  if (!VIDEO_EXT.test(ref)) return null;
  const name = ref.replace(`evidence/live/${id}/`, "");
  if (!SAFE_NAME.test(name)) return null;
  const absPath = path.join(LIVE_DIR, id, name);
  try {
    return (await fs.stat(absPath)).isFile() ? { kind: "file", absPath } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function cutsFor(raw: unknown, trial: number): CutMeasurement | null {
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const row = rows.find(
    (r): r is CutMeasurement =>
      Boolean(r) && typeof r === "object" && (r as CutMeasurement).trial === trial && typeof (r as CutMeasurement).cuts === "number",
  );
  return row ? { trial, cuts: row.cuts, tool: row.tool ?? "tools/cutdetect.py", threshold: row.threshold ?? null } : null;
}

async function loadRepoRun(id: string): Promise<Run | null> {
  const runDir = path.join(LIVE_DIR, id);
  let files: string[];
  try {
    files = await fs.readdir(runDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const manifest = (await readJson<RunManifest>(path.join(runDir, "run.json"))) ?? {};
  const cutsRaw = await readJson<unknown>(path.join(runDir, "cuts.json"));
  const receiptFiles = files
    .map((file) => ({ file, n: Number(RECEIPT_FILE.exec(file)?.[1]) }))
    .filter((entry) => Number.isInteger(entry.n) && entry.n > 0)
    .sort((a, b) => a.n - b.n);

  const trials: RunTrial[] = [];
  for (const { file, n } of receiptFiles) {
    const receipt = await readJson<unknown>(path.join(runDir, file));
    if (!isReceipt(receipt)) continue;
    trials.push({
      n,
      receipt,
      receiptSha256: receiptSha256(receipt),
      receiptFile: `evidence/live/${id}/${file}`,
      recording: await resolveRepoRecording(id, manifest.recordings?.[String(n)] ?? receipt.recording?.path),
      cuts: cutsFor(cutsRaw, n),
    });
  }
  if (!trials.length) return null;

  const first = trials[0]!.receipt;
  return {
    id,
    source: "repo",
    fear: manifest.fear ?? first.ladder.fearId,
    context: first.ladder.context,
    note: manifest.note ?? null,
    cap: manifest.cap ?? null,
    trials,
  };
}

async function signedRecordingUrl(recordingPath: string): Promise<string | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const objectPath = recordingPath.replace(new RegExp(`^${RECORDING_BUCKET}/`), "");
  const { data, error } = await db.storage.from(RECORDING_BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_S);
  if (error) {
    console.error(`[proof] signed url failed for ${recordingPath}: ${error.message}`);
    return null;
  }
  return data.signedUrl;
}

async function capFromStore(sessionId: string, contextId: string): Promise<number | null> {
  const session = await store().getSession(sessionId);
  if (!session?.ladder_id) return null;
  const ladder = await store().getLadder(session.ladder_id);
  const context = ladder?.plan.contexts.find((c) => c.id === contextId);
  return context ? capOf(context) : null;
}

async function loadStoredRun(id: string): Promise<Run | null> {
  const rows = (await store().listTrials(id)).filter((row) => isReceipt(row.receipt));
  if (!rows.length) return null;

  const trials: RunTrial[] = await Promise.all(
    rows.map(async (row) => {
      const receipt = row.receipt!;
      const url = row.recording_path ? await signedRecordingUrl(row.recording_path) : null;
      return {
        n: row.idx,
        receipt,
        receiptSha256: receiptSha256(receipt),
        receiptFile: null,
        recording: url ? { kind: "url" as const, url } : null,
        cuts: null,
      };
    }),
  );
  const first = trials[0]!.receipt;
  return {
    id,
    source: "store",
    fear: first.ladder.fearId,
    context: first.ladder.context,
    note: null,
    cap: await capFromStore(id, first.ladder.context),
    trials,
  };
}

/** Committed evidence wins over the live store so published runs never change under a reader. */
export async function loadRun(id: string): Promise<Run | null> {
  if (!isRunId(id)) return null;
  return (await loadRepoRun(id)) ?? (await loadStoredRun(id));
}

/** Repo-file recording for the route handler. Null for anything not committed under evidence/live/<id>/. */
export async function repoRecording(id: string, trial: number): Promise<string | null> {
  if (!isRunId(id)) return null;
  const run = await loadRepoRun(id);
  const recording = run?.trials.find((t) => t.n === trial)?.recording;
  return recording?.kind === "file" ? recording.absPath : null;
}

export async function listRepoRunIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(LIVE_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && isRunId(e.name)).map((e) => e.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export type EvidenceHashes = { files: Record<string, { sha256: string; bytes: number }> };

export async function loadEvidenceHashes(): Promise<EvidenceHashes | null> {
  return readJson<EvidenceHashes>(path.join(process.cwd(), "evidence", "hashes.json"));
}
