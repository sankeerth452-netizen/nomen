"use client";
import { useState } from "react";

/** Google's category list: how many and when, and (for the owner) an update from Google. */
export default function GoogleCategories({ total, updated, canUpdate }: { total: number; updated: string | null; canUpdate: boolean }) {
  const [state, setState] = useState({ total, updated, busy: false, msg: "" });
  async function update() {
    setState((s) => ({ ...s, busy: true, msg: "" }));
    const res = await fetch("/api/admin/google-categories", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setState((s) => res.ok
      ? (d.added || d.renamed ? { total: d.total, updated: "just now", busy: false, msg: `${d.added} new, ${d.renamed} renamed.` } : { ...s, busy: false, msg: "Checked with Google just now: already up to date." })
      : { ...s, busy: false, msg: d.error ?? "That didn't work. Try again later." });
  }
  return (
    <p className="muted storage-note">
      Google&apos;s category list: {state.total.toLocaleString("en-AU")} categories{state.updated ? `, updated ${state.updated}` : ""}. Every Google category Nomen sends is checked against it.
      {canUpdate && <> <button className="link" onClick={update} disabled={state.busy}>{state.busy ? "Updating…" : "Update from Google"}</button></>}
      {state.msg && <> {state.msg}</>}
    </p>
  );
}
