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
