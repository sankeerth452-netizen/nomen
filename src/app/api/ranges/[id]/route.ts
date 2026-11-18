import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, rangeItems } from "@/lib/batch/ranges";
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
      const [changed, ids] = await Promise.all([
        rangeItems(b.id, new Date(since - OVERLAP_MS)),
        db.batchItem.findMany({ where: { batchId: b.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true } }),
      ]);
      return Response.json({ id: b.id, title: b.title, at, changed, ids: ids.map((i) => i.id) });
    }
    return Response.json({ id: b.id, title: b.title, createdAt: b.createdAt, at, items: await rangeItems(b.id) });
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
