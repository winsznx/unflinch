/**
 * Scripted builder demo (spends Orbis credits). Creates a recorded judge session with simulated input,
 * steps closer to the cap so the round reaches its expectancy test, rates it, and saves clean video
 * frames per level for marketing stills. Everything it produces is labelled SIMULATED INPUT.
 *   pnpm demo:live [baseUrl] [fear] [outDir]
 */
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const FEAR = process.argv[3] ?? "Dogs";
const OUT = process.argv[4] ?? "/tmp/unflinch-frames";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTCOMES: Record<string, string> = {
  Dogs: "It will jump on me",
  Heights: "I'll lose my balance",
  Spiders: "It will crawl onto me",
};

const t0 = Date.now();
const log = (message: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function level(page: Page): Promise<number> {
  return page.locator(".pl-dots span.is-on").count().then((n) => Math.max(0, n - 1)).catch(() => -1);
}

async function frame(page: Page, name: string) {
  await page.locator("video.pl-video").screenshot({ path: `${OUT}/${name}.png` }).catch(() => undefined);
  log(`frame ${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`${BASE}/try`);

  const sessionId = await page.evaluate(
    async ({ fear, outcome }) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fear, fearedOutcome: outcome, expectancyPre: 80, mode: "judge", consent: true }),
      });
      const body = await response.json();
      sessionStorage.setItem(
        `unflinch:session:${body.id}`,
        JSON.stringify({
          id: body.id, code: body.code, key: body.remoteKey, phoneKey: body.phoneKey, mode: "judge", signal: "sim",
          fear, fearedOutcome: outcome, expectancyPre: 80, consent: true, audio: true, seed: body.seed,
          intakeAt: Date.now(), builderDemo: true,
        }),
      );
      return body.id as string;
    },
    { fear: FEAR, outcome: OUTCOMES[FEAR] ?? "It will come close" },
  );
  log(`session ${sessionId}`);
  await page.goto(`${BASE}/session/${sessionId}`);
  await page.getByRole("button", { name: /Start round 1/ }).click({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector("video.pl-video") as HTMLVideoElement | null;
    return Boolean(v && v.videoWidth > 0 && v.currentTime > 1);
  }, undefined, { timeout: 120_000 });
  log("frames playing");
  await sleep(4000);
  await frame(page, "L0-safe");

  // Wait out calibration, then step closer whenever the controller is free, capturing each level.
  const seen = new Set<number>();
  const until = Date.now() + 150_000;
  while (Date.now() < until) {
    if (await page.locator(".pl-sheet").count()) break;
    const current = await level(page);
    const phaseCalibrating = /\ds$/.test((await page.locator(".pl-meta").textContent().catch(() => "")) ?? "");
    if (current >= 1 && !seen.has(current)) {
      seen.add(current);
      await sleep(4500);
      await frame(page, `L${current}`);
    }
    if (!phaseCalibrating && current >= 1) await page.keyboard.press("ArrowUp");
    await sleep(3000);
  }
  const caption = await page.locator(".pl-caption").textContent().catch(() => "");
  log(`caption before sheet: ${caption}`);
  await frame(page, "end");

  await page.waitForSelector(".pl-sheet", { timeout: 60_000 });
  await page.getByRole("radio", { name: "No" }).click();
  await page.locator(".pl-sheet input[type=range]").first().fill("30");
  await page.getByRole("button", { name: /Next round|See what changed/ }).click();
  log("rated round 1, ending");
  await sleep(6000);
  await page.getByRole("button", { name: "End" }).click().catch(() => undefined);
  await page.waitForSelector(".pl-report", { timeout: 60_000 }).catch(() => undefined);
  await sleep(8000);
  log(`run: ${BASE}/runs/${sessionId}`);
  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
