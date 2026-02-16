import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        surface: {
          50: "#f4f6fa",
          100: "#eef1f6",
          200: "#e2e8f0",
        },
        sidebar: {
          DEFAULT: "#0a0f1e",
          hover: "#111827",
          active: "#1a2540",
          border: "rgba(148, 163, 184, 0.06)",
        },
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        "card": "var(--card-shadow)",
        "card-hover": "var(--card-shadow-hover)",
        "card-lg": "var(--card-shadow-lg)",
        "glow": "0 0 20px rgba(99, 102, 241, 0.15)",
        "glow-sm": "0 0 10px rgba(99, 102, 241, 0.1)",
        "inner-light": "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "float-in": "float-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-down": "slide-down 0.35s ease-out forwards",
        "slide-up": "slide-up 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
        "gentle-pulse": "gentle-pulse 2s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite",
        "glow-ring": "glow-ring 2s ease-in-out infinite",
        "count-up": "count-up 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config;
