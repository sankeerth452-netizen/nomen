// Every sentence a buyer can read that the naming pipeline writes, in one place, in plain words.
// Technical detail never goes here: it is stored for engineers in generation.usage.notes.

export const COPY = {
  ignoredDetails: (words: string[]) => `We left out details you didn't mention: ${words.join(", ")}.`,
  unknownType: (type: string) => `We don't have search figures for “${type}” yet. Try a more common word for it, like dress, top or boots.`,
  tooFewDetails: (type: string) => `Tell us a little more about this ${type}: its colour, fabric, fit, length or a detail. A name can't be built from “${type}” alone.`,
  noKeywordList: "Your brand's keyword list hasn't been uploaded yet, so this name has no search figures behind it.",
  googleUnavailable: "We couldn't check Google today, so this name is based on search figures only.",
  googlePartial: "Some of today's Google checks didn't go through, so part of the evidence is missing.",
  noMatchingSearches: "We couldn't find search figures that match these details, so we can't say how often shoppers search for them.",
  mixedIntent: "Google shows a mix of shops and articles for this, so it's less clear what shoppers want.",
  missing: {
    colour: "You didn't mention a colour. Most shoppers search with one, so it's worth adding.",
    material: "You didn't mention the fabric. Adding it can help shoppers find the piece.",
    length: "You didn't mention the length (mini, midi or maxi). Shoppers often search for it.",
  },
  brandTerm: (term: string) => `The name doesn't include “${term}”, which your brand asks for.`,
  lengthConflict: (lengths: string[]) => `It can't be both ${lengths.join(" and ")}. Which length is it?`,
  oppositeConflict: (a: string, b: string) => `It can't be both ${a} and ${b}. Which is it?`,
  query: {
    mostSearched: (volume: number | null) => `The most-searched phrase for this piece${volume !== null ? ` (${volume.toLocaleString()} a month)` : ""}`,
    yourDetails: "Your details, in the order shoppers search them",
    yourDetailsUsualOrder: "Your details, in the usual order for this kind of piece",
    typeOnly: "Just the product type",
    anotherWay: "Another way shoppers search for it",
    broader: "A broader search",
  },
} as const;

// Older generations stored engineer wording. Translate it when shown, so History reads the same as new results.
// null means "engineers only": hide it.
const LEGACY: [RegExp, (m: RegExpMatchArray) => string | null][] = [
  [/^Strongest keyword in the dataset for this product(?: \(([\d,]+) searches\))?$/, (m) => COPY.query.mostSearched(m[1] ? Number(m[1].replace(/,/g, "")) : null)],
  [/^Buyer's attributes in the order the keyword list uses them$/, () => COPY.query.yourDetails],
  [/^Product type only: no attributes supplied$/, () => COPY.query.typeOnly],
  [/^Alternative phrasing from the dataset$/, () => COPY.query.anotherWay],
  [/^Broader phrasing: lead attribute \+ product type$/, () => COPY.query.broader],
  [/^Live search results were unavailable; recommendation used the keyword dataset only\.$/, () => COPY.googleUnavailable],
  [/^Some live searches failed; the search evidence is partial\.$/, () => COPY.googlePartial],
  [/^Limited keyword evidence: .*$/, () => COPY.noMatchingSearches],
  [/^Search-result intent was mixed\.$/, () => COPY.mixedIntent],
  [/^(colour|material|length) was not supplied$/, (m) => COPY.missing[m[1] as keyof typeof COPY.missing]],
  [/^Ignored details that weren't in your input: (.*)$/, (m) => COPY.ignoredDetails(m[1].split(", "))],
  [/^No keyword dataset is active for this brand\.$/, () => COPY.noKeywordList],
  [/^Live search for ".*" failed: .*$/, () => COPY.googlePartial],
  [/^Brand core term "(.*)" is not in the title$/, (m) => COPY.brandTerm(m[1])],
  [/^Length: (.*) can't both be true$/, (m) => COPY.lengthConflict(m[1].split(" and "))],
  [/^"(.*)" and "(.*)" can't both be true$/, (m) => COPY.oppositeConflict(m[1], m[2])],
  [/^Sleeveless and sleeved details both supplied$/, () => COPY.oppositeConflict("sleeveless", "sleeved")],
  [/^We couldn't find "(.*)" in the keyword data\..*$/, (m) => COPY.unknownType(m[1])],
  [/^Add at least one real detail about this (.*?):.*$/, (m) => COPY.tooFewDetails(m[1])],
  [/^\[mock recommender\].*$/, () => "Built from your details, in the usual order for this kind of piece."],
  [/^Drops "(.*)" for a shorter(, broader)? title\.$/, (m) => `Leaves out "${m[1]}" for a shorter${m[2] ?? ""} name.`],
  [/^Title is \d+ characters \(brand maximum \d+\)$/, () => "This name is longer than your brand usually allows."],
  [/^Dropped alternative ".*": .*$|^Extra alternatives were dropped \(maximum 3\)$|^No primary keyword was chosen even though keyword evidence exists$/, () => null],
];

/** The plain-words version of a stored sentence, or null when it's an engineer-only note that shouldn't be shown. */
export function plain(text: string): string | null {
  for (const [re, to] of LEGACY) {
    const m = text.match(re);
    if (m) return to(m);
  }
  return text;
}

export const plainList = (texts: string[] | undefined) => (texts ?? []).map(plain).filter((t): t is string => !!t);
