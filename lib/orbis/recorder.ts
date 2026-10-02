"use client";

import { sha256OfBlob } from "./handoff";

const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

export type Recording = { blob: Blob; sha256: string; bytes: number; mimeType: string };

/** Records Orbis output only; the app never opens a camera. 1 s timeslices, 2.5 Mbps. */
export class TrialRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  static supported(): boolean {
    return typeof MediaRecorder !== "undefined" && MIME_CANDIDATES.some((m) => MediaRecorder.isTypeSupported(m));
  }

  start(stream: MediaStream) {
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType || !stream.getVideoTracks().length) return;
    this.chunks = [];
    this.recorder = new MediaRecorder(new MediaStream(stream.getTracks()), {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
  }

  get active(): boolean {
    return this.recorder?.state === "recording";
  }

  async stop(): Promise<Recording | null> {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder) return null;
    // The browser stops the recorder itself when the stream's tracks end (a dropped connection);
    // what it captured until then is still in this.chunks.
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    if (!this.chunks.length) return null;
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.chunks = [];
    return { blob, sha256: await sha256OfBlob(blob), bytes: blob.size, mimeType: recorder.mimeType };
  }
}
