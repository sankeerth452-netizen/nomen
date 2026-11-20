import { errorResponse, requireUser, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { loadGenerationFor } from "@/lib/pipeline/access";

// One of a named piece's other photos (back, side, details), for whoever may see the piece itself.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; position: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id, position } = await params;
    await loadGenerationFor(user, id);
    const pos = Number(position);
    const p = Number.isInteger(pos) && pos > 0 ? await db.productImage.findFirst({ where: { generationId: id, position: pos } }) : null;
    if (!p?.photo || !p.photoType) throw new HttpError(404, "We couldn't find that.");
    return new Response(new Uint8Array(p.photo), { headers: { "content-type": p.photoType, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
