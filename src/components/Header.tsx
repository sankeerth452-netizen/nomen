import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import SignOut from "@/app/SignOut";

type Section = "create" | "history" | "datasets" | "users" | "credits";

export default function Header({ user, active }: { user: SessionUser; active?: Section }) {
  const item = (href: string, section: Section, label: string) => (
    <Link href={href} aria-current={active === section ? "page" : undefined}>{label}</Link>
  );
  return (
    <>
      {/* Mock mode must never pass for real data: say so on every page. */}
      {process.env.PROVIDER_MODE === "mock" && <div className="strip">Demo mode · sample search data, no AI calls</div>}
      <header className="masthead">
        <div className="masthead-in">
          <Link href="/" className="wordmark" aria-label="Product Name Optimiser, home">
            <b>Product Name</b><i>Optimiser</i>
          </Link>
          <nav className="mainnav" aria-label="Main">
            {item("/", "create", "Create")}
            {item("/history", "history", "History")}
            {user.role !== "buyer" && item("/admin/datasets", "datasets", "Datasets")}
            {user.role === "owner" && item("/admin/users", "users", "Users")}
          </nav>
          <div className="account">
            {user.brandName && <span className="brand-chip">{user.brandName}</span>}
            <span className="who">{user.displayName}</span>
            <SignOut />
          </div>
        </div>
      </header>
    </>
  );
}
