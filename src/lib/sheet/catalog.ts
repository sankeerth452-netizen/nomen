// The product data Google Shopping reads, worked out in code from the buyer's facts wherever a rule can decide it:
// Google category, your own breadcrumb, plain colour, pattern, material, gender, age group and size. Claude never
// guesses these. Category IDs are from Google's product taxonomy (taxonomy-with-ids.en-AU.txt, checked 15 Nov 2026).
import { PRODUCT_TYPE_CATEGORY, singular } from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";

export type GoogleCategory = { id: number; path: string };

/** The part of Google's taxonomy a fashion retailer uses. IDs are what the feed sends; paths are for people. */
export const GOOGLE_CATEGORIES: GoogleCategory[] = [
  [1604, "Clothing"], [5322, "Clothing > Activewear"], [2271, "Clothing > Dresses"],
  [208, "Clothing > Nightwear & Loungewear"], [5713, "Clothing > Nightwear & Loungewear > Loungewear"], [5513, "Clothing > Nightwear & Loungewear > Night dresses"],
  [2580, "Clothing > Nightwear & Loungewear > Pyjamas"], [2302, "Clothing > Nightwear & Loungewear > Robes"],
  [5182, "Clothing > One-Pieces"], [5490, "Clothing > One-Pieces > Bodysuits & Unitards"], [7132, "Clothing > One-Pieces > Dungarees"], [5250, "Clothing > One-Pieces > Jumpsuits & Playsuits"],
  [203, "Clothing > Outerwear"], [5598, "Clothing > Outerwear > Coats & Jackets"], [1831, "Clothing > Outerwear > Gilets"],
  [7313, "Clothing > Outfit Sets"], [212, "Clothing > Shirts & Tops"], [207, "Clothing > Shorts"], [1581, "Clothing > Skirts"], [5344, "Clothing > Skorts"],
  [1594, "Clothing > Suits"], [1516, "Clothing > Suits > Skirt Suits"], [5183, "Clothing > Suits > Trouser Suits"], [211, "Clothing > Swimwear"], [204, "Clothing > Trousers & Jeans"],
  [213, "Clothing > Underwear & Socks"], [214, "Clothing > Underwear & Socks > Bras"], [215, "Clothing > Underwear & Socks > Hosiery"], [1772, "Clothing > Underwear & Socks > Lingerie"],
  [1578, "Clothing > Underwear & Socks > Shapewear"], [209, "Clothing > Underwear & Socks > Socks"], [2562, "Clothing > Underwear & Socks > Underwear"], [5834, "Clothing > Underwear & Socks > Underwear Slips"],
  [5388, "Clothing > Traditional & Ceremonial Clothing"], [8248, "Clothing > Traditional & Ceremonial Clothing > Saris"], [6031, "Clothing > Traditional & Ceremonial Clothing > Dirndls"],
  [5441, "Clothing > Wedding & Bridal Party Dresses"], [5330, "Clothing > Wedding & Bridal Party Dresses > Bridal Party Dresses"], [5329, "Clothing > Wedding & Bridal Party Dresses > Wedding Dresses"],
  [182, "Clothing > Baby & Toddler Clothing"], [5408, "Clothing > Baby & Toddler Clothing > Baby & Toddler Bottoms"], [5424, "Clothing > Baby & Toddler Clothing > Baby & Toddler Dresses"],
  [5425, "Clothing > Baby & Toddler Clothing > Baby & Toddler Outerwear"], [5622, "Clothing > Baby & Toddler Clothing > Baby & Toddler Outfits"], [5412, "Clothing > Baby & Toddler Clothing > Baby & Toddler Sleepwear"],
  [5409, "Clothing > Baby & Toddler Clothing > Baby & Toddler Swimwear"], [5410, "Clothing > Baby & Toddler Clothing > Baby & Toddler Tops"],
  [167, "Clothing Accessories"], [169, "Clothing Accessories > Belts"], [170, "Clothing Accessories > Gloves & Mittens"], [171, "Clothing Accessories > Hair Accessories"],
  [502988, "Clothing Accessories > Hair Accessories > Hair Pins, Claws & Clips"], [1662, "Clothing Accessories > Hair Accessories > Headbands"], [1483, "Clothing Accessories > Hair Accessories > Ponytail Holders"],
  [173, "Clothing Accessories > Hats"], [7054, "Clothing Accessories > Headwear > Fascinators"], [177, "Clothing Accessories > Scarves & Snoods"], [178, "Clothing Accessories > Sunglasses"],
  [6551, "Handbags, Wallets & Cases"], [3032, "Handbags, Wallets & Cases > Handbags"], [2668, "Handbags, Wallets & Cases > Wallets & Money Clips"],
  [188, "Jewellery & Watches"], [189, "Jewellery & Watches > Anklets"], [191, "Jewellery & Watches > Bracelets"], [197, "Jewellery & Watches > Brooches & Lapel Pins"],
  [192, "Jewellery & Watches > Charms & Pendants"], [194, "Jewellery & Watches > Earrings"], [6463, "Jewellery & Watches > Jewellery Sets"], [196, "Jewellery & Watches > Necklaces"],
  [200, "Jewellery & Watches > Rings"], [201, "Jewellery & Watches > Watches"], [187, "Shoes"],
].map(([id, path]) => ({ id: id as number, path: `Clothing & Accessories > ${path}` })).concat([
  { id: 100, path: "Luggage & Bags > Backpacks" }, { id: 104, path: "Luggage & Bags > Bum Bags" }, { id: 108, path: "Luggage & Bags > Cosmetic & Toiletry Bags" },
  { id: 103, path: "Luggage & Bags > Duffel Bags" }, { id: 5608, path: "Luggage & Bags > Shopping Bags" },
]);
const BY_ID = new Map(GOOGLE_CATEGORIES.map((c) => [c.id, c]));
export const googleCategory = (id: number | null | undefined) => (id == null ? null : BY_ID.get(id) ?? null);

