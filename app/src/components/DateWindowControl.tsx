import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { DateWindow } from "../domain";
import {
  UTC_DAY_MS,
  dateWindowIsoLabels,
  isFullDateWindow,
  normalizeDateWindow,
} from "../date-window-model";

export type DateWindowHandle = "start" | "end";
export type DateWindowCommitReason = "pointer-up" | "key-up" | "blur" | "show-full";
export type DateWindowCancelReason = "pointer-cancel" | "escape";

export interface DateWindowPreviewMeta {
  /** Monotonic within this mounted control; increments only when a preview frame is delivered. */
  sequence: number;
  /** performance.now() captured when the latest input value was accepted. */
  acceptedAt: number;
  handle: DateWindowHandle;
}

export interface DateWindowCommitMeta {
  /** The most recently delivered preview sequence. */
  sequence: number;
  /** performance.now() captured when the committed draft was last accepted. */
  acceptedAt: number;
  handle: DateWindowHandle | "both";
  reason: DateWindowCommitReason;
}

export interface DateWindowCancelMeta {
  /** The most recently delivered preview sequence. */
  sequence: number;
  acceptedAt: number;
  handle: DateWindowHandle;
  reason: DateWindowCancelReason;
}

export interface DateWindowControlProps {
  /** Canonical inclusive UTC-day window. */
  committed: DateWindow;
  /** Complete inclusive UTC-day extent available to the graph. */
  bounds: DateWindow;
  onPreview: (window: DateWindow, meta: DateWindowPreviewMeta) => void;
  onCommit: (window: DateWindow, meta: DateWindowCommitMeta) => void;
  onCancel: (window: DateWindow, meta: DateWindowCancelMeta) => void;
  disabled?: boolean;
  className?: string;
}

type GestureKind = "pointer" | "keyboard" | "implicit";

interface ActiveGesture {
  id: number;
  handle: DateWindowHandle;
  kind: GestureKind;
  pointerId?: number;
  dirty: boolean;
  acceptedAt: number;
}

interface PendingPreview {
  window: DateWindow;
  acceptedAt: number;
  handle: DateWindowHandle;
}

const RANGE_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function sameWindow(left: DateWindow, right: DateWindow): boolean {
  return left.startMs === right.startMs && left.endMs === right.endMs;
}

function dayIndex(timestampMs: number): number {
  return Math.floor(timestampMs / UTC_DAY_MS);
}

function startOfDayIndex(index: number): number {
  return index * UTC_DAY_MS;
}

