/**
 * Offline receipt check (PRD §5.7): pnpm verify:receipt <receipt.json> [recording.webm]
 * Recomputes the canonical hash and headline metrics, checks ordering and reasons, re-lints every
 * prompt that reached the model, and optionally checks the recording hash. Exit 1 on any failure.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

import { lintPrompt, type LintIssue } from "@/lib/ladder/lint";
import { canonicalJson, median, metricsOf, RECEIPT_SCHEMA, type Receipt } from "@/lib/orbis/receipts";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

async function main(): Promise<number> {
  const [receiptPath, recordingPath] = process.argv.slice(2);
  if (!receiptPath) {
    console.error("usage: pnpm verify:receipt <receipt.json> [recording.webm]");
    return 2;
  }

  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);

  let receipt: Receipt;
  try {
    receipt = JSON.parse(await fs.readFile(receiptPath, "utf8")) as Receipt;
  } catch (error) {
    console.error(`FAIL could not read ${receiptPath}: ${(error as Error).message}`);
    return 1;
  }

  if (receipt.schema !== RECEIPT_SCHEMA) {
    console.error(`FAIL schema is ${JSON.stringify(receipt.schema)}, expected ${RECEIPT_SCHEMA}`);
    return 1;
  }
  for (const key of ["start", "chunks", "decisions", "signal", "suds", "labels"] as const) {
    if (receipt[key] === undefined || receipt[key] === null) fail(`missing field: ${key}`);
  }
  if (failures.length) return report(failures);

  console.log(`receipt   ${receiptPath}`);
  console.log(`session   ${receipt.session}, trial ${receipt.trial}, labels ${receipt.labels.join(", ") || "none"}`);
  console.log(`sha256    ${sha256(canonicalJson(receipt))}  (canonical JSON, sorted keys)`);

  const m = metricsOf(receipt);
  const acceptMs = median(m.acceptedMs);
  const landing = median(m.landingChunks);
  console.log(`decisions ${m.decisions}, sends ${m.sends}, retreats ${m.retreats} (ceiling ${m.ceilingRetreats}), max level L${m.maxLevel}`);
  console.log(`accept    median ${acceptMs === null ? "n/a" : `${acceptMs} ms`}, n = ${m.acceptedMs.length}`);
  console.log(`landing   median ${landing === null ? "n/a" : `${landing} chunks`}, n = ${m.landingChunks.length}`);
  console.log(`ev at     ${m.evAtS === null ? "none" : `${m.evAtS} s`}`);

  receipt.decisions.forEach((d, i) => {
    const prev = receipt.decisions[i - 1];
    if (prev && d.t < prev.t) fail(`decision ${i}: t ${d.t} is before previous ${prev.t}`);
    if (prev && d.chunk < prev.chunk) fail(`decision ${i}: chunk ${d.chunk} is before previous ${prev.chunk}`);
    if (d.t < receipt.start.t) fail(`decision ${i}: t ${d.t} is before trial start ${receipt.start.t}`);
    if (d.prompt !== null && !d.reason) fail(`decision ${i}: sent a prompt without a reason code`);
    if (d.landed_chunk !== null && d.landed_chunk < d.chunk) {
      fail(`decision ${i}: landed at chunk ${d.landed_chunk}, before it was decided at ${d.chunk}`);
    }
  });
  receipt.chunks.forEach((c, i) => {
    const prev = receipt.chunks[i - 1];
    if (prev && (c.i <= prev.i || c.t < prev.t)) fail(`chunk ${c.i}: out of order after chunk ${prev.i}`);
  });

  // Receipts written before the SUBJECT_ENTER decision existed stored the entrance prompt as start.prompt
  // with start.level 1. Lint those as the transition they are, and say so.
  const legacyStart =
    receipt.start.level === 1 && !receipt.decisions.some((d) => (d.reason as string) === "SUBJECT_ENTER") && receipt.trial === 1;
  if (legacyStart) console.log("note      legacy receipt: start.prompt holds the subject entrance");
  const issues: LintIssue[] = [
    ...lintPrompt(receipt.start.prompt, legacyStart ? "transition" : "absolute", "start.prompt"),
  ];
  receipt.decisions.forEach((d, i) => {
    if (d.prompt !== null) issues.push(...lintPrompt(d.prompt, "transition", `decisions[${i}].prompt`));
  });
  for (const issue of issues) fail(`lint ${issue.path}: ${issue.rule}: "${issue.text}"`);
  console.log(`lint      ${1 + m.sends} prompts, ${issues.length} issues`);

  if (recordingPath) {
    if (!receipt.recording) {
      fail("a recording was given but the receipt has no recording entry");
    } else {
      const bytes = await fs.readFile(recordingPath);
      const actual = sha256(bytes);
      console.log(`recording ${recordingPath} sha256 ${actual}`);
      if (actual !== receipt.recording.sha256) {
        fail(`recording sha256 ${actual} does not match receipt ${receipt.recording.sha256}`);
      }
      if (bytes.length !== receipt.recording.bytes) {
        fail(`recording is ${bytes.length} bytes, receipt says ${receipt.recording.bytes}`);
      }
    }
  }

  return report(failures);
}

function report(failures: string[]): number {
  if (!failures.length) {
    console.log("OK");
    return 0;
  }
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`${failures.length} check${failures.length === 1 ? "" : "s"} failed`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
