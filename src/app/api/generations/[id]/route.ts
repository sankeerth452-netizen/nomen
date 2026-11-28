import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { requireCapability } from "@/lib/review/guard";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import { failIfStale } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

// Editors: where the piece lives on the brand's site and since when (for Google's figures). Brand admins: count it as a test.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    const g = await loadGenerationFor(user, id);
    const body = (await req.json().catch(() => ({}))) as { isTest?: unknown; liveUrl?: unknown; liveSince?: unknown; previousTitle?: unknown };
    if ("liveUrl" in body || "liveSince" in body || "previousTitle" in body) {
      await requireCapability(user, "edit", g.brandId);
      const data: { liveUrl?: string | null; liveSince?: Date | null; previousTitle?: string | null } = {};
      if ("liveUrl" in body) {
        const u = typeof body.liveUrl === "string" ? body.liveUrl.trim() : "";
        if (u && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u)) throw new HttpError(400, "That isn't a full web address. It should start with https://");
        data.liveUrl = u ? u.slice(0, 500) : null;
      }
      if ("liveSince" in body) {
        const d = typeof body.liveSince === "string" && body.liveSince ? new Date(`${body.liveSince.slice(0, 10)}T00:00:00Z`) : null;
        if (d && (isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000)) throw new HttpError(400, "Choose the date the new name went live (today or earlier).");
        data.liveSince = d;
      }
      if ("previousTitle" in body) data.previousTitle = typeof body.previousTitle === "string" && body.previousTitle.trim() ? body.previousTitle.trim().slice(0, 200) : null;
      // A page address with no date yet: today, so the before-and-after has a day to compare from (it's shown, and can be changed).
      if (data.liveUrl && !data.liveSince && !g.liveSince) { const t = new Date(); data.liveSince = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); }
      await db.$transaction([
        db.generation.update({ where: { id }, data }),
        db.auditEvent.create({ data: { brandId: g.brandId, userId: user.id, eventType: "generation.live_page", metadata: { generationId: id, ...data, liveSince: data.liveSince?.toISOString() ?? null } } }),
      ]);
      return Response.json({ liveUrl: data.liveUrl ?? g.liveUrl, liveSince: (data.liveSince === undefined ? g.liveSince : data.liveSince)?.toISOString().slice(0, 10) ?? null, previousTitle: data.previousTitle ?? g.previousTitle });
    }
    await requireCapability(user, "manageBrand", g.brandId);
    if (typeof body.isTest !== "boolean") throw new HttpError(400, "Nothing to change.");
    await db.$transaction([
      db.generation.update({ where: { id }, data: { isTest: body.isTest } }),
      db.auditEvent.create({ data: { brandId: g.brandId, userId: user.id, eventType: "generation.test_marked", metadata: { generationId: id, isTest: body.isTest } } }),
    ]);
    return Response.json({ isTest: body.isTest });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    await loadGenerationFor(user, id);
    await failIfStale(id);
    return Response.json(presentGeneration(await loadGenerationFor(user, id), user));
  } catch (e) {
    return errorResponse(e);
  }
}
