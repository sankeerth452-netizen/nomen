import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { refreshTaxonomyFromGoogle } from "@/lib/sheet/taxonomy";

// The owner updates Google's category list from Google (it's shared by every brand). New and renamed categories are
// stored; none are removed, since older products may still use them.
export async function POST() {
  try {
    const user = await requireUser("owner");
    const r = await refreshTaxonomyFromGoogle().catch((e) => { throw new HttpError(502, e instanceof Error ? e.message : "Google's list didn't load. Try again later."); });
    await db.auditEvent.create({ data: { userId: user.id, eventType: "google_categories.updated", metadata: r } });
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
