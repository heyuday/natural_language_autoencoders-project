import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: v("page"),
        surface: v("surface"),
        sunken: v("sunken"),
        ink: v("ink"),
        ink2: v("ink-2"),
        muted: v("muted"),
        grid: v("grid"),
        axis: v("axis"),
        edge: v("border"),
        s1: v("s1"),
        s2: v("s2"),
        s3: v("s3"),
        s4: v("s4"),
        nul: v("null"),
        warn: v("warn"),
        btn: v("btn"),
        lnk: v("link"),
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      maxWidth: { prose: "42rem", wide: "60rem" },
    },
  },
  plugins: [],
};
export default config;
