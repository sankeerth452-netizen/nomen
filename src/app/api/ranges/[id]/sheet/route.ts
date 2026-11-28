import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { addSheetPieces, loadRangeFor } from "@/lib/batch/ranges";
import { readLineSheet, SheetError } from "@/lib/batch/sheet";
import { kick } from "@/lib/batch/worker";
import { rateLimit } from "@/lib/rateLimit";

const MAX_BYTES = 30 * 1024 * 1024;

// A buyer's line sheet: every row becomes a piece of this range (photos pasted in, or photo links), ready to check.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const b = await loadRangeFor(user, (await params).id);
    await requireCapability(user, "edit", b.brandId);
    if (b.source === "file") throw new HttpError(400, "This range comes from your store's product file. Start a new range to add a spreadsheet of pieces.");
    if (!rateLimit(`sheet:${user.id}`, 20, 3_600_000)) throw new HttpError(429, "That's a lot of spreadsheets this hour. Please try again a little later.");
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a spreadsheet to upload.");
    if (file.size > MAX_BYTES) throw new HttpError(413, "That file is too big. The limit is 30MB: make the photos in it smaller, or use photo links.");
    const sheet = await readLineSheet(Buffer.from(await file.arrayBuffer()), file.name);
    if (!sheet.pieces.length) throw new HttpError(400, sheet.examples ? "The sheet only has the example row. Add your pieces below it, one per row." : "We didn't find any pieces in that sheet. Put one piece per row under the column names.");
    const added = await addSheetPieces(b.id, sheet);
    kick();
    return Response.json({ ...added, used: sheet.used, ignored: sheet.ignored, leftOut: sheet.leftOut }, { status: 201 });
  } catch (e) {
    if (e instanceof SheetError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
