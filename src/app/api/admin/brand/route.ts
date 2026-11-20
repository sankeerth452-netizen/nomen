import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { z } from "zod";
import { BrandProfile, parseBrandSettings, type BrandSettings } from "@/lib/brand";
import { requireCapability } from "@/lib/review/guard";

const list = (max: number, each = 80) => z.array(z.string().trim().min(1).max(each)).max(max);
/** What the Brand profile page saves: how the brand writes, and how its names are built. */
const ProfileChange = z.object({
  profile: BrandProfile,
  titleCase: z.enum(["title", "sentence", "lower"]),
  maxTitleLength: z.number().int().min(20).max(150),
  attributeOrder: z.array(z.enum(["colour", "feature", "material", "length"])).max(4).nullable(),
  prohibitedTerms: list(60), avoidWords: list(60), goodExamples: list(20, 150), poorExamples: list(20, 150),
});

// Brand settings a brand admin can change here: { brandId, approvalRequired } or { brandId, profile, titleCase, ... }.
export async function PATCH(req: Request) {
  try {
    const user = await requireUser("admin");
    const body = (await req.json().catch(() => null)) as { brandId?: unknown; approvalRequired?: unknown; profile?: unknown } | null;
    const brandId = typeof body?.brandId === "string" ? body.brandId : user.brandId;
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "manageBrand", brandId);
    const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
    const current = parseBrandSettings(brand.settings);
    let settings: BrandSettings, event: string, metadata: Prisma.InputJsonValue;
    if (typeof body?.approvalRequired === "boolean") {
      settings = { ...current, approvalRequired: body.approvalRequired };
      event = "brand.approval_required"; metadata = { approvalRequired: body.approvalRequired };
    } else if (body?.profile) {
      const parsed = ProfileChange.safeParse(body);
      if (!parsed.success) throw new HttpError(400, profileError(parsed.error));
      const { attributeOrder, ...rest } = parsed.data;
      settings = { ...current, ...rest, attributeOrder: attributeOrder ?? undefined };
      if (!attributeOrder) delete (settings as Partial<BrandSettings>).attributeOrder; // unset: learned from the keyword list again
      const changed = (Object.keys(rest) as (keyof typeof rest)[]).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(rest[k]));
      if (JSON.stringify(current.attributeOrder ?? null) !== JSON.stringify(attributeOrder)) changed.push("attributeOrder" as never);
      event = "brand.profile_updated"; metadata = { changed };
    } else throw new HttpError(400, "Nothing to change.");
    await db.$transaction([
      db.brand.update({ where: { id: brandId }, data: { settings: settings as unknown as Prisma.InputJsonValue } }),
      db.auditEvent.create({ data: { brandId, userId: user.id, eventType: event, metadata } }),
    ]);
    return Response.json({ approvalRequired: settings.approvalRequired, profile: settings.profile });
  } catch (e) {
    return errorResponse(e);
  }
}

/** The first problem with a profile, in plain words. */
function profileError(e: z.ZodError): string {
  const i = e.issues[0];
  const where: Record<string, string> = { audience: "Who it's for", tone: "Tone of voice", descriptionStyle: "Description style", seo: "Search preferences", terms: "Your words", maxTitleLength: "Longest name", goodExamples: "Names you like", poorExamples: "Names you don't like", prohibitedTerms: "Never use", avoidWords: "Avoid" };
  const field = i.path.find((p) => typeof p === "string" && p in where) as string | undefined;
  const name = field ? where[field] : "One of the fields";
  if (i.code === "too_big") return `${name} is too long. Shorten it and save again.`;
  if (i.code === "too_small") return `${name} has an empty entry. Fill it in or remove it.`;
  return `${name} doesn't look right. Check it and save again.`;
}
