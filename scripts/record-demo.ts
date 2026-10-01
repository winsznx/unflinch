/**
 * Records the 2-minute demo walkthrough of the deployed site as silent video, paced to the voice-over
 * script (internal/DEMO_VIDEO_SCRIPT.md). Never starts a live Orbis session.
 *   pnpm exec tsx scripts/record-demo.ts [baseUrl] [outDir]
 */
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright-core";

const BASE = process.argv[2] ?? "https://unflinch-zeta.vercel.app";
const OUT = process.argv[3] ?? "/tmp/unflinch-demo";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZE = { width: 1920, height: 1080 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
const mark = (label: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${label}`);

/** A macOS-style arrow pointer: headless video captures no OS cursor, and viewers need to see what's being pointed at. */
const CURSOR = `
  window.addEventListener("DOMContentLoaded", () => {
    const pointer = document.createElement("div");
    pointer.id = "__demo_cursor";
    pointer.innerHTML = '<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M2 2 L2 27 L8.2 21.2 L12.4 31 L16.6 29.2 L12.4 19.6 L21 19.6 Z" fill="#000" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(pointer.style, {
      position: "fixed", left: "-60px", top: "-60px", width: "26px", height: "34px", zIndex: "2147483647",
      pointerEvents: "none", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))", transformOrigin: "2px 2px",
      transition: "transform 90ms ease-out",
    });
    document.body.appendChild(pointer);
    window.addEventListener("mousemove", (e) => { pointer.style.left = (e.clientX - 2) + "px"; pointer.style.top = (e.clientY - 2) + "px"; });
    window.addEventListener("mousedown", () => { pointer.style.transform = "scale(0.85)"; });
    window.addEventListener("mouseup", () => { pointer.style.transform = "scale(1)"; });
  });
