"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { photoForType } from "@/lib/photos";
import { STOP_WORDS, classify, isGarmentPart, wordStem } from "@/lib/vocab/fashion";
import { plain, plainList } from "@/lib/copy";

type Kw = { id: string; keyword: string; searchVolume: number | null; category: string | null };
type Serp = { id: string; query: string; rank: number; title: string; domain: string; pageClass: string; checkedAt: string; cached: boolean };
type Rec = {
  recommended_title: string; confidence: "high" | "medium" | "low"; primary_keyword: string | null; supporting_keywords: string[];
  title_structure: string[]; alternatives: { title: string; trade_off: string }[]; reason: string; warnings: string[];
};
export type Gen = {
  id: string; status: string; errorCode?: string | null;
  input?: { productType?: string; freeText?: string };
  result: { recommendation?: Rec; meta?: { serpStatus: string; orderFinal: string[] }; needs?: string; conflicts?: string[]; message?: string } | null;
  evidence: { datasetId?: string | null; limitedKeywordEvidence?: boolean; keywords: Kw[]; serp: Serp[]; queries: { query: string; reason: string }[]; serpStatus: string; patterns: { intent: string; resultsAnalysed: number; productNouns: { term: string; count: number }[]; attributeWording: { term: string; count: number }[]; serpOrder: string[] | null } | null; order: { keywordOrder: string[]; serpOrder: string[] | null; final: string[] } } | null;
};

const vol = (v: number | null) => (v === null ? "no monthly figure" : `${v.toLocaleString()} a month`);
const INTENT: Record<string, string> = { product_led: "Mostly other shops' product pages", category_led: "Mostly shop category pages", mixed: "A mix of shops and articles", none: "Nothing showing yet" };
const PAGE: Record<string, string> = { product: "Product page", category: "Category page", editorial: "Article", marketplace: "Marketplace", other: "Other" };
const KIND: Record<string, string> = { colour: "Colour", material: "Material", length: "Length", feature: "Detail", detail: "Detail", product: "Product" };
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
    const kind = len > 1 && isGarmentPart(bare(words[i + len - 1])) ? "detail" : classify(bare(words[i])) ?? "detail";
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
  const top = useRef<HTMLElement>(null);
  const productType = gen.input?.productType ?? "";
  const photo = photoForType(productType);

  if (["pending", "extracting", "matching", "searching", "building"].includes(gen.status)) {
    return (
      <div className="state">
        <div className="state-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="200px" style={{ objectPosition: photo.position }} /></div>
        <div><h3>Still working on this one…</h3><p className="muted">Check back in a few seconds.</p></div>
      </div>
    );
  }
  if (gen.status === "failed") {
    return (
      <div className="state">
        <div className="state-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="200px" style={{ objectPosition: photo.position }} /></div>
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
        <div className="state-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="200px" style={{ objectPosition: photo.position }} /></div>
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
  const pageTitle = brandName ? `${title} | ${brandName}` : title;
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
          <div className="pdp-photo"><Image src={photo.src} alt={photo.alt} fill placeholder="blur" sizes="(max-width: 860px) 100vw, 40vw" style={{ objectPosition: photo.position }} /></div>
          <figcaption>
            {brandName && <span className="pdp-brand">{brandName}</span>}
            <span className="pdp-title">{title}</span>
          </figcaption>
          <p className="pdp-note">How the name reads on a product page. The photo is an illustration of the category, not this piece.</p>
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
            <span className="muted" style={{ fontSize: 12.5 }}>{pageTitle.length} of about {SEARCH_TITLE_CHARS} characters shown {fits ? "· fits without being cut off" : "· would be cut off"}</span>
          </div>

          <details className="why" style={{ marginTop: 18 }}>
            <summary>Why this order</summary>
            <p className="muted">{searchBacked ? "Shoppers usually type these words in this order" : "The usual order for this kind of piece"}: {[...order, productType || "product"].join(", ")}. We checked that against how the top Google results word it.</p>
            {ev?.order.serpOrder && <p className="muted">The top results put them in this order: {ev.order.serpOrder.join(", ")}.</p>}
          </details>
        </div>
      </div>

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
              <p className="muted">How often Australians search each phrase in a month. Longer bars mean more searches.</p>
              {lead.slice(0, 6).map((k) => (
                <div className="kw" key={k.id}>
                  <span className="name">{k.keyword}{cited.has(k.keyword) && <small>{cited.get(k.keyword)}</small>}</span>
                  <span className="vol">{vol(k.searchVolume)}</span>
                  <span className="bar"><i style={{ width: `${(Math.log10(1 + (k.searchVolume ?? 0)) / maxLog) * 100}%` }} /></span>
                </div>
              ))}
              {lead.length > 6 && (
                <details className="more">
                  <summary>See all {lead.length} phrases</summary>
                  {lead.slice(6).map((k) => <div className="kw" key={k.id}><span className="name">{k.keyword}</span><span className="vol">{vol(k.searchVolume)}</span></div>)}
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
