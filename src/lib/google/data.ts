// Reading a brand's own Google figures: Search Console (searches, impressions, clicks, position per page), Analytics 4
// (views and sessions per page; views, add-to-carts, purchases and revenue per product by SKU) and Merchant Center
// (Shopping impressions and clicks per SKU, and each product's approval). Read-only. A stand-in gives example
// figures in the preview version, so every screen can be checked without a Google account.
import { GoogleError } from "./oauth";

export type Day = string; // YYYY-MM-DD
export type PageDay = { url: string; date: Day; impressions: number; clicks: number; position: number | null };
export type PathDay = { path: string; date: Day; views: number; sessions: number };
export type ItemDay = { itemId: string; date: Day; views: number; addToCarts: number; purchases: number; revenue: number };
export type OfferDay = { offerId: string; date: Day; impressions: number; clicks: number };
export type OfferStatus = { offerId: string; approved: boolean; disapproved: boolean; pending: boolean; issues: { severity: string; description: string; attribute: string | null }[] };
export type QueryRow = { query: string; impressions: number; clicks: number; position: number | null };

export interface GoogleData {
  sites(): Promise<{ id: string; label: string }[]>;
  properties(): Promise<{ id: string; label: string }[]>;
  merchants(): Promise<{ id: string; label: string }[]>;
  searchPages(site: string, start: Day, end: Day): Promise<PageDay[]>;
  searchQueries(site: string, url: string, start: Day, end: Day): Promise<QueryRow[]>;
  analyticsPaths(property: string, paths: string[], start: Day, end: Day): Promise<PathDay[]>;
  analyticsItems(property: string, itemIds: string[], start: Day, end: Day): Promise<ItemDay[]>;
  merchantPerformance(account: string, start: Day, end: Day): Promise<OfferDay[]>;
  merchantStatuses(account: string): Promise<OfferStatus[]>;
}

