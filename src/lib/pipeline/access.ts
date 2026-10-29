import type { Generation } from "@prisma/client";
import { db } from "../db";
import { HttpError, hasRole } from "../auth/guards";
import type { SessionUser } from "../auth/session";

/** buyers: their own; brand admins: their brand's; owner: everything. 404 (not 403) so ids can't be probed. */
export async function loadGenerationFor(user: SessionUser, id: string): Promise<Generation> {
  const g = await db.generation.findUnique({ where: { id } });
  const allowed = g && (user.role === "owner" || (g.brandId === user.brandId && (g.userId === user.id || hasRole(user, "admin"))));
  if (!g || !allowed) throw new HttpError(404, "We couldn't find that.");
  return g;
}

/**
 * Shape returned to the browser: only what the screens show. Technical detail (usage, cost, raw provider errors,
 * engineer notes, model and prompt versions) stays in the database for engineers and never reaches the browser.
 */
export function presentGeneration(g: Generation, _user: SessionUser) {
  return {
    id: g.id, status: g.status, confidence: g.confidence, createdAt: g.createdAt, durationMs: g.durationMs,
    input: g.originalInput, facts: g.extractedFacts, evidence: g.candidateEvidence, result: g.result,
    errorCode: g.errorCode,
  };
}
