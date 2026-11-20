import type { Prisma } from "@prisma/client";
import { requireCapability } from "@/lib/review/guard";
import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadRangeFor } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { isReady } from "@/lib/batch/shared";
import { detectFormat, importFeed, norm, suggestFeedMapping } from "@/lib/feed/import";
import { FEED_TARGETS, type FeedTarget } from "@/lib/feed/shared";
import { openFile } from "@/lib/keywords/readers";
import { rateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;
const MAX_BYTES = 30 * 1024 * 1024;
const TARGETS = new Set(FEED_TARGETS.map(([t]) => t));
const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Start a range from the brand's product file. Two steps, like the keyword upload (the file is never stored):
 *  1. POST file only            -> its columns, our guess of what each one is, and the first rows
 *  2. POST file + mapping       -> the file is checked, grouped into products, and each one queued to read its photo
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "edit", b.brandId);
    if (!rateLimit(`rangefile:${user.id}`, 20, 3_600_000)) throw new HttpError(429, "That's a lot of uploads this hour. Please try again a little later.");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    if (file.size > MAX_BYTES) throw new HttpError(413, "That file is too big. The limit is 30MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    const sheet = typeof form.get("sheet") === "string" ? String(form.get("sheet")) : undefined;
    const source = await openFile(buf, file.name, sheet).catch((e) => { throw new HttpError(400, e instanceof Error ? e.message : "We couldn't open that file."); });

    const raw = form.get("mapping");
    if (!raw) {
      const preview: Record<string, unknown>[] = [];
      for await (const r of source.rows) { preview.push(r.cells); if (preview.length >= 3) break; }
      // The brand's own choices from earlier files come first.
      const saved = await db.feedColumn.findMany({ where: { brandId: b.brandId, header: { in: source.headers.filter(Boolean).map(norm) } } });
      const remembered = new Map(saved.map((c) => [c.header, c.target as FeedTarget]));
      const headers = source.headers.filter(Boolean);
      return Response.json({ headers, suggestedMapping: suggestFeedMapping(source.headers, remembered), remembered: headers.filter((h) => remembered.has(norm(h))), preview, format: detectFormat(source.headers) });
    }

    let mapping: Record<string, FeedTarget>;
    try { mapping = JSON.parse(String(raw)); } catch { throw new HttpError(400, "Something about those column choices didn't work. Please try again."); }
    if (!mapping || typeof mapping !== "object" || Object.values(mapping).some((t) => !TARGETS.has(t as FeedTarget))) throw new HttpError(400, "Something about those column choices didn't work. Please try again.");
    const used = Object.values(mapping).filter((t) => t !== "metadata" && t !== "ignore");
    if (used.length !== new Set(used).size) throw new HttpError(400, "Two columns are set to the same thing. Choose a different one for one of them.");
    if (!used.includes("id")) throw new HttpError(400, "Choose the column with each product's ID or SKU.");
    if (!used.includes("title") && !used.includes("description")) throw new HttpError(400, "Choose the column with each product's title or description, so we know what it is.");
    if (await db.batchItem.count({ where: { batchId: b.id } })) throw new HttpError(409, "This range already has pieces in it. Start a new range for your product file.");

    const { pieces, check } = await importFeed(source, mapping).catch((e) => { throw new HttpError(400, e instanceof Error ? e.message : "We couldn't read that file."); });
    await db.$transaction([
      db.batchItem.createMany({
        data: pieces.map((p, i) => ({
          batchId: b.id, position: i + 1, filename: p.filename, imageUrl: p.imageUrl,
          // With an image link, the photo is read first; without one, the file's own details go straight to checking.
          status: p.imageUrl ? "queued" : "review",
          details: json(p.details), feed: json({ rows: p.rows, issues: p.issues }),
        })),
      }),
      db.batch.update({ where: { id: b.id }, data: { source: "file", fileName: file.name.slice(0, 160), fileCheck: json(check) } }),
      // Remember what each column is, for this brand's next file.
      ...Object.entries(mapping).filter(([h]) => h.trim()).map(([h, target]) => db.feedColumn.upsert({
        where: { brandId_header: { brandId: b.brandId, header: norm(h) } }, create: { brandId: b.brandId, header: norm(h), target }, update: { target },
      })),
    ]);
    kick();
    return Response.json({ check, ready: pieces.filter((p) => !p.imageUrl && isReady(p.details)).length }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