/** A page address as Google reports it and Nomen stores it: no query, no fragment, no trailing slash, lower-case host. */
export function normaliseUrl(u: string): string {
  try { const x = new URL(u.trim()); return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, "")}`; } catch { return u.trim().replace(/[?#].*$/, "").replace(/\/+$/, ""); }
}
export const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, "") || "/"; } catch { return u; } };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const day = (d: unknown): Day => {
  if (typeof d === "string") return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.slice(0, 10); // GA4 sends 20261124
  const o = (d ?? {}) as { year?: number; month?: number; day?: number };
  return `${o.year}-${String(o.month).padStart(2, "0")}-${String(o.day).padStart(2, "0")}`; // Merchant API's date object
};

export class LiveGoogleData implements GoogleData {
  constructor(private token: () => Promise<string>, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(url: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(url, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${await this.token()}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
    if (!res.ok) throw new GoogleError(res.status === 403 ? "Google says this login can't read that. Check it has access to the site, property or account chosen." : `Google: ${j.error?.message ?? res.status}`, res.status);
    return j;
  }

  async sites() {
    const j = await this.call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("https://www.googleapis.com/webmasters/v3/sites");
    return (j.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => ({ id: s.siteUrl, label: s.siteUrl.replace(/^sc-domain:/, "") }));
  }
  async properties() {
    const j = await this.call<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] }>("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
    return (j.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ id: p.property, label: `${p.displayName} (${a.displayName})` })));
  }
  async merchants() {
    const j = await this.call<{ accounts?: { name: string; accountName?: string }[] }>("https://merchantapi.googleapis.com/accounts/v1/accounts?pageSize=250");
    return (j.accounts ?? []).map((a) => ({ id: a.name, label: a.accountName ?? a.name }));
  }

  /** Every page's daily figures for the site (Nomen keeps only its own pieces' pages). */
  async searchPages(site: string, start: Day, end: Day) {
    const out: PageDay[] = [];
    for (let startRow = 0; startRow < 200_000; startRow += 25_000) {
      const j = await this.call<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ["page", "date"], rowLimit: 25_000, startRow, dataState: "final" });
      for (const r of j.rows ?? []) out.push({ url: normaliseUrl(r.keys[0]), date: r.keys[1], impressions: r.impressions, clicks: r.clicks, position: r.position });
      if ((j.rows?.length ?? 0) < 25_000) break;
    }
    return out;
  }
  async searchQueries(site: string, url: string, start: Day, end: Day) {
    const j = await this.call<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 50, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }] });
    return (j.rows ?? []).map((r) => ({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, position: r.position }));
  }
  async analyticsPaths(property: string, paths: string[], start: Day, end: Day) {
    if (!paths.length) return [];
    const j = await this.call<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }>(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "pagePath" }, { name: "date" }], metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
      dimensionFilter: { filter: { fieldName: "pagePath", inListFilter: { values: paths.slice(0, 1000) } } }, limit: 100_000,
    });
    return (j.rows ?? []).map((r) => ({ path: r.dimensionValues[0].value.replace(/\/+$/, "") || "/", date: day(r.dimensionValues[1].value), views: num(r.metricValues[0].value), sessions: num(r.metricValues[1].value) }));
  }
  /** Product figures by SKU (GA4's item ID), where the site sends ecommerce events. */
  async analyticsItems(property: string, itemIds: string[], start: Day, end: Day) {
    if (!itemIds.length) return [];
    const j = await this.call<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }>(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "itemId" }, { name: "date" }], metrics: [{ name: "itemsViewed" }, { name: "itemsAddedToCart" }, { name: "itemsPurchased" }, { name: "itemRevenue" }],
      dimensionFilter: { filter: { fieldName: "itemId", inListFilter: { values: itemIds.slice(0, 1000) } } }, limit: 100_000,
    });
    return (j.rows ?? []).map((r) => ({ itemId: r.dimensionValues[0].value, date: day(r.dimensionValues[1].value), views: num(r.metricValues[0].value), addToCarts: num(r.metricValues[1].value), purchases: num(r.metricValues[2].value), revenue: num(r.metricValues[3].value) }));
  }
  async merchantPerformance(account: string, start: Day, end: Day) {
    const out: OfferDay[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 20; i++) {
      const j = await this.call<{ results?: { productPerformanceView?: { offerId?: string; date?: unknown; impressions?: unknown; clicks?: unknown } }[]; nextPageToken?: string }>(`https://merchantapi.googleapis.com/reports/v1/${account}/reports:search`, {
        query: `SELECT offer_id, date, impressions, clicks FROM product_performance_view WHERE date BETWEEN '${start}' AND '${end}'`, pageSize: 100_000, ...(pageToken ? { pageToken } : {}),
      });
      for (const r of j.results ?? []) { const v = r.productPerformanceView; if (v?.offerId) out.push({ offerId: v.offerId, date: day(v.date), impressions: num(v.impressions), clicks: num(v.clicks) }); }
      pageToken = j.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }
  async merchantStatuses(account: string) {
    const out: OfferStatus[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 50; i++) {
      const j = await this.call<{ products?: { offerId?: string; productStatus?: { destinationStatuses?: { approvedCountries?: string[]; pendingCountries?: string[]; disapprovedCountries?: string[] }[]; itemLevelIssues?: { severity?: string; description?: string; attribute?: string }[] } }[]; nextPageToken?: string }>(`https://merchantapi.googleapis.com/products/v1/${account}/products?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const p of j.products ?? []) {
        if (!p.offerId) continue;
        const d = p.productStatus?.destinationStatuses ?? [];
        out.push({
          offerId: p.offerId, approved: d.some((x) => x.approvedCountries?.length), disapproved: d.some((x) => x.disapprovedCountries?.length), pending: d.some((x) => x.pendingCountries?.length),
          issues: (p.productStatus?.itemLevelIssues ?? []).filter((x) => x.severity && x.severity !== "NOT_IMPACTED").map((x) => ({ severity: x.severity!, description: x.description ?? "", attribute: x.attribute ?? null })),
        });
      }
      pageToken = j.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }
}

/** Example figures for the preview version: steady per page, with renamed pages doing a little better afterwards. */
export class MockGoogleData implements GoogleData {
  constructor(private livePages: Map<string, Date | null> = new Map()) {}
  async sites() { return [{ id: "sc-domain:example-brand.com.au", label: "example-brand.com.au (example)" }]; }
  async properties() { return [{ id: "properties/100000001", label: "Example brand website (example)" }]; }
  async merchants() { return [{ id: "accounts/200000001", label: "Example brand shop (example)" }]; }
  private seed(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  private days(start: Day, end: Day): Day[] { const out: Day[] = []; for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10)); return out; }
  private lift(url: string, d: Day) { const since = this.livePages.get(url); return since && new Date(`${d}T00:00:00Z`) >= since ? 1.3 : 1; }
  async searchPages(_site: string, start: Day, end: Day) {
    return [...this.livePages.keys()].flatMap((url) => { const base = 40 + (this.seed(url) % 160); return this.days(start, end).map((date) => { const imp = Math.round(base * this.lift(url, date)); return { url, date, impressions: imp, clicks: Math.round(imp * (0.02 + (this.seed(url) % 30) / 1000) * this.lift(url, date)), position: 8 + (this.seed(url) % 12) }; }); });
  }
  async searchQueries(_site: string, url: string) {
    const words = url.split("/").pop()?.split("-").filter((w) => /^[a-z]+$/.test(w)) ?? [];
    return [{ query: words.slice(-3).join(" "), impressions: 420, clicks: 18, position: 7.2 }, { query: `${words.slice(-2).join(" ")} australia`, impressions: 160, clicks: 4, position: 11.5 }, { query: `${words.at(-1) ?? "dress"} for wedding guest`, impressions: 95, clicks: 1, position: 14 }];
  }
  async analyticsPaths(_p: string, paths: string[], start: Day, end: Day) { return paths.flatMap((path) => this.days(start, end).map((date) => ({ path, date, views: 20 + (this.seed(path) % 40), sessions: 15 + (this.seed(path) % 30) }))); }
  async analyticsItems(_p: string, itemIds: string[], start: Day, end: Day) { return itemIds.flatMap((itemId) => this.days(start, end).map((date) => ({ itemId, date, views: 10, addToCarts: 1 + (this.seed(itemId + date) % 3), purchases: this.seed(itemId + date) % 5 === 0 ? 1 : 0, revenue: this.seed(itemId + date) % 5 === 0 ? 79.95 : 0 }))); }
  async merchantPerformance() { return []; }
  async merchantStatuses() { return []; }
}
