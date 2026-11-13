"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ResultView, { type Gen } from "@/components/ResultView";
import { COPY } from "@/lib/copy";
import { PHOTOS, TYPE_TILES, photoForType, tileForType } from "@/lib/photos";
import PhotoPicker, { type PhotoResult } from "./PhotoPicker";

const STEPS = ["Understanding the piece", "Checking what shoppers search", "Looking at Google right now", "Writing the name"];
const STAGE: Record<string, number> = { pending: 0, extracting: 0, matching: 1, searching: 2, building: 3 };
const FIELDS: [string, string, string][] = [
  ["colour", "Colour", "black"], ["material", "Material", "linen blend"], ["pattern", "Pattern or finish", "floral"], ["fit", "Fit or silhouette", "wrap"],
  ["length", "Length", "midi"], ["feature", "Key detail", "ruched"], ["occasion", "Occasion or style", "cocktail"], ["audience", "Audience", ""],
];

export default function GeneratorClient({ productTypes, brands, brandName }: { productTypes: string[]; brands: { id: string; name: string }[]; brandName: string | null }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [gen, setGen] = useState<Gen | null>(null);
  const [error, setError] = useState("");
  const [productType, setProductType] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const out = useRef<HTMLDivElement>(null);
  const typeField = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [thumb, setThumb] = useState<string | null>(null);
  const [fromPhoto, setFromPhoto] = useState<Set<string>>(new Set());
  const [photoNotes, setPhotoNotes] = useState<{ text: string; fix?: { label: string; apply: () => void } }[]>([]);
  const tile = tileForType(productType);
  const nouns = TYPE_TILES.find((t) => t.key === tile)?.nouns ?? [];
  const shownBrand = brandName ?? brands.find((b) => b.id === brandId)?.name ?? null;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (busy || gen) out.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [busy, gen]);

  async function poll(id: string, started = Date.now()) {
    const res = await fetch(`/api/generations/${id}`, { cache: "no-store" });
    if (!res.ok) { setBusy(false); setError("Something went wrong on our side. If it finished, you'll find it in History."); return; }
    const g = await res.json();
    if (g.status in STAGE) {
      setStage(STAGE[g.status]);
      if (Date.now() - started > 120_000) { setBusy(false); setError("This is taking longer than usual. It will appear in History when it's done."); return; }
      timer.current = setTimeout(() => poll(id, started), 900);
    } else { setGen(g); setBusy(false); }
  }

  // Typing in a field makes it the buyer's own, so it loses its "From your photo" mark.
  const mine = (name: string) => setFromPhoto((s) => { if (!s.has(name)) return s; const n = new Set(s); n.delete(name); return n; });
  const set = (name: string, v: string) => { setValues((x) => ({ ...x, [name]: v })); mine(name); };
  const changeType = (v: string) => { setProductType(v); mine("productType"); };

  /** Fill only the empty fields: never overwrite what the buyer wrote. Point out where the photo disagrees with them. */
  function applyPhoto({ details: d, example }: PhotoResult) {
    if (d.not_a_product) { setPhotoNotes([{ text: COPY.photo.notProduct }]); return; }
    const differs = (typed: string | undefined, v: string | null) => !!typed?.trim() && !!v?.trim() && typed.trim().toLowerCase() !== v.trim().toLowerCase();
    // The photo's one-line description must not contradict the buyer: drop it if they chose another product type,
    // and take the photo's colour out of it if they typed a different colour.
    let description = d.description?.trim() || null;
    if (differs(productType, d.product_type)) description = null;
    else if (description && d.colour && differs(values.colour, d.colour)) description = description.replace(new RegExp(`\\b${d.colour.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").replace(/\s{2,}/g, " ").trim() || null;
    const seen: Record<string, string | null> = { productType: d.product_type, freeText: description, colour: d.colour, material: d.material, pattern: d.pattern, fit: d.fit, length: d.length, feature: d.feature };
    const filled: string[] = [];
    const notes: { text: string; fix?: { label: string; apply: () => void } }[] = example ? [{ text: COPY.photo.example }] : [];
    const next = { ...values };
    for (const [name, raw] of Object.entries(seen)) {
      const v = raw?.trim();
      if (!v) continue;
      const typed = (name === "productType" ? productType : values[name] ?? "").trim();
      if (!typed) {
        if (name === "productType") setProductType(v); else next[name] = v;
        filled.push(name);
      } else if ((name === "colour" || name === "productType") && typed.toLowerCase() !== v.toLowerCase()) {
        const use = () => { if (name === "productType") setProductType(v); else setValues((x) => ({ ...x, [name]: v })); setPhotoNotes((ns) => ns.filter((n) => n.fix?.label !== `Use ${v}`)); };
        notes.push({ text: name === "productType" ? COPY.photo.typeMismatch(v, typed) : COPY.photo.mismatch(v, typed), fix: { label: `Use ${v}`, apply: use } });
      }
    }
    setValues(next);
    setFromPhoto(new Set(filled));
    notes.push({ text: filled.length ? COPY.photo.filled : COPY.photo.nothingNew });
    const unsure = d.unsure.map((u) => u.trim().toLowerCase()).filter((u) => u && !(u === "fabric" && next.material) && !(u === "length" && next.length));
    if (unsure.length) notes.push({ text: COPY.photo.unsure(unsure.slice(0, 3)) });
    setPhotoNotes(notes);
  }

  /** Removing the photo also takes back what it filled in, unless the buyer has since edited it. */
  function removePhoto() {
    setThumb(null);
    setPhotoNotes([]);
    if (fromPhoto.has("productType")) setProductType("");
    setValues((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !fromPhoto.has(k))));
    setFromPhoto(new Set());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setGen(null); setStage(0);
    const f = { ...Object.fromEntries(new FormData(e.currentTarget).entries()), ...(thumb ? { photo: thumb, fromPhoto: [...fromPhoto] } : {}) };
    const res = await fetch("/api/generations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(data.error ?? "Something went wrong. Please try again."); return; }
    poll(data.id);
  }

  async function retry() {
    if (!gen) return;
    setBusy(true); setError("");
    const id = gen.id; setGen(null); setStage(3);
    const res = await fetch(`/api/generations/${id}/retry`, { method: "POST" });
    if (!res.ok) { setBusy(false); setError((await res.json().catch(() => ({}))).error ?? "That didn't work. Please try again."); return; }
    poll(id);
  }

  const working = photoForType(productType);
  return (
    <>
      <form onSubmit={submit}>
        {/* Owners aren't tied to a brand, so the brand is always sent: a picker if there are several, hidden if just one. */}
        {brands.length === 1 && <input type="hidden" name="brandId" value={brands[0].id} />}

        <div className="step-head"><span className="step-no">01</span><h2>Start with a photo</h2><p className="muted">Optional. It fills in what it can see, and you check it.</p></div>
        <PhotoPicker thumb={thumb} productType={productType} onThumb={setThumb} onRead={applyPhoto} onRemove={removePhoto} />
        {photoNotes.length > 0 && (
          <ul className="photo-notes" aria-live="polite">
            {photoNotes.map((n) => <li key={n.text}>{n.text}{n.fix && <button type="button" className="link" onClick={n.fix.apply}>{n.fix.label}</button>}</li>)}
          </ul>
        )}

        <div className="step-head"><span className="step-no">02</span><h2>Choose the piece</h2></div>
        <div className={`tiles${tile ? " has-choice" : ""}`} role="group" aria-label="Product type">
          {TYPE_TILES.map((t) => (
            <button key={t.key} type="button" className="tile" aria-pressed={tile === t.key} onClick={() => changeType(t.nouns[0])}>
              <span className="tile-photo"><Image src={PHOTOS[t.key].src} alt="" fill placeholder="blur" sizes="(max-width: 640px) 42vw, 140px" style={{ objectPosition: PHOTOS[t.key].position }} /></span>
              <span className="tile-label">{t.label}</span>
            </button>
          ))}
          <button type="button" className="tile" aria-pressed={!!productType && !tile} onClick={() => { changeType(""); typeField.current?.focus(); }}>
            <span className="tile-photo tile-other">Something else</span>
            <span className="tile-label">Type it below</span>
          </button>
        </div>
        <div className="noun-row">
          <div className="type-field">
            <label htmlFor="productType">Product type *{fromPhoto.has("productType") && <span className="from-photo">{COPY.photo.fromPhoto}</span>}</label>
            <input ref={typeField} id="productType" name="productType" required list="ptypes" maxLength={60} placeholder="dress" value={productType} onChange={(e) => changeType(e.target.value)} />
            <datalist id="ptypes">{productTypes.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          {nouns.length > 1 && (
            <div className="chips" role="group" aria-label="Exact product noun">
              {nouns.map((n) => <button key={n} type="button" className="chip" aria-pressed={productType.trim().toLowerCase() === n} onClick={() => changeType(n)}>{n}</button>)}
            </div>
          )}
          {brands.length > 1 && (
            <div className="type-field">
              <label htmlFor="brandId">Brand</label>
              <select id="brandId" name="brandId" required value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </div>
          )}
        </div>

        <div className="step-head"><span className="step-no">03</span><h2>Describe it</h2>{fromPhoto.has("freeText") && <span className="from-photo">{COPY.photo.fromPhoto}</span>}</div>
        <label htmlFor="freeText" className="sr-only">What would you call this product? *</label>
        <textarea id="freeText" name="freeText" className="describe" required maxLength={500} rows={2} placeholder="Black dress with ruching, midi length, mesh sleeves" value={values.freeText ?? ""} onChange={(e) => set("freeText", e.target.value)} />
        <p className="hint">Write it the way you&apos;d describe it to a colleague. Anything you don&apos;t mention is treated as unknown, never guessed.</p>

        <div className="step-head"><span className="step-no">04</span><h2>Add the specifics</h2><p className="muted">Optional, but every detail sharpens the name</p></div>
        <div className="field-grid">
          {FIELDS.map(([name, label, ph]) => (
            <div key={name} className={fromPhoto.has(name) ? "filled" : undefined}>
              <label htmlFor={name}>{label}</label>
              <input id={name} name={name} maxLength={120} placeholder={ph ? `e.g. ${ph}` : ""} value={values[name] ?? ""} onChange={(e) => set(name, e.target.value)} />
              {fromPhoto.has(name) && <span className="from-photo below">{COPY.photo.fromPhoto}</span>}
            </div>
          ))}
        </div>
        <label htmlFor="extra">Extra product facts</label>
        <input id="extra" name="extra" maxLength={2000} placeholder="Paste supplier notes or fabric composition" value={values.extra ?? ""} onChange={(e) => set("extra", e.target.value)} />

        <div className="submit-row">
          <button className="btn-lg" disabled={busy}>{busy ? "Working…" : "Create the name"}</button>
          <p>We only use what you&apos;ve entered above. It takes about twenty seconds.</p>
        </div>
      </form>

      <div ref={out} style={{ scrollMarginTop: 96 }}>
        {busy && (
          <div className="working" aria-live="polite">
            {thumb
              ? <div className="working-photo own"><Image src={thumb} alt="" fill unoptimized /></div>
              : <div className="working-photo"><Image src={working.src} alt="" fill placeholder="blur" sizes="180px" style={{ objectPosition: working.position }} /></div>}
            <div>
              <h3>Naming your {productType.trim() || "piece"}…</h3>
              <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "on" : ""}>{s}</li>)}</ol>
            </div>
          </div>
        )}
        {error && <p className="err" style={{ marginTop: 24 }}>{error}</p>}
        {gen && <ResultView gen={gen} brandName={shownBrand} canFeedback onRetry={retry} />}
      </div>
    </>
  );
}
