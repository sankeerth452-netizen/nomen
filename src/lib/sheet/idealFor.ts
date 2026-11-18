// "Ideal for": 1-4 occasion tags from a fixed list. Claude suggests them with a reason; code then checks each one
// against the product's own details (a cotton t-shirt dress is never "wedding guest") and against what shoppers search
// in the brand's keyword list. Only tags that pass both, at high confidence, reach the live copy; the rest go to review.
import type { ProductFacts } from "../providers/types";
import { googleColour } from "./catalog";

export type Occasion = {
  key: string; label: string;
  /** How the occasion reads in "Ideal for ..." */
  phrase: string;
  /** Searches that show shoppers want this occasion. "{type}" becomes the product type ("wedding guest jumpsuit"). */
  demand: string[];
  kind: "formal" | "sensitive" | "active" | "lounge" | "maternity" | "beach" | "holiday" | "work" | "festive" | "evening" | "day" | "travel";
};

export const OCCASIONS: Occasion[] = [
  { key: "wedding_guest", label: "Wedding guest", phrase: "wedding guests", demand: ["wedding guest dress", "wedding guest dresses", "wedding guest {type}", "wedding guest outfit"], kind: "formal" },
  { key: "cocktail", label: "Cocktail", phrase: "cocktail evenings", demand: ["cocktail dress", "cocktail dresses", "cocktail {type}"], kind: "formal" },
  { key: "formal", label: "Formal and black tie", phrase: "formal and black-tie events", demand: ["formal dress", "formal dresses", "black tie dress", "evening gown", "formal gown", "ball gown", "formal {type}"], kind: "formal" },
  { key: "races", label: "Races", phrase: "the races", demand: ["races dress", "races dresses", "races outfit", "melbourne cup dress", "spring racing dress", "oaks day dress", "race day dress", "races {type}"], kind: "formal" },
  { key: "graduation", label: "Graduation", phrase: "graduations", demand: ["graduation dress", "graduation dresses", "grad dress", "graduation {type}"], kind: "formal" },
  { key: "work", label: "Work and office", phrase: "the office", demand: ["work dress", "work dresses", "office wear", "workwear", "work {type}", "office {type}"], kind: "work" },
  { key: "date_night", label: "Date night", phrase: "date nights", demand: ["date night dress", "date night outfit", "date night top", "date night {type}"], kind: "evening" },
  { key: "going_out", label: "Going out", phrase: "nights out", demand: ["going out top", "going out tops", "going out dress", "night out dress", "party dress", "party dresses", "going out {type}", "party {type}"], kind: "evening" },
  { key: "brunch", label: "Brunch and lunch", phrase: "brunch and long lunches", demand: ["brunch outfit", "brunch dress", "lunch outfit", "brunch {type}"], kind: "day" },
  { key: "holiday", label: "Holiday and resort", phrase: "holidays", demand: ["resort wear", "holiday dress", "holiday outfit", "resort dress", "vacation dress", "holiday {type}", "resort {type}"], kind: "holiday" },
  { key: "beach", label: "Beach", phrase: "days at the beach", demand: ["beach dress", "beach cover up", "beachwear", "beach outfit", "beach {type}"], kind: "beach" },
  { key: "everyday", label: "Everyday casual", phrase: "everyday wear", demand: ["casual dress", "casual dresses", "casual top", "everyday dress", "casual {type}"], kind: "day" },
  { key: "active", label: "Gym and active", phrase: "the gym", demand: ["activewear", "gym wear", "gym set", "workout clothes", "gym top", "gym leggings", "sports bra", "gym {type}"], kind: "active" },
  { key: "lounge", label: "Lounge and sleep", phrase: "lounging at home", demand: ["loungewear", "pyjamas", "pjs", "sleepwear", "lounge set", "pyjama set", "lounge {type}"], kind: "lounge" },
  { key: "travel", label: "Travel", phrase: "travel days", demand: ["travel outfit", "travel clothes", "travel pants", "airport outfit", "travel {type}"], kind: "travel" },
  { key: "maternity", label: "Maternity", phrase: "pregnancy", demand: ["maternity dress", "maternity dresses", "maternity clothes", "maternity wear", "maternity {type}"], kind: "maternity" },
  { key: "church_funeral", label: "Church and funeral", phrase: "church and memorial services", demand: ["funeral dress", "funeral outfit", "church dress", "church outfit", "funeral {type}"], kind: "sensitive" },
  { key: "festive", label: "Christmas and festive", phrase: "Christmas and festive parties", demand: ["christmas dress", "christmas party dress", "christmas outfit", "christmas party outfit", "festive dress", "christmas top", "christmas {type}"], kind: "festive" },
];
export const OCCASION_KEYS = OCCASIONS.map((o) => o.key);
const BY_KEY = new Map(OCCASIONS.map((o) => [o.key, o]));
export const occasion = (key: string) => BY_KEY.get(key) ?? null;

