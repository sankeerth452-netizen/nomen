"use client";
import { useState } from "react";
import Hint from "@/components/Hint";

type Added = { added: number; pasted: number; linked: number; noPhoto: number; badPictures: string[]; used: { header: string; as: string }[]; ignored: string[]; leftOut: number };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Add pieces from a buyer's spreadsheet (a line sheet): one row per piece, its photo pasted in or linked, and its details. */
export default function SheetUpload({ rangeId, onAdded, onClose }: { rangeId: string; onAdded: (message: string) => void; onClose?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!file || busy) return;
    setBusy(true); setError("");
    const f = new FormData();
    f.set("file", file);
    const res = await fetch(`/api/ranges/${rangeId}/sheet`, { method: "POST", body: f });
    const d = (await res.json().catch(() => ({}))) as Partial<Added> & { error?: string };
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "That spreadsheet didn't upload. Please try again."); return; }
    const parts = [
      d.pasted ? `${plural(d.pasted, "with its photo", "with their photos")} from the sheet` : "",
      d.linked ? `${plural(d.linked, "photo")} to fetch from ${d.linked === 1 ? "its link" : "their links"}` : "",
      d.noPhoto ? `${plural(d.noPhoto, "without a photo")}` : "",
    ].filter(Boolean);
    onAdded(`Added ${plural(d.added ?? 0, "piece")} from your spreadsheet${parts.length ? `: ${parts.join(", ")}` : ""}.`
      + (d.ignored?.length ? ` Not used: ${d.ignored.slice(0, 6).join(", ")}${d.ignored.length > 6 ? "…" : ""}.` : "")
      + (d.badPictures?.length ? ` A picture on ${d.badPictures.slice(0, 3).join(", ")} couldn't be opened.` : "")
      + (d.leftOut ? ` ${plural(d.leftOut, "row")} over the limit ${d.leftOut === 1 ? "was" : "were"} left out: add ${d.leftOut === 1 ? "it" : "them"} in another range.` : ""));
    setFile(null);
  }

  return (
    <div className="card sheet-upload">
      <strong>Add pieces from a spreadsheet<Hint text="A line sheet: one row per piece, with its photo pasted into the sheet (or a photo link) and what you know about it. Anything you write is used as written; the photo only fills in what you left blank." /></strong>
      <p className="muted">One row per piece: paste each photo over its row, then add its category, description and material (occasion is optional). Excel (.xlsx) or CSV, up to 30MB. <a href={`/api/ranges/template`} download>Download the template</a> to see the columns.</p>
      <label htmlFor={`sheet-${rangeId}`}>Spreadsheet</label>
      <input id={`sheet-${rangeId}`} type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
      <div className="btns">
        <button disabled={!file || busy} onClick={() => void add()}>{busy ? "Adding the pieces…" : "Add the pieces"}</button>
        {onClose && <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>}
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
