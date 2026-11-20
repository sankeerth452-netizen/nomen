import { errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { COPY } from "@/lib/copy";
import { env } from "@/lib/env";
import { MAX_READ_BYTES, focusFractions, imageSize, parsePhoto } from "@/lib/photo";
import { PHOTO_PROMPT_VERSION } from "@/lib/prompts";
import { getProviders } from "@/lib/providers";
import { rateLimit } from "@/lib/rateLimit";

// Read a product photo into suggested details for the form. Nothing is stored here: the buyer checks the details,
// then creates the name as usual, so every word in a name still comes from details the buyer has seen.
export async function POST(req: Request) {
  try {
    const user = await requireUser("buyer");
    await requireCapability(user, "edit", user.brandId);
    if (!rateLimit(`photo:${user.id}`, 60, 3_600_000)) throw new HttpError(429, COPY.photo.tooMany);
    const body = (await req.json().catch(() => null)) as { image?: unknown; productType?: unknown } | null;
    const image = parsePhoto(body?.image, MAX_READ_BYTES);
    if (image === "too_large") throw new HttpError(413, COPY.photo.tooLarge);
    if (image === "not_a_photo") throw new HttpError(400, COPY.photo.notAPhoto);
    const productType = typeof body?.productType === "string" ? body.productType.trim().slice(0, 60) || undefined : undefined;
    try {
      const { details, usage } = await getProviders().photo.read({ image, productType });
      // Engineers only: there's no generation yet to store usage on.
      console.info("photo read", { user: user.id, prompt: PHOTO_PROMPT_VERSION, model: usage.model, bytes: image.data.length, input: usage.inputTokens, output: usage.outputTokens });
      // The browser crops its preview around the piece, so it gets the box as fractions of the photo.
      return Response.json({ details, focus: focusFractions(details.focus, imageSize(image)), example: env().PROVIDER_MODE === "mock" });
    } catch (e) {
      console.error("photo read failed", e instanceof Error ? e.message : e);
      throw new HttpError(502, COPY.photo.readFailed);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
