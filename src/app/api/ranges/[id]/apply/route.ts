import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { asDetails, cleanFields, fillEmpty, loadRangeFor, rangeItems } from "@/lib/batch/ranges";

// "Apply to every piece": details that hold for the whole range (e.g. audience, fabric). Fills empty fields only.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const shared = cleanFields(((await req.json().catch(() => ({}))) as { fields?: unknown }).fields);
    delete shared.freeText; // a description is per piece
    const items = await db.batchItem.findMany({ where: { batchId: b.id, status: { in: ["review", "needs_input", "failed"] } }, select: { id: true, details: true } });
    for (const i of items) {
      const d = asDetails(i.details);
      if (d) await db.batchItem.update({ where: { id: i.id }, data: { details: fillEmpty(d, shared) as unknown as Prisma.InputJsonValue } });
    }
    return Response.json({ items: await rangeItems(b.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
