import Link from "next/link";
import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import { dashboardData, PERIODS, type Period } from "@/lib/insights/dashboard";
import { namingGaps } from "@/lib/insights/competitors";
import { MonthBars } from "@/components/MonthBars";
import DashboardFilters from "./DashboardFilters";
import SeasonalCalendar from "./SeasonalCalendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const PERIOD_LABEL: Record<Period, string> = { "7d": "the last 7 days", "30d": "the last 30 days", "90d": "the last 90 days", all: "all time" };
const SCORE_LABEL: Record<string, string> = { classification: "Google category", details: "Details", naming: "Name", noUnsupportedClaims: "No unsupported claims" };
const usd = (v: number | null) => (v == null ? "–" : v < 0.1 && v > 0 ? `US$${v.toFixed(3)}` : `US$${v.toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
const secs = (s: number | null) => (s == null ? "–" : s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes`);

// What Nomen has done for a brand, how good it is, and what it cost: from real records only, tests left out unless
// asked for. Brand admins see their brand; the owner can pick one or see every brand.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; category?: string; tests?: string; brand?: string }> }) {
  const user = await requirePageUser("admin");
  const q = await searchParams;
  const period = (q.period && q.period in PERIODS ? q.period : "30d") as Period;
  const brands = user.role === "owner" ? await db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const brandIds = user.role === "owner" ? (q.brand && brands.some((b) => b.id === q.brand) ? [q.brand] : null) : [user.brandId!];
  const includeTests = q.tests === "1";
  const category = q.category || "all";
  const d = await dashboardData({ brandIds, period, category, includeTests });
  const gaps = await namingGaps({ brandIds, from: PERIODS[period] ? new Date(Date.now() - PERIODS[period]! * 86_400_000) : new Date(0), includeTests });
  const shownGaps = category === "all" ? gaps : gaps.filter((g) => g.category === category);
  const maxDay = Math.max(0.0001, ...d.spend.byDay.map((x) => x.usd));
  const maxOp = Math.max(0.0001, ...d.spend.byOperation.map((x) => x.usd));
  const w = d.work;

  return (
    <>
      <Header user={user} active="dashboard" />
      <main className="dashboard">
        <div className="page-head">
          <div>
            <span className="eyebrow">How Nomen is doing</span>
            <h1>Dash<em>board</em></h1>
            <p>What&apos;s been named, how good it is and what it cost, over {PERIOD_LABEL[period]}{category !== "all" ? `, for ${category.toLowerCase()}` : ""}. Every figure comes from real records.</p>
          </div>
        </div>
        <DashboardFilters period={period} category={category} categories={d.categories} includeTests={includeTests} brands={brands} brand={q.brand ?? ""} />
        {d.testsLeftOut > 0 && <p className="muted small">{d.testsLeftOut} {d.testsLeftOut === 1 ? "piece marked as a test is" : "pieces marked as tests are"} left out.</p>}

        <section className="dash-section">
          <h2>Work done</h2>
          <div className="stat-grid">
            <Stat n={w.named} label="Named" />
            <Stat n={w.toReview} label="Waiting for review" />
            <Stat n={w.approved} label="Approved" />
            <Stat n={w.rejected} label="Rejected" />
            <Stat n={w.needsDetail} label="Asked for a detail" />
            <Stat n={w.failed} label="Didn't work" />
          </div>
          <p className="muted">A name usually takes {secs(w.medianSeconds)} (average {secs(w.averageSeconds)}).{w.inProgress ? ` ${w.inProgress} still in progress.` : ""}</p>
        </section>

        <section className="dash-section">
          <h2>Ranges</h2>
          <p className="muted">{d.ranges.count} {d.ranges.count === 1 ? "range" : "ranges"} with {d.ranges.pieces} pieces: {d.ranges.named} named{d.ranges.failed ? `, ${d.ranges.failed} didn't work` : ""}.</p>
          {d.ranges.recent.length > 0 && (
            <ul className="dash-list">
              {d.ranges.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/ranges/${r.id}`}>{r.title}</Link>{r.isTest && <span className="muted"> · test</span>}
                  <span className="muted"> · {r.named} of {r.pieces} named{r.failed ? `, ${r.failed} didn't work` : ""}{r.minutes ? ` · ${r.minutes} min` : ""} · {usd(r.costUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-section">
          <h2>Quality in live use</h2>
          <div className="stat-grid">
            <Stat text={pct(d.quality.high)} label="High confidence" />
            <Stat text={pct(d.quality.correctionRate)} label={`Changed by people (${d.quality.corrected} of ${d.quality.reviewed})`} />
            <Stat n={d.quality.flaggedMistakes} label="Flagged as AI mistakes" />
            <Stat n={d.quality.duplicates} label="Share a name with another piece" />
          </div>
          <p className="muted">
            Confidence: {pct(d.quality.high)} high, {pct(d.quality.medium)} medium, {pct(d.quality.low)} low.
            {d.quality.mostChanged.length > 0 && <> Most changed: {d.quality.mostChanged.map((m) => `${m.field} (${m.n})`).join(", ")}.</>}
            {d.quality.pageHeldBack + d.quality.dataHeldBack > 0 && <> Held back for stating something not in the facts: {d.quality.pageHeldBack} product pages, {d.quality.dataHeldBack} product data.</>}
            {d.quality.withPhotoProblems > 0 && <> {d.quality.withPhotoProblems} named pieces have a photo problem.</>}
          </p>
        </section>

        <section className="dash-section">
          <h2>Checked test set <span className="muted small">(test products, not live work)</span></h2>
          <p className="muted small">From the quality test of {new Date(`${d.testSet.checkedAt}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. A category counts as ready once it clears the bar on at least {d.testSet.minCases} checked products: Google category {pct(d.testSet.bars.classification)}, details {pct(d.testSet.bars.details)}, name {pct(d.testSet.bars.naming)}, no unsupported claims {pct(d.testSet.bars.noUnsupportedClaims)}.</p>
          <div className="table-wrap"><table className="dash-table">
            <thead><tr><th>Category</th><th>Checked products</th>{Object.values(SCORE_LABEL).map((l) => <th key={l}>{l}</th>)}<th>Ready?</th></tr></thead>
            <tbody>
              {d.testSet.categories.filter((c) => c.status !== "edge").map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td><td>{c.cases}</td>
                  {Object.keys(SCORE_LABEL).map((k) => <td key={k}>{c.scores[k] ? `${pct(c.scores[k]!.share)}` : "–"}</td>)}
                  <td>{c.status === "ready" ? "Ready" : c.status === "too_few" ? `Needs ${d.testSet.minCases - c.cases} more` : "Below the bar"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        <section className="dash-section">
          <h2>Spend</h2>
          <div className="stat-grid">
            <Stat text={usd(d.spend.total)} label="Total" />
            <Stat text={usd(d.spend.perNamed)} label="Per named piece" />
            <Stat text={usd(d.spend.claude)} label="Claude (AI)" />
            <Stat text={usd(d.spend.google)} label="Google figures and results" />
          </div>
          {d.spend.byOperation.length > 0 && (
            <ul className="bar-list">
              {d.spend.byOperation.map((o) => <li key={o.label}><span>{o.label}</span><span className="bar"><span style={{ width: `${Math.max(2, (o.usd / maxOp) * 100)}%` }} /></span><span>{usd(o.usd)}</span></li>)}
            </ul>
          )}
          {d.spend.byDay.length > 1 && (
            <div className="day-bars" role="img" aria-label="Spend by day">
              {d.spend.byDay.map((x) => <span key={x.day} title={`${x.day}: ${usd(x.usd)}`} style={{ height: `${Math.max(3, (x.usd / maxDay) * 100)}%` }} />)}
            </div>
          )}
          {d.spend.byDay.length > 1 && <p className="muted small">Spend by day, {day(d.spend.byDay[0].day)} to {day(d.spend.byDay.at(-1)!.day)} (days with no spend left out).</p>}
          {d.spend.byBrand.length > 1 && <p className="muted">By brand: {d.spend.byBrand.map((b) => `${b.name} ${usd(b.usd)}`).join(" · ")}</p>}
          <p className="muted small">At the providers&apos; list prices: Claude per word read and written, Google figures and results as charged.{d.spend.backfilledShare > 0 ? ` ${pct(d.spend.backfilledShare)} of this is from pieces named before spend was split by step, shown as "Earlier products".` : ""}</p>
        </section>

        <section className="dash-section">
          <h2>Search performance</h2>
          <p className="muted">Clicks, impressions, position and sales per product appear here once Google Search Console and Google Analytics are connected (the next milestone).</p>
        </section>

        <SeasonalCalendar />

        <section className="dash-section">
          <h2>Naming gaps</h2>
          <p className="muted">Words other shops&apos; product titles use for these pieces that your names rarely do, from the Google results Nomen saved when naming them. Use one only when it&apos;s true of the piece, and never copy another shop&apos;s name.</p>
          {shownGaps.length === 0 && <p className="muted">Not enough other shops&apos; products in the saved Google results yet. This fills in as more pieces are named.</p>}
          {shownGaps.map((c) => (
            <div key={c.category} className="card gap-card">
              <h3>{c.category}</h3>
              <p className="muted small">{c.theirResults} other shops&apos; products from {c.shops} shops, against your {c.ourNames} {c.ourNames === 1 ? "name" : "names"}.</p>
              {c.gaps.length === 0 ? <p className="muted small">Your names already use the words other shops use most.</p> : (
                <ul className="gap-list">
                  {c.gaps.map((g) => (
                    <li key={g.term}>
                      <b>{g.term}</b> · {pct(g.theirShare)} of their titles ({g.theirCount}), {pct(g.ourShare)} of yours ({g.ourCount})
                      <span className="muted small"> · {g.shops.join(", ")} · e.g. &ldquo;{g.examples[0]?.title}&rdquo; ({g.examples[0]?.domain}) · from searches like &ldquo;{g.searches[0]}&rdquo;</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
        <p className="muted small dash-foot">Example: <MonthBars months={[1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 6, 7]} label="An example of searches by month" /> means searches rise from September and peak in November and December.</p>
      </main>
      <Footer />
    </>
  );
}

function Stat({ n, text, label }: { n?: number; text?: string; label: string }) {
  return <div className="stat"><span className="stat-n">{text ?? (n ?? 0).toLocaleString("en-AU")}</span><span className="stat-l">{label}</span></div>;
}
