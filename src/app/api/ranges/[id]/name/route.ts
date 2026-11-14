import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { asDetails, isReady, loadRangeFor } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import { COPY } from "@/lib/copy";
import { rateLimitMany } from "@/lib/rateLimit";

const NAME_PER_HOUR = 300;

// Name the checked pieces: every ready piece, or just the ones listed (e.g. "Name again" on one piece).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const body = (await req.json().catch(() => ({}))) as { itemIds?: unknown };
    const only = Array.isArray(body.itemIds) ? body.itemIds.filter((x): x is string => typeof x === "string") : null;
    // Waiting to be named for the first time, or named before and changed since (a question answered, a failure retried).
    const candidates = await db.batchItem.findMany({
      where: { batchId: b.id, status: { in: only ? ["review", "needs_input", "failed", "named"] : ["review"] }, ...(only ? { id: { in: only } } : {}) },
      select: { id: true, details: true },
    });
    const ready = candidates.filter((c) => isReady(asDetails(c.details))).map((c) => c.id);
    if (!ready.length) throw new HttpError(400, COPY.range.nothingReady);
    if (!rateLimitMany(`rangename:${user.id}`, ready.length, NAME_PER_HOUR, 3_600_000)) throw new HttpError(429, COPY.range.tooManyNames);
    await db.batchItem.updateMany({ where: { id: { in: ready } }, data: { status: "to_name", claimedAt: null } });
    kick();
    return Response.json({ queued: ready.length, skipped: candidates.length - ready.length });
  } catch (e) {
    return errorResponse(e);
  }
}
