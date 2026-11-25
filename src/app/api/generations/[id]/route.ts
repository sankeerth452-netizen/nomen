import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import { failIfStale } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

// Brand admins: count this piece as a test, which leaves it out of the dashboard.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    const g = await loadGenerationFor(user, id);
    await requireCapability(user, "manageBrand", g.brandId);
    const body = (await req.json().catch(() => ({}))) as { isTest?: unknown };
    if (typeof body.isTest !== "boolean") throw new HttpError(400, "Nothing to change.");
    await db.$transaction([
      db.generation.update({ where: { id }, data: { isTest: body.isTest } }),
      db.auditEvent.create({ data: { brandId: g.brandId, userId: user.id, eventType: "generation.test_marked", metadata: { generationId: id, isTest: body.isTest } } }),
    ]);
    return Response.json({ isTest: body.isTest });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    await loadGenerationFor(user, id);
    await failIfStale(id);
    return Response.json(presentGeneration(await loadGenerationFor(user, id), user));
  } catch (e) {
    return errorResponse(e);
  }
}
