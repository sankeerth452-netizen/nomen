import { cookies } from "next/headers";
import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_OPTIONS } from "@/lib/auth/session";
import { addBrand, BrandError } from "@/lib/brands";
import { rateLimit } from "@/lib/rateLimit";

// The owner adds a brand: { name, copyKeywordsFrom?: brandId }. The owner then works in it straight away.
export async function POST(req: Request) {
  try {
    const user = await requireUser("owner");
    if (!rateLimit(`addbrand:${user.id}`, 10, 3_600_000)) throw new HttpError(429, "That's a lot of new brands this hour. Please try again a little later.");
    const body = (await req.json().catch(() => null)) as { name?: unknown; copyKeywordsFrom?: unknown } | null;
    const copy = typeof body?.copyKeywordsFrom === "string" && body.copyKeywordsFrom ? body.copyKeywordsFrom : null;
    const brand = await addBrand({ name: body?.name, copyKeywordsFrom: copy, actorId: user.id });
    (await cookies()).set(WORKSPACE_COOKIE, brand.id, WORKSPACE_COOKIE_OPTIONS);
    return Response.json(brand, { status: 201 });
  } catch (e) {
    if (e instanceof BrandError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
