import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-match-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-match-mono",
  display: "swap",
});

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${mono.variable} match-root`}>{children}</div>;
}
