"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { photoForType } from "@/lib/photos";
import { AUDIENCE_TERMS, STOP_WORDS, classify, isGarmentPart, wordStem } from "@/lib/vocab/fashion";
import { plain, plainList } from "@/lib/copy";

type Kw = { id: string; keyword: string; searchVolume: number | null; category: string | null; source?: "google" };
type Serp = { id: string; query: string; rank: number; title: string; domain: string; pageClass: string; checkedAt: string; cached: boolean };
type Rec = {
  recommended_title: string; confidence: "high" | "medium" | "low"; primary_keyword: string | null; supporting_keywords: string[];
  title_structure: string[]; alternatives: { title: string; trade_off: string }[]; reason: string; warnings: string[];
};
/** The product page around the name, or where its writing stands. */
type Page = { status: "writing" | "failed" | "ready"; for_title: string; meta_title?: string; meta_description?: string; description?: string; words?: number };
type Verdict = { key: string; label: string; outcome: "live" | "review" | "dropped"; reason: string; demand: number | null };
/** The product data sheet (Google Shopping fields, highlights, details, ideal for), or where its writing stands. */
type Sheet = { status: "writing" | "failed" } | {
  status: "ready";
  google: { category: { id: number; path: string } | null; productType: string | null; colour: string | null; pattern: string | null; material: string | null; gender: string; ageGroup: string; sizeType: string; sizeSystem: string; customLabels: string[] };
  highlights: string[]; details: { section: string; name: string; value: string }[]; shortDescription: string | null;
  idealFor: { live: Verdict[]; review: Verdict[]; sentence: string | null };
  season: { value: string; confidence: "high" | "low"; reason: string } | null; care: string | null; imageAlt: string | null;
  searchQueries: { phrase: string; volume: number | null; fromGoogle?: boolean }[]; checks: string[];
};

export type Gen = {
  id: string; status: string; errorCode?: string | null; hasPhoto?: boolean; photoPosition?: string | null;
  input?: { productType?: string; freeText?: string };
  result: { recommendation?: Rec; meta?: { serpStatus: string; orderFinal: string[] }; needs?: string; conflicts?: string[]; message?: string; content?: Page | null; sheet?: Sheet | null } | null;
  evidence: { datasetId?: string | null; limitedKeywordEvidence?: boolean; keywords: Kw[]; serp: Serp[]; queries: { query: string; reason: string }[]; serpStatus: string; patterns: { intent: string; resultsAnalysed: number; productNouns: { term: string; count: number }[]; attributeWording: { term: string; count: number }[]; serpOrder: string[] | null } | null; order: { keywordOrder: string[]; serpOrder: string[] | null; final: string[] } } | null;
};

const vol = (v: number | null) => (v === null ? "no monthly figure" : `${v.toLocaleString()} a month`);
const INTENT: Record<string, string> = { product_led: "Mostly other shops' product pages", category_led: "Mostly shop category pages", mixed: "A mix of shops and articles", none: "Nothing showing yet" };
const PAGE: Record<string, string> = { product: "Product page", category: "Category page", editorial: "Article", marketplace: "Marketplace", other: "Other" };
const KIND: Record<string, string> = { colour: "Colour", material: "Material", length: "Length", feature: "Detail", detail: "Detail", product: "Product", audience: "For" };
const SEARCH_TITLE_CHARS = 60; // roughly what Google shows of a page title before cutting it off

const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9'-]/g, "");
const key = (ws: string[]) => ws.map((w) => wordStem(bare(w))).join(" ");

