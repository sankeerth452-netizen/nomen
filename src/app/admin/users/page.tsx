import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePageUser("owner");
  const [users, brands] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, include: { brand: true } }),
    db.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
    <Header user={user} active="users" />
    <main>
      <div className="page-head">
        <div>
          <span className="eyebrow">Who can sign in</span>
          <h1>Client <em>logins</em></h1>
          <p>Create a login for each person who needs one. There&apos;s no public sign-up, and passwords are only reset from here.</p>
        </div>
      </div>
      <UsersClient
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        users={users.map((u) => ({
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          brand: u.brand?.name ?? "—",
          active: u.active,
          lastLogin: u.lastLoginAt?.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) ?? "Not yet",
        }))}
      />
    </main>
    <Footer />
    </>
  );
}
