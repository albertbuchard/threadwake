import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { App } from "./App";
import { installPerformanceInstrumentation } from "./performance-gate";
import {
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
  themeColorScheme,
} from "./theme";
import "./styles.css";

const qaTextScale = new URLSearchParams(window.location.search).get("qaTextScale");
if (qaTextScale === "2") {
  document.documentElement.dataset.qaTextScale = "2";
}

let storedTheme: string | null = null;
try {
  storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
} catch {
  // Storage can be unavailable in hardened or ephemeral browser contexts.
}
const bootstrapThemePreference = readThemePreference(window.location.search, storedTheme);
const bootstrapTheme = resolveTheme(
  bootstrapThemePreference,
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
);
document.documentElement.dataset.theme = bootstrapTheme;
document.documentElement.style.colorScheme = themeColorScheme(bootstrapTheme);

installPerformanceInstrumentation();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Threadwake could not find its application root.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
