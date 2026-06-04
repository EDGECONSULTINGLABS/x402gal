import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import dynamic from "next/dynamic";
const WalletProvider = dynamic(
  () => import("@/components/WalletProvider").then((m) => m.WalletProvider),
  { ssr: false }
);

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "x402GAL — Water-offset rails for AI agents",
  description:
    "x402GAL is an x402-native water sustainability layer. AI agents pay per inference in HydroCoin, settled cross-chain through Wire's Universal Transaction Layer.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "x402GAL — Water-offset rails for AI agents",
    description: "x402GAL is an x402-native water sustainability layer. AI agents pay per inference in HydroCoin, settled cross-chain through Wire's Universal Transaction Layer.",
    type: "website",
    url: "https://xx402gal.vercel.app",
    siteName: "x402GAL",
    images: [
      {
        url: "https://xx402gal.vercel.app/og-image",
        width: 1200,
        height: 630,
        alt: "x402GAL - Water-offset rails for AI agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "x402GAL — Water-offset rails for AI agents",
    description: "x402GAL is an x402-native water sustainability layer. AI agents pay per inference in HydroCoin, settled cross-chain through Wire's Universal Transaction Layer.",
    images: ["https://xx402gal.vercel.app/og-image"],
  },
  metadataBase: new URL("https://xx402gal.vercel.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body antialiased selection:bg-hydro-500/40 selection:text-white">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
