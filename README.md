# Meraxis

**Water-offset rails for AI agents.** Built for the Consensus Hackathon.

> Every AI inference consumes freshwater (data-center cooling, power
> generation). Meraxis intercepts agent traffic with an HTTP `402 Payment
> Required` response per the [x402 protocol](https://www.x402.org/), the agent
> auto-pays in **HydroCoin (HYDRO)**, and the payment is settled cross-chain
> through [Wire Network's Universal Transaction Layer](https://wire.network)
> — retiring HYDRO against a verifiable water-restoration credit, all in
> under 200ms.

## Architecture

```
┌────────────┐    402 + reqs    ┌────────────────┐
│  AI agent  │ ───────────────▶ │ Meraxis server │
│ (Base/Sol/ │ ◀─── X-PAYMENT ──│   (x402 host)  │
│  Eth/Poly) │                  └───────┬────────┘
└─────┬──────┘                          │ verify + route
      │                                 ▼
      │                       ┌────────────────────┐
      │                       │ Wire UTL relayer   │
      │                       │  lock → mint →     │
      │                       │  retire HYDRO      │
      │                       └─────────┬──────────┘
      │                                 ▼
      │                        Water-restoration
      │                        credit on-chain
      ▼
  Inference response
```

## Files

| Path | Role |
| --- | --- |
| `lib/footprint.ts` | **v2 Green Grid WUE** boundary-aware footprint model with pinned methodology hash |
| `lib/x402.ts` | x402 v1 "exact" scheme: requirement builder, payload encode/decode, verifier |
| `lib/wire.ts` | Wire UTL bridge simulation: route planning, hop tracing, batch retirement |
| `lib/amm.ts` | HydroCoin constant-product AMM (USDC ↔ HYDRO) |
| `lib/agentSdk.ts` | `meraxisFetch()` — drop-in replacement for `fetch()` that auto-pays 402s |
| `lib/ledger.ts` | In-memory ledger (agents, settlements, AMM, pending batch) |
| `app/api/ai/chat` | x402-gated demo inference endpoint (per-call mL price, methodology in 402 body) |
| `app/api/x402/verify` | Standalone facilitator endpoint (pluggable into any resource server) |
| `app/api/batch/flush` | Manually flush pending micro-payments through Wire UTL |
| `app/api/demo/run` | Round-trip driver — set `count` to N to fire N paid calls and observe a flush |
| `components/Dashboard.tsx` | Live dashboard: hero, throughput, settlement stream, route trace, batch panel, methodology |
| `scripts/demo-agent.ts` | CLI agent walking the full flow |

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000

# in another shell, run a real agent against the live server:
npm run demo:agent
```

## Footprint methodology — v2 (boundary-aware)

```
W_site = WUE_site × [(T_in/1000)·e_in + (T_out/1000)·e_out + e_overhead] × F_boundary
```

Avoids the two flaws in v1 (double-counted cooling, mismatched energy
boundary) by following Green Grid WUE v1 strictly: WUE is defined against IT
energy, so we don't multiply by a separate cooling factor and we apply
`F_boundary` only when energy is metered at the GPU level. Source basis:
LBNL 2024 data-center report, Microsoft FY25 / Meta 2024 / AWS 2024
disclosures, Epoch AI GPT-4o estimate, TokenPowerBench, IEEE Pythia.

Each `402` response includes the full methodology block (mode, inputs,
formula, refs, methodology hash, p10/p90 uncertainty band) so a third-party
auditor can re-derive the price independently.

**Defaults:** WUE 0.20 L/kWh (hyperscaler), e_in 0.0002 kWh / 1K input
tokens, e_out 0.0006 kWh / 1K output tokens. A typical 200-in / 500-out
GPT-4-class call is **0.068 mL** ≈ **18 HYDRO drops** (1 HYDRO = 1 US gallon).

## Batching

Per-call settlements would be 18 drops each — illegible on screen and
wasteful on chain. Meraxis aggregates micro-payments into a 100-call batch
(or 60s window), then a single Wire UTL settlement locks the funds, mints a
universal-receipt, and retires HYDRO. The dashboard's *Pending batch* panel
shows the fill state in real time; the *Burst 100 → flush* button drives a
visible cycle.

## Why this matters

A typical GPT-4-class inference is ~0.07 mL. **1 billion calls/day = 68,000 L
= one swimming pool, every day** — today, with no settlement layer. Meraxis
turns that hidden externality into a programmable, agent-native payment
using primitives (x402, Wire UTL) that already exist.

## Status

Hackathon prototype. The Wire UTL hops are simulated; the protocol shape,
x402 contract, and HydroCoin AMM are functional. Swap the bridge module for
a real UTL relay client to ship.
