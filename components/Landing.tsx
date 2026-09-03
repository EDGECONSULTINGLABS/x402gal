import { ExchangeTrace } from "./ExchangeTrace";
import { Logo } from "./Logo";
import { PreviewSignOut } from "./PreviewSignOut";

const CONTACT = "info@hydrocoin.com";

const LAYERS = [
  {
    tag: "Physical",
    name: "Parjana Engineering",
    q: "Was a real water outcome created?",
    body: "IRIS infiltration infrastructure moves stormwater into the ground and makes recharge measurable at the site.",
  },
  {
    tag: "Proof",
    name: "HydroCoin on Hedera",
    q: "Is the gallon real, unique and retired once?",
    body: "Field data is frozen, fingerprinted, sealed by a licensed engineer and attested by a CPA before a single gallon is recorded. Retirement is permanent and public.",
    href: "https://www.hydrocoin.com/",
  },
  {
    tag: "Commerce",
    name: "x402GAL",
    q: "Can it be found, priced and bought automatically?",
    body: "An HTTP-native purchase and retirement path, so software can transact against verified inventory without a human in the loop.",
  },
] as const;

const BUYS = [
  {
    title: "A defined quantity from a defined watershed",
    body: "Gallons carry their origin. Project, vintage, verification status and serial range travel with the purchase.",
  },
  {
    title: "A multiyear replenishment agreement",
    body: "Contracted demand tied to actual corporate or workload water consumption, not a spot purchase.",
  },
  {
    title: "Automated replenishment",
    body: "A policy rule attached to an AI workload or an enterprise consumption threshold, settled by machine.",
  },
  {
    title: "Reporting and retirement evidence",
    body: "An auditable record showing project, quantity, who verified it, and that the gallon can never be sold again.",
  },
] as const;

const CHAINS = [
  {
    name: "Hedera",
    src: "/brands/hedera.svg",
    role: "System of record. Issuance, provenance, professional attestation and permanent retirement of every verified gallon.",
    status: "Selected",
    tone: "live" as const,
  },
  {
    name: "Avalanche",
    src: "/brands/avalanche.svg",
    role: "Agentic commerce and settlement rail for x402GAL. Discovery, quoting and payment execution.",
    status: "In evaluation",
    tone: "eval" as const,
  },
  {
    name: "Base",
    src: "/brands/base.svg",
    role: "Additional x402 settlement rail, where a buyer's treasury already sits there.",
    status: "In evaluation",
    tone: "eval" as const,
  },
  {
    name: "XRPL",
    src: "/brands/xrp.svg",
    role: "Earlier implementation from the original architecture. Retained as prior art, not part of the current path.",
    status: "Archived",
    tone: "off" as const,
  },
] as const;

const AUDIENCES = [
  {
    who: "AI and data infrastructure",
    body: "Operators whose water footprint is growing faster than their ability to account for it.",
    ask: "Would your systems benefit from programmatic verified-water purchasing?",
  },
  {
    who: "Corporate water buyers",
    body: "Companies with replenishment targets and no standardized way to prove they met them.",
    ask: "Would you buy verified gallons under a multiyear agreement?",
  },
  {
    who: "Infrastructure and RWA investors",
    body: "Capital for project SPVs, offtake-backed debt and watershed-scale build-out.",
    ask: "What level of contracted demand would you need to finance a water project?",
  },
  {
    who: "Ecosystem, payments and stablecoin partners",
    body: "Facilitators, settlement providers and integration teams working on agentic commerce.",
    ask: "What would make this a compelling real-world x402 use case?",
  },
] as const;

function statusDot(tone: "live" | "eval" | "off") {
  if (tone === "live") return "bg-hydro-300";
  if (tone === "eval") return "bg-amber-400";
  return "bg-slate-600";
}

