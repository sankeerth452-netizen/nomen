import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { decryptToken } from "@/lib/google/crypto";
import { googleConfigured, revoke } from "@/lib/google/oauth";
import { EXAMPLE_TOKEN, googleDataFor } from "@/lib/google/sync";
import { env } from "@/lib/env";

async function brandFor(req: Request, body?: { brandId?: unknown }) {
  const user = await requireUser("admin");
  const brandId = (typeof body?.brandId === "string" ? body.brandId : new URL(req.url).searchParams.get("brandId")) || user.brandId;
  if (!brandId) throw new HttpError(400, "Choose a brand first.");
  assertBrandAccess(user, brandId);
  await requireCapability(user, "manageBrand", brandId);
  return { user, brandId };
}

// The brand's Google connection: what's connected, and the sites, properties and accounts it can choose from.
export async function GET(req: Request) {
  try {
    const { brandId } = await brandFor(req);
    const g = await googleDataFor(brandId);
    if (!g) return Response.json({ connected: false, configured: googleConfigured() || env().PROVIDER_MODE === "mock" });
    const options = { sites: [] as { id: string; label: string }[], properties: [] as { id: string; label: string }[], merchants: [] as { id: string; label: string }[] };
    const problems: string[] = [];
    await Promise.all([
      g.data.sites().then((x) => { options.sites = x; }).catch((e) => problems.push(`Search Console: ${e instanceof Error ? e.message : "didn't answer"}`)),
      g.data.properties().then((x) => { options.properties = x; }).catch((e) => problems.push(`Analytics: ${e instanceof Error ? e.message : "didn't answer"}`)),
      g.data.merchants().then((x) => { options.merchants = x; }).catch((e) => problems.push(`Merchant Center: ${e instanceof Error ? e.message : "didn't answer"}`)),
    ]);
    const c = g.conn;
    return Response.json({ connected: true, example: c.refreshToken === EXAMPLE_TOKEN, email: c.email, chosen: { site: c.searchConsoleSite, property: c.analyticsProperty, merchant: c.merchantAccount }, options, lastSyncAt: c.lastSyncAt, lastSyncError: c.lastSyncError, problems });
  } catch (e) {
    return errorResponse(e);
  }
}

// Choose which site, property and account to read (each optional).
export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { brandId?: unknown; site?: unknown; property?: unknown; merchant?: unknown };
    const { user, brandId } = await brandFor(req, body);
    const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
    const data = { searchConsoleSite: pick(body.site), analyticsProperty: pick(body.property), merchantAccount: pick(body.merchant) };
    if (data.analyticsProperty && !/^properties\/\d+$/.test(data.analyticsProperty)) throw new HttpError(400, "That Analytics property doesn't look right.");
    if (data.merchantAccount && !/^accounts\/\d+$/.test(data.merchantAccount)) throw new HttpError(400, "That Merchant Center account doesn't look right.");
    await db.$transaction([
      db.googleConnection.update({ where: { brandId }, data }),
      db.auditEvent.create({ data: { brandId, userId: user.id, eventType: "google.sources_chosen", metadata: data } }),
    ]);
    return Response.json({ chosen: { site: data.searchConsoleSite, property: data.analyticsProperty, merchant: data.merchantAccount } });
  } catch (e) {
    return errorResponse(e);
  }
}

// Disconnect: Google's access is withdrawn and the stored token deleted. Figures already brought in stay.
export async function DELETE(req: Request) {
  try {
    const { user, brandId } = await brandFor(req);
    const c = await db.googleConnection.findUnique({ where: { brandId } });
    if (!c) return new Response(null, { status: 204 });
    if (c.refreshToken !== EXAMPLE_TOKEN) await revoke(decryptToken(c.refreshToken)).catch(() => undefined);
    await db.$transaction([
      db.googleConnection.delete({ where: { brandId } }),
      db.auditEvent.create({ data: { brandId, userId: user.id, eventType: "google.disconnected", metadata: { email: c.email } } }),
    ]);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
