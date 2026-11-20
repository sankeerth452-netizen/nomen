"use client";
import { useState } from "react";

/** The brand's switch: exports (the Google feed) include approved products only. */
export default function ApprovalSetting({ brandId, initial }: { brandId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle(next: boolean) {
    setBusy(true); setError("");
    const res = await fetch("/api/admin/brand", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, approvalRequired: next }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setOn(d.approvalRequired); else setError(d.error ?? "That didn't work. Please try again.");
  }
  return (
    <div className="card approval-setting">
      <label className="check">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span><b>Only export approved products</b><br /><span className="muted">{on ? "The Google feed includes approved products only. Everything else waits for a reviewer." : "Off: the Google feed includes every named product, as it always has. People's edits are used either way."}</span></span>
      </label>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
