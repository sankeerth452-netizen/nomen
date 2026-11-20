// Google's full product category list, stored in the database. Nomen's own mapping (catalog.ts) picks categories;
// this list checks that every category going to Google, Nomen's or the brand's, is one Google has.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";

export const GOOGLE_TAXONOMY_URL = "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-AU.txt";
const BUNDLED = join(process.cwd(), "prisma/data/google-taxonomy-en-AU.txt");

/** "2271 - Clothing & Accessories > Clothing > Dresses" lines -> { id, path }. Comment and blank lines are skipped. */
export function parseTaxonomy(text: string): { id: number; path: string }[] {
  return text.split(/\r?\n/).map((l) => /^(\d+) - (.+)$/.exec(l.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => ({ id: Number(m[1]), path: m[2].trim() }));
}

/** Store a list: new categories added, renamed ones updated, none removed (old products may still use them). */
export async function storeTaxonomy(rows: { id: number; path: string }[]): Promise<{ total: number; added: number; renamed: number }> {
  if (rows.length < 1000) throw new Error("That doesn't look like Google's full category list.");
  const existing = new Map((await db.googleCategory.findMany()).map((c) => [c.id, c.path]));
  const added = rows.filter((r) => !existing.has(r.id));
  const renamed = rows.filter((r) => existing.has(r.id) && existing.get(r.id) !== r.path);
  if (added.length) await db.googleCategory.createMany({ data: added, skipDuplicates: true });
  for (const r of renamed) await db.googleCategory.update({ where: { id: r.id }, data: { path: r.path } });
  cache = null;
  return { total: existing.size + added.length, added: added.length, renamed: renamed.length };
}

/** Deploys: load the copy that ships with the code. */
export const seedTaxonomy = () => storeTaxonomy(parseTaxonomy(readFileSync(BUNDLED, "utf8")));

/** The owner's "update from Google". */
export async function refreshTaxonomyFromGoogle() {
  const res = await fetch(GOOGLE_TAXONOMY_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Google's list didn't load (${res.status}).`);
  return storeTaxonomy(parseTaxonomy(await res.text()));
}

let cache: { at: number; ids: Map<number, string> } | null = null;
/** Every category id Google has, with its path (kept for an hour). */
export async function googleCategoryIds(): Promise<Map<number, string>> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.ids;
  const ids = new Map((await db.googleCategory.findMany({ select: { id: true, path: true } })).map((c) => [c.id, c.path]));
  cache = { at: Date.now(), ids };
  return ids;
}
