// Every metric for every variant of an eval flow, plus what it cost. The lite report shows only the headline metric.
//   node evals/naming/summarise.mjs .claude/hillclimb/naming [--fails]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const flow = process.argv[2];
const showFails = process.argv.includes("--fails");
// US$ per million tokens in / out; cached reads are 5% of the input price on Opus 5.5, 10% elsewhere; cache writes 125%.
const PRICE = { "claude-opus-5-5": [4, 20, 0.05], "claude-sonnet-5-5": [2, 10, 0.1], "claude-haiku-5-5": [0.1, 0.5, 0.1] };
const priced = (model, input, output, cacheRead = 0, cacheWrite = 0) => {
  const p = PRICE[model];
  return p ? (input * p[0] + output * p[1] + cacheRead * p[0] * p[2] + cacheWrite * p[0] * 1.25) / 1e6 : 0;
};
const usd = (model, u, byModel) => byModel
  ? Object.entries(byModel).reduce((a, [m, t]) => a + priced(m, t.input, t.output, t.cacheRead, t.cacheWrite), 0) // exact, per step
  : u ? priced(model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens) : 0;
const state = JSON.parse(readFileSync(join(flow, "_state.json"), "utf8"));
const metrics = state.metrics.map((m) => m.id);
const rows = (v, f) => existsSync(join(flow, v, f)) ? readFileSync(join(flow, v, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const pct = (xs) => { const s = xs.filter((x) => x != null); return s.length ? `${Math.round((100 * s.reduce((a, b) => a + b, 0)) / s.length)}% (${s.reduce((a, b) => a + b, 0)}/${s.length})` : "-"; };

const variants = readdirSync(flow).filter((d) => /^(baseline|v\d+)$/.test(d)).sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : +a.slice(1) - +b.slice(1)));
for (const v of variants) {
  const rs = rows(v, "results.jsonl").filter((r) => r.status === "ok");
  const errs = rows(v, "errors.jsonl");
  const claude = rs.reduce((a, r) => a + usd(r.model, r.usage, r.usage_by_model), 0) + errs.reduce((a, r) => a + usd(r.model, r.usage), 0);
  const judge = rs.reduce((a, r) => a + usd(r.judge_model, r.judge_usage), 0);
  const google = rs.reduce((a, r) => a + (r.google_usd ?? 0), 0);
  console.log(`\n== ${v}: ${rs.length} scored, ${errs.length} failed attempts · cost US$${(claude + judge + google).toFixed(2)} (Nomen's Claude ${claude.toFixed(2)}, judge ${judge.toFixed(2)}, Google ${google.toFixed(3)}) · prompts ${[...new Set(rs.map((r) => r.prompt_versions?.recommend))].join(",")}`);
  for (const m of metrics) console.log(`  ${m.padEnd(14)} ${pct(rs.map((r) => r.grade?.[m]))}`);
  const groups = [...new Set(rs.map((r) => r.tags?.[0]))];
  for (const head of ["passes", "data_passes"].filter((m) => metrics.includes(m)))
    console.log(`  by group (${head}):`, groups.map((g) => `${g} ${pct(rs.filter((r) => r.tags?.[0] === g).map((r) => r.grade?.[head]))}`).join(" · "));
  if (showFails) for (const r of rs) {
    const bad = metrics.filter((m) => r.grade?.[m] === 0 && m !== "passes");
    if (bad.length) console.log(`  - ${r.prompt_id} rep${r.rep} "${r.output?.title ?? r.output?.status}": ${bad.map((m) => `${m}: ${r.explanation?.[m] ?? ""}`).join(" | ")}`);
  }
  for (const e of errs) console.log(`  ! ${e.prompt_id} rep${e.rep} ${e.failure_class}: ${e.error.slice(0, 160)}`);
}

// Before vs after, one try per case (rep 0) so a case run twice in the pilot doesn't count double.
const last = variants.at(-1);
const first = (v) => new Map(rows(v, "results.jsonl").filter((r) => r.status === "ok" && r.rep === 0).map((r) => [r.prompt_id, r]));
for (const prev of [...new Set(["baseline", variants.at(-2)])].filter((v) => v && v !== last)) {
  const a = first(prev), b = first(last);
  const ids = [...a.keys()].filter((id) => b.has(id));
  console.log(`\n== ${prev} vs ${last}, first try per case (${ids.length} cases in both)`);
  for (const m of metrics) console.log(`  ${m.padEnd(14)} ${pct(ids.map((id) => a.get(id).grade?.[m])).padEnd(14)} -> ${pct(ids.map((id) => b.get(id).grade?.[m]))}`);
  const show = (r) => r.output?.title ?? `(${r.output?.status}${r.output?.message ? `: ${r.output.message}` : ""})`;
  for (const id of ids) {
    const before = a.get(id).grade?.passes, after = b.get(id).grade?.passes;
    if (before !== after) console.log(`  ${after > before ? "+" : "-"} ${id}: ${show(a.get(id))}  ->  ${show(b.get(id))}`);
  }
}
