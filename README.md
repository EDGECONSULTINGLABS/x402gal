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
| `lib/x402.ts` | x402 v1 "exact" scheme: requirement builder, payload encode/decode, verifier |
| `lib/wire.ts` | Wire UTL bridge simulation: route planning, hop tracing, retirement |
| `lib/amm.ts` | HydroCoin constant-product AMM (USDC ↔ HYDRO) |
| `lib/agentSdk.ts` | `meraxisFetch()` — drop-in replacement for `fetch()` that auto-pays 402s |
| `lib/ledger.ts` | In-memory ledger (agents, settlements, AMM state) |
| `app/api/ai/chat` | x402-gated demo inference endpoint |
| `app/api/x402/verify` | Standalone facilitator endpoint (pluggable into any resource server) |
| `app/api/demo/run` | One-click full round-trip for the dashboard |
| `components/Dashboard.tsx` | Live dashboard: settlements stream, route trace, AMM, agent console |
| `scripts/demo-agent.ts` | CLI agent walking the full flow |

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000

# in another shell, run a real agent against the live server:
npm run demo:agent
```

## Why this matters

UC Riverside's *Making AI Less Thirsty* (2023) estimates a single GPT-4-class
query consumes ≈0.5 L of freshwater. At ChatGPT scale, that is millions of
liters per day, today, with no settlement layer. Meraxis turns that hidden
externality into a programmable, agent-native payment — using primitives
(x402, Wire UTL) that already exist.

## Status

Hackathon prototype. The Wire UTL hops are simulated; the protocol shape,
x402 contract, and HydroCoin AMM are functional. Swap the bridge module for
a real UTL relay client to ship.
