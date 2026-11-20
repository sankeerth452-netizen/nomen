import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadReview, presentReview } from "@/lib/review/load";
import { can } from "@/lib/review/permissions";
import { editField } from "@/lib/review/workflow";
import { googleCategoryIds } from "@/lib/sheet/taxonomy";

export const dynamic = "force-dynamic";

// A product's review: its fields (the AI's and people's values), status, history and comments.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { g, review, settings } = await loadReview(user, (await params).id);
    return Response.json(await presentReview(g, review, user, settings));
  } catch (e) {
    return errorResponse(e);
  }
}

// Change one field: { field, value }. A change to an approved product sends it back to review.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { g, review, settings } = await loadReview(user, (await params).id);
    if (!can(user, "edit", settings)) throw new HttpError(403, "Your login can't change products. Ask your brand admin.");
    const body = (await req.json().catch(() => null)) as { field?: unknown; value?: unknown } | null;
    if (!body || typeof body.field !== "string") throw new HttpError(400, "Say which field to change.");
    const updated = await editField(review, user.id, body.field, body.value, body.field === "category" ? await googleCategoryIds() : undefined);
    return Response.json(await presentReview(g, updated, user, settings));
  } catch (e) {
    return errorResponse(e);
  }
}
