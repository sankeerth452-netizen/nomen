"use client";
import { useState } from "react";
import { FEED_TARGETS, type FeedTarget } from "@/lib/feed/shared";

type Preview = { headers: string[]; suggestedMapping: Record<string, FeedTarget>; remembered?: string[]; preview: Record<string, unknown>[]; format: string };

/** Start a range from the brand's product file: open it, check what each column is, then add its products. */
export default function ProductFile({ rangeId }: { rangeId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, FeedTarget>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(extra: Record<string, string>) {
    setBusy(true); setError("");
    const f = new FormData();
    f.set("file", file!);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    const res = await fetch(`/api/ranges/${rangeId}/file`, { method: "POST", body: f });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "That upload didn't work. Please try again."); return null; }
    return data;
  }
  async function open() {
    const d = await send({});
    if (d) { setPreview(d); setMapping(d.suggestedMapping); }
  }
  async function add() {
    const d = await send({ mapping: JSON.stringify(mapping) });
    if (d) location.reload(); // the range now shows its products and the file's checks
  }

  return (
    <div className="card product-file">
      <strong>Or start from your product file</strong>
      <p className="muted">Your Google Merchant Center feed, a Shopify product export or any spreadsheet with one row per SKU (CSV or Excel, up to 30MB). Each product&apos;s photo is read from its image link, and its sizes are named together. Nothing in your file is changed: prices, stock and barcodes stay yours. Every product in the file is added, however many.</p>
      <label htmlFor="productFile">File</label>
      <input id="productFile" type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(""); }} />
      {!preview && <p><button disabled={!file || busy} onClick={open}>{busy ? "Opening…" : "Open the file"}</button></p>}

      {preview && (
        <>
          <p className="muted" style={{ marginTop: 16 }}>This looks like a <b>{preview.format}</b>. We&apos;ve matched each column to Google&apos;s name for it; change any that are wrong. The grey text is the first value in each column.{preview.remembered?.length ? " Columns marked “as last time” use what you chose for your last file." : ""}</p>
          <div className="table-wrap"><table className="file-map"><tbody>
            {preview.headers.map((h) => (
              <tr key={h}>
                <td>{h}{preview.remembered?.includes(h) && <span className="remembered"> · as last time</span>}<br /><span className="muted">{String(preview.preview[0]?.[h] ?? "").slice(0, 60)}</span></td>
                <td><select value={mapping[h] ?? "metadata"} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as FeedTarget })} aria-label={`What "${h}" is`}>
                  {FEED_TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></td>
              </tr>
            ))}
          </tbody></table></div>
          <p><button disabled={busy} onClick={add}>{busy ? "Checking the file… this can take a minute" : "Check the file and add its products"}</button></p>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
