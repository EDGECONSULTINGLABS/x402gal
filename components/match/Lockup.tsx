import Link from "next/link";

/**
 * x402GAL lockup: the water-drop mark on HydroCoin's gradient chrome.
 * Avalanche red appears here and nowhere else in the UI.
 * Links home (the Summit landing) unless `href` is null.
 */
export function Lockup({
  size = 18,
  className = "",
  href = "/",
}: {
  size?: number;
  className?: string;
  href?: string | null;
}) {
  const inner = (
    <>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.5c3.2 4.3 7 8.2 7 12.3A7 7 0 0 1 5 14.8C5 10.7 8.8 6.8 12 2.5z"
          fill="var(--hc-sky-2)"
        />
        <circle cx="15.2" cy="16.4" r="2.2" fill="var(--avalanche-red)" />
      </svg>
      <span className="text-[13px] font-semibold tracking-normal" style={{ color: "var(--hc-text-heading)" }}>
        x402GAL
      </span>
    </>
  );
  const cls = `inline-flex items-center gap-1.5 ${className}`;
  if (!href) return <span className={cls} aria-label="x402GAL">{inner}</span>;
  return (
    <Link href={href} className={cls} aria-label="x402GAL home" title="x402GAL home">
      {inner}
    </Link>
  );
}
