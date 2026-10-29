"use client";
import Image from "next/image";
import { useState } from "react";
import { PHOTOS } from "@/lib/photos";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setError((await res.json().catch(() => ({}))).error ?? "Sign in failed");
    setBusy(false);
  }

  return (
    <div className="signin">
      <div className="signin-photo">
        <Image src={PHOTOS.login.src} alt={PHOTOS.login.alt} fill priority placeholder="blur" sizes="(max-width: 820px) 100vw, 55vw" />
        <div className="signin-caption">
          <h2>Every piece deserves the name shoppers search for.</h2>
          <p>Evidence-led product names, built only from what you tell us about the piece.</p>
        </div>
      </div>
      <main className="signin-panel">
        <form onSubmit={submit}>
          <span className="wordmark"><b>Product Name</b><i>Optimiser</i></span>
          <h1>Sign in</h1>
          <p className="muted">Use the login you were given. No login? Ask your account manager.</p>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          {error && <p className="err" style={{ marginTop: 16 }}>{error}</p>}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </main>
    </div>
  );
}
