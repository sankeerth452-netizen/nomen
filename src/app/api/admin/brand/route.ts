import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { parseBrandSettings } from "@/lib/brand";
import { requireCapability } from "@/lib/review/guard";

// Brand settings a brand admin can change here: { brandId, approvalRequired }.
export async function PATCH(req: Request) {
  try {
    const user = await requireUser("admin");
    const body = (await req.json().catch(() => null)) as { brandId?: unknown; approvalRequired?: unknown } | null;
    const brandId = typeof body?.brandId === "string" ? body.brandId : user.brandId;
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "manageBrand", brandId);
    if (typeof body?.approvalRequired !== "boolean") throw new HttpError(400, "Nothing to change.");
    const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
    const settings = { ...parseBrandSettings(brand.settings), approvalRequired: body.approvalRequired };
    await db.$transaction([
      db.brand.update({ where: { id: brandId }, data: { settings: settings as unknown as Prisma.InputJsonValue } }),
      db.auditEvent.create({ data: { brandId, userId: user.id, eventType: "brand.approval_required", metadata: { approvalRequired: body.approvalRequired } } }),
    ]);
    return Response.json({ approvalRequired: settings.approvalRequired });
  } catch (e) {
    return errorResponse(e);
  }
}
