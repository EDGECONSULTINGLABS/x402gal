"use client";

import { FormEvent, useState } from "react";
import { Logo } from "./Logo";

export function PreviewGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/preview-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not sign in.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] gridline opacity-30" />
      <header className="border-b border-edge/60 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
          <Logo size={28} />
          <div className="font-display text-sm font-semibold tracking-tight text-white">
            x402<span className="text-amber-300/90">GAL</span>
          </div>
        </div>
      </header>
      <main className="relative mx-auto flex max-w-md flex-col px-4 pt-20 sm:px-6">
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-edge bg-panel/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-hydro-400/50"
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-edge bg-panel/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-hydro-400/50"
            />
          </label>
          {error && <p className="text-xs text-amber-300/90">{error}</p>}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-xl bg-hydro-gradient px-5 py-3 text-sm font-semibold text-abyss disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    </div>
  );
}
