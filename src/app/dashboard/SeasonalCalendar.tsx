"use client";
import { useEffect, useState } from "react";
import { MonthBars } from "@/components/MonthBars";
import { MONTHS } from "@/lib/keywords/seasonal";

type Row = { phrase: string; average: number; months: number[]; season: string | null; rise: number };
type Cal = { rows: Row[]; comingUp: Row[]; inSeason: Row[]; checkedAt: string | null; month: number; example: boolean };
const times = (x: number) => (x > 10 ? "more than 10 times" : `${x} times`);

/** When shoppers search for the season's pieces: what's rising in the next two months, and every phrase's year. */
export default function SeasonalCalendar() {
  const [cal, setCal] = useState<Cal | null>(null);
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    fetch("/api/insights/seasonal").then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) setCal(d as Cal); else setErr(d.error ?? "The seasonal figures didn't load."); }).catch(() => setErr("The seasonal figures didn't load."));
  }, []);
  return (
    <section className="dash-section">
      <h2>Seasonal calendar</h2>
      {!cal && !err && <p className="muted">Loading Google&apos;s monthly figures…</p>}
      {err && <p className="muted">{err}</p>}
      {cal && (<>
        <p className="muted">When Australian shoppers search for the season&apos;s and occasions&apos; pieces, from Google&apos;s figures for the last three years{cal.checkedAt ? `, checked ${new Date(cal.checkedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}.{cal.example ? " These are example figures in this preview version." : ""}</p>
        <h3 className="small-head">In season now ({MONTHS[cal.month]})</h3>
        {cal.inSeason.length === 0 ? <p className="muted small">None of these phrases is at its peak this month.</p> : (
          <ul className="season-list">
            {cal.inSeason.map((r) => <li key={r.phrase}><b>{r.phrase}</b> <MonthBars months={r.months} label={`Searches for ${r.phrase} by month`} /> <span className="muted small">{r.season} · {r.months[cal.month].toLocaleString("en-AU")} searches in a usual {MONTHS[cal.month]}</span></li>)}
          </ul>
        )}
        <h3 className="small-head">Rising in {MONTHS[(cal.month + 1) % 12]} and {MONTHS[(cal.month + 2) % 12]}</h3>
        {cal.comingUp.length === 0 ? <p className="muted small">Nothing rises sharply in the next two months.</p> : (
          <ul className="season-list">
            {cal.comingUp.map((r) => <li key={r.phrase}><b>{r.phrase}</b> <MonthBars months={r.months} label={`Searches for ${r.phrase} by month`} /> <span className="muted small">up to {times(r.rise)} this month&apos;s searches · {Math.max(r.months[(cal.month + 1) % 12], r.months[(cal.month + 2) % 12]).toLocaleString("en-AU")} at its coming peak</span></li>)}
          </ul>
        )}
        <button className="link" onClick={() => setAll((a) => !a)} aria-expanded={all}>{all ? "Hide the full calendar" : `Show all ${cal.rows.length} phrases`}</button>
        {all && (
          <ul className="season-list">
            {cal.rows.map((r) => <li key={r.phrase}><b>{r.phrase}</b> <MonthBars months={r.months} label={`Searches for ${r.phrase} by month`} /> <span className="muted small">{r.season ?? "Steady all year"} · {r.average.toLocaleString("en-AU")} a month on average</span></li>)}
          </ul>
        )}
      </>)}
    </section>
  );
}
