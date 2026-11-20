import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { loadRangeFor, retryFailed } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";

// Try every piece that failed again (photos read again, names named again); pieces that worked are left alone.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "edit", b.brandId);
    const r = await retryFailed(b.id);
    if (!r.reread && !r.renamed) throw new HttpError(400, "Nothing here needs trying again.");
    kick();
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
