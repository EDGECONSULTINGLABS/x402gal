"use client";

import Link from "next/link";
import { REDEEM_COPY, REDEEM_FALLBACK_COPY, type LocalAttendee } from "@/lib/match/attendee";
import { Lockup } from "./Lockup";

type Props = {
  attendee: LocalAttendee;
  metroName: string | null;
  subwatershed: string | null;
  onBackToMap: () => void;
};

/**
 * Completion record + a code. The app's job ends at producing this screen.
 * The coin is a physical keepsake handed over by the team on the floor (no booth). Nothing on-chain attaches to it.
 */
export function Badge({ attendee, metroName, subwatershed, onBackToMap }: Props) {
  const first = attendee.name.split(/\s+/)[0] || attendee.name;
  return (
    <div className="match-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <Lockup />
        <button type="button" onClick={onBackToMap} className="match-link text-[13px]">
          Back to the map
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
        <p className="match-quiet mt-6 text-[13px]">Completed</p>
        <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight">{first}, you found your watershed.</h1>
        {subwatershed && (
          <p className="mt-2 text-[15px] leading-relaxed">
            {subwatershed}
            {metroName ? `, ${metroName}` : ""}.
          </p>
        )}

        <div className="match-card mt-6 p-4">
          <p className="match-quiet text-[13px]">Your code</p>
          <p className="match-code mt-2 px-3 py-3 text-center text-[1.9rem] font-medium">{attendee.badgeCode}</p>
          <p className="mt-3 text-[15px] leading-relaxed">{REDEEM_COPY}</p>
          <p className="match-quiet mt-1 text-[13px] leading-relaxed">{REDEEM_FALLBACK_COPY}</p>
          <p className="match-quiet mt-1 text-[13px] leading-relaxed">
            The coin is a keepsake. No HydroCoin allocation attaches to it; supply comes only from verified infiltration.
          </p>
        </div>

        <p className="match-quiet mt-4 text-[12px] leading-relaxed">
          {attendee.synced
            ? "Your details are saved."
            : "Your details are saved on this phone and will sync when there is a connection. The code works either way."}
        </p>

        <div className="mt-auto pt-8">
          <button type="button" onClick={onBackToMap} className="match-action w-full px-4 py-3 text-[16px]">
            Back to the map
          </button>
          <Link href="/console" className="match-link mt-3 block text-center text-[13px]">
            Optional: the x402 payment demonstration (testnet, needs a network)
          </Link>
        </div>
      </main>
    </div>
  );
}
