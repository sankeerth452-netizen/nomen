import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { getProviders } from "@/lib/providers";
import { seasonalCalendar } from "@/lib/insights/seasonal";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// The seasonal calendar for the dashboard. Google's figures are asked for at most once a month (cached); a brand admin
// or the owner opening the dashboard is what refreshes them.
export async function GET() {
  try {
    const user = await requireUser("admin");
    const kd = getProviders().keywords;
    if (!kd || env().LIVE_KEYWORDS === "off") throw new HttpError(404, "Seasonal figures aren't switched on.");
    const cal = await seasonalCalendar(kd, { brandId: user.brandId, userId: user.id });
    return Response.json({ ...cal, example: env().PROVIDER_MODE === "mock" });
  } catch (e) {
    return errorResponse(e);
  }
}
