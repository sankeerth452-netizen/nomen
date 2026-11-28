// Works through ranges in the background: reads each photo, then names each piece the buyer has checked.
// Runs inside the single web service (like the single-piece pipeline). Pieces are claimed in the database, so work
// survives a restart: anything left half-done is put back or settled the next time someone looks at a range.
import { Prisma, type BatchItem } from "@prisma/client";
import { db } from "../db";
import { getProviders, type Providers } from "../providers";
import { focusFractions, imageSize, type Photo, type PhotoType } from "../photo";
import { imageStats, photoProblems } from "../images/quality";
import { MAX_PHOTOS, photoInfo } from "../images/info";
import { recordClaude } from "../usage/ledger";
import { createGeneration, runPipeline } from "../pipeline/run";
import { asBox, asDetails, detailsFromPhoto, isReady } from "./ranges";
import { canName, mergePhotoDetails } from "./shared";
import { fetchProductImage, ImageFetchError, type ImageFetcher } from "../feed/image";
import type { PieceFeed } from "../feed/shared";

/** At most this many pieces are read or named at once, across all ranges, so a big range can't swamp Claude or Google. */
export const MAX_AT_ONCE = 3;
const MAX_READ_ATTEMPTS = 3;
const READ_STALE_MS = 3 * 60_000;
const NAME_STALE_MS = 6 * 60_000;

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/** Atomically claim the piece that has waited longest, from any range (first come, first served). */
async function claim(kind: "read" | "name"): Promise<BatchItem | null> {
  const rows = kind === "read"
    ? await db.$queryRaw<{ id: string }[]>`
        UPDATE "BatchItem" SET status = 'reading', "claimedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
        WHERE id = (SELECT id FROM "BatchItem" WHERE status = 'queued' ORDER BY "updatedAt", position LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id`
    : await db.$queryRaw<{ id: string }[]>`
        UPDATE "BatchItem" SET status = 'naming', "claimedAt" = now(), "updatedAt" = now()
        WHERE id = (SELECT id FROM "BatchItem" WHERE status = 'to_name' ORDER BY "updatedAt", position LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id`;
  return rows[0] ? db.batchItem.findUnique({ where: { id: rows[0].id } }) : null;
}

/** A piece's other photos, ready to read: uploaded ones as they are, file links fetched (and kept for screens). */
async function loadExtraPhotos(itemId: string, fetchImage: ImageFetcher) {
  const rows = await db.productImage.findMany({ where: { batchItemId: itemId }, orderBy: { position: "asc" }, take: MAX_PHOTOS - 1 });
  const loaded: { position: number; photo: Photo; size?: { width: number; height: number } }[] = [];
  const failed = new Map<number, string>();
  for (const r of rows) {
    if (r.readImage && r.readType) loaded.push({ position: r.position, photo: { mediaType: r.readType as PhotoType, data: Buffer.from(r.readImage) } });
    else if (r.photo && r.photoType) loaded.push({ position: r.position, photo: { mediaType: r.photoType as PhotoType, data: Buffer.from(r.photo) } });
    else if (r.url) {
      try {
        const got = await fetchImage(r.url);
        loaded.push({ position: r.position, photo: got.read, size: got.size });
        await db.productImage.update({ where: { id: r.id }, data: { photo: new Uint8Array(got.keep.data), photoType: got.keep.mediaType } });
      } catch (e) {
        failed.set(r.position, e instanceof ImageFetchError ? e.message : "The image link couldn't be loaded.");
      }
    }
  }
  return { loaded, failed };
}

/**
 * Read one photo into details for the buyer to check. Failures go back in the queue, up to three tries.
 * A product-file piece's photo is fetched from its image link first; its details from the file always win.
 */
