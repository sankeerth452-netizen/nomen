import { workspaceBrandId } from "@/lib/auth/workspace";
import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import { parseBrandSettings } from "@/lib/brand";
import { can } from "@/lib/review/permissions";
import BrandProfileClient from "./BrandProfileClient";
import GoogleCard from "./GoogleCard";
import AddBrand from "./AddBrand";
import { keywordListsToCopy } from "@/lib/brands";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brand profile" };

// How a brand writes: who it's for, its voice, its own words and how its names are built. Brand admins edit their own
// brand's; the owner picks a brand.
export default async function BrandPage({ searchParams }: { searchParams: Promise<{ brand?: string; google?: string; added?: string }> }) {
  const user = await requirePageUser("admin");
  const { brand: asked, google, added } = await searchParams;
  const brands = await db.brand.findMany({ where: user.role === "owner" ? {} : { id: user.brandId! }, orderBy: { name: "asc" }, select: { id: true, name: true, settings: true, activeKeywordDatasetId: true } });
  const brand = brands.find((b) => b.id === asked) ?? brands.find((b) => b.id === workspaceBrandId(user)) ?? brands[0];
  const settings = brand ? parseBrandSettings(brand.settings) : null;
  const canManage = !!settings && (user.role === "owner" || can(user, "manageBrand", settings));
  const lists = user.role === "owner" ? await keywordListsToCopy() : [];
  const justAdded = added === "1" && brand?.id === asked;
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
        {user.role === "owner" && <AddBrand lists={lists} />}
        {justAdded && brand && (
          <div className="card added-brand" role="status">
            <strong>{brand.name} is added</strong>
            <p>You&apos;re now working in {brand.name}: the brand menu at the top shows it. {brand.activeKeywordDatasetId ? "It has its own copy of the keyword list." : <>It has no keyword list yet: <a href="/admin/datasets">upload one on the Keywords page</a>.</>}</p>
            <p>Next, fill in how it writes below, then <a href="/admin/users">give its team logins on the Logins page</a>. They&apos;ll only ever see {brand.name}&apos;s work.</p>
          </div>
        )}
        {!brand || !settings ? <p className="muted">There&apos;s no brand yet.</p> : (
          <BrandProfileClient
            key={brand.id} // a fresh form per brand: otherwise switching brand kept the last brand's values, and Save wrote them here
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
        {brand && canManage && <div id="google" className="google-wrap"><GoogleCard key={brand.id} brandId={brand.id} back={google ?? null} /></div>}
      </main>
      <Footer />
    </>
  );
}
