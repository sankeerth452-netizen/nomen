import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, presentItem } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { COPY } from "@/lib/copy";
import { MAX_READ_BYTES, MAX_THUMB_BYTES, parsePhoto } from "@/lib/photo";

// Add one photo to a range. The browser sends two shrunk copies: `photo` to keep and show, `image` for Claude to read.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "edit", b.brandId);
    const body = (await req.json().catch(() => null)) as { filename?: unknown; photo?: unknown; image?: unknown; position?: unknown } | null;
    const photo = parsePhoto(body?.photo, MAX_THUMB_BYTES);
    const image = parsePhoto(body?.image, MAX_READ_BYTES);
    if (photo === "too_large" || image === "too_large") throw new HttpError(413, COPY.photo.tooLarge);
    if (photo === "not_a_photo" || image === "not_a_photo") throw new HttpError(400, COPY.photo.notAPhoto);
    const count = await db.batchItem.count({ where: { batchId: b.id } });
    const filename = (typeof body?.filename === "string" ? body.filename : "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 160) || `Photo ${count + 1}`;
    // The browser numbers photos in the order they were dropped (several upload at once and can finish out of order).
    const last = await db.batchItem.aggregate({ where: { batchId: b.id }, _max: { position: true } });
    const asked = typeof body?.position === "number" && Number.isInteger(body.position) && body.position > 0 && body.position < 1_000_000 ? body.position : null;
    const item = await db.batchItem.create({
      data: { batchId: b.id, position: asked ?? (last._max.position ?? 0) + 1, filename, photo: new Uint8Array(photo.data), photoType: photo.mediaType, readImage: new Uint8Array(image.data), readType: image.mediaType },
      include: { generation: { select: { id: true, status: true, result: true, confidence: true } } },
    });
    kick();
    return Response.json(presentItem(item), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
