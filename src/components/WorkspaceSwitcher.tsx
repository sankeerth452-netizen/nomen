"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** The owner's brand workspace: pick one brand, or every brand. Pages then show that brand by default. */
export default function WorkspaceSwitcher({ brands, current }: { brands: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  async function change(v: string) {
    setValue(v); setBusy(true);
    const res = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: v || null }) });
    setBusy(false);
    if (res.ok) router.refresh(); else setValue(current ?? "");
  }
  return (
    <label className="workspace">
      <span className="sr-only">Brand you&apos;re working in</span>
      <select value={value} onChange={(e) => void change(e.target.value)} disabled={busy}>
        <option value="">Every brand</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}
