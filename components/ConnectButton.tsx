"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

export function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                type="button"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-hydro-400/50 bg-hydro-500/15 px-4 py-2.5 text-sm font-semibold text-hydro-200 shadow-glow transition active:scale-95 hover:bg-hydro-500/25 hover:border-hydro-300"
              >
                <Wallet size={16} />
                <span>Connect Wallet</span>
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                type="button"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/20"
              >
                Wrong network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={openChainModal}
                  type="button"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-edge bg-panel/60 px-2.5 py-1.5 text-xs text-slate-300 transition active:scale-95 hover:border-hydro-500/30 hover:text-white"
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      alt={chain.name ?? "chain"}
                      src={chain.iconUrl}
                      className="h-4 w-4 rounded-full"
                    />
                  )}
                  <span className="hidden sm:inline">{chain.name}</span>
                </button>
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-hydro-400/30 bg-hydro-500/10 px-3 py-1.5 text-xs font-medium text-hydro-200 transition active:scale-95 hover:bg-hydro-500/20"
                >
                  {account.displayName}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
