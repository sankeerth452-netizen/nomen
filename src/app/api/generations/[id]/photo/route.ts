import { errorResponse, requireUser, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { loadGenerationFor } from "@/lib/pipeline/access";

// The buyer's photo for a generation, for whoever may see the generation itself.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    await loadGenerationFor(user, id);
    const p = await db.generationPhoto.findUnique({ where: { generationId: id } });
    if (!p) throw new HttpError(404, "We couldn't find that.");
    return new Response(new Uint8Array(p.data), { headers: { "content-type": p.mediaType, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
