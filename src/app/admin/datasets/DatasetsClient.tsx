"use client";
import { useState } from "react";

type Brand = { id: string; name: string };
type DS = { id: string; name: string; status: string; active: boolean; brandId: string; accepted: number; rejected: number; duplicate: number; created: string };
type Preview = { headers: string[]; suggestedMapping: Record<string, string>; preview: Record<string, unknown>[] };
type Summary = { datasetId: string; rowsRead: number; accepted: number; rejected: number; duplicates: number; warnings: Record<string, { count: number }> };

// Column roles. The value is what the importer understands; the label is what people see.
const TARGETS: [string, string][] = [
  ["keyword", "The keyword"], ["volume", "Monthly searches"], ["category", "Category"], ["subcategory", "Sub-category"],
  ["competition", "Competition"], ["cpc", "Cost per click"], ["intent", "Search intent"], ["country", "Country"],
  ["language", "Language"], ["updated_at", "Date updated"], ["metadata", "Keep as extra info"], ["ignore", "Don't use"],
];
const WARNING: Record<string, string> = {
  unparseable_volume: "search numbers we couldn't read", negative_volume: "negative search numbers (left out)",
  extreme_volume: "unusually high search numbers (worth a check)", no_volume: "rows without a search number",
  unparseable_date: "dates we couldn't read",
};
const STATUS: Record<string, string> = { uploading: "Uploading", validating: "Checking", ready: "Ready to use", archived: "Earlier version", failed: "Couldn't be read" };

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
    if (!res.ok) { setError(data.error ?? "That upload didn't work. Please try again."); return null; }
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
    if (res.ok) location.reload(); else setError((await res.json().catch(() => ({}))).error ?? "That didn't work. Please try again.");
  }
  const volCols = Object.values(mapping).filter((t) => t === "volume").length;

  return (
    <div className="admin-grid">
      <div>
      <div className="card">
        <strong>Upload a new version</strong>
        <p className="muted" style={{ fontSize: 14 }}>Your keyword export from Ahrefs or Google Keyword Planner, as CSV or Excel (up to 30MB). The list you&apos;re using now stays in place until you switch to the new one.</p>
        {brands.length > 1 && <><label>Brand</label><select value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></>}
        <label>Name this version</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dresses, October 2026" />
        <label>File</label><input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSummary(null); }} />
        <p><button disabled={!file || busy} onClick={inspect}>{busy && !preview ? "Opening…" : "Open the file"}</button></p>
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Tell us what each column is</strong>
          <p className="muted" style={{ fontSize: 14 }}>We&apos;ve made our best guess. The grey text is the first value in each column.</p>
          <table><tbody>
            {preview.headers.filter(Boolean).map((h) => (
              <tr key={h}><td>{h}<br /><span className="muted">{String(preview.preview[0]?.[h] ?? "")}</span></td>
                <td><select value={mapping[h]} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>{TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>
            ))}
          </tbody></table>
          {volCols > 1 && (<>
            <label>You have {volCols} search-number columns. Use</label>
            <select value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="max">The highest number (recommended)</option>
              <option value="first_available">The first column that has a number</option>
              <option value="sum">Both added together (can double-count)</option>
            </select>
            <p className="muted">We keep every original number either way.</p>
          </>)}
          <p><button disabled={busy} onClick={runImport}>{busy ? "Saving… this can take a minute" : "Check and save this version"}</button></p>
        </div>
      )}

      {summary && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Saved</strong>
          <p>{summary.accepted.toLocaleString()} keywords added from {summary.rowsRead.toLocaleString()} rows. {summary.rejected + summary.duplicates > 0 && `${(summary.rejected + summary.duplicates).toLocaleString()} left out (${summary.duplicates.toLocaleString()} repeats, ${summary.rejected.toLocaleString()} we couldn't use).`}</p>
          {Object.entries(summary.warnings).map(([k, v]) => <p key={k} className="muted">{v.count.toLocaleString()} {WARNING[k] ?? "rows to check"}</p>)}
          <p className="muted">It isn&apos;t in use yet. Switch to it in the list when you&apos;re happy.</p>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      </div>

      <div className="admin-section">
      <h2>Your keyword lists</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Version</th><th>Status</th><th>Keywords</th><th>Uploaded</th><th /></tr></thead>
        <tbody>{datasets.map((d) => (
          <tr key={d.id}>
            <td>{d.name}</td><td><span className={`status${d.active ? " on" : d.status === "failed" ? " off" : ""}`}>{d.active ? "In use" : STATUS[d.status] ?? d.status}</span></td>
            <td>{d.accepted.toLocaleString()}{d.rejected + d.duplicate > 0 && <> · <a href={`/api/admin/datasets/${d.id}/rejections`}>{(d.rejected + d.duplicate).toLocaleString()} left out (download)</a></>}</td>
            <td>{d.created}</td>
            <td>{!d.active && ["ready", "archived"].includes(d.status) && <button className="link" onClick={() => activate(d.id)}>{d.status === "archived" ? "Go back to this one" : "Use this list"}</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {datasets.length === 0 && <p className="muted" style={{ marginTop: 16 }}>Nothing uploaded yet. Add your first keyword list on the left.</p>}
      </div>
    </div>
  );
}
