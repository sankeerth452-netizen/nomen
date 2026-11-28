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

## Naming quality test, and three fixes it found (30 Oct 2026)

A repeatable test of how good Nomen's names are, built from 40 real Sportsgirl products (public product pages, 12 categories, crawled politely at one page per 10 s as their robots.txt asks) plus 6 tricky inputs. Each case runs through the real pipeline with real Claude and Google checks, on a separate local database with no keyword list (as the live site has today). Code in `evals/naming/` (see the README there); the cases themselves hold Sportsgirl's own product copy, so they are rebuilt locally and never committed.

A name **passes** when Nomen finished with one, invented no words (checked by the test's own word matcher, not Nomen's), kept it to 70 characters, and a second model (Claude Sonnet 5.5) judged it accurate to the input and natural as a product name. Separately, with no keyword list behind it, the reason must not claim what shoppers search for.

| First try per case (46) | Before (`extract-v3`, `recommend-v3`) | After (`extract-v4`, `recommend-v4`) |
| --- | --- | --- |
| Passes | 25 (54%) | 36 (78%) |
| Right outcome (named, or asked when it should) | 33 | 43 |
| Accurate, no invented words, fits 70 | all 29 named | all 39 named |
| Reads naturally | 21 of 29 | 32 of 39 |
| Honest reason | 22 of 29 (76%) | 39 of 39 (100%) |

What changed:
- **Crash on a material used on two parts.** "Lace trim" plus "lace inserts" (or lace on neckline and sleeves) made the validator demand both at once, so 3 of 40 real products failed with an error. A colour or material can now belong to several parts and may sit next to any of them.
- **Questions that didn't need asking.** 7 real products stopped to ask: descriptions listing other colourways ("comes in black, oatmeal, chocolate and mint"), a pink necklace with multicoloured beads, "pebble" next to a blue colour. The extraction prompt now says what is not a conflict: other colourways, a part in another colour, a texture word next to a given colour. 6 of the 7 now get a name. Real contradictions (mini and maxi, a "nylon" bag listed as polyester) still ask.
- **Reasons claiming shopper searches with no data.** Claude wrote "Shoppers searched 'white satin slip dress'" when only Google result pages had been checked. The recommend prompt now says only the keyword list shows what shoppers search for, and no longer tells Claude the word order "was learned from real search queries" (without a keyword list it is the usual order for the type). The search labels and the result page's "Why this order" say "the usual order for this kind of piece" in that case.

Still open: 7 named products read as a stack of features ("Black Relaxed Fit Cotton Blend Crew Neckline Sweater"; the validator won't allow "Crew Neck" when the buyer wrote "crew neckline"). Two runs cost US$2.59 and US$2.60.

## Shorter, natural names (30 Oct 2026)

The quality test showed 7 names reading as a stack of features ("Black Relaxed Fit Cotton Blend Crew Neckline Sweater"). Two causes:
- Claude was handed a ready-made title holding every detail in order (17 words for one sweater) and told to follow it. Claude now gets only the word order, as an order rather than a list to include, and the recommend prompt (`recommend-v5`) says what a product name looks like: usually 3 to 6 words, the colour plus the one to three details a shopper picks the piece by, then the noun. Fit words, fabric percentages and second fibres, mood words, and pockets or closures that don't define the piece are left to the description. Two colours join with "&".
- The validator rejected "Neck" when the buyer wrote "neckline", so "Crew Neck" could never appear. A small list of retail short forms (`RETAIL_SHORT_FORMS`) now allows it, including next to a part ("Lace Neck" for "lace neckline"). The test's own word checker counts the same short form.

| First try per case (46) | Original | Previous fixes | Now (`recommend-v5`) |
| --- | --- | --- | --- |
| Passes | 25 | 36 | 41 (89%) |
| Reads naturally | 21 of 29 | 32 of 39 | 37 of 40 |
| Median name length | 44 characters, 6.8 words | 42, 6.7 | 35, 5.5 |
| Accurate, honest reason | all / 76% | all / 100% | all / 100% |

For example: "Black Cotton Knit Crew Neck Sweater", "Lemon Knit Crew Neck Tee", "Cotton Speckle Cropped Vest". Of the 5 still not passing, 2 are questions about real contradictions in the product data (a "nylon" bag listed as polyester; "neutral" beads on a gold necklace) and 3 are judged slightly awkward ("Silver Sequin Detailing Bag"). The run cost US$2.37.

## Start with a photo (13 Nov 2026)

Buyers can now add a product photo instead of typing everything. Claude (Opus 5.5) reads what is clearly visible and fills in the form: product type, colour, pattern, a visible material, fit, length, key details and a one-line description. The buyer checks it, changes anything wrong, then creates the name as before, so every word in a name still comes from details the buyer has seen. Nothing is guessed: fabric is filled in only when the look makes it unmistakable (denim, lace, knit), and anything Claude can't see is listed for the buyer to add ("We couldn't tell the length from the photo").

- **How it works:** choose a file, drop one, paste one, or take one on a phone. The browser shrinks it (1568px for reading, about 1.4 US cents a photo; a 900px copy to keep), `POST /api/photo` checks it (JPEG, PNG or WebP by its actual bytes, size limits) and reads it (`photo-v2` prompt, low effort, structured output). Nothing is stored at this point.
- **Never overwrites the buyer:** only empty fields are filled, each marked "From your photo" until edited. If the photo disagrees with what the buyer typed ("Your photo looks black, but you wrote white"), Nomen asks, with a one-click "Use black". The photo's description never contradicts the buyer's colour or product type. "Remove" takes back everything the photo filled in.
- **Framed on the piece:** Claude also marks where the piece sits in the photo (pixel coordinates), and the kept copy is cropped to a product-page portrait around it. A skirt worn with a tee is framed on the skirt.
- **The real piece on every screen:** the result's product-page preview, the progress panel and History show the buyer's photo in colour instead of a grey category illustration. Photos live in a new `GenerationPhoto` table (migration `20261113082713_generation_photo`), served only to people who can see the generation (`GET /api/generations/:id/photo`).
- **Tested like a buyer** (live Claude and Google, local): a red one-shoulder dress, a red ribbed skirt in an outfit photo, a black lace blouse with a contradicting colour typed in, a pink saddle bag, and a picture with no fashion piece in it. E.g. the bag became "Light Pink Tassel Saddle Bag" and the skirt "Rust Red Rib Knit A-Line Midi Skirt"; the blue picture filled nothing in.

## Google results were being thrown away (13 Nov 2026)

Found while testing photos: Google now wraps every result link (`google.com/goto?url=…`) and DataForSEO reports `google.com` as the domain. The 29 Oct rule that drops Google's own pages therefore dropped every result, so names had no Google evidence. Cached searches show it started after 30 Oct (the quality test runs on 29–30 Oct had results in 79 of 80 searches; the 13 Nov ones in 0 of 3). The real shop and page are now read from each result's breadcrumb ("https://www.princesspolly.com.au › collections › lace-tops"); results with no breadcrumb are dropped, and Google's own pages still are. Searches cached while it was broken are never reused (cache keys are now `live2:`). A test search for "red one shoulder ruffle dress" went from 0 results to 7.

## Who it's for, and what it's made for (13 Nov 2026)

A girls' tennis dress, named from its photo, came out as "Burgundy Contrast Trim Half-Zip Mini Dress": accurate, but named like a women's party dress. Even when the buyer typed "girls" and "tennis", the name dropped "Girls'" and the Google checks still looked at women's dresses. Three fixes:

- **The photo reader suggests the audience and the use** (`photo-v3`): kids, girls, boys, baby or men when the photo makes it plain (a piece worn by a child), and a sport, bridal or maternity use when the design makes it plain. Both fill the Audience and Occasion fields, tagged "From your photo" for the buyer to check; women's pieces and anything unsure stay blank.
- **Names keep the audience** (`recommend-v6`): when the facts give one, the name opens with it ("Girls'", "Men's"), and what the piece is made for sits next to the noun ("Tennis Dress"). The validator accepts the possessive form of the buyer's own word. The reason no longer states a confidence level (the app sets the final one).
- **Google checks search the right market:** searches lead with the audience and the use ("girls burgundy a-line tennis dress", "girls tennis dress"), fitting the buyer's details in around them. Without an audience or use word, searches are unchanged.

Women's is treated as the default audience (`recommend-v7`): a name never says "Women's" and searches never lead with "women". The first quality-test run on the new rules caught this: three Sportsgirl pieces whose descriptions mention "women's" came back as "Women's Pink & Red Linen Blend Stripe Shirt" and the like.

Quality test (46 cases, first try each): 42 pass, against 41 before. That counts the three pieces re-scored after the women's fix plus 43 from the full run on these rules; that run first lost 28 cases to a temporary Claude outage (503, "credential validation failed"), which were re-run. Accuracy and honest reasons stay at 100%; the remaining four are the two real contradictions in Sportsgirl's data, "Silver Sequin Detailing Bag", and a lace-trim top named "Lace Sleeve Top". Runs cost US$2.49 and US$0.16.

## No fabric percentages in Google searches (13 Nov 2026)

Searches were built from the buyer's details as written, so half the test pieces searched things like "55% traceable linen 45% viscose pant". Shoppers never type percentages. They now come out of the searches and the fibre word stays: "linen blend viscose dark chocolate pant". A decade style like "90s" is left alone.

Quality test (46 cases, first try each, US$2.42): searches with a percentage went from 22 pieces to 0, and total searches from 78 to 75 (a broader search too close to the main one is skipped). Names: 42 of 46 pass, the same as before, once one judge error is corrected (it scored "Floral Embroidered Crochet Square Neck Blouse" unfaithful while its own explanation concluded it was faithful). The changed results are run-to-run variation: the necklace that asks "neutral or gold?" does so before any search runs, and "Pink Red Flower Print Cami" has appeared in earlier runs. Accuracy and honest reasons stay at 100%.

Retested with the same photo and no typing: "Girls' Burgundy Sleeveless Front-Zip Tennis Dress", with Google evidence from Etsy kids' tennis dresses, Amazon girls' sports dresses, Adidas girls' tennis gear and Tennis Direct junior apparel. The name breakdown now labels "Girls'" as who it's for and multi-word colours ("Light Pink") as colours. 108 tests pass.

## The quality test's judge reasons before its verdict (13 Nov 2026)

The judge (Claude Sonnet 5.5) gave pass or fail first and its reason second, so a verdict could contradict its own reasoning: it marked "Floral Embroidered Crochet Square Neck Blouse" unfaithful while its explanation concluded "making this faithful". It now writes its reasoning first and the verdict must follow from it (`evals/naming/grade.mjs`). Checked: the scorer's sanity tests pass (the buyer's own words pass; an empty answer, "I don't know" and a wrong product fail), and re-judging the 13 Nov run's saved names (`regrade.mjs --judge`, US$0.15) changed exactly one verdict out of 46, that blouse, to faithful. The run scores 42 of 46. Because the scorer changed, the next paid run asks a person to approve the test again (`--approve-harness`).

