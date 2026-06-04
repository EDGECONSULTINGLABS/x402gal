// RainbowKit + wagmi configuration for EVM chains.
// Solana and XRPL agents use simulated wallets in AgentSessionPanel.
// Supports injected wallets (MetaMask in-app, Coinbase, Trust, etc.)
// NOTE: config is created lazily (browser-only) to avoid indexedDB SSR errors.

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
  trustWallet,
  walletConnectWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, mainnet, polygon, avalanche } from "wagmi/chains";
import type { Config } from "wagmi";

export const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "x402gal_placeholder";

let _wagmiConfig: Config | null = null;

export function getWagmiConfig(): Config {
  if (_wagmiConfig) return _wagmiConfig;

  const connectors = connectorsForWallets(
    [
      {
        groupName: "Popular",
        wallets: [metaMaskWallet, coinbaseWallet, trustWallet, rainbowWallet, walletConnectWallet, injectedWallet],
      },
    ],
    {
      appName: "x402GAL",
      projectId,
    }
  );

  _wagmiConfig = createConfig({
    connectors,
    chains: [base, mainnet, polygon, avalanche],
    transports: {
      [base.id]: http(),
      [mainnet.id]: http(),
      [polygon.id]: http(),
      [avalanche.id]: http(),
    },
    ssr: false,
  });

  return _wagmiConfig;
}

export const wagmiConfig = typeof window !== "undefined" ? getWagmiConfig() : null as unknown as Config;
