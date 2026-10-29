"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { PHOTOS } from "@/lib/photos";
import { Lockup } from "@/components/Logo";

/** Shown instead of a technical error screen. The details go to the console for engineers, never onto the page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="narrow">
      <Link href="/" className="wordmark" style={{ marginBottom: 44 }}><Lockup height={18} thread={false} /></Link>
      <div className="empty-state">
        <div className="ph"><Image src={PHOTOS.empty.src} alt={PHOTOS.empty.alt} fill placeholder="blur" sizes="(max-width: 760px) 100vw, 480px" /></div>
        <div>
          <h2>Something went wrong on our side.</h2>
          <p className="muted">It&apos;s not something you did. Please try again, and if it keeps happening, let your account manager know.</p>
          <div className="btns" style={{ marginTop: 18 }}>
            <button onClick={reset}>Try again</button>
            <Link className="btn ghost" href="/">Back to Create</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
