// Checks the scorer before it is trusted: answers that must pass score ~100%, answers that must fail score ~0%.
//   npx tsx --env-file=.env evals/naming/check-grader.mjs            free: word matcher, length, honesty check
//   EVAL_JUDGE_MODEL=<model> npx tsx --env-file=.env evals/naming/check-grader.mjs --judge 3
//       also asks the judge about 3 cases x 4 answers (the buyer's own words, empty, "I don't know", wrong product)
import { readFileSync } from "node:fs";
import { demandClaims, grade, stem } from "./grade.mjs";

const cases = JSON.parse(readFileSync("evals/naming/cases.json", "utf8"));
const judgeN = process.argv.includes("--judge") ? +process.argv[process.argv.indexOf("--judge") + 1] : 0;
const titleCase = (s) => s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
const done = (title, extra = {}) => ({ status: "completed", title, alternatives: [], reason: "", limited: true, ...extra });
let bad = 0;
const expect = (label, got, want) => { const ok = got === want; if (!ok) bad++; if (!ok || process.env.VERBOSE) console.log(`${ok ? "ok  " : "FAIL"} ${label}: got ${got}, want ${want}`); };

// 1. Word matcher: forms the same word, and opposites that must stay apart.
for (const [a, b] of [["ruching", "ruched"], ["sleeves", "sleeved"], ["knitted", "knit"], ["dresses", "dress"], ["pleated", "pleats"], ["frilled", "frill"]]) expect(`same word ${a}/${b}`, stem(a), stem(b));
for (const [a, b] of [["strappy", "strapless"], ["sleeve", "sleeveless"], ["long", "longline"]]) expect(`different words ${a}/${b}`, stem(a) === stem(b), false);

// 2. Honesty check on reasons (used when there's no keyword list).
// Includes sentences from the first paid pilot (29 Oct), both claims it missed and harmless ones it wrongly flagged.
for (const s of ["Shoppers search for 'black midi dress' more than any other phrase.", "This matches what customers commonly search for.", "It uses popular search terms.", "Black midi dress has strong search volume.", "People looking for a ruched dress will find it.",
  "Results for 'black pant' are dominated by category pages using 'Black Pants', so colour first with a clear pant noun fits how shoppers search.",
  "Cotton was the most common attribute word in the search results for cotton tops, and shoppers used 'tops' as the product word, so the title keeps 'Cotton'."])
  expect(`claim flagged: ${s}`, demandClaims(s).length, 1);
for (const s of ["Google results for similar dresses lead with colour, then length.", "There were no shopper search figures for this product, so the order follows Google results.", "Retailers ranking for this style use 'Ruched' rather than 'Ruching'.", "We could not check what shoppers search for.",
  "Top search results for 'black dress' are dominated by category pages that lead with 'black' and group styles by length (mini, midi, maxi), so the title opens with the colour.",
  "The title leads with colour, then the patch pocket feature you flagged as a buyer term, and ends clearly on the product type."])
  expect(`not flagged: ${s}`, demandClaims(s).length, 0);

// 3. Oracle and null through the full scorer (judge off): the buyer's own words must pass, junk must fail.
const named = cases.filter((c) => c.expect === "name");
let oracle = 0, nullPass = 0;
for (const c of named) {
  const o = (await grade(c, done(titleCase(c.input.freeText)), "")).grade;
  if (o.right_outcome && o.grounded && o.fits) oracle++;
  for (const junk of [done(""), done("I don't know"), done("Black Leather Ankle Boots"), { status: "failed" }, { status: "needs_input", message: "?" }]) {
    const g = (await grade(c, junk, "")).grade;
    if (g.right_outcome && g.grounded && g.fits) nullPass++;
  }
}
expect(`oracle passes on ${named.length} name cases`, oracle, named.length);
console.log(`     null answers passing the free checks: ${nullPass} of ${named.length * 5} (a wrong product made of the buyer's own words can only be caught by the judge)`);
for (const c of cases.filter((c) => c.expect === "ask")) {
  expect(`${c.id} asking passes`, (await grade(c, { status: "needs_input", message: "Tell me more" }, "")).grade.passes, 1);
  expect(`${c.id} naming fails`, (await grade(c, done("Dress"), "")).grade.passes, 0);
}
expect("over 70 characters fails", (await grade(named[0], done(titleCase(named[0].input.freeText).padEnd(71, "x")), "")).grade.fits, 0);

// 4. Judge (paid, small): own words must pass faithful, the three junk answers must fail it.
if (judgeN) {
  for (const c of named.slice(0, judgeN)) {
    const own = await grade(c, done(titleCase(c.input.freeText)));
    expect(`${c.id} judge: own words faithful`, own.grade.faithful, 1);
    console.log(`     natural=${own.grade.natural} (${own.explanation.natural})`);
    for (const junk of ["", "I don't know", c.input.productType === "boots" ? "Black Mini Dress" : "Black Leather Ankle Boots"]) {
      if (!junk) { expect(`${c.id} empty answer is not a name`, (await grade(c, done(junk))).grade.right_outcome, 0); continue; }
      const g = await grade(c, done(junk));
      expect(`${c.id} judge: "${junk}" unfaithful`, g.grade.faithful, 0);
      expect(`${c.id} judge: "${junk}" fails overall`, g.grade.passes, 0);
    }
  }
}
console.log(bad ? `${bad} check(s) failed` : "all checks passed");
process.exit(bad ? 1 : 0);
