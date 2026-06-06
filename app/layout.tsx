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
  title: "x402GAL — Every AI query has a water footprint",
  description:
    "Pay it back in real time. x402GAL settles water offsets on XRPL for every inference.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  metadataBase: new URL("https://x402gal.com"),
  openGraph: {
    title: "x402GAL — Every AI query has a water footprint",
    description: "Pay it back in real time. x402GAL settles water offsets on XRPL for every inference.",
    type: "website",
    url: "https://x402gal.com",
    siteName: "x402GAL",
    images: [
      {
        url: "https://x402gal.com/og-fallback.jpg",
        width: 1200,
        height: 630,
        alt: "x402GAL - Water for the age of AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "x402GAL — Every AI query has a water footprint",
    description: "Pay it back in real time. x402GAL settles water offsets on XRPL for every inference.",
    images: ["https://x402gal.com/og-fallback.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0a1628" />
        <meta name="msapplication-TileColor" content="#0a1628" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="canonical" href="https://x402gal.com" />
        <link rel="alternate" href="https://www.x402gal.com" />
        <meta property="og:image:secure_url" content="https://x402gal.com/og-fallback.jpg" />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="x402GAL - Every AI query has a water footprint" />
        <meta name="twitter:image:src" content="https://x402gal.com/og-fallback.jpg" />
      </head>
      <body className="font-body antialiased selection:bg-hydro-500/40 selection:text-white">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
