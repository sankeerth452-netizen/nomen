import { Prisma } from "@prisma/client";
import { requireCapability } from "@/lib/review/guard";
import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { WORKING, asDetails, cleanFields, loadRangeFor, presentItem, withEdits, type ItemStatus } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { COPY } from "@/lib/copy";

const include = { generation: { select: { id: true, status: true, result: true, confidence: true } } } as const;

async function load(rangeId: string, itemId: string) {
  const item = await db.batchItem.findFirst({ where: { id: itemId, batchId: rangeId }, include });
  if (!item) throw new HttpError(404, "We couldn't find that photo.");
  return item;
}

// Change a piece's details (the buyer's checks), or try reading its photo again.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id, itemId } = await params;
    const b = await loadRangeFor(user, id);
    await requireCapability(user, "edit", b.brandId);
    const item = await load(b.id, itemId);
    if (WORKING.includes(item.status as ItemStatus)) throw new HttpError(409, COPY.range.busy);
    const body = (await req.json().catch(() => ({}))) as { fields?: unknown; retryRead?: unknown };
    if (body.retryRead === true && item.status === "read_failed" && item.readImage) {
      const updated = await db.batchItem.update({ where: { id: item.id }, data: { status: "queued", attempts: 0 }, include });
      kick();
      return Response.json(presentItem(updated));
    }
    const details = withEdits(asDetails(item.details) ?? { fields: {}, fromPhoto: [], unsure: [] }, cleanFields(body.fields));
    // A photo with no piece found, or one that couldn't be read, becomes a normal piece once the buyer describes it.
    const status = item.status === "not_product" || item.status === "read_failed" ? "review" : item.status;
    const updated = await db.batchItem.update({ where: { id: item.id }, data: { details: details as unknown as Prisma.InputJsonValue, status, ...(status === "review" ? { readImage: null, readType: null } : {}) }, include });
    return Response.json(presentItem(updated));
  } catch (e) {
    return errorResponse(e);
  }
}

// Take a photo out of the range. A piece already named stays in History.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id, itemId } = await params;
    const b = await loadRangeFor(user, id);
    await requireCapability(user, "edit", b.brandId);
    const item = await load(b.id, itemId);
    if (WORKING.includes(item.status as ItemStatus)) throw new HttpError(409, COPY.range.busy);
    await db.batchItem.delete({ where: { id: item.id } });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
