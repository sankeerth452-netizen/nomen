import { z } from "zod";
import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser, hasRole } from "@/lib/auth/guards";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { rateLimit } from "@/lib/rateLimit";
import { COPY } from "@/lib/copy";
import { MAX_THUMB_BYTES, parsePhoto, type Photo } from "@/lib/photo";

const FORM_FIELDS = new Set(["productType", "freeText", "colour", "material", "pattern", "fit", "length", "feature", "occasion", "audience", "extra"]);

// Start a generation. Runs in the background (single long-lived Node service); the client polls GET /api/generations/:id.
export async function POST(req: Request) {
  try {
    const user = await requireUser("buyer");
    if (!rateLimit(`gen:${user.id}`, 40, 3_600_000)) throw new HttpError(429, "You've named a lot of pieces this hour. Take a short break and try again.");
    const body = await req.json().catch(() => null);
    if (!body) throw new HttpError(400, "Something went wrong sending that. Please try again.");
    const brandId = user.brandId ?? body.brandId; // owners pick a brand
    if (!brandId || typeof brandId !== "string") throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    let photo: Photo | undefined;
    if (body.photo) {
      const p = parsePhoto(body.photo, MAX_THUMB_BYTES);
      if (p === "too_large") throw new HttpError(413, COPY.photo.tooLarge);
      if (p === "not_a_photo") throw new HttpError(400, COPY.photo.notAPhoto);
      photo = p;
    }
    const fromPhoto = Array.isArray(body.fromPhoto) ? body.fromPhoto.filter((f: unknown): f is string => typeof f === "string" && FORM_FIELDS.has(f)) : [];
    const id = await createGeneration(user, brandId, body, { photo, fromPhoto });
    void runPipeline(id).catch((e) => console.error("runPipeline crashed", id, e instanceof Error ? e.message : e));
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Describe the piece and choose what it is.", issues: e.issues.map((i) => i.path.join(".")) }, { status: 400 });
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser("buyer");
    const url = new URL(req.url);
    const take = Math.min(50, Number(url.searchParams.get("limit") ?? 20) || 20);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const where = user.role === "owner" ? {} : hasRole(user, "admin") ? { brandId: user.brandId! } : { userId: user.id };
    const rows = await db.generation.findMany({
      where, orderBy: { createdAt: "desc" }, take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { displayName: true } }, feedback: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const page = rows.slice(0, take);
    return Response.json({
      items: page.map((g) => {
        const r = g.result as { recommendation?: { recommended_title?: string } } | null;
        const fb = g.feedback[0];
        return { id: g.id, createdAt: g.createdAt, input: (g.originalInput as { freeText?: string }).freeText, recommended: r?.recommendation?.recommended_title ?? null, finalTitle: fb?.finalTitle ?? (fb?.outcome === "used" ? r?.recommendation?.recommended_title : null) ?? null, outcome: fb?.outcome ?? null, user: g.user.displayName, datasetId: g.datasetId, confidence: g.confidence, status: g.status };
      }),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
