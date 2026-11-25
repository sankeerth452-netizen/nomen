import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { loadRangeFor, rangeWhere } from "@/lib/batch/ranges";
import { loadReview } from "@/lib/review/load";
import { ownerScope, workspaceBrandId, workspaceFirst } from "@/lib/auth/workspace";
import { dashboardData } from "@/lib/insights/dashboard";
import { namingGaps } from "@/lib/insights/competitors";
import { addUsage } from "@/lib/pipeline/usage";
import type { SessionUser } from "@/lib/auth/session";
import { resetDb } from "./helpers";

async function brandWith(slug: string) {
  const brand = await db.brand.create({ data: { name: slug.toUpperCase(), slug } });
  const mk = (role: Role) => db.user.create({ data: { username: `${slug}-${role}`, displayName: role, passwordHash: "x", role, brandId: brand.id } });
  const [admin, reviewer, editor] = await Promise.all([mk("admin"), mk("reviewer"), mk("editor")]);
  const g = await db.generation.create({ data: { brandId: brand.id, userId: editor.id, originalInput: { productType: "dress" }, status: "completed", confidence: "high", result: { recommendation: { recommended_title: `${slug} Dress` } }, candidateEvidence: { serp: [] } } });
  const range = await db.batch.create({ data: { brandId: brand.id, userId: editor.id, title: `${slug} range` } });
  await db.productReview.create({ data: { generationId: g.id, brandId: brand.id } });
  await addUsage(g.id, { ai: { inputTokens: 1000, outputTokens: 0, model: "claude-opus-5-5" }, op: "name" });
  return { brand, admin, reviewer, editor, g, range };
}
const su = (u: { id: string; username: string; role: Role; brandId: string | null }, extra: Partial<SessionUser> = {}): SessionUser => ({ id: u.id, username: u.username, displayName: u.username, role: u.role, brandId: u.brandId, brandName: null, ...extra });

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("no retailer reaches another retailer's work", () => {
  it("products, ranges and reviews of another brand can't be opened, whatever the role", async () => {
    const a = await brandWith("a"), b = await brandWith("b");
    for (const u of [b.admin, b.reviewer, b.editor]) {
      await expect(loadGenerationFor(su(u), a.g.id)).rejects.toMatchObject({ status: 404 });
      await expect(loadRangeFor(su(u), a.range.id)).rejects.toMatchObject({ status: 404 });
      await expect(loadReview(su(u), a.g.id)).rejects.toMatchObject({ status: 404 });
    }
    await expect(loadGenerationFor(su(a.admin), a.g.id)).resolves.toMatchObject({ id: a.g.id });
  });

  it("the dashboard, spend and naming gaps only count the brand asked for", async () => {
    const a = await brandWith("a");
    await brandWith("b");
    const d = await dashboardData({ brandIds: [a.brand.id], period: "all", category: "all", includeTests: false });
    expect(d.work.named).toBe(1);
    expect(d.spend.total).toBeCloseTo(0.004);
    expect(d.spend.byBrand.map((x) => x.name)).toEqual(["A"]);
    const everyBrand = await dashboardData({ brandIds: null, period: "all", category: "all", includeTests: false });
    expect(everyBrand.work.named).toBe(2);
    expect(await namingGaps({ brandIds: [a.brand.id], from: new Date(0), includeTests: false })).toEqual([]);
  });

  it("the owner's workspace narrows what they see, and never widens anyone else's", async () => {
    const a = await brandWith("a"), b = await brandWith("b");
    const owner = await db.user.create({ data: { username: "owner", displayName: "O", passwordHash: "x", role: "owner" } });
    expect(ownerScope(su(owner, { workspaceId: a.brand.id }))).toEqual({ brandId: a.brand.id });
    expect(ownerScope(su(owner, { workspaceId: null }))).toEqual({});
    expect(rangeWhere(su(owner, { workspaceId: a.brand.id }))).toEqual({ brandId: a.brand.id });
    // A brand admin with a stray workspace value still sees only their own brand.
    expect(workspaceBrandId(su(b.admin, { workspaceId: a.brand.id }))).toBe(b.brand.id);
    expect(ownerScope(su(b.admin, { workspaceId: a.brand.id }))).toEqual({});
    expect(rangeWhere(su(b.admin, { workspaceId: a.brand.id }))).toEqual({ brandId: b.brand.id });
    expect(workspaceFirst(su(owner, { workspaceId: b.brand.id }), [a.brand, b.brand]).map((x) => x.id)).toEqual([b.brand.id, a.brand.id]);
  });
});
