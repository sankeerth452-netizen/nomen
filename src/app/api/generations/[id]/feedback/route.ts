import { z } from "zod";
import { requireCapability } from "@/lib/review/guard";
import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { editField, ensureReview } from "@/lib/review/workflow";
import { currentValue, type Edits, type ResultLike } from "@/lib/review/fields";

const body = z.object({
  outcome: z.enum(["used", "edited", "rejected"]),
  finalTitle: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(300).optional(),
}).refine((b) => b.outcome !== "edited" || !!b.finalTitle, { message: "Type the final name you used." });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    const g = await loadGenerationFor(user, id);
    await requireCapability(user, "edit", g.brandId);
    if (g.userId !== user.id) return Response.json({ error: "Only the person who created this name can give feedback on it." }, { status: 403 });
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "We couldn't save that. Please try again." }, { status: 400 });
    const used = (g.result as { recommendation?: { recommended_title?: string } } | null)?.recommendation?.recommended_title;
    const finalTitle = parsed.data.outcome === "used" ? (parsed.data.finalTitle ?? used ?? null) : parsed.data.finalTitle ?? null;
    const fb = await db.feedback.create({ data: { generationId: id, userId: user.id, outcome: parsed.data.outcome, finalTitle, reason: parsed.data.reason ?? null } });
    // The name they used (an alternative, or their own edit) becomes the product's name in Review and the exports,
    // as a person's change: kept in its history, and an approved product goes back to be looked at again.
    const review = finalTitle && parsed.data.outcome !== "rejected" ? await ensureReview(g) : null;
    if (review && finalTitle !== currentValue(g.result as ResultLike, (review.edits ?? {}) as Edits, "name")) await editField(review, user.id, "name", finalTitle);
    return Response.json({ id: fb.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
