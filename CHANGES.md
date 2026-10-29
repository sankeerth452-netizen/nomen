# Changes since Nitin's original

Nitin's version is tagged `nitin-original` (branch `claude/great-bell-lfbirc`, d4a10d5). Everything below is local work on top of it.

## P0: accuracy fixes (29 Oct 2026)

Each gap was first reproduced against the original code, then fixed and covered by tests (`tests/accuracy.test.ts`, plus new cases in `tests/pipeline.test.ts` and `tests/validate.test.ts`). 82 tests pass (61 original + 21 new).

| Gap in the original | What happened | Now |
| --- | --- | --- |
| Opposite words passed the grounding check | Words matched on their first 4 letters, so the AI's "strapless" was kept for a buyer's "strappy", "sleeveless" for "puff sleeve", "longline" for "long sleeve" | `wordStem` folds real word forms (ruching/ruched/ruche, pleats/pleated) and never folds a "-less" word into its opposite. Those AI facts are dropped and shown as ignored. The buyer's own opposite details ("strapless" + "strappy") are flagged as a conflict |
| Buyer terms weren't grounded | Every AI-supplied `buyer_terms` word became an allowed title word, unchecked | `buyer_terms` go through the same grounding check |
| "Mesh sleeves" became a mesh dress | Extraction split it into material: mesh + feature: sleeve, so "Black Mesh Midi Dress" passed, and "black mesh midi dress" was offered as the primary keyword | A colour or material written only before a garment part stays with it as a feature ("mesh sleeve", "lace trim", "white collar"). The validator rejects titles that use it on its own, and scoring excludes keywords that do. The extraction and recommend prompts say the same (now `extract-v2`, `recommend-v3`) |
| "Ruched" was rejected for a buyer's "ruching" | The validator only allowed exact or plural forms, which cost a repair call or failed. Keyword scoring threw out "ruched midi dress" (1,000/mo), and SERP patterns told Claude not to use "ruched" | Validator, keyword scoring and SERP patterns all match by word form |
| Length limit was only a warning | A 76-character title passed with a 70 maximum | Over-length is an error: one repair call, then the generation fails safely. Over-length alternatives are dropped with a note. The mock recommender trims trailing details to fit |
| Weak input still produced a title | "nice dress" gave the title "Dress" at Medium confidence | No detail beyond the product type (praise like "nice", "cute" doesn't count) stops with a plain request for a colour, material, fit, length or feature, before any paid search or recommendation call |

Example (mock mode, "black dress with ruching, midi length, mesh sleeves"):
- before: **Black Mesh Midi Dress**, primary keyword "black mesh midi dress" (50/mo), and "ruching" was lost
- after: **Black Mesh Sleeve Ruched Midi Dress**, primary keyword "black midi dress" (8,100/mo), with "material was not supplied" (true: only the sleeves are mesh)

Not yet verified against the live Claude and DataForSEO APIs (no keys locally); the real prompts changed, so the first live run should be checked by hand.

## Fashion redesign (29 Oct 2026)

The plain black-and-white form became an editorial, photo-led site. Light mode only; nothing about how names are made changed.

- **Look:** warm paper background, ink type, one wine accent. Bodoni Moda (a fashion-magazine Didone) for names and headlines, Jost for everything you read or type. Square buttons with spaced capitals, quiet underline fields, no gradients or glass.
- **Photography:** 14 photos from Burst by Shopify (free for commercial use; credit encouraged, so all are credited on the new `/credits` page, linked in the footer). Stored in `src/assets/photos`, imported statically so they're served from `/_next/static` (works on the sign-in page without a login) with blur placeholders. Wherever a category photo sits next to a specific product (result, history, progress), it's shown in black and white so an illustrative red dress never contradicts a name that says "Black".
- **Sign in:** split screen with an editorial photo and headline.
- **Create:** editorial hero; "Choose the piece" photo tiles for 11 departments plus "Something else", each tile offering its exact nouns as chips (Tops: top, tee, blouse, shirt, cami, bodysuit); a large serif "Describe it" box; the optional details as a 4-column grid; progress shown with the category photo and four named stages.
- **Result:** a product-page preview (brand + name in Sportsgirl-style capitals), the name in large serif, a **title anatomy** that labels each part (Colour Black · Detail Mesh Sleeve · Length Midi · Product Dress), a search-result preview with a character meter against ~60 characters, alternatives as cards, evidence as "What shoppers search" (volume bars, primary/supporting marked, the rest folded away) and "What's ranking now", and a dark "Did this name make the page?" feedback band.
- **History:** an editorial index (thumbnail, name, the buyer's words, date, confidence, plain-English status: Used / Edited / Not suitable / Needs details / Didn't work) instead of a raw table; an empty state with a photo.
- **Needs-details screen** now links back to Create (it used to say "update the details above" on a page with no form).
- **Admin:** Datasets and Users now have the shared header, editorial headings, a two-column layout and status chips.
- **Demo mode** shows a black strip on every page ("Demo mode · sample search data, no AI calls") so mock output can't pass for real data.
- Header with active-page underline; dev-only Next.js badge hidden (`devIndicators: false`); new favicon.

Checked at 1440px desktop and 375px phone (no sideways page scroll; the piece picker scrolls sideways on phones by design). 82/82 tests, typecheck and lint pass.
