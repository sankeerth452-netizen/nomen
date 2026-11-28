// Brands are kept apart through the real request handlers, signed in as real people: everyone at brand B, whatever
// their role, tries every request against brand A's products, ranges, photos, reviews, keyword lists, logins and
// Google connection. None of it may answer with A's data or change it. The owner (and A's own people) still can.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role, User } from "@prisma/client";

const jar = vi.hoisted(() => ({ token: "", workspace: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "pno_session" && jar.token ? { name: n, value: jar.token } : n === "pno_workspace" && jar.workspace ? { name: n, value: jar.workspace } : undefined),
    set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers(),
}));

import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/auth/session";
import { resetDb } from "./helpers";
import * as gens from "@/app/api/generations/route";
import * as gen from "@/app/api/generations/[id]/route";
import * as genContent from "@/app/api/generations/[id]/content/route";
import * as genFeedback from "@/app/api/generations/[id]/feedback/route";
import * as genPhoto from "@/app/api/generations/[id]/photo/route";
import * as genPhotos from "@/app/api/generations/[id]/photos/[position]/route";
import * as genRetry from "@/app/api/generations/[id]/retry/route";
import * as genSheet from "@/app/api/generations/[id]/sheet/route";
import * as ranges from "@/app/api/ranges/route";
import * as range from "@/app/api/ranges/[id]/route";
import * as rangeApply from "@/app/api/ranges/[id]/apply/route";
import * as rangeDownload from "@/app/api/ranges/[id]/download/route";
import * as rangeFeed from "@/app/api/ranges/[id]/feed/route";
import * as rangeFile from "@/app/api/ranges/[id]/file/route";
import * as rangeItems from "@/app/api/ranges/[id]/items/route";
import * as rangeItem from "@/app/api/ranges/[id]/items/[itemId]/route";
import * as rangeItemPhoto from "@/app/api/ranges/[id]/items/[itemId]/photo/route";
import * as rangeItemPhotos from "@/app/api/ranges/[id]/items/[itemId]/photos/route";
import * as rangeItemPhotoAt from "@/app/api/ranges/[id]/items/[itemId]/photos/[position]/route";
import * as rangeName from "@/app/api/ranges/[id]/name/route";
import * as rangeReport from "@/app/api/ranges/[id]/report/route";
import * as rangeRetry from "@/app/api/ranges/[id]/retry/route";
import * as rangeSummary from "@/app/api/ranges/[id]/summary/route";
import * as review from "@/app/api/reviews/[id]/route";
import * as reviewAction from "@/app/api/reviews/[id]/action/route";
import * as reviewComments from "@/app/api/reviews/[id]/comments/route";
import * as reviewRestore from "@/app/api/reviews/[id]/restore/route";
import * as corrections from "@/app/api/reviews/corrections/route";
import * as adminBrand from "@/app/api/admin/brand/route";
import * as adminBrandLearn from "@/app/api/admin/brand/learn/route";
import * as adminBrands from "@/app/api/admin/brands/route";
import * as datasets from "@/app/api/admin/datasets/route";
import * as datasetActivate from "@/app/api/admin/datasets/[id]/activate/route";
import * as datasetRejections from "@/app/api/admin/datasets/[id]/rejections/route";
import * as datasetValidate from "@/app/api/admin/datasets/validate/route";
import * as users from "@/app/api/admin/users/route";
import * as googleCategories from "@/app/api/admin/google-categories/route";
import * as googleConnection from "@/app/api/google/connection/route";
import * as googleConnect from "@/app/api/google/connect/route";
import * as googleSync from "@/app/api/google/sync/route";
import * as workspace from "@/app/api/workspace/route";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(mod: Record<string, unknown>, method: string, url: string, params: Record<string, string> = {}, body?: unknown) {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "content-type": "application/json" }; }
  return (mod[method] as Handler)(new Request(`http://localhost${url}`, init), { params: Promise.resolve(params) });
}
async function signIn(u: User, workspaceId = "") {
  jar.token = await createSessionToken(u.id, u.sessionVersion);
  jar.workspace = workspaceId;
}
const SECRET = "A-SECRET";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

let A: Awaited<ReturnType<typeof brandWith>>, B: Awaited<ReturnType<typeof brandWith>>, owner: User;
let A_admin_hash = "";

