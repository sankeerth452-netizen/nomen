// What Nomen knows about each kind of piece: which product types it covers, what a photo can show, what only the
// retailer's own data can say, and which claims are never written without it. One place, read by the photo reader's
// instructions, the forms, the product data and the claim checks. No database code: the forms use it too.
import { singular } from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";

/** What's known about the piece besides its type, for deciding which other names it goes by. */
export const typeContext = (f: ProductFacts) => [...f.features, ...f.fit_or_silhouette, ...f.occasion_or_style, ...f.buyer_terms].join(" ");

export type Kind = "shoes" | "swimwear" | "lingerie" | "activewear" | "jewellery" | "bags" | "accessories" | "apparel";

/** A detail of this kind of piece. `photo: false`: only from the retailer's data, never read from a photo. */
export type KindAttribute = { name: string; photo: boolean; hint: string };

export type KindRule = {
  kind: Kind;
  label: string;
  /** The product types a shop uses for it, as the photo reader and forms should write them. */
  types: string[];
  /** What to look for in a photo, for the photo reader. */
  look: string;
  attributes: KindAttribute[];
  /** What the material field is called for this kind (the form label and the "you didn't mention" note). */
  materialWord: "fabric" | "material" | "upper material" | "metal or material";
  /** Claims never written unless the retailer's own data says them (checked in code on every page and data sheet). */
  needsSource: RegExp[];
  /** The same, in words, for the writing instructions. */
  claimsNote: string;
};

const W = (s: string) => new RegExp(`\\b(?:${s})\\b`, "gi");

