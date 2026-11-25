import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { rateLimit } from "@/lib/rateLimit";
import { syncBrand } from "@/lib/google/sync";

// Bring the brand's Google figures in now (it also happens by itself once a day when the dashboard is opened).
export async function POST(req: Request) {
  try {
    const user = await requireUser("admin");
    const body = (await req.json().catch(() => ({}))) as { brandId?: unknown };
    const brandId = (typeof body.brandId === "string" && body.brandId) || user.brandId;
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "manageBrand", brandId);
    if (!rateLimit(`googlesync:${brandId}`, 6, 3_600_000)) throw new HttpError(429, "Google's figures were brought in a few times this hour already. Try again later.");
    return Response.json(await syncBrand(brandId));
  } catch (e) {
    return errorResponse(e);
  }
}
