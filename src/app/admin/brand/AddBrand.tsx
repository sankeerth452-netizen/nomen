"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type List = { brandId: string; brandName: string; keywords: number };

/** The owner adds a brand: its name, and whether it starts with a copy of a brand's keyword list or none. */
export default function AddBrand({ lists }: { lists: List[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copy, setCopy] = useState(lists[0]?.brandId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copying = lists.find((l) => l.brandId === copy);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/brands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, copyKeywordsFrom: copy || null }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(data.error ?? "That brand wasn't added. Please try again."); return; }
    router.push(`/admin/brand?brand=${data.id}&added=1`);
    router.refresh();
  }

  if (!open) return <p className="add-brand-open"><button type="button" className="ghost small" onClick={() => setOpen(true)}>Add a brand</button></p>;
  return (
    <form className="card add-brand" onSubmit={add}>
      <strong>Add a brand</strong>
      <p className="muted">A brand gets its own products, keyword list, brand profile, logins and Google connection. Its people only ever see its own work.</p>
      <label htmlFor="new-brand-name">Brand name</label>
      <input id="new-brand-name" required maxLength={60} placeholder="e.g. Cotton On" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
      <fieldset className="add-brand-lists" disabled={busy}>
        <legend>Keyword list</legend>
        {lists.map((l) => (
          <label key={l.brandId} className="check"><input type="radio" name="copy" checked={copy === l.brandId} onChange={() => setCopy(l.brandId)} /> Start with a copy of {l.brandName}&apos;s list ({l.keywords.toLocaleString()} search phrases)</label>
        ))}
        <label className="check"><input type="radio" name="copy" checked={copy === ""} onChange={() => setCopy("")} /> Start without one, and upload its own on the Keywords page</label>
      </fieldset>
      <p className="muted">Everything else starts empty: fill in its brand profile here, then give its team logins on the Logins page. Search figures are Australian, as for every brand.</p>
      {error && <p className="err" role="alert">{error}</p>}
      {busy && <p className="muted" role="status">Adding {name.trim() || "the brand"}{copying ? `. Copying ${copying.keywords.toLocaleString()} search phrases can take a minute or two` : ""}…</p>}
      <div className="btns">
        <button disabled={busy}>{busy ? "Adding…" : "Add the brand"}</button>
        <button type="button" className="ghost" onClick={() => { setOpen(false); setError(""); }} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
