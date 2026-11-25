import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, rangeItems } from "@/lib/batch/ranges";
import { rangeProgress } from "@/lib/batch/report";
import { kick } from "@/lib/batch/worker";

export const dynamic = "force-dynamic";

// The range and every piece's stage. Looking also nudges the background work along (and recovers anything a restart left).
// With ?since=<the last check's "at">, only the pieces that changed since then, plus every piece's id in order (so a
// removed piece disappears): a range of any size costs the same to keep up to date.
const OVERLAP_MS = 3_000; // a little extra, so a change saved during the last check (or a small clock difference) is never missed
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    kick();
    const at = new Date().toISOString();
    const since = Date.parse(new URL(req.url).searchParams.get("since") ?? "");
    if (Number.isFinite(since)) {
      const [changed, ids, progress] = await Promise.all([
        rangeItems(b.id, new Date(since - OVERLAP_MS)),
        db.batchItem.findMany({ where: { batchId: b.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true } }),
        rangeProgress(b.id),
      ]);
      return Response.json({ id: b.id, title: b.title, at, changed, ids: ids.map((i) => i.id), progress });
    }
    const [items, progress] = await Promise.all([rangeItems(b.id), rangeProgress(b.id)]);
    return Response.json({ id: b.id, title: b.title, createdAt: b.createdAt, at, items, progress });
  } catch (e) {
    return errorResponse(e);
  }
}

// Rename the range, or (brand admins) count it as a test, which leaves its pieces out of the dashboard.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const body = (await req.json().catch(() => ({}))) as { title?: unknown; isTest?: unknown };
    if (typeof body.isTest === "boolean") {
      await requireCapability(user, "manageBrand", b.brandId);
      await db.$transaction([
        db.batch.update({ where: { id: b.id }, data: { isTest: body.isTest } }),
        db.auditEvent.create({ data: { brandId: b.brandId, userId: user.id, eventType: "range.test_marked", metadata: { batchId: b.id, isTest: body.isTest } } }),
      ]);
      return Response.json({ isTest: body.isTest });
    }
    await requireCapability(user, "edit", b.brandId);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    if (title) await db.batch.update({ where: { id: b.id }, data: { title } });
    return Response.json({ title: title || b.title });
  } catch (e) {
    return errorResponse(e);
  }
}
