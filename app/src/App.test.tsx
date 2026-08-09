import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TemporalGraphCanvasProps } from "./components/TemporalGraphCanvas";
import type { GraphRelation, RelationKind, WorkNode } from "./domain";
import {
  createForceRelaxation,
  createTemporalLayout,
  forceRelaxationKey,
  runForceRelaxationToStop,
  type ForceRelaxationOptions,
} from "./geometry";
import { createInitialState } from "./seed";
import { appReducer } from "./state";
import { THEME_STORAGE_KEY } from "./theme";
import { App, buildDisplayGraph } from "./App";

let latestGraphProps: TemporalGraphCanvasProps | null = null;

vi.mock("./components/TemporalGraphCanvas", () => ({
  TemporalGraphCanvas: (props: TemporalGraphCanvasProps) => {
    latestGraphProps = props;
    const { nodes, onNodeFocus, onNodeSelect } = props;
    const semanticNodeIds = ["node-map-question", "node-canvas-prototype"];

    return (
      <section aria-label="Mock temporal graph">
        {semanticNodeIds.map((nodeId) => {
          const node = nodes.find((candidate) => candidate.id === nodeId);
          if (!node) return null;

          return (
            <div key={node.id}>
              <button
                type="button"
                aria-label={`Focus ${node.title}`}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  // The production semantic mirror routes Enter through the
                  // single focus callback. FOCUS_NODE owns both selection and
                  // focus, preventing a duplicate reduced-motion canvas update.
                  onNodeFocus?.(node.id, node.workstreamId);
                }}
              >
                {node.title}
              </button>
              <button
                type="button"
                aria-label={`Add ${node.title} to selection`}
                onClick={() => onNodeSelect?.(node.id, {
                  additive: true,
                  source: "semantic-mirror",
                })}
              >
                Add to selection
              </button>
            </div>
          );
        })}
      </section>
    );
  },
}));

function dateValue(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function selectedNeighborhood(
  nodes: readonly WorkNode[],
  relations: readonly GraphRelation[],
  selectedNodeId: string | null,
): ReadonlyMap<string, 0 | 1 | 2> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!selectedNodeId || !nodeIds.has(selectedNodeId)) return new Map();
  const adjacency = new Map(
    [...nodeIds].sort().map((nodeId) => [nodeId, new Set<string>()]),
  );
  const connect = (left: string, right: string) => {
    if (left === right || !nodeIds.has(left) || !nodeIds.has(right)) return;
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  };
  for (const relation of [...relations].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    connect(relation.sourceNodeId, relation.targetNodeId);
  }
  const lanes = new Map<string, WorkNode[]>();
  for (const node of nodes) {
    lanes.set(node.workstreamId, [...(lanes.get(node.workstreamId) ?? []), node]);
  }
  for (const lane of lanes.values()) {
    lane.sort(
      (left, right) =>
        dateValue(left.startedAt) - dateValue(right.startedAt) ||
        left.id.localeCompare(right.id),
    );
    for (let index = 1; index < lane.length; index += 1) {
      connect(lane[index - 1].id, lane[index].id);
    }
  }
  const distances = new Map<string, 0 | 1 | 2>([[selectedNodeId, 0]]);
  const queue: Array<{ id: string; distance: 0 | 1 | 2 }> = [
    { id: selectedNodeId, distance: 0 },
  ];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current || current.distance >= 2) continue;
    const nextDistance = (current.distance + 1) as 1 | 2;
    for (const neighbor of [...(adjacency.get(current.id) ?? [])].sort()) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, nextDistance);
      queue.push({ id: neighbor, distance: nextDistance });
    }
  }
  return distances;
}

function isDecision(node: WorkNode): boolean {
  return node.type === "decision";
}

