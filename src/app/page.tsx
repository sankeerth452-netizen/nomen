import Image from "next/image";
import { redirect } from "next/navigation";
import { can } from "@/lib/review/permissions";
import { brandSettings } from "@/lib/review/guard";
import { workspaceFirst } from "@/lib/auth/workspace";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PRODUCT_TYPE_CATEGORY } from "@/lib/vocab/fashion";
import { PHOTOS } from "@/lib/photos";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GeneratorClient from "./GeneratorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create" };

export default async function Home() {
  const user = await requirePageUser();
  // Reviewers check and approve; they don't name new pieces (unless their brand lets them).
  if (!can(user, "edit", await brandSettings(user.brandId))) redirect("/review");
  const brands = user.role === "owner" ? workspaceFirst(user, await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })) : [];
  return (
    <>
      <Header user={user} active="create" />
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">New arrivals · product naming</span>
            <h1>Name it the way <em>shoppers</em> search.</h1>
            <p className="lede">Add a photo or describe the piece in your own words. We check what Australians actually search for and what&apos;s showing on Google right now, then write a name that is accurate first and easy to find second.</p>
          </div>
          <div className="hero-photo">
            <Image src={PHOTOS.hero.src} alt={PHOTOS.hero.alt} fill priority placeholder="blur" sizes="(max-width: 820px) 100vw, 55vw" />
            <div className="hero-tag"><span className="eyebrow">Built from details you check</span><span className="t">Nothing guessed</span></div>
          </div>
        </section>
        <GeneratorClient productTypes={Object.keys(PRODUCT_TYPE_CATEGORY).sort()} brands={brands} brandName={user.brandName} />
      </main>
      <Footer />
    </>
  );
}
