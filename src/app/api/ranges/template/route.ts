import { errorResponse, requireUser } from "@/lib/auth/guards";
import { lineSheetTemplate } from "@/lib/batch/sheet";

// The line sheet template: one row per piece, a Photo column to paste photos over, and a tab that says how.
export async function GET() {
  try {
    await requireUser("buyer");
    return new Response(new Uint8Array(await lineSheetTemplate()), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="Nomen range template.xlsx"', "cache-control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
