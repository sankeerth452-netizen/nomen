import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { feedPieces } from "@/lib/batch/ranges";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { applyReviewEdits, cleanFieldValue, currentValue, type ResultLike } from "@/lib/review/fields";
import { can } from "@/lib/review/permissions";
import { act, addComment, editField, ensureReview, initialStatus, restoreField } from "@/lib/review/workflow";
import { resetDb, seedBrand } from "./helpers";

const providers: Providers = { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" };
const dress = { freeText: "black midi dress with ruching", productType: "dress", colour: "black", length: "midi", feature: "ruched" };
const su = (u: { id: string; username: string; displayName: string; role: Role; brandId: string | null }) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, brandId: u.brandId, brandName: null });

async function named() {
  const { brand, user } = await seedBrand();
  const id = await createGeneration({ id: user.id, brandId: brand.id }, brand.id, dress);
  await runPipeline(id, providers);
  const g = await db.generation.findUniqueOrThrow({ where: { id } });
  return { brand, user, g };
}
const login = (brandId: string, role: Role, username: string = role) => db.user.create({ data: { username, displayName: username, passwordHash: "x", role, brandId } });

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("a named product's review", () => {
  it("starts when naming finishes, and never as approved", async () => {
    const { g } = await named();
    const r = await db.productReview.findUniqueOrThrow({ where: { generationId: g.id } });
    expect(["ai_generated", "needs_review"]).toContain(r.status);
    expect(initialStatus({ confidence: "medium", result: g.result })).toBe("needs_review");
  });

  it("keeps every change with who made it, and a change to an approved product sends it back to review", async () => {
    const { g, user } = await named();
    let r = (await ensureReview(g))!;
    r = await act(r, user.id, "approve", g.result as ResultLike);
    expect(r.status).toBe("approved");
    r = await editField(r, user.id, "name", "Black Ruched Midi Dress");
    expect(r.status).toBe("needs_review");
    expect(r.approvedAt).toBeNull();
    expect(currentValue(g.result as ResultLike, r.edits as Record<string, unknown>, "name")).toBe("Black Ruched Midi Dress");
    const revs = await db.reviewRevision.findMany({ where: { reviewId: r.id }, orderBy: { createdAt: "asc" } });
    expect(revs.map((x) => [x.field, x.source, x.userId])).toEqual([["status", "status", user.id], ["name", "human", user.id]]);
  });

  it("approves field by field; the product is approved once every field with a value is", async () => {
    const { g, user } = await named();
    let r = (await ensureReview(g))!;
    r = await act(r, user.id, "approve", g.result as ResultLike, ["name"]);
    expect(r.status).toBe("needs_review");
    expect((r.fieldStatus as Record<string, string>).name).toBe("approved");
    await expect(act(r, user.id, "ready", g.result as ResultLike)).rejects.toThrow(/Approve it first/);
    r = await act(r, user.id, "reject", g.result as ResultLike, ["metaTitle"]);
    expect((r.fieldStatus as Record<string, string>).metaTitle).toBe("rejected");
    r = await act(r, user.id, "approve", g.result as ResultLike);
    r = await act(r, user.id, "ready", g.result as ResultLike);
    expect(r.status).toBe("ready_to_export");
  });

  it("brings back an earlier version or the AI's own, and takes comments that flag AI mistakes", async () => {
    const { g, user } = await named();
    let r = (await ensureReview(g))!;
    const ai = currentValue(g.result as ResultLike, {}, "name");
    r = await editField(r, user.id, "name", "First Try Dress");
    const first = await db.reviewRevision.findFirstOrThrow({ where: { reviewId: r.id, field: "name" } });
    r = await editField(r, user.id, "name", "Second Try Dress");
    r = await restoreField(r, user.id, "name", { revisionId: first.id }, g.result as ResultLike);
    expect((r.edits as Record<string, unknown>).name).toBe("First Try Dress");
    r = await restoreField(r, user.id, "name", { ai: true }, g.result as ResultLike);
    expect(currentValue(g.result as ResultLike, r.edits as Record<string, unknown>, "name")).toBe(ai);
    await addComment(r, user.id, "The length is wrong", "name", true);
    await expect(addComment(r, user.id, "   ", null, false)).rejects.toThrow(/Write something/);
    expect(await db.reviewComment.count({ where: { reviewId: r.id, flag: true } })).toBe(1);
  });

  it("checks people's values against each field's limits", () => {
    expect(cleanFieldValue("name", "")).toEqual({ error: "A product needs a name." });
    expect(cleanFieldValue("metaTitle", "x".repeat(71))).toMatchObject({ error: expect.stringMatching(/at most 70/) });
    expect(cleanFieldValue("gender", "Women")).toMatchObject({ error: expect.stringMatching(/one of/) });
    expect(cleanFieldValue("idealFor", ["cocktail", "not_an_occasion"])).toMatchObject({ error: expect.any(String) });
    expect(cleanFieldValue("category", 2271)).toEqual({ value: { id: 2271, path: "Clothing & Accessories > Clothing > Dresses" } });
    expect(cleanFieldValue("highlights", [" Ruched ", "", "Midi length"])).toEqual({ value: ["Ruched", "Midi length"] });
  });

  it("applies people's changes to the product data: occasions update the sentence and custom label 0", async () => {
    const { g } = await named();
    const out = applyReviewEdits(g.result as ResultLike, { name: "Edited Black Dress", idealFor: ["cocktail", "date_night"], highlights: ["Ruched body"] });
    expect(out.recommendation?.recommended_title).toBe("Edited Black Dress");
    if (out.sheet?.status !== "ready") throw new Error("no sheet");
    expect(out.sheet.idealFor.sentence).toBe("Ideal for cocktail evenings and date nights.");
    expect(out.sheet.google.customLabels[0]).toBe("Cocktail");
    expect(out.sheet.highlights).toEqual(["Ruched body"]);
    expect((g.result as ResultLike).recommendation?.recommended_title).not.toBe("Edited Black Dress"); // the AI's own stays
  });
});

