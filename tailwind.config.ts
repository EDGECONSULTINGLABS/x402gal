import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#000409",
        ink: "#02060d",
        panel: "#070d18",
        edge: "#16263d",
        cyan: { 350: "#22d3ee" },
        hydro: {
          50: "#e6fbff",
          100: "#bff3ff",
          200: "#8eecff",
          300: "#5fe1ff",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#0a2a36",
        },
        gallon: {
          400: "#7dd3fc",
          500: "#38bdf8",
          600: "#0284c7",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(34,211,238,0.55)",
        "glow-lg": "0 0 90px -12px rgba(34,211,238,0.55)",
        "glow-inset": "inset 0 1px 0 rgba(95,225,255,0.18), 0 0 24px -8px rgba(34,211,238,0.35)",
        deep: "0 30px 80px -20px rgba(0,0,0,0.9)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(34,211,238,0.18), transparent 60%)",
        "aurora":
          "radial-gradient(60% 80% at 20% 0%, rgba(34,211,238,0.22), transparent 60%), radial-gradient(50% 60% to 100% 100%, rgba(8,145,178,0.18), transparent 60%)",
        "hydro-gradient":
          "linear-gradient(135deg,#5fe1ff 0%,#22d3ee 35%,#0891b2 100%)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.6" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "border-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        drift: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        bubble: {
          "0%": { transform: "translateY(0) scale(0.8)", opacity: "0" },
          "10%": { opacity: "0.6" },
          "100%": { transform: "translateY(-120vh) scale(1.1)", opacity: "0" },
        },
        "sheen": {
          "0%": { backgroundPosition: "-150% 0" },
          "100%": { backgroundPosition: "250% 0" },
        },
      },
      animation: {
        float: "float 5s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "border-flow": "border-flow 8s linear infinite",
        drift: "drift 22s linear infinite",
        bubble: "bubble 14s linear infinite",
        sheen: "sheen 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
