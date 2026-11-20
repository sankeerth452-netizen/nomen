// The colour a Google colour value looks like, for the screens: a filled circle per colour instead of the word.
// The word is still what Google gets (and what's copied); this is only how it's shown.
import { plainColour } from "./catalog";

const SWATCH: Record<string, string> = {
  Black: "#1c1c1c", White: "#ffffff", Cream: "#f3ead7", Beige: "#d8c3a2", Brown: "#6b4226", Grey: "#8d8d8d",
  Silver: "linear-gradient(135deg, #f4f4f4, #a9a9a9 55%, #e8e8e8)", Gold: "linear-gradient(135deg, #f7e27c, #c79a2c 55%, #f2d67a)",
  Navy: "#1f2a4d", Blue: "#2f6fd0", Green: "#2e8b57", Olive: "#6b6b2a", Khaki: "#b5a26a", Yellow: "#f2c94c", Orange: "#e8803a",
  Red: "#c62828", Burgundy: "#6d1a2e", Maroon: "#7b1e2b", Pink: "#f4a6c0", Purple: "#7e57c2",
  Multicolour: "conic-gradient(#e53935, #fb8c00, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)",
  Clear: "repeating-conic-gradient(#e6e6e6 0 25%, #ffffff 0 50%) 50% / 8px 8px",
};

/** Each colour in a value ("Maroon/Gold"), with how to paint it; `paint` is null for a colour we can't show. */
export function swatchesFor(value: string | null): { name: string; paint: string | null }[] {
  return (value ?? "").split("/").map((c) => c.trim()).filter(Boolean).map((name) => {
    const known = SWATCH[name] ?? SWATCH[plainColour(name) ?? ""] ?? null; // a brand's own shade ("Cocoa") shows as its plain colour
    return { name, paint: known };
  });
}
