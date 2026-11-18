// Re-apply the free checks (outcome, invented words, length, honest reason, product data) to answers already on disk,
// after a fix to those checks. The judges' verdicts are kept as they are (no paid calls). Marks each row meta.regraded.
//   npx tsx evals/naming/regrade.mjs .claude/hillclimb/naming/baseline
// With --judge, the judge runs again too (paid, about a third of a cent per name; needs EVAL_JUDGE_MODEL). The rows
// before re-judging are kept beside the results as results.before-rejudge.jsonl.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { grade } from "./grade.mjs";

const dir = process.argv[2];
const rejudge = process.argv.includes("--judge");
if (rejudge && !process.env.EVAL_JUDGE_MODEL) throw new Error("--judge needs EVAL_JUDGE_MODEL");
const cases = new Map(JSON.parse(readFileSync("evals/naming/cases.json", "utf8")).map((c) => [c.id, c]));
const file = join(dir, "results.jsonl");
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let changed = 0;
if (rejudge && !existsSync(join(dir, "results.before-rejudge.jsonl"))) copyFileSync(file, join(dir, "results.before-rejudge.jsonl"));
if (!rejudge) copyFileSync(file, join(dir, "results.before-regrade.jsonl")); // the last free re-score can always be undone
for (const r of rows) {
  const c = cases.get(r.meta?.original_id ?? r.prompt_id);
  if (!c || !r.output) continue;
  if (rejudge) {
    const full = await grade(c, r.output);
    if (JSON.stringify(full.grade) !== JSON.stringify(r.grade)) changed++;
    Object.assign(r, { grade: full.grade, explanation: full.explanation, judge_model: full.judge_model ?? r.judge_model, judge_usage: full.judge_usage ?? r.judge_usage, meta: { ...(r.meta ?? {}), rejudged: new Date().toISOString().slice(0, 10) } });
    continue;
  }
  const free = await grade(c, r.output, "");
  // The judges' verdicts stay as they were (a hard rule can still fail "Ideal for" without the judge).
  const g = { ...free.grade, faithful: r.grade.faithful, natural: r.grade.natural, data_faithful: r.grade.data_faithful ?? null,
    ideal_for_right: free.grade.ideal_for_right === 0 ? 0 : r.grade.ideal_for_right ?? null };
  if (c.expect === "name" && g.right_outcome) g.passes = g.faithful == null ? null : (g.grounded && g.fits && g.faithful && g.natural && g.audience_named !== 0 ? 1 : 0);
  if (g.data_ready === 1) {
    const parts = ["category_right", "colour_right", "material_right", "audience_right", "fits_google", "no_claims", "data_faithful", "ideal_for_right"];
    g.data_passes = g.data_faithful == null ? null : parts.every((m) => g[m]) && g.pattern_right !== 0 ? 1 : 0;
  }
  const judged = ["faithful", "natural", "data_faithful", "ideal_for_right"].filter((k) => r.explanation?.[k] && !free.explanation[k]);
  const explanation = { ...free.explanation, ...Object.fromEntries(judged.map((k) => [k, r.explanation[k]])) };
  if (JSON.stringify(g) !== JSON.stringify(r.grade)) changed++;
  Object.assign(r, { grade: g, explanation, meta: { ...(r.meta ?? {}), regraded: new Date().toISOString().slice(0, 10) } });
}
writeFileSync(file + ".tmp", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
renameSync(file + ".tmp", file);
console.log(`${rows.length} rows re-scored, ${changed} changed`);
