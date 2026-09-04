"use client";

import { FormEvent, useState } from "react";
import {
  CONSENT_COPY,
  ROLE_DETAIL_MAX,
  ROLES,
  SOURCES,
  SUMMIT_EVENT_ID,
  badgeCodeFor,
  syncAttendee,
  validateAttendee,
  writeLocalAttendee,
  type LocalAttendee,
  type Role,
  type Source,
} from "@/lib/match/attendee";
import { METROS } from "@/lib/match/metros";
import { ClayCity } from "./ClayCity";
import { Lockup } from "./Lockup";

type Props = { onEntered: (record: LocalAttendee) => void };

/** One screen of explanation, then the form. Both are the front door. */
export function Gate({ onEntered }: Props) {
  const [screen, setScreen] = useState<"intro" | "form">("intro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [roleDetail, setRoleDetail] = useState("");
  const [source, setSource] = useState<Source | "">("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = validateAttendee({
      name,
      email,
      company,
      role: role as Role,
      roleDetail,
      source: source as Source,
      consent,
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const record: LocalAttendee = {
      ...checked.value,
      eventId: SUMMIT_EVENT_ID,
      badgeCode: await badgeCodeFor(checked.value.email),
      createdAt: now,
      consentAt: now,
      synced: false,
    };
    // Store locally first: the loop must not depend on the hotspot.
    writeLocalAttendee(record);
    const synced = await syncAttendee(record);
    const final = { ...record, synced };
    writeLocalAttendee(final);
    setBusy(false);
    onEntered(final);
  }

  const metroNames = METROS.map((m) => m.name).join(", ");

  return (
    <div className="match-screen match-screen--city flex flex-col">
      <ClayCity />
      <header className="flex items-center px-4 py-3">
        <Lockup />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pb-3">
        {screen === "intro" ? (
          <>
            <h1 className="mt-5 px-1 text-[1.7rem] font-semibold leading-tight [text-shadow:0_2px_14px_rgba(0,0,0,.6)]">
              Give us a data center. We&apos;ll show you the water around it.
            </h1>
            <p className="mt-3 px-1 text-[15px] leading-relaxed [text-shadow:0_1px_10px_rgba(0,0,0,.7)]">
              Pick a metro or name a facility. The map draws the watershed and the aquifer it sits on,
              lists the data centers nearby, and shows which share the same ground.
            </p>
            <div className="match-sheet mt-auto p-4">
              <p className="text-[14px] leading-relaxed">
                Then three taps estimate your own AI&apos;s daily water, and the map shows where it comes from.
                Finish the short walk-through and you have a code; show it to the x402GAL team for a coin.
              </p>
              <p className="match-quiet mt-2 text-[12px] leading-relaxed">
                Metros today: {metroNames}. Utah follows once its footprint is confirmed.
              </p>
              <button type="button" onClick={() => setScreen("form")} className="match-action mt-4 w-full px-4 py-3 text-[16px]">
                Start
              </button>
              <div className="mt-3 flex items-baseline justify-between">
                <p className="match-quiet text-[12px]">About ninety seconds.</p>
                <p className="match-quiet text-[10px]">© OpenStreetMap contributors</p>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="match-sheet mt-3 flex flex-1 flex-col p-4">
            <h1 className="text-[1.4rem] font-semibold leading-tight">Before the map, who&apos;s asking?</h1>
            <p className="match-quiet mt-1 text-[13px]">Six fields. Your code at the end is tied to this.</p>

            <div className="mt-5 flex flex-col gap-3">
              <input
                className="match-input px-3 py-3 text-[15px]"
                placeholder="Name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="match-input px-3 py-3 text-[15px]"
                placeholder="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="match-input px-3 py-3 text-[15px]"
                placeholder="Company"
                autoComplete="organization"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <fieldset className="mt-5">
              <legend className="text-[14px] font-medium">Role</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-selected={role === r}
                    onClick={() => setRole(r)}
                    className="match-choice px-3 py-2 text-[14px]"
                  >
                    {r}
                  </button>
                ))}
              </div>
              {role === "Other" && (
                <input
                  className="match-input mt-2 w-full px-3 py-3 text-[15px]"
                  placeholder="What do you do? A few words is plenty."
                  aria-label="Your role, in your words"
                  maxLength={ROLE_DETAIL_MAX}
                  autoFocus
                  value={roleDetail}
                  onChange={(e) => setRoleDetail(e.target.value)}
                />
              )}
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-[14px] font-medium">What brought you here</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-selected={source === s}
                    onClick={() => setSource(s)}
                    className="match-choice px-3 py-2 text-[14px]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 flex items-start gap-3 text-[13px] leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--hc-primary)]"
              />
              <span>{CONSENT_COPY}</span>
            </label>

            {error && <p className="mt-3 text-[13px]" style={{ color: "var(--hc-pale)" }}>{error}</p>}

            <div className="mt-auto pt-6">
              <button type="submit" disabled={busy} className="match-action w-full px-4 py-3 text-[16px]">
                {busy ? "One moment" : "Show me the water"}
              </button>
              <button type="button" onClick={() => setScreen("intro")} className="match-link mt-3 w-full text-center text-[13px]">
                Back
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
