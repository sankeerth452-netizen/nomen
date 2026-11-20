import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, presentItem } from "@/lib/batch/ranges";
import { BEFORE_NAMING } from "@/lib/batch/shared";
import { kick } from "@/lib/batch/worker";
import { COPY } from "@/lib/copy";
import { MAX_PHOTOS } from "@/lib/images/info";
import { MAX_READ_BYTES, MAX_THUMB_BYTES, parsePhoto } from "@/lib/photo";

// Add more photos of one piece (back, side, details). They're read together with its main photo, so the piece goes
// back to be read again. Each photo comes as two shrunk copies: `photo` to keep and show, `image` for Claude to read.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id, itemId } = await params;
    const b = await loadRangeFor(user, id);
    await requireCapability(user, "edit", b.brandId);
    const item = await db.batchItem.findFirst({ where: { id: itemId, batchId: b.id }, include: { images: { select: { position: true } } } });
    if (!item) throw new HttpError(404, "We couldn't find that piece.");
    if (!BEFORE_NAMING.includes(item.status)) throw new HttpError(409, "This piece is already named. Add photos before naming it.");
    if (!item.photo && !item.imageUrl) throw new HttpError(409, "Add the piece's main photo first.");
    const body = (await req.json().catch(() => null)) as { photos?: { photo?: unknown; image?: unknown }[] } | null;
    const sent = Array.isArray(body?.photos) ? body.photos : [];
    if (!sent.length) throw new HttpError(400, COPY.photo.notAPhoto);
    if (item.images.length + sent.length > MAX_PHOTOS - 1) throw new HttpError(400, `A piece can have up to ${MAX_PHOTOS} photos: the main one and ${MAX_PHOTOS - 1} more.`);
    const parsed = sent.map((p) => ({ photo: parsePhoto(p?.photo, MAX_THUMB_BYTES), image: parsePhoto(p?.image, MAX_READ_BYTES) }));
    for (const p of parsed) {
      if (p.photo === "too_large" || p.image === "too_large") throw new HttpError(413, COPY.photo.tooLarge);
      if (p.photo === "not_a_photo" || p.image === "not_a_photo") throw new HttpError(400, COPY.photo.notAPhoto);
    }
    const next = Math.max(0, ...item.images.map((x) => x.position)) + 1;
    await db.$transaction([
      db.productImage.createMany({
        data: parsed.map((p, n) => {
          const photo = p.photo as Exclude<typeof p.photo, string>, image = p.image as Exclude<typeof p.image, string>;
          return { batchItemId: item.id, position: next + n, photo: new Uint8Array(photo.data), photoType: photo.mediaType, readImage: new Uint8Array(image.data), readType: image.mediaType };
        }),
      }),
      // Read again with every photo. What the buyer typed stays; what the last reading filled in is replaced.
      db.batchItem.update({ where: { id: item.id }, data: { status: "queued", attempts: 0, claimedAt: null, updatedAt: new Date() } }),
    ]);
    kick();
    const fresh = await db.batchItem.findUniqueOrThrow({ where: { id: item.id }, include: { generation: { select: { id: true, status: true, result: true, confidence: true } }, images: { select: { position: true }, orderBy: { position: "asc" } } } });
    return Response.json(presentItem(fresh), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
