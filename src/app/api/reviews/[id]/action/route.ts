import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import type { ResultLike } from "@/lib/review/fields";
import { loadReview, presentReview } from "@/lib/review/load";
import { can } from "@/lib/review/permissions";
import { act, APPROVER_ACTIONS, type ReviewAction } from "@/lib/review/workflow";

const ACTIONS: ReviewAction[] = ["submit", "approve", "reject", "ready", "reopen"];

// Move a product along: { action: submit | approve | reject | ready | reopen, fields?: [...] }.
// Sending for review needs edit rights; the rest need approval rights.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { g, review, settings } = await loadReview(user, (await params).id);
    const body = (await req.json().catch(() => null)) as { action?: unknown; fields?: unknown } | null;
    const action = body?.action as ReviewAction;
    if (!ACTIONS.includes(action)) throw new HttpError(400, "That isn't something you can do here.");
    const needed = APPROVER_ACTIONS.includes(action) ? "approve" : "edit";
    if (!can(user, needed, settings)) throw new HttpError(403, needed === "approve" ? "Only reviewers and brand admins can approve or reject." : "Your login can't send products for review.");
    const fields = Array.isArray(body?.fields) ? body!.fields.filter((f): f is string => typeof f === "string") : undefined;
    const updated = await act(review, user.id, action, g.result as ResultLike, fields);
    return Response.json(await presentReview(g, updated, user, settings));
  } catch (e) {
    return errorResponse(e);
  }
}
