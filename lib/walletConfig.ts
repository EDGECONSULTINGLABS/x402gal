// RainbowKit + wagmi configuration for EVM chains.
// Solana and XRPL agents use simulated wallets in AgentSessionPanel.
// Supports injected wallets (MetaMask in-app, Coinbase, Trust, etc.)

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
  trustWallet,
  walletConnectWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { base, mainnet, polygon, avalanche } from "wagmi/chains";

export const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "x402gal_placeholder";

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

export const wagmiConfig = createConfig({
  connectors,
  chains: [base, mainnet, polygon, avalanche],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [avalanche.id]: http(),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});
