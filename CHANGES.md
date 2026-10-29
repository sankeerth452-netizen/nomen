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

## Words for buyers, not engineers (29 Oct 2026)

Every sentence on screen is now written for the people using the tool: fashion buyers, and the brand admins who upload keyword lists. Technical detail stays behind the scenes for engineers.

- **One home for buyer wording:** `src/lib/copy.ts` holds every sentence the naming process can show (warnings, questions, why each Google search ran). Older saved results stored engineer wording; `plain()` translates those when shown, and hides engineer-only notes, so History reads the same as new results.
- **Technical detail moved off the screen:** the admin "usage" panel (tokens, cost) and "Admin detail" error text are gone from the result screen, and the server no longer sends usage, raw errors, model or prompt versions to the browser at all. Raw Google-check errors, validation notes and dropped-alternative reasons are saved in `generation.usage.notes` for engineers.
- **Rewritten, for example:**
  - "Limited keyword evidence: no keyword in the dataset matched this product's details. No search demand is claimed." → "We couldn't find search figures that match these details, so we can't say how often shoppers search for them."
  - "Live search for "…" failed: DataForSEO 500" → hidden from buyers, kept for engineers; the buyer sees "Some of today's Google checks didn't go through, so part of the evidence is missing."
  - "colour was not supplied" → "You didn't mention a colour. Most shoppers search with one, so it's worth adding."
  - "Length: mini and maxi can't both be true" → "It can't be both mini and maxi. Which length is it?" (the extraction prompt now asks for conflicts as a friendly question, `extract-v3`)
  - "Strongest keyword in the dataset for this product (8,100 searches)" → "The most-searched phrase for this piece (8,100 a month)"
  - "brandId required" → "Choose a brand first."; "Not signed in" → "Your session has ended. Please sign in again."
  - "The AI service didn't respond… won't repeat the paid searches" → "We couldn't finish this one just now. Your details are saved, so you can try again in a moment."
- **Screens:** nav "Datasets" → "Keywords", "Users" → "Logins"; the keyword upload speaks in plain words (column choices like "Monthly searches", "Cost per click", "Don't use" instead of `volume`, `cpc`, `ignore`; statuses "In use", "Ready to use", "Earlier version"; "Use this list" instead of "Activate"); roles show as Owner / Brand admin / Buyer; dates are written out ("29 Oct 2026, 8:16 pm"); the demo strip says "Preview version · the results shown are examples, not live".
- **New friendly pages** for a missing page and for unexpected errors, replacing Next.js's "404" and "Application error" screens. Error details go to the browser console for engineers, never onto the page.
- **Tests:** a check that a Google outage shows only plain sentences while the raw error is kept for engineers; that the browser never receives usage, raw errors or model details, even for admins; that needs-input messages are friendly questions; and that old stored sentences are translated or hidden. 87 tests pass.

## Name and logo: Nomen (29 Oct 2026)

The product is now **Nomen** (Latin for *name*), tagline **Named to be found.** Checked first: "Namesake" is an established fashion label and "SwingTag" is existing fashion-wholesale software; no product-naming software called Nomen turned up. A formal trademark search is still needed before public use.

- **Logo:** a swing tag (the cardboard tag every garment carries its name on) with a Didone **N** cut out of it and an eyelet holding a wine string loop, beside **NOMEN** in tracked capitals. Drawn from real Bodoni Moda outlines (SIL Open Font License): wordmark at optical size 28, monogram N at 14 so it reads at favicon size.
- **In the app:** `src/components/Logo.tsx` (`<Lockup />`, `<Wordmark />`, `<Mark />`, `PRODUCT_NAME`, `TAGLINE`) draws the logo inline in the header, sign-in page, footer and error pages. Browser tabs read "Nomen · Named to be found." and "History · Nomen" etc. New favicon (`src/app/icon.svg`) and phone app icon (`src/app/apple-icon.png`); both now load on the sign-in page too (they were blocked by the login check before).
- **Brand kit:** `docs/brand/` has the SVG files, the brand board image, a one-page guide (colours, clear space, minimum sizes, don'ts) and `compose.py` to rebuild every file from the font.
- `APP_NAME` defaults to "Nomen". Infrastructure names (`render.yaml` services, the database) are unchanged.

## Ready to deploy (29 Oct 2026)

- `render.yaml`: services renamed `nomen` / `nomen-db` (Nitin's live app uses the old names), Singapore region for Australian users, and the first deploy runs as a **preview** (`PROVIDER_MODE=mock`, the "Preview version" strip shows) until the AI and Google keys are added.
- The seed now creates the **first owner login** from `OWNER_USERNAME` / `OWNER_PASSWORD` set in Render, and runs before every deploy with the migrations, so no Render shell is needed. It only ever creates: an existing login is never changed, and a bad password logs a plain warning instead of failing the deploy.
- `docs/DEPLOY.md`: plain step-by-step for Render, getting it ready for people, going fully live, and what to do if something goes wrong.
- Checked: clean production build with no secrets present, production server serves sign-in, icons and health check; the full history scanned for secrets before the first push to the public repo.

## First real runs with Claude and Google (29 Oct 2026)

Two real generations on this machine before switching the live site over (Claude Opus 5.5 + DataForSEO, Australia):

| Input | Name | Confidence | Time | Cost |
| --- | --- | --- | --- | --- |
| black dress with ruching, midi length, mesh sleeves | Black Mesh Sleeve Ruched Midi Dress | High | ~20 s | ~US$0.05 |
| white linen blouse with lace trim and puff sleeves | White Linen Lace Trim Puff Sleeve Blouse | Low (the local keyword list only has dresses, so no search figures matched) | 17 s | ~US$0.04 |

Both kept part-only details attached ("mesh sleeve", "lace trim"), wrote plain-English reasons and three real alternatives, and the extraction followed the new prompt.

Fixed from what the real runs showed:
- **Example results could be served as real Google results.** Search results are cached for 7 days, and example (preview) results shared cache entries with real ones, so after switching live the first week could show "Retailer A" as evidence. Cache entries are now kept apart by source (`mock:` / `live:` keys); old shared entries are never read again.
- **Search-call count went negative** when results came from the cache (double-subtracted). Fixed.
- **Google's own pages** (shopping/image links on google.com) are no longer counted as competitor titles.
- **Claude connection updated to current guidance:** explicit effort per call (low for reading the buyer's details, medium for writing the name), a 16,000-token ceiling because Opus 5.5 always thinks and thinking counts toward the limit (the old 1,500/3,000 ceilings risked cut-off answers; only tokens used are billed), and server-side refusal fallbacks (`fallbacks: "default"`) so a declined request is re-run on Anthropic's recommended model instead of failing.

Seen but not changed yet: on the blouse, Claude's reason said shoppers "searched for" phrases that were really just our Google checks, with no search figures behind them. Worth tightening in the prompt as part of the quality tests.

## Live (29 Oct 2026)

- `render.yaml`: `PROVIDER_MODE` switched from `mock` to `live`, after the Anthropic and DataForSEO keys were set in Render. Real Claude names and real Google results; the "Preview version" strip goes away.
- `/api/health` now also says `mode` (`live` / `preview`) and `configured` (whether all four keys are set). Yes/no flags only, never a key, so the switch can be confirmed from outside without signing in.
