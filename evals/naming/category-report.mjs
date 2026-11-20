// Is each kind of piece ready? Reads the latest scored run of the naming flow and the product-data flow and, per
// category, scores four things separately (the roadmap's Phase 4.6), against the bar in thresholds.json:
//   classification       the Google category is right                 (data flow: category_right)
//   details              colour, material, pattern, gender and age    (data flow: *_right)
//   naming               the name passes every check                  (data flow: passes, with the keyword list; else naming flow)
//   noUnsupportedClaims  no claim the product's page didn't state     (data flow: no_claims; naming flow: grounded)
// Writes evals/naming/readiness.json: counts and shares only, no product copy, so it can be committed.
//   node evals/naming/category-report.mjs [.claude/hillclimb/naming] [.claude/hillclimb/data]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [namingFlow = ".claude/hillclimb/naming", dataFlow = ".claude/hillclimb/data"] = process.argv.slice(2);
const { minCases, bars } = JSON.parse(readFileSync("evals/naming/thresholds.json", "utf8"));
// The categories a shopper would know, from the test products' groups (edge cases are kept apart).
const CATEGORY = { dresses: "Dresses", tops: "Tops", shirts: "Tops", tees: "Tops", knitwear: "Knitwear", pants: "Pants and jeans", jeans: "Pants and jeans", shorts: "Shorts and skirts", skirts: "Shorts and skirts", jackets: "Jackets", bags: "Bags", jewellery: "Jewellery", shoes: "Shoes", swimwear: "Swimwear", activewear: "Activewear", lingerie: "Lingerie", accessories: "Accessories", edge: "Edge cases" };

// The latest full run: a few-case spot check after a fix doesn't speak for a whole category.
const latest = (flow) => {
  if (!existsSync(flow)) return { variant: null, rows: [] };
  const read = (v) => { const f = join(flow, v, "results.jsonl"); return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.status === "ok" && r.rep === 0) : []; };
  const runs = readdirSync(flow).filter((d) => /^(baseline|v\d+)$/.test(d)).sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : +a.slice(1) - +b.slice(1))).map((v) => ({ variant: v, rows: read(v) }));
  const most = Math.max(0, ...runs.map((r) => r.rows.length));
  const full = runs.findLastIndex((r) => r.rows.length >= most * 0.8);
  if (full < 0) return { variant: null, rows: [] };
  // A later re-run of some cases (after a fix) replaces those cases' results; the rest stay from the full run.
  const byCase = new Map(runs[full].rows.map((r) => [r.prompt_id, r]));
  const later = runs.slice(full + 1).filter((r) => r.rows.length);
  for (const r of later) for (const row of r.rows) byCase.set(row.prompt_id, row);
  return { variant: [runs[full].variant, ...later.map((r) => r.variant)].join(" + "), rows: [...byCase.values()] };
};
const naming = latest(namingFlow), data = latest(dataFlow);
const share = (xs) => { const s = xs.filter((x) => x === 0 || x === 1); return s.length ? { share: s.reduce((a, b) => a + b, 0) / s.length, n: s.length } : null; };
const cat = (r) => CATEGORY[r.tags?.[0]] ?? CATEGORY[(r.prompt_id ?? "").split("-")[0]] ?? "Other";

const names = [...new Set([...naming.rows, ...data.rows].map(cat))].sort();
const report = names.map((name) => {
  const n = naming.rows.filter((r) => cat(r) === name), d = data.rows.filter((r) => cat(r) === name);
  const scores = {
    classification: share(d.map((r) => r.grade?.category_right)),
    details: share(d.flatMap((r) => ["colour_right", "material_right", "pattern_right", "audience_right"].map((m) => r.grade?.[m]))),
    // The product-data flow also scores every name, with the brand's keyword list, as the live site names: it wins when it has the category.
    naming: share((d.some((r) => r.grade?.passes != null) ? d : n).map((r) => r.grade?.passes)),
    noUnsupportedClaims: share([...d.map((r) => r.grade?.no_claims), ...n.map((r) => r.grade?.grounded)]),
  };
  const cases = Math.max(n.length, d.length);
  const below = Object.entries(scores).filter(([k, s]) => !s || s.share < bars[k]).map(([k]) => k);
  const status = name === "Edge cases" ? "edge" : cases < minCases ? "too_few" : below.length ? "below_bar" : "ready";
  return { category: name, cases, scores, status, below };
});

const pct = (s) => (s ? `${Math.round(s.share * 100)}% (${s.n})` : "-");
const WORD = { ready: "Ready", too_few: `Not enough checked products (needs ${minCases})`, below_bar: "Below the bar", edge: "Edge cases (not a category)" };
console.log(`Naming run: ${naming.variant ?? "none"} · product data run: ${data.variant ?? "none"} · bar: classification ${bars.classification * 100}%, details ${bars.details * 100}%, naming ${bars.naming * 100}%, claims ${bars.noUnsupportedClaims * 100}%`);
for (const r of report) console.log(`${r.category.padEnd(18)} ${String(r.cases).padStart(3)} cases · category ${pct(r.scores.classification).padEnd(10)} details ${pct(r.scores.details).padEnd(11)} naming ${pct(r.scores.naming).padEnd(10)} claims ${pct(r.scores.noUnsupportedClaims).padEnd(10)} → ${WORD[r.status]}${r.status === "below_bar" ? `: ${r.below.join(", ")}` : ""}`);
writeFileSync("evals/naming/readiness.json", JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), runs: { naming: naming.variant, data: data.variant }, minCases, bars, categories: report }, null, 2) + "\n");
