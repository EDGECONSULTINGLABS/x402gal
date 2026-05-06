export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="drop">
      <defs>
        <linearGradient id="mlg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#5fe1ff" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <path
        d="M32 4C20 22 10 32 10 42a22 22 0 0 0 44 0c0-10-10-20-22-38Z"
        fill="url(#mlg)"
        opacity="0.95"
      />
      <path
        d="M32 18c-7 11-13 17-13 23a13 13 0 0 0 26 0c0-6-6-12-13-23Z"
        fill="#04070d"
        opacity="0.55"
      />
      <circle cx="38" cy="36" r="3" fill="#bff3ff" opacity="0.9" />
    </svg>
  );
}
