import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadRangeFor } from "@/lib/batch/ranges";

// A piece's photo, for whoever may see the range.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id, itemId } = await params;
    const b = await loadRangeFor(user, id);
    const item = await db.batchItem.findFirst({ where: { id: itemId, batchId: b.id }, select: { photo: true, photoType: true } });
    if (!item) throw new HttpError(404, "We couldn't find that photo.");
    return new Response(new Uint8Array(item.photo), { headers: { "content-type": item.photoType, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
