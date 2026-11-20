import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { requireCapability } from "@/lib/review/guard";
import { rateLimit } from "@/lib/rateLimit";
import { openFile } from "@/lib/keywords/readers";
import { suggestFeedMapping } from "@/lib/feed/import";
import { analyseCatalogue, voiceSample, type CatalogueRow } from "@/lib/brandStyle";
import { getProviders } from "@/lib/providers";
import { STYLE_PROMPT_VERSION } from "@/lib/prompts";
import { readUsd } from "@/lib/pricing";
import { env } from "@/lib/env";

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_ROWS = 5000;

// Read a catalogue of products the brand has already approved and propose a style guide from it. Nothing is saved:
// the admin ticks what to use, checks it on the Brand profile page, and saves it there.
export async function POST(req: Request) {
  try {
    const user = await requireUser("admin");
    if (!rateLimit(`brandlearn:${user.id}`, 10, 3_600_000)) throw new HttpError(429, "That's a lot of catalogues this hour. Please try again a little later.");
    const form = await req.formData();
    const brandId = typeof form.get("brandId") === "string" && form.get("brandId") ? String(form.get("brandId")) : user.brandId;
    if (!brandId) throw new HttpError(400, "Choose a brand first.");
    assertBrandAccess(user, brandId);
    await requireCapability(user, "manageBrand", brandId);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    if (file.size > MAX_BYTES) throw new HttpError(413, "That file is too big. The limit is 30MB.");
    const source = await openFile(Buffer.from(await file.arrayBuffer()), file.name).catch((e) => { throw new HttpError(400, e instanceof Error ? e.message : "We couldn't open that file."); });

    // The same column guesses as a product file: the title (or name) and the description.
    const mapping = suggestFeedMapping(source.headers);
    const titleCol = Object.entries(mapping).find(([, t]) => t === "title")?.[0];
    const descCol = Object.entries(mapping).find(([, t]) => t === "description")?.[0];
    if (!titleCol) throw new HttpError(400, "We couldn't find a column of product names (a \"Title\" or \"Name\" column). Check the file and try again.");
    const rows: CatalogueRow[] = [];
    const seen = new Set<string>();
    for await (const r of source.rows) {
      const title = String(r.cells[titleCol] ?? "").trim();
      if (!title || seen.has(title.toLowerCase())) continue; // Shopify repeats a product on every variant row, with a blank title
      seen.add(title.toLowerCase());
      rows.push({ title: title.slice(0, 200), description: descCol ? String(r.cells[descCol] ?? "").slice(0, 5000) : undefined });
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length < 5) throw new HttpError(400, "We found fewer than 5 products with names. Upload a catalogue with more of your approved products.");

    const proposal = analyseCatalogue(rows);
    // How the brand sounds, from a small sample of its own descriptions: one short, cheap read.
    const sample = voiceSample(rows);
    let costUsd = 0;
    const style = getProviders().style;
    if (style && sample.length >= 3) {
      try {
        const { voice, usage } = await style.describe(sample);
        proposal.voice = { tone: voice.tone.slice(0, 300), audience: voice.audience.slice(0, 300), descriptionStyle: voice.description_style.slice(0, 600) };
        costUsd = readUsd(usage); // one call, priced like a photo read
        console.info("brand voice read", { brandId, prompt: STYLE_PROMPT_VERSION, model: usage.model, input: usage.inputTokens, output: usage.outputTokens, costUsd });
      } catch (e) {
        console.error("brand voice read failed", e instanceof Error ? e.message : e); // the rest of the proposal stands
      }
    }
    await db.auditEvent.create({ data: { brandId, userId: user.id, eventType: "brand.catalogue_analysed", metadata: { file: file.name.slice(0, 160), products: proposal.products, voice: !!proposal.voice, costUsd } } });
    return Response.json({ proposal, example: env().PROVIDER_MODE === "mock" });
  } catch (e) {
    return errorResponse(e);
  }
}
