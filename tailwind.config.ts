import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#04070d",
        panel: "#0a1018",
        edge: "#142033",
        cyan: { 350: "#22d3ee" },
        hydro: {
          50: "#e6fbff",
          100: "#bff3ff",
          300: "#5fe1ff",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(34,211,238,0.45)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(34,211,238,0.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