const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
const words = (f: ProductFacts) => tokens([f.product_type ?? "", ...f.colour, ...f.material, ...f.pattern, ...f.fit_or_silhouette, ...f.length, ...f.features, ...f.occasion_or_style].join(" "));

// Product-type noun (singular) -> Google category ID. The last noun of the product type decides ("tote bag" -> bag).
const TYPE_CATEGORY: Record<string, number> = {
  dress: 2271, gown: 2271, sundress: 2271, kaftan: 2271,
  top: 212, tee: 212, "t-shirt": 212, tshirt: 212, shirt: 212, blouse: 212, singlet: 212, tank: 212, cami: 212, camisole: 212, corset: 212, bustier: 212, crop: 212,
  jumper: 212, sweater: 212, cardigan: 212, knit: 212, hoodie: 212, sweatshirt: 212, polo: 212, tunic: 212, vest: 212, gilet: 1831,
  bodysuit: 5490, leotard: 5490, jumpsuit: 5250, playsuit: 5250, romper: 5250, overall: 7132, dungaree: 7132, set: 7313, "co-ord": 7313,
  jacket: 5598, coat: 5598, blazer: 5598, puffer: 5598, trench: 5598, parka: 5598, shacket: 5598, bomber: 5598,
  pant: 204, pants: 204, trouser: 204, jean: 204, jogger: 204, trackpant: 204, cargo: 204, chino: 204, legging: 204, culotte: 204, jegging: 204, sweatpant: 204, trackie: 204, capri: 204, palazzo: 204,
  short: 207, shorts: 207, skirt: 1581, skort: 5344, suit: 1594,
  bikini: 211, swimsuit: 211, "one-piece": 211, swimwear: 211, boardshort: 211, rashie: 211,
  pyjama: 2580, pajama: 2580, pj: 2580, robe: 2302, nightie: 5513, nightdress: 5513, loungewear: 5713,
  bra: 214, bralette: 1772, lingerie: 1772, brief: 2562, knicker: 2562, thong: 2562, underwear: 2562, sock: 209, tight: 215, tights: 215, stocking: 215, shapewear: 1578, slip: 5834,
  shoe: 187, boot: 187, heel: 187, sneaker: 187, sandal: 187, flat: 187, loafer: 187, mule: 187, slide: 187, slipper: 187, pump: 187, wedge: 187, espadrille: 187, trainer: 187, clog: 187,
  saree: 8248, sari: 8248, lehenga: 5388, ghagra: 5388, salwar: 5388, anarkali: 5388, sherwani: 5388, cheongsam: 5388, qipao: 5388, hanbok: 5388, dirndl: 6031,
  bag: 3032, handbag: 3032, tote: 3032, clutch: 3032, crossbody: 3032, purse: 2668, wallet: 2668, backpack: 100, duffle: 103, duffel: 103, "bum-bag": 104,
  necklace: 196, earring: 194, ring: 200, bracelet: 191, bangle: 191, anklet: 189, pendant: 192, charm: 192, brooch: 197, watch: 201,
  belt: 169, hat: 173, cap: 173, beanie: 173, beret: 173, scarf: 177, sunglass: 178, sunglasses: 178, glove: 170, fascinator: 7054, headband: 1662, scrunchie: 1483, clip: 502988, claw: 502988,
};
const BABY: Record<number, number> = { 2271: 5424, 212: 5410, 204: 5408, 207: 5408, 1581: 5408, 5598: 5425, 2580: 5412, 211: 5409, 5250: 5622, 7313: 5622 };

