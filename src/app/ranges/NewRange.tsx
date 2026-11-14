"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Start an empty range and open it. Owners, who aren't tied to one brand, choose the brand first. */
export default function NewRange({ brands, label = "Start a new range" }: { brands: { id: string; name: string }[]; label?: string }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    const res = await fetch("/api/ranges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(brandId ? { brandId } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(data.error ?? "That didn't work. Please try again."); return; }
    router.push(`/ranges/${data.id}`);
  }

  return (
    <div className="new-range">
      {brands.length > 1 && (
        <div className="type-field">
          <label htmlFor="rangeBrand">Brand</label>
          <select id="rangeBrand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
      )}
      <button className="btn" onClick={start} disabled={busy}>{busy ? "Starting…" : label}</button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
