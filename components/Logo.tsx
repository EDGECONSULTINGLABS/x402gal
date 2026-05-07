export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="drop">
      <defs>
        <linearGradient id="mlg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#bff3ff" />
          <stop offset="40%" stopColor="#5fe1ff" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <radialGradient id="mlg2" cx="0.3" cy="0.25" r="0.6">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M32 4C20 22 10 32 10 42a22 22 0 0 0 44 0c0-10-10-20-22-38Z"
        fill="url(#mlg)"
      />
      <path
        d="M32 4C20 22 10 32 10 42a22 22 0 0 0 44 0c0-10-10-20-22-38Z"
        fill="url(#mlg2)"
        opacity="0.7"
      />
      <circle cx="40" cy="34" r="3.2" fill="#ffffff" opacity="0.85" />
      <circle cx="22" cy="48" r="1.6" fill="#bff3ff" opacity="0.6" />
    </svg>
  );
}
