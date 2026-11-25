"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BrandProfile, BrandTerm } from "@/lib/brand";
import type { StyleProposal } from "@/lib/brandStyle";

type Order = "colour" | "feature" | "material" | "length";
export type ProfileForm = {
  profile: BrandProfile; titleCase: "title" | "sentence" | "lower"; maxTitleLength: number; attributeOrder: Order[] | null;
  prohibitedTerms: string[]; avoidWords: string[]; goodExamples: string[]; poorExamples: string[];
};

const ORDER_LABEL: Record<Order, string> = { colour: "Colour", feature: "Detail (ruched, V-neck)", material: "Material", length: "Length" };
const KIND_LABEL: Record<BrandTerm["kind"], string> = { product: "Product word", colour: "Colour word", category: "Category word", other: "Other" };
const commaList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const lineList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function BrandProfileClient({ brands, brandId, brandName, canManage, initial }: { brands: { id: string; name: string }[]; brandId: string; brandName: string; canManage: boolean; initial: ProfileForm }) {
  const router = useRouter();
  const [f, setF] = useState<ProfileForm>(initial);
  // Lists are edited as text, so typing a comma or a new line doesn't jump the cursor.
  const [text, setText] = useState({ prohibited: initial.prohibitedTerms.join(", "), avoid: initial.avoidWords.join(", "), good: initial.goodExamples.join("\n"), poor: initial.poorExamples.join("\n") });
  const [terms, setTerms] = useState(initial.profile.terms.map((t) => ({ use: t.use, instead: t.instead.join(", "), kind: t.kind })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p = f.profile;
  const setP = (k: keyof Omit<BrandProfile, "terms">, v: string) => setF((x) => ({ ...x, profile: { ...x.profile, [k]: v } }));
  const order = f.attributeOrder;
  const move = (i: number, by: number) => setF((x) => { const o = [...(x.attributeOrder ?? [])]; const j = i + by; if (j < 0 || j >= o.length) return x; [o[i], o[j]] = [o[j], o[i]]; return { ...x, attributeOrder: o }; });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || busy) return;
    setBusy(true); setMsg(null);
    const cleanTerms = terms.filter((t) => t.use.trim() || t.instead.trim()).map((t) => ({ use: t.use.trim(), instead: commaList(t.instead), kind: t.kind }));
    const body = {
      brandId, profile: { ...p, terms: cleanTerms }, titleCase: f.titleCase, maxTitleLength: Number(f.maxTitleLength), attributeOrder: order,
      prohibitedTerms: commaList(text.prohibited), avoidWords: commaList(text.avoid), goodExamples: lineList(text.good), poorExamples: lineList(text.poor),
    };
    const res = await fetch("/api/admin/brand", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved. Pieces named from now on follow it." } : { ok: false, text: data.error ?? "That didn't save. Please try again." });
    if (res.ok) router.refresh();
  }

  /** Put the ticked suggestions from a catalogue into the form. Nothing is saved until the admin presses Save. */
  function useSuggestions(pick: Picked) {
    setF((x) => ({
      ...x,
      ...(pick.titleCase ? { titleCase: pick.titleCase } : {}),
      ...(pick.maxTitleLength ? { maxTitleLength: pick.maxTitleLength } : {}),
      ...(pick.attributeOrder ? { attributeOrder: pick.attributeOrder } : {}),
      profile: { ...x.profile, ...(pick.tone ? { tone: pick.tone } : {}), ...(pick.audience ? { audience: pick.audience } : {}), ...(pick.descriptionStyle ? { descriptionStyle: pick.descriptionStyle } : {}) },
    }));
    if (pick.terms.length) setTerms((ts) => [...ts.filter((t) => !pick.terms.some((n) => n.use.toLowerCase() === t.use.trim().toLowerCase())), ...pick.terms.map((t) => ({ use: t.use, instead: t.instead.join(", "), kind: t.kind }))]);
    if (pick.examples.length) setText((t) => ({ ...t, good: [...new Set([...lineList(t.good), ...pick.examples])].join("\n") }));
    setMsg({ ok: true, text: "Added to the form below. Check them, then save." });
  }

  return (
    <>
    {brands.length > 1 && (
      <label className="brand-pick">Brand
        <select value={brandId} onChange={(e) => router.push(`/admin/brand?brand=${e.target.value}`)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </label>
    )}
    {canManage && <LearnFromCatalogue brandId={brandId} onUse={useSuggestions} />}
    <form className="brand-profile" onSubmit={save}>
      {!canManage && <p className="muted">Only your brand admin can change this. You can see it here.</p>}
      <fieldset disabled={!canManage || busy}>
        <section className="card">
          <h2>Who you&apos;re writing for</h2>
          <label>Who it&apos;s for<textarea rows={2} maxLength={300} placeholder={`e.g. Women 18 to 30 who follow trends and shop for going out`} value={p.audience} onChange={(e) => setP("audience", e.target.value)} /></label>
          <label>Tone of voice<textarea rows={2} maxLength={300} placeholder="e.g. Warm, confident and a little playful. Never formal or salesy." value={p.tone} onChange={(e) => setP("tone", e.target.value)} /></label>
        </section>

        <section className="card">
          <h2>How names are built</h2>
          <div className="row2">
            <label>Capitals
              <select value={f.titleCase} onChange={(e) => setF((x) => ({ ...x, titleCase: e.target.value as ProfileForm["titleCase"] }))}>
                <option value="title">Every Word Capitalised</option><option value="sentence">Only the first word</option><option value="lower">all lower case</option>
              </select>
            </label>
            <label>Longest name (characters)<input type="number" min={20} max={150} value={f.maxTitleLength} onChange={(e) => setF((x) => ({ ...x, maxTitleLength: Number(e.target.value) }))} /></label>
          </div>
          <p className="field-head">Order of details in a name</p>
          <label className="check"><input type="radio" name="order" checked={!order} onChange={() => setF((x) => ({ ...x, attributeOrder: null }))} /> Learn it from your keyword list (recommended)</label>
          <label className="check"><input type="radio" name="order" checked={!!order} onChange={() => setF((x) => ({ ...x, attributeOrder: x.attributeOrder ?? ["colour", "feature", "material", "length"] }))} /> Use our own order</label>
          {order && (
            <ol className="order-list">
              {order.map((o, i) => (
                <li key={o}><span>{ORDER_LABEL[o]}</span>
                  <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${ORDER_LABEL[o]} up`}>Up</button>
                  <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${ORDER_LABEL[o]} down`}>Down</button>
                </li>
              ))}
            </ol>
          )}
          <div className="row2">
            <label>Names you like <span className="muted">(one per line)</span><textarea rows={4} placeholder={"Black Satin Cowl Neck Midi Dress\nIvory Linen Wide Leg Pants"} value={text.good} onChange={(e) => setText((t) => ({ ...t, good: e.target.value }))} /></label>
            <label>Names you don&apos;t like <span className="muted">(one per line)</span><textarea rows={4} placeholder={"Gorgeous Must-Have Black Dress"} value={text.poor} onChange={(e) => setText((t) => ({ ...t, poor: e.target.value }))} /></label>
          </div>
        </section>

        <section className="card">
          <h2>Your words</h2>
          <p className="muted small">Your word for something, and the words it replaces. Where a piece&apos;s details say one of them, Nomen writes yours.</p>
          <table className="terms">
            <thead><tr><th>Your word</th><th>Instead of <span className="muted">(commas between)</span></th><th>What it is</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {terms.map((t, i) => (
                <tr key={i}>
                  <td><input aria-label="Your word" maxLength={40} placeholder="Pants" value={t.use} onChange={(e) => setTerms((ts) => ts.map((x, n) => (n === i ? { ...x, use: e.target.value } : x)))} /></td>
                  <td><input aria-label="Instead of" placeholder="trousers, slacks" value={t.instead} onChange={(e) => setTerms((ts) => ts.map((x, n) => (n === i ? { ...x, instead: e.target.value } : x)))} /></td>
                  <td><select aria-label="What it is" value={t.kind} onChange={(e) => setTerms((ts) => ts.map((x, n) => (n === i ? { ...x, kind: e.target.value as BrandTerm["kind"] } : x)))}>{(Object.keys(KIND_LABEL) as BrandTerm["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></td>
                  <td><button type="button" className="link" onClick={() => setTerms((ts) => ts.filter((_, n) => n !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="ghost small" onClick={() => setTerms((ts) => [...ts, { use: "", instead: "", kind: "product" }])}>Add a word</button>
          <div className="row2">
            <label>Never use <span className="muted">(commas between)</span><input placeholder="cheap, dupe" value={text.prohibited} onChange={(e) => setText((t) => ({ ...t, prohibited: e.target.value }))} /></label>
            <label>Avoid <span className="muted">(commas between)</span><input placeholder="sexy, flattering" value={text.avoid} onChange={(e) => setText((t) => ({ ...t, avoid: e.target.value }))} /></label>
          </div>
        </section>

        <section className="card">
          <h2>Product pages</h2>
          <label>Description style<textarea rows={3} maxLength={600} placeholder="e.g. Open with how it feels to wear. Short paragraphs. End with two styling ideas." value={p.descriptionStyle} onChange={(e) => setP("descriptionStyle", e.target.value)} /></label>
          <label>Search preferences<textarea rows={2} maxLength={300} placeholder="e.g. Lead with the colour. Keep names under 45 characters." value={p.seo} onChange={(e) => setP("seo", e.target.value)} /></label>
        </section>

        {canManage && <div className="submit-row"><button type="submit">{busy ? "Saving…" : `Save ${brandName}'s profile`}</button></div>}
        {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>}
      </fieldset>
    </form>
    </>
  );
}

type Picked = { titleCase?: ProfileForm["titleCase"]; maxTitleLength?: number; attributeOrder?: Order[]; tone?: string; audience?: string; descriptionStyle?: string; terms: BrandTerm[]; examples: string[] };
const CASE_LABEL: Record<ProfileForm["titleCase"], string> = { title: "Every Word Capitalised", sentence: "Only the first word capitalised", lower: "all lower case" };

/** Upload products the brand has already approved; tick which of the suggested settings to use. */
function LearnFromCatalogue({ brandId, onUse }: { brandId: string; onUse: (p: Picked) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [example, setExample] = useState(false);
  const [p, setP] = useState<StyleProposal | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const tick = (k: string) => setTicked((t) => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr(""); setP(null);
    const form = new FormData();
    form.set("file", file); form.set("brandId", brandId);
    const res = await fetch("/api/admin/brand/learn", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "We couldn't read that catalogue. Please try again."); return; }
    const prop = data.proposal as StyleProposal;
    setP(prop); setExample(!!data.example);
    setTicked(new Set(["case", "length", ...(prop.attributeOrder ? ["order"] : []), ...prop.terms.map((t) => `term:${t.use}`), ...(prop.voice ? ["tone", "audience", "style"] : []), "examples"]));
  }

  function use() {
    if (!p) return;
    onUse({
      titleCase: ticked.has("case") ? p.titles.titleCase : undefined,
      maxTitleLength: ticked.has("length") ? p.suggestedMaxLength : undefined,
      attributeOrder: ticked.has("order") && p.attributeOrder ? p.attributeOrder : undefined,
      tone: ticked.has("tone") ? p.voice?.tone : undefined, audience: ticked.has("audience") ? p.voice?.audience : undefined, descriptionStyle: ticked.has("style") ? p.voice?.descriptionStyle : undefined,
      terms: p.terms.filter((t) => ticked.has(`term:${t.use}`)).map(({ use, instead, kind }) => ({ use, instead, kind })),
      examples: ticked.has("examples") ? p.examples : [],
    });
    setP(null);
  }

  const option = (key: string, label: React.ReactNode, why?: string) => (
    <li key={key}><label className="check"><input type="checkbox" checked={ticked.has(key)} onChange={() => tick(key)} /> <span>{label}{why && <span className="muted"> · {why}</span>}</span></label></li>
  );
  const counts = (xs: { word: string; count: number }[]) => xs.map((x) => `${x.word} (${x.count})`).join(", ");

  return (
    <section className="card learn">
      <h2>Learn from your catalogue</h2>
      <p className="muted small">Upload products you&apos;ve already approved (a Shopify export or any CSV or Excel file with names and descriptions). Nomen suggests settings from how you write. You choose what to use, and nothing changes until you save.</p>
      <label className="btn ghost small" htmlFor="catalogueFile" aria-disabled={busy}>{busy ? "Reading your catalogue…" : "Choose a catalogue file"}</label>
      <input id="catalogueFile" type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="err">{err}</p>}
      {p && (
        <div className="proposal">
          <p><strong>From {p.products.toLocaleString("en-AU")} products.</strong> Your names average {p.titles.averageChars} characters ({p.titles.averageWords} words); 9 in 10 are {p.titles.longest90} or shorter.</p>
          <ul className="proposal-list">
            {option("case", <>Capitals: {CASE_LABEL[p.titles.titleCase]}</>)}
            {option("length", <>Longest name: {p.suggestedMaxLength} characters</>)}
            {p.attributeOrder && option("order", <>Order of details: {p.attributeOrder.map((o) => ORDER_LABEL[o].split(" (")[0]).join(" → ")}</>)}
            {p.terms.map((t) => option(`term:${t.use}`, <>Your word: <b>{t.use}</b> instead of {t.instead.map((w) => `"${w}"`).join(", ")}</>, counts(t.counts)))}
            {p.voice && option("tone", <>Tone: {p.voice.tone}</>)}
            {p.voice && option("audience", <>Who it&apos;s for: {p.voice.audience}</>)}
            {p.voice && option("style", <>Description style: {p.voice.descriptionStyle}</>)}
            {p.examples.length > 0 && option("examples", <>Names you like: {p.examples.join("; ")}</>)}
          </ul>
          {example && <p className="muted small">The tone, audience and description style above are examples: this preview version doesn&apos;t read your descriptions.</p>}
          <dl className="proposal-facts">
            {p.colours.length > 0 && <div><dt>Colours you use</dt><dd>{counts(p.colours)}</dd></div>}
            {p.nouns.length > 0 && <div><dt>Product words</dt><dd>{counts(p.nouns)}</dd></div>}
            {p.details.length > 0 && <div><dt>Details you name most</dt><dd>{counts(p.details)}</dd></div>}
            {p.descriptions && <div><dt>Descriptions</dt><dd>{p.descriptions.averageWords} words on average, {p.descriptions.averageParagraphs} paragraphs{p.descriptions.usesLists ? ", often with a list" : ""} ({p.descriptions.withDescription} products had one)</dd></div>}
          </dl>
          <div className="btns"><button type="button" onClick={use} disabled={!ticked.size}>Use the ticked ones</button><button type="button" className="ghost" onClick={() => setP(null)}>Not now</button></div>
        </div>
      )}
    </section>
  );
}
