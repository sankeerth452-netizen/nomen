import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { writeSheet } from "@/lib/pipeline/sheet";
import { rateLimit } from "@/lib/rateLimit";

// Fill in the product data again: after a failure, or for a name made before product data existed.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const g = await loadGenerationFor(user, (await params).id);
    await requireCapability(user, "edit", g.brandId);
    const r = g.result as { recommendation?: unknown; sheet?: { status: string } } | null;
    if (g.status !== "completed" || !r?.recommendation) throw new HttpError(409, "This piece doesn't have a name yet.");
    if (r.sheet?.status === "writing") throw new HttpError(409, "The product data is already being filled in.");
    if (!rateLimit(`sheet:${user.id}`, 60, 3_600_000)) throw new HttpError(429, "You've filled in a lot of product data this hour. Take a short break and try again.");
    void writeSheet(g.id);
    return Response.json({ status: "writing" }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
