import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_OPTIONS } from "@/lib/auth/session";

// The owner switches brand workspace: { brandId } for one brand, { brandId: null } for every brand.
export async function POST(req: Request) {
  try {
    const user = await requireUser("owner");
    const body = (await req.json().catch(() => null)) as { brandId?: unknown } | null;
    const jar = await cookies();
    if (body?.brandId === null || body?.brandId === "") { jar.delete(WORKSPACE_COOKIE); return Response.json({ brandId: null }); }
    if (typeof body?.brandId !== "string") throw new HttpError(400, "Choose a brand.");
    const brand = await db.brand.findFirst({ where: { id: body.brandId, active: true }, select: { id: true, name: true } });
    if (!brand) throw new HttpError(404, "We couldn't find that brand.");
    jar.set(WORKSPACE_COOKIE, brand.id, WORKSPACE_COOKIE_OPTIONS);
    await db.auditEvent.create({ data: { brandId: brand.id, userId: user.id, eventType: "workspace.switched", metadata: { brandId: brand.id } } });
    return Response.json({ brandId: brand.id, name: brand.name });
  } catch (e) {
    return errorResponse(e);
  }
}
