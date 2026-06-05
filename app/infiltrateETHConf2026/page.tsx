import { readFileSync } from "fs";
import { join } from "path";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "INFILTRATE · x402GAL @ ETHConf",
  description: "Become a field agent. Pay water back. Claim your Genesis badge.",
  openGraph: {
    type: "website",
    url: "https://x402gal.com/infiltrateETHConf2026",
    title: "INFILTRATE · x402GAL @ ETHConf",
    description: "Become a field agent. Pay water back. Claim your Genesis badge.",
    images: [{
      url: "https://x402gal.com/og-image",
      width: 1200,
      height: 630,
      alt: "INFILTRATE · x402GAL @ ETHConf",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "INFILTRATE · x402GAL @ ETHConf",
    description: "Become a field agent. Pay water back. Claim your Genesis badge.",
    images: ["https://x402gal.com/og-image"],
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
