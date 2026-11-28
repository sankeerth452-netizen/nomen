// "Did this name make the page?": the name someone says they used becomes the product's name in Review and exports.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "pno_session" && jar.token ? { name: n, value: jar.token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/auth/session";
import { POST } from "@/app/api/generations/[id]/feedback/route";
import { resetDb, seedBrand } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function named() {
  const { brand, user } = await seedBrand({}, false);
  const g = await db.generation.create({
    data: {
      brandId: brand.id, userId: user.id, originalInput: { productType: "dress" }, status: "completed", confidence: "high",
      result: { recommendation: { recommended_title: "Black Ruched Midi Dress", alternatives: [{ title: "Ruched Midi Dress", trade_off: "shorter" }] } },
    },
  });
  jar.token = await createSessionToken(user.id, user.sessionVersion);
  return { g, user };
}
const say = (id: string, body: object) => POST(new Request(`http://localhost/api/generations/${id}/feedback`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
const review = (generationId: string) => db.productReview.findUniqueOrThrow({ where: { generationId }, include: { revisions: true } });

describe("saying which name was used", () => {
  it("an alternative they chose becomes the product's name, as a person's change", async () => {
    const { g, user } = await named();
    expect((await say(g.id, { outcome: "used", finalTitle: "Ruched Midi Dress" })).status).toBe(201);
    const r = await review(g.id);
    expect((r.edits as Record<string, unknown>).name).toBe("Ruched Midi Dress");
    expect(r.revisions).toMatchObject([{ field: "name", source: "human", value: "Ruched Midi Dress", userId: user.id }]);
    expect(await db.feedback.findFirst({ where: { generationId: g.id } })).toMatchObject({ outcome: "used", finalTitle: "Ruched Midi Dress" });
  });

  it("their own edit does too, and an approved product goes back to be looked at", async () => {
    const { g } = await named();
    await db.productReview.create({ data: { generationId: g.id, brandId: g.brandId, status: "approved", approvedAt: new Date() } });
    await say(g.id, { outcome: "edited", finalTitle: "Black Ruched Mesh Midi Dress" });
    const r = await review(g.id);
    expect((r.edits as Record<string, unknown>).name).toBe("Black Ruched Mesh Midi Dress");
    expect(r.status).toBe("needs_review");
    expect(r.approvedAt).toBeNull();
  });

  it("keeping the recommended name, or saying it wasn't suitable, changes nothing", async () => {
    const { g } = await named();
    await say(g.id, { outcome: "used" });
    await say(g.id, { outcome: "rejected", reason: "too long" });
    const r = await db.productReview.findUnique({ where: { generationId: g.id }, include: { revisions: true } });
    expect(r?.edits ?? {}).toEqual({});
    expect(r?.revisions ?? []).toEqual([]);
    expect(await db.feedback.count({ where: { generationId: g.id } })).toBe(2);
  });
});
