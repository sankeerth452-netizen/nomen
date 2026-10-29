import Image from "next/image";
import Link from "next/link";
import { requirePageUser, hasRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { failStaleGenerations } from "@/lib/pipeline/run";
import { PHOTOS, photoForType } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };
const PAGE = 24;

/** Plain-English card label: the buyer's verdict when there is one, otherwise where the run stands. */
function badge(status: string, outcome: string | undefined): { text: string; cls: string } | null {
  if (outcome === "used") return { text: "Used", cls: "used" };
  if (outcome === "edited") return { text: "Edited", cls: "edited" };
  if (outcome === "rejected") return { text: "Not suitable", cls: "rejected" };
  if (status === "needs_input") return { text: "Needs details", cls: "needs" };
  if (status === "failed") return { text: "Didn't work", cls: "failed" };
  if (status !== "completed") return { text: "In progress", cls: "" };
  return null;
}

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const where = user.role === "owner" ? {} : hasRole(user, "admin") ? { brandId: user.brandId! } : { userId: user.id };
  await failStaleGenerations(where);
  const [rows, total] = await Promise.all([
    db.generation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { displayName: true } }, feedback: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.generation.count({ where }),
  ]);
  const rec = (r: unknown) => (r as { recommendation?: { recommended_title?: string } } | null)?.recommendation?.recommended_title ?? null;
  const showWho = user.role !== "buyer";
  return (
    <>
      <Header user={user} active="history" />
      <main>
        <div className="page-head">
          <div>
            <span className="eyebrow">The archive</span>
            <h1>Every name, <em>kept</em>.</h1>
            <p>{total ? `${total.toLocaleString()} ${total === 1 ? "piece" : "pieces"} named so far. Open one to see its evidence, or to say whether it made the page.` : "Names you create are kept here with their evidence."}</p>
          </div>
          <Link className="btn" href="/">Name a new piece</Link>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="ph"><Image src={PHOTOS.empty.src} alt={PHOTOS.empty.alt} fill placeholder="blur" sizes="(max-width: 760px) 100vw, 50vw" /></div>
            <div><h2>The rail is empty.</h2><p className="muted">Name your first piece and it will hang here, with the searches and results behind it.</p><Link className="btn" href="/">Create a name</Link></div>
          </div>
        ) : (
          <div className="archive">
            {rows.map((g) => {
              const input = g.originalInput as { freeText?: string; productType?: string };
              const photo = photoForType(input.productType);
              const fb = g.feedback[0];
              const b = badge(g.status, fb?.outcome);
              const title = rec(g.result);
              const final = fb?.outcome === "edited" ? fb.finalTitle : null;
              return (
                <Link key={g.id} href={`/history/${g.id}`} className="look">
                  <div className="look-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="92px" style={{ objectPosition: photo.position }} /></div>
                  <div>
                    <h3>{title ?? (input.productType ? `Untitled ${input.productType}` : "Untitled")}</h3>
                    {final && <span className="final">Published as “{final}”</span>}
                    <span className="input">“{input.freeText}”{showWho ? ` · ${g.user.displayName}` : ""}</span>
                  </div>
                  <div className="look-side">
                    <span className="look-meta">{g.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}{g.confidence && <><br />{g.confidence} confidence</>}</span>
                    {b && <span className={`look-status ${b.cls}`}>{b.text}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {(page > 1 || page * PAGE < total) && (
          <nav className="pager" aria-label="Pages">
            {page > 1 ? <Link href={`/history?page=${page - 1}`}>← Newer</Link> : <span />}
            {page * PAGE < total ? <Link href={`/history?page=${page + 1}`}>Older →</Link> : <span />}
          </nav>
        )}
      </main>
      <Footer />
    </>
  );
}
