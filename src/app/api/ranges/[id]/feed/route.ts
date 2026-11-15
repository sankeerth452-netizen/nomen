import { db } from "@/lib/db";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { asDetails, loadRangeFor } from "@/lib/batch/ranges";
import { supplementalFeed, type FeedPiece } from "@/lib/feed/export";
import type { PieceFeed } from "@/lib/feed/shared";
import type { StoredSheet } from "@/lib/pipeline/sheet";

// The Google supplemental feed for a product-file range: one row per SKU, Nomen's fields only, matched by id.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    if (b.source !== "file") throw new HttpError(400, "The Google feed is for ranges started from a product file.");
    const items = await db.batchItem.findMany({
      where: { batchId: b.id, status: "named" }, orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { feed: true, details: true, generation: { select: { result: true } } },
    });
    const pieces: FeedPiece[] = items.flatMap((i) => {
      const r = i.generation?.result as { recommendation?: { recommended_title: string }; sheet?: StoredSheet } | null;
      const feed = i.feed as PieceFeed | null;
      if (!r?.recommendation || !feed || !asDetails(i.details)) return [];
      return [{ name: r.recommendation.recommended_title, rows: feed.rows, sheet: r.sheet?.status === "ready" ? r.sheet : null }];
    });
    if (!pieces.length) throw new HttpError(409, "Nothing is named yet. Name some pieces first.");
    const file = `${b.title.replace(/[^\w ·-]+/g, "").replace(/\s+/g, " ").trim() || "range"} google supplemental feed.tsv`;
    return new Response(supplementalFeed(pieces), {
      headers: { "content-type": "text/tab-separated-values; charset=utf-8", "content-disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]+/g, "-").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file)}` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
