// Runs in the browser: photos are shrunk before they are sent, so uploads stay small and Claude reads a sensible size.

/**
 * Draw part of a photo (default: all of it) into a JPEG data URL no bigger than `maxBytes`. White behind transparent
 * PNGs; the browser applies the camera's rotation. 1568px on the long edge is plenty for colour and details, and keeps
 * a read to about a cent of image input.
 */
export async function render(file: File, maxEdge: number, maxBytes: number, crop?: (w: number, h: number) => { x: number; y: number; w: number; h: number }): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const r = crop ? crop(bmp.width, bmp.height) : { x: 0, y: 0, w: bmp.width, h: bmp.height };
    for (const [edge, quality] of [[maxEdge, 0.85], [maxEdge, 0.72], [Math.round(maxEdge * 0.75), 0.7]] as const) {
      const scale = Math.min(1, edge / Math.max(r.w, r.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(r.w * scale));
      canvas.height = Math.max(1, Math.round(r.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if ((url.length - url.indexOf(",") - 1) * 0.75 <= maxBytes) return url;
    }
  } finally {
    bmp.close();
  }
  throw new Error("too_large");
}
