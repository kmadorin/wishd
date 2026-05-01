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
        lg: "var(--r-lg)",
        pill: "var(--r-pill)",
      },
    },
  },
  plugins: [],
};

export default config;
