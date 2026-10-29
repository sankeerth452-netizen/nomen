import Image from "next/image";
import { requirePageUser } from "@/lib/auth/guards";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { PHOTOS } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function Credits() {
  const user = await requirePageUser();
  return (
    <>
      <Header user={user} active="credits" />
      <main>
        <div className="page-head">
          <div>
            <span className="eyebrow">About the photos</span>
            <h1>Photography <em>credits</em></h1>
            <p>Every photograph is from Burst by Shopify, free for commercial use. Credit isn&apos;t required, but it&apos;s deserved.</p>
          </div>
        </div>
        <div className="credits">
          {Object.entries(PHOTOS).map(([k, p]) => (
            <div className="credit" key={k}>
              <div className="ph"><Image src={p.src} alt={p.alt} fill placeholder="blur" sizes="220px" style={{ objectPosition: p.position }} /></div>
              <p><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a></p>
              <small>Photo by {p.photographer} · {p.licence}</small>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