export function Landing({ reviewerEmail }: { reviewerEmail?: string }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] gridline opacity-30" />

      <header className="sticky top-0 z-40 border-b border-edge/60 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <div>
              <div className="font-display text-sm font-semibold tracking-tight text-white">
                x402<span className="text-amber-300/90">GAL</span>
              </div>
              <div className="hidden text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:block">
                Verified water, purchasable by machine
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {reviewerEmail && <PreviewSignOut email={reviewerEmail} />}
            <a href="/match" className="hidden text-xs text-slate-500 hover:text-hydro-200 sm:inline">
              Match
            </a>
            <span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:inline-flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-hydro-300" />
              Pilot stage · Avalanche Summit, New York, Sep 16–17
            </span>
            <a
              href="https://www.hydrocoin.com/"
              target="_blank"
              rel="noreferrer"
              className="shrink-0"
              aria-label="HydroCoin"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brands/hydrocoin-coin.png"
                alt="HydroCoin — Verified Infiltrated Water"
                className="h-10 w-10 rounded-full object-cover sm:h-11 sm:w-11"
              />
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
        <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          <span className="text-slate-300">Parjana Engineering</span>
          {" · "}
          <span className="text-slate-300">HydroCoin</span>
        </p>

        <h1 className="max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl">
          Water an agent can buy.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
          x402GAL turns an independently verified gallon of infiltrated
          stormwater into something a machine can discover, price, purchase and
          retire over HTTP. The gallon is measured in the field, sealed by a
          licensed engineer, attested by a CPA, and accounted for on Hedera.
        </p>

        <ExchangeTrace />

        <section className="mt-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Three layers, one gallon
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold text-white sm:text-2xl">
            Each layer answers a different question.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            The technology is not the thesis. The physical water outcome comes
            first, then the proof, then the transaction.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {LAYERS.map((layer) => {
              const inner = (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300/80">
                    {layer.tag}
                  </p>
                  <h3 className="mt-3 flex items-center gap-2 font-display text-base font-medium text-white">
                    {layer.tag === "Proof" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/brands/hydrocoin-coin.png"
                        alt=""
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    )}
                    {layer.name}
                  </h3>
                  <p className="mt-2 text-sm italic text-slate-500">{layer.q}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{layer.body}</p>
                </>
              );
              return "href" in layer ? (
                <a
                  key={layer.name}
                  href={layer.href}
                  target="_blank"
                  rel="noreferrer"
                  className="glass rounded-xl px-5 py-6 transition hover:border-hydro-400/40"
                >
                  {inner}
                </a>
              ) : (
                <div key={layer.name} className="glass rounded-xl px-5 py-6">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            The commercial product
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold text-white sm:text-2xl">
            What a buyer actually receives.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            Nobody buys a token. They buy a defined quantity of verified gallons
            and the evidence that stands behind them.
          </p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {BUYS.map((item) => (
              <div key={item.title} className="border-t border-edge/70 pt-4">
                <h3 className="font-display text-sm font-medium text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl border-t border-edge/70 pt-6 text-base leading-relaxed text-slate-300">
            Contracted demand finances the infrastructure. The infrastructure
            creates verified gallons. Verified gallons create recurring economic
            activity.
          </p>
        </section>

        <section className="mt-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Cross-chain by role, not by fashion
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold text-white sm:text-2xl">
            Proof and payment do not need the same chain.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            One network holds the authoritative record of the gallon. Others
            move the money. Keeping those jobs separate is what lets a buyer pay
            on the rail they already use without weakening the record.
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[11.5rem]" />
                <col />
                <col className="w-[9.5rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-edge/70 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="pb-3 pr-6 font-medium">Network</th>
                  <th className="pb-3 pr-6 font-medium">Role</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {CHAINS.map((c) => (
                  <tr key={c.name} className="border-b border-edge/50">
                    <td className="py-5 pr-6 align-top">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.src} alt="" className="h-8 w-8 shrink-0 object-contain" />
                        <span className="font-display font-medium text-white">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-5 pr-6 align-top text-slate-400">{c.role}</td>
                    <td className="py-5 align-top">
                      <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(c.tone)}`} />
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            At the Summit
          </p>
          <h2 className="mt-3 font-display text-xl font-semibold text-white sm:text-2xl">
            Who we want to talk to.
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <div key={a.who} className="glass rounded-xl px-5 py-6">
                <h3 className="font-display text-sm font-medium text-white">{a.who}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.body}</p>
                <p className="mt-4 text-sm italic text-amber-200/80">{a.ask}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Next step
          </p>
          <h2 className="mt-3 max-w-xl font-display text-2xl font-semibold text-white sm:text-3xl">
            Start with the water problem.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            If you have a water obligation, a watershed, a workload or capital
            looking for a project, we would rather talk about that than about a
            chain. Ask for the technical walkthrough. This is an agentic
            purchase path — there is nothing to connect a wallet to on this
            page.
          </p>
          <div className="mt-8">
            <a
              href={`mailto:${CONTACT}?subject=${encodeURIComponent("x402gal")}`}
              className="inline-flex items-center rounded-xl bg-hydro-gradient px-5 py-3 text-sm font-semibold text-abyss shadow-glow-lg transition hover:brightness-110"
            >
              Request the walkthrough
            </a>
          </div>
        </section>

        <p className="mt-16 max-w-3xl text-xs leading-relaxed text-slate-600">
          Pilot stage. The exchange shown above is illustrative and does not
          represent quoted pricing, available inventory or a live service. No
          verified gallons are currently offered for sale. Nothing on this page
          is an offer to sell, or a solicitation of an offer to buy, any
          security or other instrument, and nothing here should be read as a
          legal characterization of any asset. x402GAL is a joint effort of
          Parjana Engineering. HydroCoin is built and operated on Hedera. IRIS
          is a trademark of Parjana Distribution.
        </p>
      </main>
    </div>
  );
}
