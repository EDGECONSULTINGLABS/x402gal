import { DM_Mono, DM_Sans } from "next/font/google";
import "./tokens.css";

/** One family, two roles. DM Sans / DM Mono — the pair hydrocoin.com loads. */
const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-match-sans",
  display: "swap",
});

const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-match-mono",
  display: "swap",
});

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${mono.variable} match-root`}>{children}</div>;
}
