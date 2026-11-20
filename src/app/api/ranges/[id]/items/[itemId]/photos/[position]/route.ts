import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadRangeFor } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { BEFORE_NAMING } from "@/lib/batch/shared";

type Params = { params: Promise<{ id: string; itemId: string; position: string }> };

async function find(user: Awaited<ReturnType<typeof requireUser>>, { params }: Params) {
  const { id, itemId, position } = await params;
  const b = await loadRangeFor(user, id);
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 1) throw new HttpError(404, "We couldn't find that photo.");
  const img = await db.productImage.findFirst({ where: { batchItemId: itemId, position: pos, batchItem: { batchId: b.id } }, include: { batchItem: { select: { id: true, status: true } } } });
  if (!img) throw new HttpError(404, "We couldn't find that photo.");
  return { b, img };
}

// One of a piece's other photos, for whoever may see the range.
export async function GET(_req: Request, ctx: Params) {
  try {
    const { img } = await find(await requireUser("buyer"), ctx);
    if (!img.photo || !img.photoType) throw new HttpError(404, "That photo hasn't loaded yet.");
    return new Response(new Uint8Array(img.photo), { headers: { "content-type": img.photoType, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}

// Remove one of them. Before naming, the piece is read again without it.
export async function DELETE(_req: Request, ctx: Params) {
  try {
    const user = await requireUser("buyer");
    const { b, img } = await find(user, ctx);
    await requireCapability(user, "edit", b.brandId);
    if (!img.batchItem || !BEFORE_NAMING.includes(img.batchItem.status)) throw new HttpError(409, "This piece is already named, so its photos stay as they were.");
    await db.$transaction([
      db.productImage.delete({ where: { id: img.id } }),
      db.batchItem.update({ where: { id: img.batchItem.id }, data: { status: "queued", attempts: 0, claimedAt: null, updatedAt: new Date() } }),
    ]);
    kick();
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