async function brandWith(slug: string) {
  const brand = await db.brand.create({ data: { name: slug === "a" ? "Brand A" : "Brand B", slug } });
  const mk = (role: Role) => db.user.create({ data: { username: `${slug}-${role}`, displayName: `${slug} ${role}`, passwordHash: `hash-${slug}-${role}`, role, brandId: brand.id } });
  const people = { admin: await mk("admin"), editor: await mk("editor"), reviewer: await mk("reviewer"), buyer: await mk("buyer") };
  const tag = slug === "a" ? SECRET : "B-own";
  const g = await db.generation.create({
    data: {
      brandId: brand.id, userId: people.editor.id, originalInput: { productType: "dress", freeText: `${tag} dress` }, status: "completed", confidence: "high",
      result: { recommendation: { recommended_title: `${tag} Dress` } }, candidateEvidence: { serp: [] },
      photo: { create: { mediaType: "image/png", data: new Uint8Array(PNG) } },
      images: { create: [{ position: 1, photo: new Uint8Array(PNG), photoType: "image/png" }] },
    },
  });
  const rv = await db.productReview.create({ data: { generationId: g.id, brandId: brand.id } });
  await db.reviewRevision.create({ data: { reviewId: rv.id, field: "title", source: "human", value: `${tag} corrected title`, userId: people.admin.id } });
  const r = await db.batch.create({ data: { brandId: brand.id, userId: people.editor.id, title: `${tag} range` } });
  const item = await db.batchItem.create({ data: { batchId: r.id, position: 1, filename: `${tag}.jpg`, status: "review", photo: new Uint8Array(PNG), photoType: "image/png", details: { productType: "dress", freeText: `${tag} dress` }, images: { create: [{ position: 1, photo: new Uint8Array(PNG), photoType: "image/png" }] } } });
  const ds = await db.keywordDataset.create({ data: { brandId: brand.id, name: `${tag} list`, status: "archived", rowsAccepted: 1 } });
  await db.datasetRejection.create({ data: { datasetId: ds.id, rowNumber: 2, keyword: `${tag} keyword`, reason: "no volume" } });
  await db.googleConnection.create({ data: { brandId: brand.id, email: `${tag}@example.com`, scopes: [], refreshToken: "x", connectedById: people.admin.id } });
  return { brand, ...people, g, rv, r, item, ds };
}

beforeAll(async () => {
  await resetDb();
  A = await brandWith("a");
  B = await brandWith("b");
  owner = await db.user.create({ data: { username: "owner", displayName: "Owner", passwordHash: "x", role: "owner" } });
  A_admin_hash = A.admin.passwordHash;
});
afterAll(() => db.$disconnect());

