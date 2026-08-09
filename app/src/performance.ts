export interface ThreadwakeInteractionSample {
  id: number;
  kind: string;
  label: string;
  acceptedAtMs: number;
  nextPaintMs: number;
  latencyMs: number;
}

export interface ThreadwakeGraphRenderMark {
  atMs: number;
  nodeCount: number;
  relationCount: number;
  renderedRelationCount: number;
  selectedNodeId: string;
  nodeSolverStopReason: string;
  edgeSolverStopReason: string;
  nodeSolverConverged: boolean;
  edgeSolverConverged: boolean;
}

export interface ThreadwakeMemorySample {
  label: string;
  atMs: number;
  usedJsHeapBytes: number | null;
  totalJsHeapBytes: number | null;
  jsHeapLimitBytes: number | null;
}

export interface ThreadwakePerformanceMeasurements {
  schemaVersion: 1;
  installedAtMs: number;
  navigation: {
    responseEndMs: number | null;
    domContentLoadedMs: number | null;
    loadEventEndMs: number | null;
  };
  paint: {
    firstPaintMs: number | null;
    firstContentfulPaintMs: number | null;
    largestContentfulPaintMs: number | null;
    cumulativeLayoutShift: number;
    interactionToNextPaintMs: number | null;
    frozenAtFirstInputMs: number | null;
    layoutShifts: Array<{ atMs: number; value: number; sources: string[] }>;
  };
  firstMeaningfulGraphRender: ThreadwakeGraphRenderMark | null;
  resources: {
    count: number;
    transferBytes: number;
    encodedBodyBytes: number;
    decodedBodyBytes: number;
  };
  frameIntervalsMs: number[];
  interactions: ThreadwakeInteractionSample[];
  memory: ThreadwakeMemorySample[];
}

declare global {
  interface Window {
    __THREADWAKE_MEASUREMENTS__?: ThreadwakePerformanceMeasurements;
  }
}

const MAX_FRAME_INTERVALS = 1_200;
const MAX_INTERACTIONS = 160;
const MAX_MEMORY_SAMPLES = 24;

let measurements: ThreadwakePerformanceMeasurements | null = null;
let installed = false;
let interactionSequence = 0;
let activeCleanup: (() => void) | null = null;
let frameRequestId: number | null = null;
let mirrorIntervalId: number | null = null;
let performanceObservers: PerformanceObserver[] = [];
const scheduledTimeouts = new Set<number>();

function scheduleTimeout(callback: () => void, delay: number): void {
  const id = window.setTimeout(() => {
    scheduledTimeouts.delete(id);
    callback();
  }, delay);
  scheduledTimeouts.add(id);
}

function syncDomMirror(): void {
  if (!measurements || typeof document === "undefined") return;
  let mirror = document.getElementById("threadwake-performance-mirror");
  if (!mirror) {
    mirror = document.createElement("script");
    mirror.id = "threadwake-performance-mirror";
    mirror.setAttribute("type", "application/json");
    document.head.appendChild(mirror);
  }
  mirror.textContent = JSON.stringify(measurements);
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function entryStart(entry: PerformanceEntry | undefined): number | null {
  return entry ? finiteOrNull(entry.startTime) : null;
}

function updateNavigationAndResources(target: ThreadwakePerformanceMeasurements): void {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  target.navigation.responseEndMs = finiteOrNull(navigation?.responseEnd);
  target.navigation.domContentLoadedMs = finiteOrNull(navigation?.domContentLoadedEventEnd);
  target.navigation.loadEventEndMs = finiteOrNull(navigation?.loadEventEnd);

  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  target.resources = resources.reduce(
    (summary, resource) => ({
      count: summary.count + 1,
      transferBytes: summary.transferBytes + Math.max(0, resource.transferSize || 0),
      encodedBodyBytes: summary.encodedBodyBytes + Math.max(0, resource.encodedBodySize || 0),
      decodedBodyBytes: summary.decodedBodyBytes + Math.max(0, resource.decodedBodySize || 0),
    }),
    { count: 0, transferBytes: 0, encodedBodyBytes: 0, decodedBodyBytes: 0 },
  );

  const paintEntries = performance.getEntriesByType("paint");
  target.paint.firstPaintMs = entryStart(paintEntries.find((entry) => entry.name === "first-paint"));
  target.paint.firstContentfulPaintMs = entryStart(
    paintEntries.find((entry) => entry.name === "first-contentful-paint"),
  );
}

function captureMemory(label: string): void {
  if (!measurements) return;
  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  }).memory;
  measurements.memory.push({
    label,
    atMs: performance.now(),
    usedJsHeapBytes: finiteOrNull(memory?.usedJSHeapSize),
    totalJsHeapBytes: finiteOrNull(memory?.totalJSHeapSize),
    jsHeapLimitBytes: finiteOrNull(memory?.jsHeapSizeLimit),
  });
  if (measurements.memory.length > MAX_MEMORY_SAMPLES) measurements.memory.shift();
  syncDomMirror();
}

