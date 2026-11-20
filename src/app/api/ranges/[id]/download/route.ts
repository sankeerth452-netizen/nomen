import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor, rangeCsv, rangeItems } from "@/lib/batch/ranges";
import { requireCapability } from "@/lib/review/guard";

// Every name in the range as a spreadsheet (opens in Excel, Numbers or Google Sheets).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "export", b.brandId);
    const file = `${b.title.replace(/[^\w ·-]+/g, "").replace(/\s+/g, " ").trim() || "range"} names.csv`;
    return new Response(rangeCsv(await rangeItems(b.id)), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]+/g, "-").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file)}` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
