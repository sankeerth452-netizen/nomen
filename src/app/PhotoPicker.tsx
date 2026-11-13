"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import type { PhotoDetails } from "@/lib/pipeline/types";
import { frameAround, type Box } from "@/lib/frame";

/** Biggest file we'll try to open. The browser shrinks it before anything is sent. */
const MAX_FILE_BYTES = 25_000_000;

/**
 * Draw part of a photo (default: all of it) into a JPEG data URL no bigger than `maxBytes`. White behind transparent
 * PNGs; the browser applies the camera's rotation. 1568px on the long edge is plenty for colour and details, and keeps
 * a read to about a cent of image input.
 */
async function render(file: File, maxEdge: number, maxBytes: number, crop?: (w: number, h: number) => { x: number; y: number; w: number; h: number }): Promise<string> {
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

export type PhotoResult = { details: PhotoDetails; focus: Box | null; example: boolean };

export default function PhotoPicker({ thumb, productType, onThumb, onRead, onRemove }: {
  thumb: string | null;
  productType: string;
  onThumb: (thumb: string) => void;
  onRead: (r: PhotoResult) => void;
  onRemove: () => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  async function take(file: File | undefined | null) {
    if (!file || reading) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError(COPY.photo.notAPhoto); return; }
    if (file.size > MAX_FILE_BYTES) { setError(COPY.photo.tooLarge); return; }
    const mine = ++run.current;
    let small: string, read: string;
    try {
      [small, read] = await Promise.all([render(file, 900, 190_000), render(file, 1568, 2_800_000)]);
    } catch (e) {
      setError(e instanceof Error && e.message === "too_large" ? COPY.photo.tooLarge : COPY.photo.cantOpen);
      return;
    }
    onThumb(small);
    setReading(true);
    try {
      const res = await fetch("/api/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: read, productType: productType.trim() || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (mine !== run.current) return; // a newer photo replaced this one
      if (!res.ok) { setError(data.error ?? COPY.photo.readFailed); return; }
      const result = data as PhotoResult;
      // Frame the kept photo on the piece, the way a product page would show it.
      if (result.focus) {
        const framed = await render(file, 900, 190_000, (w, h) => frameAround(result.focus!, w, h)).catch(() => null);
        if (framed && mine === run.current) onThumb(framed);
      }
      onRead(result);
    } catch {
      if (mine === run.current) setError(COPY.photo.readFailed);
    } finally {
      if (mine === run.current) setReading(false);
    }
  }

  // Paste a photo anywhere on the page (a copied product image, a screenshot).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) { e.preventDefault(); void take(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function remove() {
    run.current++;
    setReading(false);
    setError("");
    if (input.current) input.current.value = "";
    onRemove();
  }

  return (
    <div
      className={`photo-drop${over ? " over" : ""}${thumb ? " has" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files[0]); }}
    >
      <div className="photo-frame">
        {thumb ? <Image src={thumb} alt="Your photo of the piece" fill unoptimized /> : (
          <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="11" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M17 11l3-4h8l3 4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        )}
        {reading && <span className="photo-reading" aria-hidden="true" />}
      </div>
      <div className="photo-copy" aria-live="polite">
        {reading ? <p className="photo-status">Reading your photo…</p>
          : thumb ? <p className="photo-status">Photo added.</p>
          : <p className="photo-status">Drop a photo here, paste one, or choose a file. We&apos;ll fill in what we can see.</p>}
        <div className="photo-btns">
          <label className="btn ghost" htmlFor="photoFile">{thumb ? "Change photo" : "Choose a photo"}</label>
          {thumb && <button type="button" className="ghost" onClick={remove}>Remove</button>}
        </div>
        <input ref={input} id="photoFile" type="file" accept="image/*" className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
