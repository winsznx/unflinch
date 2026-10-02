/**
 * Proof-campaign runner (spends Orbis credits). Drives one recorded judge trial per run in headless
 * Chrome under a campaign condition and appends the run to evidence/campaign/runs.jsonl.
 *   pnpm campaign <experiment> [runs] [baseUrl]
 * Experiments (docs/EVAL_CAMPAIGN.md):
 *   e3        product condition, scripted spikes and SUDS 9 for ceiling retreats (latency)
 *   morph     product condition, the shared E4 input script
 *   restart   E4 baseline: every step re-renders from the last frame with an absolute prompt
 *   restate   F4 A/B: morph, but every send carries the target level's full scene
 *   nosend    E9 control: the subject enters, then the controller decides and sends nothing
 *   safe      refuge latency: climb, safe place (Esc), resume, climb, safe place again
 * All input is simulated and every receipt is labelled SIMULATED_INPUT and EXPERIMENT (except e3/morph).
 */
import { appendFileSync, mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

import type { Condition } from "@/lib/orbis/receipts";

type Step = { at: number; key: "ArrowUp" | "s" | "9" | "2" | "Escape" | " " };
type Experiment = { condition: Condition; script: Step[] };

/** Seconds after the subject has entered. The same script drives morph, restart and restate. */
const STEP_SCRIPT: Step[] = [
  { at: 3, key: "ArrowUp" },
  { at: 9, key: "ArrowUp" },
  { at: 15, key: "ArrowUp" },
  { at: 22, key: "s" },
  { at: 40, key: "ArrowUp" },
  { at: 46, key: "ArrowUp" },
  { at: 52, key: "9" },
  { at: 60, key: "2" },
  { at: 66, key: "ArrowUp" },
  { at: 72, key: "ArrowUp" },
  { at: 78, key: "ArrowUp" },
  { at: 84, key: "ArrowUp" },
];

/** E3 wants ceiling events: two spikes and a SUDS 9 between climbs. */
const SPIKE_SCRIPT: Step[] = [
  { at: 3, key: "ArrowUp" },
  { at: 9, key: "ArrowUp" },
  { at: 15, key: "s" },
  { at: 34, key: "ArrowUp" },
  { at: 40, key: "ArrowUp" },
  { at: 46, key: "9" },
  { at: 56, key: "2" },
  { at: 60, key: "ArrowUp" },
  { at: 66, key: "s" },
  { at: 84, key: "ArrowUp" },
];

/** Two safe places per trial, each from L3 or above, each followed by a resume. */
const SAFE_SCRIPT: Step[] = [
  { at: 3, key: "ArrowUp" },
  { at: 9, key: "ArrowUp" },
  { at: 15, key: "ArrowUp" },
  { at: 22, key: "Escape" },
  { at: 40, key: " " },
  { at: 44, key: "ArrowUp" },
  { at: 50, key: "ArrowUp" },
  { at: 56, key: "ArrowUp" },
  { at: 63, key: "Escape" },
  { at: 80, key: " " },
];

const EXPERIMENTS: Record<string, Experiment> = {
  e3: { condition: { mode: "morph", prompts: "delta" }, script: SPIKE_SCRIPT },
  morph: { condition: { mode: "morph", prompts: "delta" }, script: STEP_SCRIPT },
  restart: { condition: { mode: "restart", prompts: "delta" }, script: STEP_SCRIPT },
  restate: { condition: { mode: "morph", prompts: "restate" }, script: STEP_SCRIPT },
  nosend: { condition: { mode: "nosend", prompts: "delta" }, script: [] },
  safe: { condition: { mode: "morph", prompts: "delta" }, script: SAFE_SCRIPT },
};

const NAME = process.argv[2] ?? "";
const RUNS = Number(process.argv[3] ?? 1);
const BASE = process.argv[4] ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOG = "evidence/campaign/runs.jsonl";
const TRIAL_LIMIT_MS = 200_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function level(page: Page): Promise<number> {
  return page
    .locator(".pl-dots span.is-on")
    .count()
    .then((n) => n - 1)
    .catch(() => -1);
}

/**
 * The live slot is shared with everyone using /try on the deployed site. Wait for it instead of
 * competing, so a visitor never loses a session to the campaign.
 */
async function waitForSlot(log: (message: string) => void) {
  const until = Date.now() + 20 * 60_000;
  while (Date.now() < until) {
    const status = (await fetch(`${BASE}/api/slot/status`)
      .then((r) => r.json())
      .catch(() => ({ busy: true }))) as { busy: boolean };
    if (!status.busy) return;
    log("slot busy (someone else is live), waiting");
    await sleep(30_000);
  }
  throw new Error("slot stayed busy for 20 minutes");
}

async function runOnce(experiment: Experiment, index: number) {
  const t0 = Date.now();
  const log = (message: string) => console.log(`[${NAME} ${index}] ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${message}`);
  await waitForSlot(log);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  try {
    await page.goto(`${BASE}/try`);
    const sessionId = await page.evaluate(async (condition) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fear: "Dogs", fearedOutcome: "It will jump on me", expectancyPre: 80, mode: "judge", consent: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "session create failed");
      sessionStorage.setItem(
        `unflinch:session:${body.id}`,
        JSON.stringify({
          id: body.id, code: body.code, key: body.remoteKey, phoneKey: body.phoneKey, mode: "judge", signal: "sim",
          fear: "Dogs", fearedOutcome: "It will jump on me", expectancyPre: 80, consent: true, audio: false,
          seed: body.seed, intakeAt: Date.now(), builderDemo: true, experiment: condition,
        }),
      );
      return body.id as string;
    }, experiment.condition);
    log(`session ${sessionId}`);
    await page.goto(`${BASE}/session/${sessionId}`);
    await page.getByRole("button", { name: /Start round 1/ }).click({ timeout: 90_000 });

    // The script clock starts once the subject has entered (level 1 on the HUD).
    const until = Date.now() + TRIAL_LIMIT_MS;
    while (Date.now() < until && (await level(page)) < 1) await sleep(500);
    log("subject entered");
    const start = Date.now();
    const pending = [...experiment.script];
    const lost = () => page.getByText("Connection lost").count().then((n) => n > 0).catch(() => false);
    while (Date.now() < until) {
      if ((await page.locator(".pl-sheet").count()) || (await lost())) break;
      const elapsed = (Date.now() - start) / 1000;
      while (pending.length && pending[0]!.at <= elapsed) {
        const step = pending.shift()!;
        await page.keyboard.press(step.key);
        log(`key ${step.key} at L${await level(page)}`);
      }
      await sleep(250);
    }

    const outcome = (await lost()) ? "connection_lost" : "rated";
    if (outcome === "rated") {
      await page.waitForSelector(".pl-sheet", { timeout: 60_000 });
      await page.getByRole("radio", { name: "No" }).click();
      await page.locator(".pl-sheet input[type=range]").first().fill("30");
      await page.getByRole("button", { name: /Next round|See what changed/ }).click();
      await sleep(1500);
    }
    log(outcome);
    await page.getByRole("button", { name: "End" }).click().catch(() => undefined);
    await page.waitForSelector(".pl-report", { timeout: 90_000 }).catch(() => undefined);
    await sleep(6000);
    appendFileSync(LOG, `${JSON.stringify({ experiment: NAME, condition: experiment.condition, session: sessionId, trial: 1, outcome, at: new Date(t0).toISOString(), base: BASE })}\n`);
    log("done");
  } finally {
    await browser.close();
  }
}

async function main() {
  const experiment = EXPERIMENTS[NAME];
  if (!experiment) throw new Error(`Unknown experiment "${NAME}". Use one of: ${Object.keys(EXPERIMENTS).join(", ")}`);
  mkdirSync("evidence/campaign", { recursive: true });
  for (let i = 1; i <= RUNS; i += 1) {
    await runOnce(experiment, i).catch((error: unknown) => console.error(`[${NAME} ${i}] failed:`, error));
    await sleep(4000);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