describe("who may do what", () => {
  it("editors edit, reviewers approve, admins do both; a brand can change it", () => {
    expect(can({ role: "editor" }, "edit")).toBe(true);
    expect(can({ role: "editor" }, "approve")).toBe(false);
    expect(can({ role: "reviewer" }, "approve")).toBe(true);
    expect(can({ role: "reviewer" }, "edit")).toBe(false);
    expect(can({ role: "admin" }, "approve")).toBe(true);
    expect(can({ role: "buyer" }, "edit")).toBe(true); // older logins work as before
    expect(can({ role: "reviewer" }, "edit", { permissions: { edit: ["reviewer", "admin"] } })).toBe(true);
  });

  it("reviewers see the whole brand; editors see their own; other brands see nothing", async () => {
    const { brand, g } = await named();
    const reviewer = await login(brand.id, "reviewer");
    const editor = await login(brand.id, "editor");
    const otherBrand = await db.brand.create({ data: { name: "O", slug: "o" } });
    const outsider = await login(otherBrand.id, "reviewer", "outsider");
    await expect(loadGenerationFor(su(reviewer), g.id)).resolves.toMatchObject({ id: g.id });
    await expect(loadGenerationFor(su(editor), g.id)).rejects.toMatchObject({ status: 404 });
    await expect(loadGenerationFor(su(outsider), g.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("exports", () => {
  it("send people's edits to Google, and only approved products when the brand requires approval", async () => {
    const { brand, user, g } = await named();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "File", source: "file" } });
    await db.batchItem.create({ data: { batchId: b.id, position: 1, filename: "Dress", status: "named", generationId: g.id, details: { fields: dress, fromPhoto: [], unsure: [] }, feed: { rows: [{ row: 2, attrs: { id: "SKU1", title: "Dress" } }], issues: [] } } });
    let r = (await ensureReview(g))!;
    r = await editField(r, user.id, "name", "Black Ruched Midi Dress");
    expect((await feedPieces(b.id, false)).map((p) => p.name)).toEqual(["Black Ruched Midi Dress"]);
    expect(await feedPieces(b.id, true)).toEqual([]); // not approved yet
    await act(r, user.id, "approve", g.result as ResultLike);
    expect((await feedPieces(b.id, true)).map((p) => p.name)).toEqual(["Black Ruched Midi Dress"]);
  });
});
