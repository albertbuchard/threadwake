import { useEffect, useRef } from "react";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  Graph,
  Kanban,
  MagnifyingGlass,
  Palette,
  Planet,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import type { LayerVisibility, ViewMode } from "../domain";
import { THEME_LABELS, THEME_PREFERENCES, type ResolvedTheme, type ThemePreference } from "../theme";
import type { RelationLayer } from "./ui-types";

export interface TopBarProps {
  projectLabel: string;
  searchQuery: string;
  searchResultCount?: number;
  view: ViewMode;
  layers: LayerVisibility;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  canUndo?: boolean;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  onViewChange: (view: ViewMode) => void;
  onToggleLayer: (layer: RelationLayer) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onUndo?: () => void;
  onReset: () => void;
}

const LAYERS: Array<{
  id: RelationLayer;
  label: string;
  description: string;
}> = [
  {
    id: "depends-on",
    label: "Dependencies",
    description: "Required ordering and blocked work",
  },
  {
    id: "same-source-thread",
    label: "Same source thread",
    description: "Work that happened in the same chat",
  },
  {
    id: "related-to",
    label: "Related work",
    description: "Useful context without direct lineage",
  },
];

export function TopBar({
  projectLabel,
  searchQuery,
  searchResultCount,
  view,
  layers,
  themePreference,
  resolvedTheme,
  canUndo = false,
  onSearchChange,
  onSearchSubmit,
  onViewChange,
  onToggleLayer,
  onThemeChange,
  onUndo,
  onReset,
}: TopBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const enabledLayerCount = LAYERS.filter((layer) => layers[layer.id]).length;

  return (
    <header className="top-bar">
      <a className="brand-lockup" href="#workbench" aria-label="Threadwake workbench">
        <span className="brand-mark">
          <Planet aria-hidden="true" size={23} weight="duotone" />
        </span>
        <span>
          <strong>Threadwake</strong>
          <small>{projectLabel}</small>
        </span>
      </a>

      <form
        className="global-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit?.(searchQuery.trim());
        }}
      >
        <MagnifyingGlass aria-hidden="true" size={18} />
        <label className="visually-hidden" htmlFor="threadwake-search">
          Search work, failures, artifacts, and unresolved questions
        </label>
        <input
          ref={searchRef}
          id="threadwake-search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSearchSubmit?.(event.currentTarget.value.trim());
          }}
          placeholder="Search work, failures, artifacts…"
          autoComplete="off"
        />
        {searchQuery ? (
          <span className="search-feedback" aria-live="polite">
            {typeof searchResultCount === "number"
              ? `${searchResultCount} ${searchResultCount === 1 ? "match" : "matches"}`
              : null}
            <button
              className="icon-button icon-button--small"
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
            >
              <X aria-hidden="true" size={15} />
            </button>
          </span>
        ) : (
          <kbd aria-label="Keyboard shortcut Command or Control K">Ctrl K</kbd>
        )}
      </form>

      <nav className="top-bar-actions" aria-label="Workbench controls">
        <div className="view-switch" aria-label="Choose a work view" role="group">
          <button
            type="button"
            aria-label="Graph"
            className={view === "graph" ? "is-active" : undefined}
            aria-pressed={view === "graph"}
            onClick={() => onViewChange("graph")}
          >
            <Graph aria-hidden="true" size={17} />
            <span>Graph</span>
          </button>
          <button
            type="button"
            aria-label="Kanban"
            className={view === "kanban" ? "is-active" : undefined}
            aria-pressed={view === "kanban"}
            onClick={() => onViewChange("kanban")}
          >
            <Kanban aria-hidden="true" size={17} />
            <span>Kanban</span>
          </button>
        </div>

        <label className="theme-picker" htmlFor="threadwake-theme">
          <Palette aria-hidden="true" size={17} />
          <span className="visually-hidden">Theme</span>
          <select
            id="threadwake-theme"
            aria-label="Theme"
            aria-describedby="threadwake-theme-resolution"
            value={themePreference}
            onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
          >
            {THEME_PREFERENCES.map((theme) => (
              <option key={theme} value={theme}>{THEME_LABELS[theme]}</option>
            ))}
          </select>
          <span className="visually-hidden" id="threadwake-theme-resolution" aria-live="polite">
            {THEME_LABELS[themePreference]} selected. {THEME_LABELS[resolvedTheme]} appearance active.
          </span>
        </label>

        <details className="layer-menu">
          <summary>
            <SlidersHorizontal aria-hidden="true" size={18} />
            <span>Layers</span>
            {enabledLayerCount ? <small>{enabledLayerCount}</small> : null}
          </summary>
          <div className="layer-popover">
            <header>
              <strong>Relationship layers</strong>
              <small>Layers never move the work units.</small>
            </header>
            {LAYERS.map((layer) => (
              <label key={layer.id}>
                <input
                  type="checkbox"
                  checked={layers[layer.id]}
                  onChange={() => onToggleLayer(layer.id)}
                />
                <span>
                  <strong>{layer.label}</strong>
                  <small>{layer.description}</small>
                </span>
              </label>
            ))}
          </div>
        </details>

        {onUndo ? (
          <button
            className="icon-button top-bar-icon-button"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo the latest planning or demo action"
          >
            <ClockCounterClockwise aria-hidden="true" size={18} />
          </button>
        ) : null}

        <button
          className="reset-button"
          type="button"
          onClick={onReset}
          aria-label="Reset the deterministic demo"
        >
          <ArrowCounterClockwise aria-hidden="true" size={17} />
          <span>Reset</span>
        </button>
      </nav>
    </header>
  );
}
