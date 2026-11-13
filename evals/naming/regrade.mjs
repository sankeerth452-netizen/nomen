// Re-apply the free checks (outcome, invented words, length, honest reason) to answers already on disk, after a fix to
// those checks. The judge's verdicts are kept as they are (no paid calls). Marks each row meta.regraded.
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
  const g = { ...free.grade, faithful: r.grade.faithful, natural: r.grade.natural };
  if (c.expect === "name" && g.right_outcome) g.passes = g.faithful == null ? null : (g.grounded && g.fits && g.faithful && g.natural ? 1 : 0);
  const explanation = { ...free.explanation, ...(r.explanation?.faithful ? { faithful: r.explanation.faithful } : {}), ...(r.explanation?.natural ? { natural: r.explanation.natural } : {}) };
  if (JSON.stringify(g) !== JSON.stringify(r.grade)) changed++;
  Object.assign(r, { grade: g, explanation, meta: { ...(r.meta ?? {}), regraded: new Date().toISOString().slice(0, 10) } });
}
writeFileSync(file + ".tmp", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
renameSync(file + ".tmp", file);
console.log(`${rows.length} rows re-scored, ${changed} changed`);
