import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, rangeItems } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";

export const dynamic = "force-dynamic";

// The range and every piece's stage. Looking also nudges the background work along (and recovers anything a restart left).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    kick();
    return Response.json({ id: b.id, title: b.title, createdAt: b.createdAt, items: await rangeItems(b.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// Rename the range.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const body = (await req.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    if (title) await db.batch.update({ where: { id: b.id }, data: { title } });
    return Response.json({ title: title || b.title });
  } catch (e) {
    return errorResponse(e);
  }
}
