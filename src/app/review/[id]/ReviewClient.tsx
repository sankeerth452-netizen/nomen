"use client";
import Image from "next/image";
import { VIEW_LABEL } from "@/lib/images/info";
import Link from "next/link";
import { useState } from "react";
import type { ReviewPayload } from "@/lib/review/load";
import { OCCASIONS } from "@/lib/sheet/idealFor";
import { ColourSwatches } from "@/components/ColourSwatches";

type Field = ReviewPayload["fields"][number];
type Detail = { section?: string; name: string; value: string };

const ORIGINAL_LABELS: Record<string, string> = {
  freeText: "Described as", productType: "Product type", colour: "Colour", material: "Material", pattern: "Pattern", fit: "Fit", length: "Length",
  feature: "Key detail", occasion: "Occasion", audience: "Audience", extra: "Notes",
  title: "Title", description: "Description", color: "Colour", size: "Size", price: "Price", sale_price: "Sale price", gtin: "GTIN", brand: "Brand", link: "Product link",
};

/** A field's value as editable text, and back. Lists are one per line; details are "Name: Value" per line. */
function toText(f: Field, v: unknown): string {
  if (v == null) return "";
  if (f.kind === "list") return (v as string[]).join("\n");
  if (f.kind === "details") return (v as Detail[]).map((d) => `${d.name}: ${d.value}`).join("\n");
  if (f.kind === "category") return v && typeof v === "object" ? String((v as { id: number }).id) : String(v);
  return String(v);
}
function fromText(f: Field, t: string): unknown {
  if (f.kind === "list") return t.split("\n").map((x) => x.trim()).filter(Boolean);
  if (f.kind === "details") return t.split("\n").map((l) => { const i = l.indexOf(":"); return i > 0 ? { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(Boolean);
  return t;
}
function show(f: Field, v: unknown): string {
  if (v == null || (Array.isArray(v) && !v.length)) return "";
  if (f.kind === "occasions") return (v as string[]).map((k) => OCCASIONS.find((o) => o.key === k)?.label ?? k).join(", ");
  if (f.kind === "category") return v && typeof v === "object" ? `${(v as { path: string }).path.replace(/^Clothing & Accessories > /, "")} (${(v as { id: number }).id})` : String(v);
  return toText(f, v);
}
const when = (d: string | Date) => new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function ReviewClient({ initial }: { initial: ReviewPayload }) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(path: string, body: unknown, method = "POST") {
    setBusy(true); setError("");
    const res = await fetch(`/api/reviews/${p.id}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "That didn't work. Please try again."); return false; }
    setP(d); return true;
  }
  const act = (action: string, fields?: string[]) => send("/action", { action, fields });

  const name = (p.fields.find((f) => f.key === "name")?.current as string) ?? "Untitled";
  const groups = [...new Set(p.fields.map((f) => f.group))];
  const order = Object.keys(ORIGINAL_LABELS);
  const byOrder = (a: [string, unknown], b: [string, unknown]) => order.indexOf(a[0]) - order.indexOf(b[0]);
  const original = Object.entries(p.original.input ?? {}).filter(([k, v]) => typeof v === "string" && v.trim() && ORIGINAL_LABELS[k]).sort(byOrder);
  const fileRow = p.original.file ? Object.entries(p.original.file).filter(([k, v]) => v && ORIGINAL_LABELS[k]).sort(byOrder) : [];
  const canExport = p.status === "approved" || p.status === "ready_to_export";

  return (
    <div className="review">
      <div className="review-head">
        <div>
          <Link className="back" href="/review">← Review</Link>
          <h1 className="review-name">{name}</h1>
          <p className="muted">
            <span className={`look-status rv-${p.status}`}>{p.statusLabel}</span>
            {p.confidence && <> · {p.confidence} confidence</>}
            {p.approvedBy && canExport && <> · approved by {p.approvedBy}{p.approvedAt ? `, ${when(p.approvedAt)}` : ""}</>}
            {p.range && <> · from the range <Link href={`/ranges/${p.range.id}`}>{p.range.title}</Link></>}
            {" "}· <Link href={`/history/${p.id}`}>Evidence</Link>
          </p>
          {p.approvalRequired && <p className="muted small">Your brand exports approved products only.</p>}
        </div>
        <div className="review-actions">
          {p.can.edit && ["ai_generated", "rejected"].includes(p.status) && <button disabled={busy} onClick={() => act("submit")}>Send for review</button>}
          {p.can.approve && !canExport && <button disabled={busy} onClick={() => act("approve")}>Approve all</button>}
          {p.can.approve && p.status === "approved" && <button disabled={busy} onClick={() => act("ready")}>Mark ready to export</button>}
          {p.can.approve && p.status !== "rejected" && !canExport && <button className="ghost" disabled={busy} onClick={() => act("reject")}>Reject</button>}
          {p.can.approve && (canExport || p.status === "rejected") && <button className="ghost" disabled={busy} onClick={() => act("reopen")}>Reopen</button>}
        </div>
      </div>
      {error && <p className="err" role="alert">{error}</p>}

      <div className="review-grid">
        <aside className="review-side">
          {p.hasPhoto && <div className="review-photo"><Image src={`/api/generations/${p.id}/photo`} alt="The product photo" fill unoptimized sizes="320px" /></div>}
          {(p.morePhotos.length > 0 || p.photos.some((x) => x.problems.length) || p.seen.attributes.length > 0 || p.seen.contradictions.length > 0) && (
            <div className="card review-photos">
              <strong>Photos</strong>
              {p.morePhotos.length > 0 && (
                <ul className="photo-thumbs">
                  {p.morePhotos.map((pos) => { const info = p.photos.find((x) => x.position === pos); return (
                    <li key={pos} title={info?.alt ?? undefined}>
                      <span className="strip-photo"><Image src={`/api/generations/${p.id}/photos/${pos}`} alt={info?.alt ?? `Photo ${pos + 1}`} fill unoptimized /></span>
                      <span className="strip-label">{info?.view ? VIEW_LABEL[info.view] : `Photo ${pos + 1}`}</span>
                    </li>
                  ); })}
                </ul>
              )}
              {p.photos.filter((x) => x.position > 0 && x.alt).map((x) => <p key={x.position} className="small"><span className="muted">Photo {x.position + 1} alt text:</span> {x.alt}</p>)}
              {p.seen.attributes.length > 0 && <p className="small"><span className="muted">What the photos show:</span> {p.seen.attributes.map((a) => `${a.name} ${a.value}${a.seen === "partly" ? " (partly visible)" : ""}`).join(" · ")}</p>}
              {p.seen.contradictions.map((c) => <p key={c} className="small warn-text">{c}</p>)}
              {p.photos.flatMap((x) => x.problems.map((m) => <p key={`${x.position}${m}`} className="photo-problem">{x.position === 0 ? "Main photo" : `Photo ${x.position + 1}`}: {m}</p>))}
            </div>
          )}
          <div className="card">
            <strong>What we were given</strong>
            <dl className="review-original">
              {original.map(([k, v]) => <div key={k}><dt>{ORIGINAL_LABELS[k]}</dt><dd>{String(v).slice(0, 600)}</dd></div>)}
            </dl>
            {fileRow.length > 0 && <>
              <strong>From the product file{p.original.skus.length ? ` (${p.original.skus.length} SKU${p.original.skus.length === 1 ? "" : "s"})` : ""}</strong>
              <dl className="review-original">{fileRow.map(([k, v]) => <div key={k}><dt>{ORIGINAL_LABELS[k]}</dt><dd>{String(v).slice(0, 400)}</dd></div>)}</dl>
            </>}
          </div>
          {(p.warnings.length > 0 || p.checks.length > 0) && (
            <div className="card">
              <strong>Nomen says check</strong>
              <ul className="report-list">{[...p.checks, ...p.warnings].map((w, i) => <li key={i} className="warn">{w}</li>)}</ul>
            </div>
          )}
        </aside>

        <div className="review-fields">
          {groups.map((g) => (
            <section key={g} className="review-group">
              <h2>{g}</h2>
              {p.fields.filter((f) => f.group === g).map((f) => (
                <FieldRow key={`${f.key}:${JSON.stringify(f.current)}`} f={f} revisions={p.revisions.filter((r) => r.field === f.key)} can={p.can} busy={busy}
                  onSave={(value) => send("", { field: f.key, value }, "PATCH")}
                  onRestore={(from) => send("/restore", { field: f.key, ...from })}
                  onJudge={(action) => act(action, [f.key])} />
              ))}
            </section>
          ))}

          <section className="review-group">
            <h2>Comments</h2>
            {p.comments.length === 0 && <p className="muted">No comments yet.</p>}
            <ul className="review-comments">
              {p.comments.map((c) => (
                <li key={c.id}><b>{c.by}</b> <span className="muted">{when(c.at)}{c.field ? ` · ${p.fields.find((f) => f.key === c.field)?.label ?? c.field}` : ""}</span>{c.flag && <span className="rv-flag">AI mistake</span>}<br />{c.body}</li>
              ))}
            </ul>
            {p.can.comment && <CommentForm fields={p.fields} busy={busy} onSend={(body) => send("/comments", body)} />}
          </section>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ f, revisions, can, busy, onSave, onRestore, onJudge }: {
  f: Field; revisions: ReviewPayload["revisions"]; can: ReviewPayload["can"]; busy: boolean;
  onSave: (v: unknown) => Promise<boolean>; onRestore: (from: { revisionId: string } | { ai: true }) => Promise<boolean>; onJudge: (a: "approve" | "reject") => void;
}) {
  const [text, setText] = useState(toText(f, f.current));
  const [picked, setPicked] = useState<string[]>((f.current as string[] | null) ?? []);
  const [history, setHistory] = useState(false);
  const dirty = f.kind === "occasions" ? JSON.stringify(picked) !== JSON.stringify(f.current ?? []) : text !== toText(f, f.current);
  const save = async () => { if (await onSave(f.kind === "occasions" ? picked : fromText(f, text))) setHistory(false); };
  const id = `field-${f.key}`;

  return (
    <div className={`review-field${f.fieldStatus ? ` is-${f.fieldStatus}` : ""}`}>
      <div className="review-field-head">
        <label htmlFor={id}>{f.label}</label>
        {f.edited && <span className="rv-badge">Edited</span>}
        {f.fieldStatus === "approved" && <span className="rv-badge ok">Approved</span>}
        {f.fieldStatus === "rejected" && <span className="rv-badge bad">Rejected</span>}
        {f.key === "colour" && typeof f.current === "string" && f.current && <ColourSwatches value={f.current} small />}
      </div>
      {!f.available ? <p className="muted">Not written for this product.</p> : !can.edit ? (
        <p className="review-value">{show(f, f.current) || <span className="muted">Not given</span>}</p>
      ) : f.kind === "select" ? (
        <select id={id} value={text} onChange={(e) => setText(e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
      ) : f.kind === "occasions" ? (
        <div className="review-occasions" id={id}>
          {OCCASIONS.map((o) => (
            <label key={o.key} className="check"><input type="checkbox" aria-label={o.label} checked={picked.includes(o.key)} disabled={!picked.includes(o.key) && picked.length >= (f.maxItems ?? 4)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, o.key] : cur.filter((k) => k !== o.key)))} /> {o.label}</label>
          ))}
        </div>
      ) : f.kind === "text" || f.kind === "category" ? (
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={f.max} inputMode={f.kind === "category" ? "numeric" : undefined} />
      ) : (
        <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={f.key === "description" ? 12 : f.kind === "textarea" ? 4 : Math.max(3, text.split("\n").length + 1)} />
      )}
      {f.available && can.edit && (f.kind === "list" || f.kind === "details") && <p className="muted small">{f.kind === "details" ? "One per line, as “Name: Value”." : "One per line."}</p>}
      {f.available && can.edit && f.kind === "category" && f.current != null && <p className="muted small">{show(f, f.current)}</p>}
      {f.available && can.edit && f.max && (f.kind === "text" || f.kind === "textarea") && <p className="muted small">{text.length} of {f.max} characters</p>}
      <div className="review-field-actions">
        {can.edit && dirty && <button disabled={busy} onClick={save}>Save</button>}
        {can.edit && dirty && <button className="link" onClick={() => { setText(toText(f, f.current)); setPicked((f.current as string[] | null) ?? []); }}>Cancel</button>}
        {can.edit && f.edited && !dirty && <button className="link" disabled={busy} onClick={() => onRestore({ ai: true })}>Use the AI&apos;s version</button>}
        {can.approve && f.available && f.fieldStatus !== "approved" && <button className="link" disabled={busy} onClick={() => onJudge("approve")}>Approve</button>}
        {can.approve && f.available && f.fieldStatus !== "rejected" && <button className="link" disabled={busy} onClick={() => onJudge("reject")}>Reject</button>}
        {revisions.length > 0 && <button className="link" onClick={() => setHistory((h) => !h)} aria-expanded={history}>History ({revisions.length})</button>}
      </div>
      {f.edited && f.ai != null && !history && <p className="muted small">The AI wrote: {show(f, f.ai).slice(0, 220)}{show(f, f.ai).length > 220 ? "…" : ""}</p>}
      {history && (
        <ul className="review-history">
          {revisions.map((r) => (
            <li key={r.id}>
              <span className="muted">{when(r.at)} · {r.by} · {r.source === "restore" ? "brought back" : "changed"}</span><br />
              {show(f, r.value).slice(0, 300) || <span className="muted">(empty)</span>}
              {can.edit && <> <button className="link" disabled={busy} onClick={() => onRestore({ revisionId: r.id })}>Bring back</button></>}
            </li>
          ))}
          <li><span className="muted">The AI wrote</span><br />{show(f, f.ai).slice(0, 300) || <span className="muted">(nothing)</span>}</li>
        </ul>
      )}
    </div>
  );
}

function CommentForm({ fields, busy, onSend }: { fields: Field[]; busy: boolean; onSend: (b: { body: string; field: string | null; flag: boolean }) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [field, setField] = useState("");
  const [flag, setFlag] = useState(false);
  return (
    <form className="review-comment-form" onSubmit={async (e) => { e.preventDefault(); if (await onSend({ body, field: field || null, flag })) { setBody(""); setFlag(false); } }}>
      <label htmlFor="comment">Add a comment</label>
      <textarea id="comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      <div className="review-comment-opts">
        <select aria-label="About which field" value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">About the whole product</option>
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <label className="check"><input type="checkbox" aria-label="The AI got this wrong" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> The AI got this wrong</label>
        <button disabled={busy || !body.trim()}>Comment</button>
      </div>
    </form>
  );
}
