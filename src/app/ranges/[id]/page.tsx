import { notFound } from "next/navigation";
import { requirePageUser, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { loadRangeFor, rangeItems } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RangeClient from "./RangeClient";
import type { FileCheck } from "@/lib/feed/shared";
import { can } from "@/lib/review/permissions";
import { brandSettings } from "@/lib/review/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Range" };

export default async function RangePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  let b;
  try { b = await loadRangeFor(user, (await params).id); } catch (e) { if (e instanceof HttpError) notFound(); throw e; }
  kick();
  const brandName = user.brandName ?? (await db.brand.findUnique({ where: { id: b.brandId }, select: { name: true } }))?.name ?? null;
  const settings = await brandSettings(b.brandId);
  const canMarkTest = user.role === "owner" || can(user, "manageBrand", settings);
  // Who the brand sells to, from its Brand page: shown on each named piece as who it's for (never guessed per piece).
  const audience = settings?.profile.audience?.trim() || null;
  return (
    <>
      <Header user={user} active="ranges" />
      <main>
        <RangeClient id={b.id} initialTitle={b.title} loadedAt={new Date(Date.now() - 1000).toISOString()} initialItems={JSON.parse(JSON.stringify(await rangeItems(b.id)))} brandName={brandName} source={b.source === "file" ? "file" : "photos"} fileName={b.fileName} fileCheck={(b.fileCheck as FileCheck | null) ?? null} isTest={b.isTest} canMarkTest={canMarkTest} audience={audience} />
      </main>
      <Footer />
    </>
  );
}