/** Every request someone at brand B could aim at brand A's things. */
function probes() {
  const g = { id: A.g.id }, r = { id: A.r.id }, it = { id: A.r.id, itemId: A.item.id };
  const learn = new FormData(); learn.set("brandId", A.brand.id);
  const upload = new FormData(); upload.set("brandId", A.brand.id); upload.set("file", new File(["Keyword,Volume\nx,1\n"], "k.csv", { type: "text/csv" }));
  return [
    ["open A's product", () => call(gen, "GET", `/api/generations/${A.g.id}`, g)],
    ["change A's product", () => call(gen, "PATCH", `/api/generations/${A.g.id}`, g, { isTest: true })],
    ["write A's product page", () => call(genContent, "POST", `/api/generations/${A.g.id}/content`, g, {})],
    ["give feedback on A's product", () => call(genFeedback, "POST", `/api/generations/${A.g.id}/feedback`, g, { verdict: "used" })],
    ["see A's product photo", () => call(genPhoto, "GET", `/api/generations/${A.g.id}/photo`, g)],
    ["see A's product's other photo", () => call(genPhotos, "GET", `/api/generations/${A.g.id}/photos/1`, { id: A.g.id, position: "1" })],
    ["re-run A's product", () => call(genRetry, "POST", `/api/generations/${A.g.id}/retry`, g, {})],
    ["write A's product data", () => call(genSheet, "POST", `/api/generations/${A.g.id}/sheet`, g, {})],
    ["open A's range", () => call(range, "GET", `/api/ranges/${A.r.id}`, r)],
    ["rename A's range", () => call(range, "PATCH", `/api/ranges/${A.r.id}`, r, { title: "taken over" })],
    ["apply details to A's range", () => call(rangeApply, "POST", `/api/ranges/${A.r.id}/apply`, r, { fields: { colour: "red" } })],
    ["download A's names", () => call(rangeDownload, "GET", `/api/ranges/${A.r.id}/download`, r)],
    ["download A's feed", () => call(rangeFeed, "GET", `/api/ranges/${A.r.id}/feed`, r)],
    ["upload a file to A's range", () => call(rangeFile, "POST", `/api/ranges/${A.r.id}/file`, r, new FormData())],
    ["add a piece to A's range", () => call(rangeItems, "POST", `/api/ranges/${A.r.id}/items`, r, {})],
    ["change A's piece", () => call(rangeItem, "PATCH", `/api/ranges/${A.r.id}/items/${A.item.id}`, it, { details: {} })],
    ["delete A's piece", () => call(rangeItem, "DELETE", `/api/ranges/${A.r.id}/items/${A.item.id}`, it)],
    ["see A's piece photo", () => call(rangeItemPhoto, "GET", `/api/ranges/${A.r.id}/items/${A.item.id}/photo`, it)],
    ["add a photo to A's piece", () => call(rangeItemPhotos, "POST", `/api/ranges/${A.r.id}/items/${A.item.id}/photos`, it, {})],
    ["see A's piece's other photo", () => call(rangeItemPhotoAt, "GET", `/api/ranges/${A.r.id}/items/${A.item.id}/photos/1`, { ...it, position: "1" })],
    ["delete A's piece's other photo", () => call(rangeItemPhotoAt, "DELETE", `/api/ranges/${A.r.id}/items/${A.item.id}/photos/1`, { ...it, position: "1" })],
    // Through B's own range: A's piece must still be out of reach.
    ["see A's piece photo via B's range", () => call(rangeItemPhoto, "GET", `/api/ranges/${B.r.id}/items/${A.item.id}/photo`, { id: B.r.id, itemId: A.item.id })],
    ["change A's piece via B's range", () => call(rangeItem, "PATCH", `/api/ranges/${B.r.id}/items/${A.item.id}`, { id: B.r.id, itemId: A.item.id }, { details: {} })],
    ["see A's other photo via B's range", () => call(rangeItemPhotoAt, "GET", `/api/ranges/${B.r.id}/items/${A.item.id}/photos/1`, { id: B.r.id, itemId: A.item.id, position: "1" })],
    ["name A's range", () => call(rangeName, "POST", `/api/ranges/${A.r.id}/name`, r, {})],
    ["read A's range report", () => call(rangeReport, "GET", `/api/ranges/${A.r.id}/report`, r)],
    ["retry A's range", () => call(rangeRetry, "POST", `/api/ranges/${A.r.id}/retry`, r, {})],
    ["read A's range summary", () => call(rangeSummary, "GET", `/api/ranges/${A.r.id}/summary`, r)],
    ["open A's review", () => call(review, "GET", `/api/reviews/${A.g.id}`, g)],
    ["edit A's review", () => call(review, "PATCH", `/api/reviews/${A.g.id}`, g, { field: "title", value: "taken over" })],
    ["approve A's product", () => call(reviewAction, "POST", `/api/reviews/${A.g.id}/action`, g, { action: "approve" })],
    ["comment on A's product", () => call(reviewComments, "POST", `/api/reviews/${A.g.id}/comments`, g, { body: "hello" })],
    ["restore A's earlier value", () => call(reviewRestore, "POST", `/api/reviews/${A.g.id}/restore`, g, { field: "title" })],
    ["change A's brand profile", () => call(adminBrand, "PATCH", "/api/admin/brand", {}, { brandId: A.brand.id, approvalRequired: true })],
    ["learn A's style", () => call(adminBrandLearn, "POST", "/api/admin/brand/learn", {}, learn)],
    ["list A's keyword lists", () => call(datasets, "GET", `/api/admin/datasets?brandId=${A.brand.id}`)],
    ["switch on A's keyword list", () => call(datasetActivate, "POST", `/api/admin/datasets/${A.ds.id}/activate`, { id: A.ds.id })],
    ["download A's left-out keywords", () => call(datasetRejections, "GET", `/api/admin/datasets/${A.ds.id}/rejections`, { id: A.ds.id })],
    ["upload a keyword list to A", () => call(datasetValidate, "POST", "/api/admin/datasets/validate", {}, upload)],
    ["make a login for A", () => call(users, "POST", "/api/admin/users", {}, { username: "intruder", displayName: "x", role: "admin", brandId: A.brand.id })],
    ["reset an A password", () => call(users, "PATCH", "/api/admin/users", {}, { action: "reset_password", username: "a-admin" })],
    ["switch off an A login", () => call(users, "PATCH", "/api/admin/users", {}, { action: "disable", username: "a-admin" })],
    ["see A's Google connection", () => call(googleConnection, "GET", `/api/google/connection?brandId=${A.brand.id}`)],
    ["change A's Google connection", () => call(googleConnection, "PATCH", "/api/google/connection", {}, { brandId: A.brand.id, searchConsoleSite: "x" })],
    ["remove A's Google connection", () => call(googleConnection, "DELETE", `/api/google/connection?brandId=${A.brand.id}`)],
    ["connect Google for A", () => call(googleConnect, "GET", `/api/google/connect?brandId=${A.brand.id}`)],
    ["bring in A's Google figures", () => call(googleSync, "POST", "/api/google/sync", {}, { brandId: A.brand.id })],
    ["work in A's brand", () => call(workspace, "POST", "/api/workspace", {}, { brandId: A.brand.id })],
    ["add a brand", () => call(adminBrands, "POST", "/api/admin/brands", {}, { name: "Brand C" })],
    ["refresh Google's categories", () => call(googleCategories, "POST", "/api/admin/google-categories")],
  ] as [string, () => Promise<Response>][];
}

