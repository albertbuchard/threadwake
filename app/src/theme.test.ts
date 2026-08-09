import { describe, expect, it } from "vitest";

import {
  CODEX_TEMPORAL_GRAPH_PALETTE,
  THEME_STORAGE_KEY,
  isThemePreference,
  readThemePreference,
  resolveTheme,
  themeColorScheme,
  themeUrl,
} from "./theme";

describe("theme contract", () => {
  it("uses the versioned storage key and accepts only the three governed choices", () => {
    expect(THEME_STORAGE_KEY).toBe("threadwake.theme.v1");
    expect(["system", "deep-orbit", "codex"].map(isThemePreference)).toEqual([
      true,
      true,
      true,
    ]);
    expect(isThemePreference("light")).toBe(false);
  });

  it("resolves URL, storage, and fallback in the governed order", () => {
    expect(readThemePreference("?theme=codex", "deep-orbit")).toBe("codex");
    expect(readThemePreference("?theme=invalid", "deep-orbit")).toBe("deep-orbit");
    expect(readThemePreference("?theme=invalid", "invalid")).toBe("system");
  });

  it("maps System to Deep Orbit for dark and Codex for light or no-preference", () => {
    expect(resolveTheme("system", true)).toBe("deep-orbit");
    expect(resolveTheme("system", false)).toBe("codex");
    expect(resolveTheme("codex", true)).toBe("codex");
    expect(themeColorScheme("codex")).toBe("light");
  });

  it("changes only the theme query parameter", () => {
    const source = new URL("https://example.test/?view=kanban&selected=node-1");
    const next = themeUrl(source, "codex");
    expect(next.searchParams.get("theme")).toBe("codex");
    expect(next.searchParams.get("view")).toBe("kanban");
    expect(next.searchParams.get("selected")).toBe("node-1");
  });

  it("provides a complete restrained light-canvas palette", () => {
    expect(CODEX_TEMPORAL_GRAPH_PALETTE.background).toBe(0xf2f2f0);
    expect(CODEX_TEMPORAL_GRAPH_PALETTE.selection).toBe(0x245f88);
    expect(CODEX_TEMPORAL_GRAPH_PALETTE.groupColors).toHaveLength(5);
  });
});