`;

let cursor = { x: SIZE.width / 2, y: SIZE.height / 2 };

async function glide(page: Page, x: number, y: number, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = cursor;
  for (let i = 1; i <= steps; i += 1) {
    const k = i / steps;
    const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * ease, from.y + (y - from.y) * ease);
    await sleep(ms / steps);
  }
  cursor = { x, y };
}

async function glideTo(page: Page, selector: string, ms = 700) {
  const box = await page.locator(selector).first().boundingBox();
  if (box) await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
}

async function smoothScroll(page: Page, pixels: number, ms: number) {
  const steps = Math.max(10, Math.round(ms / 16));
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, pixels / steps);
    await sleep(ms / steps);
  }
}

async function scrollTo(page: Page, selector: string, ms: number, offset = 120) {
  const y = await page.evaluate(
    ({ sel, off }) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().top - off : 0;
    },
    { sel: selector, off: offset },
  );
  await smoothScroll(page, y, ms);
}

/** Hold until the segment's end so each part lines up with its voice-over line. */
async function until(seconds: number) {
  const wait = t0 + seconds * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();

  // Warm the pages so nothing loads slowly on camera.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  const recordingStart = Date.now();
  mark("0:00 problem");

  // 0:00 to 0:15 · the problem
  await glide(page, 960, 520, 900);
  await sleep(2500);
  await scrollTo(page, "#problem", 4500);
  await sleep(1200);
  await glideTo(page, "#problem .m-why-card.is-featured");
  await until(15 + (recordingStart - t0) / 1000);

  // 0:15 to 0:35 · the idea
  mark("0:15 idea");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1400);
  await scrollTo(page, ".m-hero-panels", 1800, 90);
  await glideTo(page, ".m-art-still");
  await sleep(3500);
  await scrollTo(page, "#how", 2600);
  await sleep(600);
  for (const n of [0, 1, 2, 3]) {
    const step = page.locator(".m-step").nth(n);
    const box = await step.boundingBox();
    if (box) await glide(page, box.x + 120, box.y + box.height / 2, 500);
    await step.click();
    await sleep(1700);
  }
  await until(35 + (recordingStart - t0) / 1000);

  // 0:35 to 0:55 · setting up a session
  mark("0:35 intake");
  await page.goto(`${BASE}/start`, { waitUntil: "networkidle" });
  await sleep(1200);
  const dogs = page.getByRole("listitem").filter({ hasText: /^Dogs$/ });
  await glideTo(page, '.in-chip:text-is("Dogs")');
  await dogs.click();
  await sleep(900);
  const outcome = page.getByPlaceholder("It will jump on me");
  await glideTo(page, 'input[placeholder="It will jump on me"]');
  await outcome.click();
  await page.keyboard.type("It will jump on me", { delay: 70 });
  await sleep(700);
  const slider = page.locator(".in-slider input[type=range]");
  const sliderBox = await slider.boundingBox();
  if (sliderBox) {
    await glide(page, sliderBox.x + sliderBox.width * 0.7, sliderBox.y + sliderBox.height / 2);
    await page.mouse.down();
    await glide(page, sliderBox.x + sliderBox.width * 0.8, sliderBox.y + sliderBox.height / 2, 600);
    await page.mouse.up();
  }
  await slider.fill("80");
  await sleep(900);
  await scrollTo(page, ".in-file", 1600, 360);
  await glideTo(page, ".in-file");
  await sleep(1800);
  await glideTo(page, 'button:has-text("Build my plan")');
  await until(53 + (recordingStart - t0) / 1000);
  await page.getByRole("button", { name: "Build my plan" }).click();

  // 0:55 to 1:15 · plan, phone and therapist
  mark("0:55 plan");
  await page.waitForSelector(".pl-plan-line", { timeout: 60_000 });
  await sleep(800);
  await glideTo(page, ".pl-plan-line");
  await sleep(3000);
  await glideTo(page, ".pl-qr");
  await sleep(3000);
  const code = ((await page.locator(".pl-code code").textContent()) ?? "").trim();
  await glideTo(page, ".pl-controls-help");
  await sleep(2500);
  // Show the phone page the QR opens. It's laid out for phones, so it's centred on a desktop screen.
  await page.goto(`${BASE}/s/${code}`, { waitUntil: "networkidle" });
  await sleep(1500);
  await glide(page, 960, 600, 800);
  await until(75 + (recordingStart - t0) / 1000);

  // 1:15 to 1:40 · a real live run
  mark("1:15 run");
  await page.goto(`${BASE}/runs/canonical`, { waitUntil: "networkidle" });
  await sleep(1500);
  await scrollTo(page, "svg[aria-label]", 3000, 140);
  await sleep(1000);
  const retreat = page.locator("svg[aria-label] title", { hasText: "CEILING_BODY" }).first();
  const retreatMark = retreat.locator("xpath=..");
  const markBox = await retreatMark.boundingBox().catch(() => null);
  if (markBox) await glide(page, markBox.x + markBox.width / 2, markBox.y + markBox.height / 2, 900);
  await sleep(3000);
  const suds = page.locator("svg[aria-label] title", { hasText: "CEILING_SUDS" }).first().locator("xpath=..");
  const sudsBox = await suds.boundingBox().catch(() => null);
  if (sudsBox) await glide(page, sudsBox.x + sudsBox.width / 2, sudsBox.y + sudsBox.height / 2, 900);
  await sleep(3000);
  await scrollTo(page, "table", 4000, 140);
  await sleep(1500);
  await smoothScroll(page, 500, 3000);
  await until(100 + (recordingStart - t0) / 1000);

  // 1:40 to 1:55 · proof, not promises
  mark("1:40 proof");
  await page.goto(`${BASE}/proof`, { waitUntil: "networkidle" });
  await sleep(1200);
  await scrollTo(page, "table", 1800, 160);
  const pass = page.locator("tr", { hasText: "F-CTRL" }).first();
  const passBox = await pass.boundingBox().catch(() => null);
  if (passBox) await glide(page, passBox.x + passBox.width * 0.8, passBox.y + passBox.height / 2, 900);
  await sleep(3500);
  const pending = page.locator("tr", { hasText: "F-RESP" }).first();
  const pendingBox = await pending.boundingBox().catch(() => null);
  if (pendingBox) await glide(page, pendingBox.x + pendingBox.width * 0.8, pendingBox.y + pendingBox.height / 2, 900);
  await until(115 + (recordingStart - t0) / 1000);

  // 1:55 to 2:00 · close
  mark("1:55 close");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await glide(page, 960, 420, 900);
  await until(121 + (recordingStart - t0) / 1000);
  mark("end");

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video?.path();
  if (raw) {
    const target = path.join(OUT, "raw.webm");
    renameSync(raw, target);
    console.log(`video ${target}; trim the first ${((recordingStart - t0) / 1000).toFixed(1)} s of page warm-up`);
  }
  console.log(readdirSync(OUT).join(", "));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
