import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/photos";

export default function NotFound() {
  return (
    <main className="narrow">
      <Link href="/" className="wordmark" style={{ marginBottom: 40 }}><b>Product Name</b><i>Optimiser</i></Link>
      <div className="empty-state">
        <div className="ph"><Image src={PHOTOS.empty.src} alt={PHOTOS.empty.alt} fill placeholder="blur" sizes="(max-width: 760px) 100vw, 480px" /></div>
        <div>
          <h2>We couldn&apos;t find that page.</h2>
          <p className="muted">It may have moved, or the link may be out of date.</p>
          <div className="btns" style={{ marginTop: 18 }}>
            <Link className="btn" href="/">Name a piece</Link>
            <Link className="btn ghost" href="/history">Your history</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
