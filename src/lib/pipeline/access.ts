import type { Generation, Prisma } from "@prisma/client";
import { objectPosition } from "../frame";
import { asPhotoInfo } from "../images/info";
import { db } from "../db";
import { HttpError } from "../auth/guards";
import { seesWholeBrand } from "../review/permissions";
import type { SessionUser } from "../auth/session";

/** A generation plus whether the buyer added a photo (the photo itself is served separately). */
export type LoadedGeneration = Generation & { photo?: { generationId: string; focus?: Prisma.JsonValue | null } | null; images?: { position: number }[] };

/** buyers: their own; brand admins: their brand's; owner: everything. 404 (not 403) so ids can't be probed. */
export async function loadGenerationFor(user: SessionUser, id: string): Promise<LoadedGeneration> {
  const g = await db.generation.findUnique({ where: { id }, include: { photo: { select: { generationId: true, focus: true } }, images: { select: { position: true }, orderBy: { position: "asc" } } } });
  const allowed = g && (user.role === "owner" || (g.brandId === user.brandId && (g.userId === user.id || seesWholeBrand(user))));
  if (!g || !allowed) throw new HttpError(404, "We couldn't find that.");
  return g;
}

/**
 * Shape returned to the browser: only what the screens show. Technical detail (usage, cost, raw provider errors,
 * engineer notes, model and prompt versions) stays in the database for engineers and never reaches the browser.
 */
export function presentGeneration(g: LoadedGeneration, _user: SessionUser) {
  return {
    id: g.id, status: g.status, confidence: g.confidence, createdAt: g.createdAt, durationMs: g.durationMs,
    input: g.originalInput, facts: g.extractedFacts, evidence: g.candidateEvidence, result: g.result,
    errorCode: g.errorCode, hasPhoto: !!g.photo, photoPosition: photoPosition(g.photo?.focus),
    /** What each photo shows, its alt text and problems; and the other photos' positions (served at .../photos/<n>). */
    photos: asPhotoInfo(g.photos), morePhotos: (g.images ?? []).map((x) => x.position),
  };
}

const photoPosition = (focus: Prisma.JsonValue | null | undefined) => (focus && typeof focus === "object" ? objectPosition(focus as never) : null);
