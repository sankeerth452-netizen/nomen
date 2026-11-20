"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import type { PhotoDetails } from "@/lib/pipeline/types";
import { frameAround, type Box } from "@/lib/frame";
import { render } from "@/lib/shrink";
import { MAX_PHOTOS, VIEW_LABEL, type PhotoInfo } from "@/lib/images/info";

/** Biggest file we'll try to open. The browser shrinks it before anything is sent. */
const MAX_FILE_BYTES = 25_000_000;

export type PhotoResult = { details: PhotoDetails; photos: PhotoInfo[]; focus: Box | null; example: boolean };
type Extra = { thumb: string; read: string };

export default function PhotoPicker({ thumb, productType, onThumb, onRead, onRemove, onMore }: {
  thumb: string | null;
  productType: string;
  onThumb: (thumb: string) => void;
  onRead: (r: PhotoResult) => void;
  onRemove: () => void;
  /** The other photos' kept copies, in order, whenever they change. */
  onMore?: (thumbs: string[]) => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [info, setInfo] = useState<PhotoInfo[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const moreInput = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const mainRead = useRef<string | null>(null);

  /** Read the main photo with every other photo of the piece, so what they show is combined. */
  async function readAll(main: string, more: Extra[], mine: number) {
    setReading(true);
    try {
      const res = await fetch("/api/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: main, extras: more.map((x) => x.read), productType: productType.trim() || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (mine !== run.current) return null; // a newer photo replaced this one
      if (!res.ok) { setError(data.error ?? COPY.photo.readFailed); return null; }
      const result = data as PhotoResult;
      setInfo(result.photos ?? []);
      return result;
    } catch {
      if (mine === run.current) setError(COPY.photo.readFailed);
      return null;
    } finally {
      if (mine === run.current) setReading(false);
    }
  }

  async function addMore(files: FileList | null) {
    const main = mainRead.current;
    if (!files?.length || !main || reading) return;
    setError("");
    const room = MAX_PHOTOS - 1 - extras.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/") && f.size <= MAX_FILE_BYTES).slice(0, room);
    if (!picked.length) { setError(room ? COPY.photo.notAPhoto : `A piece can have up to ${MAX_PHOTOS} photos.`); return; }
    let added: Extra[];
    try {
      added = await Promise.all(picked.map(async (f) => ({ thumb: await render(f, 900, 190_000), read: await render(f, 1568, 2_800_000) })));
    } catch { setError(COPY.photo.cantOpen); return; }
    const next = [...extras, ...added];
    setExtras(next); onMore?.(next.map((x) => x.thumb));
    if (moreInput.current) moreInput.current.value = "";
    const r = await readAll(main, next, ++run.current);
    if (r) onRead(r);
  }

  async function removeMore(i: number) {
    const main = mainRead.current;
    const next = extras.filter((_, n) => n !== i);
    setExtras(next); onMore?.(next.map((x) => x.thumb));
    if (!main) return;
    const r = await readAll(main, next, ++run.current);
    if (r) onRead(r);
  }

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
    mainRead.current = read;
    const result = await readAll(read, extras, mine);
    if (!result) return;
    // Frame the kept photo on the piece, the way a product page would show it.
    if (result.focus) {
      const framed = await render(file, 900, 190_000, (w, h) => frameAround(result.focus!, w, h)).catch(() => null);
      if (framed && mine === run.current) onThumb(framed);
    }
    onRead(result);
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
    mainRead.current = null;
    setExtras([]); setInfo([]); onMore?.([]);
    onRemove();
  }

  const problemsOf = (position: number) => info.find((p) => p.position === position)?.problems ?? [];
  const viewOf = (position: number) => { const v = info.find((p) => p.position === position)?.view; return v ? VIEW_LABEL[v] : null; };

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
        {thumb && mainRead.current && (
          <div className="more-photos">
            <p className="more-photos-head">More photos of this piece <span className="muted">(optional: back, side, details)</span></p>
            <ul>
              {problemsOf(0).length > 0 && <li className="more-photo main-note"><span className="photo-problem">Main photo: {problemsOf(0).join(" ")}</span></li>}
              {extras.map((x, i) => (
                <li key={i} className="more-photo">
                  <Image src={x.thumb} alt={info.find((p) => p.position === i + 1)?.alt ?? `Photo ${i + 2} of the piece`} width={64} height={80} unoptimized />
                  <span className="more-photo-copy">
                    <span>{viewOf(i + 1) ?? `Photo ${i + 2}`}</span>
                    {problemsOf(i + 1).map((p) => <span key={p} className="photo-problem">{p}</span>)}
                  </span>
                  <button type="button" className="ghost small" onClick={() => void removeMore(i)} disabled={reading} aria-label={`Remove photo ${i + 2}`}>Remove</button>
                </li>
              ))}
            </ul>
            {extras.length < MAX_PHOTOS - 1 && <label className="btn ghost small" htmlFor="morePhotos">Add more photos</label>}
            <input ref={moreInput} id="morePhotos" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addMore(e.target.files)} />
          </div>
        )}
      </div>
    </div>
  );
}
