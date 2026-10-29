"use client";
import { useState } from "react";

type Brand = { id: string; name: string };
type DS = { id: string; name: string; status: string; active: boolean; brandId: string; accepted: number; rejected: number; duplicate: number; created: string };
type Preview = { headers: string[]; suggestedMapping: Record<string, string>; preview: Record<string, unknown>[] };
type Summary = { datasetId: string; rowsRead: number; accepted: number; rejected: number; duplicates: number; warnings: Record<string, { count: number }> };

const TARGETS = ["keyword", "category", "subcategory", "volume", "competition", "cpc", "intent", "country", "language", "updated_at", "metadata", "ignore"];

export default function DatasetsClient({ brands, datasets }: { brands: Brand[]; datasets: DS[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rule, setRule] = useState("max");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (extra: Record<string, string>) => {
    setBusy(true); setError("");
    const f = new FormData();
    f.set("file", file!); f.set("brandId", brandId); if (name) f.set("name", name);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    const res = await fetch("/api/admin/datasets/validate", { method: "POST", body: f });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Upload failed"); return null; }
    return data;
  };

  async function inspect() {
    const d = await send({});
    if (d) { setPreview(d); setMapping(d.suggestedMapping); setSummary(null); }
  }
  async function runImport() {
    const d = await send({ mapping: JSON.stringify(mapping), volumeRule: rule });
    if (d) setSummary(d);
  }
  async function activate(id: string) {
    const res = await fetch(`/api/admin/datasets/${id}/activate`, { method: "POST" });
    if (res.ok) location.reload(); else setError((await res.json().catch(() => ({}))).error ?? "Failed");
  }
  const volCols = Object.values(mapping).filter((t) => t === "volume").length;

  return (
    <div className="admin-grid">
      <div>
      <div className="card">
        <strong>Upload a new version</strong>
        <p className="muted" style={{ fontSize: 14 }}>CSV or XLSX, up to 30MB. A bad file never touches the active version.</p>
        {brands.length > 1 && <><label>Brand</label><select value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></>}
        <label>Version name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Generic Oct 2026" />
        <label>File</label><input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSummary(null); }} />
        <p><button disabled={!file || busy} onClick={inspect}>{busy && !preview ? "Reading…" : "Read file"}</button></p>
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Check the columns</strong>
          <table><tbody>
            {preview.headers.filter(Boolean).map((h) => (
              <tr key={h}><td>{h}<br /><span className="muted">{String(preview.preview[0]?.[h] ?? "")}</span></td>
                <td><select value={mapping[h]} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>{TARGETS.map((t) => <option key={t}>{t}</option>)}</select></td></tr>
            ))}
          </tbody></table>
          {volCols > 1 && (<>
            <label>{volCols} volume columns, combine as</label>
            <select value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="max">Highest value (default)</option>
              <option value="first_available">First available, left to right</option>
              <option value="sum">Add together (double-counts overlap)</option>
            </select>
            <p className="muted">Every raw value is kept on the keyword either way.</p>
          </>)}
          <p><button disabled={busy} onClick={runImport}>{busy ? "Importing… (can take a minute)" : "Validate and import"}</button></p>
        </div>
      )}

      {summary && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Import summary</strong>
          <p>{summary.accepted.toLocaleString()} accepted · {summary.rejected.toLocaleString()} rejected · {summary.duplicates.toLocaleString()} duplicates (of {summary.rowsRead.toLocaleString()} rows)</p>
          {Object.entries(summary.warnings).map(([k, v]) => <p key={k} className="muted">{k.replace(/_/g, " ")}: {v.count.toLocaleString()}</p>)}
          <p className="muted">Saved as an inactive version. Activate it below when you&apos;re happy.</p>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      </div>

      <div className="admin-section">
      <h2>Versions</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Status</th><th>Rows</th><th>Uploaded</th><th /></tr></thead>
        <tbody>{datasets.map((d) => (
          <tr key={d.id}>
            <td>{d.name}</td><td><span className={`status${d.active ? " on" : d.status === "failed" ? " off" : ""}`}>{d.active ? "Active" : d.status}</span></td>
            <td>{d.accepted.toLocaleString()}{d.rejected + d.duplicate > 0 && <> · <a href={`/api/admin/datasets/${d.id}/rejections`}>{(d.rejected + d.duplicate).toLocaleString()} rejected</a></>}</td>
            <td>{d.created}</td>
            <td>{!d.active && ["ready", "archived"].includes(d.status) && <button className="link" onClick={() => activate(d.id)}>{d.status === "archived" ? "Roll back to this" : "Activate"}</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {datasets.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No versions yet. Upload the first keyword file on the left.</p>}
      </div>
    </div>
  );
}
