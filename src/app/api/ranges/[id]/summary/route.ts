import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadRangeFor } from "@/lib/batch/ranges";
import { loadReportData, reportRows, summaryCsv } from "@/lib/batch/report";
import { catalogueIssues } from "@/lib/catalogue/check";
import { googleCategoryIds } from "@/lib/sheet/taxonomy";
import type { FileCheck } from "@/lib/feed/shared";
import { csvDownload } from "@/lib/download";

// The range at a glance: how many were named, what needs a person, and what it cost.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    const data = await loadReportData(b.id);
    const rows = reportRows(data.items, (b.fileCheck as FileCheck | null) ?? null, data.rowsByItem, catalogueIssues(data.items, { categories: await googleCategoryIds(), sizesByItem: data.sizesByItem, brandCategoriesByItem: data.brandCategoriesByItem }));
    return csvDownload(summaryCsv(b, data, rows), `${b.title} summary.csv`);
  } catch (e) {
    return errorResponse(e);
  }
}
