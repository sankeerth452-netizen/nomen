import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import type { ResultLike } from "@/lib/review/fields";
import { loadReview, presentReview } from "@/lib/review/load";
import { can } from "@/lib/review/permissions";
import { restoreField } from "@/lib/review/workflow";

// Bring back an earlier value: { field, revisionId } or { field, ai: true } for what the AI wrote.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { g, review, settings } = await loadReview(user, (await params).id);
    if (!can(user, "edit", settings)) throw new HttpError(403, "Your login can't change products. Ask your brand admin.");
    const body = (await req.json().catch(() => null)) as { field?: unknown; revisionId?: unknown; ai?: unknown } | null;
    if (!body || typeof body.field !== "string") throw new HttpError(400, "Say which field to bring back.");
    const from = body.ai === true ? { ai: true as const } : typeof body.revisionId === "string" ? { revisionId: body.revisionId } : null;
    if (!from) throw new HttpError(400, "Say which version to bring back.");
    const updated = await restoreField(review, user.id, body.field, from, g.result as ResultLike);
    return Response.json(await presentReview(g, updated, user, settings));
  } catch (e) {
    return errorResponse(e);
  }
}
