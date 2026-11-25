"use client";
import { useRouter } from "next/navigation";

const PERIODS: [string, string][] = [["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["all", "All time"]];

/** Period, category, brand (owner) and tests: each change reloads the dashboard with the new filter in the address. */
export default function DashboardFilters({ period, category, categories, includeTests, brands, brand }: { period: string; category: string; categories: string[]; includeTests: boolean; brands: { id: string; name: string }[]; brand: string }) {
  const router = useRouter();
  const go = (change: Record<string, string>) => {
    const p = new URLSearchParams({ period, category, ...(includeTests ? { tests: "1" } : {}), ...(brand ? { brand } : {}), ...change });
    for (const [k, v] of [...p]) if (!v || (k === "category" && v === "all") || (k === "tests" && v === "0")) p.delete(k);
    router.push(`/dashboard?${p.toString()}`);
  };
  return (
    <div className="dash-filters">
      {brands.length > 0 && (
        <label>Brand<select value={brand} onChange={(e) => go({ brand: e.target.value })}><option value="">Every brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      )}
      <label>Period<select value={period} onChange={(e) => go({ period: e.target.value })}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Category<select value={category} onChange={(e) => go({ category: e.target.value })}><option value="all">Every category</option>{[...new Set([...categories, ...(category !== "all" ? [category] : [])])].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={includeTests} onChange={(e) => go({ tests: e.target.checked ? "1" : "0" })} /> Include tests</label>
    </div>
  );
}