export const KIND_RULES: Record<Kind, KindRule> = {
  shoes: {
    kind: "shoes", label: "Shoes",
    types: ["sneakers", "boots", "ankle boots", "knee-high boots", "heels", "sandals", "flats", "ballet flats", "loafers", "platforms", "slides", "mules", "wedges", "espadrilles", "clogs", "slippers"],
    look: "Read the heel, toe and closure. Never name leather, suede, patent or any upper or sole material from a photo (it could be faux): leave material null and add \"upper material\" to unsure.",
    attributes: [
      { name: "Heel type", photo: true, hint: "flat, block, stiletto, kitten, wedge, platform, cone" },
      { name: "Heel height", photo: true, hint: "flat, low, mid or high only; exact centimetres come from the retailer" },
      { name: "Toe", photo: true, hint: "round, pointed, square, almond, open, peep" },
      { name: "Closure", photo: true, hint: "lace-up, buckle, zip, slip-on, ankle strap, hook and loop" },
      { name: "Upper", photo: false, hint: "upper material" },
      { name: "Sole", photo: false, hint: "sole material" },
    ],
    materialWord: "upper material",
    needsSource: [W("leather upper|suede upper|rubber sole|cushioned|memory foam|non[- ]slip|slip[- ]resistant|arch support|orthotic\\w*|padded insole|wide fit|true to size")],
    claimsNote: "Never state the upper or sole material, cushioning, grip, arch support, width or fit unless the facts or notes say so.",
  },
  swimwear: {
    kind: "swimwear", label: "Swimwear",
    types: ["one-piece swimsuit", "bikini top", "bikini bottoms", "bikini set", "tankini", "swim shorts", "rash vest", "cover-up"],
    look: "Say which piece it is: a one-piece swimsuit, a bikini top, bikini bottoms or both (a bikini set), a tankini or a cover-up. Read the neckline, straps, coverage and back.",
    attributes: [
      { name: "Neckline", photo: true, hint: "scoop, V, plunge, high neck, halter, bandeau, square, sweetheart" },
      { name: "Straps", photo: true, hint: "thin, wide, tie, cross-back, one-shoulder, strapless" },
      { name: "Coverage", photo: true, hint: "cheeky, moderate, full, high-cut leg" },
      { name: "Back", photo: true, hint: "open, low, scoop, tie, cross, cut-out" },
      { name: "Fabric", photo: false, hint: "fabric composition" },
    ],
    materialWord: "fabric",
    needsSource: [W("upf ?\\d*\\+?|chlorine[- ]resist\\w*|quick[- ]dr\\w*|sand[- ]resist\\w*|removable (?:cups|padding)|tummy control|underwire\\w*|padded|lined|fully lined")],
    claimsNote: "Never state UPF or sun protection, chlorine resistance, quick-drying, lining, padding, underwire or tummy control unless the facts or notes say so.",
  },
  lingerie: {
    kind: "lingerie", label: "Lingerie & sleepwear",
    types: ["bra", "bralette", "briefs", "thong", "bodysuit", "shapewear", "slip", "pyjama set", "robe", "nightie"],
    look: "Read the style and coverage you can see. Padding, underwire and support can't be seen reliably: leave them to the retailer's data.",
    attributes: [
      { name: "Style", photo: true, hint: "triangle, balconette, plunge, strapless, longline, high-waist, cheeky, bikini" },
      { name: "Coverage", photo: true, hint: "full, moderate, minimal" },
      { name: "Closure", photo: true, hint: "back hook, front clasp, pull-on, tie" },
      { name: "Padding", photo: false, hint: "padding" },
      { name: "Underwire", photo: false, hint: "underwire" },
      { name: "Support", photo: false, hint: "support level" },
      { name: "Fabric", photo: false, hint: "fabric composition" },
    ],
    materialWord: "fabric",
    needsSource: [W("padded|push[- ]up|underwire\\w*|wire[- ]free|wireless|moulded|molded|supportive|support\\w*|lift\\w*|smooth\\w*|sculpt\\w*|shap(?:es|ing)|comfort\\w*|all[- ]day|seamless|invisible under|no[- ]show|breathable|soothing|gentle on")],
    claimsNote: "Never state comfort, support, lift, padding, underwire, smoothing, shaping or any body or health benefit unless the facts or notes say so.",
  },
  activewear: {
    kind: "activewear", label: "Activewear",
    types: ["sports bra", "leggings", "bike shorts", "gym shorts", "active top", "tank", "tracksuit", "track pants", "sports jacket"],
    look: "Read the waistband, leg length and fit you can see. Support level and fabric are the retailer's data, never read from a photo.",
    attributes: [
      { name: "Waistband", photo: true, hint: "high-waist, wide, crossover, drawstring, foldover" },
      { name: "Leg length", photo: true, hint: "full, 7/8, capri, bike short" },
      { name: "Fit", photo: true, hint: "fitted, relaxed, cropped" },
      { name: "Activity", photo: false, hint: "what it's made for, from the retailer (yoga, gym, running)" },
      { name: "Support", photo: false, hint: "support level" },
      { name: "Fabric", photo: false, hint: "fabric composition" },
    ],
    materialWord: "fabric",
    needsSource: [W("(?:high|medium|low|light)[- ]support|support\\w*|sweat[- ]wicking|moisture[- ]wicking|quick[- ]dr\\w*|squat[- ]proof|compressi\\w*|four[- ]way stretch|4[- ]way stretch|anti[- ]odou?r|breathable|sculpt\\w*|lift\\w*")],
    claimsNote: "Never state a support level, sweat-wicking, quick-drying, squat-proof, compression, stretch or any performance benefit unless the facts or notes say so.",
  },
  jewellery: {
    kind: "jewellery", label: "Jewellery",
    types: ["earrings", "hoop earrings", "stud earrings", "drop earrings", "necklace", "pendant necklace", "chain", "ring", "bracelet", "bangle", "anklet", "brooch", "watch"],
    look: "Read the shape and the colour of the metal (gold-tone, silver-tone) and any visible stones by colour only. Never name the metal itself (gold, sterling silver, stainless steel, plated) or a gemstone: leave material null and add \"metal\" to unsure.",
    attributes: [
      { name: "Style", photo: true, hint: "hoop, stud, drop, huggie, chain, pendant, chunky, signet, cuff" },
      { name: "Finish", photo: true, hint: "gold-tone, silver-tone, polished, textured, hammered" },
      { name: "Stone", photo: true, hint: "visible stones by colour only (\"clear stones\"), never the gem" },
      { name: "Metal", photo: false, hint: "metal (gold, sterling silver, plated)" },
      { name: "Closure", photo: false, hint: "closure" },
    ],
    materialWord: "metal or material",
    needsSource: [W("solid gold|real gold|\\d{1,2} ?(?:k|ct|carat)|karat|sterling(?: silver)?|925|gold[- ]plated|gold[- ]filled|vermeil|rhodium|platinum|stainless steel|titanium|diamonds?|gemstones?|cubic zirconia|real pearls?|freshwater pearls?|nickel[- ]free|tarnish[- ](?:free|resistant)|waterproof")],
    claimsNote: "Never state what the metal is (solid gold, sterling silver, plated, stainless steel), carats, gemstones, real pearls, nickel-free or tarnish resistance unless the facts or notes say so. A gold or silver colour is fine.",
  },
  bags: {
    kind: "bags", label: "Bags",
    types: ["tote bag", "crossbody bag", "shoulder bag", "clutch", "bucket bag", "saddle bag", "baguette bag", "backpack", "wallet"],
    look: "Read the shape, strap and closure. Never name leather or suede from a photo (it could be faux): leave material null and add \"material\" to unsure.",
    attributes: [
      { name: "Strap", photo: true, hint: "top handle, chain, adjustable, detachable, shoulder" },
      { name: "Closure", photo: true, hint: "zip, flap, magnetic, drawstring, clasp" },
      { name: "Size", photo: true, hint: "mini, small, medium, large; measurements come from the retailer" },
      { name: "Hardware", photo: true, hint: "gold-tone, silver-tone" },
      { name: "Compartments", photo: false, hint: "inside pockets and compartments" },
    ],
    materialWord: "material",
    needsSource: [W("genuine leather|real leather|full[- ]grain|top[- ]grain|vegan leather|laptop sleeve|fits a \\d+|water[- ]resistant|waterproof|rfid")],
    claimsNote: "Never state genuine or vegan leather, what it fits (a laptop, an A4 file), water resistance or measurements unless the facts or notes say so.",
  },
  accessories: {
    kind: "accessories", label: "Accessories",
    types: ["belt", "hat", "cap", "beanie", "bucket hat", "scarf", "sunglasses", "hair clip", "claw clip", "headband", "scrunchie"],
    look: "Read the shape and style. Never name the material unless the look makes it unmistakable (knit, straw, woven).",
    attributes: [
      { name: "Style", photo: true, hint: "the shape or style" },
      { name: "Size", photo: false, hint: "size or measurements" },
    ],
    materialWord: "material",
    needsSource: [W("uv400|uv protect\\w*|polari[sz]ed|one size fits all|adjustable fit")],
    claimsNote: "Never state UV protection, polarised lenses or an adjustable fit unless the facts or notes say so.",
  },
  apparel: {
    kind: "apparel", label: "Clothing",
    types: [],
    look: "",
    attributes: [],
    materialWord: "fabric",
    needsSource: [],
    claimsNote: "",
  },
};

