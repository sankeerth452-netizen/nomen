import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { env } from "@/lib/env";
import { authUrl, googleConfigured, publicOrigin, redirectTo, signState } from "@/lib/google/oauth";
import { EXAMPLE_TOKEN } from "@/lib/google/sync";

// Start connecting a brand's Google account (brand admins). Off to Google's own sign-in, then back to /api/google/callback.
// In the preview version it connects example figures instead, so the screens can be checked without a Google account.
export async function GET(req: Request) {
  try {
    const user = await requireUser("admin");
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId") ?? user.brandId;
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "manageBrand", brandId);
    const back = (q: string) => redirectTo(`/admin/brand?brand=${brandId}&google=${q}#google`);
    if (env().PROVIDER_MODE === "mock") {
      await db.googleConnection.upsert({ where: { brandId }, create: { brandId, email: "example@example.com", scopes: [], refreshToken: EXAMPLE_TOKEN, connectedById: user.id }, update: { refreshToken: EXAMPLE_TOKEN, email: "example@example.com", connectedById: user.id } });
      return back("connected");
    }
    if (!googleConfigured()) return back("not_set_up");
    return Response.redirect(authUrl(publicOrigin(req), await signState(brandId, user.id)), 303);
  } catch (e) {
    return errorResponse(e);
  }
}