export async function readItem(item: BatchItem, providers: Providers, fetchImage: ImageFetcher = fetchProductImage): Promise<void> {
  const fromFile = asDetails(item.details);
  let image: { mediaType: PhotoType; data: Buffer };
  let keep: { mediaType: PhotoType; data: Buffer } | null = null;
  let mainSize: { width: number; height: number } | undefined;
  if (item.readImage && item.readType) image = { mediaType: item.readType as PhotoType, data: Buffer.from(item.readImage) };
  // Read again (more photos were added): the kept copy is plenty, and a file's image link isn't fetched twice.
  else if (item.photo && item.photoType) image = { mediaType: item.photoType as PhotoType, data: Buffer.from(item.photo) };
  else if (item.imageUrl) {
    try {
      const got = await fetchImage(item.imageUrl);
      image = got.read; keep = got.keep; mainSize = got.size;
    } catch (e) {
      const message = e instanceof ImageFetchError ? e.message : "The image link couldn't be loaded.";
      console.error("range image fetch failed", item.id, e instanceof Error ? e.message : e);
      if (item.attempts < MAX_READ_ATTEMPTS && !(e instanceof ImageFetchError && /private|isn't a web address|isn't a photo/.test(e.message))) {
        await db.batchItem.update({ where: { id: item.id }, data: { status: "queued", claimedAt: null } });
        return;
      }
      // No photo, but the file's own details may be enough to name it from.
      const feed = { ...((item.feed as PieceFeed | null) ?? { rows: [], issues: [] }), imageError: message };
      await db.batchItem.update({ where: { id: item.id }, data: { status: isReady(fromFile) ? "review" : "read_failed", feed: json(feed), claimedAt: null } });
      return;
    }
  } else {
    await db.batchItem.update({ where: { id: item.id }, data: { status: fromFile && isReady(fromFile) ? "review" : "read_failed", claimedAt: null } });
    return;
  }
  try {
    const extras = await loadExtraPhotos(item.id, fetchImage);
    // A file piece's product type is known: say so, or a photo of jeans worn with a jumper gets read as the jumper.
    const { details, usage } = await providers.photo.read({ image, extras: extras.loaded.map((x) => x.photo), ...(fromFile?.fields.productType ? { productType: fromFile.fields.productType } : {}) });
    const batch = await db.batch.findUnique({ where: { id: item.batchId }, select: { brandId: true, userId: true } });
    await recordClaude({ brandId: batch?.brandId, userId: batch?.userId, batchId: item.batchId }, "photo_read", usage);
    console.info("range photo read", { item: item.id, photos: 1 + extras.loaded.length, model: usage.model, input: usage.inputTokens, output: usage.outputTokens });
    const kept = keep ? { photo: new Uint8Array(keep.data), photoType: keep.mediaType } : {};
    const all = [{ photo: image, size: mainSize }, ...extras.loaded];
    const stats = await Promise.all(all.map((x) => imageStats(x.photo.data, x.size).catch(() => null)));
    const photos = photoInfo([0, ...extras.loaded.map((x) => x.position)], details.images, photoProblems(stats), extras.failed);
    await db.productImage.updateMany({ where: { batchItemId: item.id }, data: { readImage: null, readType: null } });
    if (details.not_a_product) {
      // A file piece keeps its file details: the brand knows what it sells even when the photo doesn't show it plainly.
      const stay = fromFile && isReady(fromFile);
      await db.batchItem.update({ where: { id: item.id }, data: { status: stay ? "review" : "not_product", details: json(stay ? { ...fromFile, photos } : { fields: {}, fromPhoto: [], unsure: [], photos }), readImage: null, readType: null, claimedAt: null, readUsage: json(usage), ...kept } });
      return;
    }
    const seen = detailsFromPhoto(details);
    // What stays from before: a file piece's own details, and on a second reading (more photos were added) whatever
    // the buyer typed. What the last reading filled in is replaced by this one.
    const own = fromFile ? { ...fromFile, fields: Object.fromEntries(Object.entries(fromFile.fields).filter(([k]) => !fromFile.fromPhoto.includes(k as never))) } : null;
    const merged = own && Object.keys(own.fields).length ? mergePhotoDetails(own, seen) : seen;
    // Only a brand's file or a buyer's line sheet can disagree with its photos (a buyer typing over a reading is just a change).
    if (!item.imageUrl && !fromFile?.sheetRow) delete merged.contradictions;
    await db.batchItem.update({
      where: { id: item.id },
      data: { status: "review", details: json({ ...merged, ...(fromFile?.sheetRow ? { sheetRow: fromFile.sheetRow } : {}), photos }), focus: json(focusFractions(details.focus, imageSize(image))), readImage: null, readType: null, claimedAt: null, readUsage: json(usage), ...kept },
    });
  } catch (e) {
    console.error("range photo read failed", item.id, e instanceof Error ? e.message : e);
    await db.batchItem.update({ where: { id: item.id }, data: { status: item.attempts < MAX_READ_ATTEMPTS ? "queued" : "read_failed", claimedAt: null } });
  }
}

