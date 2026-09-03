"use client";

import { useState, type ReactNode } from "react";

const LINES: { delay: string; gap?: boolean; content?: ReactNode }[] = [
  {
    delay: "0.15s",
    content: (
      <span className="x-cmt"># An agent holds a rule: replenish what this workload consumed.</span>
    ),
  },
  {
    delay: "0.35s",
    content: (
      <>
        <span className="x-verb">GET</span>{" "}
        <span className="x-path">{"/v1/gallons?region=US-AZ&quantity=100000&vintage=2026"}</span>
      </>
    ),
  },
  {
    delay: "0.5s",
    content: (
      <>
        {"  "}
        <span className="x-key">Accept:</span> <span className="x-val">application/json</span>
      </>
    ),
  },
  { delay: "0.7s", gap: true },
  {
    delay: "0.95s",
    content: <span className="x-402">402 Payment Required</span>,
  },
  {
    delay: "1.1s",
    content: (
      <>
        {"  "}
        <span className="x-key">x402-network:</span>
        {"   "}
        <span className="x-val">avalanche</span>
      </>
    ),
  },
  {
    delay: "1.2s",
    content: (
      <>
        {"  "}
        <span className="x-key">x402-asset:</span>
        {"     "}
        <span className="x-val">USDC</span>
      </>
    ),
  },
  {
    delay: "1.3s",
    content: (
      <>
        {"  "}
        <span className="x-key">x402-amount:</span>
        {"    "}
        <span className="x-val">&lt;quoted at request time&gt;</span>
      </>
    ),
  },
  {
    delay: "1.4s",
    content: (
      <>
        {"  "}
        <span className="x-key">x402-resource:</span>
        {"  "}
        <span className="x-val">gal:parjana/&lt;project&gt;#&lt;serial-range&gt;</span>
      </>
    ),
  },
  {
    delay: "1.5s",
    content: (
      <>
        {"  "}
        <span className="x-key">verification:</span>
        {"   "}
        <span className="x-val">PE seal + CPA attestation, on record</span>
      </>
    ),
  },
  { delay: "1.7s", gap: true },
  {
    delay: "1.9s",
    content: (
      <>
        <span className="x-verb">POST</span> <span className="x-path">/v1/settle</span>
        {"   "}
        <span className="x-key">X-PAYMENT:</span> <span className="x-val">&lt;signed&gt;</span>
      </>
    ),
  },
  { delay: "2.1s", gap: true },
  {
    delay: "2.35s",
    content: <span className="x-200">200 OK</span>,
  },
  {
    delay: "2.5s",
    content: (
      <>
        {"  "}
        <span className="x-key">gallons_retired:</span>
        {"    "}
        <span className="x-val">100,000</span>
      </>
    ),
  },
  {
    delay: "2.6s",
    content: (
      <>
        {"  "}
        <span className="x-key">project:</span>
        {"            "}
        <span className="x-val">&lt;named infiltration site&gt;</span>
      </>
    ),
  },
  {
    delay: "2.7s",
    content: (
      <>
        {"  "}
        <span className="x-key">measured_by:</span>
        {"        "}
        <span className="x-val">field instrumentation, continuous</span>
      </>
    ),
  },
  {
    delay: "2.8s",
    content: (
      <>
        {"  "}
        <span className="x-key">sealed_by:</span>
        {"          "}
        <span className="x-val">Professional Engineer of record</span>
      </>
    ),
  },
  {
    delay: "2.9s",
    content: (
      <>
        {"  "}
        <span className="x-key">attested_by:</span>
        {"        "}
        <span className="x-val">independent CPA</span>
      </>
    ),
  },
  {
    delay: "3.0s",
    content: (
      <>
        {"  "}
        <span className="x-key">retirement_record:</span>
        {"  "}
        <span className="x-val">hedera://hcs/&lt;topic&gt;/&lt;sequence&gt;</span>{" "}
        <span className="x-caret" aria-hidden />
      </>
    ),
  },
];

export function ExchangeTrace() {
  const [play, setPlay] = useState(0);

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge/70 pb-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          The transaction, in full
        </p>
        <div className="flex items-center gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">
            Illustrative. Values are not quoted prices.
          </p>
          <button
            type="button"
            onClick={() => setPlay((n) => n + 1)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-hydro-300/80 transition hover:text-hydro-200"
          >
            Replay
          </button>
        </div>
      </div>
      <pre
        key={play}
        className="exchange-trace overflow-x-auto rounded-b-2xl border border-t-0 border-edge/70 bg-panel/80 px-4 py-6 font-mono text-[12.5px] leading-[1.85] sm:px-6 sm:text-[13.5px]"
        role="img"
        aria-label="An illustrative HTTP exchange. An agent requests one hundred thousand verified gallons in Arizona. The server answers 402 Payment Required with a machine-readable quote. The agent submits a signed payment. The server answers 200 OK with a retirement receipt referencing the engineer's seal, the CPA attestation and the on-chain retirement record."
      >
        {LINES.map((line, i) =>
          line.gap ? (
            <span key={i} className="x-gap" />
          ) : (
            <span key={i} className="x-line" style={{ animationDelay: line.delay }}>
              {line.content}
            </span>
          )
        )}
      </pre>
    </section>
  );
}
