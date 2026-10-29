import { describe, expect, it } from "vitest";
import { COPY, plain, plainList } from "@/lib/copy";

describe("older stored sentences read in plain words", () => {
  it("translates the old engineer wording to today's buyer wording", () => {
    expect(plain("Strongest keyword in the dataset for this product (8,100 searches)")).toBe(COPY.query.mostSearched(8100));
    expect(plain("Buyer's attributes in the order the keyword list uses them")).toBe(COPY.query.yourDetails);
    expect(plain("Live search results were unavailable; recommendation used the keyword dataset only.")).toBe(COPY.googleUnavailable);
    expect(plain("Limited keyword evidence: no keyword in the dataset matched this product's details. No search demand is claimed.")).toBe(COPY.noMatchingSearches);
    expect(plain("colour was not supplied")).toBe(COPY.missing.colour);
    expect(plain("Length: mini and maxi can't both be true")).toBe("It can't be both mini and maxi. Which length is it?");
    expect(plain(`We couldn't find "vase" in the keyword data. Choose a more specific product type (e.g. dress, top, boots).`)).toBe(COPY.unknownType("vase"));
    expect(plain(`Live search for "black midi dress" failed: DataForSEO 500`)).toBe(COPY.googlePartial);
  });

  it("hides engineer-only notes and leaves ordinary sentences alone", () => {
    expect(plainList([`Dropped alternative "X Dress": Alternative uses words the buyer did not supply: red`, "Extra alternatives were dropped (maximum 3)", "A lovely, clear name."]))
      .toEqual(["A lovely, clear name."]);
  });
});
