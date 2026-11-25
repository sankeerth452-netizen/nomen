"use client";
import { useEffect, useState } from "react";

type Opt = { id: string; label: string };
type Conn = {
  connected: boolean; configured?: boolean; example?: boolean; email?: string | null;
  chosen?: { site: string | null; property: string | null; merchant: string | null };
  options?: { sites: Opt[]; properties: Opt[]; merchants: Opt[] };
  lastSyncAt?: string | null; lastSyncError?: string | null; problems?: string[];
};

const BACK: Record<string, string> = {
  connected: "Google is connected. Choose what Nomen should read, then save.",
  not_set_up: "Google sign-in isn't set up for this site yet. It needs a Google sign-in app in Render's settings (see the setup steps).",
  cancelled: "Google sign-in was cancelled. Nothing was connected.",
  signed_out: "You were signed out of Nomen during Google's sign-in. Sign in and try again.",
  error: "Google sign-in didn't finish. Please try again; if it keeps happening, check the Google sign-in app's settings.",
};

/** The brand's Google connection: Search Console, Analytics and Merchant Center, read-only. */
export default function GoogleCard({ brandId, back }: { brandId: string; back: string | null }) {
  const [c, setC] = useState<Conn | null>(null);
  const [pick, setPick] = useState({ site: "", property: "", merchant: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(back && BACK[back] ? { ok: back === "connected", text: BACK[back] } : null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/google/connection?brandId=${brandId}`);
    const d = (await r.json().catch(() => ({}))) as Conn & { error?: string };
    if (!r.ok) { setMsg({ ok: false, text: d.error ?? "Couldn't check the Google connection." }); return; }
    setC(d);
    if (d.chosen) setPick({ site: d.chosen.site ?? "", property: d.chosen.property ?? "", merchant: d.chosen.merchant ?? "" });
  }
  useEffect(() => { void load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/google/connection", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, ...pick }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved. Bring the figures in now, or they'll come in by themselves when the dashboard is next opened." } : { ok: false, text: d.error ?? "That didn't save." });
    if (r.ok) void load();
  }
  async function sync() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/google/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error ?? "Google's figures didn't come in." }); return; }
    setMsg({ ok: !d.problems?.length, text: `${d.pieces} named ${d.pieces === 1 ? "piece" : "pieces"} matched to their pages: ${d.rows} days of figures, ${d.queries} searches, ${d.statuses} Shopping statuses.${d.problems?.length ? ` Problems: ${d.problems.join(" ")}` : ""}` });
    void load();
  }
  async function disconnect() {
    if (!confirm("Disconnect Google? Nomen stops reading its figures; what's already been brought in stays.")) return;
    setBusy(true);
    await fetch(`/api/google/connection?brandId=${brandId}`, { method: "DELETE" });
    setBusy(false); setMsg({ ok: true, text: "Google is disconnected." }); void load();
  }

  const select = (key: keyof typeof pick, label: string, opts: Opt[], none: string) => (
    <label>{label}
      <select value={pick[key]} onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))} disabled={busy}>
        <option value="">{none}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        {pick[key] && !opts.some((o) => o.id === pick[key]) && <option value={pick[key]}>{pick[key]}</option>}
      </select>
    </label>
  );

  return (
    <section className="card google-card">
      <h2>Google</h2>
      <p className="muted small">Connect your own Search Console, Analytics and Merchant Center, so the dashboard shows how named pieces do in Google: impressions, clicks, views, sales and Shopping approval. Read-only: Nomen never changes anything in your Google accounts.</p>
      {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>}
      {!c ? <p className="muted small">Checking…</p> : !c.connected ? (
        <a className="btn" href={`/api/google/connect?brandId=${brandId}`}>Connect Google</a>
      ) : (<>
        <p className="small">Connected{c.email ? ` as ${c.email}` : ""}{c.example ? " (example figures in this preview version)" : ""}.{c.lastSyncAt ? ` Figures last brought in ${new Date(c.lastSyncAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.` : " No figures brought in yet."}</p>
        {c.lastSyncError && <p className="err small">Last time: {c.lastSyncError}</p>}
        {c.problems?.map((p) => <p key={p} className="err small">{p}</p>)}
        <div className="row3">
          {select("site", "Search Console site", c.options?.sites ?? [], "Don't read Search Console")}
          {select("property", "Analytics property", c.options?.properties ?? [], "Don't read Analytics")}
          {select("merchant", "Merchant Center account", c.options?.merchants ?? [], "Don't read Merchant Center")}
        </div>
        <div className="btns">
          <button type="button" onClick={save} disabled={busy}>Save</button>
          <button type="button" className="ghost" onClick={sync} disabled={busy || !(c.chosen?.site || c.chosen?.property || c.chosen?.merchant)}>{busy ? "Working…" : "Bring figures in now"}</button>
          <button type="button" className="link" onClick={disconnect} disabled={busy}>Disconnect</button>
        </div>
      </>)}
    </section>
  );
}
