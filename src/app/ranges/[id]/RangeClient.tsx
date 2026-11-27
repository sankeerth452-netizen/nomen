"use client";
import Image from "next/image";
import { STATUS_LABEL } from "@/lib/review/fields";
import { ColourSwatches } from "@/components/ColourSwatches";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import { objectPosition } from "@/lib/frame";
import { render } from "@/lib/shrink";
import { BEFORE_NAMING, WORKING, duplicateNames, isReady, type Field, type Fields, type ItemStatus } from "@/lib/batch/shared";
import { MAX_PHOTOS, VIEW_LABEL } from "@/lib/images/info";
import { anyGrouped, groupByFileName, type PhotoGroup } from "@/lib/images/grouping";
import type { PresentedItem } from "@/lib/batch/ranges";
import type { FileCheck } from "@/lib/feed/shared";
import ProductFile from "./ProductFile";

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

type Upload = { key: string; name: string; photos: number; state: "waiting" | "sending" | "error"; message?: string };
/** One piece to add: its main photo and, when file names grouped them, its other photos. */
type ToAdd = { key: string; main: File; more: File[]; position: number };
const pieceName = (p: { main: File; more: File[] }) => (p.more.length ? `${p.main.name} and ${p.more.length} more ${p.more.length === 1 ? "photo" : "photos"}` : p.main.name);
const eachAlone = (files: File[]): PhotoGroup[] => files.map((_, i) => ({ base: "", main: i, more: [], leftOut: [] }));
type Filter = "all" | "check" | "named" | "attention";

const needsAttention = (i: PresentedItem) => ["needs_input", "failed", "not_product", "read_failed"].includes(i.status) || (i.status === "review" && !isReady(i.details));

