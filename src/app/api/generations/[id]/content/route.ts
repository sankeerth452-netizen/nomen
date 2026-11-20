import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { writeContent } from "@/lib/pipeline/content";
import { rateLimit } from "@/lib/rateLimit";

// Write the product page again: after a failure, for a name made before pages existed, or for a chosen alternative.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const g = await loadGenerationFor(user, (await params).id);
    await requireCapability(user, "edit", g.brandId);
    const rec = (g.result as { recommendation?: { recommended_title: string; alternatives: { title: string }[] }; content?: { status: string } } | null);
    if (g.status !== "completed" || !rec?.recommendation) throw new HttpError(409, "This piece doesn't have a name yet.");
    if (rec.content?.status === "writing") throw new HttpError(409, "The product page is already being written.");
    const body = (await req.json().catch(() => ({}))) as { title?: unknown };
    const names = [rec.recommendation.recommended_title, ...rec.recommendation.alternatives.map((a) => a.title)];
    const title = typeof body.title === "string" && body.title ? body.title : rec.recommendation.recommended_title;
    if (!names.includes(title)) throw new HttpError(400, "Choose one of the suggested names.");
    if (!rateLimit(`content:${user.id}`, 60, 3_600_000)) throw new HttpError(429, "You've written a lot of product pages this hour. Take a short break and try again.");
    void writeContent(g.id, { title });
    return Response.json({ status: "writing" }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
