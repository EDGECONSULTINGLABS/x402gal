"use client";

import { useState } from "react";
import {
  ESTIMATE_LABEL,
  MEDIA,
  USAGE,
  assess,
  type AssessmentAnswers,
  type AssessmentResult,
  type BasedIn,
  type MediaBucket,
  type UsageBucket,
} from "@/lib/match/assessment";
import { METROS, PENDING_METROS } from "@/lib/match/metros";
import { Lockup } from "./Lockup";

type Props = {
  onResult: (result: AssessmentResult, answers: AssessmentAnswers) => void;
  onMapIt: (result: AssessmentResult) => void;
  onBack: () => void;
};

type Q = 1 | 2 | 3 | "result";

/** Three taps, water-to-water, then the map. No metaphors, no scolding. */
export function Assessment({ onResult, onMapIt, onBack }: Props) {
  const [q, setQ] = useState<Q>(1);
  const [usage, setUsage] = useState<UsageBucket | null>(null);
  const [media, setMedia] = useState<MediaBucket | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const finish = (basedIn: BasedIn) => {
    if (!usage || !media) return;
    const answers: AssessmentAnswers = { usage, media, basedIn };
    const r = assess(answers);
    setResult(r);
    onResult(r, answers);
    setQ("result");
  };

  const progress = q === "result" ? 100 : (Number(q) / 3) * 100;

  return (
    <div className="match-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <Lockup />
        <button type="button" onClick={onBack} className="match-link text-[13px]">
          Back to the map
        </button>
      </header>
      <div className="match-progress mx-4">
        <span style={{ width: `${progress}%` }} />
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
        {q === 1 && (
          <Question
            n={1}
            title="How much do you use AI on a typical day?"
            options={Object.entries(USAGE).map(([k, v]) => ({ key: k, label: v.label }))}
            onPick={(k) => {
              setUsage(k as UsageBucket);
              setQ(2);
            }}
          />
        )}
        {q === 2 && (
          <Question
            n={2}
            title="Do you generate images or video?"
            options={Object.entries(MEDIA).map(([k, v]) => ({ key: k, label: v.label }))}
            onPick={(k) => {
              setMedia(k as MediaBucket);
              setQ(3);
            }}
            onBack={() => setQ(1)}
          />
        )}
        {q === 3 && (
          <Question
            n={3}
            title="Where are you based?"
            options={[
              ...METROS.map((m) => ({ key: m.id, label: m.name })),
              ...PENDING_METROS.map((m) => ({ key: `pending:${m.id}`, label: m.name, disabled: true, note: "Footprint pending" })),
              { key: "elsewhere", label: "Elsewhere" },
            ]}
            onPick={(k) => finish(k as BasedIn)}
            onBack={() => setQ(2)}
          />
        )}
        {q === "result" && result && <Result result={result} onMapIt={() => onMapIt(result)} />}
      </main>
    </div>
  );
}

function Question({
  n,
  title,
  options,
  onPick,
  onBack,
}: {
  n: number;
  title: string;
  options: { key: string; label: string; disabled?: boolean; note?: string }[];
  onPick: (key: string) => void;
  onBack?: () => void;
}) {
  return (
    <>
      <p className="match-quiet mt-6 text-[13px]">Question {n} of 3</p>
      <h1 className="mt-1 text-[1.4rem] font-semibold leading-tight">{title}</h1>
      <div className="mt-5 flex flex-col gap-2">
        {options.map((o) =>
          o.disabled ? (
            <div key={o.key} className="match-choice px-3 py-3 text-left text-[15px] opacity-60" aria-disabled="true">
              {o.label}
              {o.note && <span className="match-quiet block text-[12px]">{o.note}</span>}
            </div>
          ) : (
            <button key={o.key} type="button" onClick={() => onPick(o.key)} className="match-choice px-3 py-3 text-left text-[15px]">
              {o.label}
            </button>
          )
        )}
      </div>
      {onBack && (
        <button type="button" onClick={onBack} className="match-link mt-4 self-start text-[13px]">
          Previous question
        </button>
      )}
    </>
  );
}

function Result({ result, onMapIt }: { result: AssessmentResult; onMapIt: () => void }) {
  const metro = METROS.find((m) => m.id === result.metro);
  return (
    <>
      <p className="match-quiet mt-6 text-[13px]">Your AI&apos;s water, estimated</p>
      <h1 className="mt-1 text-[2rem] font-semibold leading-tight">
        <span className="match-gradient-text">{result.dailyDisplay}</span> a day
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed">
        Over a year, about <strong>{result.bottlesPerYearDisplay}</strong> 500&nbsp;mL bottles, or{" "}
        <strong>{result.gallonsPerYearDisplay}</strong> gallons, drawn at the data center.
      </p>

      <div className="match-estimated mt-5 p-3">
        <p className="text-[13px] font-medium">Estimated</p>
        <p className="mt-1 text-[13px] leading-relaxed">{ESTIMATE_LABEL}</p>
        <p className="match-mono match-quiet mt-2 break-all text-[11px]">
          {result.methodology.version} edition · {result.methodology.hash}
        </p>
      </div>

      <p className="mt-6 text-[15px] leading-relaxed">
        Your AI&apos;s water didn&apos;t come from here. It came from the ground under a data center
        {metro ? ` in ${metro.name}` : ""}.
      </p>
      <div className="mt-auto pt-6">
        <button type="button" onClick={onMapIt} className="match-action w-full px-4 py-3 text-[16px]">
          Tap to see the watershed it&apos;s drawing from
        </button>
      </div>
    </>
  );
}
