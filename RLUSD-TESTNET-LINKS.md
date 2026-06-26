# RLUSD on XRPL — Testnet Verification Links

Reference for the RLUSD acceptance test run on the 402GAL facilitator (XRPL Testnet).
All transactions are real on-chain testnet activity (`simulated: false`). No real-world value.

Explorer: [testnet.xrpscan.com](https://testnet.xrpscan.com)

---

## End-to-end RLUSD settlement (round-trip PASS)

A real signed RLUSD `Payment` accepted by the facilitator, settled, then swapped + retired.

| Leg | What it proves | Tx hash | Explorer |
| --- | --- | --- | --- |
| **1. Payment (RLUSD)** | Buyer paid 1.0 RLUSD to the treasury | `E222720CFE48A2C690C5B20B06353D8C8E73E256CE7D4108806F97F1DC9E8BD2` | [view](https://testnet.xrpscan.com/tx/E222720CFE48A2C690C5B20B06353D8C8E73E256CE7D4108806F97F1DC9E8BD2) |
| **2. Swap (AMM)** | Treasury RLUSD reserve swapped for HYDRO | `BC2EA4093F8544D9AB96CB40BC123129733B62105F8077D0CC5A5DC59B74954F` | [view](https://testnet.xrpscan.com/tx/BC2EA4093F8544D9AB96CB40BC123129733B62105F8077D0CC5A5DC59B74954F) |
| **3. Retirement (burn)** | HYDRO returned to issuer = water credit retired | `9549352BB71AF062A7F916EFC2234F86DECA2D6C12C7A07A705B8B45C399A59F` | [view](https://testnet.xrpscan.com/tx/9549352BB71AF062A7F916EFC2234F86DECA2D6C12C7A07A705B8B45C399A59F) |

**InvoiceID (binds the payment to the settlement):**
`420E3BE9F6462188FB666E975F12C2A837D4556319B5ACE2905091EF1F6E0D3A`

---

## Setup transactions

| Action | Tx hash | Explorer |
| --- | --- | --- |
| **Treasury RLUSD trust line created** | `BC945524184A5D31D8195D11878DCA33DC2457A1A86FC3CD28105780F1CBBBA1` | [view](https://testnet.xrpscan.com/tx/BC945524184A5D31D8195D11878DCA33DC2457A1A86FC3CD28105780F1CBBBA1) |

---

## Accounts

| Role | Address | Explorer |
| --- | --- | --- |
| **Treasury (Destination)** | `racKPugSG4zH8qZczvcP2p3f1P9NRfLSjf` | [view](https://testnet.xrpscan.com/account/racKPugSG4zH8qZczvcP2p3f1P9NRfLSjf) |
| **Test buyer (disposable)** | `r39FZyYS5NdAVjJuGy6CGnUVUvGdwgz2Gu` | [view](https://testnet.xrpscan.com/account/r39FZyYS5NdAVjJuGy6CGnUVUvGdwgz2Gu) |
| **RLUSD issuer (Testnet)** | `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` | [view](https://testnet.xrpscan.com/account/rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV) |

---

## RLUSD asset details (Testnet)

| Field | Value |
| --- | --- |
| **Currency (hex)** | `524C555344000000000000000000000000000000` |
| **Currency (symbol)** | RLUSD |
| **Issuer** | `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` |
| **Testnet RLUSD faucet** | https://tryrlusd.com/ |
| **Ripple docs** | https://docs.ripple.com/products/stablecoin/developer-resources/rlusd-on-the-xrpl |

---

## How to reproduce

```bash
# 1. Establish treasury trust lines (USDC + RLUSD), reads seed from .env.local
npx tsx scripts/setup-treasury-trustline.ts

# 2. Create/fund a buyer wallet and check RLUSD balance (fund via tryrlusd.com if 0)
npx tsx scripts/test-rlusd-buyer.ts <TREASURY_XRPL_ADDRESS> 1000000

# 3. Sign a real RLUSD Payment and round-trip it through the facilitator
npx tsx scripts/test-rlusd-buyer.ts --roundtrip <TREASURY_XRPL_ADDRESS> 1000000
```

A `[PASS]` with a `paymentTxHash` confirms the facilitator accepted RLUSD,
settled it on XRPL, and ran the HYDRO swap + retire hops.
