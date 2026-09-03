"use client";

import "@rainbow-me/rainbowkit/styles.css";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const WalletProvider = dynamic(
  () => import("@/components/WalletProvider").then((m) => m.WalletProvider),
  { ssr: false }
);

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
