"use client";

/**
 * Last-frame handoff between trials (PRD §4.2): draw the live <video> to a canvas
 * (a MediaStream source isn't tainted), crop 16:9, scale to 854×480, JPEG q=0.9.
 */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return null;
  const targetRatio = 16 / 9;
  let sw = w;
  let sh = Math.round(w / targetRatio);
  if (sh > h) {
    sh = h;
    sw = Math.round(h * targetRatio);
  }
  const sx = Math.round((w - sw) / 2);
  const sy = Math.round((h - sh) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 854;
  canvas.height = 480;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

export async function sha256OfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
