/**
 * Single source of truth for colours and shared style values.
 *
 * Screens import from here so the whole app re-themes in one place. The
 * palette is built around a dark indigo base with an orange accent: it reads
 * as "energetic game" rather than "casino", which matters because the store
 * review guidelines treat gambling-like styling harshly.
 */

export const brand = {
  bg: "#0f0a2e",
  bgAlt: "#1a1147",
  surface: "#241a5c",
  surfaceAlt: "#2f2270",
  border: "#3d2d8a",
  accent: "#f97316",
  accentDark: "#c2410c",
  accentSoft: "#3d2416",
  gold: "#fbbf24",
  goldDark: "#b45309",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#38bdf8",
  purple: "#a855f7",
  white: "#ffffff",
  muted: "#9d93d6",
  mutedDark: "#6b5fa8",
  text: "#f8f7ff",
  textDim: "#c9c2ee",
};

/** Per-category accents, used to tint game cards. */
export const categories = {
  fast: { from: "#f97316", to: "#ef4444", label: "Speed" },
  india: { from: "#f59e0b", to: "#d97706", label: "India" },
  memory: { from: "#8b5cf6", to: "#a855f7", label: "Memory" },
  word: { from: "#06b6d4", to: "#3b82f6", label: "Words" },
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};