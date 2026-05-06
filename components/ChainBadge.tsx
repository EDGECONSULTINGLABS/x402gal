import { Chain } from "@/lib/types";

const colors: Record<Chain, string> = {
  "wire-utl": "bg-hydro-500/15 text-hydro-300 border-hydro-500/30",
  base: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  solana: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  ethereum: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  polygon: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

const labels: Record<Chain, string> = {
  "wire-utl": "Wire UTL",
  base: "Base",
  solana: "Solana",
  ethereum: "Ethereum",
  polygon: "Polygon",
};

export function ChainBadge({ chain }: { chain: Chain }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-[2px] text-[10px] font-medium uppercase tracking-wider ${colors[chain]}`}
    >
      {labels[chain]}
    </span>
  );
}
