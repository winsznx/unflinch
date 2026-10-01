"use client";

/** Centre-crop to 16:9 and scale to at most 1280×720 JPEG, so the anchor matches Orbis's frame and stays small. */
export async function prepareAnchorPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const target = 16 / 9;
  let sw = bitmap.width;
  let sh = Math.round(sw / target);
  if (sh > bitmap.height) {
    sh = bitmap.height;
    sw = Math.round(sh * target);
  }
  const scale = Math.min(1, 1280 / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

const key = (id: string) => `unflinch:anchor:${id}`;

export type StoredPhoto = { dataUrl: string; confirmedClean: boolean };

export function savePhoto(id: string, photo: StoredPhoto) {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(photo));
  } catch {
    // Storage full or blocked: the session continues without a place of its own.
  }
}

export function loadPhoto(id: string): StoredPhoto | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as StoredPhoto) : null;
  } catch {
    return null;
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(data ?? ""), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
