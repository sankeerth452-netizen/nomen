import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/google/crypto";
import { authUrl, publicOrigin, readState, redirectTo, signState, GOOGLE_SCOPES } from "@/lib/google/oauth";
import { LiveGoogleData, normaliseUrl, pathOf } from "@/lib/google/data";
import { EXAMPLE_TOKEN, linkedPieces, syncBrand } from "@/lib/google/sync";
import { performanceData } from "@/lib/insights/performance";
import { resetDb, seedBrand } from "./helpers";

describe("connecting Google safely", () => {
  it("keeps refresh tokens encrypted, and only this server can read them", () => {
    const sealed = encryptToken("1//refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(decryptToken(sealed)).toBe("1//refresh-token");
    const [iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data, "base64"); flipped[0] ^= 1;
    expect(() => decryptToken([iv, tag, flipped.toString("base64")].join("."))).toThrow(); // changed data is refused
  });

  it("signs who asked to connect which brand, and asks Google for read-only, lasting access", async () => {
    const state = await signState("brand-1", "user-1");
    expect(await readState(state)).toEqual({ brandId: "brand-1", userId: "user-1" });
    await expect(readState(`${state}x`)).rejects.toThrow();
    process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
    const u = new URL(authUrl("https://nomen.example", state));
    expect(u.searchParams.get("redirect_uri")).toBe("https://nomen.example/api/google/callback");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(GOOGLE_SCOPES);
    expect(GOOGLE_SCOPES.filter((s) => s.includes("readonly"))).toHaveLength(2);
  });

  it("tells Google the site's public https address, even behind Render's proxy", () => {
    const req = new Request("http://localhost:10000/api/google/connect", { headers: { host: "localhost:10000", "x-forwarded-proto": "https", "x-forwarded-host": "nomen-s0t8.onrender.com" } });
    expect(publicOrigin(req)).toBe("https://nomen-s0t8.onrender.com");
    expect(publicOrigin(new Request("http://localhost:3013/x"))).toBe("http://localhost:3013");
    expect(redirectTo("/admin/brand?google=connected#google").headers.get("location")).toBe("/admin/brand?google=connected#google");
  });

  it("matches page addresses the way Google reports them", () => {
    expect(normaliseUrl("https://WWW.Shop.com.au/dress-123/?utm=x#top")).toBe("https://www.shop.com.au/dress-123");
    expect(pathOf("https://www.shop.com.au/dress-123/")).toBe("/dress-123");
  });
});

describe("reading Google's replies", () => {
  it("reads Search Console, Analytics and Merchant Center rows, whatever date format each uses", async () => {
    const replies: Record<string, unknown> = {
      searchAnalytics: { rows: [{ keys: ["https://www.shop.com.au/dress-1/", "2026-11-01"], clicks: 3, impressions: 120, position: 8.5 }] },
      runReport: { rows: [{ dimensionValues: [{ value: "/dress-1" }, { value: "20261101" }], metricValues: [{ value: "40" }, { value: "31" }] }] },
      "reports:search": { results: [{ productPerformanceView: { offerId: "SKU-8", date: { year: 2026, month: 11, day: 1 }, impressions: "500", clicks: "7" } }] },
      products: { products: [{ offerId: "SKU-8", productStatus: { destinationStatuses: [{ disapprovedCountries: ["AU"] }], itemLevelIssues: [{ severity: "DISAPPROVED", description: "Missing GTIN", attribute: "gtin" }, { severity: "NOT_IMPACTED", description: "ignore me" }] } }] },
    };
    const seen: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen.push(`${init?.method} ${url}`);
      const key = Object.keys(replies).find((k) => url.includes(k))!;
      return new Response(JSON.stringify(replies[key]), { status: 200 });
    }) as unknown as typeof fetch;
    const g = new LiveGoogleData(async () => "token", fakeFetch);
    expect(await g.searchPages("sc-domain:shop.com.au", "2026-11-01", "2026-11-02")).toEqual([{ url: "https://www.shop.com.au/dress-1", date: "2026-11-01", impressions: 120, clicks: 3, position: 8.5 }]);
    expect(await g.analyticsPaths("properties/1", ["/dress-1"], "2026-11-01", "2026-11-02")).toEqual([{ path: "/dress-1", date: "2026-11-01", views: 40, sessions: 31 }]);
    expect(await g.merchantPerformance("accounts/9", "2026-11-01", "2026-11-02")).toEqual([{ offerId: "SKU-8", date: "2026-11-01", impressions: 500, clicks: 7 }]);
    expect(await g.merchantStatuses("accounts/9")).toEqual([{ offerId: "SKU-8", approved: false, disapproved: true, pending: false, issues: [{ severity: "DISAPPROVED", description: "Missing GTIN", attribute: "gtin" }] }]);
    expect(seen[0]).toBe("POST https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ashop.com.au/searchAnalytics/query");
    expect(seen.some((s) => s.startsWith("POST https://merchantapi.googleapis.com/reports/v1/accounts/9/reports:search"))).toBe(true);
  });

  it("says plainly when the login can't read what was chosen", async () => {
    const g = new LiveGoogleData(async () => "t", (async () => new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 })) as unknown as typeof fetch);
    await expect(g.sites()).rejects.toThrow(/can't read that/);
  });
});

