// Checks the scorer before it is trusted: answers that must pass score ~100%, answers that must fail score ~0%.
//   npx tsx --env-file=.env evals/naming/check-grader.mjs            free: word matcher, length, honesty check
//   EVAL_JUDGE_MODEL=<model> npx tsx --env-file=.env evals/naming/check-grader.mjs --judge 3
//       also asks the judge about 3 cases x 4 answers (the buyer's own words, empty, "I don't know", wrong product)
import { readFileSync } from "node:fs";
import { audienceNamed, demandClaims, grade, inventedWords, stem } from "./grade.mjs";
import { LABELS } from "./data-labels.mjs";

const cases = JSON.parse(readFileSync("evals/naming/cases.json", "utf8"));
const judgeN = process.argv.includes("--judge") ? +process.argv[process.argv.indexOf("--judge") + 1] : 0;
const titleCase = (s) => s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
const done = (title, extra = {}) => ({ status: "completed", title, alternatives: [], reason: "", limited: true, ...extra });
let bad = 0;
const expect = (label, got, want) => { const ok = got === want; if (!ok) bad++; if (!ok || process.env.VERBOSE) console.log(`${ok ? "ok  " : "FAIL"} ${label}: got ${got}, want ${want}`); };

// 1. Word matcher: forms the same word, and opposites that must stay apart.
for (const [a, b] of [["ruching", "ruched"], ["sleeves", "sleeved"], ["knitted", "knit"], ["dresses", "dress"], ["pleated", "pleats"], ["frilled", "frill"]]) expect(`same word ${a}/${b}`, stem(a), stem(b));
for (const [a, b] of [["strappy", "strapless"], ["sleeve", "sleeveless"], ["long", "longline"]]) expect(`different words ${a}/${b}`, stem(a) === stem(b), false);
expect("'Crew Neck' from 'crew neckline' is not invented", inventedWords("Black Crew Neck Sweater", { freeText: "black sweater, crew neckline" }).length, 0);
expect("'Neck' with no neckline is invented", inventedWords("Black Crew Neck Sweater", { freeText: "black crew sweater" }).join(), "neck");

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

// 3b. Children's pieces: the name must say who it's for.
const girls = cases.find((c) => c.id === "edge-girls-dress");
expect("girls' piece named for girls", audienceNamed(girls.input, "Girls' Cream Embroidered Maxi Dress"), 1);
expect("girls' piece named as if women's", audienceNamed(girls.input, "Cream Embroidered Maxi Dress"), 0);
expect("women's piece: not checked", audienceNamed(named[0].input, "Pink Denim Mini Dress"), null);

// 3c. Product data (judge off): data built from the labels must pass every free check; each kind of mistake must fail.
const sheetFrom = (c, o = {}) => {
  const l = LABELS[c.id];
  const goodText = "A piece for everyday wear. ".repeat(24).trim();
  return { status: "ready", google: { category: { id: l.category[0], path: "x" }, colour: l.colour ? l.colour.first[0] : null, material: l.material ? l.material.first[0] : null, pattern: l.pattern?.[0] ?? null, gender: l.gender[0], ageGroup: l.ageGroup[0], customLabels: ["", "", "", "", ""], ...o.google },
    highlights: ["Easy to wear", "Made for everyday"], details: [], shortDescription: goodText, idealFor: { live: [], review: [], sentence: null }, care: null, imageAlt: "Front view", ...o.rest };
};
const free = ["category_right", "colour_right", "material_right", "audience_right", "fits_google", "no_claims"];
let dataOracle = 0;
for (const c of named) {
  const g = (await grade(c, done(titleCase(c.input.freeText), { sheet: sheetFrom(c) }), "")).grade;
  if (free.every((m) => g[m] === 1) && g.pattern_right !== 0 && g.data_ready === 1) dataOracle++;
  else console.log(`FAIL data oracle ${c.id}:`, free.filter((m) => g[m] !== 1));
}
expect(`data built from the labels passes on ${named.length} cases`, dataOracle, named.length);
const pinkDress = named.find((c) => c.id === "dresses-086362"), mesh = named.find((c) => c.id === "edge-mesh-sleeves-trap");
const dataGrade = async (c, o) => (await grade(c, done("Pink Denim Mini Dress", { sheet: sheetFrom(c, o) }), "")).grade;
expect("wrong category (shoes) fails", (await dataGrade(pinkDress, { google: { category: { id: 187 } } })).category_right, 0);
expect("wrong colour fails", (await dataGrade(pinkDress, { google: { colour: "Red" } })).colour_right, 0);
expect("unstated second colour fails", (await dataGrade(pinkDress, { google: { colour: "Pink/White" } })).colour_right, 0);
expect("colour sent when none was stated fails", (await dataGrade(named.find((c) => c.id === "tops-085921"), { google: { colour: "Blue" } })).colour_right, 0);
expect("part-only mesh as the material fails", (await dataGrade(mesh, { google: { material: "Mesh" } })).material_right, 0);
expect("gold finish sent as gold material fails", (await dataGrade(named.find((c) => c.id === "jewellery-085747"), { google: { material: "Gold" } })).material_right, 0);
expect("women's piece tagged Kids fails", (await dataGrade(pinkDress, { google: { ageGroup: "Kids" } })).audience_right, 0);
expect("one highlight fails", (await dataGrade(pinkDress, { rest: { highlights: ["Only one"] } })).fits_google, 0);
expect("short description of 300 characters fails", (await dataGrade(pinkDress, { rest: { shortDescription: "x".repeat(300) } })).fits_google, 0);
for (const bad of ["Slimming A-line shape.", "Free shipping on every order.", "Fully lined for comfort.", "Machine washable.", "Made from 100% silk.", "Made from recycled cotton.", "Measures 85cm long.", "UPF 50+ sun protection.", "Made from 80% cotton."])
  expect(`claim caught: ${bad}`, (await dataGrade(pinkDress, { rest: { highlights: ["Easy to wear", bad] } })).no_claims, 0);
for (const ok of ["Made from 100% cotton.", "Pink denim with scalloped detailing.", "A square neckline frames the sleeveless shape."])
  expect(`not a claim: ${ok}`, (await dataGrade(pinkDress, { rest: { highlights: ["Easy to wear", ok] } })).no_claims, 1);
expect("abbreviated fabric still backs the claim (recy poly)", (await dataGrade(named.find((c) => c.id === "jackets-083480"), { rest: { highlights: ["Easy to wear", "Made from 50% recycled polyester and viscose."] } })).no_claims, 1);
expect("maternity tag with no maternity in the input fails", (await dataGrade(pinkDress, { rest: { idealFor: { live: [{ key: "maternity", label: "Maternity" }], review: [], sentence: null } } })).ideal_for_right, 0);
expect("no product data when it should have been written fails", (await grade(pinkDress, done("Pink Denim Mini Dress", { sheet: null }), "")).grade.data_ready, 0);
expect("product data off: not scored", (await grade(pinkDress, done("Pink Denim Mini Dress"), "")).grade.data_ready, null);

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
