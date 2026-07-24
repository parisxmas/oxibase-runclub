"use client";

// Preparing a photo for upload, entirely in the browser.
//
// A phone photo is routinely 4–12 MB, which is both larger than a Vercel
// function will accept (4.5 MB) and far larger than a feed image needs. So it
// is decoded, rotated upright, scaled down and re-encoded — as WebP where the
// browser can, which is roughly a third the size of JPEG at the same quality.
//
// Nothing here touches the server: what leaves the browser is already small.

/** Longest edge of the stored image. A feed photo is never shown wider. */
const MAX_EDGE = 1600;
/** Aim for this; quality is stepped down until the encode fits. */
const TARGET_BYTES = 400_000;
/** Below this, stop trying — further compression only costs visible detail. */
const MIN_QUALITY = 0.5;

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** The original file size, for showing what the resize saved. */
  originalBytes: number;
};

/** Does this browser encode WebP from a canvas? (Everything current does.) */
function supportsWebp(): boolean {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Decode a file to a bitmap, honouring EXIF orientation so photos taken in
 * portrait are not stored on their side. `createImageBitmap` does that for us
 * where available; the `<img>` fallback is for older Safari.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("could not read the image"));
      img.src = url;
    });
  } finally {
    // Revoked after decode; the bitmap keeps its own copy of the pixels.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("could not encode the image"))),
      type,
      quality,
    ),
  );
}

/**
 * Scale and compress `file` for upload. Returns the smallest encode that stays
 * within {@link TARGET_BYTES}, or the best effort at {@link MIN_QUALITY}.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const source = await decode(file);
  const sw = "width" in source ? source.width : 0;
  const sh = "height" in source ? source.height : 0;
  if (!sw || !sh) throw new Error("could not read the image");

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // Better downscaling than the default nearest-ish sampling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if ("close" in source) source.close();

  const type = supportsWebp() ? "image/webp" : "image/jpeg";

  let blob = await encode(canvas, type, 0.85);
  for (const quality of [0.75, 0.65, MIN_QUALITY]) {
    if (blob.size <= TARGET_BYTES) break;
    blob = await encode(canvas, type, quality);
  }

  return { blob, width, height, originalBytes: file.size };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
