// RainbowKit + wagmi configuration for EVM chains.
// Solana and XRPL agents use simulated wallets in AgentSessionPanel.

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet, polygon, avalanche } from "wagmi/chains";

export const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "demo_placeholder_replace_me";

export const wagmiConfig = getDefaultConfig({
  appName: "x402GAL",
  projectId,
  chains: [base, mainnet, polygon, avalanche],
  ssr: false,
});
