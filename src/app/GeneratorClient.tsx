"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ResultView, { type Gen } from "@/components/ResultView";
import { PHOTOS, TYPE_TILES, photoForType, tileForType } from "@/lib/photos";

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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setGen(null); setStage(0);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
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

        <div className="step-head"><span className="step-no">01</span><h2>Choose the piece</h2></div>
        <div className={`tiles${tile ? " has-choice" : ""}`} role="group" aria-label="Product type">
          {TYPE_TILES.map((t) => (
            <button key={t.key} type="button" className="tile" aria-pressed={tile === t.key} onClick={() => setProductType(t.nouns[0])}>
              <span className="tile-photo"><Image src={PHOTOS[t.key].src} alt="" fill placeholder="blur" sizes="(max-width: 640px) 42vw, 140px" style={{ objectPosition: PHOTOS[t.key].position }} /></span>
              <span className="tile-label">{t.label}</span>
            </button>
          ))}
          <button type="button" className="tile" aria-pressed={!!productType && !tile} onClick={() => { setProductType(""); typeField.current?.focus(); }}>
            <span className="tile-photo tile-other">Something else</span>
            <span className="tile-label">Type it below</span>
          </button>
        </div>
        <div className="noun-row">
          <div className="type-field">
            <label htmlFor="productType">Product type *</label>
            <input ref={typeField} id="productType" name="productType" required list="ptypes" maxLength={60} placeholder="dress" value={productType} onChange={(e) => setProductType(e.target.value)} />
            <datalist id="ptypes">{productTypes.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          {nouns.length > 1 && (
            <div className="chips" role="group" aria-label="Exact product noun">
              {nouns.map((n) => <button key={n} type="button" className="chip" aria-pressed={productType.trim().toLowerCase() === n} onClick={() => setProductType(n)}>{n}</button>)}
            </div>
          )}
          {brands.length > 1 && (
            <div className="type-field">
              <label htmlFor="brandId">Brand</label>
              <select id="brandId" name="brandId" required value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </div>
          )}
        </div>

        <div className="step-head"><span className="step-no">02</span><h2>Describe it</h2></div>
        <label htmlFor="freeText" className="sr-only">What would you call this product? *</label>
        <textarea id="freeText" name="freeText" className="describe" required maxLength={500} rows={2} placeholder="Black dress with ruching, midi length, mesh sleeves" />
        <p className="hint">Write it the way you&apos;d describe it to a colleague. Anything you don&apos;t mention is treated as unknown, never guessed.</p>

        <div className="step-head"><span className="step-no">03</span><h2>Add the specifics</h2><p className="muted">Optional, but every detail sharpens the name</p></div>
        <div className="field-grid">
          {FIELDS.map(([name, label, ph]) => (
            <div key={name}><label htmlFor={name}>{label}</label><input id={name} name={name} maxLength={120} placeholder={ph ? `e.g. ${ph}` : ""} /></div>
          ))}
        </div>
        <label htmlFor="extra">Extra product facts</label>
        <input id="extra" name="extra" maxLength={2000} placeholder="Paste supplier notes or fabric composition" />

        <div className="submit-row">
          <button className="btn-lg" disabled={busy}>{busy ? "Working…" : "Create the name"}</button>
          <p>We only use what you&apos;ve entered above. It takes about twenty seconds.</p>
        </div>
      </form>

      <div ref={out} style={{ scrollMarginTop: 96 }}>
        {busy && (
          <div className="working" aria-live="polite">
            <div className="working-photo"><Image src={working.src} alt="" fill placeholder="blur" sizes="180px" style={{ objectPosition: working.position }} /></div>
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