/** The title split into its parts ("Black" colour, "Mesh Sleeve" detail, "Dress" product), using the buyer's own detail units. */
function anatomy(title: string, units: string[], productType: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const noun = productType.trim().split(/\s+/).filter(Boolean);
  const unitWords = units.map((u) => u.split(/\s+/)).sort((a, b) => b.length - a.length);
  const parts: { text: string; kind: string }[] = [];
  for (let i = 0; i < words.length;) {
    if (STOP_WORDS.has(bare(words[i]))) { i++; continue; }
    if (noun.length && key(words.slice(i, i + noun.length)) === key(noun)) { parts.push({ text: words.slice(i, i + noun.length).join(" "), kind: "product" }); i += noun.length; continue; }
    const u = unitWords.find((uw) => key(words.slice(i, i + uw.length)) === key(uw));
    const len = u?.length ?? 1;
    const piece = words.slice(i, i + len).map(bare);
    // "Light Pink" is a colour even though "light" isn't; "Girls'" says who it's for.
    const kind = len > 1 && isGarmentPart(piece[len - 1]) ? "detail"
      : AUDIENCE_TERMS.includes(piece[0].replace(/'s?$/, "")) ? "audience"
      : piece.map((w) => classify(w)).find((c) => c === "colour") ?? classify(piece[0]) ?? "detail";
    parts.push({ text: words.slice(i, i + len).join(" "), kind });
    i += len;
  }
  return parts;
}

export default function ResultView({ gen, brandName, canFeedback, onRetry }: { gen: Gen; brandName?: string | null; canFeedback: boolean; onRetry?: () => void }) {
  const rec = gen.result?.recommendation;
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState<Page | null>(gen.result?.content ?? null);
  const [sheet, setSheet] = useState<Sheet | null>(gen.result?.sheet ?? null);

  // The page and the product data are written just after the name: keep checking until both are there (also after "Rewrite").
  const waiting = page?.status === "writing" || sheet?.status === "writing";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/generations/${gen.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const g = await res.json();
      if (g.result?.content?.status !== "writing") setPage(g.result?.content ?? null);
      if (g.result?.sheet?.status !== "writing") setSheet(g.result?.sheet ?? null);
    }, 2500);
    return () => clearInterval(t);
  }, [waiting, gen.id]);
  const top = useRef<HTMLElement>(null);
  const productType = gen.input?.productType ?? "";
  const photo = photoForType(productType);
  const statePhoto = gen.hasPhoto
    ? <div className="state-photo own"><Image src={`/api/generations/${gen.id}/photo`} alt="" fill unoptimized style={{ objectPosition: gen.photoPosition ?? undefined }} /></div>
    : <div className="state-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="200px" style={{ objectPosition: photo.position }} /></div>;

  if (["pending", "extracting", "matching", "searching", "building"].includes(gen.status)) {
    return (
      <div className="state">
        {statePhoto}
        <div><h3>Still working on this one…</h3><p className="muted">Check back in a few seconds.</p></div>
      </div>
    );
  }
  if (gen.status === "failed") {
    return (
      <div className="state">
        {statePhoto}
        <div>
          <h3>That didn&apos;t work</h3>
          <p className="muted">{gen.errorCode === "config_error" ? "This isn't quite ready for you yet. Please let your account manager know." : gen.errorCode === "ai_unavailable" || gen.errorCode === "timeout" ? "We couldn't finish this one just now. Your details are saved, so you can try again in a moment." : "We couldn't come up with a name we were sure was accurate, so we're not showing a doubtful one. Adding a detail or two usually helps."}</p>
          {onRetry && gen.errorCode !== "config_error" && <button onClick={onRetry}>Try again</button>}
        </div>
      </div>
    );
  }
  if (gen.status === "needs_input") {
    return (
      <div className="state">
        {statePhoto}
        <div>
          <h3>One thing first</h3>
          {plainList(gen.result?.conflicts).map((c) => <div className="warn" key={c}>{c}</div>)}
          {gen.result?.message && <div className="warn">{plain(gen.result.message)}</div>}
          <p className="muted" style={{ marginTop: 14 }}>{onRetry ? "Add it above and create the name again." : <><Link href="/">Start again on Create</Link> with the extra detail.</>}</p>
        </div>
      </div>
    );
  }
  if (!rec) return null;

  const title = chosen ?? rec.recommended_title;
  const ev = gen.evidence;
  const order = ev?.order.final ?? gen.result?.meta?.orderFinal ?? [];
  // Only a keyword list says how shoppers search; without one the order is the usual one for the type.
  const searchBacked = !!ev?.datasetId && !ev.limitedKeywordEvidence;
  const parts = anatomy(title, order, productType);
  const pageReady = page?.status === "ready" && page.for_title === title ? page : null;
  const pageTitle = pageReady?.meta_title ?? (brandName ? `${title} | ${brandName}` : title);
  const fits = pageTitle.length <= SEARCH_TITLE_CHARS;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const cited = new Map<string, string>([...(rec.primary_keyword ? [[rec.primary_keyword, "Main phrase"] as const] : []), ...rec.supporting_keywords.map((k) => [k, "Also used"] as const)]);
  const keywords = ev?.keywords ?? [];
  const lead = [...keywords.filter((k) => cited.has(k.keyword)), ...keywords.filter((k) => !cited.has(k.keyword))];
  const maxLog = Math.max(1, ...keywords.map((k) => Math.log10(1 + (k.searchVolume ?? 0))));

  async function copy(t: string) {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }
  async function feedback(outcome: "used" | "edited" | "rejected") {
    setErr("");
    const res = await fetch(`/api/generations/${gen.id}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome, finalTitle: outcome === "edited" ? edited : outcome === "used" ? title : undefined, reason: reason || undefined }),
    });
    if (res.ok) setSent(outcome === "used" ? `Saved: "${title}"` : outcome === "edited" ? `Saved your edit: "${edited}"` : "Noted: not suitable"); else setErr((await res.json().catch(() => ({}))).error ?? "Couldn't save feedback");
  }

  return (
    <article className="result" ref={top} style={{ scrollMarginTop: 96 }}>
      <div className="result-grid">
        <figure className="pdp">
          {gen.hasPhoto
            ? <div className="pdp-photo own"><Image src={`/api/generations/${gen.id}/photo`} alt="Your photo of the piece" fill unoptimized style={{ objectPosition: gen.photoPosition ?? undefined }} /></div>
            : <div className="pdp-photo"><Image src={photo.src} alt={photo.alt} fill placeholder="blur" sizes="(max-width: 860px) 100vw, 40vw" style={{ objectPosition: photo.position }} /></div>}
          <figcaption>
            {brandName && <span className="pdp-brand">{brandName}</span>}
            <span className="pdp-title">{title}</span>
          </figcaption>
          <p className="pdp-note">{gen.hasPhoto ? "How the name reads on your product page, with your photo." : "How the name reads on a product page. The photo is an illustration of the category, not this piece."}</p>
        </figure>

        <div className="verdict">
          <div className="eyebrow-row">
            <span className="eyebrow">{chosen ? "Alternative" : "Recommended name"}</span>
            <span className={`conf conf-${rec.confidence}`}>{rec.confidence} confidence</span>
          </div>
          <h2 className="title-out">{title}</h2>
          {parts.length > 1 && (
            <div className="anatomy" aria-label="How the name is built">
              {parts.map((p, i) => <span key={i} className={`part${p.kind === "product" ? " noun" : ""}`}><small>{KIND[p.kind] ?? "Detail"}</small><b>{p.text}</b></span>)}
            </div>
          )}
          <div className="btns">
            <button onClick={() => copy(title)}>{copied ? "Copied" : "Copy name"}</button>
            {chosen && <button className="ghost" onClick={() => setChosen(null)}>Back to recommended</button>}
          </div>
          <p className="reason">{plain(rec.reason)}</p>
          {plainList(rec.warnings).length > 0 && <ul className="note-list">{plainList(rec.warnings).map((w) => <li className="warn" key={w}>{w}</li>)}</ul>}

          <div className="preview-search">
            <span className="eyebrow">In search results</span>
            <div className="crumb" style={{ marginTop: 10 }}>{(brandName ?? "your store").toLowerCase()} › {slug}</div>
            <div className="line">{fits ? pageTitle : `${pageTitle.slice(0, SEARCH_TITLE_CHARS - 1)}…`}</div>
            <div className={`meter${fits ? "" : " over"}`}><i style={{ width: `${Math.min(100, (pageTitle.length / SEARCH_TITLE_CHARS) * 100)}%` }} /></div>
            {pageReady?.meta_description && <p className="snippet">{pageReady.meta_description}</p>}
            <span className="muted" style={{ fontSize: 12.5 }}>{pageTitle.length} of about {SEARCH_TITLE_CHARS} characters shown {fits ? "· fits without being cut off" : "· would be cut off"}</span>
          </div>

          <details className="why" style={{ marginTop: 18 }}>
            <summary>Why this order</summary>
            <p className="muted">{searchBacked ? "Shoppers usually type these words in this order" : "The usual order for this kind of piece"}: {[...order, productType || "product"].join(", ")}. We checked that against how the top Google results word it.</p>
            {ev?.order.serpOrder && <p className="muted">The top results put them in this order: {ev.order.serpOrder.join(", ")}.</p>}
          </details>
        </div>
      </div>

      <ProductPage genId={gen.id} title={title} page={page} onChange={setPage} />
      <ProductData genId={gen.id} title={title} slug={slug} sheet={sheet} onChange={setSheet} />

      {rec.alternatives.length > 0 && (<>

        <div className="section-title"><h3>Alternatives</h3><span>Each one trades something for something</span></div>
        <div className="alts">
          {rec.alternatives.map((a) => (
            <div className="alt" key={a.title}>
              <div><h4>{a.title}</h4><p style={{ marginTop: 8 }}>{plain(a.trade_off)}</p></div>
              <button className="ghost" onClick={() => { setChosen(a.title); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} disabled={chosen === a.title}>{chosen === a.title ? "Showing" : "Use this"}</button>
            </div>
          ))}
        </div>
      </>)}

      {ev && (<>
        <div className="section-title"><h3>The evidence</h3><span>{ev.serpStatus === "ok" ? "What shoppers search, and what's on Google today" : ev.serpStatus === "unavailable" ? "What shoppers search. We couldn't check Google today" : "What shoppers search, and part of what's on Google today"}</span></div>
        <div className="evidence">
          <div>
            <h4>What shoppers search</h4>
            {keywords.length ? (<>
              <p className="muted">How often Australians search each phrase in a month. Longer bars mean more searches.{keywords.some((k) => k.source === "google") && " Phrases marked Google are Google's own figures, for ones your keyword list doesn't have."}</p>
              {lead.slice(0, 6).map((k) => (
                <div className="kw" key={k.id}>
                  <span className="name">{k.keyword}{cited.has(k.keyword) && <small>{cited.get(k.keyword)}</small>}{k.source === "google" && <small className="from-google">Google</small>}</span>
                  <span className="vol">{vol(k.searchVolume)}</span>
                  <span className="bar"><i style={{ width: `${(Math.log10(1 + (k.searchVolume ?? 0)) / maxLog) * 100}%` }} /></span>
                </div>
              ))}
              {lead.length > 6 && (
                <details className="more">
                  <summary>See all {lead.length} phrases</summary>
                  {lead.slice(6).map((k) => <div className="kw" key={k.id}><span className="name">{k.keyword}{k.source === "google" && <small className="from-google">Google</small>}</span><span className="vol">{vol(k.searchVolume)}</span></div>)}
                </details>
              )}
            </>) : <p className="muted">We couldn&apos;t find search figures that match these details yet, so we don&apos;t claim how often shoppers search for them.</p>}
          </div>
          <div>
            <h4>On Google right now</h4>
            {ev.serp.length ? (<>
              <p className="muted">{ev.patterns ? `The top results are ${INTENT[ev.patterns.intent].charAt(0).toLowerCase()}${INTENT[ev.patterns.intent].slice(1)}.` : "The top results for each search."}</p>
              {ev.queries.map((q) => {
                const rows = ev.serp.filter((s) => s.query === q.query);
                return (
                  <div key={q.query}>
                    <div className="serp-q"><b>“{q.query}”</b><span>{plain(q.reason)}{rows[0] ? ` · checked ${new Date(rows[0].checkedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}</span></div>
                    {rows.slice(0, 5).map((s) => (
                      <div className="serp-row" key={s.id}><span className="rank">{s.rank}</span><div>{s.title}<small>{s.domain}<span className="page-type">{PAGE[s.pageClass] ?? s.pageClass}</span></small></div></div>
                    ))}
                  </div>
                );
              })}
            </>) : <p className="muted">{ev.serpStatus === "unavailable" ? "We couldn't check Google today." : "We didn't need to check Google for this one."}</p>}
          </div>
        </div>
      </>)}

      {canFeedback && (
        <div className="feedback">
          {sent ? <div><h3>Thank you</h3><p>{sent}. It helps the next name get better.</p></div> : (<>
            <div><h3>Did this name make the page?</h3><p>Your answer is saved with this name in History.</p></div>
            <div className="btns">
              <button onClick={() => feedback("used")}>Use this name</button>
              <button className="ghost" onClick={() => { setEditing(true); setEdited(title); }}>I edited it</button>
              <button className="ghost" onClick={() => feedback("rejected")}>Not suitable</button>
            </div>
            {editing && (
              <div className="edit">
                <div><label htmlFor="final">Final name</label><input id="final" value={edited} onChange={(e) => setEdited(e.target.value)} maxLength={200} /></div>
                <div><label htmlFor="why">Why? (optional)</label><input id="why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
                <button disabled={!edited.trim()} onClick={() => feedback("edited")}>Save edit</button>
              </div>
            )}
            {err && <p className="err">{err}</p>}
          </>)}
        </div>
      )}
    </article>
  );
}

