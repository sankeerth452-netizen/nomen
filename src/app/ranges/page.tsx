import Image from "next/image";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { rangeWhere } from "@/lib/batch/ranges";
import { objectPosition, type Box } from "@/lib/frame";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PHOTOS } from "@/lib/photos";
import NewRange from "./NewRange";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ranges" };

export default async function Ranges() {
  const user = await requirePageUser();
  const brands = user.role === "owner" ? await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const ranges = await db.batch.findMany({
    where: rangeWhere(user), orderBy: { createdAt: "desc" }, take: 40,
    include: { user: { select: { displayName: true } }, items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, status: true, focus: true } } },
  });
  return (
    <>
      <Header user={user} active="ranges" />
      <main>
        <div className="page-head">
          <div>
            <span className="eyebrow">A whole range at once</span>
            <h1>Name the <em>range</em>, not just the piece.</h1>
            <p>Drop in up to 60 product photos. Each one is read and filled in for you to check, then every piece is named the same careful way as a single one, ready to copy or download.</p>
          </div>
          <NewRange brands={brands} />
        </div>

        {ranges.length === 0 ? (
          <div className="empty-state">
            <div className="ph"><Image src={PHOTOS.hero.src} alt={PHOTOS.hero.alt} fill placeholder="blur" sizes="(max-width: 760px) 100vw, 50vw" /></div>
            <div><h2>No ranges yet.</h2><p className="muted">Start one and drop in the photos for a new drop or a whole season. You can check every piece before anything is named.</p></div>
          </div>
        ) : (
          <div className="range-list">
            {ranges.map((r) => {
              const named = r.items.filter((i) => i.status === "named").length;
              const toCheck = r.items.filter((i) => i.status === "review").length;
              return (
                <Link key={r.id} href={`/ranges/${r.id}`} className="range-row">
                  <div className="range-strip" aria-hidden="true">
                    {r.items.slice(0, 5).map((i) => (
                      <span key={i.id} className="range-thumb"><Image src={`/api/ranges/${r.id}/items/${i.id}/photo`} alt="" fill unoptimized style={{ objectPosition: objectPosition(i.focus as Box | null) }} /></span>
                    ))}
                    {r.items.length === 0 && <span className="range-thumb empty" />}
                  </div>
                  <div>
                    <h3>{r.title}</h3>
                    <span className="input">{r.items.length} {r.items.length === 1 ? "photo" : "photos"} · {named} named{toCheck ? ` · ${toCheck} to check` : ""}{user.role !== "buyer" ? ` · ${r.user.displayName}` : ""}</span>
                  </div>
                  <span className="look-meta">{r.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
