/**
 * x402GAL mark. Same drawing and colors as the Summit lockup (components/match/Lockup.tsx):
 * flat HydroCoin sky blue (#38bdf8, --hc-sky-2) with the Avalanche-red dot. No gradient, no glow.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5c3.2 4.3 7 8.2 7 12.3A7 7 0 0 1 5 14.8C5 10.7 8.8 6.8 12 2.5z" fill="#38bdf8" />
      <circle cx="15.2" cy="16.4" r="2.2" fill="#e84142" />
    </svg>
  );
}
