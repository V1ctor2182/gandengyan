import type { Config } from "tailwindcss";

// 颜色全部指向 globals.css 里的 CSS 变量；深色模式靠变量在 media 里切换，
// 所以 bg-surface / text-ink 等会自动适配明暗，无需 dark: 变体。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-wash": "var(--accent-wash)",
        brick: "var(--brick)",
        "brick-wash": "var(--brick-wash)",
        "on-accent": "var(--on-accent)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
      },
      borderRadius: { s: "18px", c: "11px" },
      fontFamily: {
        sans: ["var(--sans)"],
        mono: ["var(--mono)"],
      },
      boxShadow: {
        card: "var(--shadow)",
        sheet: "var(--sheet-sh)",
      },
    },
  },
  plugins: [],
};
export default config;
