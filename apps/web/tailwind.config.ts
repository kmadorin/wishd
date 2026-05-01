import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../plugins/**/widgets/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        mint: "var(--mint)",
        "mint-2": "var(--mint-2)",
        pink: "var(--pink)",
        warn: "var(--warn)",
        "warn-2": "var(--warn-2)",
        good: "var(--good)",
        bad: "var(--bad)",
        rule: "var(--rule)",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        hand: ["Caveat", "cursive"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        DEFAULT: "var(--r)",
        md: "14px",
        lg: "var(--r-lg)",   // 20
        xl: "18px",          // widget card
        "2xl": "22px",       // step card
        pill: "var(--r-pill)",
      },
      boxShadow: {
        card: "4px 4px 0 var(--ink)",
        cardSm: "3px 3px 0 var(--ink)",
        cardLg: "6px 6px 0 var(--ink)",
        pill: "2px 2px 0 var(--ink)",
      },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        blink:  { "0%,80%,100%": { opacity: "0.2" }, "40%": { opacity: "1" } },
        pulse:  { "0%,100%": { boxShadow: "0 0 0 0 rgba(232,154,107,0.4)" }, "50%": { boxShadow: "0 0 0 5px rgba(232,154,107,0)" } },
        spin:   { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        fadeUp: "fadeUp 0.25s ease forwards",
        blink:  "blink 1.2s ease-in-out infinite",
        pulse:  "pulse 1.4s ease infinite",
        spin:   "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
