import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { encryptToken } from "@/lib/google/crypto";
import { exchangeCode, GoogleError, publicOrigin, readState, redirectTo } from "@/lib/google/oauth";

// Google sends the brand admin back here after they agree. The signed state says which brand and who asked; it must be
// the same person, still signed in. The refresh token is stored encrypted; nothing else from Google is kept.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (brandId: string | null, q: string) => redirectTo(`/admin/brand?${brandId ? `brand=${brandId}&` : ""}google=${q}#google`);
  let brandId: string | null = null;
  try {
    const state = await readState(url.searchParams.get("state") ?? "").catch(() => { throw new GoogleError("That sign-in link isn't valid or has expired. Please try again."); });
    brandId = state.brandId;
    if (url.searchParams.get("error")) return done(brandId, "cancelled");
    const user = await getSessionUser();
    if (!user || user.id !== state.userId) return done(brandId, "signed_out");
    const code = url.searchParams.get("code");
    if (!code) return done(brandId, "error");
    const t = await exchangeCode(code, publicOrigin(req));
    await db.$transaction([
      db.googleConnection.upsert({
        where: { brandId },
        create: { brandId, email: t.email, scopes: t.scopes, refreshToken: encryptToken(t.refreshToken), connectedById: user.id },
        update: { email: t.email, scopes: t.scopes, refreshToken: encryptToken(t.refreshToken), connectedById: user.id, lastSyncError: null },
      }),
      db.auditEvent.create({ data: { brandId, userId: user.id, eventType: "google.connected", metadata: { email: t.email, scopes: t.scopes } } }),
    ]);
    return done(brandId, "connected");
  } catch (e) {
    console.error("google callback failed", e instanceof Error ? e.message : e);
    return done(brandId, "error");
  }
}