/** Fewer monthly searches than this and an occasion isn't worth tagging without a person checking it. */
export const DEMAND_FLOOR = 100;

const has = (ws: Set<string>, list: string[]) => list.find((w) => ws.has(w)) ?? null;
const CASUAL = ["tee", "t-shirt", "tshirt", "tank", "singlet", "hoodie", "hoodies", "sweatshirt", "sweat", "trackpant", "trackpants", "track", "jogger", "joggers", "legging", "leggings", "cargo", "fleece", "denim", "jean", "jeans", "pyjama", "pyjamas", "pj", "pjs", "sleep", "sleepwear", "lounge", "loungewear", "sneaker", "sneakers", "slide", "slides", "active", "activewear", "gym", "sport", "sports", "workout", "swim", "swimwear", "bikini", "rashie", "boardshort", "flannel", "utility", "backpack"];
const DRESSY = ["satin", "silk", "sequin", "sequins", "sequinned", "velvet", "chiffon", "lace", "beaded", "beading", "embellished", "organza", "tulle", "crepe", "corset", "draped", "slip", "gown", "metallic", "lurex", "taffeta", "jacquard", "brocade", "feather", "pearl", "diamante", "rhinestone", "embroidered", "pleated", "ruched", "one-shoulder", "halter", "cowl", "structured", "tailored", "bias",
  // Traditional occasion wear: a zari saree or a lehenga is dressed up by nature.
  "zari", "zardozi", "banarasi", "kanjeevaram", "kanchipuram", "saree", "sari", "lehenga", "anarkali", "sherwani"];
const LONG = ["maxi", "floor", "floor-length", "gown", "full-length", "saree", "sari", "lehenga"];
const PARTY = ["sequin", "sequins", "metallic", "sheer", "cut-out", "cutout", "backless", "plunge", "plunging", "bralette", "micro", "corset", "glitter", "lurex"];
const BLOCK_SOBER = [...PARTY, "mini", "bodycon", "slit", "split", "strapless", "crop", "cropped", "neon", "feather", "ruffle", "frill", "tiered", "floral", "leopard", "animal", "print", "printed"];
const SOBER_COLOURS = new Set(["Black", "Navy", "Grey", "Charcoal", "Brown"]);
const ACTIVE = ["active", "activewear", "gym", "sport", "sports", "workout", "yoga", "pilates", "running", "training", "tennis", "performance", "bike"];
const LOUNGE = ["lounge", "loungewear", "pyjama", "pyjamas", "pj", "pjs", "sleep", "sleepwear", "robe", "nightie", "slipper", "slippers", "fleece", "sweat", "sweatshirt", "hoodie", "trackpant", "jogger", "joggers"];
const BEACH = ["swim", "swimwear", "bikini", "kaftan", "cover-up", "coverup", "sarong", "linen", "crochet", "straw", "sandal", "sandals", "beach", "resort", "raffia", "rattan", "sundress"];
const HOLIDAY = [...BEACH, "maxi", "floral", "broderie", "sun", "summer", "holiday", "vacation", "tropical"];
const FESTIVE = ["christmas", "festive", "sequin", "sequins", "velvet", "metallic", "glitter", "satin", "red", "green", "lurex", "tinsel"];
const SWIM_OR_SLEEP = ["swim", "swimwear", "bikini", "swimsuit", "one-piece", "boardshort", "rashie", "pyjama", "pyjamas", "pj", "pjs", "sleep", "sleepwear", "nightie", "robe", "lingerie", "bra", "bralette", "brief", "briefs"];