/** The Google category for this piece, or null when no rule covers it (Claude's pick from the same list is the fallback). */
export function categoryFor(f: ProductFacts): GoogleCategory | null {
  const type = (f.product_type ?? "").toLowerCase();
  const ws = tokens(type);
  const all = words(f);
  if (/\b(bridal|wedding dress|wedding gown)\b/.test(type) || (ws.includes("dress") && all.includes("bridal"))) return googleCategory(5329);
  if (ws.includes("dress") && all.includes("bridesmaid")) return googleCategory(5330);
  if (/\b(belt bag|bum bag)\b/.test(type)) return googleCategory(104);
  if (/\b(makeup|cosmetic|toiletry) bag\b/.test(type)) return googleCategory(108);
  if (/\bsports? bra\b/.test(type)) return googleCategory(5322);
  let id: number | undefined;
  for (let i = ws.length - 1; i >= 0 && id === undefined; i--) id = TYPE_CATEGORY[ws[i]] ?? TYPE_CATEGORY[singular(ws[i])];
  if (id === undefined) return null;
  // A vest is a top (a knit or crochet sweater vest) unless it's padded or quilted outerwear: then it's a gilet.
  if (ws.includes("vest") && all.some((w) => ["puffer", "padded", "quilted", "down", "gilet", "fleece", "utility", "sherpa"].includes(w))) id = 1831;
  if (id === 204 && ws.some((w) => singular(w) === "legging") && all.some((w) => ["active", "activewear", "gym", "yoga", "sport", "sports", "workout", "running", "training"].includes(w))) id = 5322;
  if (["baby", "toddler", "infant", "newborn"].includes((f.audience ?? "").toLowerCase()) && BABY[id]) id = BABY[id];
  return googleCategory(id);
}

