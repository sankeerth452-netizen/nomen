import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { feedPieces, loadRangeFor } from "@/lib/batch/ranges";
import { supplementalFeed } from "@/lib/feed/export";
import { brandSettings, requireCapability } from "@/lib/review/guard";

// The Google supplemental feed for a product-file range: one row per SKU, Nomen's fields only, matched by id. People's
// changes in review are what's exported; when the brand requires approval, only approved products are included.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "export", b.brandId);
    if (b.source !== "file") throw new HttpError(400, "The Google feed is for ranges started from a product file.");
    const approvalRequired = (await brandSettings(b.brandId))?.approvalRequired ?? false;
    const pieces = await feedPieces(b.id, approvalRequired);
    if (!pieces.length) throw new HttpError(409, approvalRequired ? "Nothing is approved yet. Approve pieces in Review first: your brand exports approved products only." : "Nothing is named yet. Name some pieces first.");
    const file = `${b.title.replace(/[^\w ·-]+/g, "").replace(/\s+/g, " ").trim() || "range"} google supplemental feed.tsv`;
    return new Response(supplementalFeed(pieces), {
      headers: { "content-type": "text/tab-separated-values; charset=utf-8", "content-disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]+/g, "-").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file)}` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
