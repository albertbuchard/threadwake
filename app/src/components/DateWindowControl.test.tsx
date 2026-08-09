import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DateWindow } from "../domain";
import { UTC_DAY_MS } from "../date-window-model";
import {
  DateWindowControl,
  type DateWindowControlProps,
} from "./DateWindowControl";

const bounds: DateWindow = {
  startMs: Date.parse("2026-04-01T00:00:00.000Z"),
  endMs: Date.parse("2026-04-05T23:59:59.999Z"),
};

const committed: DateWindow = {
  startMs: Date.parse("2026-04-02T00:00:00.000Z"),
  endMs: Date.parse("2026-04-04T23:59:59.999Z"),
};

function indexOf(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00.000Z`) / UTC_DAY_MS);
}

function callbacks() {
  return {
    onPreview: vi.fn<DateWindowControlProps["onPreview"]>(),
    onCommit: vi.fn<DateWindowControlProps["onCommit"]>(),
    onCancel: vi.fn<DateWindowControlProps["onCancel"]>(),
  };
}

describe("DateWindowControl", () => {
  let nextFrameId = 1;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function deliverFrame(timestamp = 123): void {
    const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(entry).toBeDefined();
    if (!entry) return;
    frames.delete(entry[0]);
    act(() => entry[1](timestamp));
  }

  it("exposes exact UTC values, instructions, and a valid one-day interval", () => {
    const events = callbacks();
    render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...events}
      />,
    );

    const start = screen.getByRole("slider", { name: "Start date" });
    const end = screen.getByRole("slider", { name: "End date" });
    expect(start).toHaveAttribute("min", String(indexOf("2026-04-01")));
    expect(start).toHaveAttribute("max", String(indexOf("2026-04-04")));
    expect(start).toHaveValue(String(indexOf("2026-04-02")));
    expect(start).toHaveAttribute(
      "aria-valuetext",
      "Start date 2026-04-02 UTC. Visible window 2026-04-02 through 2026-04-04, 3 days.",
    );
    expect(end).toHaveAttribute("min", String(indexOf("2026-04-02")));
    expect(end).toHaveAttribute("max", String(indexOf("2026-04-05")));
    expect(end).toHaveAttribute(
      "aria-valuetext",
      "End date 2026-04-04 UTC. Visible window 2026-04-02 through 2026-04-04, 3 days.",
    );
    expect(start).toHaveAccessibleDescription(/Start and end use inclusive UTC days and may be the same day/);
    expect(screen.getByText("3 days")).toBeVisible();
    expect(start).toHaveClass("date-window-control__touch-target");
    expect(end).toHaveClass("date-window-control__touch-target");

    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.input(start, { target: { value: indexOf("2026-04-04") } });
    deliverFrame();
    fireEvent.pointerUp(start, { pointerId: 1 });

    expect(events.onCommit).toHaveBeenCalledWith(
      {
        startMs: Date.parse("2026-04-04T00:00:00.000Z"),
        endMs: Date.parse("2026-04-04T23:59:59.999Z"),
      },
      expect.objectContaining({ handle: "start", reason: "pointer-up" }),
    );
    expect(screen.getByText("1 day")).toBeVisible();
  });

  it("coalesces rapid input into one frame preview without committing", () => {
    const events = callbacks();
    render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...events}
      />,
    );
    const start = screen.getByRole("slider", { name: "Start date" });

    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.input(start, { target: { value: indexOf("2026-04-01") } });
    fireEvent.input(start, { target: { value: indexOf("2026-04-03") } });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(events.onPreview).not.toHaveBeenCalled();
    expect(events.onCommit).not.toHaveBeenCalled();

    deliverFrame(456);
    expect(events.onPreview).toHaveBeenCalledTimes(1);
    expect(events.onPreview).toHaveBeenCalledWith(
      {
        startMs: Date.parse("2026-04-03T00:00:00.000Z"),
        endMs: Date.parse("2026-04-04T23:59:59.999Z"),
      },
      expect.objectContaining({
        sequence: 1,
        handle: "start",
        acceptedAt: expect.any(Number),
      }),
    );
    expect(events.onCommit).not.toHaveBeenCalled();
  });

  it("finalizes pointer and keyboard gestures exactly once, including dirty blur", () => {
    const pointerEvents = callbacks();
    const { rerender } = render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...pointerEvents}
      />,
    );
    const start = screen.getByRole("slider", { name: "Start date" });

    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.input(start, { target: { value: indexOf("2026-04-03") } });
    fireEvent.pointerUp(start, { pointerId: 1 });
    fireEvent.blur(start);
    expect(pointerEvents.onCommit).toHaveBeenCalledTimes(1);
    expect(pointerEvents.onCommit.mock.calls[0]?.[1].reason).toBe("pointer-up");

    const keyboardCommitted = pointerEvents.onCommit.mock.calls[0]?.[0] ?? committed;
    const keyboardEvents = callbacks();
    rerender(
      <DateWindowControl
        committed={keyboardCommitted}
        bounds={bounds}
        {...keyboardEvents}
      />,
    );
    const end = screen.getByRole("slider", { name: "End date" });
    fireEvent.keyDown(end, { key: "ArrowRight" });
    fireEvent.input(end, { target: { value: indexOf("2026-04-05") } });
    fireEvent.keyUp(end, { key: "ArrowRight" });
    fireEvent.blur(end);
    expect(keyboardEvents.onCommit).toHaveBeenCalledTimes(1);
    expect(keyboardEvents.onCommit.mock.calls[0]?.[1].reason).toBe("key-up");

    const blurEvents = callbacks();
    rerender(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...blurEvents}
      />,
    );
    const blurEnd = screen.getByRole("slider", { name: "End date" });
    fireEvent.input(blurEnd, { target: { value: indexOf("2026-04-03") } });
    fireEvent.blur(blurEnd);
    expect(blurEvents.onCommit).toHaveBeenCalledTimes(1);
    expect(blurEvents.onCommit.mock.calls[0]?.[1].reason).toBe("blur");
  });

  it("cancels pointer and Escape previews back to the committed window", () => {
    const events = callbacks();
    render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...events}
      />,
    );
    const start = screen.getByRole("slider", { name: "Start date" });

    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.input(start, { target: { value: indexOf("2026-04-03") } });
    deliverFrame();
    fireEvent.pointerCancel(start, { pointerId: 1 });

    expect(events.onCancel).toHaveBeenCalledWith(
      committed,
      expect.objectContaining({ handle: "start", reason: "pointer-cancel", sequence: 1 }),
    );
    expect(events.onCommit).not.toHaveBeenCalled();
    expect(start).toHaveValue(String(indexOf("2026-04-02")));

    fireEvent.keyDown(start, { key: "ArrowRight" });
    fireEvent.input(start, { target: { value: indexOf("2026-04-03") } });
    fireEvent.keyDown(start, { key: "Escape" });
    expect(events.onCancel).toHaveBeenCalledTimes(2);
    expect(events.onCancel.mock.calls[1]?.[1].reason).toBe("escape");
    expect(events.onCommit).not.toHaveBeenCalled();
    expect(start).toHaveValue(String(indexOf("2026-04-02")));
  });

  it("lets only the replacement gesture finalize after an interruption", () => {
    const events = callbacks();
    render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...events}
      />,
    );
    const start = screen.getByRole("slider", { name: "Start date" });
    const end = screen.getByRole("slider", { name: "End date" });

    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.input(start, { target: { value: indexOf("2026-04-03") } });
    fireEvent.pointerDown(end, { pointerId: 2 });
    fireEvent.input(end, { target: { value: indexOf("2026-04-05") } });

    fireEvent.pointerUp(start, { pointerId: 1 });
    expect(events.onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(end, { pointerId: 2 });

    expect(events.onCommit).toHaveBeenCalledTimes(1);
    expect(events.onCommit).toHaveBeenCalledWith(
      {
        startMs: Date.parse("2026-04-03T00:00:00.000Z"),
        endMs: Date.parse("2026-04-05T23:59:59.999Z"),
      },
      expect.objectContaining({ handle: "end", reason: "pointer-up" }),
    );
  });

  it("commits the complete bounds through Show full timeline", () => {
    const events = callbacks();
    render(
      <DateWindowControl
        committed={committed}
        bounds={bounds}
        {...events}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show full timeline" }));
    expect(events.onCommit).toHaveBeenCalledWith(
      bounds,
      expect.objectContaining({ handle: "both", reason: "show-full" }),
    );
    expect(screen.getByText("5 days")).toBeVisible();
  });
});