describe("bringing figures in and reading them", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());
  const DAY = 86_400_000;

  async function setup() {
    const { brand, user } = await seedBrand();
    const now = new Date("2026-11-25T03:00:00Z");
    const mk = (name: string, slug: string, liveSince: Date | null) => db.generation.create({ data: {
      brandId: brand.id, userId: user.id, originalInput: { productType: "dress" }, status: "completed", liveUrl: `https://example-brand.com.au/${slug}/`, liveSince, previousTitle: liveSince ? "Old Name Dress" : null,
      result: { recommendation: { recommended_title: name, primary_keyword: "black midi dress" } },
    } });
    const renamed = await mk("Black Ruched Midi Dress", "black-ruched-midi-dress-wedding-guest", new Date(now.getTime() - 20 * DAY));
    for (let i = 0; i < 3; i++) await mk(`Other Dress ${i}`, `other-dress-${i}`, null);
    await db.googleConnection.create({ data: { brandId: brand.id, refreshToken: EXAMPLE_TOKEN, searchConsoleSite: "sc-domain:example-brand.com.au", analyticsProperty: "properties/100000001" } });
    return { brand, renamed, now };
  }

  it("keeps only the brand's own named pieces, by page, and the searches each page shows for", async () => {
    const { brand, renamed, now } = await setup();
    expect((await linkedPieces(brand.id)).map((p) => p.url)).toContain("https://example-brand.com.au/black-ruched-midi-dress-wedding-guest");
    const r = await syncBrand(brand.id, { now });
    expect(r.problems).toEqual([]);
    expect(r.pieces).toBe(4);
    expect(await db.pageMetric.count({ where: { generationId: renamed.id, source: "search_console" } })).toBe(120);
    expect(await db.pageMetric.count({ where: { generationId: renamed.id, source: "analytics" } })).toBe(120);
    expect(await db.pageQuery.count({ where: { generationId: renamed.id } })).toBe(3);
    // Again the next day: recent days are read again, nothing is doubled.
    await syncBrand(brand.id, { now: new Date(now.getTime() + DAY) });
    expect(await db.pageMetric.count({ where: { generationId: renamed.id, source: "search_console" } })).toBe(121);
  });

  it("compares a renamed piece with what its other pages suggest would have happened anyway", async () => {
    const { brand, renamed, now } = await setup();
    await syncBrand(brand.id, { now });
    const p = await performanceData({ brandIds: [brand.id], from: new Date(now.getTime() - 30 * DAY), category: "all", includeTests: false, now });
    expect(p.pieces).toBe(4);
    expect(p.totals.impressions).toBeGreaterThan(0);
    const b = p.beforeAfter.find((x) => x.id === renamed.id)!;
    expect(b).toMatchObject({ days: 20, method: "other pages", previousTitle: "Old Name Dress" }); // live 20 days ago, figures to yesterday
    expect(b.after.impressions).toBeGreaterThan(b.before.impressions); // the stand-in lifts renamed pages by 30%
    expect(b.expected!.impressions).toBe(b.before.impressions); // the other pages were steady
    expect(b.notes.join(" ")).toMatch(/Only 20 days/);
    expect(p.suggestions.some((s) => s.kind === "missing_phrase" && s.id === renamed.id && /wedding/.test(s.text))).toBe(true);
    expect(p.learning).toMatchObject({ needed: 30, groups: [] }); // too few pieces to say what works
  });

  it("another brand's figures never show", async () => {
    const { brand, now } = await setup();
    await syncBrand(brand.id, { now });
    const other = await db.brand.create({ data: { name: "Other", slug: "other" } });
    const p = await performanceData({ brandIds: [other.id], from: new Date(0), category: "all", includeTests: false, now });
    expect(p.pieces).toBe(0);
    expect(await syncBrand(other.id, { now })).toMatchObject({ problems: ["Google isn't connected."] });
  });
});
