# Naming quality test

Scores Nomen's names on real products. Results and history: `CHANGES.md`.

1. Collect products (polite: one page per 10 s, as Sportsgirl's robots.txt asks):
   `python evals/naming/crawl.py <out-dir> 5`
2. Turn them into cases (writes `cases.json` and a review file `cases.md`, both git-ignored because they hold Sportsgirl's copy):
   `node evals/naming/build-cases.mjs <out-dir>/products.json`
3. Set up the test database once: create `pno_eval`, run `prisma migrate deploy` and `db:seed` against it, and add a login named `eval-runner` (`npm run user:create`).
4. Check the scorer: `npx tsx --env-file=.env evals/naming/check-grader.mjs` (free); add `--judge 3` with `EVAL_JUDGE_MODEL` set to test the judge (a few cents).
5. Run (live costs about US$2.80 for all 49 cases; `PROVIDER_MODE=mock` and no judge is free):
   ```
   DATABASE_URL=postgresql://…/pno_eval PROVIDER_MODE=live EVAL_JUDGE_MODEL=claude-sonnet-5-5 \
     npx tsx --env-file=.env evals/naming/run-eval.mjs --flow .claude/hillclimb/naming --variant v2 --model claude-opus-5-5
   ```
   To test a setup that reads and writes on different models, set `ANTHROPIC_MODEL_READ` / `ANTHROPIC_MODEL_WRITE` and
   pass `EVAL_EXPECT_MODELS="read-model,write-model"` instead of `--model`; cost is then priced per model.
   The runner skips product pages and product data so it measures and prices names only; set `PAGE_CONTENT=on` /
   `PRODUCT_SHEET=on` to include them. Live Google figures are off too, so scores compare with earlier runs;
   `LIVE_KEYWORDS=on` measures them.
   The runner refuses to start after its own code, `grade.mjs` or the cases change until a person re-approves with `--approve-harness`. `EVAL_CASES=id1,id2` runs a few cases; re-running resumes where it stopped.
6. Read the results: `node evals/naming/summarise.mjs .claude/hillclimb/naming --fails` (every score, cost, and before/after per case). `regrade.mjs` re-applies the free checks to saved answers after a fix to them.

Scoring is in `grade.mjs`.

## Product data

The same cases also score the product data (Google category, colour, material, pattern, gender and age group,
Google's limits, banned or unstated claims, and the "Ideal for" occasions). The right answers were labelled by hand,
from what each product's page states, in `data-labels.mjs` (facts only, no Sportsgirl copy, so it is committed).
Three children's pieces (`edge-girls-dress`, `edge-boys-shorts`, `edge-toddler-dress`) also check that the name says
who it's for. Run it as the live site runs, with Nitin's keyword list and live Google figures (about US$4.70 for all 49):

```
DATABASE_URL=postgresql://…/pno_eval PROVIDER_MODE=live EVAL_JUDGE_MODEL=claude-sonnet-5-5 PRODUCT_SHEET=on LIVE_KEYWORDS=on \
  EVAL_KEYWORD_LIST="Nitin keywords Nov 2026" npx tsx --env-file=.env evals/naming/run-eval.mjs --flow .claude/hillclimb/data --variant baseline --model claude-opus-5-5
```

`EVAL_KEYWORD_LIST` picks the brand's keyword list for the run by its name in `pno_eval` (load one with
`npm run dataset:import` against `pno_eval`, without `--activate`); it defaults to `none`, which is how the naming flow
has always run. Add `PAGE_CONTENT=on` to check the product page's wording too (about US$1.60 more).

## Category test sets (Milestone 2)

Each kind of piece is called ready only once it clears the bar in `thresholds.json` (agreed with Nitin) on at least 30
checked test products. Four things are scored separately per category: the Google category (classification), the
details (colour, material, pattern, gender and age), the name, and claims the product's page didn't make.

1. Collect 40 per category (about 2 hours at Sportsgirl's 10-second pace; re-running resumes):
   `python evals/naming/crawl.py <out-dir> 40` (or name categories: `... 40 belts,hats,sunglasses`).
   Sportsgirl doesn't sell shoes, swimwear, activewear or lingerie, so those need test products from another source.
2. `node evals/naming/build-cases.mjs <out-dir>/products.json`, then label each new case in `data-labels.mjs` from what
   its page states. A person checks every label before it counts: that is what makes the set "checked".
3. Run the naming flow and the product-data flow (step 5 and "Product data" above).
4. `node evals/naming/category-report.mjs` prints each category's scores and writes `readiness.json` (shares and
   counts only, no product copy), which is committed so the readiness of every category is on record.
