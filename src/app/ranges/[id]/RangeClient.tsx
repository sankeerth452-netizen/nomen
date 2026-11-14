"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import { objectPosition } from "@/lib/frame";
import { render } from "@/lib/shrink";
import { MAX_RANGE_PHOTOS, WORKING, isReady, type Field, type Fields, type ItemStatus } from "@/lib/batch/shared";
import type { PresentedItem } from "@/lib/batch/ranges";

/** Biggest file we'll try to open. The browser shrinks it before anything is sent. */
const MAX_FILE_BYTES = 25_000_000;
const UPLOADS_AT_ONCE = 3;

const STAGE: Record<ItemStatus, string> = {
  queued: "Waiting to be read", reading: "Reading the photo", review: "Ready to check", not_product: "No piece found",
  read_failed: "Couldn't read", to_name: "Waiting to be named", naming: "Naming", named: "Named", needs_input: "Needs a detail", failed: "Didn't work",
};
const MORE: [Field, string, string][] = [
  ["colour", "Colour", "black"], ["material", "Material", "linen blend"], ["pattern", "Pattern or finish", "floral"], ["fit", "Fit or silhouette", "wrap"],
  ["length", "Length", "midi"], ["feature", "Key detail", "ruched"], ["occasion", "Occasion or style", "tennis"], ["audience", "Audience", "girls"],
];
const SHARED: [Field, string, string][] = [["audience", "Audience", "girls"], ["occasion", "Occasion or style", "resort"], ["material", "Material", "linen"], ["extra", "Extra product facts", "Made in Australia"]];

type Upload = { key: string; name: string; state: "waiting" | "sending" | "error"; message?: string };
type Filter = "all" | "check" | "named" | "attention";

const needsAttention = (i: PresentedItem) => ["needs_input", "failed", "not_product", "read_failed"].includes(i.status) || (i.status === "review" && !isReady(i.details));

