"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectButton() {
  return (
    <RKConnectButton
      label="Connect Wallet"
      accountStatus="avatar"
      chainStatus="icon"
      showBalance={false}
    />
  );
}