export default function RangeClient({ id, initialTitle, initialItems, loadedAt = null, brandName, source = "photos", fileName = null, fileCheck = null, isTest = false, canMarkTest = false }: { id: string; initialTitle: string; initialItems: PresentedItem[]; loadedAt?: string | null; brandName: string | null; source?: "photos" | "file"; fileName?: string | null; fileCheck?: FileCheck | null; isTest?: boolean; canMarkTest?: boolean }) {
  const [test, setTest] = useState(isTest);
  async function markTest(v: boolean) {
    setTest(v);
    const res = await fetch(`/api/ranges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isTest: v }) });
    if (!res.ok) setTest(!v);
  }
  const [items, setItems] = useState(initialItems);
  const lastCheck = useRef<string | null>(loadedAt); // only pieces changed since then are fetched
  const [title, setTitle] = useState(initialTitle);
  const [uploads, setUploads] = useState<Upload[]>([]);
  // Photos whose file names group them into pieces, waiting for the buyer to say how to add them.
  const [grouping, setGrouping] = useState<{ files: File[]; groups: PhotoGroup[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [shared, setShared] = useState<Fields>({});
  const [naming, setNaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<{ remaining: number; etaSeconds: number | null } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // The next place in the range, so pieces keep the order they were dropped in even though they upload in parallel.
  const nextPosition = useRef(Math.max(0, ...initialItems.map((i) => i.position)) + 1);

  const sending = uploads.some((u) => u.state !== "error");
  const busy = sending || items.some((i) => WORKING.includes(i.status));
  const ready = items.filter((i) => i.status === "review" && isReady(i.details));
  const named = items.filter((i) => i.status === "named");
  const failedCount = items.filter((i) => i.status === "failed" || i.status === "read_failed").length;
  const counts = useMemo(() => ({
    all: items.length,
    check: items.filter((i) => i.status === "review").length,
    named: named.length,
    attention: items.filter(needsAttention).length,
  }), [items, named.length]);
  const shown = items.filter((i) => filter === "all" || (filter === "check" ? i.status === "review" : filter === "named" ? i.status === "named" : needsAttention(i)));

  const refresh = useCallback(async () => {
    const since = lastCheck.current;
    const res = await fetch(`/api/ranges/${id}${since ? `?since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { at: string; items?: PresentedItem[]; changed?: PresentedItem[]; ids?: string[]; progress?: { remaining: number; etaSeconds: number | null } };
    lastCheck.current = d.at;
    setProgress(d.progress ?? null);
    if (d.items) { setItems(d.items); return; }
    setItems((cur) => {
      const byId = new Map(cur.map((i) => [i.id, i]));
      for (const c of d.changed ?? []) byId.set(c.id, c);
      const ids = new Set(d.ids ?? []);
      // A photo added while this check was on its way isn't in the list yet: keep it rather than let it flicker away.
      const fresh = cur.filter((i) => !ids.has(i.id));
      return [...(d.ids ?? []).map((i) => byId.get(i)).filter((i): i is PresentedItem => !!i), ...fresh].sort((x, y) => x.position - y.position);
    });
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
  const dupes = useMemo(() => duplicateNames(items), [items]);

  async function addFiles(list: FileList | File[]) {
    setError(""); setNotice("");
    if (source === "file") { setError("This range comes from your product file, so its photos come from the file's image links. Start a new range to add photos."); return; }
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (!files.length) { setError(COPY.photo.notAPhoto); return; }
    const groups = groupByFileName(files.map((f) => f.name));
    // dress-1.jpg and dress-2.jpg look like one piece: ask first, since a name can only suggest it.
    if (anyGrouped(groups)) { setGrouping({ files, groups }); return; }
    await addPieces(files, groups);
  }

  async function addPieces(files: File[], groups: PhotoGroup[]) {
    setGrouping(null);
    const queue: ToAdd[] = groups.map((g) => ({ key: crypto.randomUUID(), main: files[g.main], more: g.more.map((i) => files[i]), position: nextPosition.current++ }));
    setUploads((u) => [...u, ...queue.map((q) => ({ key: q.key, name: pieceName(q), photos: 1 + q.more.length, state: "waiting" as const }))]);
    let next = 0;
    const worker = async () => { while (next < queue.length) await send(queue[next++]); };
    await Promise.all(Array.from({ length: UPLOADS_AT_ONCE }, worker));
  }

  // Two shrunk copies of a photo: one to keep and show, one for the AI to read.
  async function copies(file: File, own: boolean) {
    const which = own ? "" : `${file.name}: `;
    if (file.size > MAX_FILE_BYTES) throw new Error(which + COPY.photo.tooLarge);
    try {
      const [photo, image] = await Promise.all([render(file, 900, 190_000), render(file, 1568, 2_800_000)]);
      return { photo, image };
    } catch (e) {
      throw new Error(which + (e instanceof Error && e.message === "too_large" ? COPY.photo.tooLarge : COPY.photo.cantOpen));
    }
  }

  async function send({ key, main, more, position }: ToAdd) {
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: "sending" } : x)));
    try {
      const first = await copies(main, true);
      const others = await Promise.all(more.map((f) => copies(f, false)));
      const res = await fetch(`/api/ranges/${id}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: main.name, ...first, more: others, position }) });
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

  async function retryFailed() {
    setError(""); setNotice(""); setRetrying(true);
    const res = await fetch(`/api/ranges/${id}/retry`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setRetrying(false);
    if (!res.ok) { setError(data.error ?? "That didn't work. Please try again."); return; }
    setNotice(`Trying again: ${[data.reread ? `${data.reread} ${data.reread === 1 ? "photo" : "photos"} to read` : "", data.renamed ? `${data.renamed} to name` : ""].filter(Boolean).join(" and ")}. Pieces that worked are left alone.`);
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
            {source === "file"
              ? <>{counts.all} {counts.all === 1 ? "product" : "products"} · {items.reduce((n, i) => n + (i.file?.skus.length ?? 0), 0)} SKUs from {fileName ?? "your file"}</>
              : <>{counts.all} {counts.all === 1 ? "piece" : "pieces"}</>}
            {" "}· {counts.named} named{counts.check ? ` · ${counts.check} to check` : ""}{brandName ? ` · ${brandName}` : ""}
            {busy && progress?.etaSeconds ? ` · about ${timeLeft(progress.etaSeconds)} left` : ""}
          </p>
          {canMarkTest && <label className="check test-mark"><input type="checkbox" checked={test} onChange={(e) => void markTest(e.target.checked)} /> A test range (left out of the dashboard)</label>}
        </div>
        <div className="range-actions">
          {source === "photos" && <button className="ghost" onClick={() => picker.current?.click()} >Add photos</button>}
          {items.length > 0 && <button className="ghost" onClick={() => setShowShared((s) => !s)} aria-expanded={showShared}>Apply to every piece</button>}
          {ready.length > 0 && <button onClick={() => nameThese()} disabled={naming}>{naming ? "Starting…" : `Name ${ready.length} ${ready.length === 1 ? "piece" : "pieces"}`}</button>}
          {named.length > 0 && <button className="ghost" onClick={copyAll}>{copied ? "Copied" : "Copy all names"}</button>}
          {named.length > 0 && <a className="btn ghost" href={`/api/ranges/${id}/download`}>{source === "file" ? "Download the review sheet" : "Download names"}</a>}
          {source === "file" && named.length > 0 && <a className="btn" href={`/api/ranges/${id}/feed`}>Download for Google</a>}
          {failedCount > 0 && <button className="ghost" onClick={retryFailed} disabled={retrying}>{retrying ? "Starting…" : `Try the ${failedCount} failed again`}</button>}
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
      {grouping && <GroupingAsk files={grouping.files} groups={grouping.groups} onGroup={() => void addPieces(grouping.files, grouping.groups)} onSeparate={() => void addPieces(grouping.files, eachAlone(grouping.files))} onCancel={() => setGrouping(null)} />}

      {fileCheck && <FileChecks check={fileCheck} />}
      {items.length > 0 && <CatalogueCheck rangeId={id} />}

      {items.length === 0 && !sending && !grouping ? (
        <button className="range-drop" onClick={() => picker.current?.click()}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="11" width="34" height="26" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M17 11l3-4h8l3 4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          <span className="t">Drop the range&apos;s photos here</span>
          <span className="muted">As many as you like. Each is read and filled in for you to check before anything is named.</span>
          <span className="btn ghost">Choose photos</span>
        </button>
      ) : null}
      {items.length === 0 && !sending && !grouping && <ProductFile rangeId={id} />}
      {items.length === 0 && !sending ? null : (
        <>
          {uploads.length > 0 && (
            <div className="range-uploads" aria-live="polite">
              {sending && <p className="muted">{addingText(uploads.filter((u) => u.state !== "error"))}</p>}
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
              <Piece key={i.id} item={i} sameAs={dupes.get(i.id)} rangeId={id} onUpdate={update} onRemove={(gone) => setItems((list) => list.filter((x) => x.id !== gone))} onName={(one) => nameThese([one])} />
            ))}
            {shown.length === 0 && <p className="muted">Nothing here right now.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** One photo in the range: its stage, its details to check, and its name once it has one. */
function Piece({ item, sameAs, rangeId, onUpdate, onRemove, onName }: { item: PresentedItem; sameAs?: string[]; rangeId: string; onUpdate: (i: PresentedItem) => void; onRemove: (id: string) => void; onName: (id: string) => void }) {
  const [draft, setDraft] = useState<Fields>(item.details?.fields ?? {});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedPage, setCopiedPage] = useState(false);
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
        {item.hasPhoto
          ? <Image src={`/api/ranges/${rangeId}/items/${item.id}/photo`} alt="" fill unoptimized style={{ objectPosition: objectPosition(item.focus) }} />
          : <span className="piece-nophoto">{working ? "Loading the photo from your file" : "No photo"}</span>}
        {working && <span className="photo-reading" aria-hidden="true" />}
        <span className="piece-stage">{STAGE[item.status]}{working ? "…" : ""}</span>
      </div>
      <div className="piece-body">
        <span className="piece-file" title={item.filename}>{item.filename}</span>
        {item.file && (
          <p className="piece-skus">{item.file.skus.length === 1 ? `SKU ${item.file.skus[0]}` : `${item.file.skus.length} SKUs`}{item.file.sizes.length ? ` · sizes ${item.file.sizes.join(", ")}` : ""}{item.file.price ? ` · ${item.file.salePrice ? `${item.file.salePrice} (was ${item.file.price})` : item.file.price}` : ""}</p>
        )}
        {item.file?.imageError && <p className="piece-hint">{item.file.imageError} We&apos;ll name it from your file&apos;s details.</p>}
        {item.file && item.file.issues.length > 0 && (
          <details className="piece-alts piece-issues"><summary>{item.file.issues.length} {item.file.issues.length === 1 ? "thing" : "things"} Google will flag in your file</summary><ul>{item.file.issues.map((m) => <li key={m}>{m}</li>)}</ul></details>
        )}
        <PhotoStrip item={item} rangeId={rangeId} onUpdate={onUpdate} />

        {item.status === "named" && item.name && (
          <>
            <h3 className="piece-name">{item.name}</h3>
            {item.confidence && <span className={`conf conf-${item.confidence}`}>{item.confidence} confidence</span>}
            {item.alternatives.length > 0 && (
              <details className="piece-alts"><summary>Other options</summary><ul>{item.alternatives.map((a) => <li key={a}>{a}</li>)}</ul></details>
            )}
            {item.page?.status === "ready" && (
              <details className="piece-alts piece-page"><summary>Product page</summary>
                <p><b>Meta title</b> {item.page.metaTitle}</p>
                <p><b>Meta description</b> {item.page.metaDescription}</p>
                <p><b>Description</b> {item.page.words} words. <button className="link" onClick={async () => { try { await navigator.clipboard.writeText(item.page!.description!); setCopiedPage(true); setTimeout(() => setCopiedPage(false), 1500); } catch { /* blocked */ } }}>{copiedPage ? "Copied" : "Copy description"}</button></p>
              </details>
            )}
            {item.page?.status === "failed" && <p className="piece-hint">The product page couldn&apos;t be written without guessing. Open Evidence to try again.</p>}
            {item.sheet?.status === "ready" && (
              <details className="piece-alts piece-page"><summary>Product data{item.sheet.checks.length ? ` · ${item.sheet.checks.length} to check` : ""}</summary>
                <p><b>Google category</b> {item.sheet.google.category?.path.split(" > ").pop() ?? "Not set"}</p>
                <p><b>Colour</b> {item.sheet.google.colour ? <ColourSwatches value={item.sheet.google.colour} small /> : "Not given"}</p>
                <p><b>Ideal for</b> {item.sheet.idealFor.live.map((v) => v.label).join(", ") || "Nothing certain"}{item.sheet.idealFor.review.length ? ` (to check: ${item.sheet.idealFor.review.map((v) => v.label).join(", ")})` : ""}</p>
                {item.sheet.highlights.length > 0 && <ul>{item.sheet.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                {item.sheet.checks.length > 0 && <p className="piece-hint">{item.sheet.checks.join(" ")}</p>}
              </details>
            )}
            {sameAs && <p className="piece-hint">Same name as {sameAs.join(", ")}. Google treats matching names as one product, so change one of them.</p>}
            <div className="piece-btns">
              <button onClick={async () => { try { await navigator.clipboard.writeText(item.name!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
              {item.generationId && <Link className="btn ghost" href={`/review/${item.generationId}`}>{item.review ? `Review · ${STATUS_LABEL[item.review.status] ?? item.review.status}${item.review.edited ? " · edited" : ""}` : "Review"}</Link>}
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

/** What Google will make of the brand's file: errors it rejects products for, then recommendations. Nothing is changed for them. */
/** "About 4 minutes", "about 40 seconds". */
function timeLeft(s: number) {
  if (s < 60) return `${Math.max(10, Math.round(s / 10) * 10)} seconds`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} ${m === 1 ? "minute" : "minutes"}` : `${Math.round(m / 60)} hours`;
}

/** "Adding 3 photos…", or "Adding 3 pieces (8 photos)…" when file names grouped some. */
function addingText(list: Upload[]) {
  const pieces = list.length, photos = list.reduce((n, u) => n + u.photos, 0);
  return photos === pieces ? `Adding ${photos} ${photos === 1 ? "photo" : "photos"}…` : `Adding ${pieces} ${pieces === 1 ? "piece" : "pieces"} (${photos} photos)…`;
}

const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const SHOW_GROUPS = 6;
/** Dropped photos whose names look like several photos of one piece (dress-1.jpg, dress-2.jpg): group them or not. */
function GroupingAsk({ files, groups, onGroup, onSeparate, onCancel }: { files: File[]; groups: PhotoGroup[]; onGroup: () => void; onSeparate: () => void; onCancel: () => void }) {
  const together = groups.filter((g) => g.more.length > 0 || g.leftOut.length > 0);
  const alone = groups.length - together.length;
  const leftOut = groups.flatMap((g) => g.leftOut.map((i) => files[i].name));
  return (
    <div className="grouping card" aria-live="polite">
      <p><b>These {files.length} photos look like {groups.length} {groups.length === 1 ? "piece" : "pieces"}</b>, going by their file names. Photos of one piece are read together and named once.</p>
      <ul className="grouping-list">
        {together.slice(0, SHOW_GROUPS).map((g) => (
          <li key={g.main}><b>{files[g.main].name}</b> <span className="muted">with {g.more.map((i) => files[i].name).join(", ")}</span></li>
        ))}
        {together.length > SHOW_GROUPS && <li className="muted">and {together.length - SHOW_GROUPS} more {together.length - SHOW_GROUPS === 1 ? "piece" : "pieces"} with several photos</li>}
        {alone > 0 && <li className="muted">{alone} other {alone === 1 ? "photo is a piece" : "photos are a piece each"}</li>}
      </ul>
      {leftOut.length > 0 && <p className="small warn-text">A piece can have up to {MAX_PHOTOS} photos, so {andList(leftOut)} won&apos;t be added.</p>}
      <div className="btns">
        <button onClick={onGroup}>Add as {groups.length} {groups.length === 1 ? "piece" : "pieces"}</button>
        <button className="ghost" onClick={onSeparate}>Add each photo as its own piece ({files.length})</button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
      <p className="muted small">The first photo of each piece is its main one. You can remove a photo from a piece on its card before naming.</p>
    </div>
  );
}

type ReportRow = { product: string; skus: string; level: "Error" | "Warning"; where: string; problem: string };
/** Problems across the whole range, loaded when opened (it checks every piece), with the report and summary to download. */
function CatalogueCheck({ rangeId }: { rangeId: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    const res = await fetch(`/api/ranges/${rangeId}/report?format=json`, { cache: "no-store" });
    setRows(res.ok ? (await res.json()).rows : []);
    setLoading(false);
  }
  const errors = rows?.filter((r) => r.level === "Error") ?? [], warnings = rows?.filter((r) => r.level === "Warning") ?? [];
  return (
    <details className="card catalogue-check" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !rows && !loading) void load(); }}>
      <summary><strong>Check the whole range</strong> <span className="muted">Problems across every piece: the file, photos, names, product data and Google&apos;s rules</span></summary>
      {loading && <p className="muted">Checking every piece…</p>}
      {rows && (
        <>
          <p>{rows.length === 0 ? "Nothing to fix." : `${errors.length} ${errors.length === 1 ? "error" : "errors"} (Google may reject these) and ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}.`}</p>
          {rows.length > 0 && (
            <ul className="report-list">
              {rows.slice(0, 40).map((r, k) => <li key={k} className={r.level === "Error" ? "bad" : "warn"}><b>{r.product}</b> · {r.where}: {r.problem}</li>)}
              {rows.length > 40 && <li className="muted">and {rows.length - 40} more in the report</li>}
            </ul>
          )}
          <p className="btns"><a className="btn ghost" href={`/api/ranges/${rangeId}/report`}>Download the problems</a> <a className="btn ghost" href={`/api/ranges/${rangeId}/summary`}>Download the summary</a> <button className="link" onClick={load}>Check again</button></p>
        </>
      )}
    </details>
  );
}

function FileChecks({ check }: { check: FileCheck }) {
  const errors = check.issues.filter((i) => i.level === "error"), warnings = check.issues.filter((i) => i.level === "warning"), info = check.issues.filter((i) => i.level === "info");
  const rows = (r: number[]) => (r.length ? ` (row${r.length === 1 ? "" : "s"} ${r.slice(0, 8).join(", ")}${r.length > 8 ? ` and ${r.length - 8} more` : ""})` : "");
  return (
    <details className="file-checks card" open={errors.length > 0}>
      <summary>
        Your file: {check.rows.toLocaleString("en-AU")} SKUs in {check.products.toLocaleString("en-AU")} products ({check.format})
        {" · "}{errors.length ? (() => { const n = errors.reduce((t, i) => t + i.rows.length, 0); return `${n} ${n === 1 ? "thing" : "things"} Google will reject`; })() : "nothing Google will reject"}
        {warnings.length ? ` · ${warnings.length} ${warnings.length === 1 ? "recommendation" : "recommendations"}` : ""}
      </summary>
      {check.leftOut > 0 && <p className="warn">Only the first {check.products - check.leftOut} products were added. Start another range with the rest of the file.</p>}
      {errors.length > 0 && <><p className="eyebrow">To fix in your file</p><ul>{errors.map((i) => <li key={i.kind}>{i.message}{rows(i.rows)}</li>)}</ul></>}
      {warnings.length > 0 && <><p className="eyebrow">Recommended</p><ul>{warnings.map((i) => <li key={i.kind}>{i.message}{rows(i.rows)}</li>)}</ul></>}
      {info.length > 0 && <ul className="muted">{info.map((i) => <li key={i.kind}>{i.message}</li>)}</ul>}
      <p className="muted">Nomen never changes these: they come from your own feed. Fix them where your feed is made.</p>
    </details>
  );
}


/**
 * A piece's other photos (back, side, details), with "Add photos" until it's named; what the photos showed and how
 * clearly; photo problems; and where the photos disagree with the brand's file.
 */
function PhotoStrip({ item, rangeId, onUpdate }: { item: PresentedItem; rangeId: string; onUpdate: (i: PresentedItem) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const photos = item.details?.photos ?? [];
  const info = (pos: number) => photos.find((p) => p.position === pos);
  const problems = photos.flatMap((p) => p.problems.map((m) => `${p.position === 0 ? "Main photo" : `Photo ${p.position + 1}`}: ${m}`));
  const attrs = item.details?.attributes ?? [];
  const contradictions = item.details?.contradictions ?? [];
  const canAdd = BEFORE_NAMING.includes(item.status) && !WORKING.includes(item.status) && (item.hasPhoto || !!item.file) && item.morePhotos.length < MAX_PHOTOS - 1;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr(""); setBusy(true);
    try {
      const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_PHOTOS - 1 - item.morePhotos.length);
      const copies = await Promise.all(picked.map(async (f) => ({ photo: await render(f, 900, 190_000), image: await render(f, 1568, 2_800_000) })));
      const res = await fetch(`/api/ranges/${rangeId}/items/${item.id}/photos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photos: copies }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErr(data.error ?? "Those photos didn't upload. Please try again.");
      else onUpdate(data as PresentedItem);
    } catch {
      setErr(COPY.photo.cantOpen);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(pos: number) {
    setErr("");
    const res = await fetch(`/api/ranges/${rangeId}/items/${item.id}/photos/${pos}`, { method: "DELETE" });
    if (!res.ok) { const data = await res.json().catch(() => ({})); setErr(data.error ?? "That didn't work. Please try again."); return; }
    onUpdate({ ...item, status: "queued", morePhotos: item.morePhotos.filter((p) => p !== pos), details: item.details ? { ...item.details, photos: item.details.photos?.filter((p) => p.position !== pos) } : null });
  }

  if (!item.morePhotos.length && !canAdd && !problems.length && !attrs.length && !contradictions.length) return null;
  return (
    <div className="photo-strip">
      {item.morePhotos.length > 0 && (
        <ul className="photo-thumbs">
          {item.morePhotos.map((pos) => (
            <li key={pos} title={info(pos)?.alt ?? undefined}>
              <span className="strip-photo"><Image src={`/api/ranges/${rangeId}/items/${item.id}/photos/${pos}`} alt={info(pos)?.alt ?? `Photo ${pos + 1}`} fill unoptimized /></span>
              <span className="strip-label">{info(pos)?.view ? VIEW_LABEL[info(pos)!.view!] : `Photo ${pos + 1}`}</span>
              {BEFORE_NAMING.includes(item.status) && !WORKING.includes(item.status) && <button className="link small" onClick={() => void remove(pos)} aria-label={`Remove photo ${pos + 1}`}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (<>
        <label className="btn ghost small" htmlFor={`more-${item.id}`} aria-disabled={busy}>{busy ? "Adding…" : item.morePhotos.length ? "Add more photos" : "Add photos (back, side, details)"}</label>
        <input ref={input} id={`more-${item.id}`} type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={(e) => void add(e.target.files)} />
      </>)}
      {attrs.length > 0 && (
        <p className="piece-hint seen">What the photos show: {attrs.map((a) => `${a.name} ${a.value}${a.seen === "partly" ? " (partly visible, check it)" : ""}`).join(" · ")}</p>
      )}
      {contradictions.map((c) => <p key={c} className="piece-hint warn">{c}</p>)}
      {problems.length > 0 && <details className="piece-alts piece-issues"><summary>{problems.length} photo {problems.length === 1 ? "problem" : "problems"}</summary><ul>{problems.map((m) => <li key={m}>{m}</li>)}</ul></details>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