/** Name one checked piece through the normal pipeline (so it also appears in History with its evidence). */
export async function nameItem(item: BatchItem, providers?: Providers): Promise<void> {
  const details = asDetails(item.details);
  if (!details || !canName(details)) {
    await db.batchItem.update({ where: { id: item.id }, data: { status: "review", claimedAt: null } });
    return;
  }
  try {
    const batch = await db.batch.findUniqueOrThrow({ where: { id: item.batchId }, include: { user: { select: { id: true, brandId: true } } } });
    const skus = ((item.feed as PieceFeed | null)?.rows ?? []).map((r) => r.attrs.id).filter(Boolean);
    const genId = await createGeneration(batch.user, batch.brandId, { ...details.fields }, {
      ...(item.photo && item.photoType ? { photo: { mediaType: item.photoType as PhotoType, data: Buffer.from(item.photo) } } : {}),
      focus: asBox(item.focus), fromPhoto: details.fromPhoto, photos: details.photos,
      // A product-file piece already has a page on the brand's site: its link and its current title, for Google's figures.
      liveUrl: (item.feed as PieceFeed | null)?.rows.find((r) => r.attrs.link)?.attrs.link ?? null,
      previousTitle: (item.feed as PieceFeed | null)?.rows.find((r) => r.attrs.title)?.attrs.title ?? null,
      note: batch.source === "file" ? `Named from the product file "${batch.fileName ?? batch.title}" (SKUs ${skus.slice(0, 12).join(", ")}${skus.length > 12 ? "…" : ""})` : `Named as part of the range "${batch.title}"`,
    });
    await db.batchItem.update({ where: { id: item.id }, data: { generationId: genId } });
    await db.productImage.updateMany({ where: { batchItemId: item.id }, data: { generationId: genId } });
    await runPipeline(genId, providers, { background: true }); // a range: longer waits for slow searches
    const g = await db.generation.findUnique({ where: { id: genId }, select: { status: true } });
    await db.batchItem.update({ where: { id: item.id }, data: { status: settled(g?.status), claimedAt: null } });
  } catch (e) {
    console.error("range naming failed", item.id, e instanceof Error ? e.message : e);
    await db.batchItem.update({ where: { id: item.id }, data: { status: "failed", claimedAt: null } }).catch(() => undefined);
  }
}

const settled = (generationStatus: string | undefined) => (generationStatus === "completed" ? "named" : generationStatus === "needs_input" ? "needs_input" : "failed");

/** Put back or settle pieces left mid-way (the server restarted while reading or naming them). */
export async function recoverStale(now = Date.now()): Promise<void> {
  const readCut = new Date(now - READ_STALE_MS);
  await db.batchItem.updateMany({ where: { status: "reading", claimedAt: { lt: readCut }, attempts: { lt: MAX_READ_ATTEMPTS } }, data: { status: "queued", claimedAt: null, updatedAt: new Date() } });
  await db.batchItem.updateMany({ where: { status: "reading", claimedAt: { lt: readCut } }, data: { status: "read_failed", claimedAt: null, updatedAt: new Date() } });
  const stuck = await db.batchItem.findMany({ where: { status: "naming", claimedAt: { lt: new Date(now - NAME_STALE_MS) } }, select: { id: true, generation: { select: { status: true } } } });
  for (const s of stuck) await db.batchItem.update({ where: { id: s.id }, data: { status: settled(s.generation?.status), claimedAt: null } });
}

// One count for the whole server process. Next.js can load this file more than once (one copy per page or endpoint
// bundle), and a count per copy would let each copy run MAX_AT_ONCE.
const state = ((globalThis as unknown as { __nomenRangeWork?: { running: number; lastRecovery: number } }).__nomenRangeWork ??= { running: 0, lastRecovery: 0 });

/**
 * Start background work if there is room. Safe to call as often as you like (every upload, every time the range screen
 * checks in): it never runs more than MAX_AT_ONCE pieces, and each finished piece starts the next.
 */
export function kick(injected?: Providers): void {
  void (async () => {
    if (Date.now() - state.lastRecovery > 20_000) {
      state.lastRecovery = Date.now();
      await recoverStale().catch((e) => console.error("range recovery failed", e instanceof Error ? e.message : e));
    }
    while (state.running < MAX_AT_ONCE) {
      state.running++; // hold the slot while claiming, so two kicks can't overfill it
      let item: BatchItem | null = null, kind: "read" | "name" = "read";
      try {
        item = await claim("read");
        if (!item) { kind = "name"; item = await claim("name"); }
      } catch (e) {
        console.error("range claim failed", e instanceof Error ? e.message : e);
      }
      if (!item) { state.running--; return; }
      const claimed = item;
      const work = (async () => (kind === "read" ? readItem(claimed, injected ?? getProviders()) : nameItem(claimed, injected)))();
      void work
        .catch((e) => console.error("range work failed", claimed.id, e instanceof Error ? e.message : e)) // left as claimed: recovery settles it
        .finally(() => { state.running--; kick(injected); });
    }
  })();
}

/** Tests and scripts: do all waiting work, one piece at a time, then return. */
export async function drain(providers: Providers, fetchImage?: ImageFetcher): Promise<void> {
  for (;;) {
    const r = await claim("read");
    if (r) { await readItem(r, providers, fetchImage); continue; }
    const n = await claim("name");
    if (n) { await nameItem(n, providers); continue; }
    return;
  }
}
