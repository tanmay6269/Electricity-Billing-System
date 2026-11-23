/** Design tokens for the Electricity Billing Management System. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#07152A", 800: "#0B1F3A", 700: "#132B4D", 600: "#1C3A63" },
        brand: { 50: "#EFF5FF", 100: "#DBE7FE", 200: "#BFD4FE", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8" },
        accent: { 400: "#38BDF8", 500: "#0EA5E9" },
        page: "#F5F7FA",
        line: "#E2E8F0",
        ink: { DEFAULT: "#0F172A", soft: "#334155", muted: "#64748B", faint: "#94A3B8" },
        ok: { 50: "#F0FDF4", 600: "#16A34A", 700: "#15803D" },
        warn: { 50: "#FFF7ED", 600: "#EA580C", 700: "#C2410C" },
        bad: { 50: "#FEF2F2", 600: "#DC2626", 700: "#B91C1C" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"] },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
        pop: "0 10px 30px -10px rgba(15,23,42,0.25)",
      },
      borderRadius: { xl: "12px" },
    },
  },
  plugins: [],
};
