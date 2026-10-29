import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { runPipeline } from "@/lib/pipeline/run";
import { rateLimit } from "@/lib/rateLimit";

// Retry a failed generation. It resumes from stored evidence, so paid SERP calls are never repeated.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    const g = await loadGenerationFor(user, id);
    if (g.status !== "failed") throw new HttpError(409, "This one doesn't need trying again.");
    if (!rateLimit(`retry:${user.id}`, 20, 3_600_000)) throw new HttpError(429, "That's a lot of tries this hour. Take a short break and try again.");
    // Atomic claim: a double-click can't start two runs.
    const claimed = await db.generation.updateMany({ where: { id, status: "failed" }, data: { status: "pending", errorCode: null } });
    if (claimed.count === 0) throw new HttpError(409, "We're already trying this one again.");
    void runPipeline(id).catch((e) => console.error("runPipeline crashed", id, e instanceof Error ? e.message : e));
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
