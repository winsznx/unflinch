/**
 * Live smoke test (spends Orbis credits): drives /try in headless Chrome through one judge session.
 *   pnpm test:live [baseUrl]
 * Prints the timeline it observed and the session id; receipts land in Supabase like any session.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const t0 = Date.now();
const log = (message: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") log(`console.error: ${msg.text().slice(0, 200)}`);
  });

  await page.goto(`${BASE}/try`);
  await page.getByRole("button", { name: /Start live session|Queue anyway/ }).click();
  await page.waitForURL(/\/session\//, { timeout: 30_000 });
  const sessionId = page.url().split("/session/")[1]!.split(/[?#]/)[0]!;
  log(`session ${sessionId}`);

  await page.getByRole("button", { name: /Start round 1|Start without waiting/ }).click({ timeout: 60_000 });
  log("start clicked");

  const caption = page.locator(".pl-caption");
  const logItems = page.locator(".pl-log li");
  let lastCaption = "";
  let lastLog = 0;
  const watch = async (ms: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const text = ((await caption.textContent().catch(() => "")) ?? "").trim();
      if (text && text !== lastCaption) {
        lastCaption = text;
        log(`caption: ${text}`);
      }
      const count = await logItems.count().catch(() => 0);
      if (count !== lastLog) {
        const top = ((await logItems.first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
        log(`decision: ${top}`);
        lastLog = count;
      }
      const overlay = await page.locator(".pl-overlay-title").first().textContent({ timeout: 200 }).catch(() => null);
      if (overlay) log(`overlay: ${overlay}`);
      if (overlay && /couldn't start|Connection lost|busy/i.test(overlay)) return false;
      await sleep(500);
    }
    return true;
  };

  const frames = await page
    .waitForFunction(() => {
      const video = document.querySelector("video.pl-video") as HTMLVideoElement | null;
      return Boolean(video && video.videoWidth > 0 && video.currentTime > 0);
    }, undefined, { timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  log(frames ? "first real frames playing" : "NO FRAMES within 120 s");
  if (!frames) {
    await page.screenshot({ path: "/tmp/unflinch-live-fail.png" });
    log(((await page.locator("body").innerText()).slice(0, 600)).replace(/\s+/g, " "));
    await browser.close();
    process.exit(1);
  }
  const video = await page.evaluate(() => {
    const v = document.querySelector("video.pl-video") as HTMLVideoElement;
    return { w: v.videoWidth, h: v.videoHeight };
  });
  log(`video ${video.w}x${video.h}`);

  if (!(await watch(20_000))) process.exit(1);
  log("press ArrowUp (step closer)");
  await page.keyboard.press("ArrowUp");
  if (!(await watch(14_000))) process.exit(1);
  log("press S (simulated breath spike)");
  await page.keyboard.press("s");
  if (!(await watch(24_000))) process.exit(1);
  log("press 9 (SUDS 9)");
  await page.keyboard.press("9");
  if (!(await watch(16_000))) process.exit(1);
  log("press 2 (SUDS 2)");
  await page.keyboard.press("2");
  if (!(await watch(30_000))) process.exit(1);

  await page.screenshot({ path: "/tmp/unflinch-live.png" });
  log("ending session");
  await page.getByRole("button", { name: "End" }).click().catch(() => undefined);
  await page.waitForSelector(".pl-report, .pl-center", { timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: "/tmp/unflinch-report.png", fullPage: true });
  log(`done: ${BASE}/runs/${sessionId}`);
  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
