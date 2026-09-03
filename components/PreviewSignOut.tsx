"use client";

export function PreviewSignOut({ email }: { email: string }) {
  async function signOut() {
    await fetch("/api/preview-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600 transition hover:text-slate-300 sm:inline"
      title={email}
    >
      Sign out
    </button>
  );
}
