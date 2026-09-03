/**
 * Attendee record — the product's primary output at the Summit.
 * Shared between the gate (client), /api/match/attend (server) and the CSV export.
 * No node-only imports: this runs in the browser too.
 */

export const SUMMIT_EVENT_ID = "avalanche-summit-nyc-2026";

export const ROLES = [
  "Data centers",
  "AI or cloud",
  "Corporate sustainability",
  "Investor",
  "Ecosystem or payments",
  "Other",
] as const;
export type Role = (typeof ROLES)[number];

export const SOURCES = ["Saw the ad", "Met at the booth", "Team1", "Other"] as const;
export type Source = (typeof SOURCES)[number];

/** Exact consent copy from the launch spec §7. Render as written. */
export const CONSENT_COPY =
  "We'll use this to follow up about x402GAL and HydroCoin. No sharing with third parties. Unsubscribe any time.";

export type AttendeeInput = {
  name: string;
  email: string;
  company: string;
  role: Role;
  source: Source;
  consent: boolean;
};

export type AttendeeRecord = AttendeeInput & {
  eventId: string;
  badgeCode: string;
  createdAt: string;
  consentAt: string | null;
  metro?: string;
  metroAt?: string;
  assessmentGallons?: number;
  assessmentVersion?: string;
  assessedAt?: string;
  badgeAt?: string;
};

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

export function validateAttendee(input: Partial<AttendeeInput>): { ok: true; value: AttendeeInput } | { ok: false; error: string } {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const company = (input.company ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Add your name." };
  if (!validEmail(email)) return { ok: false, error: "That email doesn't look complete." };
  if (company.length < 1) return { ok: false, error: "Add your company." };
  if (!ROLES.includes(input.role as Role)) return { ok: false, error: "Pick a role." };
  if (!SOURCES.includes(input.source as Source)) return { ok: false, error: "Pick what brought you here." };
  if (input.consent !== true) return { ok: false, error: "Consent is needed to continue." };
  return { ok: true, value: { name, email, company, role: input.role as Role, source: input.source as Source, consent: true } };
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/**
 * Badge code: deterministic from email + event, so it can be produced offline on the
 * phone and reproduced on the server. Six characters, unambiguous alphabet. "HC-XXX-XXX".
 */
export async function badgeCodeFor(email: string, eventId = SUMMIT_EVENT_ID): Promise<string> {
  const data = new TextEncoder().encode(`${eventId}:${email.trim().toLowerCase()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  return `HC-${out.slice(0, 3)}-${out.slice(3)}`;
}

/** Local copy of the record on the phone. Survives reload and a dead hotspot. */
export const ATTENDEE_STORAGE_KEY = "x402gal.summit.attendee";

export type LocalAttendee = AttendeeRecord & { synced: boolean };

export function readLocalAttendee(): LocalAttendee | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTENDEE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalAttendee;
    return parsed.eventId === SUMMIT_EVENT_ID && validEmail(parsed.email) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalAttendee(record: LocalAttendee) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTENDEE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // storage full or blocked — the record still lives in memory for this session
  }
}

export function clearLocalAttendee() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ATTENDEE_STORAGE_KEY);
}

/** POST to the capture endpoint. Never throws; returns whether the server has it. */
export async function syncAttendee(record: AttendeeRecord, patch?: Partial<AttendeeRecord>): Promise<boolean> {
  try {
    const res = await fetch("/api/match/attend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...record, ...patch }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
