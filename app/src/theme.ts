import type { TemporalGraphPaletteOverride } from "./components/TemporalGraphCanvas";

export const THEME_STORAGE_KEY = "threadwake.theme.v1";

export const THEME_PREFERENCES = ["system", "deep-orbit", "codex"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  "deep-orbit": "Deep Orbit",
  codex: "Codex",
};

export const CODEX_TEMPORAL_GRAPH_PALETTE: Readonly<TemporalGraphPaletteOverride> = {
  background: 0xf2f2f0,
  field: 0xe2e3e1,
  innerField: 0xfafaf9,
  ring: 0xaeb3b9,
  ringText: 0x4e555d,
  relation: 0x737b84,
  relationEmphasis: 0x315f82,
  primary: 0x315f82,
  selectedLabel: 0x171a1e,
  decision: 0x3f6f92,
  failed: 0x944743,
  planned: 0x426746,
  blocked: 0x805913,
  ink: 0xfafaf9,
  selection: 0x245f88,
  mutedText: 0x363d44,
  groupColors: [0x274d69, 0x4b3f60, 0x30553e, 0x67452f, 0x3d5367],
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string"
    && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readThemePreference(search: string, storedValue: string | null): ThemePreference {
  const fromUrl = new URLSearchParams(search).get("theme");
  if (isThemePreference(fromUrl)) return fromUrl;
  if (isThemePreference(storedValue)) return storedValue;
  return "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference !== "system") return preference;
  return systemPrefersDark ? "deep-orbit" : "codex";
}

export function themeUrl(url: URL, preference: ThemePreference): URL {
  const next = new URL(url);
  next.searchParams.set("theme", preference);
  return next;
}

export function themeColorScheme(theme: ResolvedTheme): "dark" | "light" {
  return theme === "deep-orbit" ? "dark" : "light";
}
