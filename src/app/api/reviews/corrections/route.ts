import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { cell } from "@/lib/batch/ranges";
import { csvDownload } from "@/lib/download";
import { aiValue, FIELD, type ResultLike } from "@/lib/review/fields";
import { requireCapability } from "@/lib/review/guard";

// Every change people made to what the AI wrote, with comments flagging it as wrong: material for testing and improving
// Nomen. It's never fed back into the AI automatically.
export async function GET(req: Request) {
  try {
    const user = await requireUser("admin");
    const brandId = user.role === "owner" ? new URL(req.url).searchParams.get("brandId") ?? undefined : user.brandId!;
    if (brandId) await requireCapability(user, "manageBrand", brandId);
    const revisions = await db.reviewRevision.findMany({
      where: { source: "human", review: brandId ? { brandId } : {} }, orderBy: { createdAt: "desc" }, take: 5000,
      include: { user: { select: { displayName: true, username: true } }, review: { select: { generationId: true, generation: { select: { result: true } }, comments: { where: { flag: true }, select: { field: true, body: true } } } } },
    });
    const show = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? Object.values(x as object).join(": ") : String(x))).join(" | ") : typeof v === "object" ? Object.values(v as object).join(" ") : String(v));
    const rows = [["When", "Product", "Field", "The AI wrote", "Changed to", "Who", "Flagged as an AI mistake"], ...revisions.map((r) => {
      const result = r.review.generation.result as ResultLike;
      const flags = r.review.comments.filter((c) => !c.field || c.field === r.field).map((c) => c.body).join(" | ");
      return [r.createdAt.toISOString().slice(0, 16).replace("T", " "), String(result?.recommendation?.recommended_title ?? r.review.generationId), FIELD.get(r.field)?.label ?? r.field, show(aiValue(result, r.field)), show(r.value), r.user ? r.user.displayName || r.user.username : "", flags];
    })];
    return csvDownload(rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n", "nomen corrections.csv");
  } catch (e) {
    return errorResponse(e);
  }
}
