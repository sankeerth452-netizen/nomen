import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { addPhotoPiece, loadRangeFor, presentItem } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { COPY } from "@/lib/copy";
import { MAX_PHOTOS } from "@/lib/images/info";
import { MAX_READ_BYTES, MAX_THUMB_BYTES, parsePhoto, type Photo } from "@/lib/photo";

// Two shrunk copies of one photo: `photo` to keep and show, `image` for Claude to read.
function photoPair(p: { photo?: unknown; image?: unknown } | null | undefined): { photo: Photo; image: Photo } {
  const photo = parsePhoto(p?.photo, MAX_THUMB_BYTES);
  const image = parsePhoto(p?.image, MAX_READ_BYTES);
  if (photo === "too_large" || image === "too_large") throw new HttpError(413, COPY.photo.tooLarge);
  if (photo === "not_a_photo" || image === "not_a_photo") throw new HttpError(400, COPY.photo.notAPhoto);
  return { photo, image };
}

// Add one piece to a range: its photo, and its other photos when the buyer's file names grouped them (dress-1.jpg,
// dress-2.jpg). They're saved together, so the piece is read once with every photo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "edit", b.brandId);
    const body = (await req.json().catch(() => null)) as { filename?: unknown; photo?: unknown; image?: unknown; position?: unknown; more?: unknown } | null;
    const main = photoPair(body);
    const sent = Array.isArray(body?.more) ? (body.more as { photo?: unknown; image?: unknown }[]) : [];
    if (sent.length > MAX_PHOTOS - 1) throw new HttpError(400, `A piece can have up to ${MAX_PHOTOS} photos: the main one and ${MAX_PHOTOS - 1} more.`);
    const more = sent.map(photoPair);
    const count = await db.batchItem.count({ where: { batchId: b.id } });
    const filename = (typeof body?.filename === "string" ? body.filename : "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 160) || `Photo ${count + 1}`;
    // The browser numbers pieces in the order they were dropped (several upload at once and can finish out of order).
    const position = typeof body?.position === "number" && Number.isInteger(body.position) && body.position > 0 && body.position < 1_000_000 ? body.position : null;
    const item = await addPhotoPiece(b.id, { filename, position, ...main, more });
    kick();
    return Response.json(presentItem(item), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