function interactionLabel(event: Event): string {
  const target = event.target instanceof Element ? event.target : null;
  const labelled = target?.closest<HTMLElement>(
    "button,[role='button'],[role='option'],input,a,[data-threadwake-interaction]",
  );
  return (
    labelled?.getAttribute("aria-label")
    ?? labelled?.getAttribute("data-threadwake-interaction")
    ?? labelled?.textContent?.trim().replace(/\s+/g, " ").slice(0, 96)
    ?? target?.tagName.toLowerCase()
    ?? "page"
  );
}

function recordAcceptedInteraction(event: Event): void {
  if (!measurements || event.type === "keydown" && (event as KeyboardEvent).repeat) return;
  const acceptedAt = performance.now();
  if (measurements.paint.frozenAtFirstInputMs === null) {
    measurements.paint.frozenAtFirstInputMs = acceptedAt;
  }
  const kind = event.type === "keydown" ? `key:${(event as KeyboardEvent).key}` : event.type;
  const label = interactionLabel(event);
  const id = ++interactionSequence;
  requestAnimationFrame(() => {
    requestAnimationFrame((nextPaint) => {
      if (!measurements) return;
      measurements.interactions.push({
        id,
        kind,
        label,
        acceptedAtMs: acceptedAt,
        nextPaintMs: nextPaint,
        latencyMs: Math.max(0, nextPaint - acceptedAt),
      });
      if (measurements.interactions.length > MAX_INTERACTIONS) measurements.interactions.shift();
      measurements.paint.interactionToNextPaintMs = Math.max(
        measurements.paint.interactionToNextPaintMs ?? 0,
        Math.max(0, nextPaint - acceptedAt),
      );
      if (id % 20 === 0) {
        captureMemory(`interaction-${id}-next-paint`);
        scheduleTimeout(() => captureMemory(`interaction-${id}-settled-2000ms`), 2_000);
        scheduleTimeout(() => captureMemory(`interaction-${id}-settled-5000ms`), 5_000);
      }
      syncDomMirror();
    });
  });
}

function observePerformance(target: ThreadwakePerformanceMeasurements): PerformanceObserver[] {
  if (typeof PerformanceObserver === "undefined") return [];
  const observers: PerformanceObserver[] = [];
  const observe = (
    type: string,
    callback: (entries: PerformanceEntry[]) => void,
    options: PerformanceObserverInit & { durationThreshold?: number } = { type, buffered: true },
  ) => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe(options as PerformanceObserverInit);
      observers.push(observer);
    } catch {
      // Unsupported entry types remain null and are reported honestly.
    }
  };
  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (
      last
      && (target.paint.frozenAtFirstInputMs === null || last.startTime <= target.paint.frozenAtFirstInputMs)
    ) {
      target.paint.largestContentfulPaintMs = finiteOrNull(last.startTime);
    }
  });
  observe("layout-shift", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & {
      value?: number;
      hadRecentInput?: boolean;
      sources?: Array<{ node?: Node | null }>;
    }>) {
      if (!entry.hadRecentInput && typeof entry.value === "number") {
        target.paint.cumulativeLayoutShift += entry.value;
        target.paint.layoutShifts.push({
          atMs: entry.startTime,
          value: entry.value,
          sources: (entry.sources ?? []).map((source) => {
            const node = source.node;
            if (!(node instanceof Element)) return "unknown";
            return node.id ? `#${node.id}` : node.className
              ? `${node.tagName.toLowerCase()}.${String(node.className).trim().replace(/\s+/g, ".")}`
              : node.tagName.toLowerCase();
          }).slice(0, 4),
        });
        if (target.paint.layoutShifts.length > 20) target.paint.layoutShifts.shift();
      }
    }
  });
  observe("event", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { duration?: number }>) {
      if (typeof entry.duration !== "number") continue;
      target.paint.interactionToNextPaintMs = Math.max(
        target.paint.interactionToNextPaintMs ?? 0,
        entry.duration,
      );
    }
  }, { type: "event", buffered: true, durationThreshold: 16 });
  return observers;
}

