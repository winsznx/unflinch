/**
 * Records the 2-minute demo walkthrough of the deployed site, paced to the voice-over script
 * (internal/DEMO_VIDEO_SCRIPT.md), as a 2560x1440 MP4 with captions burned into a band under the page,
 * plus a matching .srt. Never starts a live Orbis session.
 *
 * Playwright's recordVideo encodes at a fixed low bitrate, so frames come from the DevTools screencast
 * instead and ffmpeg assembles them at their real timestamps.
 *   pnpm exec tsx scripts/record-demo.ts [baseUrl] [outDir]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright-core";

const BASE = process.argv[2] ?? "https://unflinch-zeta.vercel.app";
const OUT = process.argv[3] ?? "/tmp/unflinch-demo";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** CSS viewport. At SCALE it renders 2560x1280; the caption band adds 160 for 2560x1440. */
const SIZE = { width: 1600, height: 800 };
const SCALE = 1.6;
const FRAME = { width: SIZE.width * SCALE, height: SIZE.height * SCALE };
const BAND = 160;
const FPS = 30;

type SegmentKey = "problem" | "idea" | "intake" | "plan" | "phone" | "run" | "proof" | "close";

/** What the voice-over says in each segment, one caption per line, timed by length within the segment. */
const CAPTIONS: Record<SegmentKey, string[]> = {
  problem: [
    "About one in ten adults has a specific phobia, like dogs or heights.",
    "The best treatment is facing the fear in small steps.",
    "But a therapist can't bring a dog into a video call,",
    "and a YouTube clip can't slow down when you panic.",
  ],
  idea: [
    "Unflinch fixes that. You type what you're afraid of,",
    "and Visko Orbis generates it as one live scene.",
    "That beagle is a real frame from a live session.",
    "Every two seconds the scene moves with you:",
    "closer when you're okay, back when you're not.",
    "It never cuts. Same dog the whole time.",
  ],
  intake: [
    "You tell it what you fear, what you think will happen,",
    "and how likely it feels.",
    "You can even add a photo of your own street,",
    "so the last round happens somewhere real.",
  ],
  plan: [
    "It builds a short plan: three rounds in three places.",
    "Scan the code, and your phone becomes the sensor.",
    "A therapist can also get a private link to pace the session.",
  ],
  phone: ["Your phone sits on your chest and reads your breathing.", "No headset, no app."],
  run: [
    "This is a real session on Orbis.",
    "These lanes line up breathing, distress and how close the dog is.",
    "Here, breathing spiked, and the dog backed off.",
    "Here, distress hit 9, and it eased off again.",
    "Every decision is written down with its reason.",
    "This run used simulated breathing, and the page says so.",
  ],
  proof: [
    "We set our targets before testing.",
    "The safety controller matches an independent checker on all 100 test cases.",
    "Everything else says pending until it's measured.",
  ],
  close: ["Unflinch: practise facing your fear at your own pace.", "Not a medical device."],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
const segments: { key: SegmentKey; at: number }[] = [];
const mark = (key: SegmentKey) => {
  segments.push({ key, at: Date.now() });
  console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${key}`);
};

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
    deviceScaleFactor: SCALE,
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();

  // Warm the pages so nothing loads slowly on camera.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  const frames: { file: string; at: number }[] = [];
  const framesDir = path.join(OUT, "frames");
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", (frame) => {
    const file = path.join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, at: (frame.metadata.timestamp ?? Date.now() / 1000) * 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: FRAME.width,
    maxHeight: FRAME.height,
  });
  await sleep(300);
  const recordingStart = Date.now();
  mark("problem");

  // 0:00 to 0:15 · the problem
  await glide(page, SIZE.width / 2, SIZE.height * 0.5, 900);
  await sleep(2500);
  await scrollTo(page, "#problem", 4500);
  await sleep(1200);
  await glideTo(page, "#problem .m-why-card.is-featured");
  await until(15 + (recordingStart - t0) / 1000);

  // 0:15 to 0:35 · the idea
  mark("idea");
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
  mark("intake");
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
  mark("plan");
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
  mark("phone");
  await page.goto(`${BASE}/s/${code}`, { waitUntil: "networkidle" });
  await sleep(1500);
  await glide(page, SIZE.width / 2, SIZE.height * 0.6, 800);
  await sleep(3000);
  await until(75 + (recordingStart - t0) / 1000);

  // 1:15 to 1:40 · a real live run
  mark("run");
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
  mark("proof");
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
  await sleep(5000);

  // 1:55 to 2:00 · close
  mark("close");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await glide(page, SIZE.width / 2, SIZE.height * 0.42, 900);
  await sleep(6000);
  const end = Date.now();
  await cdp.send("Page.stopScreencast");

  const cues = timeCaptions(recordingStart, end);
  await renderCaptions(page, cues);
  await context.close();
  await browser.close();
  assemble(frames, recordingStart, end, cues);
}

type Cue = { text: string; start: number; end: number; image: string };

function timeCaptions(start: number, end: number): Cue[] {
  const cues: Cue[] = [];
  segments.forEach((segment, i) => {
    const from = (segment.at - start) / 1000;
    const to = ((segments[i + 1]?.at ?? end) - start) / 1000;
    const lines = CAPTIONS[segment.key];
    const total = lines.reduce((sum, line) => sum + line.length, 0);
    let cursorAt = from;
    for (const line of lines) {
      const span = ((to - from) * line.length) / total;
      cues.push({ text: line, start: cursorAt, end: cursorAt + span, image: "" });
      cursorAt += span;
    }
  });
  return cues;
}

async function renderCaptions(page: Page, cues: Cue[]) {
  const dir = path.join(OUT, "captions");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: FRAME.width, height: BAND });
  const html = (text: string) => `<!doctype html><html><body style="margin:0;width:${FRAME.width}px;height:${BAND}px;
    background:#0b0b0c;display:flex;align-items:center;justify-content:center;
    font:500 46px/1.25 -apple-system,'SF Pro Text','Helvetica Neue',sans-serif;color:#f4f5f7;letter-spacing:-0.01em;
    text-align:center;padding:0 160px;box-sizing:border-box">${text}</body></html>`;
  const blank = path.join(dir, "blank.png");
  await page.setContent(html(""));
  await page.screenshot({ path: blank, scale: "css" });
  for (const [i, cue] of cues.entries()) {
    cue.image = path.join(dir, `${String(i).padStart(3, "0")}.png`);
    await page.setContent(html(cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")));
    await page.screenshot({ path: cue.image, scale: "css" });
  }
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function assemble(frames: { file: string; at: number }[], start: number, end: number, cues: Cue[]) {
  const shown = frames.filter((frame) => frame.at <= end);
  const first = shown.findLastIndex((frame) => frame.at <= start);
  const video = shown.slice(Math.max(0, first));
  const videoList = video
    .map((frame, i) => {
      const from = Math.max(frame.at, start);
      const to = video[i + 1]?.at ?? end;
      return `file '${frame.file}'\nduration ${((to - from) / 1000).toFixed(4)}`;
    })
    .join("\n");
  writeFileSync(path.join(OUT, "frames.txt"), `${videoList}\nfile '${video.at(-1)!.file}'\n`);

  const blank = path.join(OUT, "captions", "blank.png");
  const bandList: string[] = [];
  let at = 0;
  for (const cue of cues) {
    if (cue.start > at) bandList.push(`file '${blank}'\nduration ${(cue.start - at).toFixed(4)}`);
    bandList.push(`file '${cue.image}'\nduration ${(cue.end - cue.start).toFixed(4)}`);
    at = cue.end;
  }
  bandList.push(`file '${cues.at(-1)!.image}'`);
  writeFileSync(path.join(OUT, "captions.txt"), `${bandList.join("\n")}\n`);

  writeFileSync(
    path.join(OUT, "unflinch-demo.srt"),
    cues.map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n"),
  );

  const duration = ((end - start) / 1000).toFixed(3);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", path.join(OUT, "frames.txt"),
    "-f", "concat", "-safe", "0", "-i", path.join(OUT, "captions.txt"),
    "-filter_complex",
    `[0:v]fps=${FPS},scale=${FRAME.width}:${FRAME.height}:flags=lanczos,setsar=1[page];` +
      `[1:v]fps=${FPS},scale=${FRAME.width}:${BAND},setsar=1[band];[page][band]vstack=inputs=2,format=yuv420p[v]`,
    "-map", "[v]", "-t", duration,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart",
    path.join(OUT, "unflinch-demo-2k.mp4"),
  ]);
  console.log(`frames ${video.length}, duration ${duration}s -> ${path.join(OUT, "unflinch-demo-2k.mp4")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