function endOfDayIndex(index: number): number {
  return startOfDayIndex(index) + UTC_DAY_MS - 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function acceptedNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function windowFromIndices(startIndex: number, endIndex: number): DateWindow {
  return {
    startMs: startOfDayIndex(startIndex),
    endMs: endOfDayIndex(endIndex),
  };
}

function durationLabel(durationDays: number): string {
  return `${durationDays} ${durationDays === 1 ? "day" : "days"}`;
}

function inputValueText(
  handle: DateWindowHandle,
  labels: ReturnType<typeof dateWindowIsoLabels>,
): string {
  const selected = handle === "start" ? labels.start : labels.end;
  return `${handle === "start" ? "Start" : "End"} date ${selected} UTC. Visible window ${labels.start} through ${labels.end}, ${durationLabel(labels.durationDays)}.`;
}

export function DateWindowControl({
  committed,
  bounds,
  onPreview,
  onCommit,
  onCancel,
  disabled = false,
  className,
}: DateWindowControlProps) {
  const titleId = useId();
  const instructionsId = useId();
  const summaryId = useId();
  const normalizedBounds = normalizeDateWindow(bounds, bounds);
  const normalizedCommitted = normalizeDateWindow(committed, normalizedBounds);
  const minimumIndex = dayIndex(normalizedBounds.startMs);
  const maximumIndex = dayIndex(normalizedBounds.endMs);

  const [draft, setDraftState] = useState<DateWindow>(() => normalizedCommitted);
  const draftRef = useRef(draft);
  const committedRef = useRef(normalizedCommitted);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const nextGestureIdRef = useRef(1);
  const previewSequenceRef = useRef(0);
  const pendingPreviewRef = useRef<PendingPreview | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const onPreviewRef = useRef(onPreview);

  committedRef.current = normalizedCommitted;
  onPreviewRef.current = onPreview;

  const setDraft = useCallback((next: DateWindow) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const discardPendingPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewRef.current = null;
  }, []);

  const schedulePreview = useCallback((pending: PendingPreview) => {
    pendingPreviewRef.current = pending;
    if (previewFrameRef.current !== null) return;

    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const latest = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (!latest) return;

      previewSequenceRef.current += 1;
      onPreviewRef.current(latest.window, {
        sequence: previewSequenceRef.current,
        acceptedAt: latest.acceptedAt,
        handle: latest.handle,
      });
    });
  }, []);

  useEffect(() => {
    if (gestureRef.current !== null) return;
    if (!sameWindow(draftRef.current, normalizedCommitted)) setDraft(normalizedCommitted);
  }, [
    normalizedCommitted.startMs,
    normalizedCommitted.endMs,
    normalizedBounds.startMs,
    normalizedBounds.endMs,
    setDraft,
  ]);

  useEffect(() => discardPendingPreview, [discardPendingPreview]);

  const beginGesture = useCallback((
    handle: DateWindowHandle,
    kind: GestureKind,
    pointerId?: number,
  ) => {
    const active = gestureRef.current;
    const continuesCurrent = active !== null
      && active.handle === handle
      && active.kind === kind
      && (kind !== "pointer" || active.pointerId === pointerId);
    if (continuesCurrent) return active;

    // Replacing an unfinished gesture deliberately keeps draftRef as the next
    // gesture's warm preview base. The replaced gesture can no longer commit.
    const replacement: ActiveGesture = {
      id: nextGestureIdRef.current,
      handle,
      kind,
      pointerId,
      dirty: !sameWindow(draftRef.current, committedRef.current),
      acceptedAt: acceptedNow(),
    };
    nextGestureIdRef.current += 1;
    gestureRef.current = replacement;
    return replacement;
  }, []);

  const updateDraftFromInput = useCallback((
    handle: DateWindowHandle,
    rawValue: number,
  ) => {
    const active = gestureRef.current ?? beginGesture(handle, "implicit");
    if (active.handle !== handle) return;

    const current = draftRef.current;
    const currentStartIndex = dayIndex(current.startMs);
    const currentEndIndex = dayIndex(current.endMs);
    const next = handle === "start"
      ? windowFromIndices(
        clamp(rawValue, minimumIndex, currentEndIndex),
        currentEndIndex,
      )
      : windowFromIndices(
        currentStartIndex,
        clamp(rawValue, currentStartIndex, maximumIndex),
      );
    if (sameWindow(next, current)) return;

    const acceptedAt = acceptedNow();
    active.acceptedAt = acceptedAt;
    active.dirty = !sameWindow(next, committedRef.current);
    setDraft(next);
    schedulePreview({ window: next, acceptedAt, handle });
  }, [beginGesture, maximumIndex, minimumIndex, schedulePreview, setDraft]);

  const activeMatches = useCallback((
    handle: DateWindowHandle,
    kind: GestureKind,
    pointerId?: number,
  ): ActiveGesture | null => {
    const active = gestureRef.current;
    if (!active || active.handle !== handle || active.kind !== kind) return null;
    if (
      kind === "pointer"
      && active.pointerId !== undefined
      && pointerId !== undefined
      && active.pointerId !== pointerId
    ) return null;
    return active;
  }, []);

  const finalizeGesture = useCallback((
    active: ActiveGesture,
    reason: Exclude<DateWindowCommitReason, "show-full">,
  ) => {
    if (gestureRef.current?.id !== active.id) return;
    gestureRef.current = null;
    discardPendingPreview();
    if (!active.dirty) return;

    const next = draftRef.current;
    onCommit(next, {
      sequence: previewSequenceRef.current,
      acceptedAt: active.acceptedAt,
      handle: active.handle,
      reason,
    });
  }, [discardPendingPreview, onCommit]);

  const cancelGesture = useCallback((
    active: ActiveGesture,
    reason: DateWindowCancelReason,
  ) => {
    if (gestureRef.current?.id !== active.id) return;
    gestureRef.current = null;
    discardPendingPreview();
    const restored = committedRef.current;
    setDraft(restored);
    onCancel(restored, {
      sequence: previewSequenceRef.current,
      acceptedAt: active.acceptedAt,
      handle: active.handle,
      reason,
    });
  }, [discardPendingPreview, onCancel, setDraft]);

  const handleInput = useCallback((
    handle: DateWindowHandle,
    event: FormEvent<HTMLInputElement>,
  ) => {
    updateDraftFromInput(handle, Number(event.currentTarget.value));
  }, [updateDraftFromInput]);

  const handlePointerDown = useCallback((
    handle: DateWindowHandle,
    event: PointerEvent<HTMLInputElement>,
  ) => {
    beginGesture(handle, "pointer", event.pointerId);
  }, [beginGesture]);

  const handlePointerUp = useCallback((
    handle: DateWindowHandle,
    event: PointerEvent<HTMLInputElement>,
  ) => {
    const active = activeMatches(handle, "pointer", event.pointerId);
    if (active) finalizeGesture(active, "pointer-up");
  }, [activeMatches, finalizeGesture]);

  const handlePointerCancel = useCallback((
    handle: DateWindowHandle,
    event: PointerEvent<HTMLInputElement>,
  ) => {
    const active = activeMatches(handle, "pointer", event.pointerId);
    if (active) cancelGesture(active, "pointer-cancel");
  }, [activeMatches, cancelGesture]);

  const handleKeyDown = useCallback((
    handle: DateWindowHandle,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      const active = gestureRef.current;
      if (active?.handle === handle) {
        event.preventDefault();
        cancelGesture(active, "escape");
      }
      return;
    }
    if (RANGE_KEYS.has(event.key)) beginGesture(handle, "keyboard");
  }, [beginGesture, cancelGesture]);

  const handleKeyUp = useCallback((
    handle: DateWindowHandle,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (!RANGE_KEYS.has(event.key)) return;
    const active = activeMatches(handle, "keyboard");
    if (active) finalizeGesture(active, "key-up");
  }, [activeMatches, finalizeGesture]);

  const handleBlur = useCallback((
    handle: DateWindowHandle,
    _event: FocusEvent<HTMLInputElement>,
  ) => {
    const active = gestureRef.current;
    if (!active || active.handle !== handle) return;
    // A pointer-down on the other handle replaces active before this blur is
    // delivered, so the superseded gesture cannot commit here.
    finalizeGesture(active, "blur");
  }, [finalizeGesture]);

  const handleShowFull = useCallback(() => {
    gestureRef.current = null;
    discardPendingPreview();
    setDraft(normalizedBounds);
    onCommit(normalizedBounds, {
      sequence: previewSequenceRef.current,
      acceptedAt: acceptedNow(),
      handle: "both",
      reason: "show-full",
    });
  }, [
    discardPendingPreview,
    normalizedBounds.startMs,
    normalizedBounds.endMs,
    onCommit,
    setDraft,
  ]);

  const labels = dateWindowIsoLabels(draft);
  const startIndex = dayIndex(draft.startMs);
  const endIndex = dayIndex(draft.endMs);
  const fullTimelineIsShown = isFullDateWindow(draft, normalizedBounds)
    && isFullDateWindow(normalizedCommitted, normalizedBounds);
  const rootClassName = ["date-window-control", className].filter(Boolean).join(" ");

  return (
    <section className={rootClassName} aria-labelledby={titleId}>
      <header className="date-window-control__header">
        <div>
          <p className="date-window-control__eyebrow">Time filter</p>
          <h2 id={titleId}>Visible date window</h2>
        </div>
        <button
          className="date-window-control__reset date-window-control__touch-target"
          type="button"
          disabled={disabled || fullTimelineIsShown}
          onClick={handleShowFull}
        >
          Show full timeline
        </button>
      </header>

      <dl className="date-window-control__summary" id={summaryId} aria-live="polite">
        <div>
          <dt>Start</dt>
          <dd><time dateTime={labels.start}>{labels.start}</time></dd>
        </div>
        <div>
          <dt>End</dt>
          <dd><time dateTime={labels.end}>{labels.end}</time></dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{durationLabel(labels.durationDays)}</dd>
        </div>
      </dl>

      <p className="date-window-control__instructions" id={instructionsId}>
        Drag either handle or use the arrow keys. Changes preview immediately; Escape cancels.
        <span className="visually-hidden"> Start and end use inclusive UTC days and may be the same day. Arrow keys move one day; Page Up and Page Down move a larger step; Home and End move to the available limits. Release the pointer, release a key, or leave a changed slider to apply.</span>
      </p>

      <div className="date-window-control__ranges">
        <label className="date-window-control__range date-window-control__range--start">
          <span>Start date</span>
          <input
            className="date-window-control__range-input date-window-control__range-input--start date-window-control__touch-target"
            type="range"
            min={minimumIndex}
            max={endIndex}
            step={1}
            value={startIndex}
            disabled={disabled}
            aria-describedby={`${summaryId} ${instructionsId}`}
            aria-valuetext={inputValueText("start", labels)}
            onChange={() => undefined}
            onInput={(event) => handleInput("start", event)}
            onPointerDown={(event) => handlePointerDown("start", event)}
            onPointerUp={(event) => handlePointerUp("start", event)}
            onPointerCancel={(event) => handlePointerCancel("start", event)}
            onKeyDown={(event) => handleKeyDown("start", event)}
            onKeyUp={(event) => handleKeyUp("start", event)}
            onBlur={(event) => handleBlur("start", event)}
          />
        </label>

        <label className="date-window-control__range date-window-control__range--end">
          <span>End date</span>
          <input
            className="date-window-control__range-input date-window-control__range-input--end date-window-control__touch-target"
            type="range"
            min={startIndex}
            max={maximumIndex}
            step={1}
            value={endIndex}
            disabled={disabled}
            aria-describedby={`${summaryId} ${instructionsId}`}
            aria-valuetext={inputValueText("end", labels)}
            onChange={() => undefined}
            onInput={(event) => handleInput("end", event)}
            onPointerDown={(event) => handlePointerDown("end", event)}
            onPointerUp={(event) => handlePointerUp("end", event)}
            onPointerCancel={(event) => handlePointerCancel("end", event)}
            onKeyDown={(event) => handleKeyDown("end", event)}
            onKeyUp={(event) => handleKeyUp("end", event)}
            onBlur={(event) => handleBlur("end", event)}
          />
        </label>
      </div>
    </section>
  );
}