function forceTopologySnapshot(state: ReturnType<typeof createInitialState>) {
  const display = buildDisplayGraph(state);
  const layout = createTemporalLayout(display.nodes, state.workstreams, {
    width: 848,
    height: 782,
    padding: Math.max(30, 782 * 0.055),
  });
  const baseCollisionRadii = Object.fromEntries(
    display.nodes.map((node) => {
      const position = layout.positions[node.id];
      return [
        node.id,
        position?.isSatellite
          ? 4.5
          : position?.isDuration
            ? 9
            : isDecision(node)
              ? 7.5
              : 8.5,
      ];
    }),
  );
  const influence = selectedNeighborhood(
    display.nodes,
    display.relations,
    state.selectedNodeId ?? null,
  );
  const collisionRadii = Object.fromEntries(
    Object.entries(baseCollisionRadii).map(([nodeId, radius]) => {
      const distance = influence.get(nodeId);
      const extra = distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0;
      return [nodeId, radius + extra];
    }),
  );
  const options: ForceRelaxationOptions = {
    collisionPadding: 4,
    collisionRadii,
    glyphRadii: baseCollisionRadii,
    pinnedOffsets: state.manualNodeOffsets,
  };
  const initial = createForceRelaxation(layout, display.nodes, options);
  const final = runForceRelaxationToStop(initial);
  return {
    key: forceRelaxationKey(layout, display.nodes, options),
    offsets: Object.fromEntries(
      Object.values(final.nodes)
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
        .map((node) => [
          node.nodeId,
          { angleOffset: node.angleOffset, radialOffset: node.radialOffset },
        ]),
    ),
    relationTopology: display.relations
      .map(
        (relation) =>
          `${relation.id}:${relation.sourceNodeId}->${relation.targetNodeId}:${relation.kind}`,
      )
      .sort(),
    visibleRouteIds: display.relations
      .filter((relation) => state.layers[relation.kind])
      .map((relation) => relation.id)
      .sort(),
    originalRelationToDisplay: [...display.originalRelationToDisplay.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
    displayRelationToOriginal: [...display.displayRelationToOriginal.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  };
}

describe("relation-layer physics isolation", () => {
  it.each([
    ["same-source-thread" as RelationKind, false],
    ["related-to" as RelationKind, false],
    ["continues" as RelationKind, false],
    ["same-source-thread" as RelationKind, true],
    ["related-to" as RelationKind, true],
    ["continues" as RelationKind, true],
  ])(
    "toggles %s routes without changing force geometry (collapsed=%s)",
    (layer, collapsed) => {
      const initial = createInitialState();
      const baselineState = collapsed
        ? appReducer(initial, {
            type: "TOGGLE_GROUP_COLLAPSED",
            groupId: "group-recovery-arc",
          })
        : initial;
      const toggledState = appReducer(baselineState, {
        type: "TOGGLE_LAYER",
        layer,
      });
      const baseline = forceTopologySnapshot(baselineState);
      const toggled = forceTopologySnapshot(toggledState);
      const baselineDisplay = buildDisplayGraph(baselineState);
      const toggledDisplay = buildDisplayGraph(toggledState);
      const requestedRouteIds = baselineDisplay.relations
        .filter((relation) => relation.kind === layer)
        .map((relation) => relation.id)
        .sort();
      const layerWasVisible = baselineState.layers[layer];

      expect(requestedRouteIds.length).toBeGreaterThan(0);
      expect(baseline.relationTopology).toEqual(toggled.relationTopology);
      expect(baseline.originalRelationToDisplay).toEqual(
        toggled.originalRelationToDisplay,
      );
      expect(baseline.displayRelationToOriginal).toEqual(
        toggled.displayRelationToOriginal,
      );
      expect(baseline.key).toBe(toggled.key);
      expect(baseline.offsets).toEqual(toggled.offsets);
      expect(
        baseline.visibleRouteIds.filter((relationId) =>
          requestedRouteIds.includes(relationId),
        ),
      ).toEqual(layerWasVisible ? requestedRouteIds : []);
      expect(
        toggled.visibleRouteIds.filter((relationId) =>
          requestedRouteIds.includes(relationId),
        ),
      ).toEqual(layerWasVisible ? [] : requestedRouteIds);
      expect(
        toggled.visibleRouteIds.filter(
          (relationId) => !requestedRouteIds.includes(relationId),
        ),
      ).toEqual(
        baseline.visibleRouteIds.filter(
          (relationId) => !requestedRouteIds.includes(relationId),
        ),
      );

      if (collapsed) {
        const originalId = "relation-shared-recovery-thread";
        const baselineDisplayId = baselineDisplay.originalRelationToDisplay.get(originalId);
        const toggledDisplayId = toggledDisplay.originalRelationToDisplay.get(originalId);
        expect(baselineDisplayId).toBe(toggledDisplayId);
        expect(baselineDisplayId).toMatch(/^bundle:/);
        expect(
          baselineDisplay.relations.find((relation) => relation.id === baselineDisplayId),
        ).toMatchObject({
          sourceNodeId: "group-node:group-recovery-arc",
          targetNodeId: "node-chronological-list",
          kind: "same-source-thread",
        });
        expect(
          toggledDisplay.relations.find((relation) => relation.id === toggledDisplayId),
        ).toMatchObject({
          sourceNodeId: "group-node:group-recovery-arc",
          targetNodeId: "node-chronological-list",
          kind: "same-source-thread",
        });
      }
    },
  );
});

describe("App focus interactions", () => {
  beforeEach(() => {
    latestGraphProps = null;
    window.localStorage.clear();
    window.history.replaceState(null, "", "/?reducedMotion=1");
  });

  it("persists the Codex theme without changing canonical view or selection identity", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/?view=kanban&selected=planned-progressive-handoff&reducedMotion=1",
    );
    render(<App />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), "codex");

    expect(document.querySelector(".threadwake-app")).toHaveAttribute("data-theme", "codex");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("codex");
    expect(new URL(window.location.href).searchParams.get("theme")).toBe("codex");
    expect(new URL(window.location.href).searchParams.get("view")).toBe("kanban");
    expect(new URL(window.location.href).searchParams.get("selected")).toBe(
      "planned-progressive-handoff",
    );
    expect(screen.getByText(/Codex selected\. Codex appearance active\./)).toBeInTheDocument();
  });

  it("restores the complete versioned route on load and browser history without reducer history", async () => {
    window.history.replaceState(
      null,
      "",
      "/?twv=1&view=kanban&selected=planned-progressive-handoff&layers=continues,same-source-thread&q=handoff&collapsed=done&surface=map&reducedMotion=1",
    );
    render(<App />);

    expect(screen.getByRole("button", { name: "Kanban" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("handoff");
    expect(screen.getByRole("checkbox", { name: /Same source thread/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Related work/ })).not.toBeChecked();
    expect(within(screen.getByRole("region", { name: "Done" })).getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Backlog" })).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo the latest planning or demo action" })).toBeDisabled();

    await act(async () => {
      window.history.pushState(
        null,
        "",
        "/?twv=1&view=graph&layers=continues,depends-on&workstream=stream-continuity&q=ownership&collapsed=backlog,done,abandoned&surface=timeline&reducedMotion=1",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Chronological list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("ownership");
    expect(screen.getByRole("checkbox", { name: /Same source thread/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Dependencies/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Undo the latest planning or demo action" })).toBeDisabled();
    expect(new URL(window.location.href).searchParams.get("twv")).toBe("1");
  }, 10_000);

  it("restores a valid URL theme ahead of a stored preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "deep-orbit");
    window.history.replaceState(null, "", "/?theme=codex&reducedMotion=1");
    render(<App />);

    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("codex");
    expect(document.querySelector(".threadwake-app")).toHaveAttribute("data-theme", "codex");
  });

  it("previews and commits one date window without replacing canonical graph identity", async () => {
    const initial = createInitialState();
    const latestNode = [...initial.nodes].sort((left, right) =>
      dateValue(right.endedAt ?? right.startedAt) - dateValue(left.endedAt ?? left.startedAt),
    )[0];
    expect(latestNode).toBeDefined();
    window.history.replaceState(
      null,
      "",
      `/?selected=${latestNode!.id}&reducedMotion=1`,
    );
    render(<App />);

    const topologyNodes = latestGraphProps?.nodes;
    const topologyRelations = latestGraphProps?.relations;
    const topologyIds = topologyNodes?.map((node) => node.id).sort();
    const initialVisibleCount = latestGraphProps?.dateWindowSnapshot?.visibleNodeIds.length ?? 0;
    const endSlider = screen.getByRole("slider", { name: "End date" });
    const earliestDayIndex = Number(endSlider.getAttribute("min"));

    fireEvent.pointerDown(endSlider, { pointerId: 8 });
    fireEvent.input(endSlider, { target: { value: String(earliestDayIndex) } });
    await waitFor(() => {
      expect(latestGraphProps?.dateWindowSnapshot?.visibleNodeIds.length).toBeLessThan(
        initialVisibleCount,
      );
    });
    expect(latestGraphProps?.nodes.map((node) => node.id).sort()).toEqual(topologyIds);
    expect(latestGraphProps?.nodes).toBe(topologyNodes);
    expect(latestGraphProps?.relations).toBe(topologyRelations);
    expect(latestGraphProps?.selectedNodeId).toBe(latestNode!.id);

    fireEvent.pointerUp(endSlider, { pointerId: 8 });
    await waitFor(() => {
      const url = new URL(window.location.href);
      expect(url.searchParams.get("windowStart")).not.toBeNull();
      expect(url.searchParams.get("windowEnd")).not.toBeNull();
    });
    expect(
      screen.getByRole("heading", { name: "Selected work is outside this date window" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reveal its date" }));
    await waitFor(() => {
      expect(latestGraphProps?.dateWindowSnapshot?.visibleNodeIds).toContain(latestNode!.id);
    });
    expect(latestGraphProps?.selectedNodeId).toBe(latestNode!.id);
  });

  it.each([
    ["Same source thread", "same-source-thread" as RelationKind],
    ["Related work", "related-to" as RelationKind],
  ])(
    "passes complete %s topology while its visible route request toggles",
    async (controlName, layer) => {
      const user = userEvent.setup();
      render(<App />);

      const beforeIds = latestGraphProps?.relations.map((relation) => relation.id).sort();
      expect(
        latestGraphProps?.relations.some((relation) => relation.kind === layer),
      ).toBe(true);
      expect(latestGraphProps?.visibleRelationKinds).not.toContain(layer);

      await user.click(screen.getByRole("checkbox", { name: new RegExp(controlName) }));

      await waitFor(() =>
        expect(latestGraphProps?.visibleRelationKinds).toContain(layer),
      );
      expect(latestGraphProps?.relations.map((relation) => relation.id).sort()).toEqual(
        beforeIds,
      );
    },
  );

  it("shows only requested display routes in the list and keeps bundled inspector identity canonical", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("checkbox", { name: /Same source thread/ }));
    await user.click(screen.getByRole("button", { name: "Collapse" }));
    await user.click(screen.getByRole("button", { name: "Chronological list" }));

    const groupLinks = screen.getByLabelText("Links from Status recovery arc");
    const bundledRoute = within(groupLinks).getByRole("button", {
      name: /same source thread Build the chronological alternative/i,
    });
    expect(bundledRoute).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("checkbox", { name: /Same source thread/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: /same source thread Build the chronological alternative/i,
        }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("checkbox", { name: /Same source thread/ }));
    const restoredBundle = await screen.findByRole("button", {
      name: /same source thread Build the chronological alternative/i,
    });
    await user.click(restoredBundle);

    // A bundle ID is presentation-only. Reaching the canonical relationship
    // inspector proves the click was translated back to an original ID.
    expect(await screen.findByRole("heading", { name: "same source thread" })).toBeInTheDocument();
  }, 10_000);

  it("keeps one canonical work identity and lifecycle across Kanban, Graph, and Chronological list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Kanban" }));
    const board = screen.getByRole("region", { name: "Lifecycle board" });
    expect(within(within(board).getByRole("region", { name: "Planned" })).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(within(board).getByRole("region", { name: "Ongoing" })).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(within(board).getByRole("region", { name: "Awaiting review or approval" })).getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(within(within(board).getByRole("region", { name: "Backlog" })).getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(within(within(board).getByRole("region", { name: "Done" })).getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(within(within(board).getByRole("region", { name: "Abandoned" })).getByRole("button", { expanded: false })).toBeInTheDocument();

    const title = "Demonstrate progressive output handoff";
    await user.click(within(board).getByRole("button", { name: new RegExp(`^${title}`) }));
    await user.selectOptions(
      within(board).getByRole("combobox", { name: `Move ${title} to lifecycle` }),
      "ongoing",
    );

    await user.click(screen.getByRole("button", { name: "Graph" }));
    await waitFor(() => expect(latestGraphProps?.selectedNodeId).toBe("planned-progressive-handoff"));
    expect(latestGraphProps?.nodes.find((node) => node.id === "planned-progressive-handoff")?.lifecycle).toBe("ongoing");

    await user.click(screen.getByRole("button", { name: "Chronological list" }));
    expect(document.querySelector("#list-node-title-planned-progressive-handoff")).toHaveTextContent(title);
  });

  it("confirms terminal lifecycle moves, keeps history, and supports undo", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Kanban" }));

    const title = "Specify extraction evaluation cases";
    await user.selectOptions(
      screen.getByRole("combobox", { name: `Move ${title} to lifecycle` }),
      "done",
    );
    const dialog = screen.getByRole("alertdialog", { name: "Move this work to Done?" });
    expect(within(dialog).getByText(/keeps its identifier, evidence, relationships, and full activity history/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Confirm move" }));

    expect(screen.queryByRole("button", { name: new RegExp(`^${title}`) })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo the latest planning or demo action" }));
    expect(screen.getByRole("button", { name: new RegExp(`^${title}`) })).toBeInTheDocument();
  });

  it("renders truthful Kanban error and read-only states without changing canonical work", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/?view=kanban&kanbanState=error&reducedMotion=1");
    const { unmount } = render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("No local lifecycle was changed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("region", { name: "Lifecycle board" })).toBeInTheDocument();
    unmount();

    window.history.replaceState(null, "", "/?view=kanban&kanbanState=readonly&reducedMotion=1");
    render(<App />);
    expect(screen.getByText("Read-only fixture")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: /to lifecycle/ }).every((control) => control.hasAttribute("disabled"))).toBe(true);
  });

  it("uses semantic graph Enter to focus a node in a compact inspector that can reveal evidence", async () => {
    const user = userEvent.setup();
    render(<App />);

    const semanticNode = screen.getByRole("button", {
      name: "Focus Build the first orbital canvas",
    });
    semanticNode.focus();

    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", {
      name: "Build the first orbital canvas",
    })).toBeInTheDocument();
    expect(document.querySelector("#workbench")).toHaveClass("inspector-sheet-peek");
    expect(screen.queryByRole("heading", { name: "What this was" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open details" }));

    expect(document.querySelector("#workbench")).toHaveClass("inspector-sheet-half");
    expect(screen.getByRole("heading", { name: "What this was" })).toBeInTheDocument();
    expect(screen.getByText("Build the first orbital canvas focused.")).toBeInTheDocument();
  });

  it("restores the action composer's invoker after closing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open details" }));
    const startButton = screen.getByRole("button", { name: "Start from here" });
    await user.click(startButton);

    const composer = screen.getByRole("dialog", { name: "What should happen next?" });
    const prompt = screen.getByRole("textbox", { name: "Editable prompt" });
    const scrollBody = composer.querySelector('[data-scroll-container="action-composer-body"]');
    const footer = composer.querySelector("footer");
    const confirmButton = within(composer).getByRole("button", { name: "Run demo" });
    expect(scrollBody).toBeInTheDocument();
    expect(footer).toContainElement(confirmButton);
    expect(scrollBody).not.toContainElement(confirmButton);
    expect(composer.style.maxHeight).not.toBe("");
    expect(prompt).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Close action composer" }));

    await waitFor(() => expect(startButton).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "What should happen next?" })).not.toBeInTheDocument();
  });

  it("keeps the composer's validation controls in the keyboard order after the prompt", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open details" }));
    await user.click(screen.getByRole("button", { name: "Start from here" }));

    const composer = screen.getByRole("dialog", { name: "What should happen next?" });
    await user.click(within(composer).getByRole("radio", { name: /^Continue/ }));
    const prompt = within(composer).getByRole("textbox", { name: "Editable prompt" });
    const microphone = within(composer).getByRole("button", { name: "Start mocked voice input" });
    const addButton = within(composer).getByRole("button", { name: "Add to queue" });
    const runButton = within(composer).getByRole("button", { name: "Run demo" });

    prompt.focus();
    expect(prompt).toHaveFocus();
    await user.tab();
    expect(microphone).toHaveFocus();
    await user.tab();
    expect(addButton).toHaveFocus();
    await user.tab();
    expect(runButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(addButton).toHaveFocus();
  });

  it("traps group-dialog focus and restores the Group selected trigger", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", {
      name: "Add Frame the temporal work map to selection",
    }));
    await user.click(screen.getByRole("button", {
      name: "Add Build the first orbital canvas to selection",
    }));

    const groupButton = screen.getByRole("button", { name: "Group selected" });
    await user.click(groupButton);

    const groupSelector = screen.getByRole("combobox", { name: "Visual group" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(groupSelector).toHaveFocus();

    await user.tab({ shift: true });
    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(groupSelector).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(groupButton).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Group selected work" })).not.toBeInTheDocument();

    await user.click(groupButton);
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Renderer foundations");
    await user.click(screen.getByRole("button", { name: "Review grouping plan" }));
    expect(screen.getByRole("heading", { name: "Confirm two separate effects" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply confirmed plan" }));

    await waitFor(() => expect(document.querySelector("#workbench")).toHaveFocus());
  }, 10_000);

  it("confirms and applies an isolated existing-Project attachment without losing work identities", async () => {
    const user = userEvent.setup();
    const primaryNodes = createInitialState().nodes.filter((node) =>
      node.id === "node-semantic-mirror" || node.id === "node-extraction-evaluator",
    );
    expect(primaryNodes).toHaveLength(2);
    render(<App />);

    act(() => latestGraphProps?.onLassoComplete?.(primaryNodes.map((node) => node.id)));
    await user.click(screen.getByRole("button", { name: "Group selected" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Release boundary");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Forge hierarchy preparation" }),
      "existing-project",
    );
    expect(screen.getByRole("combobox", { name: "Existing fixture Project" })).toHaveValue("fixture-project-threadwake");
    await user.click(screen.getByRole("button", { name: "Review grouping plan" }));

    expect(screen.getByText(/Prepare attachment to “Threadwake canonical application”/)).toBeInTheDocument();
    expect(screen.getByText("2 preserved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply confirmed plan" }));

    expect(screen.getByText(/prepared one isolated fixture Project attachment plan/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo the latest planning or demo action" }));
    expect(screen.queryByText(/prepared one isolated fixture Project attachment plan/i)).not.toBeInTheDocument();
  });

  it.each([
    ["partial-error", "Some canonical work could not be refreshed."],
    ["offline-pending", "Offline with a pending reconciliation."],
    ["reconciliation-conflict", "A reconciliation conflict needs a decision."],
    ["invalid-hierarchy", "The fixture hierarchy is invalid."],
  ])("renders the truthful preserved Kanban state %s", (dataState, message) => {
    window.history.replaceState(null, "", `/?view=kanban&kanbanState=${dataState}&reducedMotion=1`);
    render(<App />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText("Read-only fixture")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: /to lifecycle/ }).every((control) => control.hasAttribute("disabled"))).toBe(true);
  });

  it("keeps queue cards compact by default and lets their titles open the node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Action queue/ }));

    const queueTitle = screen.getByRole("button", {
      name: "Review the discovered handoff report",
    });
    expect(screen.queryByText(/Review the report discovered by the parent/)).not.toBeInTheDocument();

    await user.click(queueTitle);

    expect(await screen.findByRole("heading", {
      name: "Review the discovered handoff report",
    })).toBeInTheDocument();
    expect(document.querySelector("#workbench")).toHaveClass("inspector-sheet-peek");
    expect(screen.queryByRole("list", { name: "Planned actions in execution order" })).not.toBeInTheDocument();
  });
});
