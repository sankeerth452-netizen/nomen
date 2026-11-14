/** Where the piece sits in a photo, as fractions of its width and height (0-1). */
export type Box = { left: number; top: number; right: number; bottom: number };

/** A product-page portrait (4:5) around the piece, with a little room on every side, kept inside the photo. */
export function frameAround(box: Box, width: number, height: number) {
  const ratio = 4 / 5, room = 1.16;
  const bw = (box.right - box.left) * width, bh = (box.bottom - box.top) * height;
  let h = Math.max(bh * room, (bw * room) / ratio), w = h * ratio;
  if (w > width) { w = width; h = w / ratio; }
  if (h > height) { h = height; w = h * ratio; }
  const cx = ((box.left + box.right) / 2) * width, cy = ((box.top + box.bottom) / 2) * height;
  return { x: Math.min(Math.max(cx - w / 2, 0), width - w), y: Math.min(Math.max(cy - h / 2, 0), height - h), w, h };
}

/** CSS object-position that keeps the piece in view when a photo is cropped to fill a frame ("50% 30%"). */
export function objectPosition(box: Box | null | undefined): string | undefined {
  if (!box) return undefined;
  const pc = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
  return `${pc((box.left + box.right) / 2)} ${pc((box.top + box.bottom) / 2)}`;
}
