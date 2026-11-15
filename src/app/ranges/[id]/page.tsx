import { notFound } from "next/navigation";
import { requirePageUser, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { loadRangeFor, rangeItems } from "@/lib/batch/ranges";
import { kick } from "@/lib/batch/worker";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RangeClient from "./RangeClient";
import type { FileCheck } from "@/lib/feed/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Range" };

export default async function RangePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  let b;
  try { b = await loadRangeFor(user, (await params).id); } catch (e) { if (e instanceof HttpError) notFound(); throw e; }
  kick();
  const brandName = user.brandName ?? (await db.brand.findUnique({ where: { id: b.brandId }, select: { name: true } }))?.name ?? null;
  return (
    <>
      <Header user={user} active="ranges" />
      <main>
        <RangeClient id={b.id} initialTitle={b.title} initialItems={JSON.parse(JSON.stringify(await rangeItems(b.id)))} brandName={brandName} source={b.source === "file" ? "file" : "photos"} fileName={b.fileName} fileCheck={(b.fileCheck as FileCheck | null) ?? null} />
      </main>
      <Footer />
    </>
  );
}
