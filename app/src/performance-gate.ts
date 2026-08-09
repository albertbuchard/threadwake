import type { ThreadwakeGraphRenderMark } from "./performance";

declare const __THREADWAKE_PERFORMANCE_QA__: boolean;

type PerformanceModule = typeof import("./performance");

let modulePromise: Promise<PerformanceModule> | null = null;

function loadPerformanceModule(): Promise<PerformanceModule> {
  modulePromise ??= import("./performance");
  return modulePromise;
}

export function installPerformanceInstrumentation(): void {
  if (!__THREADWAKE_PERFORMANCE_QA__) return;
  void loadPerformanceModule().then((module) => module.installPerformanceInstrumentation());
}

export function markFirstMeaningfulGraphRender(
  mark: Omit<ThreadwakeGraphRenderMark, "atMs">,
): void {
  if (!__THREADWAKE_PERFORMANCE_QA__) return;
  void loadPerformanceModule().then((module) => module.markFirstMeaningfulGraphRender(mark));
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (!modulePromise) return;
    void modulePromise.then((module) => module.uninstallPerformanceInstrumentation());
  });
}
