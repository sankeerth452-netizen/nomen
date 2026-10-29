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
          <span className="eyebrow">Access</span>
          <h1>Client <em>logins</em></h1>
          <p>Logins are created here only. There is no sign-up and no self-service password reset.</p>
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
          lastLogin: u.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never",
        }))}
      />
    </main>
    <Footer />
    </>
  );
}
