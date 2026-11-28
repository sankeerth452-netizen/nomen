// Adding a brand (the owner only). A new brand starts with Nomen's default settings, no logins and no Google
// connection, and either no keyword list or its own copy of another brand's list in use. Its people only ever see
// its own work: everything brand-owned is scoped by brandId (see lib/auth/guards.ts and tests/tenancy.test.ts).
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export class BrandError extends Error {}

/** A brand name as typed: single spaces, 2 to 60 characters, with at least one letter or number. */
export function cleanBrandName(raw: unknown): string {
  const name = (typeof raw === "string" ? raw : "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2) throw new BrandError("Type the brand's name.");
  if (name.length > 60) throw new BrandError("That name is too long. Keep it to 60 characters.");
  if (!/[\p{L}\p{N}]/u.test(name)) throw new BrandError("A brand name needs at least one letter or number.");
  return name;
}

/** "Cotton On & Co." -> "cotton-on-and-co" */
export const brandSlug = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "brand";

async function freeSlug(base: string) {
  const taken = new Set((await db.brand.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((b) => b.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The keyword lists a new brand could start with a copy of: each brand's list in use, and how many phrases it has. */
export async function keywordListsToCopy() {
  const brands = await db.brand.findMany({
    where: { activeDataset: { is: { status: "active" } } }, orderBy: { name: "asc" },
    select: { id: true, name: true, activeDataset: { select: { rowsAccepted: true } } },
  });
  return brands.map((b) => ({ brandId: b.id, brandName: b.name, keywords: b.activeDataset?.rowsAccepted ?? 0 }));
}

// Every Keyword column except the two the copy sets itself (a new id, and the new list).
const KEYWORD_COLUMNS = ["originalKeyword", "normalizedKeyword", "searchVolume", "category", "subcategory", "competition", "cpc", "intent", "country", "language", "source", "sourceUpdatedAt", "metadata"]
  .map((c) => `"${c}"`).join(", ");

/** What the new brand's copy of a list is called: never the other brand's name or file, which its people would see. */
export const COPIED_LIST_NAME = "Keyword list (copied when the brand was added)";

/**
 * Add a brand, in one go: it's created with its copy of a keyword list, or not at all. Copying Nitin's 238k-phrase
 * list takes about 12 seconds locally, all inside the database.
 */
export async function addBrand(opts: { name: unknown; copyKeywordsFrom?: string | null; actorId: string }) {
  const name = cleanBrandName(opts.name);
  const taken = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } });
  if (taken) throw new BrandError(`There's already a brand called ${taken.name}.`);
  const source = opts.copyKeywordsFrom
    ? await db.brand.findUnique({ where: { id: opts.copyKeywordsFrom }, select: { id: true, activeDataset: { select: { id: true, status: true, validationSummary: true } } } })
    : null;
  if (opts.copyKeywordsFrom && (!source?.activeDataset || source.activeDataset.status !== "active")) throw new BrandError("That brand doesn't have a keyword list to copy.");
  const slug = await freeSlug(brandSlug(name));

  return db.$transaction(async (tx) => {
    const brand = await tx.brand.create({ data: { name, slug } }); // settings {}: Nomen's defaults
    let keywords = 0;
    if (source?.activeDataset) {
      const from = source.activeDataset;
      const summary = (from.validationSummary ?? {}) as Record<string, unknown>;
      const ds = await tx.keywordDataset.create({
        data: {
          brandId: brand.id, name: COPIED_LIST_NAME, status: "active", uploadedById: opts.actorId, activatedAt: new Date(),
          // The learned order of details and how volumes were read come along; the source file's warnings don't.
          validationSummary: { volumeRule: summary.volumeRule ?? null, mapping: summary.mapping ?? null, orderModel: summary.orderModel ?? null, copied: true } as Prisma.InputJsonValue,
        },
      });
      keywords = await tx.$executeRawUnsafe(
        `INSERT INTO "Keyword" ("id", "datasetId", ${KEYWORD_COLUMNS}) SELECT gen_random_uuid()::text, $1, ${KEYWORD_COLUMNS} FROM "Keyword" WHERE "datasetId" = $2`,
        ds.id, from.id,
      );
      await tx.keywordDataset.update({ where: { id: ds.id }, data: { rowsAccepted: keywords } });
      await tx.brand.update({ where: { id: brand.id }, data: { activeKeywordDatasetId: ds.id } });
    }
    await tx.auditEvent.create({ data: { brandId: brand.id, userId: opts.actorId, eventType: "brand.created", metadata: { name, slug, keywordsCopiedFromBrandId: source?.id ?? null, keywords } } });
    return { id: brand.id, name: brand.name, slug: brand.slug, keywords };
  }, { timeout: 5 * 60_000, maxWait: 10_000 });
}
