import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser, hasRole, HttpError } from "@/lib/auth/guards";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { failStaleGenerations } from "@/lib/pipeline/run";
import ResultView, { type Gen } from "@/components/ResultView";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HistoryItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let g;
  try { g = await loadGenerationFor(user, id); } catch (e) { if (e instanceof HttpError) notFound(); throw e; }
  await failStaleGenerations({ id });
  g = await loadGenerationFor(user, id);
  const gen = JSON.parse(JSON.stringify(presentGeneration(g, user))) as Gen & { input: { freeText?: string; productType?: string } };
  const brandName = user.brandName ?? (await db.brand.findUnique({ where: { id: g.brandId }, select: { name: true } }))?.name ?? null;
  return (
    <>
      <Header user={user} active="history" />
      <main>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <Link className="back" href="/history">← History</Link>
            <span className="eyebrow" style={{ display: "block" }}>{g.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })} · {gen.input.productType}</span>
            <h1 style={{ fontSize: "clamp(28px, 3.4vw, 40px)", fontStyle: "italic", marginTop: 10 }}>“{gen.input.freeText}”</h1>
          </div>
        </div>
        <ResultView gen={gen} brandName={brandName} canFeedback={g.userId === user.id} isAdmin={hasRole(user, "admin")} />
      </main>
      <Footer />
    </>
  );
}
