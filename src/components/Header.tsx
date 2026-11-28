import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import SignOut from "@/app/SignOut";
import { db } from "@/lib/db";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { Lockup, PRODUCT_NAME } from "@/components/Logo";

type Section = "create" | "ranges" | "history" | "review" | "dashboard" | "datasets" | "users" | "brand" | "credits";

export default async function Header({ user, active }: { user: SessionUser; active?: Section }) {
  // The owner works in one brand at a time (or every brand); everyone else always sees their own.
  const brands = user.role === "owner" ? await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const item = (href: string, section: Section, label: string) => (
    <Link href={href} aria-current={active === section ? "page" : undefined}>{label}</Link>
  );
  return (
    <>
      {/* Mock mode must never pass for real data: say so on every page. */}
      {process.env.PROVIDER_MODE === "mock" && <div className="strip">Preview version · the results shown are examples, not live</div>}
      <header className="masthead">
        <div className="masthead-in">
          <Link href="/" className="wordmark" aria-label={`${PRODUCT_NAME}, home`}>
            <Lockup height={16} thread={false} />
          </Link>
          <nav className="mainnav" aria-label="Main">
            {user.role !== "reviewer" && item("/", "create", "Create")}
            {item("/ranges", "ranges", "Ranges")}
            {item("/history", "history", "History")}
            {item("/review", "review", "Review")}
            {(user.role === "admin" || user.role === "owner") && item("/dashboard", "dashboard", "Dashboard")}
            {(user.role === "admin" || user.role === "owner") && item("/admin/datasets", "datasets", "Keywords")}
            {(user.role === "admin" || user.role === "owner") && item("/admin/brand", "brand", "Brand")}
            {(user.role === "admin" || user.role === "owner") && item("/admin/users", "users", "Logins")}
          </nav>
          <div className="account">
            {user.brandName && <span className="brand-chip">{user.brandName}</span>}
            {user.role === "owner" && brands.length > 0 && <WorkspaceSwitcher key={user.workspaceId ?? "every"} brands={brands} current={user.workspaceId ?? null} />}
            <span className="who">{user.displayName}</span>
            <SignOut />
          </div>
        </div>
      </header>
    </>
  );
}
