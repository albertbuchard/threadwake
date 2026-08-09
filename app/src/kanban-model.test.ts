import { describe, expect, it } from "vitest";

import {
  buildKanbanColumns,
  DEFAULT_COLLAPSED_LIFECYCLES,
  fixtureProjectAttachmentClosure,
  LIFECYCLE_COLUMNS,
  validateFixtureProjectAttachment,
  validateLifecycleMove,
  validateParentAssignment,
  validateViewGroupSelection,
} from "./kanban-model";
import { createInitialState } from "./seed";
import { appReducer } from "./state";

describe("canonical Kanban model", () => {
  it("places every fixture work item in exactly one of the six ordered lifecycle columns", () => {
    const state = createInitialState();
    const columns = buildKanbanColumns(
      state.nodes,
      state.collapsedLifecycles,
      "",
      state.selectedNodeId,
    );
    const displayedIds = columns.flatMap((column) => column.nodes.map((node) => node.id));

    expect(LIFECYCLE_COLUMNS.map((column) => column.label)).toEqual([
      "Planned",
      "Ongoing",
      "Awaiting review or approval",
      "Backlog",
      "Done",
      "Abandoned",
    ]);
    expect(DEFAULT_COLLAPSED_LIFECYCLES).toEqual(["backlog", "done", "abandoned"]);
    expect(columns.map((column) => column.collapsed)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(displayedIds).toHaveLength(state.nodes.length);
    expect(new Set(displayedIds).size).toBe(state.nodes.length);
    expect(state.nodes.every((node) => LIFECYCLE_COLUMNS.some((column) => column.id === node.lifecycle))).toBe(true);
  });

  it("keeps a selected item findable through a filter and a collapsed column", () => {
    const state = createInitialState();
    const selected = state.nodes.find((node) => node.lifecycle === "done");
    expect(selected).toBeDefined();

    const done = buildKanbanColumns(
      state.nodes,
      DEFAULT_COLLAPSED_LIFECYCLES,
      "query that cannot match any work item",
      selected?.id,
    ).find((column) => column.id === "done");

    expect(done?.collapsed).toBe(true);
    expect(done?.selectedOutsideFilter).toBe(true);
    expect(done?.nodes.map((node) => node.id)).toEqual([selected?.id]);
    expect(done?.totalCount).toBeGreaterThan(1);
  });

  it("rejects terminal parents with live descendants and preserves a reversible move", () => {
    const initial = createInitialState();
    const parentId = "node-map-question";
    const childId = "node-canvas-prototype";
    const nodes = initial.nodes.map((node) => {
      if (node.id === parentId) return { ...node, lifecycle: "ongoing" as const };
      if (node.id === childId) return { ...node, lifecycle: "ongoing" as const, parentNodeId: parentId };
      return node;
    });

    expect(validateLifecycleMove(nodes, parentId, "done")).toContain("terminal lifecycle first");

    let state = appReducer(initial, {
      type: "MOVE_NODE_LIFECYCLE",
      nodeId: "planned-progressive-handoff",
      lifecycle: "ongoing",
    });
    expect(state.nodes.find((node) => node.id === "planned-progressive-handoff")?.lifecycle).toBe("ongoing");
    state = appReducer(state, { type: "UNDO" });
    expect(state.nodes.find((node) => node.id === "planned-progressive-handoff")?.lifecycle).toBe("planned");
  });

  it("rejects missing, synthetic, cyclic, and terminal-parent hierarchy or grouping requests", () => {
    const state = createInitialState();
    const groupedNodeId = state.groups[0]?.memberNodeIds[0] as string;

    expect(validateViewGroupSelection(state.nodes, state.groups, [], undefined)).toContain("Select at least one");
    expect(validateViewGroupSelection(state.nodes, state.groups, ["group-node:missing", "node-map-question"], undefined)).toContain("missing or synthetic");
    expect(validateViewGroupSelection(state.nodes, state.groups, [groupedNodeId, "node-map-question"], undefined)).toContain("already belongs");
    expect(validateViewGroupSelection(state.nodes, state.groups, [groupedNodeId], state.groups[0]?.id)).toBeNull();

    expect(validateParentAssignment(state.nodes, "node-map-question", "missing-parent")).toContain("no longer exists");
    expect(validateParentAssignment(state.nodes, "node-map-question", "node-map-question")).toContain("cannot parent itself");
    const liveHierarchy = state.nodes.map((node) => node.id === "node-canvas-prototype"
      ? { ...node, lifecycle: "ongoing" as const }
      : node);
    expect(validateParentAssignment(liveHierarchy, "node-map-question", "node-canvas-prototype")).toContain("cycle");
    expect(validateParentAssignment(state.nodes, "planned-progressive-handoff", "node-renderer-failure")).toContain("cannot accept new child work");
  });

  it("adds selected work to an existing visual group without changing canonical parentage", () => {
    const initial = createInitialState();
    const nodeId = "planned-progressive-handoff";
    const parentBefore = initial.nodes.find((node) => node.id === nodeId)?.parentNodeId;
    const state = appReducer(initial, {
      type: "ADD_NODES_TO_GROUP",
      groupId: "group-recovery-arc",
      nodeIds: [nodeId],
    });

    expect(state.groups.find((group) => group.id === "group-recovery-arc")?.memberNodeIds).toContain(nodeId);
    expect(state.nodes.find((node) => node.id === nodeId)).toMatchObject({
      groupId: "group-recovery-arc",
      parentNodeId: parentBefore,
    });
    expect(state.history).toHaveLength(1);
  });

  it("preflights fixture Project attachment permissions, hierarchy, terminal states, and conflicts", () => {
    const state = createInitialState();
    const primary = state.nodes.find((node) => node.id === "node-semantic-mirror");
    const child = state.nodes.find((node) => node.id === "node-extraction-evaluator");
    const terminal = state.nodes.find((node) => node.lifecycle === "done" || node.lifecycle === "abandoned");
    expect(primary).toBeDefined();
    expect(child).toBeDefined();
    expect(terminal).toBeDefined();

    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      state.fixtureProjectAttachments,
      [primary!.id],
      { mode: "existing-project", projectId: "fixture-project-threadwake" },
      true,
    )).toBeNull();
    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      [],
      [primary!.id],
      { mode: "existing-project", projectId: "fixture-project-threadwake" },
      false,
    )).toContain("read-only");
    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      [],
      [child!.id],
      { mode: "existing-project", projectId: "fixture-project-threadwake" },
      true,
    )).toBeNull();
    const closure = fixtureProjectAttachmentClosure(state.nodes, [child!.id]);
    expect(closure.error).toBeNull();
    expect(closure.nodeIds).toEqual(expect.arrayContaining(["node-extraction-evaluator", "node-hybrid-extraction", "node-work-unit-hypothesis"]));
    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      [],
      [terminal!.id],
      { mode: "existing-project", projectId: "fixture-project-threadwake" },
      true,
    )).toContain("history");
    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      [],
      [primary!.id],
      { mode: "existing-project", projectId: "fixture-project-archive" },
      true,
    )).toContain("completed");
    expect(validateFixtureProjectAttachment(
      state.nodes,
      state.fixtureProjects,
      [{
        nodeId: primary!.id,
        projectId: "another-project",
        source: "threadwake-fixture-plan",
        preparedAt: "2026-08-09T08:00:00.000Z",
      }],
      [primary!.id],
      { mode: "existing-project", projectId: "fixture-project-threadwake" },
      true,
    )).toContain("different fixture Project");
  });

  it("applies and undoes a visual group plus a new fixture Project as one transaction", () => {
    const initial = createInitialState();
    const nodeIds = ["node-semantic-mirror", "node-extraction-evaluator"];
    expect(nodeIds).toHaveLength(2);

    let state = appReducer(initial, {
      type: "APPLY_GROUPING_PLAN",
      nodeIds,
      name: "Prepared release boundary",
      note: "A deterministic grouping fixture.",
      overlayColor: "#4e9bb6",
      projectPlan: { mode: "new-project", projectName: "Fixture release Project" },
    });
    expect(state.groups.at(-1)?.name).toBe("Prepared release boundary");
    expect(state.fixtureProjects.at(-1)).toMatchObject({
      name: "Fixture release Project",
      source: "isolated-fixture",
    });
    expect(state.fixtureProjectAttachments.map((attachment) => attachment.nodeId)).toEqual(expect.arrayContaining(nodeIds));
    expect(state.fixtureProjectAttachments.length).toBeGreaterThan(nodeIds.length);
    expect(state.history).toHaveLength(1);

    state = appReducer(state, { type: "UNDO" });
    expect(state.groups).toEqual(initial.groups);
    expect(state.fixtureProjects).toEqual(initial.fixtureProjects);
    expect(state.fixtureProjectAttachments).toEqual([]);
  });
});
