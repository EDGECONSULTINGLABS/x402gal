"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ReactNode, useEffect } from "react";
import { wagmiConfig } from "@/lib/walletConfig";

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

const WC_NOISE = [
  "Connection interrupted while trying to subscribe",
  "WebSocket connection failed",
  "socket hang up",
  "WalletConnect",
];

function isWcNoise(msg: string) {
  return WC_NOISE.some((s) => msg.includes(s));
}

function WcErrorSuppressor() {
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      if (e.reason?.message && isWcNoise(e.reason.message)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (e.message && isWcNoise(e.message)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#22d3ee",
            accentColorForeground: "#0a0f1a",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <WcErrorSuppressor />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
