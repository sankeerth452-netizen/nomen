// Re-apply the free checks (outcome, invented words, length, honest reason) to answers already on disk, after a fix to
// those checks. The judge's verdicts are kept as they are (no paid calls). Marks each row meta.regraded.
//   npx tsx evals/naming/regrade.mjs .claude/hillclimb/naming/baseline
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { grade } from "./grade.mjs";

const dir = process.argv[2];
const cases = new Map(JSON.parse(readFileSync("evals/naming/cases.json", "utf8")).map((c) => [c.id, c]));
const file = join(dir, "results.jsonl");
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let changed = 0;
for (const r of rows) {
  const c = cases.get(r.meta?.original_id ?? r.prompt_id);
  if (!c || !r.output) continue;
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
