/**
 * Runs the TS controller over the independent traces (tools/gen_traces.py) and writes outputs
 * the Python oracle compares against: pnpm controller:run && python tools/oracle_controller.py --compare …
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { runTrace, type Trace } from "@/lib/controller/run";

const [tracesDir = "evidence/controller/traces", outDir = "evidence/controller/ts"] = process.argv.slice(2);

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const files = (await fs.readdir(tracesDir)).filter((f) => f.endsWith(".json")).sort();
  let violations = 0;
  for (const file of files) {
    const trace = JSON.parse(await fs.readFile(path.join(tracesDir, file), "utf8")) as Trace;
    const run = runTrace(trace);
    violations += run.violations.length;
    const decisions = run.decisions.map((d) => ({
      chunk: d.chunk,
      action: d.action,
      reason: d.reason,
      level: d.levelAfter,
      inputs: { arousal: d.signal.arousal, suds: d.signal.sudsValue, ceiling: d.signal.ceilingActive },
    }));
    await fs.writeFile(path.join(outDir, file), JSON.stringify({ decisions, violations: run.violations }, null, 1));
  }
  console.log(`ran ${files.length} traces, ${violations} invariant violations`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
