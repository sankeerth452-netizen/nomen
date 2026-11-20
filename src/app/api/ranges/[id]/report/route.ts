import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor } from "@/lib/batch/ranges";
import { loadReportData, reportCsv, reportRows } from "@/lib/batch/report";
import { catalogueIssues } from "@/lib/catalogue/check";
import { googleCategoryIds } from "@/lib/sheet/taxonomy";
import type { FileCheck } from "@/lib/feed/shared";
import { csvDownload } from "@/lib/download";

// Every problem in the range as a spreadsheet: the product file's checks, photos, naming, product data and the catalogue.
// ?format=json gives the rows for the range screen's catalogue check.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const data = await loadReportData(b.id);
    const rows = reportRows(data.items, (b.fileCheck as FileCheck | null) ?? null, data.rowsByItem, catalogueIssues(data.items, { categories: await googleCategoryIds(), sizesByItem: data.sizesByItem, brandCategoriesByItem: data.brandCategoriesByItem }));
    if (new URL(req.url).searchParams.get("format") === "json") return Response.json({ rows });
    return csvDownload(reportCsv(rows), `${b.title} problems.csv`);
  } catch (e) {
    return errorResponse(e);
  }
}