const title = (s: string) => s.replace(/(^|[\s-/])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const plural = (w: string) => (/(s|x|z|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const PLURAL_TYPES: Record<string, string> = { "t-shirt": "T-Shirts", tshirt: "T-Shirts", tee: "Tees", cami: "Camis", jean: "Jeans", short: "Shorts", pant: "Pants", trouser: "Trousers", sunglass: "Sunglasses", legging: "Leggings" };

/** Your own breadcrumb for the product ("Women > Dresses > Maxi Dresses"). Department from who it's for, then category, then style. */
export function breadcrumbFor(f: ProductFacts): string | null {
  const type = (f.product_type ?? "").toLowerCase().trim();
  if (!type) return null;
  const head = type.split(/\s+/);
  const last = singular(head.pop()!);
  const audience = (f.audience ?? "").toLowerCase();
  const dept = /\b(girl|girls)\b/.test(audience) ? "Girls" : /\b(boy|boys)\b/.test(audience) ? "Boys" : /\b(baby|toddler|infant|newborn)\b/.test(audience) ? "Baby"
    : /\b(kid|kids|child|children)\b/.test(audience) ? "Kids" : /\b(men|mens|man)\b/.test(audience) ? "Men" : /\bmaternity\b/.test(audience) ? "Maternity" : "Women";
  const category = PRODUCT_TYPE_CATEGORY[last] ?? PRODUCT_TYPE_CATEGORY[type] ?? null;
  const typePlural = PLURAL_TYPES[last] ? [...head.map(title), PLURAL_TYPES[last]].join(" ") : title([...head, plural(last)].join(" "));
  const crumb = [dept, category ?? typePlural];
  // A style level only when it says something the category doesn't: a length for dresses and skirts, a fit for jeans and pants, the type itself for tops, shoes and bags.
  const style = ["Dresses", "Skirts"].includes(category ?? "") ? f.length.find((l) => /mini|midi|maxi/i.test(l))
    : ["Jeans & Denim", "Pants"].includes(category ?? "") ? f.fit_or_silhouette.find((x) => /baggy|straight|wide|flare|skinny|slim|relaxed|bootcut|mom|barrel|cargo|tailored/i.test(x)) : undefined;
  const sub = style ? `${title(style.toLowerCase())} ${typePlural}` : category && typePlural.toLowerCase() !== category.toLowerCase() && !category.toLowerCase().startsWith(typePlural.toLowerCase()) ? typePlural : null;
  if (sub) crumb.push(sub);
  return crumb.join(" > ");
}

/** Shade names shoppers and brands use -> the plain colour Google wants. Marketing names ("cocoa") stay in the copy. */
const COLOUR_FAMILY: Record<string, string> = {
  black: "Black", jet: "Black", onyx: "Black", ebony: "Black", noir: "Black",
  white: "White", snow: "White", optic: "White",
  cream: "Cream", ivory: "Cream", ecru: "Cream", "off-white": "Cream", bone: "Cream", vanilla: "Cream", oatmeal: "Cream", oat: "Cream", milk: "Cream",
  beige: "Beige", nude: "Beige", sand: "Beige", stone: "Beige", latte: "Beige", biscuit: "Beige", taupe: "Beige", champagne: "Beige", natural: "Beige",
  brown: "Brown", chocolate: "Brown", cocoa: "Brown", mocha: "Brown", espresso: "Brown", coffee: "Brown", chestnut: "Brown", tan: "Brown", camel: "Brown", caramel: "Brown", cognac: "Brown", toffee: "Brown",
  grey: "Grey", gray: "Grey", charcoal: "Grey", slate: "Grey", ash: "Grey", marle: "Grey", graphite: "Grey", pewter: "Grey",
  silver: "Silver", gold: "Gold", rosegold: "Gold", bronze: "Gold", brass: "Gold",
  navy: "Navy", midnight: "Navy",
  blue: "Blue", denim: "Blue", cobalt: "Blue", sky: "Blue", powder: "Blue", indigo: "Blue", teal: "Blue", aqua: "Blue", turquoise: "Blue", cornflower: "Blue", azure: "Blue", royal: "Blue",
  green: "Green", sage: "Green", mint: "Green", emerald: "Green", forest: "Green", lime: "Green", pistachio: "Green", jade: "Green", seafoam: "Green",
  olive: "Olive", khaki: "Khaki",
  yellow: "Yellow", lemon: "Yellow", butter: "Yellow", mustard: "Yellow", canary: "Yellow",
  orange: "Orange", rust: "Orange", coral: "Orange", apricot: "Orange", peach: "Orange", tangerine: "Orange", terracotta: "Orange", burnt: "Orange",
  red: "Red", scarlet: "Red", cherry: "Red", crimson: "Red", tomato: "Red",
  burgundy: "Burgundy", maroon: "Maroon", wine: "Burgundy", merlot: "Burgundy", oxblood: "Burgundy", plum: "Purple",
  pink: "Pink", blush: "Pink", rose: "Pink", fuchsia: "Pink", magenta: "Pink", bubblegum: "Pink", flamingo: "Pink", salmon: "Pink",
  purple: "Purple", lilac: "Purple", lavender: "Purple", mauve: "Purple", violet: "Purple", grape: "Purple", orchid: "Purple",
  matcha: "Green", chartreuse: "Green", periwinkle: "Blue", petrol: "Blue", ink: "Navy", cerise: "Pink", raspberry: "Pink", watermelon: "Pink", ochre: "Yellow",
  brights: "Multicolour", multi: "Multicolour", multicolour: "Multicolour", multicolor: "Multicolour", multicoloured: "Multicolour", rainbow: "Multicolour", clear: "Clear",
};

/** A colour word's plain colour; plurals count ("blues", "greens"). */
const family = (w: string): string | undefined => COLOUR_FAMILY[w] ?? (w.length > 4 && w.endsWith("s") ? COLOUR_FAMILY[w.slice(0, -1)] : undefined);

/** The plain colour of one stated colour ("light dusty pink" -> Pink), or null when no word in it is a known shade. */
export function plainColour(colour: string): string | null {
  const ws = tokens(colour.replace(/rose gold/gi, "rosegold").replace(/off white/gi, "off-white"));
  for (let i = ws.length - 1; i >= 0; i--) if (family(ws[i])) return family(ws[i])!;
  // Denim washes ("light wash", "mid wash", "stonewash") are blue unless a colour is named ("black wash" -> Black, above).
  if (ws.some((w) => /^(wash|washed|stonewash|stonewashed|acid-wash)$/.test(w))) return "Blue";
  return null;
}

// The plain colours that are base hues of a more exact one: "navy blue" is Navy, "olive green" is Olive.
const BASE_HUE: Record<string, string> = { Navy: "Blue", Olive: "Green", Khaki: "Green", Burgundy: "Red", Maroon: "Red", Cream: "White" };
const BASIC = new Set(["black", "white", "blue", "green", "red", "pink", "purple", "yellow", "orange", "brown", "grey", "gray", "gold", "silver"]);

/**
 * The plain colours in one stated colour. Colours joined by "and", "/" or "&" are separate; so is a name made only of
 * colours that are each a colour in their own right ("pink red", "chocolate ecru"). A shade word before a basic colour
 * describes it instead ("coral pink" is Pink, "navy blue" is Navy).
 */
export function plainColours(colour: string): string[] {
  const out: string[] = [];
  for (const part of colour.split(/\s*(?:\/|&|\+|,|\band\b|\bwith\b)\s*/i).filter(Boolean)) {
    const ws = tokens(part.replace(/rose gold/gi, "rosegold").replace(/off white/gi, "off-white"));
    const fams = ws.map(family);
    let found: string[];
    if (ws.length > 1 && fams.every(Boolean) && new Set(fams).size > 1) {
      const last = ws.at(-1)!;
      if (BASE_HUE[fams[0]!] === fams.at(-1)) found = [fams[0]!];
      else if (BASIC.has(last) && !BASIC.has(ws[0])) found = [fams.at(-1)!];
      else found = fams as string[];
    } else {
      const p = plainColour(part);
      found = p ? [p] : [];
    }
    for (const f of found) if (!out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * Google's colour value: up to three plain colours, main colour first, joined with "/". `unmapped` are shades with no
 * plain colour ("hibiscus", a print's name): they aren't sent, since Google wants colours shoppers recognise, and the
 * product data asks a person to add one.
 */
export function googleColour(colours: string[]): { value: string | null; unmapped: string[] } {
  const out: string[] = [];
  const unmapped: string[] = [];
  for (const c of colours) {
    const ps = plainColours(c);
    if (!ps.length) { unmapped.push(c); continue; }
    for (const p of ps) if (!out.includes(p)) out.push(p);
  }
  return { value: out.length ? out.slice(0, 3).join("/") : null, unmapped };
}

const PATTERN: [RegExp, string][] = [
  [/\bfloral|flower|botanical|ditsy\b/, "Floral"], [/\bstrip(e|ed|es)|pinstripe\b/, "Striped"], [/\bgingham\b/, "Gingham"], [/\btartan\b/, "Tartan"], [/\bhoundstooth\b/, "Houndstooth"],
  [/\bcheck(ed)?|plaid\b/, "Check"], [/\bpolka|spot(ted|s)?|dot(s|ted)?\b/, "Polka Dot"], [/\bleopard|animal|snake|zebra|cheetah|tiger|cow print\b/, "Animal Print"],
  [/\bpaisley\b/, "Paisley"], [/\bgeometric|geo\b/, "Geometric"], [/\btie[- ]?dye\b/, "Tie Dye"], [/\bcamo(uflage)?\b/, "Camouflage"], [/\babstract\b/, "Abstract"],
  [/\bplain|solid\b/, "Solid"], [/\bprint(ed)?\b/, "Print"],
];
/** Google's pattern value from the stated pattern ("ditsy floral print" -> Floral), or null when none was given. */
export function googlePattern(patterns: string[]): string | null {
  const text = patterns.join(" ").toLowerCase();
  for (const [re, name] of PATTERN) if (re.test(text)) return name;
  return patterns[0] ? title(patterns[0].toLowerCase()) : null;
}

const FIBRES = ["polyurethane", "cotton", "linen", "silk", "satin", "wool", "cashmere", "viscose", "polyester", "nylon", "elastane", "spandex", "rayon", "modal", "lyocell", "tencel", "leather", "suede", "denim", "chiffon", "lace", "mesh", "velvet", "tulle", "organza", "jersey", "crepe", "acrylic", "bamboo", "hemp", "cupro", "acetate", "corduroy", "tweed", "fleece", "knit", "crochet", "sequin", "straw", "canvas", "rattan", "raffia", "metal", "sterling silver", "stainless steel", "gold plated", "silver plated", "pearl"];
const NOT_MATERIAL = /^(woven|textured|ribbed|quilted|padded|pleated|structured|soft|lightweight|plated|finish)$/;
const CONSTRUCTIONS = new Set(["denim", "knit", "crochet", "lace", "mesh", "jersey", "chiffon", "velvet", "satin", "crepe", "tweed", "corduroy", "fleece", "canvas", "sequin", "tulle", "organza"]);
/** Google's material value from the stated material only ("55% linen 45% viscose" -> Linen/Viscose). Never guessed. */
export function googleMaterial(materials: string[]): string | null {
  if (!materials.length) return null;
  // Brands abbreviate in their fabric lines: "50% recy poly 40% poly 10% vis", "PU".
  const text = materials.join(" ").toLowerCase()
    .replace(/\brecy(?:cled)?\.?\s+poly(?:ester)?\b/g, "recycled polyester").replace(/\bpoly\b|\bpet\b/g, "polyester")
    .replace(/\bvis\b/g, "viscose").replace(/\bpu\b/g, "polyurethane");
  // Each fibre's share where one is stated ("73% viscose"), so the main fibre comes first even when a blend is named
  // after the smaller one ("linen blend": 73% viscose, 27% linen).
  const share = (f: string) => Math.max(-1, ...[...text.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:recycled\\s+|organic\\s+|traceable\\s+)?${f}\\b`, "g"))].map((m) => +m[1]));
  let found = FIBRES.filter((f) => new RegExp(`\\b${f}\\b`).test(text)).sort((a, b) => share(b) - share(a) || text.indexOf(a) - text.indexOf(b));
  // "Cotton denim", "wool knit": the fibre is the material; the weave or knit only counts when no fibre is named.
  if (found.some((f) => !CONSTRUCTIONS.has(f))) found = found.filter((f) => !CONSTRUCTIONS.has(f));
  // A material we don't know is still sent as stated ("raffia"), but a finish or weave on its own isn't a material.
  const stated = materials[0].replace(/\d+\s*%/g, "").trim().toLowerCase();
  const out = (found.length ? found : NOT_MATERIAL.test(stated) ? [] : [stated]).filter(Boolean).slice(0, 3).map(title);
  return out.length ? out.join("/") : null;
}

/** Google's gender and age group. Women's adult is the default for this retailer, as agreed with the brand. */
export function genderAge(audience: string | null, productType: string | null = null): { gender: "Female" | "Male" | "Unisex"; ageGroup: "Adult" | "Kids" | "Toddler" | "Infant" | "Newborn" } {
  const a = (audience ?? "").toLowerCase();
  // A baby's or child's dress or skirt is for girls even when the buyer only said "toddler" or "kids".
  const girlish = /\b(dress|dresses|skirt|skirts|skort|gown|tutu|bikini)\b/i.test(productType ?? "");
  const kid = (ageGroup: "Kids" | "Toddler" | "Infant" | "Newborn") => ({ gender: girlish ? "Female" as const : "Unisex" as const, ageGroup });
  if (/\bnewborn\b/.test(a)) return kid("Newborn");
  if (/\b(baby|infant)\b/.test(a)) return kid("Infant");
  if (/\btoddler\b/.test(a)) return kid("Toddler");
  if (/\b(girl|girls)\b/.test(a)) return { gender: "Female", ageGroup: "Kids" };
  if (/\b(boy|boys)\b/.test(a)) return { gender: "Male", ageGroup: "Kids" };
  if (/\b(kid|kids|child|children|teen|teens)\b/.test(a)) return kid("Kids");
  if (/\b(men|mens|man)\b/.test(a)) return { gender: "Male", ageGroup: "Adult" };
  if (/\bunisex\b/.test(a)) return { gender: "Unisex", ageGroup: "Adult" };
  return { gender: "Female", ageGroup: "Adult" };
}

/** Google's size type from what the buyer said (Regular unless they said petite, plus, tall or maternity). Sizes are Australian. */
export function sizeType(text: string): "Regular" | "Petite" | "Plus" | "Tall" | "Maternity" {
  const t = text.toLowerCase();
  if (/\bmaternity|bump\b/.test(t)) return "Maternity";
  if (/\bpetite\b/.test(t)) return "Petite";
  if (/\bplus[- ]?size|\bplus\b|\bcurve\b/.test(t)) return "Plus";
  if (/\btall\b/.test(t)) return "Tall";
  return "Regular";
}

/** Product-detail names Claude may fill for each kind of piece, and the section each sits in. Only stated details are filled. */
const DETAIL_SECTION: Record<string, string> = {
  Neckline: "Design", Sleeves: "Design", Back: "Design", Collar: "Design", Straps: "Design", Details: "Design", Pattern: "Design", Style: "Design", Toe: "Design", Hardware: "Design", Stone: "Design", Finish: "Design", Wash: "Design", Pockets: "Design", Compartments: "Design",
  Length: "Fit", Fit: "Fit", Silhouette: "Fit", Waist: "Fit", Rise: "Fit", Leg: "Fit", Coverage: "Fit", Support: "Fit", Size: "Fit", "Heel height": "Fit", "Heel type": "Fit", Closure: "Fit", Strap: "Fit",
  Fabric: "Fabric & care", Lining: "Fabric & care", Knit: "Fabric & care", Upper: "Fabric & care", Sole: "Fabric & care", Material: "Fabric & care", Metal: "Fabric & care",
};
export const detailSection = (name: string) => DETAIL_SECTION[name] ?? "Design";
const TRADITIONAL = /\b(sarees?|saris?|lehengas?|ghagras?)\b/;
export function detailNamesFor(f: ProductFacts): string[] {
  if (TRADITIONAL.test((f.product_type ?? "").toLowerCase())) return ["Border", "Blouse", "Drape", "Length", "Fabric", "Pattern", "Embellishment", "Details"];
  const c = PRODUCT_TYPE_CATEGORY[singular((f.product_type ?? "").toLowerCase().split(/\s+/).pop() ?? "")] ?? "";
  if (c === "Dresses" || c === "Jumpsuits & Playsuits") return ["Neckline", "Sleeves", "Straps", "Length", "Silhouette", "Waist", "Back", "Closure", "Lining", "Fabric", "Pattern", "Details"];
  if (c === "Tops" || c === "Knitwear") return ["Neckline", "Sleeves", "Straps", "Fit", "Length", "Closure", "Knit", "Fabric", "Pattern", "Details"];
  if (["Pants", "Jeans & Denim", "Skirts", "Shorts"].includes(c)) return ["Rise", "Fit", "Leg", "Length", "Waist", "Closure", "Pockets", "Wash", "Fabric", "Pattern", "Details"];
  if (c === "Coats & Jackets" || c === "Suits & Blazers") return ["Collar", "Closure", "Length", "Fit", "Lining", "Pockets", "Fabric", "Details"];
  if (c === "Swimwear" || c === "Lingerie & Sleepwear") return ["Style", "Coverage", "Straps", "Support", "Fabric", "Pattern", "Details"];
  if (c === "Shoes") return ["Style", "Heel height", "Heel type", "Toe", "Closure", "Upper", "Sole", "Details"];
  if (c === "Bags") return ["Size", "Strap", "Closure", "Compartments", "Material", "Hardware", "Details"];
  if (c === "Jewellery") return ["Metal", "Finish", "Stone", "Closure", "Style", "Details"];
  return ["Style", "Material", "Size", "Fit", "Closure", "Pattern", "Details"];
}
