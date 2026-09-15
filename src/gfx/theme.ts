export type ThemeName = "aurora" | "amber" | "matrix" | "magenta" | "mono";

export type Theme = {
  name: ThemeName;
  /** Cool/base colour of slow particles, linear-ish RGB 0..1 */
  colorA: [number, number, number];
  /** Hot colour of fast particles */
  colorB: [number, number, number];
  /** CSS accent applied to the document */
  css: { accent: string; accent2: string };
  label: string;
};

export const THEMES: Record<ThemeName, Theme> = {
  aurora: {
    name: "aurora",
    colorA: [0.09, 0.42, 0.95],
    colorB: [0.35, 0.92, 1.0],
    css: { accent: "#36d0ff", accent2: "#7c5cff" },
    label: "aurora — electric blue / cyan",
  },
  amber: {
    name: "amber",
    colorA: [0.85, 0.28, 0.03],
    colorB: [1.0, 0.82, 0.32],
    css: { accent: "#ffb224", accent2: "#ff6b2c" },
    label: "amber — classic phosphor",
  },
  matrix: {
    name: "matrix",
    colorA: [0.02, 0.5, 0.18],
    colorB: [0.45, 1.0, 0.55],
    css: { accent: "#4ade80", accent2: "#16a34a" },
    label: "matrix — green CRT",
  },
  magenta: {
    name: "magenta",
    colorA: [0.62, 0.06, 0.62],
    colorB: [1.0, 0.42, 0.85],
    css: { accent: "#ff6ad5", accent2: "#a855f7" },
    label: "magenta — synthwave",
  },
  mono: {
    name: "mono",
    colorA: [0.3, 0.32, 0.36],
    colorB: [1.0, 1.0, 1.0],
    css: { accent: "#ededed", accent2: "#a1a1a1" },
    label: "mono — pure white light",
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export function applyThemeToCss(theme: Theme) {
  const root = document.documentElement;
  const { accent, accent2 } = theme.css;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-2", accent2);
  root.style.setProperty("--accent-soft", hexToRgba(accent, 0.14));
  root.style.setProperty("--accent-line", hexToRgba(accent, 0.35));
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
