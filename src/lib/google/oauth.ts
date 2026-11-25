// Google sign-in (OAuth 2.0, web server flow) for a brand's own Search Console, Analytics and Merchant Center.
// Read-only scopes; the brand admin chooses what to connect, and can disconnect any time.
import { SignJWT, jwtVerify } from "jose";
import { authSecret, env } from "../env";

export const GOOGLE_SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/webmasters.readonly", // Search Console
  "https://www.googleapis.com/auth/analytics.readonly", // Analytics 4
  "https://www.googleapis.com/auth/content", // Merchant Center (the only scope its API offers; Nomen only reads)
];

export class GoogleError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export const googleConfigured = () => !!(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);

/**
 * The site's public address as the browser sees it. Behind Render's proxy the request itself says http and an
 * internal host, so the forwarded headers decide (Google must get back exactly the address it was given).
 */
export function publicOrigin(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || u.host;
  return `${proto}://${host}`;
}

/** A redirect within the site, by path: the browser keeps its own https address. */
export const redirectTo = (path: string) => new Response(null, { status: 303, headers: { location: path } });
export const redirectUri = (origin: string) => env().GOOGLE_REDIRECT_URI ?? `${origin}/api/google/callback`;

const stateKey = () => new TextEncoder().encode(`google-state:${authSecret()}`);

/** A short-lived, signed note of who asked to connect which brand, so the callback can't be forged or replayed later. */
export async function signState(brandId: string, userId: string): Promise<string> {
  return new SignJWT({ b: brandId }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("15m").sign(stateKey());
}
export async function readState(state: string): Promise<{ brandId: string; userId: string }> {
  const { payload } = await jwtVerify(state, stateKey(), { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.b !== "string") throw new GoogleError("That sign-in link isn't valid. Please try again.");
  return { brandId: payload.b, userId: payload.sub };
}

export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin), response_type: "code", scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, ...body }), signal: AbortSignal.timeout(20_000) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new GoogleError(j.error === "invalid_grant" ? "Google says the connection has expired or was removed. Connect Google again." : `Google sign-in failed (${j.error ?? res.status})`, res.status);
  return j;
}

/** The sign-in code -> tokens, the scopes granted, and the Google account's email. */
export async function exchangeCode(code: string, origin: string) {
  const j = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
  if (!j.refresh_token) throw new GoogleError("Google didn't give Nomen lasting access. Remove Nomen from your Google account's connected apps, then connect again.");
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")).email ?? null; } catch { email = null; }
  return { refreshToken: j.refresh_token, accessToken: j.access_token, scopes: (j.scope ?? "").split(/\s+/).filter(Boolean), email };
}

const cache = new Map<string, { token: string; until: number }>();
/** A fresh access token from a refresh token (kept for its lifetime, less a minute). */
export async function accessToken(refreshToken: string): Promise<string> {
  const hit = cache.get(refreshToken);
  if (hit && hit.until > Date.now()) return hit.token;
  const j = await tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  cache.set(refreshToken, { token: j.access_token!, until: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 });
  return j.access_token!;
}

export async function revoke(refreshToken: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