export type TagSuggestion = { tag: string; confidence: "high" | "low"; reason: string };
export type TagVerdict = { key: string; label: string; outcome: "live" | "review" | "dropped"; reason: string; demand: number | null };

/** The words that describe the piece: what the evidence rules read. */
export function factWords(f: ProductFacts, extra = ""): Set<string> {
  const text = [f.product_type ?? "", ...f.colour, ...f.material, ...f.pattern, ...f.fit_or_silhouette, ...f.length, ...f.features, ...f.occasion_or_style, f.audience ?? "", extra].join(" ").toLowerCase();
  return new Set(text.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []);
}

/** Does the piece's own detail support the occasion? "ok", "weak" (review it) or a reason it doesn't fit at all. */
export function evidenceFor(o: Occasion, ws: Set<string>, f: ProductFacts): { fit: "ok" | "weak" | "no"; why: string } {
  const swimOrSleep = has(ws, SWIM_OR_SLEEP);
  if (swimOrSleep && !["beach", "holiday", "lounge"].includes(o.kind)) return { fit: "no", why: `it's ${swimOrSleep}` };
  switch (o.kind) {
    case "formal": {
      const casual = has(ws, CASUAL);
      if (casual) return { fit: "no", why: `"${casual}" is too casual for it` };
      if (o.key === "formal" && !has(ws, LONG)) return { fit: "weak", why: "formal and black-tie pieces are usually full length, and this one isn't said to be" };
      return has(ws, DRESSY) ? { fit: "ok", why: "" } : { fit: "weak", why: "nothing in the details shows it's dressy enough (fabric, finish or cut)" };
    }
    case "sensitive": {
      const loud = has(ws, BLOCK_SOBER);
      if (loud) return { fit: "no", why: `"${loud}" isn't plainly sober` };
      const colours = (googleColour(f.colour).value ?? "").split("/").filter(Boolean);
      if (!colours.length || !colours.every((c) => SOBER_COLOURS.has(c))) return { fit: "no", why: "only tagged for plainly sober colours (black, navy, grey, brown)" };
      if (f.pattern.length && !/plain|solid/i.test(f.pattern.join(" "))) return { fit: "no", why: "only tagged for plain pieces" };
      return { fit: "ok", why: "" };
    }
    case "active": return has(ws, ACTIVE) ? { fit: "ok", why: "" } : { fit: "no", why: "nothing says it's made for exercise" };
    case "lounge": return has(ws, LOUNGE) ? { fit: "ok", why: "" } : { fit: "weak", why: "nothing says it's made for lounging or sleep" };
    case "maternity": return ws.has("maternity") || ws.has("bump") || ws.has("pregnancy") ? { fit: "ok", why: "" } : { fit: "no", why: "only for pieces described as maternity" };
    case "beach": return has(ws, BEACH) ? { fit: "ok", why: "" } : { fit: "weak", why: "nothing in the details points to the beach" };
    case "holiday": return has(ws, HOLIDAY) ? { fit: "ok", why: "" } : { fit: "weak", why: "nothing in the details points to holidays" };
    case "festive": return has(ws, FESTIVE) ? { fit: "ok", why: "" } : { fit: "weak", why: "nothing in the details is festive" };
    case "work": {
      const party = has(ws, [...PARTY, "swim", "bikini", "gym", "lounge", "pyjama", "sleep"]);
      return party ? { fit: "no", why: `"${party}" doesn't suit the office` } : { fit: "ok", why: "" };
    }
    case "evening": {
      const off = has(ws, ["lounge", "loungewear", "pyjama", "sleep", "gym", "active", "activewear", "swim", "bikini", "hoodie", "trackpant", "jogger"]);
      return off ? { fit: "no", why: `"${off}" doesn't suit a night out` } : { fit: "ok", why: "" };
    }
    case "day": {
      const off = has(ws, ["gown", "bridal", "pyjama", "sleep", "swim", "bikini"]);
      return off ? { fit: "no", why: `"${off}" doesn't suit it` } : { fit: "ok", why: "" };
    }
    case "travel": {
      const off = has(ws, ["gown", "sequin", "sequins", "swim", "bikini", "bridal"]);
      return off ? { fit: "no", why: `"${off}" doesn't suit travel` } : { fit: "ok", why: "" };
    }
  }
}

