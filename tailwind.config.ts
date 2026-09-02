import type { Config } from "tailwindcss";

// ---------------------------------------------------------------------------
// Design system: mostly white, black accents, one volt highlight.
//
//   paper / canvas   surfaces           white → warm off-white
//   ink              text + black UI    near-black, never pure #000
//   volt             the action color   used for selection, focus, primary fills
//   ok / warn / danger  status only     contracted, due-soon, overdue
//
// Rule of thumb: volt is the *only* saturated colour allowed for decoration.
// Everything else earns its colour by meaning status or urgency.
// ---------------------------------------------------------------------------

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        canvas: "#FAFAF9",
        sunken: "#F4F4F2",
        ink: {
          DEFAULT: "#0B0B0C",
          soft: "#3F3F46",
          muted: "#71717A",
          faint: "#A1A1AA",
        },
        line: {
          DEFAULT: "#E9E8E5",
          strong: "#D8D6D2",
          faint: "#F1F0EE",
        },
        volt: {
          DEFAULT: "#C8F235",
          hover: "#B7E11F",
          deep: "#5C7A00",
          tint: "#F3FCDA",
        },
        ok: { DEFAULT: "#0E7C57", tint: "#E7F4EF", ink: "#0A5B40" },
        warn: { DEFAULT: "#B45309", tint: "#FBF1DF", ink: "#8A3F06" },
        danger: { DEFAULT: "#C0272D", tint: "#FBEAEA", ink: "#96181D" },
        info: { DEFAULT: "#3457D5", tint: "#ECF0FE", ink: "#2440A8" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,11,12,0.04), 0 1px 1px rgba(11,11,12,0.03)",
        raised:
          "0 1px 2px rgba(11,11,12,0.05), 0 4px 12px -4px rgba(11,11,12,0.08)",
        pop: "0 16px 40px -12px rgba(11,11,12,0.20), 0 2px 8px -2px rgba(11,11,12,0.08)",
        panel: "-32px 0 72px -24px rgba(11,11,12,0.28)",
        voltring: "0 0 0 3px rgba(200,242,53,0.45)",
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px", letterSpacing: "0.02em" }],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "pop-in": {
          from: { transform: "translateY(6px) scale(0.98)", opacity: "0" },
          to: { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "check-pop": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "toast-in": {
          from: { transform: "translateY(12px) scale(0.97)", opacity: "0" },
          to: { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "bar-grow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
        "slide-in-right": "slide-in-right 0.22s cubic-bezier(0.32,0.72,0,1) both",
        "pop-in": "pop-in 0.16s cubic-bezier(0.32,0.72,0,1) both",
        "check-pop": "check-pop 0.32s cubic-bezier(0.34,1.56,0.64,1) both",
        "toast-in": "toast-in 0.22s cubic-bezier(0.32,0.72,0,1) both",
        "bar-grow": "bar-grow 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
