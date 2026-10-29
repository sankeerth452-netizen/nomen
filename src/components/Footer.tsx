import Link from "next/link";
import { Mark, PRODUCT_NAME, TAGLINE } from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="colophon">
      <div className="colophon-in">
        <span className="sign-off"><Mark height={22} /><b>{PRODUCT_NAME}</b><span>{TAGLINE}</span></span>
        <Link href="/credits">Photography credits</Link>
      </div>
    </footer>
  );
}