## Ranges: name a whole range from its photos (14 Nov 2026)

A new **Ranges** section names many pieces together. The buyer starts a range, drops in up to 60 product photos (or chooses or pastes them), checks what each photo showed, and names every ready piece with one click. Each piece is named through the same pipeline as a single one (same checks, same Google evidence, same History entry with its evidence), so a range is just many careful names, not a shortcut.

- **Stages a buyer can follow:** waiting to be read → reading → ready to check → waiting to be named → naming → named, or "needs a detail" (Nomen's question, answered on the card, then "Name again"), "didn't work" (try again), "no piece found" or "couldn't read" (describe it yourself, or read again). Filters show All, To check, Named and Needs attention.
- **Checking is fast:** each card shows the product type and description to confirm, with the rest under "More details". Fields the photo filled are green until the buyer changes them, and anything the photo couldn't show is listed. "Apply to every piece" fills details that hold for the whole range (audience, occasion, material, extra facts) only where a piece has them blank.
- **Results:** each card has the name, its confidence and other options, Copy, and Evidence (the full result in History). "Copy all names" and "Download names" (a spreadsheet: photo file name, name, other options, confidence, status, type, description; cells that look like formulas are neutralised) cover the whole range. Photos keep the order they were dropped in, and every photo is framed on its piece.
- **How it runs:** photos are shrunk in the browser (a 900px copy to keep, 1568px for Claude) and stored with the range, so the buyer can close the tab and come back. A background worker in the web service claims pieces one at a time from the database (oldest first, across all ranges), reads before it names, and never runs more than 3 at once for the whole server, so a big range can't swamp Claude or Google. A photo read that fails is retried up to 3 times; anything left half-done by a restart is put back or settled from its result. Limits: 60 photos a range, 300 photos and 300 names a person an hour.
- **Data:** new `Batch` and `BatchItem` tables, and `GenerationPhoto.focus` (where the piece sits, so results and History frame range photos on the piece). Migration `20261114154235_ranges`.
- **Tested like a buyer** (live Claude and Google, local): a 7-photo range (red dress, lace blouse, pink bag, leather jacket, outfit skirt, cream knit, girls' tennis dress) was read in about 15 seconds and named in about 30, three at a time, e.g. "Rust Red Ribbed Knit A-Line Midi Skirt" after the buyer added the length, and "Girls' Burgundy Sleeveless Half-Zip Tennis Dress". Download, Copy all, Remove, History and the phone layout checked. Testing caught and fixed: the 3-at-once limit counted per copy of the code instead of per server, photos uploaded together could share a place and change order, the naming message didn't update when done, and the phone nav no longer fit. 119 tests pass (11 new).

## Cheaper names: the right model for each step (14 Nov 2026)

Goal from Nitin: deliver everything as cheaply as possible. Each step can now run on its own Claude model (`ANTHROPIC_MODEL_READ` for the buyer's typed details, `ANTHROPIC_MODEL_WRITE` for the name, `ANTHROPIC_MODEL_PHOTO` for photos; each defaults to `ANTHROPIC_MODEL`), the fixed instructions are cached (back-to-back names read them at 5% of the price on Opus 5.5, 10% on Sonnet and Haiku), and usage is now recorded per model, cached reads included.

Measured on the 46-case quality test (first try each, Claude cost per name):

| Setup | Passes | Accuracy | Claude per name |
| --- | --- | --- | --- |
| Opus reads and writes (before) | 42 | 100% | 4.9¢ |
| **Haiku 5.5 reads, Opus 5.5 writes (now live)** | **43** | **100%** | **3.1¢** |
| Haiku reads, Sonnet 5.5 writes | 41 | 100% | 1.0¢ (one validation failure, clunkier wording) |
| Haiku reads and writes | 39 | 97% | 0.13¢ ("Lemon Polyester Knit Tee" for a 57% polyester tee) |

Photo reading stays on Opus: on the same 7 photos Haiku cost 0.03¢ against 1.05¢ a photo but missed "saddle" on a saddle bag, added "Women's" to a top and said "kids'" where Opus said "girls'". With this switch a typed name costs about 3.5¢ instead of 5.3¢ and a photo name about 4.5¢ instead of 6.7¢ (Google included). The tests cost about US$2.35. The quality-test runner can now test two-model setups (`EVAL_EXPECT_MODELS`) and prices each step exactly.

## Product page: meta title, meta description and description (14 Nov 2026)

From Nitin's list: alongside the product name, Nomen now writes the rest of the product page.

- **Meta title**, at most 60 characters: the name, then " | Sportsgirl" when it fits.
- **Meta description**, at most 160 characters: one or two sentences for Google's results.
- **Description**, 600 to 800 words in plain paragraphs (no headings, lists or emoji), Australian spelling.

The name still comes first and never waits: the page is written straight after it (about 25 seconds) and appears under the name with character and word counts and a Copy button for each part. The Google preview on the result uses the real meta title and description once they're ready. Choosing one of the other names offers "Rewrite it for this name". Ranges show the page on each named card ("Product page", with Copy description) and the download adds Meta title, Meta description, Description and Description words columns. A range piece is marked named once its page is written too.

**Accuracy is checked in code, the same way as names.** The page may only state what the buyer gave (their description, details, facts and the name). A colour, fabric, length or audience word that isn't in those, a care, lining or sustainability claim ("machine washable", "lined", "organic"), or a measurement or percentage is an error, including in styling tips ("your favourite sneakers", never "white canvas sneakers"). So are the length limits, markdown and the brand's banned words. Anything wrong gets one repair with the problems listed; limits are then trimmed at a sentence or word if needed. A page that still states details nobody gave is not shown at all ("couldn't be written without guessing", with Try again) and the name stands on its own. Ordinary phrases are not flagged ("long weekend", "short walk", "full look").

**Tested like a buyer** (live Claude and Google, local, Opus 5.5):
- Typed "black dress with ruching, midi length, mesh sleeves": "Black Mesh Sleeve Ruched Midi Dress", meta title 48/60, meta description 133/160, description 772 words, read in full: only black, ruching, mesh sleeves and midi; styling names items without colours or fabrics. The first draft said "canvas" and "cropped" in its styling tips; the check caught it and the repair removed them (the styling rule in the instructions was then made stricter).
- A red dress photo, no typing: "Red One-Shoulder Ruffle Bodycon Dress", 50/60, 128/160, 717 words. "Rewrite it for this name" for "Red One-Shoulder Bodycon Dress" gave 43/60, 142/160, 741 words; its first draft said "mini" (not given) and the repair fixed it.
- A range piece: "Black Geometric Lace Sheer Yoke Top", 710 words, right first time, shown on the range card.

Cost on Opus 5.5: about 3 to 4¢ a page, about 7¢ when the first draft needs its repair (2 of the 4 pages above did). `ANTHROPIC_MODEL_CONTENT` can move pages to a cheaper model and `PAGE_CONTENT=off` turns them off; the quality-test runner skips them so it keeps measuring names only. 131 tests pass (9 new).

## Product data, stage 1: everything Google Shopping needs beyond the name (15 Nov 2026)

From Nitin's field list (the Trustana-style data sheet). Alongside the product page, every name now gets its product data, written at the same time so neither waits for the other (about 25 seconds after the name).

**Worked out by rules, never guessed by Claude:**
- **Google category** from Google's own taxonomy, sent as its ID (Dresses 2271, Trousers & Jeans 204, Handbags 3032, Earrings 194, Backpacks 100 and so on; IDs checked against Google's en-AU taxonomy file). Baby and toddler pieces go to Google's baby categories; bridal and bridesmaid dresses to theirs. A piece no rule covers gets Claude's pick from the same list, flagged to check.
- **Your own breadcrumb**: department from who it's for, then category, then style ("Women > Dresses > Maxi Dresses", "Girls > Dresses > Maxi Dresses", "Women > Jeans & Denim > Baggy Jeans").
- **Plain colour**, as Google asks: "cocoa" becomes Brown, "light dusty pink" Pink, denim washes Blue; up to three, main colour first, joined with "/". A shade it can't place is sent as written and flagged.
- **Pattern**, and **material only when stated**, fibre over weave ("100% cotton denim" is Cotton, "55% linen 45% viscose" is Linen/Viscose).
- **Gender and age group** (women's adult by default, as agreed; girls' pieces are Female/Kids), **size type** (Regular unless the buyer said petite, plus, tall or maternity) and **size system** AU.
- **Search queries to target**: the 3 to 5 phrases the name is built for, with monthly searches from the keyword list.
- **URL slug**, and **custom labels** 0 (occasion) and 1 (season). Labels 2 to 4 (price band, margin, new or sale) will come from the brand's own data.

**Written by Claude, checked in code like the name:** 2 to 6 highlights, product details as name and value from a list for each kind of piece ("Neckline: Cowl", "Rise: High rise"), a 500 to 1,000 character short description for Google Shopping, image alt text, season, and care (only when the buyer gave it; never general advice). A colour, fabric, length, audience, claim or measurement nobody gave gets one repair; whatever still invents after that is left out, never shown. Slimming, shaping and health claims are never written, here or on the product page.

**Ideal for**, as Nitin specified: up to four occasions from his list (wedding guest, cocktail, formal and black tie, races, graduation, work, date night, going out, brunch, holiday, beach, everyday, gym, lounge, travel, maternity, church and funeral, Christmas). Claude suggests them with a reason and a confidence; code then checks each against the piece's own details (a cotton t-shirt dress is never wedding guest; formal and black tie needs full length; gym needs activewear; church and funeral only for plainly sober pieces: dark plain colours, nothing short, sheer or sparkly) and against searches in the brand's current keyword list (100 a month or more). Only tags that pass both at high confidence go live, into the "Ideal for ..." sentence at the end of the short description and custom label 0; the rest are listed under "Check before using" with the reason.

**On screen:** a Product data section under the product page with "Check before it goes live" (name length against Google's ~70 shown and 150 maximum, missing or unmatched colour, material left blank, occasions and season to check), the Google Shopping fields, highlights, details, short description, ideal for, search queries, season, care, slug and alt text, each with Copy, plus "Copy all for a spreadsheet" (Google's own column names). Ranges show it on each named card and the download gains 24 columns, with names that appear twice in a range flagged (Google treats them as one product). The product page section now also shows for a name with no alternatives (it was hidden).

**Product page:** the meta description is now 150 to 160 characters with one benefit and a soft call to action (`content-v2`); anything under 140 is sent back once.

**How it runs:** `writeSheet` (`src/lib/pipeline/sheet.ts`, prompt `sheet-v1`) runs beside `writeContent`; both now save under a row lock (`src/lib/pipeline/store.ts`) so one never overwrites the other's result, usage or prompt version. Rules live in `src/lib/sheet/catalog.ts` and `src/lib/sheet/idealFor.ts`. `ANTHROPIC_MODEL_SHEET` picks the model, `PRODUCT_SHEET=off` turns it off, and the quality-test runner skips it. POST `/api/generations/[id]/sheet` fills it in again (Try again, or for names made before this).

**Tested like a buyer** (live Claude and Google, local, Nitin's 237,928-keyword list):
- "black satin slip midi dress with a cowl neckline and thin adjustable straps": "Black Satin Cowl Neck Midi Slip Dress", Dresses 2271, Women > Dresses > Midi Dresses, Black, Satin, five highlights, ideal for cocktail (28,000 searches a month), date night (700) and going out (9,000); wedding guest to check (Claude unsure); meta description 158 of 160. Both first drafts said "knit" (never given); both were caught and repaired.
- A red dress photo, no typing: Dresses 2271, Red, material left blank, cocktail, date night and going out live; Christmas to check.
- "light wash baggy jeans, high rise, 100% cotton denim, machine wash cold": Trousers & Jeans 204, Women > Jeans & Denim > Baggy Jeans, care kept as given, only everyday casual live.
- A lace top from a range: date night and going out live, cocktail to check, shown on its range card.
- Testing caught and fixed: a doubled full stop in reasons, straps filed under sleeves, "light wash" and "Cotton/Denim" (now Blue and Cotton), and occasion demand read from the list in use when the name was made rather than the brand's current one.

Claude cost: about 2 to 4 cents a piece on Opus 5.5 for the product data, more when its one repair runs. 148 tests pass (17 new). Not in this stage: the brand's product file in and a Google feed out (stage 2), DataForSEO (stage 3), and quality-test cases for these fields (stage 4).

## Product data, stage 2: the brand's product file in, a Google feed out (15 Nov 2026)

Nitin asked for my recommendations on the open questions, so: the short description (500 to 1,000 characters) goes to Google and the long 600 to 800 word one stays on the product page; Google's title is Nomen's name; any CSV or Excel file is accepted, with Google Merchant Center and Shopify column names recognised; the output is a Google supplemental feed (only Nomen's fields, matched by SKU) plus the review sheet; custom labels are 0 occasion, 1 season, 2 price band, 3 margin tier (only from the brand's file), 4 sale or full price; and wherever the brand's file already has a value, Nomen keeps it.

**Start a range from a product file.** An empty range now offers "Or start from your product file". The buyer chooses the file, checks our guess of what each column is (shown in Google's own terms, like the keyword upload), and adds its products, up to 200 at a time. One piece per product and colour: its sizes are named once and share the name (grouped by item group ID, or by title when there isn't one). Each piece's details come straight from the file (title, description with the HTML taken out, colour, material, pattern, gender and age group), so "Model wears AU 8" and "Hand wash cold" from the brand's description reach the facts. Its photo is then fetched from its image link and read like a dropped photo, told which kind of piece to look at, and it only fills what the file left blank. A Shopify export is read as Shopify writes it: filled down by product, options as colour and size, a higher compare-at price as a sale, stock from the inventory count, and its extra image rows skipped.

**Checked the way Google will, never fixed.** The file gets a checks panel: what Google rejects (no ID, product link, image link, availability, price, brand or condition; availability or price it can't read; a sale price that isn't lower; links that aren't web addresses; the same ID twice; sizes or colours of one product without an item group ID; variants in a group missing a colour or size, or with the same colour and size) and what it recommends (a GTIN or MPN; a plain colour name, e.g. "Light Wash" -> "Blue"). Each card lists its own. Small things are read the way Google wants without changing the brand's file: "In Stock" as in_stock, "59.95" as 59.95 AUD (noted).

**Out:** "Download for Google" is a tab-separated supplemental feed with one row per SKU: id, title (the name), description (the short description), google_product_category (ID), product_type, color, pattern, material, gender, age_group, size_type, size_system, custom_label_0 to 4, and product_highlight and product_detail repeated once per value. Price, stock, GTIN, links and shipping stay only in the brand's own feed. "Download the review sheet" adds SKUs and the file's checks to the range spreadsheet.

**Safety:** image links are fetched only from public web addresses: anything resolving to a private, local or cloud-metadata address is refused, before the request and after every redirect, with a 15-second timeout and 15MB limit. A link that fails leaves the piece to be named from the file's own details. Images are resized on the server (`sharp`, now a direct dependency). Migration `20261115142230_product_files` (Batch: source, fileName, fileCheck; BatchItem: imageUrl, feed, photo now optional).

**Tested like a buyer** (live Claude, local): a Merchant Center-style sample file (a dress in three sizes, jeans in two sizes on sale, a bag with no product link; photos from public links) was matched column by column, read, checked (the missing link, missing GTINs) and named: "Red One-Shoulder Ruffle Bodycon Dress", "Light Wash High Rise Baggy Jeans", "Pink Tassel Saddle Crossbody Bag", with a six-row Google feed (sale label on the jeans, price bands, categories 2271, 204 and 3032). Testing caught and fixed: the jeans photo was read as the jumper worn with them (the photo reader is now told the file's product type), "Riley Jean" is now "jeans", a single product with a colour was wrongly told it needed a group ID, and "1 things". Also fixed and pushed earlier the same day: the occasion tags' style had turned every filter button black. 159 tests pass (11 new).

Not yet: DataForSEO (stage 3) and quality-test cases for the product data (stage 4).

## Product data, stage 3: live Google search figures from DataForSEO (16 Nov 2026)

Nitin's list covers women's fashion well but has gaps: only 7 of its 237,928 keywords mention girls or kids, and some occasion phrases are missing. Nomen now asks Google (DataForSEO Labs, Australia) for what the list doesn't have, and the same scoring rules decide what counts.

- **Phrase figures:** for each piece, its own phrases the list lacks ("girls maxi dress", "girls cream dress"...) get Google's monthly searches in one request.
- **Suggestions:** when the list barely covers the piece (fewer than three solid matches) or it's for a girl, boy, child or man, Google's searched phrases around it ("girls dress": "girls party dress", ...) are added too. Word-order twins ("slip dress black" and "black slip dress" share one figure in Google's data) are kept once.
- **Same rules:** these live phrases are scored beside the list's own, so one naming a colour or detail the buyer never gave is still excluded. A piece's audience now counts as supported ("girls maxi dress" for a girls' dress).
- **Occasions:** "Ideal for" demand checks ask Google for occasion phrases the list doesn't have.
- **Marked on screen:** the evidence marks Google's figures "Google", and "Search queries to target" says "from Google".
- **Cost and caching:** figures are cached for 30 days. About 1.3 cents a request (one or two per name, only when needed) and recorded with the generation. A failed lookup never stops a name: it's named from the list alone, with a note.
- **Switches:** `LIVE_KEYWORDS=off` turns it off. The quality-test runner keeps it off by default so scores compare with earlier runs; `LIVE_KEYWORDS=on` to measure it.

**Checked live first** (15 Nov): Labs works for Australia (location 2036): "wedding guest dress" 27,100 a month (Nitin's list: 26,000), "black satin slip dress" 260, "girls maxi dress" no figure. Suggestions for "black slip dress" returned 15 searched phrasings. Account balance US$21.45 at the time.

**Google Shopping, tried and left out:** a priority Shopping search (0.2 cents) for "black satin slip dress" in Australia returned 45 results, mostly Amazon under-slips, dress-hire listings and ASOS, with no product attributes (colour, material) on any. Not useful for naming or product data, so it isn't built in. It could later benchmark prices for the price-band label.

**Tested like a buyer** (live, local, Nitin's list):
- "girls cream embroidered maxi dress with a wrap neckline and gold trim" named "Girls' Cream Embroidered Maxi Dress". The reason now cites "girls dress" at 9,900 searches a month from Google, and the piece is no longer marked as having limited keyword evidence. Nine Google phrases were considered. DataForSEO cost 4.4 cents (three Google searches, two figure lookups, one occasion check).
- "black satin slip midi dress with a cowl neckline" (well covered by the list): one figure lookup, no suggestions, "Black Satin Cowl Neck Midi Slip Dress" at high confidence, 1.4 cents.

166 tests pass (7 new). Not in this stage: quality-test cases for the product data (stage 4).


## Product data, stage 4: a quality test for the product data (16 Nov 2026)

The naming quality test (`evals/naming/`) now scores the product data too, on the same Sportsgirl products plus three new children's pieces (a girls' dress, boys' shorts and a toddler's dress). The right Google category, colour, material, pattern, gender and age group for every product were written down by hand from what its page states, before any answer was seen (`evals/naming/data-labels.mjs`, facts only, no Sportsgirl copy). Each piece is checked for:

- **Google attributes:** category, colour (main colour right, nothing unstated after it), material (main fibre first), pattern, gender and age group all match the labels.
- **Google's limits:** 2 to 6 highlights of at most 150 characters, short description 500 to 1,000, alt text 125, custom labels 100.
- **No bad claims:** no banned health or promotional wording (slimming, free shipping, best-seller…), and no fabric, care, lining, stretch, sun-protection, sustainability, percentage or measurement the input doesn't state. This uses the test's own word matcher, not Nomen's.
- **Every statement true, and every "Ideal for" occasion right:** a judge (Claude Sonnet 5.5) checks both. Maternity, gym and lounge tags also fail outright unless the input says so.
- **Children's names:** the name must say who the piece is for ("Girls'").

It runs as the live site does, with Nitin's keyword list (loaded into the test database) and live Google figures. The runner's new `EVAL_KEYWORD_LIST` setting picks the list for each run; the name-only test keeps running without one, so its scores still compare with earlier runs.

**Fixed before the paid run** (a free trial run showed them):

| Before | Now |
| --- | --- |
| A "linen blend" that is 73% viscose was sent to Google as Linen/Viscose | The main fibre comes first by its stated share: Viscose/Linen |
| Culottes got no Google category | Culottes (and jeggings, sweatpants, capris, palazzos) are Trousers & Jeans |
| A knit or crochet vest was filed under outdoor gilets | A vest is a top unless it's padded, quilted or a puffer |
| "Matcha ombre" and "Hibisicus/Frangipani" were sent as colours as written | A shade that isn't a colour shoppers recognise isn't sent. Another stated colour is used instead (pink and green), or a person is asked to add one |
| Two-colour names took only the second colour ("chocolate ecru" → Cream) | Both: Brown/Cream. "Pink red" is Pink/Red, while "navy blue" stays Navy and "coral pink" is Pink |
| PU, "recy poly" and "vis" weren't read as fabrics; "Woven" was sent as a material | Read as Polyurethane, Recycled Polyester, Viscose; a weave on its own isn't sent |
| A toddler's dress was Unisex | A child's dress or skirt is Female, whatever age group the buyer gave |

**Paid run (49 pieces, US$4.48: Nomen's Claude 3.25, the judges 0.21, Google figures 1.02):**

- Product data was written for all 42 pieces that got a name and was right on 41. Category, colour, pattern, gender and age group were right on every piece. No banned or unstated claims, no untrue statements, and no wrong "Ideal for" occasions. 40 of the 42 had at least one occasion ready to publish.
- The children's pieces were all named for who they're for ("Girls' Cream Cotton Embroidered Maxi Dress") and had the right age group (Kids, Toddler).
- The one miss: the shacket's fabric line ("50% recy poly 40% poly 10% vis"). Nomen's own fact check didn't recognise the shorthand, so it threw the fabric away. Google's material was left blank, and a correct fabric highlight was removed. **Fixed:** the fact check, the product data and the product page all read fabric shorthand as the fibre it stands for. Re-run on the shacket, the PU bag and a recycled-polyester tee (US$0.24): all three now pass, and the shacket's material is Polyester/Viscose.
- Names: 44 of 49 passed. Three pieces asked a question instead, each about an inconsistency in Sportsgirl's own page:
  - the nylon bag, whose fabric is listed as polyester (it has asked in every run);
  - a linen-blend dress, whose fabric is given two ways;
  - a "neutral" bead necklace whose colour is gold.
  The last two change between runs. Two names read awkwardly to the judge ("Silver Sequin Detailing Evening Bag", "Beachy Gold Statement Earrings Megapack").

167 tests pass. Because the scorer changed, the next paid run of the name-only test needs a person to approve it again (`--approve-harness`).

## Why names sat at Medium confidence, and the fix (18 Nov 2026)

In the 16 Nov quality test, 19 of 42 names were Medium. There were two causes:

- **8 were a bug.** Each name runs 2 or 3 Google searches through DataForSEO. About one search in twelve failed once with DataForSEO's own temporary "Internal SE Server Error". Nomen treated that as permanent, so the Google evidence counted as incomplete, and incomplete evidence caps confidence at Medium. Now DataForSEO's server errors are retried, as network errors already were (both the Google results and the live keyword figures). A bad request still isn't retried, and "no search results" counts as an answer, not a failure (`src/lib/providers/dataforseo.ts`, tested in `tests/providers.test.ts`).
- **11 were the AI's own choice.** Its instructions never said what High and Medium mean, so any caution it wrote ("check 'Cropped' against the photo") pulled it down. The name instructions (`recommend-v8`) now define the levels:
  - **High:** every word is a given fact, the product type is clear, and the evidence fits this piece.
  - **Medium:** the evidence only partly fits (a different audience, cut or kind of product, conflicting evidence, or a lead detail with little search evidence).
  - **Low:** the evidence doesn't fit or the facts are too thin.

  Advice for the buyer stays in the warnings without lowering the level.

**Re-test (all 49 pieces, US$3.63):**

- High confidence went from 23 of 42 named pieces to 31 of 43.
- Only 1 piece still had a failed Google search after the retries.
- The Mediums that remain mostly have a real reason. For example, the "lemon tee" results are lemon-print tees, and "vest" searches mostly find tank tops and puffer vests. A girls' maxi dress also stays Medium, because the maxi dress evidence is for women's.
- Names passed on 46 of 49 (was 44). Every name now reads naturally to the judge, and the linen-blend dress that used to ask a question is named. The two pieces that still ask are the polyester "nylon" bag and the "neutral" necklace whose colour is gold.
- Product data was right on 42 of the 43 pieces that got it. The miss was a short description of 490 characters, under the 500 that reads best on Google.

**Two more fixes from the re-test:**

- **Short description:** the AI was asked for 450 to 900 characters, counting on the "Ideal for" sentence to lift it past 500, but that sentence is missing when no occasion is confirmed. It's now asked for 500 to 900, and a shorter draft is sent back (`sheet-v2`). Checked on three pieces (US$0.30): 595, 687 and 591 characters.
- **Made-by-hand claims:** that check also caught "handcrafted embroidery" in a girls' dress's product data, which nobody had said. Nomen's own check knew "handmade" but not "handcrafted". It now blocks the family (handcrafted, hand-stitched, hand-embroidered, hand-beaded, artisan…) unless the input says so, on the product page and in the product data alike.

**The test itself:** its word matcher now reads fabric shorthand too, so "Blue Recycled Polyester Shacket" from "recy poly" isn't marked invented. `regrade.mjs` now keeps the product-data verdicts when it re-scores (it had been dropping them) and saves the previous scores first.

169 tests pass.

## Saree review fixes, and ranges with no size limit (18 Nov 2026)

Fixes from checking a saree named on the live site, then naming one again locally (real Claude, Nitin's keyword list, US$0.12):

- **The name's parts showed "&" as a detail.** "Maroon & Gold Check Saree With Zari Border" was split word by word, so "&" became a "Detail" chip. A detail's words were also split apart ("Zari" and "Border"; "Square" and "Neck" for a "square neckline"). Now joining words like "&" and "with" are skipped, and a run of a detail's words stays one part even when the buyer wrote more ("woven zari border"). "Neck" is read as "neckline", and patterns show as "Pattern" (`src/lib/nameParts.ts`, tested). The saree now shows Maroon · Gold · Check · Zari Border · Saree.
- **Sarees had no Google category.** Google's own Traditional & Ceremonial Clothing branch was missing, so a saree got no category. Added Saris (8248), Traditional & Ceremonial Clothing (5388: lehengas, anarkalis, sherwanis, cheongsams…) and Dirndls (6031), all checked against Google's en-AU list. A saree's product details are now Border, Blouse, Drape, Length, Fabric, Pattern and Embellishment, instead of Style, Size, Fit and Closure.
- **Maroon was sent to Google as Burgundy.** "Maroon saree" is the most-searched phrase for this piece, and maroon is a colour shoppers search by, so it's now its own colour.
- **"Wedding guest" wasn't allowed for a zari saree.** The occasion rules didn't count traditional occasion wear as dressy. They now do (zari, zardozi, Banarasi, Kanjeevaram, sarees, lehengas…), and a saree or lehenga counts as full-length. "Christmas and festive" stays a person's call.
- **Search-figure bars:** the widths were rounded differently on the server and in the browser (a warning in development only). They're now rounded once.

The re-named saree: "Maroon & Gold Check Zari Border Saree" at High confidence, category Saris (8248), with Border, Blouse and Pattern details. Material was left blank because it wasn't given, and nothing was made up on the product page.

**Ranges have no size limit.** A range held up to 60 photos, a product file up to 200 products, and each login could add 300 photos and name 300 pieces an hour. All four limits are gone.

The 60 was there because the range screen re-fetched every piece, with its full product page and product data, every 2.5 seconds while anything was working: several megabytes a check for a big range. Now it asks only for the pieces that changed since its last check, plus the list of pieces, so a range of any size costs about the same to keep up to date.

Bulk status changes ("Name all", restart recovery) now also update each piece's "last changed" time, which they hadn't been doing. A test caught that.

Checked locally with the stand-in AI: a 75-photo range was added, read and named, the screen kept up through the changed-only checks, and it ended on "75 named". A 150-piece range is covered by a test. Naming runs 3 pieces at a time (about 6 a minute with the real AI) and carries on with the screen closed.

175 tests pass.

## Naming was taking about a minute: a lost search index (20 Nov 2026)

On the live site every name took 57–85 seconds from 15 November, even when every Google search was already saved. On 14 November it was 15–21 seconds. Timing one live name stage by stage: reading the details took 3 s, **matching against the keyword list 35.6 s**, the (saved) Google searches under 1 s.

The cause is the index behind the keyword list's spelling and word-order searches. Migration `20261005123050_dataset_rejections` dropped it by accident (it wasn't declared in the schema, so the schema-generated migration removed it). Since then each of those searches has read the whole keyword table. Nobody noticed until Nitin's 237,928-phrase list went live on 15 November, on Render's smallest database (256 MB of memory).

- **The index is back** (`20261120090000_restore_keyword_trigram_index`) and is now declared in `prisma/schema.prisma`, so no future migration can drop it. A drift check against the schema is clean.
- **Spelling searches:** they use a 0.5 closeness bar, which gives the same top matches as the default 0.3 at about a sixth of the reads, and singular forms only, because the plural finds the same phrases.
- **The bogus "dresss" searches are gone.** Search phrases are made with real plurals ("dresses").
- Locally the keyword step went from about 3.9 s of database work to 0.26 s for a dress (0.01–0.15 s for other pieces).

**Slow outside services can't hold a name up any more:**

- Each DataForSEO try waits at most 10 s instead of 25, with 2 tries instead of 3; a normal reply takes about 4 s.
- The Google-search step has a 15-second limit, and the live keyword figures a 10-second one. A search still out after that is left out of this name. It keeps running and is saved, so the next piece that needs it gets it at once, and its cost is recorded when it lands.
- One missing search out of three no longer counts as "partial" Google evidence, which capped the name at Medium. Most of them missing still does.

**Colours show as circles.** In the product data's Google Shopping section and on range cards, each colour is a filled circle: gold and silver look metallic, and multicolour is a colour wheel. Its name shows on hover and is read out by screen readers. Google still gets the colour's name, and that's what's copied.

178 tests pass.

## Tested with 12 real product photos from Google (20 Nov 2026)

Twelve product photos from Australian online stores (found through Google Images) went into a test range on the live site, as if a buyer had dropped them in:

- two black slip dresses;
- wide-leg jeans;
- two chunky cardigans;
- a one-piece swimsuit;
- leather sneakers;
- a crossbody bag;
- gold hoop earrings;
- leggings;
- a pleated midi skirt;
- a girls' tulle dress.

The files were named web-01 to web-12, so Nomen had only the photos to go on. Cost about US$1.60.

**What went well:**

- Every photo was read as the right kind of piece, in the right colour, with its defining details: slip, lace trim, patch pockets, chunky knit, side cut-outs, side zip, zip flap, tie belt, tulle skirt.
- Things that weren't the product were left out (the floral dress behind the bag, the bra top worn with the leggings).
- 9 of 12 names were High confidence.
- The product data was right throughout. Categories included Swimwear, Shoes, Handbags and Earrings, and the girls' dress came out as Female/Kids under "Girls > Dresses". Occasions were sensible (Cocktail and Date night for the slip dresses, Beach and Holiday for the swimsuit), and so were the custom labels.

**Mistakes found, and fixed:**

| Mistake | Fix |
| --- | --- |
| Full-length jeans were read as "ankle" length, and it spread to a highlight, the product details, the meta description and an alternative name | The photo reader leaves length out for full-length pants, jeans and leggings: cropped or ankle only when skin or sock shows between hem and shoe (`photo-v4`). Re-read: the jeans have no length (and "mid blue", as the store calls it); the leggings, which do stop above the sock, keep "ankle" |
| A lace V neckline was read as "square" (the instructions' own example listed "square neckline") | A neckline is named only when its shape is unmistakable, and the example no longer suggests one. Re-read: the lace dress and the girls' dress now say "neckline: not sure" |
| 6 of 36 Google searches were cut off in the range, which held 2 pieces at Medium. With three pieces named at once DataForSEO answers more slowly, and the new 10-second limit per try was too short | Each try waits up to 20 s. A range piece, which no one is waiting on, gives the search step 45 s (30 s for keyword figures); a piece named on its own gives 20 s (12 s) |
| Searches wasted on near-duplicates ("white leather sneaker" after "white leather sneakers") and doubled words ("swim swimsuit") | Duplicate checks compare singular forms, and a use word already in the product noun isn't repeated |
| Earrings were told "You didn't mention the fabric" | Clothing says fabric; bags, shoes and accessories say material; jewellery says metal or material |
| "Google shows a mix of shops and articles…" was a warning on 10 of 12 names | Dropped as a warning: that's normal for fashion searches, and the evidence panel already says what Google shows |

**Not changed yet:** for the swimsuit, "black one piece swimsuit" has 1,900 searches a month against 600 for "black swimsuit", but Nomen couldn't use "One Piece", because only words from the facts are allowed in a name. Treating it as the same thing as "swimsuit" (and similar pairs like tee/t-shirt) means changing the name instructions, which needs a full re-test first.

181 tests pass.

## Milestone 1: production readiness (20–21 Nov 2026)

- **Reliability:**
  - range work restarts on server start (`src/instrumentation.ts`);
  - CI runs `npm run db:check`, so the schema and the database must agree;
  - storage use is shown on the Keyword lists page.
- **Product files:**
  - columns are matched by the words in them ("Product Code", "Item Colour", "Web Description", "Style Number", "RRP", "Now Price"…);
  - each brand's confirmed column choices are remembered (`FeedColumn` table);
  - sale-date checks;
  - a new "Size & fit notes" column, used only from the retailer's text, never from a photo; a size & fit field in product data and the review sheet.
- **Ranges:**
  - "Try the failed again" re-reads or renames only the failed pieces;
  - time left is shown while working;
  - photo reading cost is recorded (`BatchItem.readUsage`);
  - a "Check the whole range" panel, plus problems and summary downloads (counts, confidence, Claude and DataForSEO cost at list prices).
- **Validation:**
  - Google's full category list (5,427) is stored (`GoogleCategory`), seeded on deploy from `prisma/data`, and the owner can update it from Google;
  - a catalogue checker finds duplicate web addresses, the same thing named two ways, missing descriptions or alt text, mixed size systems, and every attribute against Google's rules (`src/lib/catalogue`), including the brand's own Google category.
- **Approval workflow:**
  - roles `editor` and `reviewer`;
  - statuses AI generated, Needs review, Approved, Rejected and Ready to export;
  - the Review queue (`/review`) and a review page per product: every field editable, approval per field, history with restore, comments with an "AI mistake" flag;
  - reviewers see the whole brand, editors their own;
  - brand admins manage their brand's logins;
  - people's edits flow into the range screen, review sheet and Google feed;
  - the brand switch "Only export approved products" is off by default, so behaviour is unchanged until it's switched on;
  - a corrections download;
  - permissions are configurable per brand (`settings.permissions`).
- **Database:** four additive migrations (`20261120120000` to `20261120150000`). The new role values can't be removed from Postgres if rolled back.
- **Tests:** 200 pass (was 181), plus type check and lint.
- **Checked in a browser** on a local copy with the stand-in AI:
  - Review queue, editing a field, history, approve all, and a comment flagged as an AI mistake.
  - A reviewer: sees the whole brand, can approve, can't edit or create (403), lands on Review.
  - An editor: sees only their own work, can edit and send for review, can't approve.
  - A product file with retailer column names: all 17 matched, and remembered on the next upload.
  - Broken image, expired sale and mixed sizes caught; the whole-range check and its problems and summary downloads work.
  - The Google feed with approval off, with approval on (refused until something is approved), and with one product approved.
  - Keyword lists (storage, Google category update) and Logins (new roles).
- **Fixed during the browser check:**
  - The start-up file pulled the image library into the edge build, which broke every page. The server-only import is now inside the Node.js check, as Next.js documents (`src/instrumentation-node.ts`).
  - Reviewers no longer see a Create link.
  - Only real problems (below High, a missing Google category or colour, a too-short description, a failed part) start a product as "Needs review"; routine notes don't.
  - Original details are listed in a fixed order, and checkboxes have labels.
  - "Already up to date" no longer claims an update.
- **The production build (`next build`) succeeds.**

**Deployment checklist:**

1. Push to main. Render runs `npm run db:migrate` (four additive updates) and `npm run db:seed`, which loads Google's 5,427 categories.
2. Nothing to configure: no new settings. Approval is off for every brand until a brand admin ticks "Only export approved products" on the Review page.
3. After the deploy, check:
   - `/api/health`;
   - the Review page lists earlier products (they're added on first open);
   - the Keyword lists page shows the category count;
   - a range's "Check the whole range" panel opens.
4. Logins: existing buyers keep working as editors. Create reviewer logins on the Logins page; brand admins can now do this for their own brand.

## Milestone 2: product intelligence (21 Nov 2026, built, browser-tested locally and checked with the real AI; NOT committed or deployed)

- **Category rules** (`src/lib/category/rules.ts`), one place for each kind of piece: shoes, swimwear, lingerie and sleepwear, activewear, jewellery, bags, accessories, and everyday clothing.
  - Each kind lists the product types it covers, what a photo may show (heel type, toe, closure; neckline, straps, coverage, back; waistband, leg length...) and what only the retailer's data can give (upper and sole material, padding, underwire, support level, fabric composition, the metal of jewellery).
  - Photo reading (`photo-v5`) follows the kind's rules: never leather or suede from a photo of shoes or bags, never the metal or a gemstone from a photo of jewellery, and it names the exact piece (one-piece swimsuit, bikini top or bottoms, sports bra, ballet flats).
  - A photo's category details come back marked clearly or partly visible. Clearly visible ones go into "Extra product facts" for the buyer to check; partly visible ones are only flagged ("we couldn't tell the toe"); retailer-only ones are dropped even if the AI offers them.
  - Each kind has claims that need the retailer's data, checked in code on every product page and product data sheet and repaired once, or the part isn't shown: comfort, support, lift, padding or shaping for lingerie; support level, sweat-wicking or squat-proof for activewear; UPF, chlorine resistance or lining for swimwear; sterling silver, carats, plating or gemstones for jewellery; genuine leather or laptop fit for bags.
  - Product data asks for each kind's own details (swimwear: neckline, straps, coverage, back; lingerie: padding, underwire, support; activewear: waistband, leg length, activity).
  - The material field is labelled by kind: "Upper material" for shoes, "Metal or material" for jewellery, "Fabric (from the label)" for swimwear, lingerie and activewear.
- **"One piece":** a swimsuit that isn't a bikini, tankini, two-piece or cover-up is a one piece swimsuit. The keyword list is searched under both names ("black one piece" is found for a swimsuit), keyword scoring counts them as the product type, the naming instructions (`recommend-v9`) may use the most-searched one, and the name check accepts it (in any written form, "One Piece" or "One-Piece"), never two names in one title, and never for a bikini. Plain swaps (tee or t-shirt, sweater or jumper, pants or trousers) were tried and taken out after the paid check (below): which one a brand writes is its own choice, in its brand profile.
- **Several photos per piece** (up to 6: the main one and 5 more):
  - Ranges: "Add photos (back, side, details)" on each piece until it's named; the piece is read again with every photo. Product files bring their own extra photos: `additional_image_link`, other rows' images, and Shopify's extra image rows (which were skipped before).
  - The single-piece form: "More photos of this piece" after the main photo, read together with it.
  - One reading combines what all the photos show; each photo gets a view (front, back, side, detail, fabric, worn or styled) and its own alt text ("Back view of ...", no keyword lists).
  - Photo checks without AI (`src/lib/images/quality.ts`): too small for Google (under 250 × 250, judged on the original), small for zoom (under 800), blurry (calibrated on the app's stock photos: sharp ones scored 110 or more, clearly blurred ones under 25; the cut-off is 20), and the same photo twice. The AI adds a different product, several products in one photo, or a piece that can't be made out. A broken extra image link is noted on that photo.
  - Where a product file's colour or length plainly disagrees with its photo (by colour family, so Navy and dark blue agree), the piece says so. The file still wins.
  - Every photo, its view, alt text and problems show on the range card, the result page (with "Copy alt text") and the review page; the range download adds the other photos' alt text and photo problems; the whole-range check lists photo problems (too small for Google counts as an error).
- **Brand profile** (`/admin/brand`, "Brand" in the menu, brand admins and the owner):
  - who the brand writes for, its tone, description style, search preferences, its own words ("Pants" instead of "trousers", "Ecru" instead of "cream"), words never to use or to avoid, capitals, the longest name, the order of details (learned from the keyword list, or its own), and names it likes and doesn't.
  - Naming, product pages (`content-v3`) and product data (`sheet-v3`) follow it. The brand's word may replace a word the facts use, and a page or name that uses a replaced word is sent back once. The voice never adds a fact.
  - Empty for every brand until someone fills it in, so names come out as before. Every save is in the audit log with the fields that changed.
- **Learn from your catalogue:** upload products the brand has already approved (a Shopify export or any CSV or Excel with names and descriptions, up to 5,000). Nomen measures name length, capitals, the order of details, which of two words the brand uses (only when one leads three to one), its colour words, product words and how its descriptions are built, and one short read on the cheap model describes its tone, audience and description style (well under a cent on the cheap reading model Render uses). Everything is a suggestion with a tick box; "Use the ticked ones" only fills in the form, and nothing changes until the admin saves.
- **Brand consistency:** the whole-range check now suggests the brand's own word where a name uses a replaced one ("Uses 'trousers': your word is 'Pants' (Black Tailored Pants)"), points out names whose details are in a different order from the rest of the range, and adds faux leather, vegan leather, PU and leather-look to the "same thing, two words" groups. Suggestions only.
- **Category test sets, tooling:** `evals/naming/thresholds.json` (the bar: classification 95%, details 90%, naming 85%, no unsupported claims 100%, on at least 30 checked products) and `evals/naming/category-report.mjs`, which scores each category separately from the latest full runs and writes `readiness.json`. On the existing 49 cases every category has 1 to 9 checked products, so none can be called ready yet. Names are scored from the product-data run, which names with the keyword list as the live site does, and a later re-run of some cases replaces their results. The collector now covers Sportsgirl's accessories (belts, hats, sunglasses, hair, scarves, wallets) and resumes. Sportsgirl doesn't sell shoes, swimwear, activewear or lingerie (those pages redirect to /clothing/), so their test products need another source.
- **Database:** two additive migrations: `20261121090000_product_images` (the `ProductImage` table) and `20261121091000_generation_photos` (`Generation.photos`).
- **Tests:** 261 pass (was 200): category rules, one piece, several photos, brand profile, catalogue learning and consistency.
- **Checked in a browser** on a local copy with the stand-in AI:
  - Brand profile: a 24-product catalogue upload gave the right suggestions (Pants over trousers 5 to 1; colour, material, detail, length; colour words); "Use the ticked ones" filled the form; Save stored it with an audit record; a "trousers" piece was then named with "Pants".
  - A range piece with three extra photos: each got a view and alt text; the blurry and too-small ones were flagged; removing one re-read the piece; the named product kept its photos, and the review page showed them.
  - The single-piece form with two extra photos: the duplicate was flagged, and the result page's Photos section showed each photo's alt text with a copy button.
  - The Brand profile page on a phone-sized screen, with no sideways scrolling.
- **Fixed during the browser check:** tick-box labels inherited the site's small-capitals label style; the photo strip used a class name the "Preview version" banner already had (a black band behind the thumbnails); a removed photo's problems now disappear straight away; the stand-in AI follows the brand's words, so preview mode doesn't fail on them.
- **The production build (`next build`) succeeds.**

**Paid check with the real AI (21 Nov, live setup: Haiku reads typed details, Opus reads photos and writes; US$7.33 in all):**

- **Product-data test, all 49 cases (v4, US$3.89):** names that pass every check fell from 46 of 49 (v2, before Milestone 2) to 39, and "no invented words" from 43 of 43 to 37. Cause: the blanket "same type" swaps turned Sportsgirl's own words into others ("knit tee" into "T-Shirt", "sweater" into "Jumper", "pant" into "Trousers" in alternatives). Fixed by keeping only swimsuit and one piece. The brand-voice and kind notes also moved out of the fixed page and data instructions into each request, where they appear only when they apply, so those instructions are again exactly as before for a brand without a profile.
- **The 16 cases that failed anything, re-run after the fix (v5, US$1.11):** 14 of 16 names pass; "Sweater" and "Tee" are back. Taking v5 over v4: names 47 of 49 (before: 46), product data 41 of 45 (before: 42), no invented words 43 of 43, no unsupported claims 43 of 43, Google category 43 of 43. Still failing, none caused by Milestone 2: two bags ask a question about their own listing (colour "matcha ombre" but "pink and green" in the description; nylon in the title, polyester in the listing, which it also asked before), the cheaper reading model lists linen before viscose for one dress (so Google's main material is wrong), and one short description called denim shorts "hard-wearing". Durability words (hard-wearing, durable, long-lasting, built to last) are now claims that need the retailer's data, so the code catches it too.
- **"One piece", typed (US$0.13):** "black high neck swimsuit" was named "Black High Neck One Piece Swimsuit" at High confidence (1,900 monthly searches for "black one piece swimsuit" against 600 for "black swimsuit"); "black halter bikini top" stayed "Black Halter Bikini Top".
- **12 real products, up to 3 photos each (US$2.20):** 7 from Sportsgirl, a one-piece and a bikini top (Bond-Eye, Kulani Kinis), two shoes (Tony Bianco) and earrings (Billini). All named, with product pages and data. Shoes got heel type, height, toe and closure, and "upper material" was left to the retailer; jewellery was "gold-tone" or "silver-tone", never a metal; no bag material was guessed. Sportsgirl's third gallery image (a brand logo card) was flagged as not the product, and Bond-Eye's extra photos in another colour were flagged as a different product. The one-piece was named "Black Plunge High-Cut Leg One-Piece Swimsuit". Worth knowing: the photo reader called Sportsgirl's knit sweater a "jumper"; a brand that writes "Sweater" can say so in its brand profile.
- **Not run:** the names-only test. Its harness check asks a person to approve the grader change of 18 Nov (fabric shorthand like "poly" read as polyester), which the product-data test was already approved for. The product-data test scores every name anyway.

**Not done yet:**

- The category test sets themselves: collecting 30 to 50 products per category, a person checking every label, and a full run (about US$25 to 45 each time). Shoes, swimwear, activewear and lingerie need a source other than Sportsgirl.
- Grouping dropped photos into one piece by file name (dress-1.jpg, dress-2.jpg): photos are added to a piece from its card instead.

**Deployment checklist:**

1. Push to main. Render runs `npm run db:migrate` (two additive updates). No new settings.
2. After the deploy: `/api/health`; the Brand page opens for a brand admin; add a photo to a range piece and see it read again; the result page's Photos section.
3. Brand profiles start empty, so nothing changes for a brand until its admin fills one in.

## Milestone 3: business intelligence (25 Nov 2026, built, browser-tested locally and checked live; NOT committed or deployed)

- **Spend ledger** (`UsageEvent`, `src/lib/usage/ledger.ts`): one row per paid call, by step (reading typed details, writing the name, product page, product data, Google results, Google search figures, reading photos, reading a brand's voice, seasonal figures), with its brand, range and product, at list prices. Reading a photo in the single-piece form was not recorded anywhere before; it is now. Products named earlier are added on deploy as one total each ("Earlier products, not split by step", marked backfilled), and range photo readings one row each; running it again adds nothing twice. Recording never stops the work.
- **Test markers:** a range (on its page) or a single product (on its Review page) can be counted as a test by a brand admin or the owner, with an audit record; tests are left out of the dashboard unless "Include tests" is ticked. Ranges titled "TEST…" are marked on deploy.
- **Dashboard** (`/dashboard`, "Dashboard" in the menu, brand admins and the owner; the owner can pick a brand or see every brand), filtered by period (7, 30, 90 days, all time), category and tests:
  - Work done: named, waiting for review, approved, rejected, asked for a detail, didn't work, and how long a name usually takes.
  - Ranges: how many, pieces named and failed, and the recent ones with their time and cost.
  - Quality in live use: confidence, how often people changed what the AI wrote and which fields, AI mistakes flagged, names shared by more than one piece, pages and product data held back, photo problems.
  - The checked test set, kept apart and labelled "test products, not live work", with each category's four scores and how many more checked products it needs.
  - Spend: total, per named piece, Claude and Google, by step, by day, and by brand for the owner.
  - Search performance: a note that it appears once Search Console and Analytics are connected (Milestone 4). Nothing estimated.
- **Seasonal keywords:** Google's figures already came with years of monthly searches (checked live 25 Nov: "christmas dress" about 49,500 to 60,500 a month in Nov and Dec, about 200 to 300 in Feb); they are now kept with each cached figure (the last three years). Product data asks for the history of the phrases it shows in the same request as its occasion figures, and each search phrase on the product page gets 12 small monthly bars and, when it has one, "Searches peak in Nov–Dec (about 5 times the yearly average)". The dashboard's seasonal calendar covers 35 phrases a fashion retailer in Australia plans around (Christmas, races, formal, swimwear, winter coats...), checked at most once a month (about 1.5 cents), with what's in season now and what rises in the next two months. Google's figures only, never mixed with the keyword list's.
- **Competitor naming gaps:** from the Google results already saved with each name (no new searches, no cost), per category: the words other shops' product titles use that the brand's names rarely do (in at least 15% of their titles, from at least two shops, and under half as often in the brand's names), each with how often, which shops, an example title and the searches it came from. The brand's own site is left out, colours are left out, and the page says to use a word only when it's true of the piece and never to copy another shop's name.
- **Header:** with eight menu items for brand admins, the menu takes its own row below 1,100px.
- **Database:** one additive migration, `20261125090000_usage_ledger` (the `UsageEvent` table, `Batch.isTest`, `Generation.isTest`).
- **Tests:** 270 pass (was 261): seasons, the ledger and its backfill, history kept with figures, the calendar's lists, the dashboard's counts with tests left out and the category filter, naming gaps.
- **Checked in a browser** on a local copy with the stand-in AI, as a brand admin: the dashboard's sections, filters and test exclusion (marking a range as a test moved its piece from "Named" to "left out"); an editor can't mark tests or open the dashboard; product data showed monthly bars for every search phrase; the page on a phone-sized screen.
- **Fixed during the browser check:** the test-set table pushed the page sideways on a phone (it now scrolls on its own); the menu crowded the header with eight items; the test date read "2026-11-20".
- **The production build (`next build`) succeeds.**

**Live check with the real AI and Google figures (25 Nov, US$0.16):** "red sequin mini party dress" was named "Red Sequin Mini Dress" (High) with its product page and data. Every search phrase got Google's monthly history, for example "red mini dress": "Searches peak in Oct–Dec (about 1.6 times the yearly average)". The ledger split the piece's 14.4 cents by step: reading the details 0.02, the name 4.2, product data 3.4, the product page 3.9, Google figures and results 2.9 (the product data's history request, when its phrases aren't cached yet, is about 1.2 cents of that). The calendar's first load cost 1.6 cents; loading it again asked Google for nothing. In late November it showed summer dress, christmas dress, swimwear, denim shorts, linen dress, sequin dress, graduation dress and party dress as in season now. Fixed from it: "valentines day dress" was rising "62.9 times" from a tiny November figure, so a rising phrase now needs at least 300 searches a month at its coming peak and the wording stops at "more than 10 times"; and an "In season now" list was added, because phrases already at their peak (Christmas, summer) never count as rising. Tests: 270.

**Deployment checklist:**

1. Push to main. Render runs `npm run db:migrate` (one additive update) and `npm run db:seed`, which adds earlier products' spend to the ledger and marks "TEST…" ranges as tests.
2. After the deploy: `/api/health`; the Dashboard opens for a brand admin, with earlier spend under "Earlier products"; the seasonal calendar loads (its first load asks Google once, about 1.5 cents).

## Milestone 4: search performance and several retailers (25 Nov 2026, built and browser-tested locally with example figures; NOT committed or deployed)

- **Several retailers (Phase 12):**
  - The owner has a brand switcher in the header ("Every brand", or one brand). Create, Ranges, History, Review, Dashboard, Keyword lists and the Brand page then show that brand by default. It's remembered for 90 days, every switch is in the audit log, and it never widens anyone else's access: other roles always work in their own brand.
  - Tenant checks in tests: another brand's products, ranges, reviews, spend, dashboard figures, naming gaps and Google figures can't be reached by any role.
- **Google connection** (Brand page, "Google", brand admins and the owner):
  - A brand connects its own Google account through Google's sign-in. Access is read-only (Search Console and Analytics read-only; Merchant Center's API has one scope, and Nomen only reads). The sign-in link is signed and short-lived, the person must still be signed in when Google sends them back, and the refresh token is stored encrypted (AES-256-GCM).
  - The brand then chooses which Search Console site, Analytics property and Merchant Center account to read, from the lists Google returns. "Bring figures in now", and "Disconnect", which withdraws Google's access and deletes the token; figures already brought in stay. Each step is in the audit log.
  - Merchant Center uses the current Merchant API (v1; request shapes checked against Google's documentation on 25 Nov). Its daily rows' date format isn't shown in the docs, so both forms are read; confirm on the first real connection.
- **Live pages:**
  - Pieces from a product file keep their link and their file title as the page's address and previous name.
  - Any piece's page address, the date the new name went live, and the name before can be set on its Review page (editors, with an audit record). A web address that isn't one is refused.
- **Daily sync** (`src/lib/google/sync.ts`): Search Console by page (impressions, clicks, position) and the searches each page shows for; Analytics by page (views, sessions) and by SKU (add-to-carts, purchases, revenue); Merchant Center by SKU (Shopping impressions and clicks, and approval with its issues). Only the brand's own named pieces are kept. The first sync reads 120 days; later ones re-read the last 10 days, which Google revises. It runs when the dashboard is opened and the last sync was over 20 hours ago, or with "Bring figures in now". A source that fails doesn't stop the others; the problem is shown in plain words.
- **Dashboard, search performance** (the period, category and tests filters apply):
  - Totals: seen in Google, clicks and click rate, average position, page views, sold (and share of visits), revenue, Shopping clicks. The most clicked pieces.
  - Before and after the new name, for pieces live at least a week: the same number of days before and after, against what was likely to happen anyway, from how the brand's other pages of the same kind (not renamed then) changed, or else from Google's seasonal search figures for the piece's main phrase. It says which, notes a sale price or too few days, and never puts every change down to the name.
  - Suggestions from the last 28 days: seen a lot but clicked little (under half the brand's usual click rate), losing visibility (30% fewer impressions), a search the page shows for that the name doesn't say (details and occasions only, never another brand), worth learning from (1.5 times the usual click rate), Google Shopping disapprovals.
  - What works for your names (click rate by whether names start with the colour, their length, whether they say the material): only once 30 pieces have been seen 100 times or more in 90 days; until then it says how many there are.
- **Review page:** a "Live on your site" card with the page address, live date and previous name, the last 28 days of Google figures, the searches the page shows for, and Google Shopping's status.
- **Database:** one additive migration, `20261126090000_google_performance` (GoogleConnection, PageMetric, PageQuery, MerchantStatus; `Generation.liveUrl`, `liveSince`, `previousTitle`).
- **Tests:** 281 pass (was 270): tenant isolation, token encryption, the signed sign-in link, reading each Google API's reply formats (including GA4's and Merchant Center's dates), the sync (no doubling on the next day), before and after against other pages, the missing-search suggestion, brand separation of Google figures.
- **Checked in a browser** on a local copy with example figures, as the owner: the brand switcher narrows Review (47 to 1) and History and goes back; Connect Google, choosing a site and property, saving; linking five pieces to pages (a bad address refused); the sync matched 11 pieces with 1,920 days of figures and 15 searches; the dashboard's totals, most clicked, a before and after (72 more clicks than expected, marked early days), suggestions, and "what works" waiting for 30 pieces; the Review page's live card with its figures.
- **Fixed during the browser check:** for the owner, the brand picker now sits at the top of the Brand page and the Google card at the bottom (people are sent straight to it after connecting); pieces with sales but no search figures no longer read "seen 0 times"; numbers on the live card have thousands separators.
- **The production build (`next build`) succeeds.**

**To connect Google for real (needs Nitin or whoever owns the Google accounts; Nomen can't do these):**

1. In Google Cloud (console.cloud.google.com), with the account that will own the app: create a project ("Nomen") and enable the Google Search Console API, Google Analytics Data API, Google Analytics Admin API and Merchant API.
2. Google Auth Platform: app name Nomen and a support email; Audience "External", left in Testing; add as Test users the Google email(s) that will connect (someone with access to Sportsgirl's Search Console, Analytics and Merchant Center). Data access: add the scopes `openid`, `email`, `.../auth/webmasters.readonly`, `.../auth/analytics.readonly`, `.../auth/content`.
3. Clients: create an OAuth client, type "Web application", with the authorised redirect URI `https://nomen-s0t8.onrender.com/api/google/callback`.
4. In Render, on the Nomen service's Environment: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and, optionally, `GOOGLE_TOKEN_KEY` from `openssl rand -base64 32`; without it the key is derived from `AUTH_SECRET`). Saving redeploys.
5. In Nomen: Brand page, Google, "Connect Google", sign in with a test-user account, choose the site, property and account, Save, "Bring figures in now".
6. While the app is in Testing, Google ends the connection after about 7 days, so it has to be connected again weekly. For a lasting connection, publish the app and complete Google's verification for these scopes, which can take weeks: worth starting early.

**Deployment checklist:**

1. Push to main. Render runs `npm run db:migrate` (one additive update). No new settings are required; without the Google ones, "Connect Google" says it isn't set up yet.
2. After the deploy: `/api/health`; the owner's brand switcher in the header; the Brand page's Google card; the dashboard's search performance section, which says how to connect.

## Photos grouped into pieces by file name (27 Nov 2026, built, browser-tested locally and pushed)

- **Dropping photos on a range** now looks at their file names: `dress-1.jpg`, `dress-2.jpg` and `dress-back.jpg` are three photos of one dress (`src/lib/images/grouping.ts`). A name counts as one photo of a piece only when it ends in a separator and a short photo number (`-1`, `_02`, ` (2)`) or a view word (front, back, side, detail, close-up, fabric, worn, on model, flat lay...).
- **Kept apart on purpose:** camera and phone names (`IMG_4512.jpg`, `IMG_4513.jpg`, `photo-1.jpg`), screenshots, names ending in a date, plain numbers (`1.jpg`), very short codes (`SG-12.jpg`, `SG-13.jpg`), and bikini tops and bottoms ("top" and "bottom" aren't view words).
- **The main photo** is the one with no number (`dress.jpg`), then front, main or hero, then the lowest number. A piece keeps up to 6 photos; the screen names any left out.
- **The buyer decides:** when any photos would be grouped, the range shows "These 8 photos look like 3 pieces" with each group, and "Add as 3 pieces", "Add each photo as its own piece" or "Cancel". Photos with nothing to group are added straight away, as before.
- **Read once:** a grouped piece is sent with all its photos in one request and saved together (`addPhotoPiece` in `src/lib/batch/ranges.ts`), so the AI reads it once with every photo, not once alone and again with the rest.
- The range's count now says pieces, not photos, and the upload line says "Adding 3 pieces (8 photos)…" when photos were grouped.
- **Tests:** 286 pass (was 282): grouping rules, names kept apart, the photo limit, and a grouped piece read once with all three photos.
- **Checked in a browser** on a local copy with the stand-in AI: five photos (dress-1, dress-2, dress-back, top, IMG_4512) became three pieces, the dress read once with its back and detail photos; "Add each photo as its own piece" and "Cancel" both work; eight coat photos named the two left out; the panel on a phone-sized screen with long file names, with no sideways scrolling; no console errors.
- **The production build (`next build`) succeeds.** No database change and no new settings.

## Brand page: the "Order of details" choices spilled out of the card (27 Nov 2026, fixed, browser-tested locally and pushed)

- **Spotted by the user on the live Brand page:** the two round buttons under "Order of details in a name" sat far apart on the left while their words ("Learn it from your keyword list (recommended)", "Use our own order") were squeezed into a narrow column outside the card's right edge.
- **Cause:** every input is styled to fill its row (`width: 100%`, for text boxes), and the round buttons inherited that, so each one stretched across the card and pushed its words out.
- **Fix:** one rule in `src/app/globals.css` keeps a tick box or round button beside its words at its own size, everywhere a `label.check` is used.
- **Checked in a browser:** the Brand page's two choices sit inside the card, and "Use our own order" shows its Up and Down list; every other tick box is still 13px wide and on one line (Dashboard "Include tests", a range's "A test range", the Review page's "Only export approved products", and a product's review page: "A test" and its "Ideal for" occasions).

## Better photos on the "Choose the piece" tiles, and the dark bar on hover (28 Nov 2026, built, browser-tested locally and pushed)

- **New photos for all 11 piece tiles** (dresses to jewellery), asked for by the user. The old set mixed backdrops (red, blue, pink, white) and some barely showed the piece: Denim was mostly a grey jumper, Pants mostly a blue wall, Knitwear mostly a face. The new set has one warm look with plain, light backdrops, and the piece fills the frame: an orange linen wrap dress, a white shirt on beige, an ombre pleated skirt, rust tailored trousers, light ripped jeans, pink and sage blazers, a stack of knit jumpers, a mint bikini laid flat, burgundy heels on beige, a woven bag on beige, and gold hoop earrings.
- **Where they come from:** Pexels (free for commercial use, credit not required). Each has its photographer and link on the Photography credits page, which now says the photos come from Burst by Shopify or Pexels. The rail photos on the home, sign-in and empty pages are unchanged. The same photos also stand in for a piece with no photo of its own on History, Review and a product's page.
- **Files:** the 11 photos in `src/assets/photos/` (same names, about 1200px wide, 80 to 270 KB each), and their details (description, crop position, title, photographer, link) in `src/lib/photos.ts`.
- **The dark bar under a tile (seen in the user's screenshot under Denim):** pointing at a tile showed a dark strip where its label should be. The site-wide button style paints a dark background on hover, and the photo covered all of it except the label strip. One rule in `src/app/globals.css` turns that off for the tiles.
- **Checked in a browser** on a local copy: all 11 tiles load, each piece is easy to tell at tile size, a chosen tile is outlined with its label underlined and the rest fade, pointing at a tile no longer shows the dark bar, the phone-sized row scrolls sideways inside itself with no page side-scroll, the credits page lists the new photographers, and there are no console errors. The type check passes. No database change and no new settings.

## Header: "Sign out" broke onto two lines and looked crossed out (28 Nov 2026, fixed, browser-tested locally and pushed)

- **Spotted by the user:** in the top-right corner "SIGN OUT" sat on two lines, and the underline of "SIGN" ran through "OUT", so it looked struck through.
- **Cause:** the header split its width into three columns, with the logo and account sides always the same width. With an owner's eight menu items, the account side got 208px but needs 280px (brand picker, name and "Sign out"), so "Sign out" wrapped at every desktop width.
- **Fix (`src/app/globals.css`):** the logo and account sides now take what they need and the menu sits centred in the space between them. Everything in the account area stays on one line. The menu's spacing is a little tighter (24px between items, and 18px below 1240px wide). Below 1140px (was 1100px) the menu moves to its own row, as it already did on smaller screens.
- **Checked in a browser** as the owner at 375, 900, 1101, 1140, 1141, 1240, 1280, 1440 and 1920px wide: "Sign out" is one line every time, the gap is the same on both sides of the menu (36px at 1280px and wider), nothing spills into the page edge, and there's no sideways scrolling; on a phone the menu still scrolls sideways inside its own row. As an editor (four menu items, no brand picker) the menu sits centred between the logo and the account area.

## Add a brand, and brands kept apart (28 Nov 2026, built, browser-tested locally and pushed)

- **Asked for by the user:** "Add a brand" in the app, and "a person of brand Sportsgirl can only see Sportsgirl things, and another brand which we put only sees that part of the app".
- **Add a brand (owner only, on the Brand page):** a brand name, and either "Start with a copy of Sportsgirl's list (237,928 search phrases)" or "Start without one". The brand is created with Nomen's default settings, no logins and no Google connection, all in one step (if the copy fails, nothing is added). The owner then works in the new brand straight away (the brand menu at the top switches to it), and the page says what's next: fill in the brand profile, give its team logins. Names are checked (2 to 60 characters, no repeats in any case). `src/lib/brands.ts`, `src/app/api/admin/brands/route.ts`, `src/app/admin/brand/AddBrand.tsx`.
- **The copied keyword list is the new brand's own:** a separate copy (copying 237,928 phrases takes about 12 seconds locally, all inside the database), so each brand can replace its list without touching the other's. It's called "Keyword list (copied when the brand was added)", never the other brand's name or file name, which the new brand's people would see. Each copy adds about 150 MB to the database.
- **Country:** not asked. Everything in Nomen is Australian (live search figures, Google results, AU sizes), so a country box would be pretend; the form says search figures are Australian.
- **Brands kept apart: checked, and now proven by a test.** Every page and every request was read: everything a brand owns (products, photos, ranges and their pieces, reviews and comments, corrections, keyword lists, brand profile, Google connection, logins, dashboard figures) is limited to the person's own brand, and pieces and photos are always looked up inside their own range or product. A new test (`tests/isolation.test.ts`) signs in as brand B's admin, editor, reviewer and buyer and tries 50 requests against brand A's things (open, change, delete, download, approve, comment, upload, switch on a list, make or reset a login, Google, work in A's brand, add a brand): every one is refused by the brand check itself (not found or no access), none answers with A's data, and A is left exactly as it was. Lists (products, logins, keyword lists, corrections) show B only B's, and the same requests do work for A's admin and the owner.
- **Fixed along the way:**
  - The Brand page kept the last brand's settings in the form when the owner switched brand, so Save would have written one brand's profile over another's (seen locally: Local Brand B showed Sportsgirl's 70 characters and no example name; with the fix it shows its own 55 and "Brand B Example Name"). Each brand now gets a fresh form.
  - The brand menu at the top kept its old choice until a full reload. It now follows the brand you're working in.
  - The Keywords page showed the owner every brand's lists with no brand name, so two lists said "In use". With more than one brand, each row now says whose it is.
  - The Keywords page's "Storage in use" line counts every brand's data together, so only the owner sees it now.
  - The Logins page's brand choice starts on the brand you're working in.
- **Tests:** 298 pass (was 286): 7 in `tests/isolation.test.ts` and 5 in `tests/brands.test.ts` (adding a brand, names, the copied list, naming a piece from the copy, no copy from a brand without a list).
- **Checked in a browser** on a local copy as the owner: a repeated name is refused; "Cotton On Test" added with a copy of the list and "Glassons Test" without one; the brand menu, the Keywords page (with its Brand column) and the Logins page's brand choice all show them; a brand admin login made for Cotton On Test. Then signed in as that admin: Create, Ranges, History, Review, Dashboard, Keywords, Brand and Logins never mention Sportsgirl or its keyword list; a Sportsgirl product, review or range link says not found; `?brand=<Sportsgirl>` on the Brand page and Dashboard still shows Cotton On Test. The checked test set on the Dashboard is Nomen's own quality test (shipped with the code, categories and percentages only), the same for every brand.
- **The production build (`next build`) succeeds.** No database change (no migration) and no new settings.

## Full test pass, and what it found (28 Nov 2026, fixed, browser-tested locally and pushed)

Asked for by the user: "do all the testing, go through every single thing", leaving out what needs Claude (its key had expired).

- **Live site (look only, signed in as the owner):** 89 pages and links all open (including the range downloads); every page (Create, Ranges and both ranges, History, all 32 product pages, Review and all 32 review pages, Dashboard, Keywords, Brand, Logins, Credits) has no errors in the browser, every photo loads, and none scrolls sideways at desktop or phone size. Eight review pages say "Not written for this product" for the product page and data: they're the oldest test products (14-15 Nov), named before Nomen wrote those, so that's right.
- **Local copy, every button and form, with the stand-in AI:** Create (tiles, details, naming, alternatives, feedback); Review (edit a box, use the AI's version, approve and reject boxes, comment flagged as an AI mistake, approve all, ready to export, the test mark, the live page); Ranges (grouping by file name, apply to every piece, naming, download, whole-range check, filters, rename, test mark, change details and name again); Keywords (upload with left-out rows, switch, go back, download left-out rows); Brand (save, learn from a catalogue); Logins (make a login); sign-in (wrong password refused, right one works, sign out); each kind of login (editor, reviewer, brand admin) sees and can do only what it should; Dashboard filters.
- **Fixed:**
  - **The brand on Create, New range and the Keywords upload didn't follow the top menu** until a reload, so the owner could switch to Sportsgirl and still name a product under the other brand. It now follows, and nothing typed is lost.
  - **"Name again" could lose the last edit** (a piece's boxes save when you leave them, and naming started at the same moment, so the edit came too late or was refused). The piece buttons now save everything first, and "Name N pieces" waits for any edit still saving.
  - **A name picked on the result page didn't reach Review or the exports:** choosing an alternative (or "I edited it") and answering "Use this name" only stored the answer. It now becomes the product's name, as a person's change in its history (an approved product goes back for another look).
  - **The thank-you said "It helps the next name get better"**, which isn't true (the answer is kept, not learned from). It now says it's kept with the name in History.
  - **The owner couldn't use "Only export approved products" or the corrections download** on the Review page (both were shown to brand admins only, and the owner is the only login on the live site). The owner now has both for the brand picked in the top menu.
  - **A live page saved without a date** never got a before-and-after. Saving a page address with no date now fills in today, shown in the box.
  - **The Ranges list showed a broken picture** for a piece with no photo (a product-file row whose image link doesn't work); it shows a plain tile now, and the list counts pieces, not photos.
- **Tests:** 301 pass (was 298): `tests/feedback.test.ts` (an alternative or an edit becomes the product's name; an approved product goes back for review; keeping the name or "Not suitable" changes nothing). The production build succeeds. No database change.
- **Left as is, for the user to decide:** "Approve all" also approves a box someone rejected. Copy buttons say nothing when a browser blocks copying (fine in a normal browser).

## Changing the photo on Create mixed two pieces (28 Nov 2026, fixed, browser-tested locally and pushed)

- **Spotted by the user after the new Claude key went in:** after a photo of a pink long-sleeve tennis dress, they changed to a photo of an activewear set and pressed Create; Nomen answered "It can't be both a dress and an activewear set", "long-sleeve and short sleeve" and "a dress and a cropped top". (The questions are written by the AI, so the new key works.)
- **Cause:** a new photo's reading only filled the empty boxes and replaced what the last photo filled in, but its description was thrown away because it "contradicted" the product type, and that product type ("dress") had come from the old photo, not the buyer. So the dress description stayed next to the activewear details. The old type was also sent to the AI as a hint for the new photo, and the old piece's other photos (back, detail) were read with the new one.
- **Fix (`src/app/GeneratorClient.tsx`, `src/app/PhotoPicker.tsx`):** choosing a new main photo first takes back everything the last photo filled in (what the buyer typed or edited stays) and drops the last piece's other photos; only the buyer's own product type is sent as a hint; a type or colour an earlier photo filled in no longer counts as the buyer's when checking the description.
- **Also fixed:** anything typed while a photo was being read (about 10 seconds) was put back to how the form was when the reading started. The photo box now uses the page's latest state. And when a reading doesn't work, the message has a "Try again" link that reads the same photos again (the user's earlier "We couldn't read that photo just now" came from the expired key).
- **Checked in a browser** on a local copy, with the AI's answers replaced by realistic ones (a pink long-sleeve tennis dress, then a black activewear set): after the change every box is the activewear set's (type, description, colour, short sleeve and cropped top, no "mini" length left over) and no hint was sent; "nylon blend" typed by the buyer stayed through the change; "women" typed during a slow reading stayed; a failed reading shows "Try again", the old photo's details are gone, and trying again fills the form; an extra back photo is dropped when the main photo changes to another piece. 301 tests pass; type check clean.

## Ranges: a buyer's spreadsheet, the basics before naming, help notes, a 4-step guide and "Ideal for" (28 Nov 2026, built, browser-tested locally and pushed)

Nitin's suggestions from the 28 Nov meeting, all five built. The store product file (Google feed or Shopify export) stays exactly as it was, beside the new spreadsheet.

- **A buyer's spreadsheet (line sheet):** "Add pieces from a spreadsheet" on an empty range, and "Add a spreadsheet" on a range of photos. One row per piece: its photo pasted over the row (several photos on one row are one piece) or a photo link, and what the buyer knows (category, description, material, occasion, colour, pattern, fit, length, key detail, audience, notes). Columns are recognised by name in any order (Style #, SKU, Product type, Fabric composition, Use case, Image URL...), a title row above the column names is fine, the template's "e.g." row is skipped, and columns Nomen doesn't use (like price) are listed as not used. Excel (.xlsx) or CSV, up to 30MB and 1,000 pieces. Each row's photo is read for what the row left blank; the row's own details always win, and where the photo plainly disagrees (colour, mini/midi/maxi) it says so. "Download the template" gives an Excel file with the columns, an example row, room for photos and a "How to fill it in" tab. `src/lib/batch/sheet.ts`, `addSheetPieces` in `src/lib/batch/ranges.ts`, `POST /api/ranges/[id]/sheet`, `GET /api/ranges/template`, `src/app/ranges/[id]/SheetUpload.tsx`. Pictures placed with Excel's newer "Place in cell" aren't read yet (pasted pictures and links are).
- **The basics before naming:** a range piece is named only once it has a product type, a description and the material (`NEEDED_TO_NAME`, `missingToName`, `canName` in `src/lib/batch/shared.ts`; used by the Name button, the name request and the worker). Material and an optional occasion now sit with the type and description on every card, and a piece missing something says what ("Still needed before it can be named: material"). "Apply to every piece" fills a material in for a whole range at once. A photo rarely shows the fabric and Nomen never guesses it. With a material, a piece always has a detail to name from, so "Tell us a little more" no longer comes up in a range. The single Create page is unchanged.
- **(i) help notes** (`src/components/Hint.tsx`): hover, focus or tap for one line on the tricky bits: the test-range tick box, Apply to every piece, Name N pieces, the spreadsheet card, the store product file card, the photo grouping, Check the whole range, the confidence badge, Product data and the Material box. The note opens towards the middle of the screen so it's never cut off.
- **A 4-step guide** at the top of every range: 1 Add pieces, 2 Fill in the basics, 3 Name them, 4 Review and download, worked out from the pieces themselves, with the current step highlighted and "Next:" saying what to do (for example "2 pieces need material before naming. Apply to every piece fills one detail in for all of them. Or name the 1 ready now.").
- **"Ideal for" on every named piece:** the occasions Nomen is sure of and the season (when it's sure), and "Who it's for" from the brand's own Brand page ("Who it's for"), never guessed for a piece; occasions to check are shown as "Maybe also, to check". If the brand profile is empty, a piece's own audience (like "girls") is shown instead.
- **Tests:** 309 pass (was 301). New `tests/linesheet.test.ts` (8): column names, a title row, the example row, pasted pictures on the right rows, photo links, a CSV with a style name, the template reads back, the sheet's details winning over the photo's with the contradiction noted, a row without a photo, and the basics rule. Range tests now give their pieces a material, as a buyer would.
- **Checked in a browser** on a local copy with the stand-in AI: an empty range shows the guide on step 1 and the three ways to add pieces; the template downloads; a line sheet with 3 pasted photos added 3 pieces ("Not used: Price"); after reading, the two without a material said so and the guide moved to step 2; Apply to every piece filled cotton only where it was blank; the guide moved to step 3, all three were named, then step 4; each named piece shows "Ideal for" and "Who it's for: Women 18 to 35 (your brand's customer)"; a help note opens on hover and stays on screen; the range page has no sideways scrolling on a phone.
