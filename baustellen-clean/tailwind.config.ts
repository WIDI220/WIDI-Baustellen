import type { Config } from "tailwindcss";
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        widi: { DEFAULT: '#1e3a5f', light: '#2a4f7a', dark: '#162d4a' },
      },
      fontFamily: { sans: ['Segoe UI','Arial','sans-serif'] },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
