import type {
  AppState,
  FocusState,
  LayerVisibility,
  RelationKind,
  ViewMode,
  WorkLifecycle,
} from "./domain";

export const ROUTE_STATE_VERSION = "1";

const RELATION_KINDS: readonly RelationKind[] = [
  "continues",
  "branches-from",
  "action-of",
  "depends-on",
  "same-source-thread",
  "related-to",
];

const WORK_LIFECYCLES: readonly WorkLifecycle[] = [
  "planned",
  "ongoing",
  "awaiting-review",
  "backlog",
  "done",
  "abandoned",
];

export type GraphSurface = "map" | "timeline";

export interface ParsedRouteState {
  view: ViewMode;
  selectedNodeId?: string;
  selectedRelationId?: string;
  focus: FocusState;
  layers: LayerVisibility;
  searchQuery: string;
  collapsedLifecycles: WorkLifecycle[];
  graphSurface: GraphSurface;
  canonical: boolean;
  invalidReasons: string[];
}

function splitUnique(value: string | null): string[] {
  if (value === null || value === "") return [];
  return [...new Set(value.split(",").filter(Boolean))];
}

export function parseRouteState(
  params: URLSearchParams,
  reference: Pick<
    AppState,
    | "view"
    | "selectedNodeId"
    | "selectedRelationId"
    | "focus"
    | "layers"
    | "searchQuery"
    | "collapsedLifecycles"
    | "nodes"
    | "relations"
    | "workstreams"
  >,
): ParsedRouteState {
  const invalidReasons: string[] = [];
  const version = params.get("twv");
  const versionIsCurrent = version === ROUTE_STATE_VERSION;
  if (!versionIsCurrent) {
    invalidReasons.push(version === null ? "missing route-state version" : "unsupported route-state version");
  }

  const viewParam = params.get("view");
  const view: ViewMode = viewParam === "kanban" || viewParam === "graph"
    ? viewParam
    : reference.view;
  if (viewParam !== null && viewParam !== "kanban" && viewParam !== "graph") {
    invalidReasons.push("invalid view");
  }

  const nodeIds = new Set(reference.nodes.map((node) => node.id));
  const relationIds = new Set(reference.relations.map((relation) => relation.id));
  const selectedParam = params.get("selected");
  const relationParam = params.get("relation");
  const legacySelectionFallback = !versionIsCurrent && selectedParam === null && relationParam === null;
  const selectedNodeId = selectedParam && nodeIds.has(selectedParam)
    ? selectedParam
    : legacySelectionFallback && reference.selectedNodeId && nodeIds.has(reference.selectedNodeId)
      ? reference.selectedNodeId
      : undefined;
  const selectedRelationId = !selectedNodeId && relationParam && relationIds.has(relationParam)
    ? relationParam
    : !selectedNodeId && legacySelectionFallback && reference.selectedRelationId && relationIds.has(reference.selectedRelationId)
      ? reference.selectedRelationId
      : undefined;
  if (selectedParam && !selectedNodeId) invalidReasons.push("unknown selected work identity");
  if (relationParam && !selectedRelationId && !selectedNodeId) invalidReasons.push("unknown selected relationship identity");

  const enabledLayerValues = params.has("layers")
    ? splitUnique(params.get("layers"))
    : RELATION_KINDS.filter((kind) => reference.layers[kind]);
  const enabledLayerSet = new Set(enabledLayerValues);
  const invalidLayer = enabledLayerValues.some(
    (value) => !RELATION_KINDS.includes(value as RelationKind),
  );
  if (invalidLayer) invalidReasons.push("invalid relation-layer filter");
  const layers = Object.fromEntries(
    RELATION_KINDS.map((kind) => [
      kind,
      invalidLayer ? reference.layers[kind] : enabledLayerSet.has(kind),
    ]),
  ) as LayerVisibility;

  const collapsedValues = params.has("collapsed")
    ? splitUnique(params.get("collapsed"))
    : reference.collapsedLifecycles;
  const invalidCollapsed = collapsedValues.some(
    (value) => !WORK_LIFECYCLES.includes(value as WorkLifecycle),
  );
  if (invalidCollapsed) invalidReasons.push("invalid collapsed lifecycle");
  const collapsedLifecycles = invalidCollapsed
    ? [...reference.collapsedLifecycles]
    : collapsedValues as WorkLifecycle[];

  const workstreamParam = params.get("workstream");
  const workstream = workstreamParam
    ? reference.workstreams.find((candidate) => candidate.id === workstreamParam)
    : undefined;
  if (workstreamParam && !workstream) invalidReasons.push("unknown workstream focus");

  let focus: FocusState = { level: "project", trail: [] };
  if (selectedNodeId) {
    const node = reference.nodes.find((candidate) => candidate.id === selectedNodeId);
    focus = { level: "node", nodeId: selectedNodeId, workstreamId: node?.workstreamId, trail: [] };
  } else if (selectedRelationId) {
    const relation = reference.relations.find((candidate) => candidate.id === selectedRelationId);
    const child = reference.nodes.find((candidate) => candidate.id === relation?.targetNodeId);
    focus = { level: "relation", relationId: selectedRelationId, workstreamId: child?.workstreamId, trail: [] };
  } else if (workstream) {
    focus = { level: "workstream", workstreamId: workstream.id, trail: [] };
  }

  const graphSurfaceParam = params.get("surface");
  const graphSurface: GraphSurface = graphSurfaceParam === "timeline" || graphSurfaceParam === "map"
    ? graphSurfaceParam
    : "map";
  if (graphSurfaceParam !== null && graphSurfaceParam !== "timeline" && graphSurfaceParam !== "map") {
    invalidReasons.push("invalid graph surface");
  }

  return {
    view,
    selectedNodeId,
    selectedRelationId,
    focus,
    layers,
    searchQuery: (params.get("q") ?? "").slice(0, 240),
    collapsedLifecycles,
    graphSurface,
    canonical: invalidReasons.length === 0,
    invalidReasons,
  };
}

export function writeRouteStateParams(
  params: URLSearchParams,
  state: Pick<
    AppState,
    | "view"
    | "selectedNodeId"
    | "selectedRelationId"
    | "focus"
    | "layers"
    | "searchQuery"
    | "collapsedLifecycles"
  >,
  graphSurface: GraphSurface,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("twv", ROUTE_STATE_VERSION);
  next.set("view", state.view);
  if (state.selectedNodeId) next.set("selected", state.selectedNodeId);
  else next.delete("selected");
  if (!state.selectedNodeId && state.selectedRelationId) next.set("relation", state.selectedRelationId);
  else next.delete("relation");
  next.set("layers", RELATION_KINDS.filter((kind) => state.layers[kind]).join(","));
  if (state.focus.level === "workstream" && state.focus.workstreamId) {
    next.set("workstream", state.focus.workstreamId);
  } else {
    next.delete("workstream");
  }
  if (state.searchQuery) next.set("q", state.searchQuery);
  else next.delete("q");
  next.set("collapsed", [...new Set(state.collapsedLifecycles)].join(","));
  next.set("surface", graphSurface);
  return next;
}
