import { alsoCalled, typeContext } from "../category/rules";
export { typeContext };
import { db } from "../db";
import { singular } from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";

export type RawCandidate = {
  id: string;
  originalKeyword: string;
  normalizedKeyword: string;
  searchVolume: number | null;
  category: string | null;
  subcategory: string | null;
  source: "exact" | "fts_all" | "fts_single" | "trigram" | "google";
};

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);

/** Everything the buyer told us that could appear in a keyword (single tokens, no type). */
export function attributeTerms(f: ProductFacts): string[] {
  const all = [...f.colour, ...f.material, ...f.pattern, ...f.fit_or_silhouette, ...f.length, ...f.features, ...f.occasion_or_style];
  return [...new Set(all.flatMap(tokens))];
}


/**
 * Deterministic phrase variants built from facts, e.g. "black midi dress", "black dress", "midi dress", and the same
 * for any other name the type goes by ("black one piece swimsuit", "black one piece").
 */
export function searchVariants(f: ProductFacts, withOtherNames = true): string[] {
  const t = f.product_type?.toLowerCase();
  if (!t) return [];
  if (withOtherNames) {
    const own = searchVariants(f, false);
    const others = alsoCalled(t, typeContext(f)).flatMap((n) => searchVariants({ ...f, product_type: n }, false));
    return [...new Set([...own, ...others])];
  }
  const colour = f.colour[0], length = f.length[0], feat = f.features[0], mat = f.material[0];
  const parts = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(" ");
  const v = new Set<string>([t, parts(colour, t), parts(length, t), parts(feat, t), parts(mat, t), parts(colour, length, t), parts(colour, feat, t), parts(feat, length, t), parts(colour, feat, length, t), parts(colour, mat, t)]);
  const out = new Set<string>();
  const one = singular(t);
  const many = /(s|x|z|ch|sh)$/.test(one) ? `${one}es` : /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`; // dress -> dresses, never "dresss"
  for (const x of v) { out.add(x); out.add(x.replace(new RegExp(`${t}$`), many)); out.add(x.replace(new RegExp(`${t}$`), one)); }
  return [...out].filter(Boolean);
}

const TRIGRAM_THRESHOLD = 0.5;

// tsquery-safe lexeme: letters/digits only
const lex = (w: string) => w.replace(/[^a-z0-9]/gi, "");

/**
 * Broad candidate retrieval from ONE dataset (aim: ~100-250 rows). Uses the GIN full-text and trigram
 * indexes created in the init migration. Product type is mandatory for every full-text branch.
 */
export async function retrieveCandidates(datasetId: string, facts: ProductFacts, limit = 400): Promise<RawCandidate[]> {
  const type = facts.product_type ? lex(singular(facts.product_type.toLowerCase().split(/\s+/).pop()!)) : "";
  if (!type) return [];
  const attrs = attributeTerms(facts).map(lex).filter(Boolean).slice(0, 8);
  const variants = searchVariants(facts);

  const cols = `id, "originalKeyword", "normalizedKeyword", "searchVolume", category, subcategory`;
  const tsv = `to_tsvector('english', "normalizedKeyword")`;
  const out = new Map<string, RawCandidate>();
  const add = (rows: Omit<RawCandidate, "source">[], source: RawCandidate["source"]) => {
    for (const r of rows) if (!out.has(r.id)) out.set(r.id, { ...r, source });
  };

  const jobs: Promise<void>[] = [];

  // 1. exact normalized phrase matches
  if (variants.length) {
    jobs.push(
      db.$queryRawUnsafe<Omit<RawCandidate, "source">[]>(
        `SELECT ${cols} FROM "Keyword" WHERE "datasetId" = $1 AND "normalizedKeyword" = ANY($2::text[])`,
        datasetId, variants,
      ).then((r) => add(r, "exact")),
    );
  }
  // 2. type AND any attribute, ranked by how many attributes match, then demand
  if (attrs.length) {
    const q = `${type} & (${attrs.join(" | ")})`;
    jobs.push(
      db.$queryRawUnsafe<Omit<RawCandidate, "source">[]>(
        `SELECT ${cols} FROM "Keyword" WHERE "datasetId" = $1 AND ${tsv} @@ to_tsquery('english', $2)
         ORDER BY ts_rank_cd(${tsv}, to_tsquery('english', $2)) DESC, "searchVolume" DESC NULLS LAST LIMIT 100`,
        datasetId, q,
      ).then((r) => add(r, "fts_all")),
    );
  }
  // 2b. the same for each other name the type goes by, as a phrase ("one <-> piece"): "black one piece" has no "swimsuit"
  for (const n of alsoCalled(facts.product_type, typeContext(facts))) {
    const phrase = n.toLowerCase().split(/[\s-]+/).map((w) => lex(singular(w))).filter(Boolean).join(" <-> ");
    if (!phrase || !attrs.length) continue;
    jobs.push(
      db.$queryRawUnsafe<Omit<RawCandidate, "source">[]>(
        `SELECT ${cols} FROM "Keyword" WHERE "datasetId" = $1 AND ${tsv} @@ to_tsquery('english', $2)
         ORDER BY "searchVolume" DESC NULLS LAST LIMIT 40`,
        datasetId, `(${phrase}) & (${attrs.join(" | ")})`,
      ).then((r) => add(r, "fts_all")),
    );
  }
  // 3. type AND each single attribute: surfaces strong two-word phrases ("midi dress", "mesh dress")
  for (const a of attrs) {
    jobs.push(
      db.$queryRawUnsafe<Omit<RawCandidate, "source">[]>(
        `SELECT ${cols} FROM "Keyword" WHERE "datasetId" = $1 AND ${tsv} @@ to_tsquery('english', $2)
         ORDER BY "searchVolume" DESC NULLS LAST LIMIT 25`,
        datasetId, `${type} & ${a}`,
      ).then((r) => add(r, "fts_single")),
    );
  }
  // 4. trigram: word-order and spelling variation against the best variants. Singular forms only (the plural finds
  // the same phrases), and a 0.5 closeness bar: the same top matches as the default 0.3, at a fraction of the reads.
  if (variants.length) {
    const one = singular(facts.product_type!.toLowerCase().split(/\s+/).pop()!);
    const top = variants.filter((v) => v.includes(" ") && v.endsWith(` ${one}`)).slice(0, 3);
    for (const v of top) {
      jobs.push(
        db.$transaction([
          db.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = ${TRIGRAM_THRESHOLD}`),
          db.$queryRawUnsafe<Omit<RawCandidate, "source">[]>(
            `SELECT ${cols} FROM "Keyword" WHERE "datasetId" = $1 AND "normalizedKeyword" % $2
             ORDER BY similarity("normalizedKeyword", $2) DESC LIMIT 30`,
            datasetId, v,
          ),
        ]).then(([, r]) => add(r, "trigram")),
      );
    }
  }
  await Promise.all(jobs);
  return [...out.values()].slice(0, limit);
}
