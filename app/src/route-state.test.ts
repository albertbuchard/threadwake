import { describe, expect, it } from "vitest";

import { createInitialState } from "./seed";
import { parseRouteState, ROUTE_STATE_VERSION, writeRouteStateParams } from "./route-state";

describe("versioned route state", () => {
  it("round-trips the canonical view, identity, filters, workstream focus, and collapsed columns", () => {
    const state = createInitialState();
    state.view = "kanban";
    state.selectedNodeId = undefined;
    state.focus = { level: "workstream", workstreamId: "stream-continuity", trail: [] };
    state.layers["same-source-thread"] = true;
    state.searchQuery = "ownership failures";
    state.collapsedLifecycles = ["done", "abandoned"];

    const params = writeRouteStateParams(new URLSearchParams(), state, "timeline");
    const restored = parseRouteState(params, createInitialState());

    expect(params.get("twv")).toBe(ROUTE_STATE_VERSION);
    expect(restored.canonical).toBe(true);
    expect(restored.view).toBe("kanban");
    expect(restored.focus).toMatchObject({ level: "workstream", workstreamId: "stream-continuity" });
    expect(restored.layers["same-source-thread"]).toBe(true);
    expect(restored.searchQuery).toBe("ownership failures");
    expect(restored.collapsedLifecycles).toEqual(["done", "abandoned"]);
    expect(restored.graphSurface).toBe("timeline");
  });

  it("rejects unknown identifiers and enum values without throwing", () => {
    const restored = parseRouteState(new URLSearchParams({
      twv: "999",
      view: "calendar",
      selected: "missing-node",
      relation: "missing-relation",
      layers: "continues,unknown-layer",
      collapsed: "done,unknown-lifecycle",
      workstream: "missing-stream",
      surface: "table",
    }), createInitialState());

    expect(restored.canonical).toBe(false);
    expect(restored.invalidReasons).toEqual(expect.arrayContaining([
      "unsupported route-state version",
      "invalid view",
      "unknown selected work identity",
      "unknown selected relationship identity",
      "invalid relation-layer filter",
      "invalid collapsed lifecycle",
      "unknown workstream focus",
      "invalid graph surface",
    ]));
    expect(restored.view).toBe("graph");
    expect(restored.focus.level).toBe("project");
  });

  it("gives a valid selected work identity precedence over relationship and workstream focus", () => {
    const restored = parseRouteState(new URLSearchParams({
      twv: ROUTE_STATE_VERSION,
      selected: "node-renderer-failure",
      relation: "relation-map-to-canvas",
      workstream: "stream-continuity",
    }), createInitialState());

    expect(restored.selectedNodeId).toBe("node-renderer-failure");
    expect(restored.selectedRelationId).toBeUndefined();
    expect(restored.focus).toMatchObject({ level: "node", nodeId: "node-renderer-failure" });
  });

  it("migrates an unversioned legacy URL without silently discarding the fixture selection", () => {
    const initial = createInitialState();
    const restored = parseRouteState(new URLSearchParams({ reducedMotion: "1" }), initial);

    expect(restored.canonical).toBe(false);
    expect(restored.selectedNodeId).toBe(initial.selectedNodeId);
    expect(restored.focus).toMatchObject({ level: "node", nodeId: initial.selectedNodeId });
  });
});
