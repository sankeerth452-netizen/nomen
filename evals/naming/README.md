# Naming quality test

Scores Nomen's names on real products. Results and history: `CHANGES.md`.

1. Collect products (polite: one page per 10 s, as Sportsgirl's robots.txt asks):
   `python evals/naming/crawl.py <out-dir> 5`
2. Turn them into cases (writes `cases.json` and a review file `cases.md`, both git-ignored because they hold Sportsgirl's copy):
   `node evals/naming/build-cases.mjs <out-dir>/products.json`
3. Set up the test database once: create `pno_eval`, run `prisma migrate deploy` and `db:seed` against it, and add a login named `eval-runner` (`npm run user:create`).
4. Check the scorer: `npx tsx --env-file=.env evals/naming/check-grader.mjs` (free); add `--judge 3` with `EVAL_JUDGE_MODEL` set to test the judge (a few cents).
5. Run (live costs about US$2.60 for all 46 cases; `PROVIDER_MODE=mock` and no judge is free):
   ```
   DATABASE_URL=postgresql://…/pno_eval PROVIDER_MODE=live EVAL_JUDGE_MODEL=claude-sonnet-5-5 \
     npx tsx --env-file=.env evals/naming/run-eval.mjs --flow .claude/hillclimb/naming --variant v2 --model claude-opus-5-5
   ```
   The runner refuses to start after its own code, `grade.mjs` or the cases change until a person re-approves with `--approve-harness`. `EVAL_CASES=id1,id2` runs a few cases; re-running resumes where it stopped.
6. Read the results: `node evals/naming/summarise.mjs .claude/hillclimb/naming --fails` (every score, cost, and before/after per case). `regrade.mjs` re-applies the free checks to saved answers after a fix to them.

Scoring is in `grade.mjs`.
