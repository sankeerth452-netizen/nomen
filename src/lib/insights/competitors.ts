// Naming gaps: the words other shops' product titles use for a kind of piece that the brand's own names rarely do,
// from the Google results Nomen already saved with each name (no new searches, no cost). Market wording only: a
// word other shops use is never treated as true of the brand's piece, and their names are never copied.
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { classify, singular } from "../vocab/fashion";
import { categoryLabel } from "./dashboard";

// Two-word details shops name products by; a single word ("wide", "neck") alone would miscount them.
const PHRASES = ["wide leg", "straight leg", "high rise", "low rise", "mid rise", "cowl neck", "square neck", "v neck", "halter neck", "crew neck", "high neck", "one shoulder", "off shoulder",
  "puff sleeve", "long sleeve", "short sleeve", "lace trim", "cut out", "tie front", "button front", "slip dress", "shirt dress", "linen blend", "faux leather", "drop waist", "low back", "open back", "a line", "fit and flare"];
const SKIP = new Set(["women", "womens", "woman", "ladies", "sale", "new", "online", "buy", "shop", "australia"]);

type Result = { title: string; domain: string; query: string; pageClass: string };
type Row = { id: string; brandId: string; slug: string; brandName: string; name: string | null; productType: string | null; serp: Result[] | null };

/** The details named in a title: two-word ones first, then single words that are a material, length or style (never colours). */
export function titleTerms(title: string): string[] {
  let t = ` ${title.toLowerCase().replace(/[^a-z0-9& -]+/g, " ").replace(/-/g, " ").replace(/\s+/g, " ")} `;
  const out: string[] = [];
  for (const p of PHRASES) if (t.includes(` ${p} `)) { out.push(p); t = t.replace(` ${p} `, " "); }
  for (const w of t.trim().split(" ")) {
    if (!w || SKIP.has(w)) continue;
    const c = classify(w);
    if (c && c !== "colour" && !out.includes(singular(w))) out.push(singular(w));
  }
  return out;
}

export type NamingGap = { term: string; theirShare: number; theirCount: number; ourShare: number; ourCount: number; shops: string[]; examples: { title: string; domain: string }[]; searches: string[] };
export type CategoryGaps = { category: string; ourNames: number; theirResults: number; shops: number; gaps: NamingGap[] };

export async function namingGaps(f: { brandIds: string[] | null; from: Date; includeTests: boolean }): Promise<CategoryGaps[]> {
  const brandSql = f.brandIds ? Prisma.sql`AND g."brandId" IN (${Prisma.join(f.brandIds)})` : Prisma.empty;
  const testSql = f.includeTests ? Prisma.empty : Prisma.sql`AND NOT g."isTest" AND NOT COALESCE(b."isTest", false)`;
  const rows = await db.$queryRaw<Row[]>`
    SELECT g.id, g."brandId", br.slug, br.name AS "brandName", g.result->'recommendation'->>'recommended_title' AS name,
      COALESCE(g."originalInput"->>'productType', g."extractedFacts"->>'product_type') AS "productType", g."candidateEvidence"->'serp' AS serp
    FROM "Generation" g JOIN "Brand" br ON br.id = g."brandId" LEFT JOIN "BatchItem" bi ON bi."generationId" = g.id LEFT JOIN "Batch" b ON b.id = bi."batchId"
    WHERE g.status = 'completed' AND g."createdAt" >= ${f.from} ${brandSql} ${testSql}`;

  const byCat = new Map<string, { names: string[]; results: Map<string, Result> }>();
  for (const r of rows) {
    if (!r.name) continue;
    const cat = categoryLabel(r.productType);
    const c = byCat.get(cat) ?? { names: [] as string[], results: new Map<string, Result>() };
    c.names.push(r.name);
    const own = [r.slug.toLowerCase(), r.brandName.toLowerCase().replace(/[^a-z0-9]/g, "")];
    for (const s of Array.isArray(r.serp) ? r.serp : []) {
      if (s.pageClass !== "product" || !s.title || own.some((o) => o && s.domain.toLowerCase().replace(/[^a-z0-9.]/g, "").includes(o))) continue;
      c.results.set(`${s.domain}|${s.title.toLowerCase()}`, s); // the same result seen for several pieces counts once
    }
    byCat.set(cat, c);
  }

  const out: CategoryGaps[] = [];
  for (const [category, c] of byCat) {
    const results = [...c.results.values()];
    if (results.length < 5) continue; // too few other shops' products to say anything
    const theirs = new Map<string, Result[]>();
    for (const r of results) for (const t of titleTerms(r.title)) theirs.set(t, [...(theirs.get(t) ?? []), r]);
    const ours = new Map<string, number>();
    for (const n of c.names) for (const t of titleTerms(n)) ours.set(t, (ours.get(t) ?? 0) + 1);
    const gaps: NamingGap[] = [];
    for (const [term, rs] of theirs) {
      const theirShare = rs.length / results.length, ourCount = ours.get(term) ?? 0, ourShare = ourCount / c.names.length;
      if (rs.length < 3 || theirShare < 0.15 || ourShare >= theirShare / 2) continue;
      const shops = [...new Set(rs.map((r) => r.domain.replace(/^www\./, "")))];
      if (shops.length < 2) continue; // one shop's habit isn't the market's
      gaps.push({ term, theirShare, theirCount: rs.length, ourShare, ourCount, shops: shops.slice(0, 4), examples: rs.slice(0, 2).map((r) => ({ title: r.title.slice(0, 90), domain: r.domain.replace(/^www\./, "") })), searches: [...new Set(rs.map((r) => r.query))].slice(0, 3) });
    }
    gaps.sort((a, b) => (b.theirShare - b.ourShare) - (a.theirShare - a.ourShare));
    out.push({ category, ourNames: c.names.length, theirResults: results.length, shops: new Set(results.map((r) => r.domain)).size, gaps: gaps.slice(0, 6) });
  }
  return out.sort((a, b) => b.ourNames - a.ourNames);
}