/** Meta title, meta description and description, each with its limit and a copy button. */
function ProductPage({ genId, title, page, onChange }: { genId: string; title: string; page: Page | null; onChange: (p: Page) => void }) {
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  async function write() {
    setErr("");
    const res = await fetch(`/api/generations/${genId}/content`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (res.ok) onChange({ status: "writing", for_title: title });
    else setErr((await res.json().catch(() => ({}))).error ?? "That didn't work. Please try again.");
  }
  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked */ }
  }
  const field = (label: string, hint: string, text: string, long = false) => (
    <div className={`page-field${long ? " long" : ""}`}>
      <div className="page-field-head"><span className="eyebrow">{label}</span><span className="muted">{hint}</span><button className="ghost" onClick={() => copy(label, text)}>{copied === label ? "Copied" : "Copy"}</button></div>
      {long ? <div className="page-description">{text.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div> : <p className="page-text">{text}</p>}
    </div>
  );
  return (
    <section className="product-page" aria-live="polite">
      <div className="section-title"><h3>Product page</h3><span>The meta title, meta description and description for this piece</span></div>
      {page?.status === "writing" && <p className="page-writing">Writing the product page for “{page.for_title}”…</p>}
      {page?.status === "failed" && (
        <div className="page-empty"><p>We couldn&apos;t write the product page without guessing details we weren&apos;t given. Try again, or add more detail to the piece.</p><button onClick={write}>Try again</button></div>
      )}
      {!page && <div className="page-empty"><p>No product page yet for this name.</p><button onClick={write}>Write the product page</button></div>}
      {page?.status === "ready" && (
        <>
          {page.for_title !== title && (
            <div className="page-empty"><p>This page was written for “{page.for_title}”.</p><button onClick={write}>Rewrite it for this name</button></div>
          )}
          {field("Meta title", `${page.meta_title!.length} of 60 characters`, page.meta_title!)}
          {field("Meta description", `${page.meta_description!.length} of 160 characters`, page.meta_description!)}
          {field("Description", `${page.words} words`, page.description!, true)}
        </>
      )}
      {err && <p className="err">{err}</p>}
    </section>
  );
}