export default function RangeClient({ id, initialTitle, initialItems, brandName }: { id: string; initialTitle: string; initialItems: PresentedItem[]; brandName: string | null }) {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState(initialTitle);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [shared, setShared] = useState<Fields>({});
  const [naming, setNaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // The next place in the range, so pieces keep the order they were dropped in even though they upload in parallel.
  const nextPosition = useRef(Math.max(0, ...initialItems.map((i) => i.position)) + 1);

  const sending = uploads.some((u) => u.state !== "error");
  const busy = sending || items.some((i) => WORKING.includes(i.status));
  const ready = items.filter((i) => i.status === "review" && isReady(i.details));
  const named = items.filter((i) => i.status === "named");
  const counts = useMemo(() => ({
    all: items.length,
    check: items.filter((i) => i.status === "review").length,
    named: named.length,
    attention: items.filter(needsAttention).length,
  }), [items, named.length]);
  const shown = items.filter((i) => filter === "all" || (filter === "check" ? i.status === "review" : filter === "named" ? i.status === "named" : needsAttention(i)));

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/ranges/${id}`, { cache: "no-store" });
    if (res.ok) setItems((await res.json()).items);
  }, [id]);

  // While anything is being read or named, keep the screen up to date (this also keeps the work moving on the server).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [busy, refresh]);

  // When the last piece finishes, the "Naming…" message turns into what happened.
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy && notice.startsWith("Naming")) {
      const attention = items.filter(needsAttention).length;
      setNotice(`Done. ${named.length} named${attention ? `, ${attention} ${attention === 1 ? "needs" : "need"} attention` : ""}. Copy the names or download the list.`);
    }
    wasBusy.current = busy;
  }, [busy, notice, items, named.length]);

  const update = (next: PresentedItem) => setItems((list) => list.map((i) => (i.id === next.id ? next : i)));

  async function addFiles(list: FileList | File[]) {
    setError(""); setNotice("");
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (!files.length) { setError(COPY.photo.notAPhoto); return; }
    const room = MAX_RANGE_PHOTOS - items.length - uploads.filter((u) => u.state !== "error").length;
    const take = files.slice(0, Math.max(0, room));
    if (take.length < files.length) setNotice(take.length ? `Added the first ${take.length}. ${COPY.range.full(MAX_RANGE_PHOTOS)}` : COPY.range.full(MAX_RANGE_PHOTOS));
    const queue = take.map((file) => ({ key: crypto.randomUUID(), file, position: nextPosition.current++ }));
    setUploads((u) => [...u, ...queue.map((q) => ({ key: q.key, name: q.file.name, state: "waiting" as const }))]);
    let next = 0;
    const worker = async () => { while (next < queue.length) await send(queue[next++]); };
    await Promise.all(Array.from({ length: UPLOADS_AT_ONCE }, worker));
  }

  async function send({ key, file, position }: { key: string; file: File; position: number }) {
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: "sending" } : x)));
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(COPY.photo.tooLarge);
      let photo: string, image: string;
      try {
        [photo, image] = await Promise.all([render(file, 900, 190_000), render(file, 1568, 2_800_000)]);
      } catch (e) {
        throw new Error(e instanceof Error && e.message === "too_large" ? COPY.photo.tooLarge : COPY.photo.cantOpen);
      }
      const res = await fetch(`/api/ranges/${id}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, photo, image, position }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? COPY.photo.readFailed);
      setItems((list) => [...list, data as PresentedItem].sort((a, b) => a.position - b.position)); // stable: ties keep arrival order
      setUploads((u) => u.filter((x) => x.key !== key));
    } catch (e) {
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: "error", message: e instanceof Error ? e.message : COPY.photo.readFailed } : x)));
    }
  }

  // Paste photos anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); void addFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  async function nameThese(itemIds?: string[]) {
    setError(""); setNotice(""); setNaming(true);
    const res = await fetch(`/api/ranges/${id}/name`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(itemIds ? { itemIds } : {}) });
    const data = await res.json().catch(() => ({}));
    setNaming(false);
    if (!res.ok) { setError(data.error ?? "That didn't work. Please try again."); return; }
    if (!itemIds) setNotice(`Naming ${data.queued} ${data.queued === 1 ? "piece" : "pieces"}, three at a time, about twenty seconds each.${data.skipped ? ` ${data.skipped} still need a product type or description.` : ""}`);
    await refresh();
  }

  async function applyShared() {
    setError("");
    const res = await fetch(`/api/ranges/${id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: shared }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "That didn't work. Please try again."); return; }
    setItems(data.items); setShowShared(false); setShared({});
    setNotice("Added to every piece that had those details blank.");
  }

  async function saveTitle() {
    const t = title.trim();
    if (!t || t === initialTitle) return;
    await fetch(`/api/ranges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t }) });
  }

  async function copyAll() {
    try { await navigator.clipboard.writeText(named.map((i) => i.name).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <div
      className={`range${over ? " over" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files); }}
    >
      <div className="range-head">
        <div>
          <Link className="back" href="/ranges">← Ranges</Link>
          <label htmlFor="rangeTitle" className="sr-only">Range name</label>
          <input id="rangeTitle" className="range-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />
          <p className="muted range-count">
            {counts.all} {counts.all === 1 ? "photo" : "photos"} · {counts.named} named{counts.check ? ` · ${counts.check} to check` : ""}{brandName ? ` · ${brandName}` : ""}
          </p>
        </div>
        <div className="range-actions">
          <button className="ghost" onClick={() => picker.current?.click()} disabled={items.length >= MAX_RANGE_PHOTOS}>Add photos</button>
          {items.length > 0 && <button className="ghost" onClick={() => setShowShared((s) => !s)} aria-expanded={showShared}>Apply to every piece</button>}
          {ready.length > 0 && <button onClick={() => nameThese()} disabled={naming}>{naming ? "Starting…" : `Name ${ready.length} ${ready.length === 1 ? "piece" : "pieces"}`}</button>}
          {named.length > 0 && <button className="ghost" onClick={copyAll}>{copied ? "Copied" : "Copy all names"}</button>}
          {named.length > 0 && <a className="btn ghost" href={`/api/ranges/${id}/download`}>Download names</a>}
        </div>
      </div>
      <input ref={picker} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />

      {showShared && (
        <div className="shared card">
          <p>Details that hold for the whole range. They fill in only where a piece has them blank, never over what&apos;s there.</p>
          <div className="field-grid">
            {SHARED.map(([name, label, ph]) => (
              <div key={name}><label htmlFor={`shared-${name}`}>{label}</label><input id={`shared-${name}`} maxLength={name === "extra" ? 2000 : 120} placeholder={`e.g. ${ph}`} value={shared[name] ?? ""} onChange={(e) => setShared((s) => ({ ...s, [name]: e.target.value }))} /></div>
            ))}
          </div>
          <div className="btns"><button onClick={applyShared} disabled={!Object.values(shared).some((v) => v?.trim())}>Apply to pieces</button><button className="ghost" onClick={() => setShowShared(false)}>Cancel</button></div>
        </div>
      )}

      {(notice || error) && <p className={error ? "err range-msg" : "range-msg"} aria-live="polite">{error || notice}</p>}

      {items.length === 0 && !sending ? (
        <button className="range-drop" onClick={() => picker.current?.click()}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="11" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M17 11l3-4h8l3 4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          <span className="t">Drop the range&apos;s photos here</span>
          <span className="muted">Up to {MAX_RANGE_PHOTOS} at once. Each is read and filled in for you to check before anything is named.</span>
          <span className="btn ghost">Choose photos</span>
        </button>
      ) : (
        <>
          {uploads.length > 0 && (
            <div className="range-uploads" aria-live="polite">
              {sending && <p className="muted">Adding {uploads.filter((u) => u.state !== "error").length} {uploads.filter((u) => u.state !== "error").length === 1 ? "photo" : "photos"}…</p>}
              {uploads.filter((u) => u.state === "error").map((u) => <p key={u.key} className="err">{u.name}: {u.message}</p>)}
              {uploads.some((u) => u.state === "error") && <button className="link" onClick={() => setUploads((x) => x.filter((u) => u.state !== "error"))}>Dismiss</button>}
            </div>
          )}
          <div className="range-filters" role="tablist" aria-label="Show">
            {([["all", "All"], ["check", "To check"], ["named", "Named"], ["attention", "Needs attention"]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className="chip" onClick={() => setFilter(k)}>{label} <span>{counts[k]}</span></button>
            ))}
          </div>
          <div className="pieces">
            {shown.map((i) => (
              <Piece key={i.id} item={i} rangeId={id} onUpdate={update} onRemove={(gone) => setItems((list) => list.filter((x) => x.id !== gone))} onName={(one) => nameThese([one])} />
            ))}
            {shown.length === 0 && <p className="muted">Nothing here right now.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** One photo in the range: its stage, its details to check, and its name once it has one. */
function Piece({ item, rangeId, onUpdate, onRemove, onName }: { item: PresentedItem; rangeId: string; onUpdate: (i: PresentedItem) => void; onRemove: (id: string) => void; onName: (id: string) => void }) {
  const [draft, setDraft] = useState<Fields>(item.details?.fields ?? {});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const focused = useRef(false);
  const working = WORKING.includes(item.status);
  const fromPhoto = new Set(item.details?.fromPhoto ?? []);
  const canEdit = ["review", "not_product", "read_failed", "needs_input", "failed"].includes(item.status) || (item.status === "named" && editing);

  // New details from the server (a photo read, an "apply to every piece") show up unless the buyer is typing here.
  useEffect(() => { if (!focused.current) setDraft(item.details?.fields ?? {}); }, [item.details]);

  /** Change this piece on the server. Returns whether it worked, and the piece as it now stands (none after a delete). */
  async function call(method: string, body?: unknown): Promise<{ ok: boolean; item: PresentedItem | null }> {
    setErr("");
    const res = await fetch(`/api/ranges/${rangeId}/items/${item.id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 204) return { ok: true, item: null };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "That didn't work. Please try again."); return { ok: false, item: null }; }
    return { ok: true, item: data as PresentedItem };
  }

  async function save(field: Field) {
    focused.current = false;
    const v = draft[field]?.trim() ?? "";
    if (v === (item.details?.fields[field] ?? "")) return;
    const { item: next } = await call("PATCH", { fields: { [field]: v } });
    if (next) onUpdate(next);
  }

  const field = (name: Field, label: string, ph: string, area = false) => {
    const props = {
      id: `${item.id}-${name}`, value: draft[name] ?? "", placeholder: ph ? `e.g. ${ph}` : "", maxLength: name === "freeText" ? 500 : 120, disabled: !canEdit,
      onFocus: () => { focused.current = true; }, onBlur: () => save(name),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [name]: e.target.value })),
    };
    return (
      <div className={fromPhoto.has(name) ? "filled" : undefined}>
        <label htmlFor={props.id}>{label}</label>
        {area ? <textarea rows={2} {...props} /> : <input {...props} />}
      </div>
    );
  };

  const details = (
    <div className="piece-fields">
      {field("productType", "Product type", "dress")}
      {field("freeText", "Description", "black linen midi dress", true)}
      {item.details && item.details.fromPhoto.length > 0 && <p className="piece-hint">Green fields came from the photo. Check them.</p>}
      {item.details && item.details.unsure.length > 0 && <p className="piece-hint">{COPY.photo.unsure(item.details.unsure)}</p>}
      <button className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Fewer details" : "More details"}</button>
      {open && <div className="piece-more">{MORE.map(([name, label, ph]) => <div key={name}>{field(name, label, ph)}</div>)}</div>}
    </div>
  );

  return (
    <article className={`piece s-${item.status}`} aria-label={item.filename}>
      <div className="piece-photo">
        <Image src={`/api/ranges/${rangeId}/items/${item.id}/photo`} alt="" fill unoptimized style={{ objectPosition: objectPosition(item.focus) }} />
        {working && <span className="photo-reading" aria-hidden="true" />}
        <span className="piece-stage">{STAGE[item.status]}{working ? "…" : ""}</span>
      </div>
      <div className="piece-body">
        <span className="piece-file" title={item.filename}>{item.filename}</span>

        {item.status === "named" && item.name && (
          <>
            <h3 className="piece-name">{item.name}</h3>
            {item.confidence && <span className={`conf conf-${item.confidence}`}>{item.confidence} confidence</span>}
            {item.alternatives.length > 0 && (
              <details className="piece-alts"><summary>Other options</summary><ul>{item.alternatives.map((a) => <li key={a}>{a}</li>)}</ul></details>
            )}
            <div className="piece-btns">
              <button onClick={async () => { try { await navigator.clipboard.writeText(item.name!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
              {item.generationId && <Link className="btn ghost" href={`/history/${item.generationId}`}>Evidence</Link>}
              <button className="link" onClick={() => setEditing((x) => !x)}>{editing ? "Close" : "Change details"}</button>
            </div>
            {editing && <>{details}<div className="piece-btns"><button onClick={() => { setEditing(false); onName(item.id); }} disabled={!isReady(item.details)}>Name again</button></div></>}
          </>
        )}

        {item.status === "needs_input" && <p className="piece-question">{item.question}</p>}
        {item.status === "failed" && <p className="piece-question">This one didn&apos;t work. Check the details and try again.</p>}
        {item.status === "not_product" && <p className="piece-question">{COPY.photo.notProduct}</p>}
        {item.status === "read_failed" && <p className="piece-question">{COPY.photo.readFailed}</p>}

        {["review", "needs_input", "failed", "not_product", "read_failed"].includes(item.status) && (
          <>
            {details}
            <div className="piece-btns">
              {item.status === "read_failed" && <button className="ghost" onClick={async () => { const { item: n } = await call("PATCH", { retryRead: true }); if (n) onUpdate(n); }}>Read again</button>}
              {["review", "needs_input", "failed"].includes(item.status) && <button onClick={() => onName(item.id)} disabled={!isReady(item.details)}>{item.status === "review" ? "Name this one" : "Name again"}</button>}
              <button className="link" onClick={async () => { if ((await call("DELETE")).ok) onRemove(item.id); }}>Remove</button>
            </div>
          </>
        )}

        {working && <p className="muted piece-wait">{item.status === "naming" ? "Writing the name…" : item.status === "to_name" ? "In the queue to be named." : item.status === "reading" ? "Filling in what the photo shows…" : "In the queue to be read."}</p>}
        {err && <p className="err">{err}</p>}
      </div>
    </article>
  );
}
