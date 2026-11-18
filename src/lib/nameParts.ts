// The name split into its parts for the result screen ("Black" colour, "Mesh Sleeve" detail, "Dress" product).
import { AUDIENCE_TERMS, STOP_WORDS, classify, isGarmentPart, wordStem } from "./vocab/fashion";

const PATTERN_WORDS = new Set(["check", "checked", "checks", "gingham", "plaid", "tartan", "stripe", "striped", "stripes", "floral", "print", "printed", "spot", "spotted", "polka", "dot", "leopard", "animal", "paisley", "abstract", "geometric", "houndstooth", "camo", "ditsy"]);
// The retail word for one the buyer typed ("Square Neck" in the name, "square neckline" in the facts).
const RETAIL: Record<string, string> = { neckline: "neck", necklines: "neck" };

const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9'-]/g, "");
const key = (ws: string[]) => ws.map((w) => wordStem(RETAIL[bare(w)] ?? bare(w))).join(" ");

/** The title split into its parts ("Black" colour, "Mesh Sleeve" detail, "Dress" product), using the buyer's own detail units. */
export function anatomy(title: string, units: string[], productType: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const noun = productType.trim().split(/\s+/).filter(Boolean);
  // Each detail and any run of two or more of its words, so "Zari Border" from "woven zari border" stays one part.
  const spans = new Set<string>();
  for (const u of units) {
    const ws = u.split(/\s+/).filter(Boolean);
    for (let a = 0; a < ws.length; a++) for (let b = a + 1; b <= ws.length; b++) if (b - a > 1 || ws.length === 1) spans.add(ws.slice(a, b).join(" "));
  }
  const unitWords = [...spans].map((u) => u.split(" ")).sort((a, b) => b.length - a.length);
  const parts: { text: string; kind: string }[] = [];
  for (let i = 0; i < words.length;) {
    // "&", "with" and the like join parts; they aren't parts themselves.
    if (!bare(words[i]) || STOP_WORDS.has(bare(words[i]))) { i++; continue; }
    if (noun.length && key(words.slice(i, i + noun.length)) === key(noun)) { parts.push({ text: words.slice(i, i + noun.length).join(" "), kind: "product" }); i += noun.length; continue; }
    const u = unitWords.find((uw) => key(words.slice(i, i + uw.length)) === key(uw));
    const len = u?.length ?? 1;
    const piece = words.slice(i, i + len).map(bare);
    // "Light Pink" is a colour even though "light" isn't; "Girls'" says who it's for.
    const kind = len > 1 && isGarmentPart(piece[len - 1]) ? "detail"
      : AUDIENCE_TERMS.includes(piece[0].replace(/'s?$/, "")) ? "audience"
      : piece.map((w) => classify(w)).find((c) => c === "colour") ?? (len === 1 && PATTERN_WORDS.has(piece[0]) ? "pattern" : null) ?? classify(piece[0]) ?? "detail";
    parts.push({ text: words.slice(i, i + len).join(" "), kind });
    i += len;
  }
  return parts;
}