const TITLE_SHOWN = 70; // roughly what Google Shopping shows of a product title
const TITLE_MAX = 150; // Google's limit

/** Everything Google Shopping and the product page need beyond the name, with what to check before it goes live. */
function ProductData({ genId, title, slug, sheet, onChange }: { genId: string; title: string; slug: string; sheet: Sheet | null; onChange: (s: Sheet) => void }) {
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  async function write() {
    setErr("");
    const res = await fetch(`/api/generations/${genId}/sheet`, { method: "POST" });
    if (res.ok) onChange({ status: "writing" });
    else setErr((await res.json().catch(() => ({}))).error ?? "That didn't work. Please try again.");
  }
  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked */ }
  }
  const copyButton = (label: string, text: string) => <button className="ghost" onClick={() => copy(label, text)}>{copied === label ? "Copied" : "Copy"}</button>;
  const head = (label: string, hint: string, text?: string) => (
    <div className="page-field-head"><span className="eyebrow">{label}</span><span className="muted">{hint}</span>{text !== undefined && copyButton(label, text)}</div>
  );

  if (!sheet || sheet.status !== "ready") {
    return (
      <section className="product-data" aria-live="polite">
        <div className="section-title"><h3>Product data</h3><span>For Google Shopping and your product page</span></div>
        {sheet?.status === "writing" && <p className="page-writing">Filling in the product data…</p>}
        {sheet?.status === "failed" && <div className="page-empty"><p>We couldn&apos;t fill in the product data just now. Your name is safe.</p><button onClick={write}>Try again</button></div>}
        {!sheet && <div className="page-empty"><p>No product data yet for this piece.</p><button onClick={write}>Fill in the product data</button></div>}
        {err && <p className="err">{err}</p>}
      </section>
    );
  }

  const g = sheet.google;
  const checks = [
    ...(title.length > TITLE_MAX ? [`The name is ${title.length} characters: Google's limit is ${TITLE_MAX}.`] : title.length > TITLE_SHOWN ? [`The name is ${title.length} characters: Google Shopping shows about ${TITLE_SHOWN}, so the end may be cut off.`] : []),
    ...sheet.checks,
  ];
  const grid: [string, string | null, string?][] = [
    ["Google category", g.category?.path.replace(/^Clothing & Accessories > /, "") ?? null, g.category ? `ID ${g.category.id}` : undefined],
    ["Product type", g.productType, "Your own breadcrumb"],
    ["Colour", g.colour], ["Pattern", g.pattern], ["Material", g.material, g.material ? undefined : "Only when stated"],
    ["Gender", g.gender], ["Age group", g.ageGroup], ["Size type", g.sizeType], ["Size system", g.sizeSystem],
    ["Custom label 0 · occasion", g.customLabels[0] || null], ["Custom label 1 · season", g.customLabels[1] || null],
  ];
  // Header and values as two tab-separated lines: paste straight into a spreadsheet.
  const row: [string, string][] = [
    ["title", title], ["google_product_category", g.category ? String(g.category.id) : ""], ["product_type", g.productType ?? ""], ["color", g.colour ?? ""], ["pattern", g.pattern ?? ""],
    ["material", g.material ?? ""], ["gender", g.gender.toLowerCase()], ["age_group", g.ageGroup.toLowerCase()], ["size_type", g.sizeType.toLowerCase()], ["size_system", g.sizeSystem],
    ["description", sheet.shortDescription ?? ""], ["product_highlight", sheet.highlights.join(" | ")], ["product_detail", sheet.details.map((d) => `${d.section}:${d.name}:${d.value}`).join(" | ")],
    ["custom_label_0", g.customLabels[0] ?? ""], ["custom_label_1", g.customLabels[1] ?? ""], ["image_alt", sheet.imageAlt ?? ""], ["url_slug", slug],
  ];
  const tsv = [row.map(([k]) => k).join("\t"), row.map(([, v]) => v.replace(/[\t\n]+/g, " ")).join("\t")].join("\n");

  return (
    <section className="product-data" aria-live="polite">
      <div className="section-title"><h3>Product data</h3><span>For Google Shopping and your product page</span></div>
      {checks.length > 0 && (
        <div className="data-checks"><span className="eyebrow">Check before it goes live</span><ul>{checks.map((c) => <li key={c}>{c}</li>)}</ul></div>
      )}

      <div className="page-field">
        {head("Google Shopping", "Worked out from your details, never guessed")}
        <dl className="data-grid">
          {grid.map(([label, value, hint]) => (
            <div key={label}><dt>{label}</dt><dd className={value ? "" : "empty"}>{value ?? "Not given"}</dd>{hint && <span className="muted">{hint}</span>}</div>
          ))}
        </dl>
        <p className="data-copy-all"><button className="ghost" onClick={() => copy("all", tsv)}>{copied === "all" ? "Copied" : "Copy all for a spreadsheet"}</button></p>
      </div>

      {sheet.highlights.length > 0 && (
        <div className="page-field">
          {head("Highlights", `${sheet.highlights.length} bullet${sheet.highlights.length === 1 ? "" : "s"} for Google Shopping`, sheet.highlights.join("\n"))}
          <ul className="data-list">{sheet.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}

      {sheet.details.length > 0 && (
        <div className="page-field">
          {head("Product details", "Only the details you gave", sheet.details.map((d) => `${d.name}: ${d.value}`).join("\n"))}
          <table className="data-table"><tbody>{sheet.details.map((d) => <tr key={d.name}><th>{d.name}</th><td>{d.value}</td><td className="muted">{d.section}</td></tr>)}</tbody></table>
        </div>
      )}

      {sheet.shortDescription && (
        <div className="page-field">
          {head("Short description", `${sheet.shortDescription.length.toLocaleString("en-AU")} of 1,000 characters · for Google Shopping`, sheet.shortDescription)}
          <p className="data-text">{sheet.shortDescription}</p>
        </div>
      )}

      <div className="page-field">
        {head("Ideal for", sheet.idealFor.live.length ? "Checked against your details and what shoppers search" : "Nothing we're sure enough to use", sheet.idealFor.sentence ?? undefined)}
        {sheet.idealFor.live.length > 0 && <div className="data-tags">{sheet.idealFor.live.map((v) => <span className="data-tag" key={v.key} title={v.reason}>{v.label}{v.demand ? ` · ${v.demand.toLocaleString("en-AU")} searches a month` : ""}</span>)}</div>}
        {sheet.idealFor.sentence && <p className="data-text">{sheet.idealFor.sentence}</p>}
        {sheet.idealFor.review.length > 0 && (<>
          <p className="eyebrow" style={{ marginTop: 14 }}>Check before using</p>
          <ul className="data-list review">{sheet.idealFor.review.map((v) => <li key={v.key}><b>{v.label}</b>: {v.reason}</li>)}</ul>
        </>)}
      </div>

      {sheet.searchQueries.length > 0 && (
        <div className="page-field">
          {head("Search queries to target", "What the name is built to be found for", sheet.searchQueries.map((q) => q.phrase).join("\n"))}
          <ul className="data-list">{sheet.searchQueries.map((q) => <li key={q.phrase}>{q.phrase}<span className="muted"> · {vol(q.volume)}{q.fromGoogle ? " · from Google" : ""}</span></li>)}</ul>
        </div>
      )}

      <div className="page-field">
        <dl className="data-grid">
          <div><dt>Season</dt><dd className={sheet.season ? "" : "empty"}>{sheet.season ? sheet.season.value[0].toUpperCase() + sheet.season.value.slice(1) : "Not clear from the details"}</dd>{sheet.season && <span className="muted">{sheet.season.confidence === "high" ? sheet.season.reason : `To check: ${sheet.season.reason}`}</span>}</div>
          <div><dt>Care</dt><dd className={sheet.care ? "" : "empty"}>{sheet.care ?? "Not given"}</dd>{!sheet.care && <span className="muted">Never made up</span>}</div>
          <div><dt>URL slug</dt><dd>{slug}</dd>{copyButton("slug", slug)}</div>
          <div><dt>Image alt text</dt><dd className={sheet.imageAlt ? "" : "empty"}>{sheet.imageAlt ?? "Not written"}</dd>{sheet.imageAlt && copyButton("alt", sheet.imageAlt)}</div>
        </dl>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

