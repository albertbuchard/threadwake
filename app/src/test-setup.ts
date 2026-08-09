import "@testing-library/jest-dom/vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

// Node 26 exposes a process-level localStorage accessor that is unavailable
// without a backing file. jsdom can inherit that accessor instead of creating
// its normal origin-scoped Storage object, so tests install a deterministic
// browser-equivalent store when the inherited value is absent or unusable.
let hasUsableLocalStorage = false;
try {
  hasUsableLocalStorage = Boolean(window.localStorage);
  window.localStorage.getItem("threadwake:test-storage-probe");
} catch {
  hasUsableLocalStorage = false;
}

if (!hasUsableLocalStorage) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
}

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(
    () => callback(window.performance.now()),
    0,
  );
  window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
}