// The last noun of a product type decides, with a few two-word types checked first ("sports bra" isn't lingerie).
const TWO_WORD: [RegExp, Kind][] = [
  [/\bsports? bras?\b/, "activewear"], [/\bbike shorts?\b/, "activewear"], [/\bgym shorts?\b/, "activewear"], [/\btrack ?(?:pants?|suits?|jackets?)\b/, "activewear"],
  [/\bone[- ]?pieces?\b|\bbikini\b|\btankini\b|\bswim\w*\b|\bbathers\b|\brash(?:ie| vest)\b/, "swimwear"],
  [/\bcover[- ]?ups?\b/, "swimwear"], [/\b(?:hair )?clips?\b|\bclaw clips?\b/, "accessories"], [/\blingerie\b|\bsleepwear\b|\bpyjamas?\b|\bpajamas?\b/, "lingerie"],
];
const NOUN_KIND: Record<string, Kind> = {
  shoe: "shoes", sneaker: "shoes", trainer: "shoes", boot: "shoes", heel: "shoes", sandal: "shoes", flat: "shoes", loafer: "shoes", platform: "shoes", slide: "shoes",
  mule: "shoes", pump: "shoes", wedge: "shoes", espadrille: "shoes", clog: "shoes", slipper: "shoes", thong: "lingerie",
  bra: "lingerie", bralette: "lingerie", brief: "lingerie", knicker: "lingerie", "g-string": "lingerie", shapewear: "lingerie", nightie: "lingerie", nightdress: "lingerie", robe: "lingerie", chemise: "lingerie", pj: "lingerie",
  necklace: "jewellery", earring: "jewellery", ring: "jewellery", bracelet: "jewellery", bangle: "jewellery", anklet: "jewellery", pendant: "jewellery", charm: "jewellery",
  brooch: "jewellery", watch: "jewellery", choker: "jewellery", hoop: "jewellery", stud: "jewellery", huggie: "jewellery", chain: "jewellery",
  bag: "bags", handbag: "bags", tote: "bags", clutch: "bags", crossbody: "bags", purse: "bags", wallet: "bags", backpack: "bags", pouch: "bags", satchel: "bags",
  belt: "accessories", hat: "accessories", cap: "accessories", beanie: "accessories", beret: "accessories", scarf: "accessories", sunglass: "accessories", sunglasses: "accessories",
  glove: "accessories", headband: "accessories", scrunchie: "accessories", bandana: "accessories", fascinator: "accessories",
  bikini: "swimwear", swimsuit: "swimwear", tankini: "swimwear", boardshort: "swimwear", sarong: "swimwear",
};
// Pieces that are activewear when what they're for says so ("gym leggings", "yoga top"), otherwise everyday clothing.
const ACTIVE_NOUNS = new Set(["legging", "tight", "tights", "short", "shorts", "top", "tank", "tee", "crop", "jacket", "pant", "pants", "jogger", "hoodie", "set", "bodysuit", "unitard", "singlet"]);
const ACTIVE_USE = /\b(gym|yoga|pilates|running|run|workout|training|train|active|activewear|sport|sports|athletic|cycling|barre|hiit)\b/;

