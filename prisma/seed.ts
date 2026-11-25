import { db } from "../src/lib/db";
import { createUser, UserError } from "../src/lib/users";
import { seedTaxonomy } from "../src/lib/sheet/taxonomy";
import { backfillUsage } from "../src/lib/usage/ledger";

// Sensible defaults from brief section 19. Everything here is editable in brand settings later.
const SPORTSGIRL_SETTINGS = {
  titleCase: "title",
  // attributeOrder: leave unset to use the order learned from the active keyword dataset; set an array to override.
  maxTitleLength: 70,
  requiredCoreTerms: [],
  allowedVocabulary: [],
  prohibitedTerms: [],
  avoidWords: [],
  goodExamples: ["Black Ruched Mesh Midi Dress"],
  poorExamples: [],
  maxSerpQueries: 3,
  serp: { location: "Australia", language: "English", device: "desktop" },
};

async function main() {
  await db.brand.upsert({
    where: { slug: "sportsgirl" },
    update: {},
    create: { name: "Sportsgirl", slug: "sportsgirl", country: "AU", language: "en", settings: SPORTSGIRL_SETTINGS },
  });
  console.log("Seeded brand: sportsgirl. Create logins with `npm run user:create`.");

  // Google's category list, from the copy that ships with the code (only new or renamed categories are written).
  const t = await seedTaxonomy();
  console.log(`Google categories: ${t.total} (${t.added} added, ${t.renamed} renamed).`);

  // Spend for products and range photos from before the spend ledger (one row each, marked as backfilled).
  const u = await backfillUsage();
  if (u.generations || u.readings) console.log(`Spend ledger: ${u.generations} earlier products and ${u.readings} range photo readings added.`);
  // Ranges whose title says they're a test (like "TEST · 12 web photos") are counted as tests on the dashboard.
  const tests = await db.batch.updateMany({ where: { isTest: false, title: { startsWith: "TEST" } }, data: { isTest: true } });
  if (tests.count) console.log(`Marked ${tests.count} range(s) titled "TEST..." as tests.`);

  // First owner login from the host's settings (OWNER_USERNAME + OWNER_PASSWORD), so a fresh deploy can be signed
  // into without a shell. Only ever creates: an existing login is never changed here (reset passwords in the app).
  const username = process.env.OWNER_USERNAME?.trim();
  const password = process.env.OWNER_PASSWORD?.trim();
  if (username && password) {
    if (await db.user.findUnique({ where: { username: username.toLowerCase() } })) {
      console.log(`Owner login "${username}" already exists; left unchanged.`);
    } else {
      try {
        await createUser({ username, displayName: process.env.OWNER_NAME?.trim() || username, role: "owner", brandId: null, password });
        console.log(`Created owner login "${username}".`);
      } catch (e) {
        // Never block a deploy over this: say what to fix and carry on.
        if (e instanceof UserError) console.warn(`Owner login not created: ${e.message}`); else throw e;
      }
    }
  }
}

main().finally(() => db.$disconnect());
