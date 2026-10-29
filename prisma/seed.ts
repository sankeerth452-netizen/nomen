import { db } from "../src/lib/db";
import { createUser, UserError } from "../src/lib/users";

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
