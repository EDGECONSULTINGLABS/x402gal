import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meraxis — Water-offset rails for AI agents",
  description:
    "Meraxis is an x402-native water sustainability layer. AI agents pay per inference in HydroCoin, settled cross-chain through Wire's Universal Transaction Layer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-display antialiased">{children}</body>
    </html>
  );
}
