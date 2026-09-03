"use client";

import { useState } from "react";
import { LEARN_STEPS } from "@/lib/match/learn";
import { GlossaryProvider, GlossaryTerm } from "./GlossaryTerm";
import { Lockup } from "./Lockup";

type Props = { inNewYork: boolean; onDone: () => void; onBack: () => void };

/** One screen, one idea. Terms tap open in place. */
export function Learn({ inNewYork, onDone, onBack }: Props) {
  const [i, setI] = useState(0);
  const step = LEARN_STEPS[i];
  const last = i === LEARN_STEPS.length - 1;

  return (
    <GlossaryProvider newYorkLesson={inNewYork}>
      <div className="match-screen flex flex-col">
        <header className="flex items-center justify-between px-4 py-3">
          <Lockup />
          <button type="button" onClick={onBack} className="match-link text-[13px]">
            Back to the map
          </button>
        </header>
        <div className="match-progress mx-4">
          <span style={{ width: `${((i + 1) / LEARN_STEPS.length) * 100}%` }} />
        </div>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
          <p className="match-quiet mt-6 text-[13px]">
            {i + 1} of {LEARN_STEPS.length}
          </p>
          <h1 className="mt-1 text-[1.5rem] font-semibold leading-tight">{step.title}</h1>
          {step.body.map((p, k) => (
            <p key={k} className="mt-3 text-[15px] leading-relaxed">
              {p}
            </p>
          ))}
          {step.terms.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px]">
              <span className="match-quiet text-[13px]">Tap a term</span>
              {step.terms.map((id) => (
                <GlossaryTerm key={id} id={id} hover={false} />
              ))}
            </div>
          )}
          <div className="mt-auto pt-8">
            <button
              type="button"
              onClick={() => (last ? onDone() : setI(i + 1))}
              className="match-action w-full px-4 py-3 text-[16px]"
            >
              {last ? "Get my code" : "Next"}
            </button>
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="match-link mt-3 w-full text-center text-[13px]">
                Previous
              </button>
            )}
          </div>
        </main>
      </div>
    </GlossaryProvider>
  );
}
