import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { COPY } from "@/lib/copy";

// Start a new, empty range. Photos are added to it one by one (POST /api/ranges/:id/items).
export async function POST(req: Request) {
  try {
    const user = await requireUser("buyer");
    const body = (await req.json().catch(() => ({}))) as { brandId?: unknown; title?: unknown };
    const brandId = user.brandId ?? (typeof body.brandId === "string" ? body.brandId : null); // owners pick a brand
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "edit", brandId);
    const title = (typeof body.title === "string" && body.title.trim().slice(0, 80)) || COPY.range.title(new Date());
    const b = await db.batch.create({ data: { brandId, userId: user.id, title } });
    return Response.json({ id: b.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
