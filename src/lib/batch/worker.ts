// Works through ranges in the background: reads each photo, then names each piece the buyer has checked.
// Runs inside the single web service (like the single-piece pipeline). Pieces are claimed in the database, so work
// survives a restart: anything left half-done is put back or settled the next time someone looks at a range.
import { Prisma, type BatchItem } from "@prisma/client";
import { db } from "../db";
import { getProviders, type Providers } from "../providers";
import { focusFractions, imageSize, type PhotoType } from "../photo";
import { createGeneration, runPipeline } from "../pipeline/run";
import { asBox, asDetails, detailsFromPhoto, isReady } from "./ranges";

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

/** Read one photo into details for the buyer to check. Failures go back in the queue, up to three tries. */
export async function readItem(item: BatchItem, providers: Providers): Promise<void> {
  if (!item.readImage || !item.readType) {
    await db.batchItem.update({ where: { id: item.id }, data: { status: "read_failed", claimedAt: null } });
    return;
  }
  const image = { mediaType: item.readType as PhotoType, data: Buffer.from(item.readImage) };
  try {
    const { details, usage } = await providers.photo.read({ image });
    console.info("range photo read", { item: item.id, model: usage.model, input: usage.inputTokens, output: usage.outputTokens });
    if (details.not_a_product) {
      await db.batchItem.update({ where: { id: item.id }, data: { status: "not_product", details: json({ fields: {}, fromPhoto: [], unsure: [] }), readImage: null, readType: null, claimedAt: null } });
      return;
    }
    await db.batchItem.update({
      where: { id: item.id },
      data: { status: "review", details: json(detailsFromPhoto(details)), focus: json(focusFractions(details.focus, imageSize(image))), readImage: null, readType: null, claimedAt: null },
    });
  } catch (e) {
    console.error("range photo read failed", item.id, e instanceof Error ? e.message : e);
    await db.batchItem.update({ where: { id: item.id }, data: { status: item.attempts < MAX_READ_ATTEMPTS ? "queued" : "read_failed", claimedAt: null } });
  }
}

/** Name one checked piece through the normal pipeline (so it also appears in History with its evidence). */
export async function nameItem(item: BatchItem, providers?: Providers): Promise<void> {
  const details = asDetails(item.details);
  if (!details || !isReady(details)) {
    await db.batchItem.update({ where: { id: item.id }, data: { status: "review", claimedAt: null } });
    return;
  }
  try {
    const batch = await db.batch.findUniqueOrThrow({ where: { id: item.batchId }, include: { user: { select: { id: true, brandId: true } } } });
    const genId = await createGeneration(batch.user, batch.brandId, { ...details.fields }, {
      photo: { mediaType: item.photoType as PhotoType, data: Buffer.from(item.photo) },
      focus: asBox(item.focus), fromPhoto: details.fromPhoto, note: `Named as part of the range "${batch.title}"`,
    });
    await db.batchItem.update({ where: { id: item.id }, data: { generationId: genId } });
    await runPipeline(genId, providers);
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
  await db.batchItem.updateMany({ where: { status: "reading", claimedAt: { lt: readCut }, attempts: { lt: MAX_READ_ATTEMPTS } }, data: { status: "queued", claimedAt: null } });
  await db.batchItem.updateMany({ where: { status: "reading", claimedAt: { lt: readCut } }, data: { status: "read_failed", claimedAt: null } });
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
export async function drain(providers: Providers): Promise<void> {
  for (;;) {
    const r = await claim("read");
    if (r) { await readItem(r, providers); continue; }
    const n = await claim("name");
    if (n) { await nameItem(n, providers); continue; }
    return;
  }
}
