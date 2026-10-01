import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";

import { repoRecording } from "@/lib/proof/runs";

const RANGE = /^bytes=(\d*)-(\d*)$/;

function contentType(file: string): string {
  return file.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
}

/** Streams a committed recording from evidence/live/<id>/ with byte ranges so the player can seek. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trial = Number(new URL(request.url).searchParams.get("trial"));
  const file = Number.isInteger(trial) ? await repoRecording(id, trial) : null;
  if (!file) return new Response("Recording not found", { status: 404 });

  const { size } = await fs.stat(file);
  const headers = new Headers({
    "content-type": contentType(file),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  });

  const match = RANGE.exec(request.headers.get("range") ?? "");
  if (!match || (!match[1] && !match[2])) {
    headers.set("content-length", String(size));
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
  }

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
    status: 206,
    headers,
  });
}
