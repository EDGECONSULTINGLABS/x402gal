import Link from "next/link";
import { Logo } from "./Logo";

const CHAINS = [
  { name: "Avalanche", role: "Agent pay rail", src: "/brands/avalanche.svg", invert: false },
  { name: "Hedera", role: "Attested settlement path", src: "/brands/hedera.svg", invert: false },
  { name: "XRP Ledger", role: "Testnet mechanism demo", src: "/brands/xrp.svg", invert: false },
  { name: "Base", role: "Agent ecosystem", src: "/brands/base.svg", invert: false },
] as const;

const LAYERS = [
  {
    n: "1",
    title: "The gallon is created",
    body: "Infrastructure infiltrates stormwater. That physical gallon is the thing that exists before any token or payment.",
  },
  {
    n: "2",
    title: "The gallon is proven",
    body: "HydroCoin accounts for attested gallons. That is the certification path. It is not what a buyer pays for by name.",
  },
  {
    n: "3",
    title: "The gallon is purchasable",
    body: "x402GAL is the purchase layer. An agent or operator pays per call — HTTP 402 — for a water offset, across the chains they already use.",
  },
] as const;

const RECEIPTS = [
  {
    label: "USDC pull",
    chain: "Avalanche Fuji",
    href: "https://testnet.avascan.info/blockchain/c/tx/0xb88104cab2344fe38f0e00fa1bcdb041e730a1f61f45928a6ed64b23c6f17032",
    hash: "0xb881…7032",
  },
  {
    label: "Swap",
    chain: "XRPL testnet",
    href: "https://testnet.xrpscan.com/tx/5484EC649181ABE68DB1EE252F55A312520BC52C64162D5DEBEE9A5CF205CB15",
    hash: "5484EC…CB15",
  },
  {
    label: "Retire",
    chain: "XRPL testnet",
    href: "https://testnet.xrpscan.com/tx/4E479597A44755318B938DC1432C478C38302440482BCB0CA5EFE8976BDADB41",
    hash: "4E4795…DB41",
  },
] as const;

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] gridline opacity-30" />

      <header className="sticky top-0 z-40 border-b border-edge/60 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <div>
              <div className="font-display text-sm font-semibold tracking-tight text-white">
                x402GAL
              </div>
              <div className="hidden text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:block">
                Cross-chain AI water offset
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-200/90">
              Testnet demo
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
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-hydro-400/30 bg-hydro-500/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-hydro-200/90">
          Avalanche · Hedera · XRPL · Base
        </p>

        <h1 className="max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.1] text-white sm:text-6xl">
          Cross-chain AI water offset.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
          Every inference has a water footprint. x402GAL is the purchase layer
          that lets agents and operators pay it back — in USDC or RLUSD, on the
          chain they already run on. You buy{" "}
          <span className="text-hydro-200">verified gallons</span>. Not a ticker.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/console"
            className="inline-flex items-center rounded-xl border border-hydro-400/40 bg-hydro-500/10 px-5 py-3 text-sm font-medium text-hydro-100 transition hover:border-hydro-300 hover:bg-hydro-500/20"
          >
            Mechanism demo
          </Link>
          <a
            href="https://www.hydrocoin.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-slate-400 transition hover:text-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brands/hydrocoin-coin.png"
              alt="HydroCoin"
              className="h-12 w-12 rounded-full object-cover"
            />
            <span className="leading-tight">
              <span className="block text-white">HydroCoin</span>
              <span className="block text-[11px] text-slate-500">Proof layer</span>
            </span>
          </a>
        </div>

        <section className="mt-16">
          <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Ecosystem
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CHAINS.map((c) => (
              <div key={c.name} className="glass flex flex-col gap-3 rounded-xl px-4 py-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.src}
                  alt={`${c.name} logo`}
                  className="h-10 w-10 object-contain sm:h-12 sm:w-12"
                />
                <div>
                  <div className="font-display text-sm font-medium text-white">{c.name}</div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{c.role}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
            Three layers. One gallon.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            The ecosystem around the offset — not a single chain, and not a
            single product name on the invoice.
          </p>
          <ol className="mt-8 space-y-6">
            {LAYERS.map((layer) => (
              <li key={layer.n} className="flex gap-4">
                <span className="mt-0.5 font-mono text-xs text-hydro-300">{layer.n}</span>
                <div>
                  <h3 className="font-display text-base font-medium text-white">
                    {layer.title}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
                    {layer.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
            How a call pays
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            The agent hits a gated endpoint and receives HTTP{" "}
            <code className="rounded bg-hydro-500/10 px-1.5 py-0.5 font-mono text-hydro-300">
              402 Payment Required
            </code>{" "}
            with a water-footprint quote. It signs an x402 payload and pays. The
            offset is a verified gallon — purchased on Avalanche, Base, or XRPL
            today; Hedera is the attested-settlement path for HydroCoin. Those
            rails are not yet one live hop.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
            Operator receipts
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Real testnet transactions from operator runs. Thin on purpose. No
            seeded volume.
          </p>
          <ul className="mt-6 divide-y divide-edge/70 rounded-2xl border border-edge/70">
            {RECEIPTS.map((r) => (
              <li key={r.hash} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="text-sm text-slate-200">{r.label}</div>
                  <div className="font-mono text-[11px] text-slate-500">{r.chain}</div>
                </div>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-hydro-300 hover:text-hydro-200"
                >
                  {r.hash} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-16 max-w-2xl text-xs leading-relaxed text-slate-600">
          Testnet demonstration. Funds have no real-world value. This site does
          not offer inventory, does not imply attested gallons have been minted
          for sale, and is not an offer of securities. Completing a demo payment
          does not create a HydroCoin credit. The demonstration settlement unit
          on the mechanism page is not HydroCoin.
        </p>
      </main>
    </div>
  );
}
