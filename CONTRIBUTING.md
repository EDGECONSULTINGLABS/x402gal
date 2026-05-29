# Contributing to x402GAL

x402GAL is the first XRPL network adapter for the [x402 payment protocol](https://github.com/coinbase/x402).  
AI agents pay per inference in USDC via HTTP 402; payments are settled as HydroCoin water-restoration credits on the XRP Ledger.

We welcome contributions — especially from the x402 and XRPL ecosystems.

---

## Open contributions

### 1. Full XRPL signature verification (`lib/x402XrplAdapter.ts`)

**This is the highest-priority open PR.**

The `xrplVerify()` function currently checks that the `signature` field is present and non-trivial.  
Full cryptographic verification — confirming the agent actually signed the authorization hash with their XRPL key — is stubbed with a TODO.

**What needs to be implemented:**

```ts
// In lib/x402XrplAdapter.ts — xrplVerify()

import { verify, deriveAddress } from "ripple-keypairs";
import { encode } from "ripple-binary-codec";

// 1. Canonical auth hash (matches what the agent signs on the client side)
function canonicalAuthHash(auth: X402Payload["payload"]["authorization"]): string {
  // Encode the authorization object in canonical ripple-binary-codec order
  // then sha512Half it — same pattern as XRPL transaction signing
  const encoded = encode({
    TransactionType: "Payment",
    Account: auth.from,
    Destination: auth.to,
    Amount: auth.value,
    Sequence: parseInt(auth.nonce, 36),
    LastLedgerSequence: parseInt(auth.validBefore, 10),
  });
  return encoded; // sha512Half applied by ripple-keypairs internally
}

// 2. Verify the signature
const isValid = verify(canonicalAuthHash(auth), sig, publicKey);
```

**Dependencies needed:**
```bash
npm install ripple-keypairs ripple-binary-codec
```

**Test vectors** — use the XRPL testnet wallets in `.env.local.example` to produce known-good signatures for the test suite.

**Reference:** [XRPL transaction signing spec](https://xrpl.org/sign.html) · [ripple-keypairs](https://github.com/XRPLF/xrpl.js/tree/main/packages/ripple-keypairs)

---

### 2. Agent-side x402-client signing (`scripts/demo-agent.ts`)

The demo agent currently generates a stub signature:
```ts
signature: "sig_" + Math.random().toString(36).slice(2)
```

A real agent should sign the authorization hash with its XRPL wallet using `ripple-keypairs.sign()`.  
This pairs directly with contribution #1 above.

---

### 3. Mainnet configuration + XRPL DEX swap

The current settlement uses a simulated AMM for USDC→HYD pricing and direct IOU issuance.  
A production deployment would route through a real XRPL DEX OfferCreate to acquire HYD against actual USDC liquidity.

Relevant file: `lib/xrplHydro.ts` — `swapAndRetireHydro()`

---

## Architecture overview

```
Agent                    Resource Server           402GAL Facilitator         XRPL Testnet
  │                           │                          │                        │
  ├──POST /api/ai/chat────────▶│                          │                        │
  │                           │◀─── HTTP 402 ────────────│                        │
  │                           │     accepts: [{          │                        │
  │                           │       network: "xrpl",   │                        │
  │                           │       asset: "USDC",     │                        │
  │                           │       maxAmount: "22",   │                        │
  │                           │       payTo: "rTreasury" │                        │
  │                           │       footprint: {...}   │                        │
  │                           │     }]                   │                        │
  │                           │                          │                        │
  ├──POST /api/ai/chat────────▶│                          │                        │
  │  X-PAYMENT: base64({      │                          │                        │
  │    network: "xrpl",       │                          │                        │
  │    authorization: {       │                          │                        │
  │      from: "rAgent",      │                          │                        │
  │      to: "rTreasury",     │                          │                        │
  │      value: "22",         │──POST /api/x402/facilitate▶                       │
  │      signature: "..."     │   { requirement, payload }│                        │
  │    }                      │                          ├──xrplVerify()──────────▶│
  │  })                       │                          │◀─ isValid: true ────────│
  │                           │                          ├──xrplSettle()──────────▶│
  │                           │                          │   Hop 1: Issuer→Treasury│ Payment (HYD IOU)
  │                           │                          │◀─ swapTxHash ───────────│
  │                           │                          │   Hop 2: Treasury→Issuer│ Payment (IOU burn)
  │                           │                          │◀─ retireTxHash ─────────│
  │                           │◀─ { isValid, txHash,     │                        │
  │                           │    retirementTxHash }────│                        │
  │◀──200 + completion────────│                          │                        │
```

---

## Running locally

```bash
# Install dependencies
npm install

# Configure XRPL testnet (copy and fill in your seeds)
cp .env.local.example .env.local

# Start dev server
npm run dev

# Validate XRPL settlement end-to-end
npm run demo:agent

# Check real tx hashes on explorer
# https://testnet.xrpscan.com/tx/<settlementHash>
```

---

## Environment variables

| Variable | Description |
|---|---|
| `XRPL_ENDPOINT` | WebSocket URL — `wss://s.altnet.rippletest.net:51233` for testnet |
| `XRPL_TREASURY_SEED` | Treasury (hot) wallet seed — holds trust line, receives HYD |
| `HYDROCOIN_ISSUER_SEED` | Issuer (cold) wallet seed — creates HYD IOU supply |
| `HYDROCOIN_ISSUER` | Issuer wallet address |
| `HYDROCOIN_CURRENCY` | 3-char currency code — `HYD` |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | WalletConnect project ID from [cloud.reown.com](https://cloud.reown.com) |

**Never commit `.env.local`** — it is gitignored.

---

## PR checklist

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm run lint` passes
- [ ] New env vars documented in `README.md` and `.env.local.example`
- [ ] XRPL transactions verified on testnet explorer before merging
- [ ] No seeds or private keys in any committed file

---

## Contact

Built at Consensus Miami 2026 · EasyA Hackathon  
Reach out via GitHub issues or the x402 Discord.