/** The searches that measure demand for an occasion, for this product type. */
export function demandPhrases(o: Occasion, productType: string | null): string[] {
  const t = (productType ?? "").toLowerCase().trim();
  const forms = t ? [...new Set([t, t.endsWith("s") ? t : `${t}s`])] : [];
  return [...new Set(o.demand.flatMap((p) => (p.includes("{type}") ? forms.map((f) => p.replace("{type}", f)) : [p])))];
}

/**
 * Decide each suggested tag. Live = Claude was confident, the details support it and shoppers search for it.
 * `volumes` maps a normalised search phrase to its monthly searches; null means there is no keyword list to check.
 */
export function judgeTags(suggested: TagSuggestion[], f: ProductFacts, volumes: Map<string, number> | null, extra = ""): TagVerdict[] {
  const ws = factWords(f, extra);
  const seen = new Set<string>();
  const out: TagVerdict[] = [];
  for (const s of suggested) {
    const o = occasion(s.tag);
    if (!o || seen.has(o.key)) continue;
    seen.add(o.key);
    const ev = evidenceFor(o, ws, f);
    if (ev.fit === "no") { out.push({ key: o.key, label: o.label, outcome: "dropped", reason: `Left out: ${ev.why}.`, demand: null }); continue; }
    const demand = volumes ? Math.max(0, ...demandPhrases(o, f.product_type).map((p) => volumes.get(p) ?? 0)) : null;
    const reasons: string[] = [];
    if (s.confidence !== "high") reasons.push(s.reason || "not a clear fit");
    if (ev.fit === "weak") reasons.push(ev.why);
    if (demand === null) reasons.push("there's no keyword list to check that shoppers search for it");
    else if (demand < DEMAND_FLOOR) reasons.push(demand === 0 ? "the keyword list shows no searches for it" : `only about ${demand.toLocaleString("en-AU")} searches a month for it`);
    const live = reasons.length === 0;
    const said = reasons.map((r) => r.trim().replace(/[.!?]+$/, "")).join("; ");
    out.push({ key: o.key, label: o.label, outcome: live ? "live" : "review", reason: live ? s.reason : `${said[0].toUpperCase()}${said.slice(1)}.`, demand });
  }
  // At most four tags: the live ones first.
  const live = out.filter((v) => v.outcome === "live").slice(0, 4);
  const review = out.filter((v) => v.outcome === "review").slice(0, Math.max(0, 4 - live.length));
  return [...live, ...review, ...out.filter((v) => v.outcome === "dropped")];
}

/** "Ideal for wedding guests, cocktail evenings and the races." from the live tags only. */
export function idealForSentence(verdicts: TagVerdict[]): string | null {
  const phrases = verdicts.filter((v) => v.outcome === "live").slice(0, 3).map((v) => occasion(v.key)!.phrase);
  if (!phrases.length) return null;
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
  return `Ideal for ${list}.`;
}

const WARM = ["wool", "woollen", "knit", "knitted", "cashmere", "fleece", "puffer", "padded", "quilted", "coat", "boot", "boots", "velvet", "corduroy", "teddy", "sherpa", "fur", "turtleneck", "thermal"];
const LIGHT = ["linen", "sleeveless", "strapless", "strappy", "swim", "bikini", "sandal", "sandals", "crochet", "broderie", "kaftan", "sundress", "tank", "cami", "singlet", "shorts"];
export type Season = { value: "summer" | "winter" | "trans-seasonal"; confidence: "high" | "low"; reason: string };
/** Keep Claude's season unless the details contradict it (a wool coat isn't summer). Contradicted -> low, for review. */
export function judgeSeason(s: Season | null, f: ProductFacts): Season | null {
  if (!s) return null;
  const ws = factWords(f);
  if (s.value === "summer" && has(ws, WARM)) return { ...s, confidence: "low", reason: `"${has(ws, WARM)}" suggests cooler weather.` };
  if (s.value === "winter" && has(ws, LIGHT)) return { ...s, confidence: "low", reason: `"${has(ws, LIGHT)}" suggests warmer weather.` };
  return s;
}