/** Which kind of piece a product type is. `context` (the description or occasion) only decides activewear. */
export function kindOf(productType: string | null | undefined, context = ""): Kind {
  const t = (productType ?? "").toLowerCase().trim();
  if (!t) return "apparel";
  for (const [re, kind] of TWO_WORD) if (re.test(t)) return kind;
  const noun = singular(t.split(/\s+/).pop() ?? "");
  const last = t.split(/\s+/).pop() ?? "";
  if (ACTIVE_NOUNS.has(noun) || ACTIVE_NOUNS.has(last)) return ACTIVE_USE.test(`${t} ${context.toLowerCase()}`) ? "activewear" : "apparel";
  // "Thong" sandals are shoes; on its own, or with lingerie words, it's underwear.
  if (noun === "thong" && /\bsandals?|flip[- ]?flops?|shoes?\b/.test(`${t} ${context.toLowerCase()}`)) return "shoes";
  return NOUN_KIND[noun] ?? NOUN_KIND[last] ?? "apparel";
}

export const ruleFor = (productType: string | null | undefined, context = ""): KindRule => KIND_RULES[kindOf(productType, context)];

/** The material field's label and example for the form, by kind ("Upper material" for shoes). */
export function materialLabel(productType: string | null | undefined): [string, string] {
  const k = kindOf(productType);
  if (k === "shoes") return ["Upper material", "suede"];
  if (k === "jewellery") return ["Metal or material", "sterling silver"];
  if (k === "swimwear" || k === "lingerie" || k === "activewear") return ["Fabric (from the label)", "nylon elastane"];
  if (k === "bags" || k === "accessories") return ["Material", "faux leather"];
  return ["Material", "linen blend"];
}

/** The photo reader's section on kinds of pieces, built from the rules above. */
export function photoKindGuide(): string {
  return (Object.values(KIND_RULES) as KindRule[]).filter((r) => r.kind !== "apparel").map((r) => {
    const fromPhoto = r.attributes.filter((a) => a.photo).map((a) => `${a.name} (${a.hint})`).join("; ");
    const never = r.attributes.filter((a) => !a.photo).map((a) => a.hint).join(", ");
    return `- ${r.label} (${r.types.join(", ")}): ${r.look} Details: ${fromPhoto}.${never ? ` Never from a photo: ${never}.` : ""}`;
  }).join("\n");
}

export type VisualAttribute = { name: string; value: string; seen: "clear" | "partly" };

