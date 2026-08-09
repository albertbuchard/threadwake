import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installPerformanceInstrumentation,
  uninstallPerformanceInstrumentation,
} from "./performance";

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => [] as PerformanceEntryList);

  constructor(_callback: PerformanceObserverCallback) {
    FakePerformanceObserver.instances.push(this);
  }
}

describe("QA performance instrumentation", () => {
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, "PerformanceObserver");

  afterEach(() => {
    uninstallPerformanceInstrumentation();
    vi.restoreAllMocks();
    FakePerformanceObserver.instances = [];
    if (originalObserver) {
      Object.defineProperty(globalThis, "PerformanceObserver", originalObserver);
    } else {
      Reflect.deleteProperty(globalThis, "PerformanceObserver");
    }
  });

  it("disconnects every observer and removes all global state when uninstalled", () => {
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: FakePerformanceObserver,
    });
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(101);
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const intervalId = 202 as unknown as ReturnType<typeof window.setInterval>;
    const setInterval = vi.spyOn(window, "setInterval").mockReturnValue(intervalId);
    const clearInterval = vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const installed = installPerformanceInstrumentation();

    expect(installed).not.toBeNull();
    expect(window.__THREADWAKE_MEASUREMENTS__).toBe(installed);
    expect(document.getElementById("threadwake-performance-mirror")).toBeInTheDocument();
    expect(FakePerformanceObserver.instances).toHaveLength(3);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledTimes(1);

    uninstallPerformanceInstrumentation();

    expect(cancelFrame).toHaveBeenCalledWith(101);
    expect(clearInterval).toHaveBeenCalledWith(intervalId);
    expect(FakePerformanceObserver.instances.every((observer) =>
      observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(document.getElementById("threadwake-performance-mirror")).not.toBeInTheDocument();
    expect(window.__THREADWAKE_MEASUREMENTS__).toBeUndefined();

    expect(installPerformanceInstrumentation()).not.toBeNull();
  });
});
