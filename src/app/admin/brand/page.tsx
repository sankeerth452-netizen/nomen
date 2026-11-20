import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import { parseBrandSettings } from "@/lib/brand";
import { can } from "@/lib/review/permissions";
import BrandProfileClient from "./BrandProfileClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brand profile" };

// How a brand writes: who it's for, its voice, its own words and how its names are built. Brand admins edit their own
// brand's; the owner picks a brand.
export default async function BrandPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const user = await requirePageUser("admin");
  const { brand: asked } = await searchParams;
  const brands = await db.brand.findMany({ where: user.role === "owner" ? {} : { id: user.brandId! }, orderBy: { name: "asc" }, select: { id: true, name: true, settings: true } });
  const brand = brands.find((b) => b.id === asked) ?? brands[0];
  const settings = brand ? parseBrandSettings(brand.settings) : null;
  const canManage = !!settings && (user.role === "owner" || can(user, "manageBrand", settings));
  return (
    <>
      <Header user={user} active="brand" />
      <main className="narrow">
        <div className="page-head">
          <div>
            <span className="eyebrow">How your brand writes</span>
            <h1>Brand <em>profile</em></h1>
            <p>Nomen follows this when it names a piece and writes its product page and product data. It never adds a fact: your voice changes how things are said, not what&apos;s true.</p>
          </div>
        </div>
        {!brand || !settings ? <p className="muted">There&apos;s no brand yet.</p> : (
          <BrandProfileClient
            brands={user.role === "owner" ? brands.map((b) => ({ id: b.id, name: b.name })) : []}
            brandId={brand.id}
            brandName={brand.name}
            canManage={canManage}
            initial={{
              profile: settings.profile, titleCase: settings.titleCase, maxTitleLength: settings.maxTitleLength, attributeOrder: (settings.attributeOrder?.filter((o): o is "colour" | "feature" | "material" | "length" => ["colour", "feature", "material", "length"].includes(o)) ?? null),
              prohibitedTerms: settings.prohibitedTerms, avoidWords: settings.avoidWords, goodExamples: settings.goodExamples, poorExamples: settings.poorExamples,
            }}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