/**
 * The photo reader's category details, kept to the names this kind allows from a photo. Anything else is dropped:
 * a photo never fills a detail only the retailer's data can give.
 */
export function cleanAttributes(productType: string | null | undefined, raw: { name: string; value: string; seen: "clear" | "partly" }[] | undefined): VisualAttribute[] {
  const allowed = new Map(ruleFor(productType).attributes.filter((a) => a.photo).map((a) => [a.name.toLowerCase(), a.name]));
  const out: VisualAttribute[] = [];
  for (const a of raw ?? []) {
    const name = allowed.get(a.name.trim().toLowerCase());
    const value = a.value.trim().replace(/\s+/g, " ").slice(0, 60);
    if (name && value && !out.some((o) => o.name === name)) out.push({ name, value, seen: a.seen === "clear" ? "clear" : "partly" });
  }
  return out;
}

/** Clearly visible details as lines for the "Extra product facts" field ("Heel type: block."), which the buyer checks. */
export const attributeNotes = (attrs: VisualAttribute[]) => attrs.filter((a) => a.seen === "clear").map((a) => `${a.name}: ${a.value}.`).join(" ");

/** Claims this kind never makes without the retailer's data, found in `text` but not in `source`. */
export function unsupportedClaims(kind: Kind, text: string, source: string): string[] {
  const src = source.toLowerCase();
  const found = new Set<string>();
  for (const re of KIND_RULES[kind].needsSource) for (const m of text.matchAll(re)) {
    const claim = m[0].toLowerCase();
    if (!src.includes(claim) && !src.includes(claim.replace(/-/g, " ")) && !src.includes(claim.replace(/ /g, "-"))) found.add(claim);
  }
  return [...found];
}

// Other names for the same kind of product that add to it, each equally true. Shoppers search "black one piece
// swimsuit" about three times as often as "black swimsuit", and a swimsuit that isn't a bikini or tankini is a
// one-piece. Plain swaps (tee or t-shirt, sweater or jumper, pants or trousers) are left out on purpose: which one a
// brand writes is its own choice ("Your words" in its brand profile), and the 21 Nov test showed a blanket swap
// turning Sportsgirl's "Tee" and "Sweater" into "T-Shirt" and "Jumper".
const SAME_TYPE: { names: string[]; unless?: RegExp }[] = [
  { names: ["swimsuit", "one piece swimsuit", "one piece"], unless: /\b(bikini|tankini|two[- ]?piece|2[- ]?piece|cover[- ]?ups?|rash\w*|shorts?)\b/ },
];
const typeWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean).map(singular);

/**
 * Other names this product type may go by ("swimsuit" -> "one piece swimsuit", "one piece"), or none. `context` is the
 * rest of what's known about the piece: a bikini, tankini or two-piece is never called a one-piece.
 */
export function alsoCalled(productType: string | null | undefined, context = ""): string[] {
  const t = typeWords(productType ?? "");
  if (!t.length) return [];
  for (const g of SAME_TYPE) {
    const matches = g.names.filter((n) => { const w = typeWords(n); return w.length <= t.length && w.every((x, i) => t[t.length - w.length + i] === x); });
    if (!matches.length) continue;
    if (g.unless?.test(`${(productType ?? "").toLowerCase()} ${context.toLowerCase()}`)) return [];
    const own = matches.sort((a, b) => typeWords(b).length - typeWords(a).length)[0];
    const lead = t.slice(0, t.length - typeWords(own).length).join(" "); // "black swimsuit" keeps "black" in front
    return g.names.filter((n) => n !== own).map((n) => (lead ? `${lead} ${n}` : n));
  }
  return [];
}

/** The words an also-called name may add to a title, in the forms titles write them ("one", "piece", "one-piece"). */
export function alsoCalledWords(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const w = n.toLowerCase().split(/[\s]+/).filter(Boolean);
    for (const x of w) out.add(x);
    for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]}-${w[i + 1]}`);
  }
  return [...out];
}

/** The head noun of each also-called name, which a title may end on instead of the product type ("piece", "tee"). */
export const alsoCalledNouns = (names: string[]) => [...new Set(names.map((n) => singular(n.toLowerCase().split(/\s+/).pop() ?? "")).filter(Boolean))];