describe("someone at one brand can't reach another brand's work through any request", () => {
  for (const role of ["admin", "editor", "reviewer", "buyer"] as const) {
    it(`B's ${role} gets nothing of A's, and changes nothing`, async () => {
      await signIn(B[role]);
      for (const [label, run] of probes()) {
        const res = await run();
        const text = await res.text();
        // Refused by the brand check itself (not found, or no access), and never with A's data.
        expect([403, 404], `${role}: ${label} answered ${res.status} ${text.slice(0, 120)}`).toContain(res.status);
        expect(text, `${role}: ${label}`).not.toContain(SECRET);
      }
    });
  }

  it("left A exactly as it was", async () => {
    const g = await db.generation.findUniqueOrThrow({ where: { id: A.g.id }, include: { photo: true, images: true } });
    expect(g.isTest).toBe(false);
    expect(g.photo).not.toBeNull();
    expect(g.images).toHaveLength(1);
    expect((await db.batch.findUniqueOrThrow({ where: { id: A.r.id } })).title).toBe(`${SECRET} range`);
    const item = await db.batchItem.findUniqueOrThrow({ where: { id: A.item.id }, include: { images: true } });
    expect(item.images).toHaveLength(1);
    expect(item.status).toBe("review");
    const rv = await db.productReview.findUniqueOrThrow({ where: { id: A.rv.id } });
    expect(rv.status).toBe("ai_generated");
    expect(await db.reviewComment.count({ where: { reviewId: A.rv.id } })).toBe(0);
    expect((await db.keywordDataset.findUniqueOrThrow({ where: { id: A.ds.id } })).status).toBe("archived");
    expect(await db.googleConnection.findUnique({ where: { brandId: A.brand.id } })).not.toBeNull();
    const admin = await db.user.findUniqueOrThrow({ where: { id: A.admin.id } });
    expect(admin.passwordHash).toBe(A_admin_hash);
    expect(admin.active).toBe(true);
    expect(await db.user.count({ where: { username: "intruder" } })).toBe(0);
    expect(await db.brand.count()).toBe(2);
    expect(Object.keys((await db.brand.findUniqueOrThrow({ where: { id: A.brand.id } })).settings as object)).not.toContain("approvalRequired");
  });

  it("lists show B's admin only B's things", async () => {
    await signIn(B.admin);
    const list = await (await call(gens, "GET", "/api/generations")).json() as { items: { id: string }[] };
    expect(list.items.map((x) => x.id)).toEqual([B.g.id]);
    const people = await (await call(users, "GET", "/api/admin/users")).json() as { users: { username: string }[] };
    expect(people.users.map((u) => u.username).sort()).toEqual(["b-admin", "b-buyer", "b-editor", "b-reviewer"]);
    const lists = await (await call(datasets, "GET", "/api/admin/datasets")).json() as { datasets: { id: string }[] };
    expect(lists.datasets.map((d) => d.id)).toEqual([B.ds.id]);
    const fixes = await (await call(corrections, "GET", "/api/reviews/corrections")).text();
    expect(fixes).toContain("B-own corrected title");
    expect(fixes).not.toContain(SECRET);
    // A new range is always B's, whatever brand it names.
    const made = await (await call(ranges, "POST", "/api/ranges", {}, { brandId: A.brand.id, title: "Mine" })).json() as { id: string };
    expect((await db.batch.findUniqueOrThrow({ where: { id: made.id } })).brandId).toBe(B.brand.id);
  });

  it("the requests do work for the people allowed: A's admin and the owner", async () => {
    for (const [u, ws] of [[A.admin, ""], [owner, ""], [owner, A.brand.id]] as const) {
      await signIn(u, ws);
      expect((await call(gen, "GET", `/api/generations/${A.g.id}`, { id: A.g.id })).status).toBe(200);
      expect((await call(range, "GET", `/api/ranges/${A.r.id}`, { id: A.r.id })).status).toBe(200);
      expect((await call(rangeItemPhoto, "GET", `/api/ranges/${A.r.id}/items/${A.item.id}/photo`, { id: A.r.id, itemId: A.item.id })).status).toBe(200);
      expect((await call(review, "GET", `/api/reviews/${A.g.id}`, { id: A.g.id })).status).toBe(200);
      expect((await call(datasetRejections, "GET", `/api/admin/datasets/${A.ds.id}/rejections`, { id: A.ds.id })).status).toBe(200);
    }
  });
});
