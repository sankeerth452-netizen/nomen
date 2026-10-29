import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import DatasetsClient from "./DatasetsClient";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const user = await requirePageUser("admin");
  const brands = await db.brand.findMany({ where: user.role === "owner" ? {} : { id: user.brandId! }, orderBy: { name: "asc" } });
  const datasets = await db.keywordDataset.findMany({
    where: { brandId: { in: brands.map((b) => b.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const activeIds = new Set(brands.map((b) => b.activeKeywordDatasetId));
  return (
    <>
    <Header user={user} active="datasets" />
    <main>
      <div className="page-head">
        <div>
          <span className="eyebrow">What shoppers search</span>
          <h1>Keyword <em>lists</em></h1>
          <p>The search figures behind every name. Upload a fresh export whenever you like: each one is saved as its own version, and nothing changes until you choose to use it.</p>
        </div>
      </div>
      <DatasetsClient
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        datasets={datasets.map((d) => ({
          id: d.id, name: d.name, status: d.status, active: activeIds.has(d.id), brandId: d.brandId,
          accepted: d.rowsAccepted, rejected: d.rowsRejected, duplicate: d.rowsDuplicate,
          created: d.createdAt.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
        }))}
      />
    </main>
    <Footer />
    </>
  );
}
