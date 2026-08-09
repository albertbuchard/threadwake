import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion as useMotionReducedMotion } from "motion/react";
import {
  ArrowLeft,
  CaretRight,
  CaretUpDown,
  CheckCircle,
  CirclesFour,
  Graph,
  GitBranch,
  Lightning,
  Link,
  ListBullets,
  Stack,
  SelectionSlash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { ActionComposer } from "./components/ActionComposer";
import { ChronologicalList } from "./components/ChronologicalList";
import { DateWindowControl } from "./components/DateWindowControl";
import { KanbanBoard, type KanbanDataState } from "./components/KanbanBoard";
import { NodeInspector } from "./components/NodeInspector";
import { QueueRail } from "./components/QueueRail";
import { RelationInspector } from "./components/RelationInspector";
import {
  TemporalGraphCanvas,
  type GraphPerformanceSample,
} from "./components/TemporalGraphCanvas";
import { TopBar } from "./components/TopBar";
import type {
  ActionDraft,
  ActionKind,
  NodeInspectorData,
  QueueMoveDirection,
  RelationInspectorData,
  TransferDraft,
} from "./components/ui-types";
import type {
  ArtifactKind,
  ContextTransfer,
  DateWindow,
  FixtureProjectAttachmentPlan,
  GraphRelation,
  ImmediateActionKind,
  QueueItem,
  RelationKind,
  WorkGroup,
  WorkLifecycle,
  WorkNode,
} from "./domain";
import {
  isTerminalLifecycle,
  fixtureProjectAttachmentClosure,
  validateFixtureProjectAttachment,
  validateLifecycleMove,
  validateViewGroupSelection,
} from "./kanban-model";
import { createInitialState } from "./seed";
import {
  deriveFullDateWindow,
  parseDateWindowParams,
  projectDateWindow,
  revealWindowForNode,
  writeDateWindowParams,
  type DateWindowProjection,
} from "./date-window-model";
import type { TemporalVisibleInterval } from "./geometry";
import {
  appReducer,
  selectArtifactsForNode,
  selectAvailableTransferArtifacts,
  selectNodeById,
  selectOrderedQueue,
  selectRelationById,
  selectRelationTransfer,
  selectSearchResults,
} from "./state";
import {
  CODEX_TEMPORAL_GRAPH_PALETTE,
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
  themeColorScheme,
  themeUrl,
  type ThemePreference,
} from "./theme";
import {
  parseRouteState,
  writeRouteStateParams,
  type GraphSurface,
} from "./route-state";

const ACTION_TITLES: Record<ActionKind, string> = {
  continue: "Continue this line of work",
  verify: "Verify the current result",
  test: "Test the current result",
  "report-status": "Report status and next steps",
  summarize: "Summarize the important context",
  visualize: "Visualize the current result",
  "plan-next": "Plan the next action",
};

const DEMO_OUTPUTS: Array<{
  delay: number;
  kind: ArtifactKind;
  suffix: string;
  name: string;
  extension: string;
  summary: string;
}> = [
  {
    delay: 560,
    kind: "goal",
    suffix: "goal",
    name: "Prepared goal file",
    extension: "md",
    summary: "The explicit objective, inputs, constraints, and acceptance criteria prepared by the parent.",
  },
  {
    delay: 980,
    kind: "csv",
    suffix: "csv",
    name: "Work-unit inventory",
    extension: "csv",
    summary: "A mocked row-level inventory discovered while the deterministic parent demo is running.",
  },
  {
    delay: 1_400,
    kind: "report",
    suffix: "report",
    name: "Handoff analysis report",
    extension: "md",
    summary: "A mocked report that the queued child can explicitly inherit and review.",
  },
  {
    delay: 1_820,
    kind: "figure",
    suffix: "figure",
    name: "Workstream evidence figure",
    extension: "png",
    summary: "A mocked figure revealed as a selectable output of the parent action.",
  },
  {
    delay: 2_240,
    kind: "manifest",
    suffix: "manifest",
    name: "Output provenance manifest",
    extension: "json",
    summary: "A mocked manifest that records output identity and revision for downstream references.",
  },
  {
    delay: 2_660,
    kind: "code",
    suffix: "code",
    name: "Generated implementation patch",
    extension: "ts",
    summary: "A mocked code artifact discovered last in the progressive handoff demonstration.",
  },
];

interface ComposerState {
  open: boolean;
  parentNodeId?: string;
  anchor?: { x: number; y: number };
  initialPrompt: string;
  initialKind: ActionKind;
  editingQueueItemId?: string;
  parentQueueItemId?: string;
}

interface GroupDialogState {
  open: boolean;
  step: "edit" | "confirm";
  nodeIds: string[];
  name: string;
  note: string;
  overlayColor: string;
  targetGroupId: "new" | string;
  attachmentMode: "visual-only" | "existing-project" | "new-project";
  projectId: string;
  projectName: string;
}

const GROUP_OVERLAY_OPTIONS = [
  { value: "#4e9bb6", label: "Blue" },
  { value: "#8178ae", label: "Violet" },
  { value: "#5e9477", label: "Sage" },
  { value: "#a87845", label: "Amber" },
  { value: "#657f98", label: "Slate" },
] as const;

function projectPlanFromDialog(dialog: GroupDialogState): FixtureProjectAttachmentPlan {
  if (dialog.attachmentMode === "existing-project") {
    return { mode: "existing-project", projectId: dialog.projectId };
  }
  if (dialog.attachmentMode === "new-project") {
    return { mode: "new-project", projectName: dialog.projectName.trim() };
  }
  return { mode: "visual-only" };
}

interface PendingLifecycleMove {
  nodeId: string;
  lifecycle: WorkLifecycle;
  reason: string;
}

interface DisplayGraph {
  nodes: WorkNode[];
  relations: GraphRelation[];
  displayRelationToOriginal: Map<string, string>;
  originalRelationToDisplay: Map<string, string>;
  collapsedGroupByNodeId: Map<string, WorkGroup>;
}

function safeTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createInitialStateFromLocation(): ReturnType<typeof createInitialState> {
  const initial = createInitialState();
  if (typeof window === "undefined") return initial;
  const params = new URLSearchParams(window.location.search);
  const route = parseRouteState(params, initial);
  initial.view = route.view;
  initial.selectedNodeId = route.selectedNodeId;
  initial.selectedRelationId = route.selectedRelationId;
  initial.focus = route.focus;
  initial.layers = route.layers;
  initial.searchQuery = route.searchQuery;
  initial.collapsedLifecycles = route.collapsedLifecycles;
  const fullDateWindow = deriveFullDateWindow(initial.nodes);
  const parsedDateWindow = parseDateWindowParams(params, fullDateWindow);
  initial.dateWindow = parsedDateWindow.window;
  if (!route.canonical || !parsedDateWindow.canonical) {
    const url = new URL(window.location.href);
    const canonicalRoute = writeRouteStateParams(url.searchParams, initial, route.graphSurface);
    url.search = writeDateWindowParams(canonicalRoute, parsedDateWindow.window, fullDateWindow).toString();
    window.history.replaceState(null, "", url);
    initial.announcement = parsedDateWindow.invalidReason
      ? "The shared link contained an invalid date window and was reset safely."
      : "The shared link contained unsupported route values and was restored to safe defaults.";
  }
  return initial;
}

function groupNode(group: WorkGroup, members: WorkNode[]): WorkNode | undefined {
  if (!members.length) return undefined;
  const ordered = [...members].sort((left, right) => safeTime(left.startedAt) - safeTime(right.startedAt));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return undefined;
  const terminalDates = members.map((node) => node.endedAt ?? node.startedAt);
  const endedAt = [...terminalDates].sort((left, right) => safeTime(left) - safeTime(right)).at(-1);
  const unresolved = members.flatMap((node) => node.unresolvedQuestions);
  const artifacts = members.flatMap((node) => node.artifactIds);
  const lifecycle = (["ongoing", "awaiting-review", "planned", "backlog", "abandoned", "done"] as WorkLifecycle[])
    .find((candidate) => members.some((node) => node.lifecycle === candidate)) ?? "done";
  return {
    id: `group-node:${group.id}`,
    title: group.name,
    type: "summary",
    status: members.some((node) => node.status === "active" || node.status === "working")
      ? "active"
      : "ready",
    lifecycle,
    workstreamId: first.workstreamId,
    sourceThreadIds: [...new Set(members.flatMap((node) => node.sourceThreadIds))],
    owner: first.owner,
    startedAt: first.startedAt,
    endedAt,
    summary: `${group.note} This collapsed group contains ${members.length} work units.`,
    outcome: "The group changes only the view. Every member, source thread, artifact, and relationship remains intact.",
    origin: `Collapsed from ${members.length} explicitly grouped work units.`,
    unresolvedQuestions: unresolved.slice(0, 4),
    nextActions: ["Expand this group to inspect its individual work units."],
    artifactIds: [...new Set(artifacts)],
    activity: [
      {
        id: `activity-${group.id}`,
        at: group.createdAt,
        kind: "note",
        message: `${members.length} work units grouped without changing provenance.`,
      },
    ],
    groupId: group.id,
  };
}

export function buildDisplayGraph(
  state: ReturnType<typeof createInitialState>,
  temporalProjection: DateWindowProjection = projectDateWindow(
    state.nodes,
    state.relations,
    state.groups,
    state.dateWindow,
    deriveFullDateWindow(state.nodes),
  ),
): DisplayGraph {
  const collapsedMemberIds = new Set(
    state.groups.filter((group) => group.collapsed).flatMap((group) => group.memberNodeIds),
  );
  const visibleBaseNodes = temporalProjection.visibleNodes
    .filter((node) => !collapsedMemberIds.has(node.id));
  const temporalVisibleIds = temporalProjection.visibleNodeIds;
  const nodeById = new Map(state.nodes.map((node) => [node.id, node]));
  const collapsedGroupByNodeId = new Map<string, WorkGroup>();
  const collapsedNodes: WorkNode[] = [];

  for (const group of state.groups.filter((candidate) => candidate.collapsed)) {
    const members = group.memberNodeIds
      .map((id) => nodeById.get(id))
      .filter((node): node is WorkNode => node !== undefined && temporalVisibleIds.has(node.id));
    const displayNode = groupNode(group, members);
    if (!displayNode) continue;
    collapsedNodes.push(displayNode);
    collapsedGroupByNodeId.set(displayNode.id, group);
  }

  const nodes = [...visibleBaseNodes, ...collapsedNodes];
  const displayNodeIds = new Set(nodes.map((node) => node.id));
  const collapsedEndpoint = new Map<string, string>();
  for (const group of state.groups.filter((candidate) => candidate.collapsed)) {
    const syntheticId = `group-node:${group.id}`;
    if (!displayNodeIds.has(syntheticId)) continue;
    for (const memberId of group.memberNodeIds) collapsedEndpoint.set(memberId, syntheticId);
  }

  const buckets = new Map<string, GraphRelation[]>();
  for (const relation of temporalProjection.visibleRelations) {
    const sourceNodeId = collapsedEndpoint.get(relation.sourceNodeId) ?? relation.sourceNodeId;
    const targetNodeId = collapsedEndpoint.get(relation.targetNodeId) ?? relation.targetNodeId;
    if (sourceNodeId === targetNodeId) continue;
    if (!displayNodeIds.has(sourceNodeId) || !displayNodeIds.has(targetNodeId)) continue;
    if (!temporalVisibleIds.has(relation.sourceNodeId) || !temporalVisibleIds.has(relation.targetNodeId)) continue;
    const key = `${sourceNodeId}\u0000${targetNodeId}\u0000${relation.kind}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ ...relation, sourceNodeId, targetNodeId });
    buckets.set(key, bucket);
  }

  const displayRelationToOriginal = new Map<string, string>();
  const originalRelationToDisplay = new Map<string, string>();
  const relations: GraphRelation[] = [];
  for (const [key, bucket] of buckets) {
    const first = bucket[0];
    if (!first) continue;
    const bundled = bucket.length > 1 || first.sourceNodeId !== state.relations.find((item) => item.id === first.id)?.sourceNodeId || first.targetNodeId !== state.relations.find((item) => item.id === first.id)?.targetNodeId;
    const id = bundled ? `bundle:${key}` : first.id;
    const display: GraphRelation = {
      ...first,
      id,
      label: bucket.length > 1 ? `${bucket.length} bundled ${first.kind.replaceAll("-", " ")} links` : first.label,
      transferId: bucket.length === 1 ? first.transferId : undefined,
    };
    relations.push(display);
    displayRelationToOriginal.set(id, first.id);
    for (const relation of bucket) originalRelationToDisplay.set(relation.id, id);
  }

  return {
    nodes,
    relations,
    displayRelationToOriginal,
    originalRelationToDisplay,
    collapsedGroupByNodeId,
  };
}

function focusLabel(state: ReturnType<typeof createInitialState>): string {
  if (state.focus.level === "relation" && state.focus.relationId) {
    return state.relations.find((relation) => relation.id === state.focus.relationId)?.label ?? "Context link";
  }
  if (state.focus.level === "node" && state.focus.nodeId) {
    return state.nodes.find((node) => node.id === state.focus.nodeId)?.title ?? "Work unit";
  }
  if (state.focus.workstreamId) {
    return state.workstreams.find((stream) => stream.id === state.focus.workstreamId)?.name ?? "Workstream";
  }
  return "Project overview";
}

function actionTitle(kind: ActionKind, prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (clean.length > 0 && clean.length <= 54) return clean.replace(/[.!?]$/, "");
  return ACTION_TITLES[kind];
}

function artifactIdFor(item: QueueItem, suffix: string): string {
  if (item.id === "queue-progressive-handoff") return `artifact-planned-handoff-${suffix}`;
  return `artifact-${item.nodeId}-${suffix}`;
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialStateFromLocation);
  const [previewDateWindow, setPreviewDateWindow] = useState<DateWindow | null>(null);
  const [datePreviewSequence, setDatePreviewSequence] = useState(0);
  const [datePreviewAcceptedAt, setDatePreviewAcceptedAt] = useState(() => globalThis.performance.now());
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage is optional; URL and System remain truthful fallbacks.
    }
    return readThemePreference(window.location.search, stored);
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
      : false,
  );
  const resolvedTheme = resolveTheme(themePreference, systemPrefersDark);
  const requestedKanbanState = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("kanbanState")
    : null;
  const [kanbanDataState, setKanbanDataState] = useState<KanbanDataState>(
    requestedKanbanState === "loading"
      || requestedKanbanState === "error"
      || requestedKanbanState === "empty"
      || requestedKanbanState === "readonly"
      || requestedKanbanState === "partial-error"
      || requestedKanbanState === "offline-pending"
      || requestedKanbanState === "reconciliation-conflict"
      || requestedKanbanState === "invalid-hierarchy"
      ? requestedKanbanState
      : "ready",
  );
  const reducedMotionQa = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("reducedMotion") === "1";
  const systemReducedMotion = useMotionReducedMotion();
  const motionIsReduced = reducedMotionQa || Boolean(systemReducedMotion);
  const [composer, setComposer] = useState<ComposerState>({
    open: false,
    initialPrompt: "",
    initialKind: "plan-next",
  });
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>({
    open: false,
    step: "edit",
    nodeIds: [],
    name: "",
    note: "",
    overlayColor: GROUP_OVERLAY_OPTIONS[0].value,
    targetGroupId: "new",
    attachmentMode: "visual-only",
    projectId: "fixture-project-threadwake",
    projectName: "",
  });
  const [graphSurface, setGraphSurface] = useState<GraphSurface>(() => {
    if (typeof window === "undefined") return "map";
    return parseRouteState(new URLSearchParams(window.location.search), createInitialState()).graphSurface;
  });
  const [pendingLifecycleMove, setPendingLifecycleMove] = useState<PendingLifecycleMove | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [inspectorSheet, setInspectorSheet] = useState<"peek" | "half" | "full">("peek");
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [performance, setPerformance] = useState<GraphPerformanceSample | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const scheduledQueueRuns = useRef(new Set<string>());
  const scheduledImmediateSteps = useRef(new Set<string>());
  const timers = useRef<number[]>([]);
  const composerInvoker = useRef<HTMLElement | null>(null);
  const groupDialogInvoker = useRef<HTMLElement | null>(null);
  const lifecycleDialogInvoker = useRef<HTMLElement | null>(null);
  const groupDialogForm = useRef<HTMLFormElement | null>(null);
  const lifecycleDialogForm = useRef<HTMLFormElement | null>(null);
  const workbench = useRef<HTMLElement | null>(null);
  const dateRouteIntent = useRef<"push" | "replace" | "none">("none");
  const latestState = useRef(state);
  latestState.current = state;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = themeColorScheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (themePreference !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemPrefersDark(event.matches);
    update(media);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [themePreference]);

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The URL still records the explicit preference when storage is unavailable.
    }
    window.history.replaceState(null, "", themeUrl(new URL(window.location.href), nextTheme));
  };

  const restoreInvokerFocus = (
    invoker: { current: HTMLElement | null },
    fallback: HTMLElement | null = workbench.current,
  ) => {
    const target = invoker.current;
    invoker.current = null;
    const restore = () => {
      const focusTarget = target?.isConnected ? target : fallback?.isConnected ? fallback : null;
      focusTarget?.focus();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restore);
    } else {
      window.setTimeout(restore, 0);
    }
  };

  const closeComposer = () => {
    setComposer((current) => ({ ...current, open: false }));
    restoreInvokerFocus(composerInvoker);
  };

  const openGroupDialog = (nodeIds: string[]) => {
    groupDialogInvoker.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setGroupDialog({
      open: true,
      step: "edit",
      nodeIds,
      name: "",
      note: "",
      overlayColor: GROUP_OVERLAY_OPTIONS[0].value,
      targetGroupId: "new",
      attachmentMode: "visual-only",
      projectId: state.fixtureProjects.find((project) => project.status === "active")?.id ?? "",
      projectName: "",
    });
  };

  const closeGroupDialog = () => {
    setGroupDialog((current) => ({ ...current, open: false }));
    restoreInvokerFocus(groupDialogInvoker);
  };

  const closeLifecycleDialog = () => {
    setPendingLifecycleMove(null);
    restoreInvokerFocus(lifecycleDialogInvoker);
  };

  const requestLifecycleMove = (nodeId: string, lifecycle: WorkLifecycle) => {
    if (kanbanDataState === "readonly") {
      setToast({ message: "This fixture is read-only. No lifecycle was changed.", error: true });
      return;
    }
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    const invalid = validateLifecycleMove(state.nodes, nodeId, lifecycle);
    if (invalid) {
      setToast({ message: invalid, error: true });
      return;
    }
    if (!node || node.lifecycle === lifecycle) return;
    if (isTerminalLifecycle(lifecycle)) {
      lifecycleDialogInvoker.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setPendingLifecycleMove({
        nodeId,
        lifecycle,
        reason: lifecycle === "abandoned" ? node.abandonmentReason ?? "" : "",
      });
      return;
    }
    dispatch({ type: "MOVE_NODE_LIFECYCLE", nodeId, lifecycle });
    setToast({ message: `Moved “${node.title}” to the requested lifecycle. Undo is available.` });
  };

  const fullDateWindow = useMemo(() => deriveFullDateWindow(state.nodes), [state.nodes]);
  const effectiveDateWindow = previewDateWindow ?? state.dateWindow;
  const temporalProjection = useMemo(
    () => projectDateWindow(
      state.nodes,
      state.relations,
      state.groups,
      effectiveDateWindow,
      fullDateWindow,
    ),
    [effectiveDateWindow, fullDateWindow, state.groups, state.nodes, state.relations],
  );
  const displayGraph = useMemo(
    () => buildDisplayGraph(state, temporalProjection),
    [state, temporalProjection],
  );
  const fullTemporalProjection = useMemo(
    () => projectDateWindow(
      state.nodes,
      state.relations,
      state.groups,
      fullDateWindow,
      fullDateWindow,
    ),
    [fullDateWindow, state.groups, state.nodes, state.relations],
  );
  // The Pixi scene owns one retained object per canonical/display identity. Date
  // previews therefore change only its imperative snapshot, never its topology.
  const canvasDisplayGraph = useMemo(
    () => buildDisplayGraph(state, fullTemporalProjection),
    [fullTemporalProjection, state.groups, state.nodes, state.relations],
  );
  const dateWindowSnapshot = useMemo(() => {
    const visibleIntervals = new Map<string, TemporalVisibleInterval>(
      [...temporalProjection.clippedIntervals].map(([nodeId, interval]) => [nodeId, {
        startMs: interval.clippedStartMs,
        endMs: interval.clippedEndMs,
        continuesBefore: interval.continuesBefore,
        continuesAfter: interval.continuesAfter,
      }]),
    );
    for (const node of displayGraph.nodes) {
      if (visibleIntervals.has(node.id)) continue;
      const startedAt = Date.parse(node.startedAt);
      const endedAt = Date.parse(node.endedAt ?? node.startedAt);
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue;
      const startMs = Math.max(effectiveDateWindow.startMs, Math.min(startedAt, endedAt));
      const endMs = Math.min(effectiveDateWindow.endMs, Math.max(startedAt, endedAt));
      visibleIntervals.set(node.id, {
        startMs,
        endMs,
        continuesBefore: Math.min(startedAt, endedAt) < effectiveDateWindow.startMs,
        continuesAfter: Math.max(startedAt, endedAt) > effectiveDateWindow.endMs,
      });
    }
    return {
      sequence: datePreviewSequence,
      acceptedAt: datePreviewAcceptedAt,
      window: effectiveDateWindow,
      visibleNodeIds: displayGraph.nodes.map((node) => node.id),
      visibleRelationIds: displayGraph.relations.map((relation) => relation.id),
      visibleIntervals,
    };
  }, [datePreviewAcceptedAt, datePreviewSequence, displayGraph.nodes, displayGraph.relations, effectiveDateWindow, temporalProjection.clippedIntervals]);
  const selectedNode = selectNodeById(state);
  const selectedRelation = selectRelationById(state);
  const selectedTransfer = selectedRelation ? selectRelationTransfer(state, selectedRelation.id) : undefined;
  const searchResults = useMemo(() => selectSearchResults(state), [state]);
  const orderedQueue = useMemo(() => selectOrderedQueue(state), [state]);
  const chronologicalNodes = useMemo(
    () => [...displayGraph.nodes].sort((left, right) =>
      safeTime(left.startedAt) - safeTime(right.startedAt) || left.id.localeCompare(right.id)),
    [displayGraph.nodes],
  );
  const selectedNodeOutsideDateWindow = Boolean(
    state.selectedNodeId && !temporalProjection.visibleNodeIds.has(state.selectedNodeId),
  );
  const selectedRelationOutsideDateWindow = Boolean(
    state.selectedRelationId
    && selectedRelation
    && (
      !temporalProjection.visibleNodeIds.has(selectedRelation.sourceNodeId)
      || !temporalProjection.visibleNodeIds.has(selectedRelation.targetNodeId)
    ),
  );
  const visibleKinds = useMemo(
    () => (Object.entries(state.layers) as Array<[RelationKind, boolean]>)
      .filter(([, visible]) => visible)
      .map(([kind]) => kind),
    [state.layers],
  );
  const visibleDisplayRelations = useMemo(
    () => displayGraph.relations.filter((relation) => state.layers[relation.kind]),
    [displayGraph.relations, state.layers],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const routeParams = writeRouteStateParams(url.searchParams, state, graphSurface);
    url.search = writeDateWindowParams(routeParams, state.dateWindow, fullDateWindow).toString();
    const intent = dateRouteIntent.current;
    dateRouteIntent.current = "none";
    if (intent === "push") window.history.pushState(null, "", url);
    else if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [
    fullDateWindow,
    graphSurface,
    state.collapsedLifecycles,
    state.dateWindow,
    state.focus,
    state.layers,
    state.searchQuery,
    state.selectedNodeId,
    state.selectedRelationId,
    state.view,
  ]);

  useEffect(() => {
    const restoreRouteFromHistory = () => {
      const url = new URL(window.location.href);
      const route = parseRouteState(url.searchParams, latestState.current);
      const parsed = parseDateWindowParams(url.searchParams, fullDateWindow);
      setPreviewDateWindow(null);
      setDatePreviewSequence((sequence) => sequence + 1);
      setDatePreviewAcceptedAt(globalThis.performance.now());
      setGraphSurface(route.graphSurface);
      dateRouteIntent.current = "none";
      if (!route.canonical || !parsed.canonical) {
        const routeParams = writeRouteStateParams(url.searchParams, {
          ...latestState.current,
          view: route.view,
          selectedNodeId: route.selectedNodeId,
          selectedRelationId: route.selectedRelationId,
          focus: route.focus,
          layers: route.layers,
          searchQuery: route.searchQuery,
          collapsedLifecycles: route.collapsedLifecycles,
        }, route.graphSurface);
        url.search = writeDateWindowParams(routeParams, parsed.window, fullDateWindow).toString();
        window.history.replaceState(null, "", url);
      }
      dispatch({
        type: "RESTORE_ROUTE_STATE",
        view: route.view,
        selectedNodeId: route.selectedNodeId,
        selectedRelationId: route.selectedRelationId,
        focus: route.focus,
        layers: route.layers,
        searchQuery: route.searchQuery,
        collapsedLifecycles: route.collapsedLifecycles,
        dateWindow: parsed.window,
        announcement: route.canonical && parsed.canonical
          ? "The complete Threadwake view was restored from browser history."
          : "Unsupported route values were rejected and the complete safe view was restored.",
      });
    };
    window.addEventListener("popstate", restoreRouteFromHistory);
    return () => window.removeEventListener("popstate", restoreRouteFromHistory);
  }, [fullDateWindow]);

  const nodeInspectorData = useMemo<NodeInspectorData | null>(() => {
    if (!selectedNode) return null;
    return {
      node: selectedNode,
      workstream: state.workstreams.find((stream) => stream.id === selectedNode.workstreamId),
      sourceThreads: selectedNode.sourceThreadIds
        .map((id) => state.sourceThreads.find((thread) => thread.id === id))
        .filter((thread) => thread !== undefined),
      artifacts: selectArtifactsForNode(state, selectedNode.id),
      parent: selectedNode.parentNodeId
        ? state.nodes.find((node) => node.id === selectedNode.parentNodeId)
        : undefined,
      children: state.nodes.filter((node) => node.parentNodeId === selectedNode.id),
    };
  }, [selectedNode, state]);

  const relationInspectorData = useMemo<RelationInspectorData | null>(() => {
    if (!selectedRelation || !selectedTransfer) return null;
    const parent = state.nodes.find((node) => node.id === selectedRelation.sourceNodeId);
    const child = state.nodes.find((node) => node.id === selectedRelation.targetNodeId);
    if (!parent || !child) return null;
    return {
      relation: selectedRelation,
      transfer: selectedTransfer,
      parent,
      child,
      availableArtifacts: selectAvailableTransferArtifacts(state, selectedTransfer.id),
    };
  }, [selectedRelation, selectedTransfer, state]);

  useEffect(() => {
    for (const item of state.queue.filter((candidate) => candidate.status === "simulated-running")) {
      const runKey = `${item.id}:${item.activity.filter((entry) => entry.message.includes("started in")).length}`;
      if (scheduledQueueRuns.current.has(runKey)) continue;
      scheduledQueueRuns.current.add(runKey);
      for (const output of DEMO_OUTPUTS) {
        timers.current.push(window.setTimeout(() => {
          dispatch({
            type: "DISCOVER_QUEUE_OUTPUT",
            queueItemId: item.id,
            artifact: {
              id: artifactIdFor(item, output.suffix),
              name: output.name,
              kind: output.kind,
              path: `artifacts/demo/${item.nodeId}/${output.suffix}.${output.extension}`,
              summary: output.summary,
            },
          });
        }, output.delay));
      }
      timers.current.push(window.setTimeout(() => {
        dispatch({ type: "COMPLETE_QUEUE_ITEM", queueItemId: item.id });
      }, 3_180));
    }
  }, [state.queue]);

  useEffect(() => {
    for (const node of state.nodes.filter(
      (candidate) => candidate.id.startsWith("node-immediate-") && (candidate.status === "queued" || candidate.status === "working"),
    )) {
      const stepKey = `${node.id}:${node.status}`;
      if (scheduledImmediateSteps.current.has(stepKey)) continue;
      scheduledImmediateSteps.current.add(stepKey);
      timers.current.push(window.setTimeout(() => {
        dispatch({ type: "ADVANCE_IMMEDIATE_ACTION", nodeId: node.id });
      }, node.status === "queued" ? 520 : 1_050));
    }
  }, [state.nodes]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (state.multiSelectedNodeIds.length >= 1) {
          openGroupDialog(state.multiSelectedNodeIds);
        } else {
          setToast({
            message: "Shift-click a node or Shift-drag from empty space to select work first.",
            error: true,
          });
        }
      }
      if (event.key === "Escape") {
        if (composer.open) {
          closeComposer();
          return;
        }
        if (pendingLifecycleMove) {
          closeLifecycleDialog();
          return;
        }
        if (groupDialog.open) {
          closeGroupDialog();
          return;
        }
        dispatch({ type: "STEP_FOCUS_OUT" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [composer.open, groupDialog.open, pendingLifecycleMove, state.multiSelectedNodeIds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openComposer = (
    parentNodeId: string,
    options: Partial<Omit<ComposerState, "open" | "parentNodeId">> = {},
  ) => {
    composerInvoker.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setComposer({
      open: true,
      parentNodeId,
      initialPrompt: options.initialPrompt ?? "",
      initialKind: options.initialKind ?? "plan-next",
      editingQueueItemId: options.editingQueueItemId,
      parentQueueItemId: options.parentQueueItemId,
      anchor: options.anchor,
    });
  };

  const closeInspector = () => {
    dispatch({ type: "SELECT_NODE", nodeId: undefined });
    if (state.focus.level !== "project") dispatch({ type: "STEP_FOCUS_OUT" });
    setInspectorSheet("peek");
  };

  const revealNodeInspector = () => {
    setInspectorSheet("peek");
  };

  const revealRelationInspector = () => {
    setInspectorSheet("half");
  };

  const handleNodeSelect = (nodeId: string, additive = false) => {
    const collapsedGroup = displayGraph.collapsedGroupByNodeId.get(nodeId);
    if (collapsedGroup) {
      dispatch({ type: "TOGGLE_GROUP_COLLAPSED", groupId: collapsedGroup.id });
      return;
    }
    if (additive) {
      dispatch({ type: "TOGGLE_MULTI_SELECT", nodeId });
      return;
    }
    dispatch({ type: "FOCUS_NODE", nodeId });
    revealNodeInspector();
  };

  const handleNodeFocus = (nodeId: string) => {
    const collapsedGroup = displayGraph.collapsedGroupByNodeId.get(nodeId);
    if (collapsedGroup) {
      dispatch({ type: "TOGGLE_GROUP_COLLAPSED", groupId: collapsedGroup.id });
      return;
    }
    dispatch({ type: "FOCUS_NODE", nodeId });
    revealNodeInspector();
  };

  const handleRelationSelect = (displayRelationId: string) => {
    const currentCanonicalId = state.selectedRelationId;
    const currentDisplayId = currentCanonicalId
      ? displayGraph.originalRelationToDisplay.get(currentCanonicalId)
      : undefined;
    const representativeId = displayGraph.displayRelationToOriginal.get(displayRelationId);
    const relationId = currentCanonicalId && currentDisplayId === displayRelationId
      ? currentCanonicalId
      : representativeId ?? state.relations.find((relation) => relation.id === displayRelationId)?.id;
    // Display-only bundle IDs must never enter canonical application state.
    if (!relationId || relationId.startsWith("bundle:")) return;
    dispatch({ type: "FOCUS_RELATION", relationId });
    revealRelationInspector();
  };

  const handleQueueDraft = (draft: ActionDraft) => {
    const title = actionTitle(draft.kind, draft.prompt);
    const createsChild = !composer.editingQueueItemId;
    if (composer.editingQueueItemId) {
      dispatch({
        type: "UPDATE_QUEUE_ITEM",
        queueItemId: composer.editingQueueItemId,
        changes: { prompt: draft.prompt },
      });
    } else if (composer.parentQueueItemId) {
      dispatch({
        type: "ADD_QUEUE_CHILD",
        parentQueueItemId: composer.parentQueueItemId,
        title: `Then: ${title}`,
        prompt: draft.prompt,
        executionKind: "plan",
      });
    } else {
      dispatch({
        type: "PLAN_NEXT_ACTION",
        parentNodeId: draft.parentNodeId,
        title,
        prompt: draft.prompt,
        executionKind: "plan",
      });
    }
    if (createsChild) setInspectorSheet("peek");
    closeComposer();
    setQueueExpanded(false);
    setToast({
      message: draft.kind === "plan-next"
        ? "Prompt prepared and queued. Nothing was run."
        : "Action added to the queue as an inert draft.",
    });
  };

  const handleImmediateDemo = (draft: ActionDraft) => {
    if (draft.kind === "plan-next") return;
    dispatch({
      type: "CREATE_IMMEDIATE_ACTION",
      parentNodeId: draft.parentNodeId,
      actionKind: draft.kind as ImmediateActionKind,
      title: actionTitle(draft.kind, draft.prompt),
      prompt: draft.prompt,
    });
    setInspectorSheet("peek");
    closeComposer();
    setToast({ message: "Deterministic immediate-action demo started. No real agent or external system was invoked." });
  };

  const handleTransferSave = (transferId: string, draft: TransferDraft) => {
    dispatch({
      type: "UPDATE_CONTEXT_TRANSFER",
      transferId,
      instructions: draft.instructions,
      includeParentGoalFile: draft.includeParentGoalFile,
      artifactIds: draft.artifactIds,
    });
    setToast({ message: "Parent-to-child handoff saved and references rechecked." });
  };

  const handleMoveQueueItem = (queueItemId: string, direction: QueueMoveDirection) => {
    const index = orderedQueue.findIndex((item) => item.id === queueItemId);
    if (index < 0) return;
    dispatch({
      type: "REORDER_QUEUE_ITEM",
      queueItemId,
      toIndex: direction === "up" ? index - 1 : index + 1,
    });
  };

  const canMoveQueueItem = (queueItemId: string, direction: QueueMoveDirection): boolean => {
    const index = orderedQueue.findIndex((item) => item.id === queueItemId);
    const item = orderedQueue[index];
    if (!item) return false;
    if (direction === "up") {
      if (index <= 0) return false;
      return item.parentQueueItemId !== orderedQueue[index - 1]?.id;
    }
    if (index >= orderedQueue.length - 1) return false;
    return orderedQueue[index + 1]?.parentQueueItemId !== item.id;
  };

  const resetDemo = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    scheduledQueueRuns.current.clear();
    scheduledImmediateSteps.current.clear();
    setComposer((current) => ({ ...current, open: false }));
    setGroupDialog((current) => ({ ...current, open: false }));
    setPendingLifecycleMove(null);
    setGraphSurface("map");
    setInspectorSheet("peek");
    setQueueExpanded(true);
    setPerformance(null);
    setPreviewDateWindow(null);
    setDatePreviewSequence((sequence) => sequence + 1);
    setDatePreviewAcceptedAt(globalThis.performance.now());
    dateRouteIntent.current = "replace";
    setCameraResetKey((key) => key + 1);
    dispatch({ type: "RESET" });
    setToast({ message: "Deterministic fixture reset." });
  };

  const commitDateWindow = (
    window: DateWindow,
    source: "gesture" | "reset" | "reveal",
    acceptedAt = globalThis.performance.now(),
  ) => {
    if (
      window.startMs === state.dateWindow.startMs
      && window.endMs === state.dateWindow.endMs
    ) {
      setPreviewDateWindow(null);
      dateRouteIntent.current = "none";
      return;
    }
    flushSync(() => {
      setPreviewDateWindow(null);
      setDatePreviewSequence((sequence) => sequence + 1);
      setDatePreviewAcceptedAt(acceptedAt);
      dateRouteIntent.current = "push";
      dispatch({ type: "SET_DATE_WINDOW", window, source });
    });
  };

  const cancelDateWindowPreview = (acceptedAt = globalThis.performance.now()) => {
    setPreviewDateWindow(null);
    setDatePreviewSequence((sequence) => sequence + 1);
    setDatePreviewAcceptedAt(acceptedAt);
  };

  const revealSelectedDate = () => {
    if (!state.selectedNodeId) return;
    commitDateWindow(
      revealWindowForNode(
        state.dateWindow,
        state.selectedNodeId,
        state.nodes,
        fullDateWindow,
      ),
      "reveal",
    );
  };

  const revealSelectedRelationDates = () => {
    if (!selectedRelation) return;
    const withSource = revealWindowForNode(
      state.dateWindow,
      selectedRelation.sourceNodeId,
      state.nodes,
      fullDateWindow,
    );
    commitDateWindow(
      revealWindowForNode(
        withSource,
        selectedRelation.targetNodeId,
        state.nodes,
        fullDateWindow,
      ),
      "reveal",
    );
  };

  const undoLatestChange = () => {
    setPreviewDateWindow(null);
    setDatePreviewSequence((sequence) => sequence + 1);
    setDatePreviewAcceptedAt(globalThis.performance.now());
    dateRouteIntent.current = "replace";
    dispatch({ type: "UNDO" });
  };

  const parentForComposer = composer.parentNodeId
    ? state.nodes.find((node) => node.id === composer.parentNodeId)
    : undefined;
  const selectedDisplayRelationId = state.selectedRelationId
    ? displayGraph.originalRelationToDisplay.get(state.selectedRelationId) ?? state.selectedRelationId
    : undefined;
  const inspectorContentKey = selectedRelation
    ? `relation:${selectedRelation.id}`
    : selectedNode
      ? `node:${selectedNode.id}`
      : "empty";
  const performanceIsGood = Boolean(
    performance && performance.framesPerSecond >= 50 && performance.longFramesOver100Ms === 0,
  );
  const activeGroups = state.groups.filter((group) =>
    group.memberNodeIds.some((id) => displayGraph.nodes.some((node) => node.id === id)) || group.collapsed,
  );

  return (
    <div
      className="threadwake-app"
      data-theme={resolvedTheme}
      data-theme-preference={themePreference}
    >
      <TopBar
        projectLabel="Agent workspace redesign"
        searchQuery={state.searchQuery}
        searchResultCount={state.searchQuery ? searchResults.length : undefined}
        view={state.view}
        layers={state.layers}
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        canUndo={state.history.length > 0}
        onSearchChange={(query) => dispatch({ type: "SET_SEARCH_QUERY", query })}
        onSearchSubmit={(query) => {
          const first = selectSearchResults(state, query)[0];
          if (!first) {
            setToast({ message: "No work unit matches that search.", error: true });
            return;
          }
          dispatch({ type: "FOCUS_NODE", nodeId: first.id });
          revealNodeInspector();
        }}
        onViewChange={(view) => dispatch({ type: "SET_VIEW", view })}
        onToggleLayer={(layer) => dispatch({ type: "TOGGLE_LAYER", layer })}
        onThemeChange={handleThemeChange}
        onUndo={undoLatestChange}
        onReset={resetDemo}
      />

      <main
        ref={workbench}
        id="workbench"
        tabIndex={-1}
        className={`workbench view-${state.view} inspector-sheet-${inspectorSheet}${motionIsReduced ? " is-reduced-motion" : ""}${queueExpanded ? " has-expanded-queue" : ""}${selectedNode && !selectedRelation && inspectorSheet === "peek" ? " has-node-peek" : ""}`}
      >
        {state.view === "graph" ? (
          <div className="graph-surface-switch" role="group" aria-label="Choose a graph evidence view">
            <button
              type="button"
              className={graphSurface === "map" ? "is-active" : undefined}
              aria-pressed={graphSurface === "map"}
              onClick={() => setGraphSurface("map")}
            >
              <Graph aria-hidden="true" size={16} /> <span>Orbital graph</span>
            </button>
            <button
              type="button"
              className={graphSurface === "timeline" ? "is-active" : undefined}
              aria-pressed={graphSurface === "timeline"}
              onClick={() => setGraphSurface("timeline")}
            >
              <ListBullets aria-hidden="true" size={16} /> <span>Chronological list</span>
            </button>
          </div>
        ) : null}
        {state.view === "graph" ? (
          <DateWindowControl
            committed={state.dateWindow}
            bounds={fullDateWindow}
            onPreview={(window, meta) => {
              setDatePreviewSequence((sequence) => sequence + 1);
              setDatePreviewAcceptedAt(meta.acceptedAt);
              setPreviewDateWindow(window);
            }}
            onCommit={(window, meta) => {
              commitDateWindow(
                window,
                meta.reason === "show-full" ? "reset" : "gesture",
                meta.acceptedAt,
              );
            }}
            onCancel={(window, meta) => {
              cancelDateWindowPreview(meta.acceptedAt);
            }}
          />
        ) : null}
        <section
          className={`graph-region${state.view === "graph" && graphSurface === "map" ? "" : " is-view-hidden"}`}
          aria-label="Temporal workgraph map"
          aria-hidden={state.view === "graph" && graphSurface === "map" ? undefined : true}
        >
            <TemporalGraphCanvas
              className="threadwake-graph"
              nodes={canvasDisplayGraph.nodes}
              relations={canvasDisplayGraph.relations}
              workstreams={state.workstreams}
              groups={state.groups}
              selectedNodeId={state.selectedNodeId}
              selectedRelationId={selectedDisplayRelationId}
              multiSelectedNodeIds={state.multiSelectedNodeIds}
              focusedWorkstreamId={state.focus.workstreamId}
              focusedNodeId={state.focus.nodeId}
              cameraResetKey={cameraResetKey}
              manualNodeOffsets={state.manualNodeOffsets}
              visibleRelationKinds={visibleKinds}
              dateWindowSnapshot={dateWindowSnapshot}
              reducedMotion={reducedMotionQa ? true : undefined}
              palette={resolvedTheme === "codex" ? CODEX_TEMPORAL_GRAPH_PALETTE : undefined}
              onNodeSelect={(nodeId, meta) => handleNodeSelect(nodeId, meta.additive)}
              onRelationSelect={handleRelationSelect}
              onNodeFocus={(nodeId) => handleNodeFocus(nodeId)}
              onStepOut={() => dispatch({ type: "STEP_FOCUS_OUT" })}
              onActionDragComplete={({ sourceNodeId, clientPoint }) => openComposer(sourceNodeId, {
                anchor: clientPoint,
              })}
              onNodeMoveComplete={({ nodeId, angleOffset, radialOffset }) => {
                dispatch({
                  type: "SET_MANUAL_NODE_OFFSET",
                  nodeId,
                  offset: { angleOffset, radialOffset },
                });
              }}
              onLassoComplete={(nodeIds) => {
                dispatch({
                  type: "SET_MULTI_SELECTION",
                  nodeIds: [...new Set([...state.multiSelectedNodeIds, ...nodeIds])],
                });
              }}
              onPerformanceSample={setPerformance}
              onRendererError={(error) => setToast({ message: error.message, error: true })}
            />

            <div className="graph-hud">
              <div className="graph-hud__top">
                <nav className="focus-breadcrumb" aria-label="Semantic focus">
                  <button
                    type="button"
                    aria-current={state.focus.level === "project" ? "page" : undefined}
                    onClick={() => {
                      const steps = state.focus.trail.length + (state.focus.level === "project" ? 0 : 1);
                      for (let index = 0; index < steps; index += 1) dispatch({ type: "STEP_FOCUS_OUT" });
                    }}
                  >
                    Threadwake
                  </button>
                  {state.focus.level !== "project" ? <CaretRight aria-hidden="true" size={12} /> : null}
                  {state.focus.level !== "project" ? (
                    <button type="button" aria-current="page" onClick={() => dispatch({ type: "STEP_FOCUS_OUT" })}>
                      {focusLabel(state)}
                    </button>
                  ) : null}
                </nav>

                <p className="graph-gesture-hint">Blank drag: pan · Node drag: branch · Shift-node: move</p>
              </div>

              {activeGroups.length ? (
                <div className="group-strip" aria-label="Work groups">
                  {activeGroups.map((group) => (
                    <div
                      className="group-chip"
                      key={group.id}
                      style={{ "--group-overlay-color": group.overlayColor } as CSSProperties}
                    >
                      <CirclesFour aria-hidden="true" size={15} />
                      <span>
                        <strong>{group.name}</strong>
                        <small>{group.memberNodeIds.length} work units</small>
                      </span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "TOGGLE_GROUP_COLLAPSED", groupId: group.id })}
                      >
                        {group.collapsed ? "Expand" : "Collapse"}
                      </button>
                      <button
                        className="icon-button icon-button--small"
                        type="button"
                        aria-label={`Ungroup ${group.name}`}
                        onClick={() => dispatch({ type: "UNGROUP", groupId: group.id })}
                      >
                        <SelectionSlash aria-hidden="true" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <p className="graph-mobile-orientation">
              Start at the centre and move outward through time. Each direction is a workstream.
              Select a line to see why two items are connected.
            </p>

            <div className="map-legend" aria-label="Map legend">
              <span className="legend-rule"><strong>Centre → outward</strong> earlier → later</span>
              <span className="legend-rule"><strong>Direction</strong> workstream</span>
              <span className="legend-rule"><strong>Lines</strong> select to see why work is linked</span>
              <span className="legend-item"><i className="legend-dot" /> primary work</span>
              <span className="legend-item"><i className="legend-diamond" /> scoped action</span>
              <span className="legend-item"><i className="legend-dot legend-dot--planned" /> planned</span>
              <span className="legend-item"><i className="legend-dot legend-dot--failure" /> failed</span>
            </div>

            <div className="demo-chip">
              <Lightning aria-hidden="true" size={13} weight="fill" /> deterministic demo
            </div>
            <div
              className={`performance-chip${performanceIsGood ? " is-good" : performance ? " is-warning" : ""}`}
              data-testid="performance-chip"
              data-fps={performance?.framesPerSecond.toFixed(1)}
              data-max-frame-ms={performance?.maxFrameTimeMs.toFixed(1)}
              data-long-frames={performance?.longFramesOver100Ms ?? 0}
              title={performance ? `Mean ${performance.meanFrameTimeMs.toFixed(1)} ms · max ${performance.maxFrameTimeMs.toFixed(1)} ms` : "Waiting for a performance sample"}
            >
              {performanceIsGood ? <CheckCircle aria-hidden="true" size={13} weight="fill" /> : <Lightning aria-hidden="true" size={13} />}
              {performance ? `${Math.round(performance.framesPerSecond)} FPS` : "warming up"}
            </div>

            {state.multiSelectedNodeIds.length > 0 ? (
              <div className="group-toolbar" role="status">
                <span>{state.multiSelectedNodeIds.length} selected</span>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={state.multiSelectedNodeIds.length < 1}
                  onClick={() => openGroupDialog(state.multiSelectedNodeIds)}
                >
                  <Stack aria-hidden="true" size={16} /> Group selected
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear selected work units"
                  onClick={() => dispatch({ type: "CLEAR_MULTI_SELECTION" })}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
            ) : null}
        </section>
        {state.view === "graph" && graphSurface === "timeline" ? (
          <section className="list-region">
            <ChronologicalList
                nodes={chronologicalNodes}
                relations={visibleDisplayRelations}
                workstreams={state.workstreams}
                sourceThreads={state.sourceThreads}
                groups={state.groups}
                allNodes={state.nodes}
                selectedNodeId={state.selectedNodeId}
                selectedRelationId={selectedDisplayRelationId}
                multiSelectedNodeIds={state.multiSelectedNodeIds}
                onSelectNode={(nodeId) => handleNodeSelect(nodeId)}
                onFocusNode={handleNodeFocus}
                onStartAction={(nodeId) => openComposer(nodeId)}
                onToggleMultiSelect={(nodeId) => dispatch({ type: "TOGGLE_MULTI_SELECT", nodeId })}
                onSelectRelation={handleRelationSelect}
                onCreateGroup={openGroupDialog}
                onClearMultiSelection={() => dispatch({ type: "CLEAR_MULTI_SELECTION" })}
                onToggleGroup={(groupId) => dispatch({ type: "TOGGLE_GROUP_COLLAPSED", groupId })}
                onUngroup={(groupId) => dispatch({ type: "UNGROUP", groupId })}
            />
          </section>
        ) : null}

        {state.view === "kanban" ? (
          <section className="kanban-region" aria-label="Canonical work lifecycle">
              <KanbanBoard
                nodes={state.nodes}
                groups={state.groups}
                workstreams={state.workstreams}
                fixtureProjects={state.fixtureProjects}
                fixtureProjectAttachments={state.fixtureProjectAttachments}
                selectedNodeId={state.selectedNodeId}
                multiSelectedNodeIds={state.multiSelectedNodeIds}
                collapsedLifecycles={state.collapsedLifecycles}
                searchQuery={state.searchQuery}
                dataState={kanbanDataState}
                onSelectNode={(nodeId) => handleNodeSelect(nodeId)}
                onToggleMultiSelect={(nodeId) => dispatch({ type: "TOGGLE_MULTI_SELECT", nodeId })}
                onMoveNode={requestLifecycleMove}
                onToggleColumn={(lifecycle) => dispatch({ type: "TOGGLE_LIFECYCLE_COLLAPSED", lifecycle })}
                onCreateGroup={openGroupDialog}
                onRetry={() => {
                  setKanbanDataState("ready");
                  const url = new URL(window.location.href);
                  url.searchParams.delete("kanbanState");
                  window.history.replaceState(null, "", url);
                }}
            />
          </section>
        ) : null}

        {state.view === "graph" ? <QueueRail
          data={{
            items: orderedQueue,
            nodes: state.nodes,
            groups: state.groups,
            transfers: state.transfers,
            artifacts: state.artifacts,
          }}
          expanded={queueExpanded}
          onToggleExpanded={() => setQueueExpanded((expanded) => !expanded)}
          onToggleSelection={(queueItemId) => dispatch({ type: "TOGGLE_QUEUE_SELECTION", queueItemId })}
          onChangeExecutionKind={(queueItemId, executionKind) => dispatch({
            type: "UPDATE_QUEUE_ITEM",
            queueItemId,
            changes: { executionKind },
          })}
          onEditItem={(queueItemId) => {
            const item = orderedQueue.find((candidate) => candidate.id === queueItemId);
            if (!item) return;
            openComposer(item.parentNodeId, {
              initialKind: "plan-next",
              initialPrompt: item.prompt,
              editingQueueItemId: item.id,
            });
          }}
          onAddChild={(queueItemId) => {
            const item = orderedQueue.find((candidate) => candidate.id === queueItemId);
            if (!item) return;
            openComposer(item.nodeId, { initialKind: "plan-next", parentQueueItemId: item.id });
          }}
          onOpenTransfer={(relationId) => {
            dispatch({ type: "FOCUS_RELATION", relationId });
            revealRelationInspector();
            setQueueExpanded(false);
          }}
          onOpenNode={(nodeId) => {
            handleNodeSelect(nodeId);
            setQueueExpanded(false);
          }}
          onMoveItem={handleMoveQueueItem}
          canMoveItem={canMoveQueueItem}
          onPlaySelected={() => {
            dispatch({ type: "PLAY_SELECTED" });
            setToast({ message: "Play requested only for selected items. Dependencies and required handoffs are being checked." });
          }}
        /> : null}

        <aside className={`inspector-shell sheet-${inspectorSheet}${inspectorSheet === "full" ? " is-open" : ""}${selectedNode && !selectedRelation && inspectorSheet === "peek" ? " is-node-peek" : ""}`}>
          <button
            className="mobile-sheet-handle"
            type="button"
            aria-label={
              inspectorSheet === "peek"
                ? "Open work details halfway"
                : inspectorSheet === "half"
                  ? "Open work details fully"
                  : "Collapse work details"
            }
            onClick={() => setInspectorSheet((current) =>
              current === "peek" ? "half" : current === "half" ? "full" : "peek"
            )}
          >
            <CaretUpDown aria-hidden="true" size={17} />
            <span>{inspectorSheet === "peek" ? "Open details" : inspectorSheet === "half" ? "Expand details" : "Collapse details"}</span>
          </button>
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={inspectorContentKey}
              className="inspector-transition-frame"
              initial={motionIsReduced ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={motionIsReduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
              transition={motionIsReduced
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {selectedNodeOutsideDateWindow || selectedRelationOutsideDateWindow ? (
                <section className="date-window-recovery" role="status" aria-live="polite">
                  <p className="inspector-eyebrow">Outside visible dates</p>
                  <h2>
                    {selectedNodeOutsideDateWindow
                      ? "Selected work is outside this date window"
                      : "Selected relationship is outside this date window"}
                  </h2>
                  <p>
                    The canonical identity and evidence remain selected. Reveal the required dates or clear the selection explicitly.
                  </p>
                  <div className="date-window-recovery__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={selectedNodeOutsideDateWindow ? revealSelectedDate : revealSelectedRelationDates}
                    >
                      Reveal its date
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => dispatch({ type: "CLEAR_SELECTION_AND_FOCUS" })}
                    >
                      Clear selection
                    </button>
                  </div>
                </section>
              ) : null}
              {selectedRelation && !selectedTransfer ? (
                <div className="inspector relationship-summary">
              <header className="inspector-header">
                <div>
                  <p className="inspector-eyebrow"><Link aria-hidden="true" size={15} /> Relationship</p>
                  <h2>{selectedRelation.label ?? selectedRelation.kind.replaceAll("-", " ")}</h2>
                </div>
                <button className="icon-button" type="button" aria-label="Close relationship details" onClick={closeInspector}>
                  <X aria-hidden="true" size={18} />
                </button>
              </header>
              <div className="inspector-scroll">
                <section className="inspector-section">
                  <h3><GitBranch aria-hidden="true" size={17} /> Informational link</h3>
                  <p>This link records useful provenance, but it does not create execution order or pass outputs.</p>
                  <button className="button button--secondary" type="button" onClick={() => handleNodeSelect(selectedRelation.sourceNodeId)}>
                    <ArrowLeft aria-hidden="true" size={16} /> Open source work
                  </button>
                </section>
              </div>
                </div>
              ) : selectedRelation ? (
                <RelationInspector
                  data={relationInspectorData}
                  onClose={closeInspector}
                  onSave={handleTransferSave}
                  onSelectNode={(nodeId) => handleNodeSelect(nodeId)}
                  onRefreshReference={(transferId, artifactId) => dispatch({ type: "REFRESH_TRANSFER_REFERENCE", transferId, artifactId })}
                  onRemoveReference={(transferId, artifactId) => dispatch({ type: "REMOVE_TRANSFER_REFERENCE", transferId, artifactId })}
                />
              ) : (
                <NodeInspector
                  data={nodeInspectorData}
                  collapsed={inspectorSheet === "peek"}
                  onClose={closeInspector}
                  onToggleDetails={() => setInspectorSheet((current) => current === "peek" ? "half" : "peek")}
                  onFocusNode={handleNodeFocus}
                  onSelectNode={(nodeId) => handleNodeSelect(nodeId)}
                  onStartAction={(nodeId, suggestedPrompt) => openComposer(nodeId, { initialPrompt: suggestedPrompt ?? "" })}
                  onOpenArtifact={(artifactId) => {
                    const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
                    if (artifact) setToast({ message: `${artifact.name} · ${artifact.path}` });
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </aside>
      </main>

      <ActionComposer
        open={composer.open}
        parent={parentForComposer ?? null}
        anchor={composer.anchor}
        initialPrompt={composer.initialPrompt}
        initialKind={composer.initialKind}
        onClose={closeComposer}
        onAddToQueue={handleQueueDraft}
        onRunDemo={handleImmediateDemo}
      />

      {pendingLifecycleMove ? (
        <div className="group-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeLifecycleDialog();
        }}>
          <form
            ref={lifecycleDialogForm}
            className="group-dialog lifecycle-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lifecycle-dialog-title"
            aria-describedby="lifecycle-dialog-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeLifecycleDialog();
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = [...(lifecycleDialogForm.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ) ?? [])];
              if (!focusable.length) return;
              const first = focusable[0];
              const last = focusable.at(-1);
              if (!lifecycleDialogForm.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
              } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (pendingLifecycleMove.lifecycle === "abandoned" && !pendingLifecycleMove.reason.trim()) return;
              const node = state.nodes.find((candidate) => candidate.id === pendingLifecycleMove.nodeId);
              dispatch({
                type: "MOVE_NODE_LIFECYCLE",
                nodeId: pendingLifecycleMove.nodeId,
                lifecycle: pendingLifecycleMove.lifecycle,
                reason: pendingLifecycleMove.reason,
              });
              closeLifecycleDialog();
              setToast({
                message: `Moved “${node?.title ?? "Work item"}” to ${pendingLifecycleMove.lifecycle === "done" ? "Done" : "Abandoned"}. Undo is available.`,
              });
            }}
          >
            <h2 id="lifecycle-dialog-title">
              Move this work to {pendingLifecycleMove.lifecycle === "done" ? "Done" : "Abandoned"}?
            </h2>
            <p id="lifecycle-dialog-description">
              The work keeps its identifier, evidence, relationships, and full activity history. This move is recorded and can be undone.
            </p>
            {pendingLifecycleMove.lifecycle === "abandoned" ? (
              <label>
                Why is this work being abandoned?
                <textarea
                  autoFocus
                  required
                  rows={3}
                  value={pendingLifecycleMove.reason}
                  onChange={(event) => setPendingLifecycleMove((current) => current
                    ? { ...current, reason: event.target.value }
                    : null)}
                  placeholder="For example: Superseded by the deterministic renderer path."
                />
              </label>
            ) : null}
            <div className="group-dialog__actions">
              <button className="button button--secondary" type="button" onClick={closeLifecycleDialog}>Cancel</button>
              <button
                autoFocus={pendingLifecycleMove.lifecycle === "done"}
                className="button button--primary"
                type="submit"
                disabled={pendingLifecycleMove.lifecycle === "abandoned" && !pendingLifecycleMove.reason.trim()}
              >
                Confirm move
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {groupDialog.open ? (
        <div className="group-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeGroupDialog();
        }}>
          <form
            ref={groupDialogForm}
            className="group-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeGroupDialog();
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = [...(groupDialogForm.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ) ?? [])];
              if (!focusable.length) return;
              const first = focusable[0];
              const last = focusable.at(-1);
              if (!groupDialogForm.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
              } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const targetGroupId = groupDialog.targetGroupId === "new"
                ? undefined
                : groupDialog.targetGroupId;
              const invalidGroup = validateViewGroupSelection(
                state.nodes,
                state.groups,
                groupDialog.nodeIds,
                targetGroupId,
              );
              if (invalidGroup) {
                setToast({ message: invalidGroup, error: true });
                return;
              }
              if (groupDialog.targetGroupId === "new" && !groupDialog.name.trim()) return;
              if (kanbanDataState !== "ready") {
                setToast({ message: "This fixture state is read-only. No grouping or Project plan was applied.", error: true });
                return;
              }
              const projectPlan = projectPlanFromDialog(groupDialog);
              const invalidProject = validateFixtureProjectAttachment(
                state.nodes,
                state.fixtureProjects,
                state.fixtureProjectAttachments,
                groupDialog.nodeIds,
                projectPlan,
                true,
              );
              if (invalidProject) {
                setToast({ message: invalidProject, error: true });
                return;
              }
              if (groupDialog.step === "edit") {
                setGroupDialog((current) => ({ ...current, step: "confirm" }));
                return;
              }
              dispatch({
                type: "APPLY_GROUPING_PLAN",
                nodeIds: groupDialog.nodeIds,
                targetGroupId,
                name: groupDialog.name.trim(),
                note: groupDialog.note.trim() || "A user-defined cluster of related work.",
                overlayColor: groupDialog.overlayColor,
                projectPlan,
              });
              closeGroupDialog();
            }}>
            <h2 id="group-dialog-title">Group selected work</h2>
            <p>Forge has no epic or group entity. The visual overlay stays view-only; an optional Project attachment is prepared only in the isolated fixture and never writes live Forge data.</p>
            {groupDialog.step === "edit" ? <>
              <label>
                Visual group
                <select
                  autoFocus
                  value={groupDialog.targetGroupId}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, targetGroupId: event.target.value }))}
                >
                  <option value="new">Create a new visual group</option>
                  {state.groups.map((group) => <option key={group.id} value={group.id}>Add to {group.name}</option>)}
                </select>
              </label>
              {groupDialog.targetGroupId === "new" ? <label>
                Group name
                <input
                  value={groupDialog.name}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, name: event.target.value }))}
                  placeholder="For example: Renderer failures"
                />
              </label> : null}
              {groupDialog.targetGroupId === "new" ? <label>
                Overlay colour
                <select
                  value={groupDialog.overlayColor}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, overlayColor: event.target.value }))}
                >
                  {GROUP_OVERLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label> : null}
              {groupDialog.targetGroupId === "new" ? <label>
                Why these belong together
                <textarea
                  rows={3}
                  value={groupDialog.note}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Record the shared hypothesis, decision, or workstream arc."
                />
              </label> : null}
              <label>
                Forge hierarchy preparation
                <select
                  value={groupDialog.attachmentMode}
                  onChange={(event) => setGroupDialog((current) => ({
                    ...current,
                    attachmentMode: event.target.value as GroupDialogState["attachmentMode"],
                  }))}
                >
                  <option value="visual-only">Visual group only</option>
                  <option value="existing-project">Prepare attachment to an existing fixture Project</option>
                  <option value="new-project">Prepare a new fixture Project</option>
                </select>
              </label>
              {groupDialog.attachmentMode === "existing-project" ? <label>
                Existing fixture Project
                <select
                  value={groupDialog.projectId}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, projectId: event.target.value }))}
                >
                  {state.fixtureProjects.map((project) => (
                    <option key={project.id} value={project.id} disabled={project.status !== "active"}>
                      {project.name} · {project.status}
                    </option>
                  ))}
                </select>
              </label> : null}
              {groupDialog.attachmentMode === "new-project" ? <label>
                New fixture Project name
                <input
                  value={groupDialog.projectName}
                  onChange={(event) => setGroupDialog((current) => ({ ...current, projectName: event.target.value }))}
                  placeholder="For example: Temporal graph reliability"
                />
              </label> : null}
            </> : <div className="group-dialog__confirmation" role="status">
              <h3>Confirm two separate effects</h3>
              <dl>
                <div><dt>Visual overlay</dt><dd>{groupDialog.targetGroupId === "new" ? `Create “${groupDialog.name.trim()}”` : `Add to “${state.groups.find((group) => group.id === groupDialog.targetGroupId)?.name ?? "existing group"}”`}</dd></div>
                <div><dt>Fixture hierarchy</dt><dd>{groupDialog.attachmentMode === "visual-only" ? "No Project attachment" : groupDialog.attachmentMode === "existing-project" ? `Prepare attachment to “${state.fixtureProjects.find((project) => project.id === groupDialog.projectId)?.name ?? "selected Project"}”` : `Prepare new Project “${groupDialog.projectName.trim()}”`}</dd></div>
                <div><dt>Selected identities</dt><dd>{groupDialog.nodeIds.length} preserved</dd></div>
                {groupDialog.attachmentMode !== "visual-only" ? <div><dt>Required ancestors</dt><dd>{Math.max(0, fixtureProjectAttachmentClosure(state.nodes, groupDialog.nodeIds).nodeIds.length - groupDialog.nodeIds.length)} included to prevent orphans</dd></div> : null}
              </dl>
              <p>These changes form one fixture transaction. Undo restores the prior visual groups, Projects, attachments, selection, and identifiers together.</p>
            </div>}
            <div className="group-dialog__actions">
              {groupDialog.step === "confirm" ? (
                <button className="button button--secondary" type="button" onClick={() => setGroupDialog((current) => ({ ...current, step: "edit" }))}>Back</button>
              ) : (
                <button className="button button--secondary" type="button" onClick={closeGroupDialog}>Cancel</button>
              )}
              <button
                className="button button--primary"
                type="submit"
                disabled={groupDialog.targetGroupId === "new" && (!groupDialog.name.trim() || groupDialog.nodeIds.length < 2)}
              >
                <Stack aria-hidden="true" size={17} /> {groupDialog.step === "edit" ? "Review grouping plan" : "Apply confirmed plan"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">{state.announcement}</p>
      {toast ? (
        <div className={`toast${toast.error ? " toast--error" : ""}`} role={toast.error ? "alert" : "status"}>
          {toast.error ? <WarningCircle aria-hidden="true" size={17} weight="fill" /> : <CheckCircle aria-hidden="true" size={17} weight="fill" />}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export default App;
