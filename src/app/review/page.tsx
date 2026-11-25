import Image from "next/image";
import Link from "next/link";
import type { Prisma, ReviewStatus } from "@prisma/client";
import { ownerScope } from "@/lib/auth/workspace";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ApprovalSetting from "@/components/ApprovalSetting";
import { photoForType } from "@/lib/photos";
import { objectPosition, type Box } from "@/lib/frame";
import { applyReviewEdits, STATUS_LABEL, type ResultLike } from "@/lib/review/fields";
import { can, seesWholeBrand } from "@/lib/review/permissions";
import { brandSettings } from "@/lib/review/guard";
import { backfillReviews } from "@/lib/review/workflow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review" };

const TABS: { key: string; label: string; statuses: ReviewStatus[] }[] = [
  { key: "todo", label: "To review", statuses: ["needs_review", "ai_generated"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "ready", label: "Ready to export", statuses: ["ready_to_export"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "all", label: "All", statuses: ["ai_generated", "needs_review", "approved", "rejected", "ready_to_export", "published"] },
];

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab: tabKey } = await searchParams;
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  // Reviewers and admins see the whole brand; editors their own pieces.
  const genWhere: Prisma.GenerationWhereInput = user.role === "owner" ? ownerScope(user) : seesWholeBrand(user) ? { brandId: user.brandId! } : { userId: user.id };
  await backfillReviews(genWhere);
  const where: Prisma.ProductReviewWhereInput = { generation: genWhere };
  const [rows, counts, settings] = await Promise.all([
    db.productReview.findMany({
      where: { ...where, status: { in: tab.statuses } }, orderBy: { updatedAt: "desc" }, take: 200,
      include: { generation: { select: { id: true, createdAt: true, confidence: true, result: true, originalInput: true, user: { select: { displayName: true } }, photo: { select: { generationId: true, focus: true } } } } },
    }),
    db.productReview.groupBy({ by: ["status"], where, _count: true }),
    brandSettings(user.brandId),
  ]);
  const count = (statuses: ReviewStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);
  const canManage = user.role !== "owner" && can(user, "manageBrand", settings);
  return (
    <>
      <Header user={user} active="review" />
      <main>
        <div className="page-head">
          <div>
            <span className="eyebrow">Before it goes live</span>
            <h1>Review and <em>approve</em>.</h1>
            <p>Every named piece starts here. Check what Nomen wrote, change anything that isn&apos;t right, and approve it. Nothing is approved just because the AI finished.</p>
          </div>
        </div>
        {canManage && <ApprovalSetting brandId={user.brandId!} initial={settings?.approvalRequired ?? false} />}
        <nav className="review-tabs" aria-label="Review status">
          {TABS.map((t) => (
            <Link key={t.key} href={`/review?tab=${t.key}`} className={t.key === tab.key ? "on" : undefined} aria-current={t.key === tab.key ? "page" : undefined}>
              {t.label} <span>{count(t.statuses)}</span>
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="muted review-empty">{tab.key === "todo" ? "Nothing waiting for review." : "Nothing here yet."}</p>
        ) : (
          <div className="archive">
            {rows.map((r) => {
              const g = r.generation;
              const input = g.originalInput as { freeText?: string; productType?: string };
              const name = applyReviewEdits((g.result ?? {}) as ResultLike, r.edits as Record<string, unknown>).recommendation?.recommended_title ?? "Untitled";
              const photo = photoForType(input.productType);
              const edited = Object.keys((r.edits ?? {}) as object).length > 0;
              return (
                <Link key={r.id} href={`/review/${g.id}`} className="look">
                  {g.photo
                    ? <div className="look-photo own"><Image src={`/api/generations/${g.id}/photo`} alt="" fill unoptimized sizes="92px" style={{ objectPosition: objectPosition(g.photo.focus as Box | null) }} /></div>
                    : <div className="look-photo"><Image src={photo.src} alt="" fill placeholder="blur" sizes="92px" style={{ objectPosition: photo.position }} /></div>}
                  <div>
                    <h3>{name}</h3>
                    <span className="input">“{input.freeText}” · {g.user.displayName}{edited ? " · edited" : ""}</span>
                  </div>
                  <div className="look-side">
                    <span className="look-meta">{r.updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}{g.confidence && <><br />{g.confidence} confidence</>}</span>
                    <span className={`look-status rv-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {canManage && <p className="muted storage-note"><a href={`/api/reviews/corrections`} download>Download every correction people made</a>: what the AI wrote and what it was changed to, for testing and improving Nomen.</p>}
      </main>
      <Footer />
    </>
  );
}
