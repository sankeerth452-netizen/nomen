import Link from "next/link";
import type { Performance, Totals } from "@/lib/insights/performance";

type Conn = { brandId: string; lastSyncAt: Date | null; lastSyncError: string | null; searchConsoleSite: string | null; analyticsProperty: string | null; merchantAccount: string | null };
const n = (v: number) => v.toLocaleString("en-AU");
const pct = (v: number | null, dp = 1) => (v == null ? "–" : `${(v * 100).toFixed(dp)}%`);
const aud = (v: number) => `$${v.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const KIND: Record<string, string> = { low_ctr: "Seen a lot, clicked little", losing: "Losing visibility", missing_phrase: "A search the name doesn't say", strong: "Worth learning from", shopping: "Google Shopping" };

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="stat"><span className="stat-n">{value}</span><span className="stat-l">{label}</span></div>;
}
// Only the figures a piece has: one matched by SKU alone has sales but no search figures.
const line = (t: Totals) => [
  t.impressions ? `seen ${n(t.impressions)} times, ${n(t.clicks)} clicks (${pct(t.ctr)})${t.position != null ? `, position ${t.position.toFixed(1)}` : ""}` : "",
  !t.impressions && t.views ? `${n(t.views)} views` : "",
  t.purchases ? `${n(t.purchases)} sold` : "",
].filter(Boolean).join(", ") || "no figures yet";

/** How named pieces do in Google: from the brand's own Search Console, Analytics and Merchant Center. */
export default function SearchPerformance({ perf, connections, period }: { perf: Performance; connections: Conn[]; period: string }) {
  const chosen = connections.filter((c) => c.searchConsoleSite || c.analyticsProperty || c.merchantAccount);
  const t = perf.totals;
  return (
    <section className="dash-section">
      <h2>Search performance</h2>
      {!connections.length ? (
        <p className="muted">Connect your Google Search Console, Analytics and Merchant Center on the <Link href="/admin/brand#google">Brand page</Link> to see impressions, clicks, views and sales for each named piece here.</p>
      ) : !chosen.length ? (
        <p className="muted">Google is connected. Choose a site, property or account on the <Link href="/admin/brand#google">Brand page</Link> to start bringing figures in.</p>
      ) : !perf.pieces ? (
        <p className="muted">Connected. Figures appear once named pieces are matched to their pages: a product file&apos;s links do it, or add the page address on a piece&apos;s Review page.{chosen.some((c) => c.lastSyncError) ? ` Last update: ${chosen.find((c) => c.lastSyncError)?.lastSyncError}` : ""}</p>
      ) : (<>
        <p className="muted small">{perf.pieces} named {perf.pieces === 1 ? "piece" : "pieces"} with Google figures, over {period}. From your own Google accounts{chosen[0]?.lastSyncAt ? `, updated ${new Date(chosen[0].lastSyncAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}.</p>
        <div className="stat-grid">
          <Stat value={n(t.impressions)} label="Seen in Google" />
          <Stat value={n(t.clicks)} label={`Clicks (${pct(t.ctr)})`} />
          <Stat value={t.position != null ? t.position.toFixed(1) : "–"} label="Average position" />
          <Stat value={n(t.views)} label="Page views" />
          <Stat value={n(t.purchases)} label={`Sold${t.conversion != null ? ` (${pct(t.conversion)} of visits)` : ""}`} />
          <Stat value={aud(t.revenue)} label="Revenue" />
          {t.shopImpressions > 0 && <Stat value={n(t.shopClicks)} label={`Shopping clicks (${n(t.shopImpressions)} seen)`} />}
        </div>
        {perf.top.length > 0 && (<>
          <h3 className="small-head">Most clicked</h3>
          <ul className="dash-list">{perf.top.map((p) => <li key={p.id}><Link href={`/review/${p.id}`}>{p.name}</Link><span className="muted"> · {line(p)}</span></li>)}</ul>
        </>)}

        <h3 className="small-head">Before and after the new name</h3>
        {perf.beforeAfter.length === 0 ? <p className="muted small">Shows once a piece&apos;s page has had its new name for a week. Add the date it went live on the piece&apos;s Review page.</p> : (
          <ul className="ba-list">
            {perf.beforeAfter.map((b) => {
              const extra = b.expected ? b.after.clicks - b.expected.clicks : null;
              return (
                <li key={b.id} className="card">
                  <Link href={`/review/${b.id}`}><b>{b.name}</b></Link>{b.previousTitle && <span className="muted small"> · was &ldquo;{b.previousTitle}&rdquo;</span>}
                  <p className="small">Live since {b.liveSince.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. {b.days} days before: {line(b.before)}. {b.days} days after: {line(b.after)}.</p>
                  {b.expected && extra != null && (
                    <p className="small">Expected anyway ({b.method === "other pages" ? "from how your other pages of this kind changed" : "from Google's seasonal search figures"}): about {n(b.expected.impressions)} seen and {n(b.expected.clicks)} clicks. So <b>{extra >= 0 ? `${n(extra)} more` : `${n(-extra)} fewer`} clicks than expected</b>{b.expected.clicks ? ` (${extra >= 0 ? "+" : ""}${Math.round((extra / b.expected.clicks) * 100)}%)` : ""}.</p>
                  )}
                  {b.notes.map((x) => <p key={x} className="muted small">{x}</p>)}
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted small">A change after a new name isn&apos;t all down to the name: stock, promotions, price and Google itself move results too. Nomen compares with what was likely to happen anyway and says how.</p>

        <h3 className="small-head">Suggestions</h3>
        {perf.suggestions.length === 0 ? <p className="muted small">Nothing stands out in the last 28 days.</p> : (
          <ul className="dash-list">{perf.suggestions.map((s, i) => <li key={`${s.id}${s.kind}${i}`}><span className="muted small">{KIND[s.kind]} · </span><Link href={`/review/${s.id}`}>{s.name}</Link>: {s.text}</li>)}</ul>
        )}

        <h3 className="small-head">What works for your names</h3>
        {perf.learning.groups.length === 0 ? <p className="muted small">Shows once at least {perf.learning.needed} named pieces have been seen in Google 100 times or more in 90 days (now {perf.learning.seen}).</p> : (
          <ul className="dash-list">{perf.learning.groups.map((g, i) => <li key={i}>{g.map((x) => `${x.label}: ${pct(x.ctr)} clicked (${x.n} pieces)`).join(" · ")}</li>)}</ul>
        )}
      </>)}
    </section>
  );
}
