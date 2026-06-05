import { readFileSync } from "fs";
import { join } from "path";
import type { Metadata } from "next";
import { URL } from "url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://x402gal.com"),
  title: "INFILTRATE · x402GAL @ ETHConf",
  description: "Become a field agent. Pay water back. Claim your Genesis badge.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://x402gal.com/infiltrateETHConf2026",
    siteName: "x402GAL",
    title: "INFILTRATE · x402GAL @ ETHConf",
    description: "Become a field agent. Pay water back. Claim your Genesis badge.",
    images: [{
      url: "/og-image",
      width: 1200,
      height: 630,
      alt: "INFILTRATE · x402GAL @ ETHConf",
    }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@x402gal",
    creator: "@x402gal",
    title: "INFILTRATE · x402GAL @ ETHConf",
    description: "Become a field agent. Pay water back. Claim your Genesis badge.",
    images: ["/og-image"],
  },
  icons: {
    icon: "/infiltrate-favicon.png",
  },
  themeColor: "#000814",
};

export default function InfiltrateETHConf2026() {
  const htmlPath = join(process.cwd(), "public", "infiltrateETHConf2026.html");
  const html = readFileSync(htmlPath, "utf-8");
  
  // Extract just the body content to avoid nested HTML issues
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;
  
  return (
    <div 
      dangerouslySetInnerHTML={{ __html: bodyContent }}
      style={{ 
        backgroundColor: "#000814",
        minHeight: "100vh",
        color: "#B8D4E8",
      }}
    />
  );
}
