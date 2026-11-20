import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadReview, presentReview } from "@/lib/review/load";
import { can } from "@/lib/review/permissions";
import { addComment } from "@/lib/review/workflow";

// A note on the product or one of its fields: { body, field?, flag? }. `flag` marks the AI as wrong.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { g, review, settings } = await loadReview(user, (await params).id);
    if (!can(user, "comment", settings)) throw new HttpError(403, "Your login can't comment here.");
    const body = (await req.json().catch(() => null)) as { body?: unknown; field?: unknown; flag?: unknown } | null;
    await addComment(review, user.id, typeof body?.body === "string" ? body.body : "", typeof body?.field === "string" && body.field ? body.field : null, body?.flag === true);
    return Response.json(await presentReview(g, review, user, settings), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