export function installPerformanceInstrumentation(): ThreadwakePerformanceMeasurements | null {
  if (typeof window === "undefined" || typeof performance === "undefined") return null;
  if (installed && measurements) return measurements;
  installed = true;
  measurements = {
    schemaVersion: 1,
    installedAtMs: performance.now(),
    navigation: { responseEndMs: null, domContentLoadedMs: null, loadEventEndMs: null },
    paint: {
      firstPaintMs: null,
      firstContentfulPaintMs: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: 0,
      interactionToNextPaintMs: null,
      frozenAtFirstInputMs: null,
      layoutShifts: [],
    },
    firstMeaningfulGraphRender: null,
    resources: { count: 0, transferBytes: 0, encodedBodyBytes: 0, decodedBodyBytes: 0 },
    frameIntervalsMs: [],
    interactions: [],
    memory: [],
  };
  window.__THREADWAKE_MEASUREMENTS__ = measurements;
  syncDomMirror();
  updateNavigationAndResources(measurements);
  performanceObservers = observePerformance(measurements);
  captureMemory("instrumentation-installed");

  let previousFrame = performance.now();
  const recordFrame = (now: number) => {
    if (!measurements) return;
    measurements.frameIntervalsMs.push(Math.max(0, now - previousFrame));
    previousFrame = now;
    if (measurements.frameIntervalsMs.length > MAX_FRAME_INTERVALS) {
      measurements.frameIntervalsMs.splice(0, measurements.frameIntervalsMs.length - MAX_FRAME_INTERVALS);
    }
    frameRequestId = requestAnimationFrame(recordFrame);
  };
  frameRequestId = requestAnimationFrame(recordFrame);
  mirrorIntervalId = window.setInterval(syncDomMirror, 1_000);

  const interactionTypes = ["click", "keydown", "wheel", "pointerup"] as const;
  for (const type of interactionTypes) {
    window.addEventListener(type, recordAcceptedInteraction, { capture: true, passive: type !== "keydown" });
  }
  const handleLoad = () => {
    scheduleTimeout(() => {
      if (!measurements) return;
      updateNavigationAndResources(measurements);
      captureMemory("load-settled");
    }, 1_000);
  };
  const handlePageHide = () => uninstallPerformanceInstrumentation();
  window.addEventListener("load", handleLoad, { once: true });
  window.addEventListener("pagehide", handlePageHide, { once: true });
  activeCleanup = () => {
    if (frameRequestId !== null) cancelAnimationFrame(frameRequestId);
    if (mirrorIntervalId !== null) window.clearInterval(mirrorIntervalId);
    for (const timeoutId of scheduledTimeouts) window.clearTimeout(timeoutId);
    scheduledTimeouts.clear();
    for (const observer of performanceObservers) observer.disconnect();
    performanceObservers = [];
    for (const type of interactionTypes) {
      window.removeEventListener(type, recordAcceptedInteraction, { capture: true });
    }
    window.removeEventListener("load", handleLoad);
    window.removeEventListener("pagehide", handlePageHide);
    document.getElementById("threadwake-performance-mirror")?.remove();
    delete window.__THREADWAKE_MEASUREMENTS__;
    frameRequestId = null;
    mirrorIntervalId = null;
    measurements = null;
    installed = false;
    activeCleanup = null;
  };
  return measurements;
}

export function uninstallPerformanceInstrumentation(): void {
  activeCleanup?.();
}

export function markFirstMeaningfulGraphRender(mark: Omit<ThreadwakeGraphRenderMark, "atMs">): void {
  if (!measurements || measurements.firstMeaningfulGraphRender) return;
  measurements.firstMeaningfulGraphRender = { ...mark, atMs: performance.now() };
  updateNavigationAndResources(measurements);
  captureMemory("first-meaningful-graph-render");
  syncDomMirror();
}
