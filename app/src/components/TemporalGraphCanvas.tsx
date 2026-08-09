import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text,
} from "pixi.js";
import {
  CornersOut,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type {
  DateWindow,
  GraphRelation,
  ManualNodeOffset,
  RelationKind,
  WorkGroup,
  WorkNode,
  Workstream,
} from "../domain";
import {
  createEdgeRouteRelaxation,
  runEdgeRouteRelaxationToStop,
  stepEdgeRouteRelaxation,
  type EdgeRouteCurve,
  type EdgeRouteNodeGeometry,
  type EdgeRouteRelaxationState,
  type VisualEdgeRouteInput,
} from "../edge-geometry";
import {
  applyForceRelaxation,
  clampManualNodeOffset,
  clampZoom,
  createForceRelaxation,
  createTemporalLayout,
  forceRelaxationKey,
  retargetForceRelaxation,
  rotationForFocusedNode,
  rotationForFocusedRelaxedNode,
  rotationForFocusedStream,
  runForceRelaxationToStop,
  shortestAngleDelta,
  shouldRestartForceRelaxation,
  stepForceRelaxation,
  type ForceRelaxationOptions,
  type ForceRelaxationState,
  type GraphLayout,
  type TemporalVisibleInterval,
} from "../geometry";
import { markFirstMeaningfulGraphRender } from "../performance-gate";
import {
  GraphTransitionCoordinator,
  graphBindingId,
  type GraphBindingTarget,
  type GraphTransitionFrame,
} from "../graph-transition";

export interface TemporalGraphPalette {
  background: number;
  field: number;
  innerField: number;
  ring: number;
  ringText: number;
  relation: number;
  relationEmphasis: number;
  primary: number;
  selectedLabel: number;
  decision: number;
  failed: number;
  planned: number;
  blocked: number;
  ink: number;
  selection: number;
  mutedText: number;
  groupColors: readonly number[];
}

export type TemporalGraphPaletteOverride = Partial<
  Omit<TemporalGraphPalette, "groupColors">
> & {
  groupColors?: readonly number[];
};

/** A restrained interpretation of the supplied blue orbital reference. */
export const DEFAULT_TEMPORAL_GRAPH_PALETTE: Readonly<TemporalGraphPalette> = {
  background: 0x061737,
  field: 0x0a2855,
  innerField: 0x123766,
  ring: 0x4a709c,
  ringText: 0x8eaaca,
  relation: 0x54779e,
  relationEmphasis: 0x78a7c4,
  primary: 0xf4edd9,
  selectedLabel: 0xf4edd9,
  decision: 0x69bfd0,
  failed: 0xdf7770,
  planned: 0xa8c77d,
  blocked: 0xd2aa68,
  ink: 0x07162f,
  selection: 0x78c7d8,
  mutedText: 0xa2b9d3,
  groupColors: [0x6eacbb, 0x8987af, 0x73a08c, 0xac8b73, 0x728eae],
};

const DEFAULT_VISIBLE_RELATIONS = new Set<string>([
  "continues",
  "branches-from",
  "action-of",
  "depends-on",
]);

const EMPTY_GROUPS: readonly WorkGroup[] = [];
const EMPTY_NODE_IDS: readonly string[] = [];
const EMPTY_GROUP_COLOR_OVERRIDES: Readonly<Record<string, number>> = {};
const EMPTY_MANUAL_NODE_OFFSETS: Readonly<Record<string, ManualNodeOffset>> = {};

export interface GraphPoint {
  x: number;
  y: number;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GraphSelectionMeta {
  additive: boolean;
  source: "canvas" | "semantic-mirror";
}

export interface ActionDragResult {
  sourceNodeId: string;
  trigger: "pointer" | "keyboard";
  /** Coordinates in the untransformed temporal-layout coordinate system. */
  graphPoint: GraphPoint;
  /** Coordinates inside the rendered canvas. */
  canvasPoint: GraphPoint;
  /** Browser coordinates, when a pointer supplied them. */
  clientPoint?: GraphPoint;
}

export interface NodeMoveResult {
  nodeId: string;
  angleOffset: number;
  radialOffset?: number;
}

export interface GraphPerformanceSample {
  timestamp: number;
  framesPerSecond: number;
  meanFrameTimeMs: number;
  maxFrameTimeMs: number;
  longFramesOver100Ms: number;
  renderedNodeCount: number;
  renderedRelationCount: number;
  zoom: number;
}

export interface TemporalGraphCanvasProps {
  nodes: readonly WorkNode[];
  /**
   * Complete relation topology for the displayed nodes, including currently
   * hidden kinds. Physics and collapsed-endpoint bundles depend on this stable
   * topology; presentation visibility is controlled only by
   * `visibleRelationKinds`.
   */
  relations: readonly GraphRelation[];
  workstreams: readonly Workstream[];
  groups?: readonly WorkGroup[];
  selectedNodeId?: string | null;
  selectedRelationId?: string | null;
  multiSelectedNodeIds?: readonly string[];
  focusedWorkstreamId?: string | null;
  focusedNodeId?: string | null;
  cameraResetKey?: string | number;
  /** Relation kinds drawn, hit-testable, and exposed in the semantic mirror. */
  visibleRelationKinds?: readonly RelationKind[];
  reducedMotion?: boolean;
  palette?: TemporalGraphPaletteOverride;
  groupColorOverrides?: Readonly<Record<string, number>>;
  /** Persisted semantic drag intent, clamped again by the force solver. */
  manualNodeOffsets?: Readonly<Record<string, ManualNodeOffset>>;
  /** Frame-coherent temporal projection over the stable canonical topology. */
  dateWindowSnapshot?: TemporalGraphDateWindowSnapshot;
  className?: string;
  ariaLabel?: string;
  onNodeSelect?: (nodeId: string, meta: GraphSelectionMeta) => void;
  onRelationSelect?: (relationId: string) => void;
  onNodeFocus?: (nodeId: string, workstreamId: string) => void;
  onStepOut?: () => void;
  onActionDragComplete?: (result: ActionDragResult) => void;
  onNodeMoveComplete?: (result: NodeMoveResult) => void;
  onLassoComplete?: (nodeIds: string[]) => void;
  onPerformanceSample?: (sample: GraphPerformanceSample) => void;
  onRendererError?: (error: Error) => void;
}

export interface TemporalGraphDateWindowSnapshot {
  sequence: number;
  /** performance.now() captured when the latest input value was accepted. */
  acceptedAt: number;
  window: DateWindow;
  visibleNodeIds: readonly string[];
  visibleRelationIds: readonly string[];
  visibleIntervals: ReadonlyMap<string, TemporalVisibleInterval>;
}

interface Viewport {
  width: number;
  height: number;
}

interface TransformState {
  zoom: number;
  targetZoom: number;
  panX: number;
  panY: number;
  rotation: number;
  targetRotation: number;
}

interface TimedTransition {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
}

interface NodeAlphaTransition extends TimedTransition {
  nodeId: string;
  displayObject: Container | Graphics;
}

interface RelativeNodePosition {
  x: number;
  y: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
}

interface SceneState {
  camera: Container;
  wheel: Container;
  graphWorld: Container;
  overlay: Graphics;
  center: GraphPoint;
  positions: Map<string, RelativeNodePosition>;
  ringLabels: Text[];
  nodeLabels: Text[];
  streamLabels: Text[];
  groupLabels: Text[];
  width: number;
  height: number;
  applyReducedSemanticState?: (state: ReducedSemanticState) => void;
  applyDateWindowSnapshot?: (snapshot: TemporalGraphDateWindowSnapshot) => void;
}

interface ReducedSemanticState {
  selectedNodeId: string | null;
  selectedRelationId: string | null;
  multiSelectedNodeIds: readonly string[];
  focusedWorkstreamId: string | null;
  focusedNodeId: string | null;
}

interface CallbackState {
  onNodeSelect?: TemporalGraphCanvasProps["onNodeSelect"];
  onRelationSelect?: TemporalGraphCanvasProps["onRelationSelect"];
  onNodeFocus?: TemporalGraphCanvasProps["onNodeFocus"];
  onStepOut?: TemporalGraphCanvasProps["onStepOut"];
  onActionDragComplete?: TemporalGraphCanvasProps["onActionDragComplete"];
  onNodeMoveComplete?: TemporalGraphCanvasProps["onNodeMoveComplete"];
  onLassoComplete?: TemporalGraphCanvasProps["onLassoComplete"];
  onPerformanceSample?: TemporalGraphCanvasProps["onPerformanceSample"];
  onRendererError?: TemporalGraphCanvasProps["onRendererError"];
}

interface PointerSession {
  mode: "pan" | "lasso" | "action" | "node-move" | "pinch";
  pointerId: number;
  secondaryPointerId?: number;
  start: GraphPoint;
  latest: GraphPoint;
  startPanX: number;
  startPanY: number;
  startZoom?: number;
  startDistance?: number;
  pinchAnchorX?: number;
  pinchAnchorY?: number;
  sourceNodeId?: string;
  sourcePoint?: GraphPoint;
  moveStartState?: ForceRelaxationState;
  moveStartEdgeState?: EdgeRouteRelaxationState;
  moveStartOffset?: ManualNodeOffset;
  movePreviewOffset?: ManualNodeOffset;
}

interface CurveGeometry {
  source: GraphPoint;
  control1: GraphPoint;
  control2: GraphPoint;
  target: GraphPoint;
}

function curveFromEdgeRoute(route: EdgeRouteCurve): CurveGeometry {
  return {
    source: route.start,
    control1: route.control1,
    control2: route.control2,
    target: route.end,
  };
}

interface ScreenStableNodeHitTarget {
  nodeId: string;
  area: Rectangle;
  deltaX: number;
  deltaY: number;
}

interface MutableCurveHitArea {
  contains: (x: number, y: number) => boolean;
  update: (curve: CurveGeometry) => void;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Ken Perlin's quintic smootherstep. Its first and second derivatives are zero
 * at both endpoints, so interrupted camera and opacity moves start and finish
 * without the velocity cusp produced by a basic cubic ease-in-out.
 */
function smootherstep(progress: number): number {
  const value = Math.min(1, Math.max(0, progress));
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function transitionProgress(transition: TimedTransition, now: number): number {
  return Math.min(1, Math.max(0, (now - transition.startedAt) / transition.durationMs));
}

function transitionValue(transition: TimedTransition, now: number): number {
  const eased = smootherstep(transitionProgress(transition, now));
  return transition.from + (transition.to - transition.from) * eased;
}

function colorToCss(color: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.round(color)))
    .toString(16)
    .padStart(6, "0")}`;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function normalizedKind(kind: string): string {
  return kind.toLowerCase().replaceAll("_", "-");
}

function isFailedStatus(status: string): boolean {
  return status === "failed" || status === "rejected";
}

function isPlannedStatus(status: string): boolean {
  return status === "planned" || status === "draft" || status === "queued";
}

function isActiveStatus(status: string): boolean {
  return status === "active" || status === "simulated-running" || status === "running";
}

function isSatellite(node: WorkNode): boolean {
  if (node.satelliteOfNodeId) return true;
  const type = String(node.type);
  return ["verification", "test", "report", "summary", "visualization"].includes(type);
}

function isDecision(node: WorkNode): boolean {
  return String(node.type) === "decision";
}

function nodeTone(node: WorkNode, palette: TemporalGraphPalette): number {
  const status = String(node.status);
  if (isFailedStatus(status)) return palette.failed;
  if (status === "blocked") return palette.blocked;
  if (isPlannedStatus(status) || isActiveStatus(status)) return palette.planned;
  if (isDecision(node)) return palette.decision;
  return palette.primary;
}

function dateValue(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function focusRepulsionNeighborhood(
  nodes: readonly WorkNode[],
  relations: readonly GraphRelation[],
  selectedNodeId: string | null,
): ReadonlyMap<string, 0 | 1 | 2> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!selectedNodeId || !nodeIds.has(selectedNodeId)) return new Map();
  const adjacency = new Map<string, Set<string>>(
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
  const streamNodes = new Map<string, WorkNode[]>();
  for (const node of nodes) {
    streamNodes.set(node.workstreamId, [
      ...(streamNodes.get(node.workstreamId) ?? []),
      node,
    ]);
  }
  for (const lane of streamNodes.values()) {
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
  const queue: Array<{ nodeId: string; distance: 0 | 1 | 2 }> = [
    { nodeId: selectedNodeId, distance: 0 },
  ];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current || current.distance >= 2) continue;
    const nextDistance = (current.distance + 1) as 1 | 2;
    for (const neighbor of [...(adjacency.get(current.nodeId) ?? [])].sort()) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, nextDistance);
      queue.push({ nodeId: neighbor, distance: nextDistance });
    }
  }
  return distances;
}

function relativePoint(
  point: Pick<RelativeNodePosition, "x" | "y">,
): GraphPoint {
  return { x: point.x, y: point.y };
}

function convexHull(points: readonly GraphPoint[]): GraphPoint[] {
  if (points.length <= 1) return [...points];
  const unique = new Map(points.map((point) => [`${point.x}:${point.y}`, point]));
  const sorted = [...unique.values()].sort((left, right) => left.x - right.x || left.y - right.y);
  if (sorted.length <= 2) return sorted;

  const cross = (origin: GraphPoint, left: GraphPoint, right: GraphPoint) =>
    (left.x - origin.x) * (right.y - origin.y) -
    (left.y - origin.y) * (right.x - origin.x);
  const lower: GraphPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: GraphPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function expandedHull(points: readonly GraphPoint[], padding: number): GraphPoint[] {
  const hull = convexHull(points);
  if (hull.length < 3) return hull;
  const center = hull.reduce(
    (total, point) => ({ x: total.x + point.x / hull.length, y: total.y + point.y / hull.length }),
    { x: 0, y: 0 },
  );
  return hull.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    return {
      x: point.x + (dx / length) * padding,
      y: point.y + (dy / length) * padding,
    };
  });
}

function representativePoint(position: RelativeNodePosition): GraphPoint {
  return { x: position.endX, y: position.endY };
}

function makeCurve(
  source: GraphPoint,
  target: GraphPoint,
  identity: string,
  tight = false,
): CurveGeometry {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const signedBend = (hashUnit(identity) - 0.5) * 2;
  const bend = Math.min(tight ? 12 : 48, length * (tight ? 0.08 : 0.18)) * signedBend;

  return {
    source,
    control1: {
      x: source.x + dx * 0.34 + normalX * bend,
      y: source.y + dy * 0.34 + normalY * bend,
    },
    control2: {
      x: source.x + dx * 0.68 + normalX * bend,
      y: source.y + dy * 0.68 + normalY * bend,
    },
    target,
  };
}

function cubicPoint(curve: CurveGeometry, t: number): GraphPoint {
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return {
    x:
      a * curve.source.x +
      b * curve.control1.x +
      c * curve.control2.x +
      d * curve.target.x,
    y:
      a * curve.source.y +
      b * curve.control1.y +
      c * curve.control2.y +
      d * curve.target.y,
  };
}

function squaredDistanceToSegment(
  pointX: number,
  pointY: number,
  start: GraphPoint,
  end: GraphPoint,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0.0001) {
    return (pointX - start.x) ** 2 + (pointY - start.y) ** 2;
  }
  const projection = Math.min(
    1,
    Math.max(
      0,
      ((pointX - start.x) * deltaX + (pointY - start.y) * deltaY) /
        lengthSquared,
    ),
  );
  const closestX = start.x + projection * deltaX;
  const closestY = start.y + projection * deltaY;
  return (pointX - closestX) ** 2 + (pointY - closestY) ** 2;
}

/**
 * Pixi evaluates hit areas in the display object's local coordinate system.
 * Dividing the 22 CSS-pixel radius by the live camera zoom keeps this curve's
 * complete pointer target at least 44 CSS pixels wide at every supported zoom.
 */
function screenStableCurveHitArea(
  curve: CurveGeometry,
  getZoom: () => number,
): MutableCurveHitArea {
  let samples: GraphPoint[] = [];
  const update = (nextCurve: CurveGeometry) => {
    samples = Array.from({ length: 33 }, (_, index) =>
      cubicPoint(nextCurve, index / 32),
    );
  };
  update(curve);
  return {
    update,
    contains(x: number, y: number): boolean {
      const radius = 22 / Math.max(0.001, getZoom());
      const radiusSquared = radius * radius;
      for (let index = 1; index < samples.length; index += 1) {
        if (
          squaredDistanceToSegment(
            x,
            y,
            samples[index - 1],
            samples[index],
          ) <= radiusSquared
        ) {
          return true;
        }
      }
      return false;
    },
  };
}

function screenRectsOverlap(
  left: ScreenRect,
  right: ScreenRect,
  clearance = 0,
): boolean {
  return !(
    left.right + clearance <= right.left ||
    right.right + clearance <= left.left ||
    left.bottom + clearance <= right.top ||
    right.bottom + clearance <= left.top
  );
}

function closestPointOnScreenRect(
  point: GraphPoint,
  rect: ScreenRect,
): GraphPoint {
  const x = Math.min(Math.max(point.x, rect.left), rect.right);
  const y = Math.min(Math.max(point.y, rect.top), rect.bottom);
  const pointIsInside =
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom;
  if (!pointIsInside) return { x, y };

  const edges = [
    { distance: Math.abs(point.x - rect.left), point: { x: rect.left, y: point.y } },
    { distance: Math.abs(rect.right - point.x), point: { x: rect.right, y: point.y } },
    { distance: Math.abs(point.y - rect.top), point: { x: point.x, y: rect.top } },
    { distance: Math.abs(rect.bottom - point.y), point: { x: point.x, y: rect.bottom } },
  ].sort((left, right) => left.distance - right.distance);
  return edges[0]?.point ?? { x, y };
}

function clampScreenRect(
  rect: ScreenRect,
  bounds: ScreenRect,
): ScreenRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = Math.min(
    Math.max(bounds.left, rect.left),
    Math.max(bounds.left, bounds.right - width),
  );
  const top = Math.min(
    Math.max(bounds.top, rect.top),
    Math.max(bounds.top, bounds.bottom - height),
  );
  return { left, top, right: left + width, bottom: top + height };
}

function drawSolidCurve(
  graphics: Graphics,
  curve: CurveGeometry,
  color: number,
  width: number,
  alpha: number,
): void {
  graphics
    .moveTo(curve.source.x, curve.source.y)
    .bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.target.x,
      curve.target.y,
    )
    .stroke({ color, width, alpha, cap: "round" });
}

function drawPatternedCurve(
  graphics: Graphics,
  curve: CurveGeometry,
  pattern: "dashed" | "dotted",
  color: number,
  width: number,
  alpha: number,
): void {
  const samples = 40;
  const onLength = pattern === "dotted" ? 1 : 4;
  const offLength = pattern === "dotted" ? 3 : 3;
  const cycle = onLength + offLength;

  for (let index = 0; index < samples; index += 1) {
    if (index % cycle >= onLength) continue;
    const from = cubicPoint(curve, index / samples);
    const to = cubicPoint(curve, (index + 1) / samples);
    graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
  }

  graphics.stroke({ color, width, alpha, cap: "round" });
}

function screenFromWorld(
  world: GraphPoint,
  center: GraphPoint,
  transform: TransformState,
): GraphPoint {
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  const rotatedX = world.x * cosine - world.y * sine;
  const rotatedY = world.x * sine + world.y * cosine;
  return {
    x: center.x + transform.panX + rotatedX * transform.zoom,
    y: center.y + transform.panY + rotatedY * transform.zoom,
  };
}

function worldFromScreen(
  screen: GraphPoint,
  center: GraphPoint,
  transform: TransformState,
): GraphPoint {
  const cameraX = (screen.x - center.x - transform.panX) / transform.zoom;
  const cameraY = (screen.y - center.y - transform.panY) / transform.zoom;
  const cosine = Math.cos(-transform.rotation);
  const sine = Math.sin(-transform.rotation);
  return {
    x: cameraX * cosine - cameraY * sine,
    y: cameraX * sine + cameraY * cosine,
  };
}

function canvasPointFromPointer(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
): GraphPoint {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = bounds.width > 0 ? viewport.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? viewport.height / bounds.height : 1;
  return {
    x: (event.clientX - bounds.left) * scaleX,
    y: (event.clientY - bounds.top) * scaleY,
  };
}

function relationVisual(kind: string, palette: TemporalGraphPalette): {
  color: number;
  width: number;
  alpha: number;
  pattern: "solid" | "dashed" | "dotted";
} {
  switch (normalizedKind(kind)) {
    case "depends-on":
      return {
        color: palette.blocked,
        width: 1.15,
        alpha: 0.4,
        pattern: "dashed",
      };
    case "action-of":
      return {
        color: palette.decision,
        width: 1,
        alpha: 0.43,
        pattern: "solid",
      };
    case "same-source-thread":
      return {
        color: palette.decision,
        width: 0.75,
        alpha: 0.18,
        pattern: "solid",
      };
    case "related-to":
      return {
        color: palette.relationEmphasis,
        width: 0.9,
        alpha: 0.24,
        pattern: "dotted",
      };
    default:
      return {
        color: palette.relationEmphasis,
        width: 1.15,
        alpha: 0.36,
        pattern: "solid",
      };
  }
}

function drawActionArrow(
  overlay: Graphics,
  source: GraphPoint,
  destination: GraphPoint,
  palette: TemporalGraphPalette,
): void {
  overlay.clear();
  const dx = destination.x - source.x;
  const dy = destination.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const bend = Math.min(42, length * 0.18);
  const control = {
    x: (source.x + destination.x) / 2 + normalX * bend,
    y: (source.y + destination.y) / 2 + normalY * bend,
  };

  overlay
    .moveTo(source.x, source.y)
    .quadraticCurveTo(control.x, control.y, destination.x, destination.y)
    .stroke({ color: palette.selection, width: 2, alpha: 0.92, cap: "round" });
  overlay
    .circle(destination.x, destination.y, 11)
    .fill({ color: palette.selection, alpha: 0.075 })
    .stroke({ color: palette.selection, width: 1.4, alpha: 0.8 });

  const angle = Math.atan2(destination.y - control.y, destination.x - control.x);
  const arrowSize = 8;
  overlay
    .poly(
      [
        destination.x,
        destination.y,
        destination.x - Math.cos(angle - 0.55) * arrowSize,
        destination.y - Math.sin(angle - 0.55) * arrowSize,
        destination.x - Math.cos(angle + 0.55) * arrowSize,
        destination.y - Math.sin(angle + 0.55) * arrowSize,
      ],
      true,
    )
    .fill({ color: palette.selection, alpha: 0.93 });
}

function drawLasso(
  overlay: Graphics,
  start: GraphPoint,
  current: GraphPoint,
  palette: TemporalGraphPalette,
): void {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  overlay
    .clear()
    .roundRect(left, top, width, height, 6)
    .fill({ color: palette.selection, alpha: 0.075 })
    .stroke({ color: palette.selection, width: 1.25, alpha: 0.84 });
}

function useReducedMotion(explicit: boolean | undefined): boolean {
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    if (explicit !== undefined || typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemPreference(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [explicit]);

  return explicit ?? systemPreference;
}

/**
 * GPU-rendered temporal workgraph with a DOM semantic mirror.
 *
 * The component owns only visual camera state. Selection, focus, lasso results,
 * relation inspection, and follow-up creation remain reducer-owned through callbacks.
 */
export function TemporalGraphCanvas({
  nodes,
  relations,
  workstreams,
  groups = EMPTY_GROUPS,
  selectedNodeId = null,
  selectedRelationId = null,
  multiSelectedNodeIds = EMPTY_NODE_IDS,
  focusedWorkstreamId = null,
  focusedNodeId = null,
  cameraResetKey,
  visibleRelationKinds,
  reducedMotion,
  palette: paletteOverrides,
  groupColorOverrides = EMPTY_GROUP_COLOR_OVERRIDES,
  manualNodeOffsets = EMPTY_MANUAL_NODE_OFFSETS,
  dateWindowSnapshot,
  className,
  ariaLabel = "Temporal workgraph. Radius represents time and angle represents workstream.",
  onNodeSelect,
  onRelationSelect,
  onNodeFocus,
  onStepOut,
  onActionDragComplete,
  onNodeMoveComplete,
  onLassoComplete,
  onPerformanceSample,
  onRendererError,
}: TemporalGraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const dateWindowSnapshotRef = useRef<TemporalGraphDateWindowSnapshot | undefined>(dateWindowSnapshot);
  const callbacksRef = useRef<CallbackState>({});
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const renderCountsRef = useRef({ nodes: nodes.length, relations: relations.length });
  const rotationTransitionRef = useRef<TimedTransition | null>(null);
  const focusZoomTransitionRef = useRef<TimedTransition | null>(null);
  const manualZoomTransitionRef = useRef<TimedTransition | null>(null);
  const manualZoomRef = useRef(1);
  const focusZoomRef = useRef(1);
  const focusZoomTargetRef = useRef(1);
  const semanticFocusKeyRef = useRef<string | null>(null);
  const cameraResetKeyRef = useRef<string | number | undefined>(cameraResetKey);
  const forceRelaxationRef = useRef<ForceRelaxationState | null>(null);
  const forceRelaxationContextKeyRef = useRef<string | null>(null);
  const forceRelaxationSemanticKeyRef = useRef<string | null>(null);
  const forceRelaxationStartedAtRef = useRef(0);
  const reducedEdgeRouteRef = useRef<EdgeRouteRelaxationState | null>(null);
  const reducedEdgeRouteKeyRef = useRef<string | null>(null);
  const nodeAlphaValuesRef = useRef(new Map<string, number>());
  const selectionAlphaValuesRef = useRef(new Map<string, number>());
  const selectionColorValuesRef = useRef(new Map<string, number>());
  const selectionGlyphsRef = useRef(new Map<string, Graphics>());
  const selectionGlyphRenderersRef = useRef(
    new Map<string, (selected: boolean, multiSelected: boolean) => void>(),
  );
  const labelAlphaValuesRef = useRef(new Map<string, number>());
  const transformRef = useRef<TransformState>({
    zoom: 1,
    targetZoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    targetRotation: 0,
  });
  const [viewport, setViewport] = useState<Viewport>({ width: 960, height: 640 });
  const [canvasGeneration, setCanvasGeneration] = useState(0);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const motionIsReduced = useReducedMotion(reducedMotion);
  const graphPalette = useMemo<TemporalGraphPalette>(
    () => ({
      ...DEFAULT_TEMPORAL_GRAPH_PALETTE,
      ...paletteOverrides,
      groupColors:
        paletteOverrides?.groupColors && paletteOverrides.groupColors.length > 0
          ? paletteOverrides.groupColors
          : DEFAULT_TEMPORAL_GRAPH_PALETTE.groupColors,
    }),
    [paletteOverrides],
  );

  callbacksRef.current = {
    onNodeSelect,
    onRelationSelect,
    onNodeFocus,
    onStepOut,
    onActionDragComplete,
    onNodeMoveComplete,
    onLassoComplete,
    onPerformanceSample,
    onRendererError,
  };
  dateWindowSnapshotRef.current = dateWindowSnapshot;
  renderCountsRef.current.nodes = nodes.length;

  const selectedSet = useMemo(
    () => new Set<string>(multiSelectedNodeIds),
    [multiSelectedNodeIds],
  );
  const visibleKinds = useMemo(
    () =>
      visibleRelationKinds
        ? new Set<string>(visibleRelationKinds.map((kind) => normalizedKind(String(kind))))
        : DEFAULT_VISIBLE_RELATIONS,
    [visibleRelationKinds],
  );
  const semanticNodes = useMemo(
    () => {
      const visibleNodeIds = new Set(dateWindowSnapshot?.visibleNodeIds ?? nodes.map((node) => node.id));
      return nodes
        .filter((node) => visibleNodeIds.has(node.id))
        .sort((left, right) => dateValue(left.startedAt) - dateValue(right.startedAt));
    },
    [dateWindowSnapshot?.visibleNodeIds, nodes],
  );
  const semanticVisibleRelationIds = useMemo(
    () => new Set(dateWindowSnapshot?.visibleRelationIds ?? relations.map((relation) => relation.id)),
    [dateWindowSnapshot?.visibleRelationIds, relations],
  );
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvasHost = canvasHostRef.current;
    if (!wrapper || !canvasHost) return;

    let cancelled = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | null = null;
    let removeFallbackResize: (() => void) | null = null;
    let performanceTicker: (() => void) | null = null;
    const app = new Application();

    const measure = (): Viewport => ({
      width: Math.max(320, Math.round(wrapper.clientWidth || 960)),
      height: Math.max(320, Math.round(wrapper.clientHeight || 640)),
    });

    const initialize = async () => {
      const initialViewport = measure();
      try {
        await app.init({
          width: initialViewport.width,
          height: initialViewport.height,
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preference: "webgl",
          powerPreference: "high-performance",
          resolution:
            typeof window === "undefined"
              ? 1
              : Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (!cancelled) {
          setInitializationError(`The GPU graph could not start: ${error.message}`);
          callbacksRef.current.onRendererError?.(error);
        }
        return;
      }

      initialized = true;
      if (cancelled) {
        app.destroy({ removeView: true }, { children: true, context: true });
        return;
      }

      appRef.current = app;
      canvasRef.current = app.canvas;
      app.canvas.setAttribute("aria-hidden", "true");
      app.canvas.setAttribute("data-threadwake-graph-canvas", "true");
      app.canvas.style.display = "block";
      app.canvas.style.height = "100%";
      app.canvas.style.touchAction = "none";
      app.canvas.style.width = "100%";
      canvasHost.appendChild(app.canvas);
      setViewport(initialViewport);
      setCanvasGeneration((generation) => generation + 1);

      const resize = () => {
        const next = measure();
        app.renderer.resize(next.width, next.height);
        setViewport((current) =>
          current.width === next.width && current.height === next.height ? current : next,
        );
      };

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(wrapper);
      } else {
        window.addEventListener("resize", resize);
        removeFallbackResize = () => window.removeEventListener("resize", resize);
      }

      let periodStartedAt = performance.now();
      let previousFrameAt = periodStartedAt;
      let frames = 0;
      let elapsedFrameTime = 0;
      let maxFrameTime = 0;
      let longFrames = 0;

      const samplePerformance = () => {
        const now = performance.now();
        const frameTime = Math.max(0, now - previousFrameAt);
        previousFrameAt = now;
        frames += 1;
        elapsedFrameTime += frameTime;
        maxFrameTime = Math.max(maxFrameTime, frameTime);
        if (frameTime > 100) longFrames += 1;

        const period = now - periodStartedAt;
        if (period < 1_000) return;

        const sample: GraphPerformanceSample = {
          timestamp: now,
          framesPerSecond: (frames * 1_000) / Math.max(1, period),
          meanFrameTimeMs: elapsedFrameTime / Math.max(1, frames),
          maxFrameTimeMs: maxFrameTime,
          longFramesOver100Ms: longFrames,
          renderedNodeCount: renderCountsRef.current.nodes,
          renderedRelationCount: renderCountsRef.current.relations,
          zoom: transformRef.current.zoom,
        };
        wrapper.dataset.graphPerformanceFps = sample.framesPerSecond.toFixed(2);
        wrapper.dataset.graphPerformanceMeanFrameMs = sample.meanFrameTimeMs.toFixed(3);
        wrapper.dataset.graphPerformanceMaxFrameMs = sample.maxFrameTimeMs.toFixed(3);
        wrapper.setAttribute(
          "data-graph-performance-long-frames-over-100-ms",
          String(sample.longFramesOver100Ms),
        );
        callbacksRef.current.onPerformanceSample?.(sample);

        periodStartedAt = now;
        frames = 0;
        elapsedFrameTime = 0;
        maxFrameTime = 0;
        longFrames = 0;
      };
      performanceTicker = samplePerformance;
      app.ticker.add(samplePerformance);
    };

    void initialize();

    return () => {
      cancelled = true;
      pointerCleanupRef.current?.();
      pointerCleanupRef.current = null;
      resizeObserver?.disconnect();
      removeFallbackResize?.();
      if (initialized) {
        if (performanceTicker) app.ticker?.remove(performanceTicker);
        if (appRef.current === app) appRef.current = null;
        if (canvasRef.current === app.canvas) canvasRef.current = null;
        app.destroy({ removeView: true }, { children: true, context: true });
      }
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const canvas = canvasRef.current;
    if (!app || !canvas || canvasGeneration === 0) return;
    const activeCanvas = canvas;

    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    for (const child of app.stage.removeChildren()) {
      child.destroy({ children: true });
    }

    const width = viewport.width;
    const height = viewport.height;
    const initialDateWindowSnapshot = dateWindowSnapshotRef.current;
    const initialVisibleNodeIds = new Set(
      initialDateWindowSnapshot?.visibleNodeIds ?? nodes.map((node) => node.id),
    );
    const initialVisibleRelationIds = new Set(
      initialDateWindowSnapshot?.visibleRelationIds ?? relations.map((relation) => relation.id),
    );
    const cameraResetRequested = cameraResetKeyRef.current !== cameraResetKey;
    if (cameraResetRequested) {
      cameraResetKeyRef.current = cameraResetKey;
      transformRef.current.panX = 0;
      transformRef.current.panY = 0;
      transformRef.current.zoom = 1;
      transformRef.current.targetZoom = 1;
      manualZoomRef.current = 1;
      focusZoomRef.current = 1;
      focusZoomTargetRef.current = 1;
      focusZoomTransitionRef.current = null;
      manualZoomTransitionRef.current = null;
    }
    const layout = createTemporalLayout(nodes, workstreams, {
      width,
      height,
      padding: Math.max(30, Math.min(width, height) * 0.055),
      rotationRadians: 0,
      zoom: 1,
      pan: { x: 0, y: 0 },
      timeDomain: initialDateWindowSnapshot?.window,
      visibleIntervals: initialDateWindowSnapshot?.visibleIntervals,
    });
    const center = { x: layout.center.x, y: layout.center.y };
    const positions = new Map<string, RelativeNodePosition>();
    const layoutNodes = nodes.filter((node) => initialVisibleNodeIds.has(node.id));
    const focusRepulsion = focusRepulsionNeighborhood(
      layoutNodes,
      relations,
      selectedNodeId,
    );
    const baseCollisionRadii = Object.fromEntries(
      layoutNodes.map((node) => {
        const position = layout.positions[node.id];
        const radius = position?.isSatellite
          ? 4.5
          : position?.isDuration
            ? 9
            : isDecision(node)
              ? 7.5
              : 8.5;
        return [node.id, radius];
      }),
    );
    const collisionRadii = Object.fromEntries(
      Object.entries(baseCollisionRadii).map(([nodeId, radius]) => {
        const distance = focusRepulsion.get(nodeId);
        const influence =
          distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0;
        return [nodeId, radius + influence];
      }),
    );
    const relaxationOptions: ForceRelaxationOptions = {
      collisionPadding: 4,
      collisionRadii,
      glyphRadii: baseCollisionRadii,
      pinnedOffsets: manualNodeOffsets,
    };
    const semanticRelaxationOptions: ForceRelaxationOptions = {
      collisionPadding: 4,
      collisionRadii: baseCollisionRadii,
      glyphRadii: baseCollisionRadii,
      pinnedOffsets: manualNodeOffsets,
    };
    // Expanded groups are presentation hulls, not physics topology. A collapsed
    // group already changes the display-node set supplied by App, so the
    // authoritative layout/node key captures the only grouping restart needed.
    const relaxationContextKey = forceRelaxationKey(
      layout,
      layoutNodes,
      relaxationOptions,
    );
    const semanticRelaxationKey = forceRelaxationKey(
      layout,
      layoutNodes,
      semanticRelaxationOptions,
    );
    let relaxationState = forceRelaxationRef.current;
    const restartRelaxation =
      !relaxationState ||
      forceRelaxationContextKeyRef.current !== relaxationContextKey ||
      shouldRestartForceRelaxation(
        relaxationState,
        layout,
        layoutNodes,
        relaxationOptions,
      );
    if (restartRelaxation) {
      const previousRelaxationState = relaxationState;
      const sameSemanticLayout = previousRelaxationState
        && forceRelaxationSemanticKeyRef.current === semanticRelaxationKey;
      relaxationState = motionIsReduced && sameSemanticLayout
        ? previousRelaxationState
        : sameSemanticLayout
          ? retargetForceRelaxation(
              previousRelaxationState,
              layout,
              layoutNodes,
              relaxationOptions,
            )
          : createForceRelaxation(layout, layoutNodes, relaxationOptions);
      forceRelaxationRef.current = relaxationState;
      forceRelaxationContextKeyRef.current = relaxationContextKey;
      forceRelaxationSemanticKeyRef.current = semanticRelaxationKey;
      forceRelaxationStartedAtRef.current = performance.now();
    }
    if (!relaxationState) {
      throw new Error("Force relaxation could not initialize.");
    }
    if (motionIsReduced && !relaxationState.stopped) {
      relaxationState = runForceRelaxationToStop(relaxationState);
      forceRelaxationRef.current = relaxationState;
    }
    let renderedRelaxationState: ForceRelaxationState = relaxationState;

    const syncPositionsFromLayout = (renderedLayout: GraphLayout) => {
      for (const node of nodes) {
        const position = renderedLayout.positions[node.id];
        if (!position) {
          positions.delete(node.id);
          continue;
        }
        positions.set(node.id, {
          x: finite(position.x - center.x),
          y: finite(position.y - center.y),
          startX: finite(position.startX - center.x),
          startY: finite(position.startY - center.y),
          endX: finite(position.endX - center.x),
          endY: finite(position.endY - center.y),
          angle: finite(position.angle),
        });
      }
    };
    syncPositionsFromLayout(applyForceRelaxation(layout, renderedRelaxationState));

    const focusedStream = focusedWorkstreamId
      ? workstreams.find((workstream) => workstream.id === focusedWorkstreamId)
      : undefined;
    const focusedNode = focusedNodeId ? nodeById.get(focusedNodeId) : undefined;
    const effectiveFocusedWorkstreamId = focusedNode?.workstreamId ?? focusedWorkstreamId;
    const focusedNodePosition = focusedNodeId ? layout.positions[focusedNodeId] : undefined;
    const settledFocusedNode =
      focusedNodeId && renderedRelaxationState.stopped
        ? renderedRelaxationState.nodes[focusedNodeId]
        : undefined;
    transformRef.current.targetRotation = settledFocusedNode
      ? rotationForFocusedRelaxedNode(
          settledFocusedNode,
          renderedRelaxationState.center,
          transformRef.current.rotation,
        )
      : focusedNodePosition
        ? rotationForFocusedNode(focusedNodePosition, transformRef.current.rotation)
      : focusedStream
        ? rotationForFocusedStream(focusedStream, transformRef.current.rotation)
        : rotationForFocusedStream(0, transformRef.current.rotation);
    const transitionStartedAt = performance.now();
    const rotationDistance = Math.abs(
      transformRef.current.targetRotation - transformRef.current.rotation,
    );
    const existingRotationTransition = rotationTransitionRef.current;
    if (motionIsReduced) {
      transformRef.current.rotation = transformRef.current.targetRotation;
      rotationTransitionRef.current = null;
    } else if (
      rotationDistance > 0.0005 &&
      (!existingRotationTransition ||
        Math.abs(existingRotationTransition.to - transformRef.current.targetRotation) > 0.0005)
    ) {
      rotationTransitionRef.current = {
        from: transformRef.current.rotation,
        to: transformRef.current.targetRotation,
        startedAt: transitionStartedAt,
        durationMs: 380 + Math.min(1, rotationDistance / Math.PI) * 260,
      };
    } else if (rotationDistance <= 0.0005) {
      transformRef.current.rotation = transformRef.current.targetRotation;
      rotationTransitionRef.current = null;
    }

    const semanticFocusKey = focusedNodePosition
      ? `node:${focusedNodeId}`
      : focusedStream
        ? `stream:${focusedStream.id}`
        : "project";
    const semanticFocusChanged = semanticFocusKeyRef.current !== semanticFocusKey;
    if (cameraResetRequested) {
      semanticFocusKeyRef.current = semanticFocusKey;
    } else if (semanticFocusChanged) {
      semanticFocusKeyRef.current = semanticFocusKey;
      focusZoomTargetRef.current = focusedNodePosition ? 1.075 : focusedStream ? 1.045 : 1;
    }
    const targetFocusZoom = focusZoomTargetRef.current;
    const existingFocusZoomTransition = focusZoomTransitionRef.current;
    transformRef.current.targetZoom = clampZoom(manualZoomRef.current * targetFocusZoom);
    if (motionIsReduced) {
      focusZoomRef.current = targetFocusZoom;
      transformRef.current.zoom = transformRef.current.targetZoom;
      focusZoomTransitionRef.current = null;
    } else if (
      Math.abs(targetFocusZoom - focusZoomRef.current) > 0.0005 &&
      (!existingFocusZoomTransition ||
        Math.abs(existingFocusZoomTransition.to - targetFocusZoom) > 0.0005)
    ) {
      focusZoomTransitionRef.current = {
        from: focusZoomRef.current,
        to: targetFocusZoom,
        startedAt: transitionStartedAt,
        durationMs: 440,
      };
    } else if (Math.abs(targetFocusZoom - focusZoomRef.current) <= 0.0005) {
      focusZoomRef.current = targetFocusZoom;
      transformRef.current.zoom = transformRef.current.targetZoom;
      focusZoomTransitionRef.current = null;
    }

    const background = new Graphics();
    background
      .rect(0, 0, width, height)
      .fill({ color: graphPalette.background, alpha: 1 });
    background
      .circle(center.x, center.y, Math.max(width, height) * 0.58)
      .fill({ color: graphPalette.field, alpha: 0.11 });
    background.eventMode = "static";
    background.cursor = "grab";
    background.hitArea = new Rectangle(0, 0, width, height);
    app.stage.addChild(background);

    const camera = new Container();
    camera.position.set(center.x + transformRef.current.panX, center.y + transformRef.current.panY);
    camera.scale.set(transformRef.current.zoom);
    app.stage.addChild(camera);

    const wheel = new Container();
    wheel.rotation = transformRef.current.rotation;
    camera.addChild(wheel);

    const ringLayer = new Container();
    wheel.addChild(ringLayer);
    const innerField = new Graphics();
    const rings = new Graphics();
    const ringLabels: Text[] = [];
    const ringLabelBindings: Array<{
      anchor: GraphPoint;
      label: Text;
      active: boolean;
    }> = [];
    const ringVisuals = new Map<string, {
      anchor: GraphPoint;
      label: Text;
    }>();
    ringLayer.addChild(innerField, rings);

    const innerFieldRadius = Math.max(30, layout.innerRadius * 0.78);
    innerField
      .circle(0, 0, innerFieldRadius)
      .fill({ color: graphPalette.innerField, alpha: 0.19 })
      .stroke({ color: graphPalette.ring, width: 0.75, alpha: 0.12 });
    const fieldStep = Math.max(7, innerFieldRadius / 5.2);
    for (let row = -4; row <= 4; row += 1) {
      for (let column = -4; column <= 4; column += 1) {
        const x = column * fieldStep + (row % 2 === 0 ? fieldStep * 0.18 : 0);
        const y = row * fieldStep * 0.82;
        if (Math.hypot(x, y) > innerFieldRadius * 0.72) continue;
        const seed = hashUnit(`inner-field-${row}-${column}`);
        if (seed > 0.74) continue;
        innerField
          .circle(x, y, seed > 0.48 ? 0.9 : 0.55)
          .fill({ color: graphPalette.ringText, alpha: 0.06 + seed * 0.08 });
      }
    }

    const compactRingLabelIndices = new Set([
      0,
      Math.floor((layout.rings.length - 1) / 2),
      layout.rings.length - 1,
    ]);
    for (const [ringIndex, ring] of layout.rings.entries()) {
      rings
        .circle(0, 0, ring.radius)
        .stroke({ color: graphPalette.ring, width: 1, alpha: 0.21 });
      const tickLength = 6;
      rings
        .moveTo(-tickLength / 2, -ring.radius)
        .lineTo(tickLength / 2, -ring.radius)
        .stroke({ color: graphPalette.relationEmphasis, width: 1, alpha: 0.32 });
      if (width < 600 && !compactRingLabelIndices.has(ringIndex)) continue;
      const label = new Text({
        text: ring.label,
        style: {
          fill: graphPalette.ringText,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 10,
          fontWeight: "500",
          letterSpacing: 0.35,
          stroke: { color: graphPalette.background, width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      label.alpha = 0.72;
      const anchor = { x: 0, y: -ring.radius - 6 };
      label.position.set(anchor.x, anchor.y);
      label.rotation = -wheel.rotation;
      label.scale.set(1 / transformRef.current.zoom);
      ringLayer.addChild(label);
      ringLabels.push(label);
      ringLabelBindings.push({ anchor, label, active: true });
      ringVisuals.set(ring.date, { anchor, label });
    }

    const graphWorld = new Container();
    wheel.addChild(graphWorld);

    const atmosphericLayer = new Graphics();
    const anchorTraceLayer = new Graphics();
    const groupLayer = new Container();
    const relationLayer = new Container();
    const labelLeaderLayer = new Graphics();
    const nodeLayer = new Container();
    const groupLabels: Text[] = [];
    graphWorld.addChild(
      atmosphericLayer,
      anchorTraceLayer,
      groupLayer,
      relationLayer,
      labelLeaderLayer,
      nodeLayer,
    );

    const relationIsVisible = (relation: GraphRelation): boolean => {
      const kind = normalizedKind(String(relation.kind));
      return visibleRelationKinds
        ? visibleKinds.has(kind)
        : relation.visibleByDefault || visibleKinds.has(kind);
    };
    const connectedExplicitPairs = new Set(
      relations.filter(relationIsVisible).map((relation) =>
        [relation.sourceNodeId, relation.targetNodeId].sort().join("\u0000"),
      ),
    );

    const nodesByStream = new Map<string, WorkNode[]>();
    const atmosphericLinks: Array<{
      sourceNodeId: string;
      targetNodeId: string;
      identity: string;
    }> = [];
    for (const node of nodes) {
      const streamNodes = nodesByStream.get(node.workstreamId) ?? [];
      streamNodes.push(node);
      nodesByStream.set(node.workstreamId, streamNodes);
    }
    for (const streamNodes of nodesByStream.values()) {
      streamNodes.sort((left, right) => dateValue(left.startedAt) - dateValue(right.startedAt));
      for (let index = 1; index < streamNodes.length; index += 1) {
        const pairKey = [streamNodes[index - 1].id, streamNodes[index].id]
          .sort()
          .join("\u0000");
        if (connectedExplicitPairs.has(pairKey)) continue;
        const source = positions.get(streamNodes[index - 1].id);
        const target = positions.get(streamNodes[index].id);
        if (!source || !target) continue;
        const identity = `atmosphere-${streamNodes[index - 1].id}-${streamNodes[index].id}`;
        atmosphericLinks.push({
          sourceNodeId: streamNodes[index - 1].id,
          targetNodeId: streamNodes[index].id,
          identity,
        });
        const curve = makeCurve(
          representativePoint(source),
          relativePoint(target),
          identity,
          true,
        );
        drawSolidCurve(atmosphericLayer, curve, graphPalette.relation, 0.7, 0.065);
      }
    }

    const focusedNodeIds = effectiveFocusedWorkstreamId
      ? new Set(
          nodes
            .filter((node) => node.workstreamId === effectiveFocusedWorkstreamId)
            .map((node) => node.id),
        )
      : null;

    const groupColorById = new Map<string, number>();
    const groupColorByNodeId = new Map<string, number>();
    let temporalVisibleNodeIds = initialVisibleNodeIds;
    let temporalVisibleRelationIds = initialVisibleRelationIds;
    const availableGroupColors =
      graphPalette.groupColors.length > 0
        ? graphPalette.groupColors
        : DEFAULT_TEMPORAL_GRAPH_PALETTE.groupColors;
    for (const group of groups) {
      if (group.collapsed) continue;
      const colorIndex =
        Math.floor(hashUnit(group.id) * availableGroupColors.length) % availableGroupColors.length;
      const color =
        groupColorOverrides[group.id] ??
        availableGroupColors[colorIndex] ??
        graphPalette.decision;
      groupColorById.set(group.id, color);
      for (const nodeId of group.memberNodeIds) {
        if (!groupColorByNodeId.has(nodeId)) groupColorByNodeId.set(nodeId, color);
      }
    }

    interface GroupRenderBinding {
      memberNodeIds: readonly string[];
      color: number;
      alpha: number;
      graphics: Graphics;
      label: Text;
      anchor: GraphPoint | null;
    }

    const groupBindings: GroupRenderBinding[] = [];
    const redrawGroupBinding = (binding: GroupRenderBinding) => {
      const memberPoints = binding.memberNodeIds.flatMap((nodeId) => {
        if (!temporalVisibleNodeIds.has(nodeId)) return [];
        const position = positions.get(nodeId);
        if (!position) return [];
        return [
          { x: position.startX, y: position.startY },
          { x: position.endX, y: position.endY },
        ];
      });
      const hull = expandedHull(memberPoints, 19);
      const graphics = binding.graphics;
      graphics.clear();
      graphics.position.set(0, 0);
      graphics.rotation = 0;
      graphics.alpha = binding.alpha;
      if (hull.length === 0) {
        binding.anchor = null;
        binding.label.visible = false;
        return;
      }
      binding.label.visible = true;
      if (hull.length === 1) {
        graphics
          .circle(hull[0].x, hull[0].y, 24)
          .fill({ color: binding.color, alpha: 0.052 })
          .stroke({ color: binding.color, width: 1.15, alpha: 0.38 });
      } else if (hull.length === 2) {
        const [start, end] = hull;
        const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
        graphics.position.set(start.x, start.y);
        graphics.rotation = Math.atan2(end.y - start.y, end.x - start.x);
        graphics
          .roundRect(0, -19, length, 38, 19)
          .fill({ color: binding.color, alpha: 0.052 })
          .stroke({ color: binding.color, width: 1.15, alpha: 0.38 });
      } else {
        graphics
          .poly(hull.flatMap((point) => [point.x, point.y]), true)
          .fill({ color: binding.color, alpha: 0.052 })
          .stroke({ color: binding.color, width: 1.15, alpha: 0.38 });
      }
      const topPoint = hull.reduce((top, point) => (point.y < top.y ? point : top));
      binding.anchor = { x: topPoint.x, y: topPoint.y - 7 };
      binding.label.position.set(binding.anchor.x, binding.anchor.y);
    };

    for (const group of groups) {
      if (group.collapsed) continue;
      const memberNodes = group.memberNodeIds
        .map((nodeId) => nodeById.get(nodeId))
        .filter((node): node is WorkNode => Boolean(node));
      if (memberNodes.length === 0) continue;
      const groupIsInFocus =
        !focusedNodeIds || memberNodes.some((node) => focusedNodeIds.has(node.id));
      const alpha = groupIsInFocus ? 1 : 0.16;
      const groupColor = groupColorById.get(group.id) ?? graphPalette.decision;
      const hullGraphics = new Graphics();
      const label = new Text({
        text: `${group.name} · ${memberNodes.length} work units`,
        style: {
          fill: groupColor,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 9.5,
          fontWeight: "600",
          letterSpacing: 0.35,
          stroke: { color: graphPalette.background, width: 4 },
        },
      });
      label.anchor.set(0.5, 1);
      label.rotation = -wheel.rotation;
      label.scale.set(1 / transformRef.current.zoom);
      label.alpha = alpha;
      const binding: GroupRenderBinding = {
        memberNodeIds: memberNodes.map((node) => node.id),
        color: groupColor,
        alpha,
        graphics: hullGraphics,
        label,
        anchor: null,
      };
      groupLayer.addChild(hullGraphics, label);
      groupBindings.push(binding);
      groupLabels.push(label);
      redrawGroupBinding(binding);
    }

    let renderedRelationCount = 0;

    interface RelationRenderBinding {
      routeId: string;
      constituentRelationIds: readonly string[];
      sourceNodeId: string;
      targetNodeId: string;
      kind: string;
      visual: ReturnType<typeof relationVisual>;
      isSelected: boolean;
      semanticAlpha: number;
      selectionGlow: Graphics | null;
      line: Graphics;
      hitStroke: Graphics;
      hitArea: MutableCurveHitArea;
    }

    const relationBindings: RelationRenderBinding[] = [];

    const orderedRelations = [...relations].sort((left, right) => {
      const priority = (relation: GraphRelation) => {
        switch (normalizedKind(String(relation.kind))) {
          case "same-source-thread":
            return 0;
          case "related-to":
            return 1;
          case "depends-on":
            return 2;
          case "action-of":
            return 4;
          default:
            return 3;
        }
      };
      return priority(left) - priority(right) || left.id.localeCompare(right.id);
    });

    const visibleOrderedRelations = orderedRelations.filter(
      (relation) =>
        relationIsVisible(relation) &&
        positions.has(relation.sourceNodeId) &&
        positions.has(relation.targetNodeId),
    );
    const relationById = new Map(
      visibleOrderedRelations.map((relation) => [relation.id, relation]),
    );
    const edgeInputs: VisualEdgeRouteInput[] = visibleOrderedRelations.map(
      (relation) => ({
        id: relation.id,
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
        halfThickness:
          relationVisual(normalizedKind(String(relation.kind)), graphPalette)
            .width / 2,
      }),
    );
    // A single measured profile clears dense mobile and wide/short canvases
    // without viewport branches. Two bounded fixed steps per frame reach the
    // stationary route state quickly without an unbounded animation.
    const edgeRouteOptions = {
      sampleCount: 8,
      nodePadding: 10,
      nodeRepulsionStrength: 5.4,
      seedStrength: 0.015,
      lengthStrength: 0.004,
      curvatureStrength: 0.006,
      maxControlDrift: 120,
      velocityThreshold: 0.035,
    } as const;
    const currentEdgeRouteNodes = (): EdgeRouteNodeGeometry[] =>
      nodes.flatMap((node) => {
        const position = positions.get(node.id);
        if (!position) return [];
        return [
          {
            nodeId: node.id,
            point: representativePoint(position),
            segmentStart: { x: position.startX, y: position.startY },
            segmentEnd: { x: position.endX, y: position.endY },
            halfThickness: baseCollisionRadii[node.id] ?? 8.5,
          },
        ];
      });
    const reducedEdgeRouteKey = `${semanticRelaxationKey}:${viewport.width}x${viewport.height}:${edgeInputs
      .map((edge) => `${edge.id}:${edge.sourceNodeId}:${edge.targetNodeId}`)
      .join("|")}`;
    let edgeRouteState = motionIsReduced
      && reducedEdgeRouteKeyRef.current === reducedEdgeRouteKey
      && reducedEdgeRouteRef.current?.diagnostics.stopped
      ? reducedEdgeRouteRef.current
      : createEdgeRouteRelaxation(
          currentEdgeRouteNodes(),
          edgeInputs,
          edgeRouteOptions,
        );
    if (motionIsReduced && renderedRelaxationState.stopped && !edgeRouteState.diagnostics.stopped) {
      edgeRouteState = runEdgeRouteRelaxationToStop(edgeRouteState);
    }
    if (motionIsReduced) {
      reducedEdgeRouteRef.current = edgeRouteState;
      reducedEdgeRouteKeyRef.current = reducedEdgeRouteKey;
    }

    for (const routeId of edgeRouteState.routeOrder) {
      const route = edgeRouteState.routes[routeId];
      if (!route) continue;
      const routeRelations = route.constituentEdgeIds.flatMap((relationId) => {
        const relation = relationById.get(relationId);
        return relation ? [relation] : [];
      });
      const selectedRouteRelation = routeRelations.find(
        (relation) => relation.id === selectedRelationId,
      );
      const relation =
        selectedRouteRelation ?? routeRelations[routeRelations.length - 1];
      if (!relation) continue;
      const kind = normalizedKind(String(relation.kind));
      const source = positions.get(relation.sourceNodeId);
      const target = positions.get(relation.targetNodeId);
      if (!source || !target) continue;

      renderedRelationCount += 1;
      const curve = curveFromEdgeRoute(route);
      const visual = relationVisual(kind, graphPalette);
      const isSelected = Boolean(selectedRouteRelation);
      const temporallyVisible = routeRelations.some((item) => initialVisibleRelationIds.has(item.id));
      const isInFocus =
        !focusedNodeIds ||
        focusedNodeIds.has(relation.sourceNodeId) ||
        focusedNodeIds.has(relation.targetNodeId);
      const semanticAlpha = temporallyVisible ? (isSelected ? 1 : isInFocus ? 1 : 0.18) : 0;

      let selectionGlow: Graphics | null = null;
      if (isSelected) {
        selectionGlow = new Graphics();
        drawSolidCurve(selectionGlow, curve, graphPalette.selection, 5.5, 0.15);
        relationLayer.addChild(selectionGlow);
      }

      const line = new Graphics();
      if (visual.pattern === "dashed" || visual.pattern === "dotted") {
        drawPatternedCurve(
          line,
          curve,
          visual.pattern,
          isSelected ? graphPalette.selection : visual.color,
          isSelected ? visual.width + 0.75 : visual.width,
          visual.alpha,
        );
      } else {
        drawSolidCurve(
          line,
          curve,
          isSelected ? graphPalette.selection : visual.color,
          isSelected ? visual.width + 0.75 : visual.width,
          visual.alpha,
        );
      }
      line.alpha = semanticAlpha;
      relationLayer.addChild(line);

      const hitStroke = new Graphics();
      drawSolidCurve(hitStroke, curve, graphPalette.primary, 18, 0.002);
      hitStroke.eventMode = "static";
      if (!temporallyVisible) hitStroke.eventMode = "none";
      hitStroke.cursor = "pointer";
      const hitArea = screenStableCurveHitArea(
        curve,
        () => transformRef.current.zoom,
      );
      hitStroke.hitArea = hitArea;
      hitStroke.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        callbacksRef.current.onRelationSelect?.(relation.id);
      });
      relationLayer.addChild(hitStroke);
      relationBindings.push({
        routeId,
        constituentRelationIds: routeRelations.map((item) => item.id),
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
        kind,
        visual,
        isSelected,
        semanticAlpha,
        selectionGlow,
        line,
        hitStroke,
        hitArea,
      });
    }
    renderCountsRef.current.relations = renderedRelationCount;

    const redrawRelationBinding = (binding: RelationRenderBinding) => {
      const source = positions.get(binding.sourceNodeId);
      const target = positions.get(binding.targetNodeId);
      if (!source || !target) return;
      const relaxedRoute = edgeRouteState.routes[binding.routeId];
      if (!relaxedRoute) return;
      const curve = curveFromEdgeRoute(relaxedRoute);
      if (binding.selectionGlow) {
        binding.selectionGlow.clear();
        drawSolidCurve(
          binding.selectionGlow,
          curve,
          graphPalette.selection,
          5.5,
          0.15,
        );
      }
      binding.line.clear();
      const color = binding.isSelected
        ? graphPalette.selection
        : binding.visual.color;
      const width = binding.isSelected
        ? binding.visual.width + 0.75
        : binding.visual.width;
      if (
        binding.visual.pattern === "dashed" ||
        binding.visual.pattern === "dotted"
      ) {
        drawPatternedCurve(
          binding.line,
          curve,
          binding.visual.pattern,
          color,
          width,
          binding.visual.alpha,
        );
      } else {
        drawSolidCurve(
          binding.line,
          curve,
          color,
          width,
          binding.visual.alpha,
        );
      }
      binding.line.alpha = binding.semanticAlpha;
      binding.hitStroke.clear();
      drawSolidCurve(
        binding.hitStroke,
        curve,
        graphPalette.primary,
        18,
        0.002,
      );
      binding.hitArea.update(curve);
    };

    const nodeLabels: Text[] = [];
    const streamLabels: Text[] = [];
    const streamLabelBindings: Array<{
      anchor: GraphPoint;
      label: Text;
      workstreamId: string;
    }> = [];
    const compactViewport = width < 720;

    // In a focused workstream, every free-floating title in the graph field
    // should identify an actual node. Lane names remain available in project
    // overview and throughout the surrounding semantic UI, but hiding them
    // here prevents a workstream name from masquerading as an orphan node title.
    for (const workstream of effectiveFocusedWorkstreamId ? [] : workstreams) {
      const labelRadius = compactViewport ? layout.outerRadius - 7 : layout.outerRadius + 17;
      const pointsRight = Math.cos(workstream.angle) >= 0;
      const label = new Text({
        text: `STREAM · ${workstream.name}`,
        style: {
          fill: graphPalette.mutedText,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: compactViewport ? 9 : 10,
          fontWeight: "600",
          letterSpacing: 0.45,
          stroke: { color: graphPalette.background, width: 3 },
        },
      });
      label.anchor.set(
        compactViewport ? (pointsRight ? 1 : 0) : (pointsRight ? 0 : 1),
        0.5,
      );
      const anchor = {
        x: Math.cos(workstream.angle) * labelRadius,
        y: Math.sin(workstream.angle) * labelRadius,
      };
      label.position.set(anchor.x, anchor.y);
      label.alpha =
        effectiveFocusedWorkstreamId && effectiveFocusedWorkstreamId !== workstream.id
          ? 0.18
          : 0.72;
      label.rotation = -wheel.rotation;
      label.scale.set(1 / transformRef.current.zoom);
      graphWorld.addChild(label);
      streamLabels.push(label);
      streamLabelBindings.push({ anchor, label, workstreamId: workstream.id });
    }

    interface FocusedLabelPlacement {
      preferredDirection: -1 | 1;
    }

    const focusedLabelPlacements = new Map<string, FocusedLabelPlacement>();
    const effectiveFocusedStream = effectiveFocusedWorkstreamId
      ? workstreams.find((workstream) => workstream.id === effectiveFocusedWorkstreamId)
      : undefined;
    const focusAngle = focusedNodePosition?.angle ?? effectiveFocusedStream?.angle;
    if (focusAngle !== undefined && effectiveFocusedWorkstreamId) {
      const radial = { x: Math.cos(focusAngle), y: Math.sin(focusAngle) };
      const candidates = nodes
        .filter(
          (node) =>
            node.workstreamId === effectiveFocusedWorkstreamId &&
            !isSatellite(node) &&
            positions.has(node.id),
        )
        .sort((left, right) => {
          if (left.id === selectedNodeId) return -1;
          if (right.id === selectedNodeId) return 1;
          const leftPosition = positions.get(left.id)!;
          const rightPosition = positions.get(right.id)!;
          const leftProjection = leftPosition.endX * radial.x + leftPosition.endY * radial.y;
          const rightProjection = rightPosition.endX * radial.x + rightPosition.endY * radial.y;
          return leftProjection - rightProjection;
        });

      for (let index = 0; index < candidates.length; index += 1) {
        const node = candidates[index];
        focusedLabelPlacements.set(node.id, {
          preferredDirection: index % 2 === 0 ? -1 : 1,
        });
      }
    }

    const nodeAlphaTransitions: NodeAlphaTransition[] = [];
    const selectionAlphaTransitions: NodeAlphaTransition[] = [];
    const labelAlphaTransitions: NodeAlphaTransition[] = [];
    const screenStableNodeHitTargets: ScreenStableNodeHitTarget[] = [];
    const alphaTransitionStartedAt = performance.now();
    const liveNodeIds = new Set(nodes.map((node) => node.id));
    selectionGlyphsRef.current.clear();
    selectionGlyphRenderersRef.current.clear();
    for (const nodeId of nodeAlphaValuesRef.current.keys()) {
      if (!liveNodeIds.has(nodeId)) nodeAlphaValuesRef.current.delete(nodeId);
    }
    for (const nodeId of selectionAlphaValuesRef.current.keys()) {
      if (!liveNodeIds.has(nodeId)) selectionAlphaValuesRef.current.delete(nodeId);
    }
    for (const nodeId of selectionColorValuesRef.current.keys()) {
      if (!liveNodeIds.has(nodeId)) selectionColorValuesRef.current.delete(nodeId);
    }
    for (const nodeId of labelAlphaValuesRef.current.keys()) {
      if (!liveNodeIds.has(nodeId)) labelAlphaValuesRef.current.delete(nodeId);
    }

    interface NodeRenderBinding {
      nodeId: string;
      container: Container;
      glyph: Graphics;
      selectionGlyph: Graphics;
      duration: boolean;
      initialSegmentAngle: number;
      initialSegmentLength: number;
    }

    interface NodeLabelBinding {
      nodeId: string;
      label: Text;
      selected: boolean;
      pointsRight: boolean;
      focusedPlacement?: FocusedLabelPlacement;
    }

    const nodeBindings: NodeRenderBinding[] = [];
    const nodeLabelBindings: NodeLabelBinding[] = [];
    const suppressedNodeTapPointerIds = new Set<number>();
    let selectedLabelToFront: Text | null = null;

    for (const node of nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      const status = String(node.status);
      const tone = nodeTone(node, graphPalette);
      const groupAccent = groupColorByNodeId.get(node.id);
      const satellite = isSatellite(node);
      const decision = isDecision(node);
      const planned = isPlannedStatus(status);
      const failed = isFailedStatus(status);
      const active = isActiveStatus(status);
      const selected = node.id === selectedNodeId;
      const multiSelected = selectedSet.has(node.id);
      const inFocus =
        !effectiveFocusedWorkstreamId || effectiveFocusedWorkstreamId === node.workstreamId;
      const temporallyVisible = initialVisibleNodeIds.has(node.id);
      const semanticAlpha = temporallyVisible
        ? selected || multiSelected ? 1 : inFocus ? 0.96 : 0.15
        : 0;
      const radius = satellite ? 3.25 : decision ? 5 : 5.4;
      const deltaX = position.endX - position.startX;
      const deltaY = position.endY - position.startY;
      const durationLength = Math.hypot(deltaX, deltaY);
      const duration = durationLength > 3.5;

      const nodeContainer = new Container();
      nodeContainer.position.set(position.startX, position.startY);
      const previousNodeAlpha = nodeAlphaValuesRef.current.get(node.id) ?? semanticAlpha;
      const initialNodeAlpha = motionIsReduced ? semanticAlpha : previousNodeAlpha;
      nodeContainer.alpha = initialNodeAlpha;
      nodeAlphaValuesRef.current.set(node.id, initialNodeAlpha);
      if (!motionIsReduced && Math.abs(initialNodeAlpha - semanticAlpha) > 0.001) {
        nodeAlphaTransitions.push({
          nodeId: node.id,
          displayObject: nodeContainer,
          from: initialNodeAlpha,
          to: semanticAlpha,
          startedAt: alphaTransitionStartedAt,
          durationMs: 360,
        });
      }
      nodeContainer.eventMode = temporallyVisible ? "static" : "none";
      nodeContainer.cursor = temporallyVisible ? "pointer" : "default";
      const nodeHitArea = new Rectangle();
      nodeContainer.hitArea = nodeHitArea;
      screenStableNodeHitTargets.push({
        nodeId: node.id,
        area: nodeHitArea,
        deltaX,
        deltaY,
      });
      nodeContainer.on("pointerdown", (event: FederatedPointerEvent) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        suppressedNodeTapPointerIds.delete(event.pointerId);
        const currentPosition = positions.get(node.id);
        if (!currentPosition) return;
        const start = { x: event.global.x, y: event.global.y };
        if (event.pointerType === "touch") {
          activeTouchPoints.set(event.pointerId, start);
          if (activeTouchPoints.size >= 2) {
            startPinchSession();
            return;
          }
        }
        startPointerSession({
          mode: event.shiftKey ? "node-move" : "action",
          pointerId: event.pointerId,
          start,
          latest: start,
          startPanX: transformRef.current.panX,
          startPanY: transformRef.current.panY,
          sourceNodeId: node.id,
          sourcePoint: screenFromWorld(
            representativePoint(currentPosition),
            center,
            transformRef.current,
          ),
          moveStartState: event.shiftKey ? renderedRelaxationState : undefined,
          moveStartEdgeState: event.shiftKey ? edgeRouteState : undefined,
          moveStartOffset: event.shiftKey
            ? {
                angleOffset:
                  renderedRelaxationState.nodes[node.id]?.angleOffset ?? 0,
                radialOffset:
                  renderedRelaxationState.nodes[node.id]?.satelliteOfNodeId
                    ? renderedRelaxationState.nodes[node.id]?.radialOffset ?? 0
                    : undefined,
              }
            : undefined,
        });
      });
      nodeContainer.on("pointerup", (event: FederatedPointerEvent) => {
        if (
          Math.hypot(
            event.global.x - (pointerSession?.start.x ?? event.global.x),
            event.global.y - (pointerSession?.start.y ?? event.global.y),
          ) >= 8
        ) {
          suppressedNodeTapPointerIds.add(event.pointerId);
        }
      });
      nodeContainer.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        if (suppressedNodeTapPointerIds.delete(event.pointerId)) return;
        if (event.detail >= 2) {
          callbacksRef.current.onNodeFocus?.(node.id, node.workstreamId);
          return;
        }
        callbacksRef.current.onNodeSelect?.(node.id, {
          additive: event.shiftKey || event.ctrlKey || event.metaKey,
          source: "canvas",
        });
      });

      const glyph = new Graphics();
      const selectionGlyph = new Graphics();
      const initialSegmentAngle = duration ? Math.atan2(deltaY, deltaX) : 0;
      nodeBindings.push({
        nodeId: node.id,
        container: nodeContainer,
        glyph,
        selectionGlyph,
        duration,
        initialSegmentAngle,
        initialSegmentLength: Math.max(0.001, durationLength),
      });
      selectionGlyphsRef.current.set(node.id, selectionGlyph);
      const pointRadius = radius + 1;
      const diamondRadius = radius + 1;
      const silhouetteColor = failed
        ? graphPalette.failed
        : status === "blocked"
          ? graphPalette.blocked
          : planned || active
            ? graphPalette.planned
            : decision
              ? graphPalette.decision
              : groupAccent ?? tone;
      const drawSelectionGlyph = (isPrimary: boolean, isMulti: boolean) => {
        const target = isPrimary || isMulti ? 1 : 0;
        const desiredColor = isPrimary ? graphPalette.selection : graphPalette.planned;
        if (target > 0) selectionColorValuesRef.current.set(node.id, desiredColor);
        const color = target > 0
          ? desiredColor
          : selectionColorValuesRef.current.get(node.id) ?? desiredColor;
        selectionGlyph.clear();
        if (duration) {
          selectionGlyph
            .moveTo(0, 0)
            .lineTo(deltaX, deltaY)
            .stroke({
              color,
              width: radius * 3.2,
              alpha: isPrimary ? 0.42 : 0.3,
              cap: "round",
            });
        } else if (decision) {
          selectionGlyph
            .poly(
              [
                0,
                -diamondRadius,
                diamondRadius,
                0,
                0,
                diamondRadius,
                -diamondRadius,
                0,
              ],
              true,
            )
            .fill({ color, alpha: isPrimary ? 0.25 : 0.18 })
            .stroke({ color, width: isPrimary ? 1.8 : 1.35, alpha: 1 });
        } else if (status === "blocked") {
          selectionGlyph
            .roundRect(-pointRadius, -pointRadius, pointRadius * 2, pointRadius * 2, 2)
            .fill({ color, alpha: isPrimary ? 0.25 : 0.18 })
            .stroke({ color, width: isPrimary ? 1.8 : 1.35, alpha: 1 });
        } else {
          selectionGlyph
            .circle(0, 0, pointRadius)
            .fill({ color, alpha: isPrimary ? 0.25 : 0.18 })
            .stroke({ color, width: isPrimary ? 1.8 : 1.35, alpha: 1 });
        }
        if (motionIsReduced) {
          selectionGlyph.alpha = target;
          selectionAlphaValuesRef.current.set(node.id, target);
        }
      };
      selectionGlyphRenderersRef.current.set(node.id, drawSelectionGlyph);
      drawSelectionGlyph(selected, multiSelected);
      const selectionTarget = selected || multiSelected ? 1 : 0;
      const previousSelectionAlpha =
        selectionAlphaValuesRef.current.get(node.id) ?? selectionTarget;
      const initialSelectionAlpha = motionIsReduced
        ? selectionTarget
        : previousSelectionAlpha;
      selectionGlyph.alpha = initialSelectionAlpha;
      selectionAlphaValuesRef.current.set(node.id, initialSelectionAlpha);
      if (
        !motionIsReduced &&
        Math.abs(initialSelectionAlpha - selectionTarget) > 0.001
      ) {
        selectionAlphaTransitions.push({
          nodeId: node.id,
          displayObject: selectionGlyph,
          from: initialSelectionAlpha,
          to: selectionTarget,
          startedAt: alphaTransitionStartedAt,
          durationMs: 300,
        });
      }

      if (duration) {
        glyph
          .moveTo(0, 0)
          .lineTo(deltaX, deltaY)
          .stroke({
            color: silhouetteColor,
            width: radius * 3.2,
            alpha: planned ? 0.72 : active ? 0.72 : 0.88,
            cap: "round",
          });
      } else if (decision) {
        glyph
          .poly(
            [
              0,
              -diamondRadius,
              diamondRadius,
              0,
              0,
              diamondRadius,
              -diamondRadius,
              0,
            ],
            true,
          )
          .fill({ color: silhouetteColor, alpha: planned ? 0.055 : 0.84 })
          .stroke({ color: silhouetteColor, width: planned ? 1.55 : 0.9, alpha: 0.95 });
      } else if (planned) {
        glyph
          .circle(0, 0, pointRadius)
          .fill({ color: silhouetteColor, alpha: 0.04 })
          .stroke({ color: silhouetteColor, width: 1.6, alpha: 0.94 });
      } else if (status === "blocked") {
        glyph
          .roundRect(-pointRadius, -pointRadius, pointRadius * 2, pointRadius * 2, 2)
          .fill({ color: silhouetteColor, alpha: 0.7 })
          .stroke({ color: silhouetteColor, width: 1, alpha: 0.95 });
      } else {
        glyph
          .circle(0, 0, pointRadius)
          .fill({ color: silhouetteColor, alpha: active ? 0.72 : 0.9 })
          .stroke({ color: silhouetteColor, width: 0.85, alpha: 0.98 });
        glyph.circle(-radius * 0.24, -radius * 0.27, radius * 0.27).fill({
          color: graphPalette.primary,
          alpha: 0.62,
        });
      }

      if (failed) {
        const failureMark = Math.max(1.6, radius * 0.48);
        glyph
          .moveTo(deltaX - failureMark, deltaY - failureMark)
          .lineTo(deltaX + failureMark, deltaY + failureMark)
          .moveTo(deltaX + failureMark, deltaY - failureMark)
          .lineTo(deltaX - failureMark, deltaY + failureMark)
          .stroke({ color: graphPalette.ink, width: 1.15, alpha: 0.82, cap: "round" });
      }

      if (active) {
        glyph
          .circle(deltaX, deltaY, Math.max(1.1, radius * 0.26))
          .fill({ color: graphPalette.ink, alpha: 0.72 });
      }

      if (groupAccent !== undefined && groupAccent !== silhouetteColor) {
        glyph
          .circle(
            duration ? deltaX * 0.5 : radius * 0.34,
            duration ? deltaY * 0.5 : radius * 0.34,
            Math.max(1, radius * 0.24),
          )
          .fill({ color: groupAccent, alpha: 0.96 });
      }

      nodeContainer.addChild(glyph, selectionGlyph);
      if (duration) {
        glyph.rotation = -initialSegmentAngle;
        selectionGlyph.rotation = -initialSegmentAngle;
        nodeContainer.rotation = initialSegmentAngle;
      }
      nodeLayer.addChild(nodeContainer);

      const showLabel = temporallyVisible && (
        selected ||
        multiSelected ||
        node.id.startsWith("group-node:") ||
        (effectiveFocusedWorkstreamId === node.workstreamId && !satellite)
      );
      const labelTargetAlpha = showLabel
        ? selected
          ? 1
          : focusedLabelPlacements.has(node.id)
            ? 0.9
            : 0.78
        : 0;
      const previousLabelAlpha = labelAlphaValuesRef.current.get(node.id) ?? 0;
      // Keep all labels allocated so selection and focus can update
      // synchronously without rebuilding the retained Pixi scene.
      {
        const focusedPlacement = focusedLabelPlacements.get(node.id);
        const labelPointsRight = focusedPlacement
          ? position.endX > 0
          : compactViewport && position.endX > 0;
        const label = new Text({
          text: node.title,
          style: {
            fill: selected ? graphPalette.selectedLabel : graphPalette.mutedText,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: compactViewport
              ? selected
                ? 10.5
                : 9.25
              : selected
                ? 11
                : 9.5,
            fontWeight: selected ? "600" : "500",
            letterSpacing: 0.1,
            stroke: { color: graphPalette.background, width: 4 },
            wordWrap: compactViewport,
            wordWrapWidth: compactViewport ? Math.min(154, width * 0.4) : undefined,
          },
        });
        label.anchor.set(labelPointsRight ? 1 : 0, 0.5);
        label.position.set(
          position.endX + (labelPointsRight ? -9 : 9),
          position.endY - 1,
        );
        label.rotation = -wheel.rotation;
        label.scale.set(1 / transformRef.current.zoom);
        const initialLabelAlpha = motionIsReduced
          ? labelTargetAlpha
          : previousLabelAlpha;
        label.alpha = initialLabelAlpha;
        labelAlphaValuesRef.current.set(node.id, initialLabelAlpha);
        if (
          !motionIsReduced &&
          Math.abs(initialLabelAlpha - labelTargetAlpha) > 0.001
        ) {
          labelAlphaTransitions.push({
            nodeId: node.id,
            displayObject: label,
            from: initialLabelAlpha,
            to: labelTargetAlpha,
            startedAt: alphaTransitionStartedAt,
            durationMs: 320,
          });
        } else if (motionIsReduced && labelTargetAlpha === 0) {
          labelAlphaValuesRef.current.delete(node.id);
        }

        if (selected) selectedLabelToFront = label;
        else graphWorld.addChild(label);
        nodeLabels.push(label);
        nodeLabelBindings.push({
          nodeId: node.id,
          label,
          selected,
          pointsRight: labelPointsRight,
          focusedPlacement,
        });
      }
    }

    if (selectedLabelToFront) graphWorld.addChild(selectedLabelToFront);

    const activeTouchPoints = new Map<number, GraphPoint>();
    const overlay = new Graphics();
    overlay.eventMode = "none";
    app.stage.addChild(overlay);

    let relaxedGeometryVersion = 0;
    let focusedLabelLayoutSignature = "";
    const textScreenRect = (label: Text): ScreenRect => {
      const bounds = label.getLocalBounds();
      const screen = screenFromWorld(
        { x: label.position.x, y: label.position.y },
        center,
        transformRef.current,
      );
      return {
        left: screen.x + bounds.minX,
        top: screen.y + bounds.minY,
        right: screen.x + bounds.maxX,
        bottom: screen.y + bounds.maxY,
      };
    };

    const screenLabelSafeBounds: ScreenRect = {
      left: 8,
      top: 8,
      right: width - 8,
      bottom: height - 8,
    };
    const rectIsInside = (rect: ScreenRect, bounds: ScreenRect) =>
      rect.left >= bounds.left - 0.5 &&
      rect.top >= bounds.top - 0.5 &&
      rect.right <= bounds.right + 0.5 &&
      rect.bottom <= bounds.bottom + 0.5;

    const layoutRingLabels = () => {
      const placed: ScreenRect[] = [];
      let hiddenLabels = 0;
      for (const { anchor, label, active } of ringLabelBindings) {
        if (!active) {
          label.visible = false;
          continue;
        }
        label.position.set(anchor.x, anchor.y);
        label.visible = true;
        const rect = textScreenRect(label);
        if (
          !rectIsInside(rect, screenLabelSafeBounds) ||
          placed.some((other) => screenRectsOverlap(rect, other, 4))
        ) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }
        placed.push(rect);
      }
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphRingLabelCount = String(ringLabelBindings.length);
        wrapper.dataset.graphRingLabelsHidden = String(hiddenLabels);
        wrapper.dataset.graphVisibleRingLabelsOutOfBounds = String(
          ringLabels.filter(
            (label) =>
              label.visible && !rectIsInside(textScreenRect(label), screenLabelSafeBounds),
          ).length,
        );
      }
    };

    const layoutStreamLabels = () => {
      const safeBounds = screenLabelSafeBounds;
      const occupied = ringLabels
        .filter((label) => label.visible && label.alpha > 0.05)
        .map(textScreenRect);
      let hiddenLabels = 0;

      for (const binding of streamLabelBindings) {
        const { anchor, label } = binding;
        label.visible = true;
        label.position.set(anchor.x, anchor.y);
        const anchorScreen = screenFromWorld(
          anchor,
          center,
          transformRef.current,
        );

        // Workstream names are screen-stable. Point their text inward at the
        // current rotated/zoomed edge, then clamp the measured Pixi Text bounds
        // in screen space. This avoids the focused 3-o'clock stream becoming a
        // clipped sentence while leaving the focused node-label packer intact.
        label.anchor.set(anchorScreen.x >= width / 2 ? 1 : 0, 0.5);
        const textBounds = label.getLocalBounds();
        const textWidth = textBounds.maxX - textBounds.minX;
        const textHeight = textBounds.maxY - textBounds.minY;
        const allowedWidth = safeBounds.right - safeBounds.left;
        const allowedHeight = safeBounds.bottom - safeBounds.top;
        const outsideReachX = Math.max(32, textWidth);
        const outsideReachY = Math.max(24, textHeight * 2);
        if (
          textWidth > allowedWidth ||
          textHeight > allowedHeight ||
          anchorScreen.x < safeBounds.left - outsideReachX ||
          anchorScreen.x > safeBounds.right + outsideReachX ||
          anchorScreen.y < safeBounds.top - outsideReachY ||
          anchorScreen.y > safeBounds.bottom + outsideReachY
        ) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }

        const offsets = width < 600
          ? [
              { x: 0, y: 0 },
              { x: 0, y: 16 },
              { x: 0, y: -16 },
              { x: -22, y: 0 },
              { x: 22, y: 0 },
              { x: 0, y: 32 },
              { x: 0, y: -32 },
            ]
          : [{ x: 0, y: 0 }];
        let accepted:
          | { anchor: GraphPoint; rect: ScreenRect }
          | undefined;
        for (const offset of offsets) {
          const desiredAnchor = {
            x: anchorScreen.x + offset.x,
            y: anchorScreen.y + offset.y,
          };
          const desiredRect: ScreenRect = {
            left: desiredAnchor.x + textBounds.minX,
            top: desiredAnchor.y + textBounds.minY,
            right: desiredAnchor.x + textBounds.maxX,
            bottom: desiredAnchor.y + textBounds.maxY,
          };
          const rect = clampScreenRect(desiredRect, safeBounds);
          if (occupied.some((other) => screenRectsOverlap(rect, other, 4))) continue;
          accepted = {
            anchor: {
              x: desiredAnchor.x + rect.left - desiredRect.left,
              y: desiredAnchor.y + rect.top - desiredRect.top,
            },
            rect,
          };
          break;
        }
        if (!accepted) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }
        const worldAnchor = worldFromScreen(
          accepted.anchor,
          center,
          transformRef.current,
        );
        label.position.set(worldAnchor.x, worldAnchor.y);
        const finalRect = textScreenRect(label);
        if (!rectIsInside(finalRect, safeBounds)) {
          label.visible = false;
          hiddenLabels += 1;
        } else {
          occupied.push(finalRect);
        }
      }

      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphStreamLabelsHidden = String(hiddenLabels);
        wrapper.dataset.graphVisibleStreamLabelCount = String(
          streamLabels.filter((label) => label.visible && label.alpha > 0.05).length,
        );
        wrapper.dataset.graphVisibleStreamLabelsOutOfBounds = String(
          streamLabels.filter(
            (label) =>
              label.visible && !rectIsInside(textScreenRect(label), screenLabelSafeBounds),
          ).length,
        );
      }
    };

    const layoutGroupLabels = () => {
      const occupied = [...ringLabels, ...streamLabels]
        .filter((label) => label.visible && label.alpha > 0.05)
        .map(textScreenRect);
      let hiddenLabels = 0;

      for (const binding of groupBindings) {
        const { anchor, label } = binding;
        if (!anchor) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }
        label.visible = true;
        label.position.set(anchor.x, anchor.y);
        const anchorScreen = screenFromWorld(
          anchor,
          center,
          transformRef.current,
        );
        const textBounds = label.getLocalBounds();
        const textWidth = textBounds.maxX - textBounds.minX;
        const textHeight = textBounds.maxY - textBounds.minY;
        if (
          textWidth > screenLabelSafeBounds.right - screenLabelSafeBounds.left ||
          textHeight > screenLabelSafeBounds.bottom - screenLabelSafeBounds.top
        ) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }
        const offsets = width < 600
          ? [
              { x: 0, y: 0 },
              { x: -24, y: 0 },
              { x: 24, y: 0 },
              { x: 0, y: 18 },
              { x: 0, y: -18 },
              { x: -48, y: 18 },
              { x: 48, y: 18 },
            ]
          : [{ x: 0, y: 0 }];
        let accepted:
          | { anchor: GraphPoint; rect: ScreenRect }
          | undefined;
        for (const offset of offsets) {
          const desiredAnchor = {
            x: anchorScreen.x + offset.x,
            y: anchorScreen.y + offset.y,
          };
          const desiredRect: ScreenRect = {
            left: desiredAnchor.x + textBounds.minX,
            top: desiredAnchor.y + textBounds.minY,
            right: desiredAnchor.x + textBounds.maxX,
            bottom: desiredAnchor.y + textBounds.maxY,
          };
          const rect = clampScreenRect(desiredRect, screenLabelSafeBounds);
          if (occupied.some((other) => screenRectsOverlap(rect, other, 4))) continue;
          accepted = {
            anchor: {
              x: desiredAnchor.x + rect.left - desiredRect.left,
              y: desiredAnchor.y + rect.top - desiredRect.top,
            },
            rect,
          };
          break;
        }
        if (!accepted) {
          label.visible = false;
          hiddenLabels += 1;
          continue;
        }
        const worldAnchor = worldFromScreen(
          accepted.anchor,
          center,
          transformRef.current,
        );
        label.position.set(worldAnchor.x, worldAnchor.y);
        const finalRect = textScreenRect(label);
        if (!rectIsInside(finalRect, screenLabelSafeBounds)) {
          label.visible = false;
          hiddenLabels += 1;
        } else {
          occupied.push(finalRect);
        }
      }

      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphGroupLabelsHidden = String(hiddenLabels);
        wrapper.dataset.graphVisibleGroupLabelsOutOfBounds = String(
          groupLabels.filter(
            (label) =>
              label.visible && !rectIsInside(textScreenRect(label), screenLabelSafeBounds),
          ).length,
        );
      }
    };

    const layoutNodeLabels = (force = false) => {
      const transform = transformRef.current;
      const measuredBoundsSignature = nodeLabelBindings
        .filter((binding) => binding.focusedPlacement)
        .map((binding) => {
          const bounds = binding.label.getLocalBounds();
          return `${binding.nodeId}:${(bounds.maxX - bounds.minX).toFixed(1)}x${(
            bounds.maxY - bounds.minY
          ).toFixed(1)}`;
        })
        .join("|");
      const signature = [
        relaxedGeometryVersion,
        transform.zoom.toFixed(4),
        transform.rotation.toFixed(4),
        transform.panX.toFixed(2),
        transform.panY.toFixed(2),
        measuredBoundsSignature,
      ].join(":");
      if (!force && signature === focusedLabelLayoutSignature) return;
      focusedLabelLayoutSignature = signature;

      for (const binding of nodeLabelBindings) {
        if (binding.focusedPlacement) continue;
        const position = positions.get(binding.nodeId);
        if (!position) continue;
        binding.label.visible = true;
        binding.label.position.set(
          position.endX + (binding.pointsRight ? -9 : 9),
          position.endY - 1,
        );
      }

      const safeBounds: ScreenRect = {
        left: 8,
        top: Math.min(56, Math.max(8, height * 0.18)),
        right: width - 8,
        bottom: Math.max(80, height - 72),
      };
      const obstacles: ScreenRect[] = [];
      for (const node of nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const start = screenFromWorld(
          { x: position.startX, y: position.startY },
          center,
          transform,
        );
        const end = screenFromWorld(
          { x: position.endX, y: position.endY },
          center,
          transform,
        );
        const duration =
          Math.hypot(
            position.endX - position.startX,
            position.endY - position.startY,
          ) > 3.5;
        const glyphRadius =
          (isSatellite(node)
            ? 4.5
            : duration
              ? 9
              : isDecision(node)
                ? 7.5
                : 8.5) *
          transform.zoom;
        obstacles.push({
          left: Math.min(start.x, end.x) - glyphRadius,
          top: Math.min(start.y, end.y) - glyphRadius,
          right: Math.max(start.x, end.x) + glyphRadius,
          bottom: Math.max(start.y, end.y) + glyphRadius,
        });
      }
      for (const label of [...ringLabels, ...streamLabels, ...groupLabels]) {
        if (label.visible && label.alpha > 0.05) obstacles.push(textScreenRect(label));
      }
      for (const binding of nodeLabelBindings) {
        if (
          !binding.focusedPlacement &&
          binding.label.visible &&
          binding.label.alpha > 0.05
        ) {
          obstacles.push(textScreenRect(binding.label));
        }
      }

      const focusedBindings = nodeLabelBindings
        .filter((binding) => binding.focusedPlacement)
        .sort((left, right) => {
          if (left.selected !== right.selected) return left.selected ? -1 : 1;
          const leftPosition = positions.get(left.nodeId);
          const rightPosition = positions.get(right.nodeId);
          if (!leftPosition || !rightPosition) return left.nodeId.localeCompare(right.nodeId);
          const leftScreen = screenFromWorld(
            representativePoint(leftPosition),
            center,
            transform,
          );
          const rightScreen = screenFromWorld(
            representativePoint(rightPosition),
            center,
            transform,
          );
          return leftScreen.x - rightScreen.x || left.nodeId.localeCompare(right.nodeId);
        });
      const placedLabelRects: ScreenRect[] = [];
      let hiddenFocusedLabels = 0;
      let focusedLabelLeaderCount = 0;
      let maximumFocusedLabelLeaderLength = 0;

      labelLeaderLayer.clear();
      for (const binding of focusedBindings) {
        const position = positions.get(binding.nodeId);
        const placement = binding.focusedPlacement;
        if (!position || !placement) continue;
        const endpoint = screenFromWorld(
          representativePoint(position),
          center,
          transform,
        );
        const anchorX: 0 | 1 = endpoint.x > width * 0.58 ? 1 : 0;
        binding.label.anchor.set(anchorX, 0.5);
        const textBounds = binding.label.getLocalBounds();
        const textHeight = Math.max(1, textBounds.maxY - textBounds.minY);
        const baseDistance = 15 + textHeight / 2;
        const laneStep = textHeight + 4;
        const horizontalShifts = [0, -36, 36, -72, 72];
        let accepted:
          | { rect: ScreenRect; anchorScreen: GraphPoint }
          | undefined;

        for (let lane = 0; lane < 12 && !accepted; lane += 1) {
          for (const direction of [
            placement.preferredDirection,
            -placement.preferredDirection as -1 | 1,
          ]) {
            for (const horizontalShift of horizontalShifts) {
              const desiredAnchor = {
                x: endpoint.x + (anchorX === 1 ? -12 : 12) + horizontalShift,
                y: endpoint.y + direction * (baseDistance + lane * laneStep),
              };
              const desiredRect: ScreenRect = {
                left: desiredAnchor.x + textBounds.minX,
                top: desiredAnchor.y + textBounds.minY,
                right: desiredAnchor.x + textBounds.maxX,
                bottom: desiredAnchor.y + textBounds.maxY,
              };
              const rect = clampScreenRect(desiredRect, safeBounds);
              if (
                obstacles.some((obstacle) =>
                  screenRectsOverlap(rect, obstacle, 4),
                ) ||
                placedLabelRects.some((placed) =>
                  screenRectsOverlap(rect, placed, 4),
                )
              ) {
                continue;
              }
              accepted = {
                rect,
                anchorScreen: {
                  x: desiredAnchor.x + (rect.left - desiredRect.left),
                  y: desiredAnchor.y + (rect.top - desiredRect.top),
                },
              };
              break;
            }
            if (accepted) break;
          }
        }

        if (!accepted) {
          binding.label.visible = false;
          hiddenFocusedLabels += 1;
          continue;
        }
        binding.label.visible = true;
        const worldAnchor = worldFromScreen(
          accepted.anchorScreen,
          center,
          transform,
        );
        binding.label.position.set(worldAnchor.x, worldAnchor.y);
        const finalRect = textScreenRect(binding.label);
        placedLabelRects.push(finalRect);
        const leaderSink = closestPointOnScreenRect(endpoint, finalRect);
        const leaderDeltaX = leaderSink.x - endpoint.x;
        const leaderDeltaY = leaderSink.y - endpoint.y;
        const leaderDistance = Math.max(
          0.001,
          Math.hypot(leaderDeltaX, leaderDeltaY),
        );
        const leaderUnitX = leaderDeltaX / leaderDistance;
        const leaderUnitY = leaderDeltaY / leaderDistance;
        const glyphRadius =
          (baseCollisionRadii[binding.nodeId] ?? 8.5) * transform.zoom;
        const sourceOffset = Math.min(
          Math.max(0, leaderDistance - 3),
          glyphRadius + 2,
        );
        const sinkOffset = Math.min(2, Math.max(0, leaderDistance - sourceOffset));
        const leaderStartScreen = {
          x: endpoint.x + leaderUnitX * sourceOffset,
          y: endpoint.y + leaderUnitY * sourceOffset,
        };
        const leaderEndScreen = {
          x: leaderSink.x - leaderUnitX * sinkOffset,
          y: leaderSink.y - leaderUnitY * sinkOffset,
        };
        const leaderLength = Math.hypot(
          leaderEndScreen.x - leaderStartScreen.x,
          leaderEndScreen.y - leaderStartScreen.y,
        );
        maximumFocusedLabelLeaderLength = Math.max(
          maximumFocusedLabelLeaderLength,
          leaderLength,
        );
        const leaderStart = worldFromScreen(
          leaderStartScreen,
          center,
          transform,
        );
        const leaderEnd = worldFromScreen(
          leaderEndScreen,
          center,
          transform,
        );
        labelLeaderLayer
          .moveTo(leaderStart.x, leaderStart.y)
          .lineTo(leaderEnd.x, leaderEnd.y)
          .stroke({
            color: binding.selected
              ? graphPalette.selection
              : graphPalette.relationEmphasis,
            width: 0.85 / Math.max(0.001, transform.zoom),
            alpha: binding.selected ? 0.64 : 0.46,
            cap: "round",
          });
        focusedLabelLeaderCount += 1;
      }

      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphFocusedLabelClearance = "4";
        wrapper.dataset.graphFocusedLabelCount = String(focusedBindings.length);
        wrapper.dataset.graphFocusedLabelsHidden = String(hiddenFocusedLabels);
        wrapper.dataset.graphFocusedLabelLeaderCount = String(
          focusedLabelLeaderCount,
        );
        wrapper.dataset.graphFocusedLabelMaximumLeaderLength =
          maximumFocusedLabelLeaderLength.toFixed(2);
      }
    };

    const redrawRelationRoutes = () => {
      for (const binding of relationBindings) redrawRelationBinding(binding);
    };

    const redrawRelaxedGeometry = (reseedEdges = true) => {
      relaxedGeometryVersion += 1;
      if (reseedEdges) {
        edgeRouteState = createEdgeRouteRelaxation(
          currentEdgeRouteNodes(),
          edgeInputs,
          edgeRouteOptions,
        );
        if (motionIsReduced && renderedRelaxationState.stopped) {
          edgeRouteState = runEdgeRouteRelaxationToStop(edgeRouteState);
        }
      }
      atmosphericLayer.clear();
      for (const link of atmosphericLinks) {
        const source = positions.get(link.sourceNodeId);
        const target = positions.get(link.targetNodeId);
        if (!source || !target) continue;
        drawSolidCurve(
          atmosphericLayer,
          makeCurve(
            representativePoint(source),
            relativePoint(target),
            link.identity,
            true,
          ),
          graphPalette.relation,
          0.7,
          0.065,
        );
      }

      anchorTraceLayer.clear();
      for (const node of nodes) {
        const semantic = layout.positions[node.id];
        const relaxed = positions.get(node.id);
        if (!semantic || !relaxed) continue;
        const anchor = {
          x: semantic.endX - center.x,
          y: semantic.endY - center.y,
        };
        const endpoint = representativePoint(relaxed);
        if (Math.hypot(endpoint.x - anchor.x, endpoint.y - anchor.y) <= 2) continue;
        anchorTraceLayer
          .moveTo(anchor.x, anchor.y)
          .lineTo(endpoint.x, endpoint.y)
          .stroke({
            color: graphPalette.relation,
            width: 0.7,
            alpha: 0.13,
            cap: "round",
          });
      }

      for (const binding of groupBindings) redrawGroupBinding(binding);
      redrawRelationRoutes();

      for (const binding of nodeBindings) {
        const position = positions.get(binding.nodeId);
        if (!position) continue;
        binding.container.position.set(position.startX, position.startY);
        if (binding.duration) {
          const segmentLength = Math.max(
            0.001,
            Math.hypot(
              position.endY - position.startY,
              position.endX - position.startX,
            ),
          );
          binding.container.rotation = Math.atan2(
            position.endY - position.startY,
            position.endX - position.startX,
          );
          const longitudinalScale = segmentLength / binding.initialSegmentLength;
          binding.glyph.scale.x = longitudinalScale;
          binding.selectionGlyph.scale.x = longitudinalScale;
        }
      }

      layoutRingLabels();
      layoutStreamLabels();
      layoutGroupLabels();
      layoutNodeLabels(true);
    };
    redrawRelaxedGeometry();

    const graphTransition = new GraphTransitionCoordinator();
    let pendingDateWindowSequence = initialDateWindowSnapshot?.sequence ?? 0;
    let pendingPreviewAcceptedAt = initialDateWindowSnapshot?.acceptedAt ?? performance.now();
    let lastPaintedDateWindowSequence = -1;
    let renderReducedDateSnapshot: (() => void) | null = null;
    let latestTransitionLayout = layout;
    const ringDefinitionByDate = new Map(
      layout.rings.map((ring) => [ring.date, ring] as const),
    );

    const boundarySideForNode = (
      node: WorkNode,
      snapshot: TemporalGraphDateWindowSnapshot,
    ): "inner" | "outer" => {
      const start = dateValue(node.startedAt);
      const end = dateValue(node.endedAt ?? node.startedAt);
      return Math.max(start, end) < snapshot.window.startMs ? "inner" : "outer";
    };

    const transitionTargets = (
      snapshot: TemporalGraphDateWindowSnapshot,
      targetLayout: GraphLayout,
      targetPositions: ReadonlyMap<string, RelativeNodePosition>,
      targetRoutes: EdgeRouteRelaxationState,
    ): GraphBindingTarget[] => {
      const visibleNodeIds = new Set(snapshot.visibleNodeIds);
      const visibleRelationIds = new Set(snapshot.visibleRelationIds);
      const targets: GraphBindingTarget[] = [];
      const radialNodePoints = [["startX", "startY"], ["endX", "endY"]] as const;

      for (const node of nodes) {
        if (!visibleNodeIds.has(node.id)) continue;
        const position = targetPositions.get(node.id);
        if (!position) continue;
        const entryBoundary = boundarySideForNode(node, snapshot);
        const channels = {
          startX: position.startX,
          startY: position.startY,
          endX: position.endX,
          endY: position.endY,
          angle: position.angle,
        };
        const selected = node.id === selectedNodeId || selectedSet.has(node.id);
        const inFocus = !effectiveFocusedWorkstreamId
          || effectiveFocusedWorkstreamId === node.workstreamId;
        targets.push({
          id: graphBindingId("node", node.id),
          kind: "node",
          channels,
          opacity: selected ? 1 : inFocus ? 0.96 : 0.15,
          interactive: true,
          entryBoundary,
          radialPoints: radialNodePoints,
        });
        targets.push({
          id: graphBindingId("hit-target", node.id),
          kind: "hit-target",
          channels,
          opacity: 1,
          interactive: true,
          entryBoundary,
          radialPoints: radialNodePoints,
        });
        const labelBinding = nodeLabelBindings.find((binding) => binding.nodeId === node.id);
        if (labelBinding) {
          const labelVisible = selected
            || node.id.startsWith("group-node:")
            || (effectiveFocusedWorkstreamId === node.workstreamId && !isSatellite(node));
          targets.push({
            id: graphBindingId("label", `node:${node.id}`),
            kind: "label",
            channels: { x: position.endX, y: position.endY },
            opacity: labelVisible ? selected ? 1 : 0.82 : 0,
            interactive: false,
            entryBoundary,
          });
        }
      }

      for (const binding of relationBindings) {
        const visible = binding.constituentRelationIds.some((id) => visibleRelationIds.has(id));
        const source = targetPositions.get(binding.sourceNodeId);
        const target = targetPositions.get(binding.targetNodeId);
        if (!visible || !source || !target) continue;
        const route = targetRoutes.routes[binding.routeId];
        const curve = route
          ? curveFromEdgeRoute(route)
          : makeCurve(representativePoint(source), representativePoint(target), binding.routeId);
        const relationInFocus = !focusedNodeIds
          || focusedNodeIds.has(binding.sourceNodeId)
          || focusedNodeIds.has(binding.targetNodeId);
        targets.push({
          id: graphBindingId("relation", binding.routeId),
          kind: "relation",
          channels: {
            sourceX: curve.source.x,
            sourceY: curve.source.y,
            control1X: curve.control1.x,
            control1Y: curve.control1.y,
            control2X: curve.control2.x,
            control2Y: curve.control2.y,
            targetX: curve.target.x,
            targetY: curve.target.y,
          },
          opacity: binding.isSelected || relationInFocus ? 1 : 0.18,
          interactive: true,
          radialPoints: [
            ["sourceX", "sourceY"],
            ["control1X", "control1Y"],
            ["control2X", "control2Y"],
            ["targetX", "targetY"],
          ],
        });
      }

      for (const [index, binding] of groupBindings.entries()) {
        const points = binding.memberNodeIds.flatMap((nodeId) => {
          if (!visibleNodeIds.has(nodeId)) return [];
          const position = targetPositions.get(nodeId);
          return position ? [representativePoint(position)] : [];
        });
        if (points.length === 0) continue;
        const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        targets.push({
          id: graphBindingId("group", String(index)),
          kind: "group",
          channels: { x, y },
          opacity: binding.alpha,
          interactive: false,
        });
      }

      for (const ring of targetLayout.rings) {
        ringDefinitionByDate.set(ring.date, ring);
        targets.push({
          id: graphBindingId("ring", ring.date),
          kind: "ring",
          channels: { x: 0, y: -ring.radius, radius: ring.radius },
          opacity: 1,
          interactive: false,
        });
      }
      return targets;
    };

    const targetGeometryForSnapshot = (snapshot: TemporalGraphDateWindowSnapshot) => {
      const layoutStartedAt = performance.now();
      const visibleNodeIds = new Set(snapshot.visibleNodeIds);
      const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id));
      const targetLayout = createTemporalLayout(nodes, workstreams, {
        width,
        height,
        padding: Math.max(30, Math.min(width, height) * 0.055),
        rotationRadians: 0,
        zoom: 1,
        pan: { x: 0, y: 0 },
        timeDomain: snapshot.window,
        visibleIntervals: snapshot.visibleIntervals,
      });
      const targetBaseCollisionRadii = Object.fromEntries(
        visibleNodes.map((node) => {
          const position = targetLayout.positions[node.id];
          const radius = position?.isSatellite
            ? 4.5
            : position?.isDuration
              ? 9
              : isDecision(node)
                ? 7.5
                : 8.5;
          return [node.id, radius];
        }),
      );
      const targetFocusRepulsion = focusRepulsionNeighborhood(
        visibleNodes,
        relations,
        selectedNodeId,
      );
      const targetCollisionRadii = Object.fromEntries(
        Object.entries(targetBaseCollisionRadii).map(([nodeId, radius]) => {
          const distance = targetFocusRepulsion.get(nodeId);
          const influence =
            distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0;
          return [nodeId, radius + influence];
        }),
      );
      const targetRelaxationOptions: ForceRelaxationOptions = {
        collisionPadding: 4,
        collisionRadii: targetCollisionRadii,
        glyphRadii: targetBaseCollisionRadii,
        pinnedOffsets: manualNodeOffsets,
      };
      const forceStartedAt = performance.now();
      let targetRelaxation = createForceRelaxation(
        targetLayout,
        visibleNodes,
        targetRelaxationOptions,
      );
      let previewForceSteps = 0;
      while (targetRelaxation.glyphOverlapCount > 0 && previewForceSteps < 16) {
        targetRelaxation = stepForceRelaxation(targetRelaxation);
        previewForceSteps += 1;
      }
      const forceFallback = targetRelaxation.glyphOverlapCount > 0;
      if (forceFallback) {
        targetRelaxation = runForceRelaxationToStop(targetRelaxation);
      }
      const relaxedTargetLayout = applyForceRelaxation(targetLayout, targetRelaxation);
      const targetPositions = new Map<string, RelativeNodePosition>();
      for (const node of visibleNodes) {
        const position = relaxedTargetLayout.positions[node.id];
        if (!position) continue;
        targetPositions.set(node.id, {
          x: finite(position.x - center.x),
          y: finite(position.y - center.y),
          startX: finite(position.startX - center.x),
          startY: finite(position.startY - center.y),
          endX: finite(position.endX - center.x),
          endY: finite(position.endY - center.y),
          angle: finite(position.angle),
        });
      }
      const forceFinishedAt = performance.now();
      const visibleRelationIds = new Set(snapshot.visibleRelationIds);
      const targetEdgeInputs = edgeInputs.filter((edge) => visibleRelationIds.has(edge.id));
      const targetEdgeNodes = visibleNodes.flatMap((node): EdgeRouteNodeGeometry[] => {
        const position = targetPositions.get(node.id);
        if (!position) return [];
        return [{
          nodeId: node.id,
          point: representativePoint(position),
          segmentStart: { x: position.startX, y: position.startY },
          segmentEnd: { x: position.endX, y: position.endY },
          halfThickness: targetBaseCollisionRadii[node.id] ?? 8.5,
        }];
      });
      let targetRoutes = createEdgeRouteRelaxation(
        targetEdgeNodes,
        targetEdgeInputs,
        edgeRouteOptions,
      );
      const initialRouteNodeViolations = targetRoutes.diagnostics.nodeViolations;
      const initialRouteEdgeConflicts = targetRoutes.diagnostics.edgeConflicts;
      let previewRouteSteps = 0;
      while (
        (targetRoutes.diagnostics.nodeViolations > 0
          || targetRoutes.diagnostics.edgeConflicts > 0)
        && previewRouteSteps < 24
      ) {
        targetRoutes = stepEdgeRouteRelaxation(targetRoutes, 2);
        previewRouteSteps += 2;
      }
      const previewRouteNodeViolations = targetRoutes.diagnostics.nodeViolations;
      const previewRouteEdgeConflicts = targetRoutes.diagnostics.edgeConflicts;
      const edgeFallback = (
        targetRoutes.diagnostics.nodeViolations > 0
        || targetRoutes.diagnostics.edgeConflicts > 0
      );
      if (edgeFallback) {
        targetRoutes = runEdgeRouteRelaxationToStop(targetRoutes);
      }
      const edgeFinishedAt = performance.now();
      return {
        targetLayout,
        targetPositions,
        targetRoutes,
        timing: {
          layoutMs: forceStartedAt - layoutStartedAt,
          forceMs: forceFinishedAt - forceStartedAt,
          edgeMs: edgeFinishedAt - forceFinishedAt,
          previewForceSteps,
          previewRouteSteps,
          routeCount: targetRoutes.routeOrder.length,
          initialRouteNodeViolations,
          initialRouteEdgeConflicts,
          previewRouteNodeViolations,
          previewRouteEdgeConflicts,
          forceFallback,
          edgeFallback,
        },
      };
    };

    const initialGeometry = {
      targetLayout: layout,
      targetPositions: positions,
      targetRoutes: edgeRouteState,
    };
    graphTransition.initialize(
      transitionTargets(
        initialDateWindowSnapshot ?? {
          sequence: 0,
          acceptedAt: performance.now(),
          window: { startMs: dateValue(layout.minDate), endMs: dateValue(layout.maxDate) },
          visibleNodeIds: nodes.map((node) => node.id),
          visibleRelationIds: relations.map((relation) => relation.id),
          visibleIntervals: new Map(),
        },
        initialGeometry.targetLayout,
        initialGeometry.targetPositions,
        initialGeometry.targetRoutes,
      ),
      performance.now(),
    );

    const applyDateWindowSnapshot = (snapshot: TemporalGraphDateWindowSnapshot) => {
      if (snapshot.sequence < pendingDateWindowSequence) return;
      pendingDateWindowSequence = snapshot.sequence;
      pendingPreviewAcceptedAt = snapshot.acceptedAt;
      temporalVisibleNodeIds = new Set(snapshot.visibleNodeIds);
      temporalVisibleRelationIds = new Set(snapshot.visibleRelationIds);
      const computationStartedAt = performance.now();
      const geometry = targetGeometryForSnapshot(snapshot);
      const computationFinishedAt = performance.now();
      latestTransitionLayout = geometry.targetLayout;
      const exitBoundaryById: Partial<Record<ReturnType<typeof graphBindingId>, "inner" | "outer">> = {};
      for (const node of nodes) {
        if (temporalVisibleNodeIds.has(node.id)) continue;
        const side = boundarySideForNode(node, snapshot);
        exitBoundaryById[graphBindingId("node", node.id)] = side;
        exitBoundaryById[graphBindingId("hit-target", node.id)] = side;
        exitBoundaryById[graphBindingId("label", `node:${node.id}`)] = side;
      }
      graphTransition.retarget(
        transitionTargets(snapshot, geometry.targetLayout, geometry.targetPositions, geometry.targetRoutes),
        {
          durationMs: motionIsReduced ? 0 : 320,
          reducedMotion: motionIsReduced,
          radialBoundary: {
            centerX: 0,
            centerY: 0,
            innerRadius: geometry.targetLayout.innerRadius,
            outerRadius: geometry.targetLayout.outerRadius,
          },
          exitBoundaryById,
        },
      );
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphDateWindowSequence = String(snapshot.sequence);
        wrapper.dataset.graphDateWindowStartMs = String(snapshot.window.startMs);
        wrapper.dataset.graphDateWindowEndMs = String(snapshot.window.endMs);
        wrapper.dataset.graphDateWindowAcceptedAt = snapshot.acceptedAt.toFixed(3);
        wrapper.dataset.graphDateWindowCadence = geometry.targetLayout.ringCadence;
        wrapper.dataset.graphDateWindowGeometryComputeMs = (
          computationFinishedAt - computationStartedAt
        ).toFixed(3);
        wrapper.dataset.graphDateWindowLayoutComputeMs = geometry.timing.layoutMs.toFixed(3);
        wrapper.dataset.graphDateWindowForceComputeMs = geometry.timing.forceMs.toFixed(3);
        wrapper.dataset.graphDateWindowEdgeComputeMs = geometry.timing.edgeMs.toFixed(3);
        wrapper.dataset.graphDateWindowForceSteps = String(geometry.timing.previewForceSteps);
        wrapper.dataset.graphDateWindowEdgeSteps = String(geometry.timing.previewRouteSteps);
        wrapper.dataset.graphDateWindowRouteCount = String(geometry.timing.routeCount);
        wrapper.dataset.graphDateWindowInitialRouteNodeViolations = String(
          geometry.timing.initialRouteNodeViolations,
        );
        wrapper.dataset.graphDateWindowInitialRouteEdgeConflicts = String(
          geometry.timing.initialRouteEdgeConflicts,
        );
        wrapper.dataset.graphDateWindowPreviewRouteNodeViolations = String(
          geometry.timing.previewRouteNodeViolations,
        );
        wrapper.dataset.graphDateWindowPreviewRouteEdgeConflicts = String(
          geometry.timing.previewRouteEdgeConflicts,
        );
        wrapper.dataset.graphDateWindowForceFallback = String(geometry.timing.forceFallback);
        wrapper.dataset.graphDateWindowEdgeFallback = String(geometry.timing.edgeFallback);
      }
      if (motionIsReduced) {
        renderReducedDateSnapshot?.();
      }
    };

    sceneRef.current = {
      camera,
      wheel,
      graphWorld,
      overlay,
      center,
      positions,
      ringLabels,
      nodeLabels,
      streamLabels,
      groupLabels,
      width,
      height,
      applyDateWindowSnapshot,
    };

    let pointerSession: PointerSession | null = null;
    let moved = false;
    let touchLassoTimer: number | null = null;
    let touchLassoPointerId: number | null = null;

    function nodeMoveOffsetForPoint(
      session: PointerSession,
      point: GraphPoint,
    ): ManualNodeOffset | null {
      if (
        session.mode !== "node-move" ||
        !session.sourceNodeId ||
        !session.moveStartState ||
        !session.moveStartOffset
      ) {
        return null;
      }
      const physicsNode = session.moveStartState.nodes[session.sourceNodeId];
      if (!physicsNode) return null;
      const startWorld = worldFromScreen(
        session.start,
        center,
        transformRef.current,
      );
      const currentWorld = worldFromScreen(
        point,
        center,
        transformRef.current,
      );
      const angleOffset =
        session.moveStartOffset.angleOffset +
        shortestAngleDelta(
          Math.atan2(startWorld.y, startWorld.x),
          Math.atan2(currentWorld.y, currentWorld.x),
        );
      const radialOffset = physicsNode.satelliteOfNodeId
        ? (session.moveStartOffset.radialOffset ?? 0) +
          Math.hypot(currentWorld.x, currentWorld.y) -
          Math.hypot(startWorld.x, startWorld.y)
        : 0;
      return clampManualNodeOffset(
        physicsNode,
        { angleOffset, radialOffset },
        session.moveStartState.options.maxSatelliteRadialDrift,
      );
    }

    function previewNodeMove(
      session: PointerSession,
      offset: ManualNodeOffset,
    ): void {
      if (!session.sourceNodeId || !session.moveStartState) return;
      const sourceNode = session.moveStartState.nodes[session.sourceNodeId];
      if (!sourceNode) return;
      const radialOffset = sourceNode.satelliteOfNodeId
        ? offset.radialOffset ?? 0
        : 0;
      const renderAngle = sourceNode.anchorAngle + offset.angleOffset;
      const renderRadius = sourceNode.anchorRadius + radialOffset;
      const movedNode = {
        ...sourceNode,
        pinned: true,
        angleOffset: offset.angleOffset,
        targetAngleOffset: offset.angleOffset,
        angularVelocity: 0,
        radialOffset,
        targetRadialOffset: radialOffset,
        radialVelocity: 0,
        renderAngle,
        x: center.x + Math.cos(renderAngle) * renderRadius,
        y: center.y + Math.sin(renderAngle) * renderRadius,
      };
      session.movePreviewOffset = offset;
      renderedRelaxationState = {
        ...session.moveStartState,
        nodes: {
          ...session.moveStartState.nodes,
          [session.sourceNodeId]: movedNode,
        },
      };
      syncPositionsFromLayout(
        applyForceRelaxation(layout, renderedRelaxationState),
      );
      redrawRelaxedGeometry();
    }

    function restoreNodeMoveSnapshot(session: PointerSession): void {
      if (session.mode !== "node-move" || !session.moveStartState) return;
      renderedRelaxationState = session.moveStartState;
      forceRelaxationRef.current = renderedRelaxationState;
      forceRelaxationStartedAtRef.current = performance.now();
      syncPositionsFromLayout(
        applyForceRelaxation(layout, renderedRelaxationState),
      );
      if (session.moveStartEdgeState) {
        edgeRouteState = session.moveStartEdgeState;
      }
      redrawRelaxedGeometry(!session.moveStartEdgeState);
      if (
        !renderedRelaxationState.stopped ||
        !edgeRouteState.diagnostics.stopped
      ) {
        ensureForceRelaxationTicker();
      }
    }

    function commitNodeMove(
      session: PointerSession,
      offset: ManualNodeOffset,
    ): void {
      if (!session.sourceNodeId) return;
      const pinnedOffsets = {
        ...manualNodeOffsets,
        [session.sourceNodeId]: offset,
      };
      const nextOptions: ForceRelaxationOptions = {
        ...relaxationOptions,
        pinnedOffsets,
      };
      const nextSemanticOptions: ForceRelaxationOptions = {
        ...semanticRelaxationOptions,
        pinnedOffsets,
      };
      renderedRelaxationState = retargetForceRelaxation(
        renderedRelaxationState,
        layout,
        nodes,
        nextOptions,
      );
      if (motionIsReduced) {
        renderedRelaxationState = runForceRelaxationToStop(
          renderedRelaxationState,
        );
      }
      forceRelaxationRef.current = renderedRelaxationState;
      forceRelaxationContextKeyRef.current = forceRelaxationKey(
        layout,
        nodes,
        nextOptions,
      );
      forceRelaxationSemanticKeyRef.current = forceRelaxationKey(
        layout,
        nodes,
        nextSemanticOptions,
      );
      forceRelaxationStartedAtRef.current = performance.now();
      syncPositionsFromLayout(
        applyForceRelaxation(layout, renderedRelaxationState),
      );
      redrawRelaxedGeometry();
      relaxedFocusRetargeted = false;
      if (!renderedRelaxationState.stopped) ensureForceRelaxationTicker();
      callbacksRef.current.onNodeMoveComplete?.({
        nodeId: session.sourceNodeId,
        angleOffset: offset.angleOffset,
        ...(offset.radialOffset === undefined
          ? {}
          : { radialOffset: offset.radialOffset }),
      });
    }

    function cancelTouchLassoTimer(): void {
      if (touchLassoTimer !== null) window.clearTimeout(touchLassoTimer);
      touchLassoTimer = null;
      touchLassoPointerId = null;
    }

    function armTouchLasso(pointerId: number, start: GraphPoint): void {
      cancelTouchLassoTimer();
      touchLassoPointerId = pointerId;
      touchLassoTimer = window.setTimeout(() => {
        touchLassoTimer = null;
        touchLassoPointerId = null;
        if (
          !pointerSession ||
          pointerSession.mode !== "pan" ||
          pointerSession.pointerId !== pointerId ||
          !activeTouchPoints.has(pointerId) ||
          moved
        ) {
          return;
        }
        // Blank-stage touch is unified: holding deliberately promotes the
        // pending pan into lasso without exposing a persistent mode toggle.
        pointerSession.mode = "lasso";
        pointerSession.start = start;
        pointerSession.latest = start;
        moved = true;
        drawLasso(overlay, start, start, graphPalette);
        const wrapper = wrapperRef.current;
        if (wrapper) wrapper.dataset.graphPointerMode = "lasso";
      }, 360);
    }

    function cleanupPointerWindowListeners(): void {
      cancelTouchLassoTimer();
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      pointerSession = null;
      pointerCleanupRef.current = null;
      if (sceneRef.current?.overlay === overlay) overlay.clear();
      const wrapper = wrapperRef.current;
      if (wrapper) wrapper.dataset.graphPointerMode = "idle";
    }

    function startPointerSession(session: PointerSession): void {
      const interruptedSession = pointerSession;
      pointerCleanupRef.current?.();
      if (interruptedSession?.mode === "node-move") {
        restoreNodeMoveSnapshot(interruptedSession);
      }
      pointerSession = session;
      moved = false;
      window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
      window.addEventListener("pointerup", handleWindowPointerUp);
      window.addEventListener("pointercancel", handleWindowPointerCancel);
      pointerCleanupRef.current = cleanupPointerWindowListeners;
      const wrapper = wrapperRef.current;
      if (wrapper) wrapper.dataset.graphPointerMode = session.mode;
    }

    function startPinchSession(): void {
      const entries = [...activeTouchPoints.entries()].slice(0, 2);
      if (entries.length < 2) return;
      const [[firstPointerId, first], [secondPointerId, second]] = entries;
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      // Direct manipulation takes ownership from an in-flight semantic zoom so
      // no concurrent camera tween can pull the anchored midpoint away.
      focusZoomTransitionRef.current = null;
      manualZoomTransitionRef.current = null;
      focusZoomTargetRef.current = focusZoomRef.current;
      const startZoom = transformRef.current.zoom;
      transformRef.current.targetZoom = startZoom;
      const startDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      startPointerSession({
        mode: "pinch",
        pointerId: firstPointerId,
        secondaryPointerId: secondPointerId,
        start: midpoint,
        latest: midpoint,
        startPanX: transformRef.current.panX,
        startPanY: transformRef.current.panY,
        startZoom,
        startDistance,
        pinchAnchorX:
          (midpoint.x - center.x - transformRef.current.panX) / Math.max(0.001, startZoom),
        pinchAnchorY:
          (midpoint.y - center.y - transformRef.current.panY) / Math.max(0.001, startZoom),
      });
    }

    function handleWindowPointerMove(event: PointerEvent): void {
      if (!pointerSession) return;
      const point = canvasPointFromPointer(event, activeCanvas, { width, height });

      if (event.pointerType === "touch" && activeTouchPoints.has(event.pointerId)) {
        activeTouchPoints.set(event.pointerId, point);
      }

      if (pointerSession.mode === "pinch") {
        const first = activeTouchPoints.get(pointerSession.pointerId);
        const second = pointerSession.secondaryPointerId !== undefined
          ? activeTouchPoints.get(pointerSession.secondaryPointerId)
          : undefined;
        if (
          !first ||
          !second ||
          !pointerSession.startDistance ||
          !pointerSession.startZoom ||
          pointerSession.pinchAnchorX === undefined ||
          pointerSession.pinchAnchorY === undefined
        ) {
          return;
        }
        event.preventDefault();
        moved = true;
        const midpoint = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const nextZoom = clampZoom(
          pointerSession.startZoom * (distance / pointerSession.startDistance),
        );
        transformRef.current.panX =
          midpoint.x - center.x - pointerSession.pinchAnchorX * nextZoom;
        transformRef.current.panY =
          midpoint.y - center.y - pointerSession.pinchAnchorY * nextZoom;
        manualZoomRef.current = nextZoom / Math.max(0.001, focusZoomRef.current);
        transformRef.current.zoom = nextZoom;
        transformRef.current.targetZoom = clampZoom(
          manualZoomRef.current * focusZoomTargetRef.current,
        );
        camera.position.set(
          center.x + transformRef.current.panX,
          center.y + transformRef.current.panY,
        );
        camera.scale.set(nextZoom);
        return;
      }

      if (event.pointerId !== pointerSession.pointerId) return;
      pointerSession.latest = point;
      const dx = point.x - pointerSession.start.x;
      const dy = point.y - pointerSession.start.y;
      if (
        event.pointerType === "touch" &&
        pointerSession.mode === "pan" &&
        touchLassoTimer !== null &&
        touchLassoPointerId === event.pointerId
      ) {
        const bounds = activeCanvas.getBoundingClientRect();
        const cssDistance = Math.hypot(
          dx * (bounds.width / Math.max(1, width)),
          dy * (bounds.height / Math.max(1, height)),
        );
        if (cssDistance < 6) {
          event.preventDefault();
          return;
        }
        cancelTouchLassoTimer();
      }
      if (Math.hypot(dx, dy) > 3) moved = true;

      if (pointerSession.mode === "pan") {
        transformRef.current.panX = pointerSession.startPanX + dx;
        transformRef.current.panY = pointerSession.startPanY + dy;
        camera.position.set(
          center.x + transformRef.current.panX,
          center.y + transformRef.current.panY,
        );
        background.cursor = "grabbing";
      } else if (pointerSession.mode === "lasso") {
        event.preventDefault();
        drawLasso(overlay, pointerSession.start, point, graphPalette);
      } else if (pointerSession.mode === "action" && pointerSession.sourcePoint) {
        if (Math.hypot(dx, dy) >= 8) {
          event.preventDefault();
          suppressedNodeTapPointerIds.add(event.pointerId);
          drawActionArrow(overlay, pointerSession.sourcePoint, point, graphPalette);
        } else {
          overlay.clear();
        }
      } else if (pointerSession.mode === "node-move") {
        if (Math.hypot(dx, dy) >= 8) {
          event.preventDefault();
          suppressedNodeTapPointerIds.add(event.pointerId);
          const offset = nodeMoveOffsetForPoint(pointerSession, point);
          if (offset) previewNodeMove(pointerSession, offset);
        }
      }
    }

    function handleWindowPointerUp(event: PointerEvent): void {
      if (event.pointerType === "touch") activeTouchPoints.delete(event.pointerId);
      if (!pointerSession) return;

      if (pointerSession.mode === "pinch") {
        if (
          event.pointerId !== pointerSession.pointerId &&
          event.pointerId !== pointerSession.secondaryPointerId
        ) {
          return;
        }
        const remaining = [...activeTouchPoints.entries()][0];
        cleanupPointerWindowListeners();
        background.cursor = "grab";
        if (activeTouchPoints.size >= 2) {
          startPinchSession();
        } else if (remaining) {
          const [pointerId, point] = remaining;
          startPointerSession({
            mode: "pan",
            pointerId,
            start: point,
            latest: point,
            startPanX: transformRef.current.panX,
            startPanY: transformRef.current.panY,
          });
        }
        return;
      }

      if (event.pointerId !== pointerSession.pointerId) return;
      const session = pointerSession;
      const point = canvasPointFromPointer(event, activeCanvas, { width, height });
      const distance = Math.hypot(point.x - session.start.x, point.y - session.start.y);
      if (
        (session.mode === "action" || session.mode === "node-move") &&
        distance >= 8
      ) {
        suppressedNodeTapPointerIds.add(event.pointerId);
      }

      if (session.mode === "lasso" && distance >= 6) {
        const left = Math.min(session.start.x, point.x);
        const right = Math.max(session.start.x, point.x);
        const top = Math.min(session.start.y, point.y);
        const bottom = Math.max(session.start.y, point.y);
        const selectedIds = nodes
          .filter((node) => {
            const position = positions.get(node.id);
            if (!position) return false;
            const projected = screenFromWorld(
              representativePoint(position),
              center,
              transformRef.current,
            );
            return projected.x >= left && projected.x <= right && projected.y >= top && projected.y <= bottom;
          })
          .map((node) => node.id);
        callbacksRef.current.onLassoComplete?.(selectedIds);
      } else if (
        session.mode === "node-move" &&
        distance >= 8 &&
        session.movePreviewOffset
      ) {
        if (callbacksRef.current.onNodeMoveComplete) {
          commitNodeMove(session, session.movePreviewOffset);
        } else {
          restoreNodeMoveSnapshot(session);
        }
      } else if (
        session.mode === "action" &&
        session.sourceNodeId &&
        session.sourcePoint &&
        distance >= 8
      ) {
        const canvasBounds = activeCanvas.getBoundingClientRect();
        const releasedInsideCanvas =
          event.clientX >= canvasBounds.left &&
          event.clientX <= canvasBounds.right &&
          event.clientY >= canvasBounds.top &&
          event.clientY <= canvasBounds.bottom;
        const safelyAwayFromNodes = nodes.every((node) => {
          const position = positions.get(node.id);
          if (!position) return true;
          const start = screenFromWorld(
            { x: position.startX, y: position.startY },
            center,
            transformRef.current,
          );
          const end = screenFromWorld(
            { x: position.endX, y: position.endY },
            center,
            transformRef.current,
          );
          const toClient = (point: GraphPoint): GraphPoint => ({
            x:
              canvasBounds.left +
              (point.x / Math.max(1, width)) * canvasBounds.width,
            y:
              canvasBounds.top +
              (point.y / Math.max(1, height)) * canvasBounds.height,
          });
          return (
            squaredDistanceToSegment(
              event.clientX,
              event.clientY,
              toClient(start),
              toClient(end),
            ) >=
            18 * 18
          );
        });

        if (releasedInsideCanvas && safelyAwayFromNodes) {
          const worldPoint = worldFromScreen(point, center, transformRef.current);
          callbacksRef.current.onActionDragComplete?.({
            sourceNodeId: session.sourceNodeId,
            trigger: "pointer",
            graphPoint: { x: worldPoint.x + center.x, y: worldPoint.y + center.y },
            canvasPoint: point,
            clientPoint: { x: event.clientX, y: event.clientY },
          });
        }
      }

      background.cursor = "grab";
      cleanupPointerWindowListeners();
    }

    function handleWindowPointerCancel(event: PointerEvent): void {
      if (event.pointerType === "touch") activeTouchPoints.delete(event.pointerId);
      suppressedNodeTapPointerIds.delete(event.pointerId);
      if (!pointerSession) return;
      const belongsToSession =
        event.pointerId === pointerSession.pointerId ||
        event.pointerId === pointerSession.secondaryPointerId;
      if (!belongsToSession) return;
      if (pointerSession.mode === "node-move") {
        restoreNodeMoveSnapshot(pointerSession);
      }
      background.cursor = "grab";
      cleanupPointerWindowListeners();
    }

    background.on("pointerdown", (event: FederatedPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const point = { x: event.global.x, y: event.global.y };
      if (event.pointerType === "touch") {
        activeTouchPoints.set(event.pointerId, point);
        if (activeTouchPoints.size >= 2) {
          startPinchSession();
          return;
        }
      }
      startPointerSession({
        mode: event.shiftKey ? "lasso" : "pan",
        pointerId: event.pointerId,
        start: point,
        latest: point,
        startPanX: transformRef.current.panX,
        startPanY: transformRef.current.panY,
      });
      if (event.pointerType === "touch") armTouchLasso(event.pointerId, point);
    });
    background.on("pointertap", (event: FederatedPointerEvent) => {
      if (!moved && event.detail >= 2) callbacksRef.current.onStepOut?.();
    });

    const onCanvasTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activeTouchPoints.set(
        event.pointerId,
        canvasPointFromPointer(event, activeCanvas, { width, height }),
      );
      if (activeTouchPoints.size < 2) return;
      event.preventDefault();
      queueMicrotask(() => {
        if (activeTouchPoints.size >= 2 && pointerSession?.mode !== "pinch") {
          startPinchSession();
        }
      });
    };
    const onGlobalTouchEnd = (event: PointerEvent) => {
      if (event.pointerType === "touch") activeTouchPoints.delete(event.pointerId);
    };
    activeCanvas.addEventListener("pointerdown", onCanvasTouchPointerDown, {
      passive: false,
    });
    window.addEventListener("pointerup", onGlobalTouchEnd);
    window.addEventListener("pointercancel", onGlobalTouchEnd);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      manualZoomTransitionRef.current = null;
      focusZoomTransitionRef.current = null;
      focusZoomTargetRef.current = focusZoomRef.current;
      const bounds = activeCanvas.getBoundingClientRect();
      const cursor = {
        x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width,
        y: ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * height,
      };
      const currentZoom = transformRef.current.zoom;
      const nextZoom = clampZoom(currentZoom * Math.exp(-event.deltaY * 0.0012));
      if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

      const cameraX = center.x + transformRef.current.panX;
      const cameraY = center.y + transformRef.current.panY;
      transformRef.current.panX += (cursor.x - cameraX) * (1 - nextZoom / currentZoom);
      transformRef.current.panY += (cursor.y - cameraY) * (1 - nextZoom / currentZoom);
      manualZoomRef.current = nextZoom / Math.max(0.001, focusZoomRef.current);
      transformRef.current.zoom = nextZoom;
      transformRef.current.targetZoom = clampZoom(
        manualZoomRef.current * focusZoomTargetRef.current,
      );
      camera.position.set(
        center.x + transformRef.current.panX,
        center.y + transformRef.current.panY,
      );
      camera.scale.set(nextZoom);
    };
    activeCanvas.addEventListener("wheel", onWheel, { passive: false });

    let lastDiagnosticsAt = 0;
    let reducedSemanticLayoutLocked = false;
    const updateLabelTransforms = () => {
      const inverseZoom = 1 / Math.max(0.001, transformRef.current.zoom);
      const inverseRotation = -transformRef.current.rotation;
      for (const label of ringLabels) {
        label.rotation = inverseRotation;
        label.scale.set(inverseZoom);
      }
      for (const label of nodeLabels) {
        label.rotation = inverseRotation;
        label.scale.set(inverseZoom);
      }
      for (const label of streamLabels) {
        label.rotation = inverseRotation;
        label.scale.set(inverseZoom);
      }
      for (const label of groupLabels) {
        label.rotation = inverseRotation;
        label.scale.set(inverseZoom);
      }
      layoutRingLabels();
      layoutStreamLabels();
      layoutGroupLabels();
      if (!motionIsReduced || !reducedSemanticLayoutLocked) layoutNodeLabels();
    };

    const updateInteractiveHitAreas = () => {
      const localRadius = 22 / Math.max(0.001, transformRef.current.zoom);
      for (const target of screenStableNodeHitTargets) {
        const position = positions.get(target.nodeId);
        const binding = nodeBindings.find((candidate) => candidate.nodeId === target.nodeId);
        if (position) {
          const deltaX = position.endX - position.startX;
          const deltaY = position.endY - position.startY;
          target.deltaX = binding?.duration ? Math.hypot(deltaX, deltaY) : deltaX;
          target.deltaY = binding?.duration ? 0 : deltaY;
        }
        target.area.x = Math.min(0, target.deltaX) - localRadius;
        target.area.y = Math.min(0, target.deltaY) - localRadius;
        target.area.width = Math.abs(target.deltaX) + localRadius * 2;
        target.area.height = Math.abs(target.deltaY) + localRadius * 2;
      }
    };

    let reducedSemanticState: ReducedSemanticState = {
      selectedNodeId,
      selectedRelationId,
      multiSelectedNodeIds,
      focusedWorkstreamId,
      focusedNodeId,
    };
    const applyReducedSemanticState = (semantic: ReducedSemanticState) => {
      const semanticUpdateStartedAt = performance.now();
      reducedSemanticState = semantic;
      reducedSemanticLayoutLocked = true;
      const focusedNode = semantic.focusedNodeId
        ? nodeById.get(semantic.focusedNodeId)
        : undefined;
      const effectiveFocusedStreamId = focusedNode?.workstreamId ?? semantic.focusedWorkstreamId;
      const focusedStream = effectiveFocusedStreamId
        ? workstreams.find((workstream) => workstream.id === effectiveFocusedStreamId)
        : undefined;
      const focusedPosition = semantic.focusedNodeId
        ? positions.get(semantic.focusedNodeId)
        : undefined;
      const transform = transformRef.current;
      transform.targetRotation = focusedPosition
        ? rotationForFocusedNode(focusedPosition, transform.rotation)
        : focusedStream
          ? rotationForFocusedStream(focusedStream, transform.rotation)
          : rotationForFocusedStream(0, transform.rotation);
      transform.rotation = transform.targetRotation;
      const targetFocusZoom = focusedPosition ? 1.075 : focusedStream ? 1.045 : 1;
      focusZoomTargetRef.current = targetFocusZoom;
      focusZoomRef.current = targetFocusZoom;
      transform.targetZoom = clampZoom(manualZoomRef.current * targetFocusZoom);
      transform.zoom = transform.targetZoom;
      rotationTransitionRef.current = null;
      focusZoomTransitionRef.current = null;

      const multiSelected = new Set(semantic.multiSelectedNodeIds);
      for (const binding of nodeBindings) {
        const node = nodeById.get(binding.nodeId);
        const primary = binding.nodeId === semantic.selectedNodeId;
        const inMultiSelection = multiSelected.has(binding.nodeId);
        const inFocus = !effectiveFocusedStreamId || node?.workstreamId === effectiveFocusedStreamId;
        const alpha = primary || inMultiSelection ? 1 : inFocus ? 0.96 : 0.15;
        binding.container.alpha = alpha;
        nodeAlphaValuesRef.current.set(binding.nodeId, alpha);
        const selectionTarget = primary || inMultiSelection ? 1 : 0;
        const selectionColor = primary ? graphPalette.selection : graphPalette.planned;
        if (
          selectionAlphaValuesRef.current.get(binding.nodeId) !== selectionTarget
          || (selectionTarget > 0
            && selectionColorValuesRef.current.get(binding.nodeId) !== selectionColor)
        ) {
          selectionGlyphRenderersRef.current.get(binding.nodeId)?.(primary, inMultiSelection);
        }
      }
      const nodesUpdatedAt = performance.now();

      for (const binding of nodeLabelBindings) {
        const primary = binding.nodeId === semantic.selectedNodeId;
        binding.selected = primary;
        // Reduced motion uses immediate camera/dimming focus and keeps only
        // explicitly selected labels visible. Running the collision-search
        // animation for an entire lane would create the long frame that this
        // mode is specifically meant to avoid; the semantic mirror still
        // exposes every label and relation without a canvas gesture.
        binding.focusedPlacement = undefined;
        const alpha = 0;
        binding.label.alpha = alpha;
        labelAlphaValuesRef.current.set(binding.nodeId, alpha);
      }
      for (const binding of streamLabelBindings) {
        binding.label.alpha = effectiveFocusedStreamId ? 0 : 0.72;
      }
      const labelsUpdatedAt = performance.now();

      for (const binding of relationBindings) {
        const isSelected = Boolean(
          semantic.selectedRelationId
          && binding.constituentRelationIds.includes(semantic.selectedRelationId),
        );
        const inFocus = !effectiveFocusedStreamId
          || nodeById.get(binding.sourceNodeId)?.workstreamId === effectiveFocusedStreamId
          || nodeById.get(binding.targetNodeId)?.workstreamId === effectiveFocusedStreamId;
        const selectionChanged = binding.isSelected !== isSelected;
        binding.isSelected = isSelected;
        binding.semanticAlpha = isSelected ? 1 : inFocus ? 1 : 0.18;
        if (isSelected && !binding.selectionGlow) {
          binding.selectionGlow = new Graphics();
          relationLayer.addChild(binding.selectionGlow);
        } else if (!isSelected && binding.selectionGlow) {
          relationLayer.removeChild(binding.selectionGlow);
          binding.selectionGlow.destroy();
          binding.selectionGlow = null;
        }
        if (selectionChanged) redrawRelationBinding(binding);
        else binding.line.alpha = binding.semanticAlpha;
      }
      const relationsUpdatedAt = performance.now();

      semanticFocusKeyRef.current = focusedPosition
        ? `node:${semantic.focusedNodeId}`
        : focusedStream
          ? `stream:${focusedStream.id}`
          : "project";
      wheel.rotation = transform.rotation;
      camera.scale.set(transform.zoom);
      updateLabelTransforms();
      updateInteractiveHitAreas();
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphSelectedNodeId = semantic.selectedNodeId ?? "none";
        wrapper.dataset.graphSelectedRelationId = semantic.selectedRelationId ?? "none";
        wrapper.dataset.graphFocusedNodeId = semantic.focusedNodeId ?? "none";
        wrapper.dataset.graphFocusedWorkstreamId = effectiveFocusedStreamId ?? "none";
        wrapper.dataset.graphCurrentRotation = transform.rotation.toFixed(6);
        wrapper.dataset.graphCurrentZoom = transform.zoom.toFixed(4);
        wrapper.dataset.graphTargetRotation = transform.targetRotation.toFixed(6);
        wrapper.dataset.graphTargetZoom = transform.targetZoom.toFixed(4);
        wrapper.dataset.graphAnimating = "false";
        wrapper.dataset.graphAnimationKinds = "none";
        const semanticUpdateEndedAt = performance.now();
        wrapper.dataset.graphReducedSemanticUpdateMs = (
          semanticUpdateEndedAt - semanticUpdateStartedAt
        ).toFixed(3);
        wrapper.dataset.graphReducedSemanticNodeUpdateMs = (
          nodesUpdatedAt - semanticUpdateStartedAt
        ).toFixed(3);
        wrapper.dataset.graphReducedSemanticLabelUpdateMs = (
          labelsUpdatedAt - nodesUpdatedAt
        ).toFixed(3);
        wrapper.dataset.graphReducedSemanticRelationUpdateMs = (
          relationsUpdatedAt - labelsUpdatedAt
        ).toFixed(3);
        wrapper.dataset.graphReducedSemanticTransformUpdateMs = (
          semanticUpdateEndedAt - relationsUpdatedAt
        ).toFixed(3);
      }
    };
    if (sceneRef.current?.wheel === wheel) {
      sceneRef.current.applyReducedSemanticState = applyReducedSemanticState;
    }

    const updateDiagnostics = (now: number, force = false) => {
      const wrapper = wrapperRef.current;
      if (!wrapper || (!force && now - lastDiagnosticsAt < 50)) return;
      lastDiagnosticsAt = now;
      const alphaAnimating =
        nodeAlphaTransitions.length > 0 ||
        selectionAlphaTransitions.length > 0 ||
        labelAlphaTransitions.length > 0;
      const rotationAnimating = rotationTransitionRef.current !== null;
      const zoomAnimating =
        focusZoomTransitionRef.current !== null ||
        manualZoomTransitionRef.current !== null;
      const activeKinds = [
        rotationAnimating ? "rotation" : "",
        zoomAnimating ? "zoom" : "",
        alphaAnimating ? "alpha" : "",
        !renderedRelaxationState.stopped ? "physics" : "",
        !edgeRouteState.diagnostics.stopped ? "edge-physics" : "",
      ].filter(Boolean);
      wrapper.dataset.graphCurrentRotation = transformRef.current.rotation.toFixed(6);
      wrapper.dataset.graphTargetRotation = transformRef.current.targetRotation.toFixed(6);
      wrapper.dataset.graphCurrentZoom = transformRef.current.zoom.toFixed(4);
      wrapper.dataset.graphTargetZoom = transformRef.current.targetZoom.toFixed(4);
      wrapper.dataset.graphAnimating = activeKinds.length > 0 ? "true" : "false";
      wrapper.dataset.graphAnimationKinds = activeKinds.join(",") || "none";
      wrapper.dataset.graphAlphaAnimating = alphaAnimating ? "true" : "false";
      wrapper.dataset.graphPhysicsActive = renderedRelaxationState.stopped ? "false" : "true";
      wrapper.dataset.graphPhysicsConverged = renderedRelaxationState.converged
        ? "true"
        : "false";
      wrapper.dataset.graphPhysicsIterations = String(renderedRelaxationState.step);
      wrapper.dataset.graphPhysicsStep = String(renderedRelaxationState.step);
      wrapper.dataset.graphPhysicsMaxOverlap =
        renderedRelaxationState.maximumOverlap.toFixed(3);
      wrapper.dataset.graphPhysicsOverlapCount = String(
        renderedRelaxationState.overlapCount,
      );
      wrapper.dataset.graphPhysicsTotalOverlap =
        renderedRelaxationState.totalOverlap.toFixed(3);
      wrapper.dataset.graphPhysicsGlyphOverlapCount = String(
        renderedRelaxationState.glyphOverlapCount,
      );
      wrapper.dataset.graphPhysicsGlyphTotalOverlap =
        renderedRelaxationState.glyphTotalOverlap.toFixed(3);
      wrapper.dataset.graphPhysicsMaxGlyphOverlap =
        renderedRelaxationState.maximumGlyphOverlap.toFixed(3);
      wrapper.dataset.graphFocusRepulsionSelectedId =
        selectedNodeId && focusRepulsion.has(selectedNodeId)
          ? selectedNodeId
          : "none";
      wrapper.dataset.graphFocusRepulsionAffectedCount = String(
        focusRepulsion.size,
      );
      const diagnosticSelectedNodeId = motionIsReduced
        ? reducedSemanticState.selectedNodeId
        : selectedNodeId;
      const selectedPosition = diagnosticSelectedNodeId
        ? positions.get(diagnosticSelectedNodeId)
        : undefined;
      if (selectedPosition) {
        const selectedScreen = screenFromWorld(
          representativePoint(selectedPosition),
          center,
          transformRef.current,
        );
        wrapper.dataset.graphSelectedScreenX = selectedScreen.x.toFixed(2);
        wrapper.dataset.graphSelectedScreenY = selectedScreen.y.toFixed(2);
        wrapper.dataset.graphSelectedNodeId = diagnosticSelectedNodeId ?? "none";
      } else {
        delete wrapper.dataset.graphSelectedScreenX;
        delete wrapper.dataset.graphSelectedScreenY;
        wrapper.dataset.graphSelectedNodeId = "none";
      }
      wrapper.dataset.graphPhysicsStopReason = renderedRelaxationState.stopReason;
      wrapper.dataset.graphPhysicsMaxMotion = renderedRelaxationState.maxMotion.toFixed(3);
      wrapper.dataset.graphEdgePhysicsActive = edgeRouteState.diagnostics.stopped
        ? "false"
        : "true";
      wrapper.dataset.graphEdgePhysicsConverged = edgeRouteState.diagnostics.converged
        ? "true"
        : "false";
      wrapper.dataset.graphEdgePhysicsStep = String(
        edgeRouteState.diagnostics.step,
      );
      wrapper.dataset.graphEdgePhysicsStopReason =
        edgeRouteState.diagnostics.stopReason;
      wrapper.dataset.graphEdgePhysicsMaxMotion =
        edgeRouteState.diagnostics.maxMotion.toFixed(3);
      wrapper.dataset.graphEdgeNodeViolations = String(
        edgeRouteState.diagnostics.nodeViolations,
      );
      wrapper.dataset.graphEdgeConflicts = String(
        edgeRouteState.diagnostics.edgeConflicts,
      );
      wrapper.dataset.graphEdgeMinimumNodeClearance = Number.isFinite(
        edgeRouteState.diagnostics.minimumNodeClearance,
      )
        ? edgeRouteState.diagnostics.minimumNodeClearance.toFixed(3)
        : "unbounded";
      wrapper.dataset.graphEdgeMinimumClearance = Number.isFinite(
        edgeRouteState.diagnostics.minimumEdgeClearance,
      )
        ? edgeRouteState.diagnostics.minimumEdgeClearance.toFixed(3)
        : "unbounded";
      // Persistent graph relations deliberately use arrowless trajectories.
      // Direction remains available through source/target semantics, the list,
      // and the relation inspector. The branch-creation drag keeps its separate
      // transient action arrow.
      wrapper.dataset.graphPersistentRelationArrowheadCount = "0";
      if (
        canvasRef.current
        && renderCountsRef.current.nodes > 0
        && renderCountsRef.current.relations > 0
        && renderedRelaxationState.stopped
        && edgeRouteState.diagnostics.stopped
      ) {
        markFirstMeaningfulGraphRender({
          nodeCount: renderCountsRef.current.nodes,
          relationCount: relations.length,
          renderedRelationCount: renderCountsRef.current.relations,
          selectedNodeId: selectedNodeId ?? "none",
          nodeSolverStopReason: renderedRelaxationState.stopReason,
          edgeSolverStopReason: edgeRouteState.diagnostics.stopReason,
          nodeSolverConverged: renderedRelaxationState.converged,
          edgeSolverConverged: edgeRouteState.diagnostics.converged,
        });
      }
    };

    let relaxedFocusRetargeted = renderedRelaxationState.stopped;
    const retargetRelaxedFocus = (now: number) => {
      if (relaxedFocusRetargeted || !focusedNodeId) return;
      const relaxedNode = renderedRelaxationState.nodes[focusedNodeId];
      if (!relaxedNode) {
        relaxedFocusRetargeted = true;
        return;
      }
      const transform = transformRef.current;
      const target = rotationForFocusedRelaxedNode(
        relaxedNode,
        renderedRelaxationState.center,
        transform.rotation,
      );
      const distance = Math.abs(target - transform.rotation);
      transform.targetRotation = target;
      if (motionIsReduced || distance <= 0.0005) {
        transform.rotation = target;
        rotationTransitionRef.current = null;
      } else {
        rotationTransitionRef.current = {
          from: transform.rotation,
          to: target,
          startedAt: now,
          durationMs: 380 + Math.min(1, distance / Math.PI) * 260,
        };
      }
      relaxedFocusRetargeted = true;
    };

    const advanceForceRelaxation = (now: number) => {
      // A manual node drag owns the shared relaxed snapshot until commit or
      // cancellation. Pausing here avoids the solver racing the pointer.
      if (pointerSession?.mode === "node-move") return;
      if (renderedRelaxationState.stopped) return;
      if (now - forceRelaxationStartedAtRef.current >= 900) {
        renderedRelaxationState = {
          ...renderedRelaxationState,
          stopped: true,
          converged: false,
          stopReason: "max-steps",
        };
      } else {
        // Four deterministic fixed solver steps per display frame keep the
        // 180-step ceiling inside the 900 ms visual-settle budget at 50–60 FPS.
        renderedRelaxationState = stepForceRelaxation(
          renderedRelaxationState,
          4,
        );
      }
      forceRelaxationRef.current = renderedRelaxationState;
      syncPositionsFromLayout(
        applyForceRelaxation(layout, renderedRelaxationState),
      );
      redrawRelaxedGeometry();
      if (
        pointerSession?.mode === "action" &&
        pointerSession.sourceNodeId
      ) {
        const sourcePosition = positions.get(pointerSession.sourceNodeId);
        if (sourcePosition) {
          pointerSession.sourcePoint = screenFromWorld(
            representativePoint(sourcePosition),
            center,
            transformRef.current,
          );
          if (
            Math.hypot(
              pointerSession.latest.x - pointerSession.start.x,
              pointerSession.latest.y - pointerSession.start.y,
            ) >= 8
          ) {
            drawActionArrow(
              overlay,
              pointerSession.sourcePoint,
              pointerSession.latest,
              graphPalette,
            );
          }
        }
      }
      if (renderedRelaxationState.stopped) {
        retargetRelaxedFocus(now);
        updateDiagnostics(now, true);
      }
    };

    const advanceEdgeRoutes = (now: number) => {
      if (
        pointerSession?.mode === "node-move" ||
        !renderedRelaxationState.stopped ||
        edgeRouteState.diagnostics.stopped
      ) {
        return;
      }
      edgeRouteState = stepEdgeRouteRelaxation(edgeRouteState, 2);
      redrawRelationRoutes();
      if (edgeRouteState.diagnostics.stopped) updateDiagnostics(now, true);
    };

    const ensureRingVisual = (date: string, labelText: string) => {
      const existing = ringVisuals.get(date);
      if (existing) return existing;
      const label = new Text({
        text: labelText,
        style: {
          fill: graphPalette.ringText,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 10,
          fontWeight: "500",
          letterSpacing: 0.35,
          stroke: { color: graphPalette.background, width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      label.rotation = -wheel.rotation;
      label.scale.set(1 / transformRef.current.zoom);
      const anchor = { x: 0, y: 0 };
      ringLayer.addChild(label);
      ringLabels.push(label);
      ringLabelBindings.push({ anchor, label, active: false });
      const visual = { anchor, label };
      ringVisuals.set(date, visual);
      return visual;
    };

    const drawTransitionRelation = (
      binding: RelationRenderBinding,
      curve: CurveGeometry,
      opacity: number,
      interactive: boolean,
    ) => {
      if (binding.selectionGlow) {
        binding.selectionGlow.clear();
        drawSolidCurve(binding.selectionGlow, curve, graphPalette.selection, 5.5, 0.15);
        binding.selectionGlow.alpha = opacity;
      }
      binding.line.clear();
      const color = binding.isSelected ? graphPalette.selection : binding.visual.color;
      const strokeWidth = binding.isSelected
        ? binding.visual.width + 0.75
        : binding.visual.width;
      if (binding.visual.pattern === "dashed" || binding.visual.pattern === "dotted") {
        drawPatternedCurve(
          binding.line,
          curve,
          binding.visual.pattern,
          color,
          strokeWidth,
          binding.visual.alpha,
        );
      } else {
        drawSolidCurve(binding.line, curve, color, strokeWidth, binding.visual.alpha);
      }
      binding.line.alpha = opacity;
      binding.hitStroke.clear();
      drawSolidCurve(binding.hitStroke, curve, graphPalette.primary, 18, 0.002);
      binding.hitArea.update(curve);
      binding.hitStroke.eventMode = interactive ? "static" : "none";
      binding.hitStroke.cursor = interactive ? "pointer" : "default";
    };

    const renderDateTransitionFrame = (frame: GraphTransitionFrame, now: number) => {
      const byId = new Map(frame.bindings.map((binding) => [binding.id, binding] as const));

      for (const binding of nodeBindings) {
        const nodeFrame = byId.get(graphBindingId("node", binding.nodeId));
        const hitFrame = byId.get(graphBindingId("hit-target", binding.nodeId));
        if (!nodeFrame) {
          binding.container.alpha = 0;
          binding.container.eventMode = "none";
          continue;
        }
        const channels = nodeFrame.channels;
        const position: RelativeNodePosition = {
          x: channels.endX as number,
          y: channels.endY as number,
          startX: channels.startX as number,
          startY: channels.startY as number,
          endX: channels.endX as number,
          endY: channels.endY as number,
          angle: channels.angle as number,
        };
        positions.set(binding.nodeId, position);
        binding.container.position.set(position.startX, position.startY);
        binding.container.alpha = nodeFrame.opacity;
        binding.container.scale.set(nodeFrame.scale);
        const interactive = Boolean(hitFrame?.interactive && hitFrame.opacity > 0.5);
        binding.container.eventMode = interactive ? "static" : "none";
        binding.container.cursor = interactive ? "pointer" : "default";
        if (binding.duration) {
          const segmentLength = Math.max(
            0.001,
            Math.hypot(position.endX - position.startX, position.endY - position.startY),
          );
          binding.container.rotation = Math.atan2(
            position.endY - position.startY,
            position.endX - position.startX,
          );
          const longitudinalScale = segmentLength / binding.initialSegmentLength;
          binding.glyph.scale.x = longitudinalScale;
          binding.selectionGlyph.scale.x = longitudinalScale;
        }
      }

      for (const binding of relationBindings) {
        const relationFrame = byId.get(graphBindingId("relation", binding.routeId));
        if (!relationFrame) {
          binding.line.alpha = 0;
          if (binding.selectionGlow) binding.selectionGlow.alpha = 0;
          binding.hitStroke.eventMode = "none";
          continue;
        }
        const channels = relationFrame.channels;
        drawTransitionRelation(binding, {
          source: { x: channels.sourceX as number, y: channels.sourceY as number },
          control1: { x: channels.control1X as number, y: channels.control1Y as number },
          control2: { x: channels.control2X as number, y: channels.control2Y as number },
          target: { x: channels.targetX as number, y: channels.targetY as number },
        }, relationFrame.opacity, relationFrame.interactive);
      }

      atmosphericLayer.clear();
      for (const link of atmosphericLinks) {
        if (
          !temporalVisibleNodeIds.has(link.sourceNodeId)
          || !temporalVisibleNodeIds.has(link.targetNodeId)
        ) continue;
        const source = positions.get(link.sourceNodeId);
        const target = positions.get(link.targetNodeId);
        if (!source || !target) continue;
        drawSolidCurve(
          atmosphericLayer,
          makeCurve(representativePoint(source), representativePoint(target), link.identity, true),
          graphPalette.relation,
          0.7,
          0.065,
        );
      }
      anchorTraceLayer.clear();

      for (const [index, binding] of groupBindings.entries()) {
        const groupFrame = byId.get(graphBindingId("group", String(index)));
        if (!groupFrame) {
          binding.graphics.alpha = 0;
          binding.label.visible = false;
          continue;
        }
        redrawGroupBinding(binding);
        binding.graphics.alpha = binding.alpha * groupFrame.opacity;
        binding.label.alpha = binding.alpha * groupFrame.opacity;
      }

      rings.clear();
      for (const binding of ringLabelBindings) binding.active = false;
      const ringFrames = frame.bindings.filter((binding) => binding.kind === "ring");
      const labelIndices = new Set([
        0,
        Math.floor((ringFrames.length - 1) / 2),
        ringFrames.length - 1,
      ]);
      for (const [index, ringFrame] of ringFrames.entries()) {
        const date = ringFrame.id.slice("ring:".length);
        const definition = ringDefinitionByDate.get(date);
        if (!definition) continue;
        const radius = ringFrame.channels.radius as number;
        rings
          .circle(0, 0, radius)
          .stroke({ color: graphPalette.ring, width: 1, alpha: 0.21 * ringFrame.opacity });
        rings
          .moveTo(-3, -radius)
          .lineTo(3, -radius)
          .stroke({
            color: graphPalette.relationEmphasis,
            width: 1,
            alpha: 0.32 * ringFrame.opacity,
          });
        const visual = ensureRingVisual(date, definition.label);
        visual.anchor.x = 0;
        visual.anchor.y = -radius - 6;
        visual.label.alpha = 0.72 * ringFrame.opacity;
        const labelBinding = ringLabelBindings.find((item) => item.label === visual.label);
        if (labelBinding) labelBinding.active = width >= 600 || labelIndices.has(index);
      }

      for (const binding of nodeLabelBindings) {
        const labelFrame = byId.get(graphBindingId("label", `node:${binding.nodeId}`));
        binding.label.alpha = labelFrame?.opacity ?? 0;
      }
      layoutRingLabels();
      layoutGroupLabels();
      layoutNodeLabels(true);
      updateInteractiveHitAreas();

      const diagnostics = frame.diagnostics;
      renderCountsRef.current.nodes = temporalVisibleNodeIds.size;
      renderCountsRef.current.relations = relationBindings.filter((binding) =>
        binding.constituentRelationIds.some((id) => temporalVisibleRelationIds.has(id)),
      ).length;
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphAnimating = frame.settled ? "false" : "true";
        wrapper.dataset.graphAnimationKinds = frame.settled
          ? "none"
          : "date-window,nodes,relations,groups,rings,labels,hit-targets";
        wrapper.dataset.graphDateWindowQueuedFrames = String(diagnostics.queuedPreviewFrames);
        wrapper.dataset.graphDateWindowActiveTransitions = String(diagnostics.activeTransitions);
        wrapper.dataset.graphDateWindowSupersededBindings = String(diagnostics.supersededBindings);
        wrapper.dataset.graphDateWindowCumulativeSupersededBindings = String(
          diagnostics.cumulativeSupersededBindings,
        );
        wrapper.dataset.graphDateWindowDestroyedBindings = String(diagnostics.destroyedBindingCount);
        wrapper.dataset.graphDateWindowListenerCount = String(diagnostics.listenerCount);
        wrapper.dataset.graphDateWindowTickerCount = String(diagnostics.tickerCount);
        wrapper.dataset.graphDateWindowTimerCount = String(diagnostics.timerCount);
        wrapper.dataset.graphDateWindowGeneration = String(diagnostics.generation);
        wrapper.dataset.graphDateWindowVisibleNodes = String(temporalVisibleNodeIds.size);
        wrapper.dataset.graphDateWindowVisibleRelations = String(renderCountsRef.current.relations);
        wrapper.dataset.graphDateWindowCadence = latestTransitionLayout.ringCadence;
        wrapper.dataset.graphDateWindowRetainedBindings = String(frame.bindings.length);
        if (frame.settled) {
          const terminal = graphTransition.assertTerminalCounts();
          wrapper.dataset.graphDateWindowExpectedRetainedBindings = String(
            terminal.expectedRetainedBindingCount,
          );
          wrapper.dataset.graphDateWindowExitBindings = String(
            terminal.destroyedExitBindingCount,
          );
          wrapper.dataset.graphDateWindowExpectedExitBindings = String(
            terminal.expectedDestroyedExitBindingCount,
          );
        }
        if (pendingDateWindowSequence > lastPaintedDateWindowSequence) {
          const previewToPaintMs = Math.max(
            0,
            now - pendingPreviewAcceptedAt,
          );
          const recordedSequence = Number(
            wrapper.dataset.graphDateWindowPreviewToPaintSequence ?? "-1",
          );
          const recordedDuration = Number(
            wrapper.dataset.graphDateWindowPreviewToPaintMs ?? "Infinity",
          );
          if (
            pendingDateWindowSequence > recordedSequence
            || (
              pendingDateWindowSequence === recordedSequence
              && previewToPaintMs < recordedDuration
            )
          ) {
            wrapper.dataset.graphDateWindowPaintedAt = now.toFixed(3);
            wrapper.dataset.graphDateWindowPreviewToPaintMs = previewToPaintMs.toFixed(3);
            wrapper.dataset.graphDateWindowPreviewToPaintSequence = String(
              pendingDateWindowSequence,
            );
          }
          lastPaintedDateWindowSequence = pendingDateWindowSequence;
        }
      }
    };

    renderReducedDateSnapshot = () => {
      const now = performance.now();
      renderDateTransitionFrame(graphTransition.sample(now), now);
      app.render();
    };

    const animateGraph = () => {
      const now = performance.now();
      const transform = transformRef.current;
      if (motionIsReduced) {
        if (manualZoomTransitionRef.current) {
          manualZoomRef.current = manualZoomTransitionRef.current.to;
        }
        transform.rotation = transform.targetRotation;
        transform.zoom = transform.targetZoom;
        rotationTransitionRef.current = null;
        focusZoomTransitionRef.current = null;
        manualZoomTransitionRef.current = null;
      } else {
        const rotationTransition = rotationTransitionRef.current;
        if (rotationTransition) {
          transform.rotation = transitionValue(rotationTransition, now);
          if (transitionProgress(rotationTransition, now) >= 1) {
            transform.rotation = rotationTransition.to;
            rotationTransitionRef.current = null;
          }
        }

        const manualZoomTransition = manualZoomTransitionRef.current;
        if (manualZoomTransition) {
          manualZoomRef.current = transitionValue(manualZoomTransition, now);
          if (transitionProgress(manualZoomTransition, now) >= 1) {
            manualZoomRef.current = manualZoomTransition.to;
            manualZoomTransitionRef.current = null;
          }
        }

        const focusZoomTransition = focusZoomTransitionRef.current;
        if (focusZoomTransition) {
          focusZoomRef.current = transitionValue(focusZoomTransition, now);
          if (transitionProgress(focusZoomTransition, now) >= 1) {
            focusZoomRef.current = focusZoomTransition.to;
            focusZoomTransitionRef.current = null;
          }
        }
        transform.zoom = clampZoom(manualZoomRef.current * focusZoomRef.current);
        const targetManualZoom =
          manualZoomTransitionRef.current?.to ?? manualZoomRef.current;
        transform.targetZoom = clampZoom(
          targetManualZoom * focusZoomTargetRef.current,
        );
      }

      for (let index = nodeAlphaTransitions.length - 1; index >= 0; index -= 1) {
        const transition = nodeAlphaTransitions[index];
        const value = motionIsReduced ? transition.to : transitionValue(transition, now);
        transition.displayObject.alpha = value;
        nodeAlphaValuesRef.current.set(transition.nodeId, value);
        if (motionIsReduced || transitionProgress(transition, now) >= 1) {
          transition.displayObject.alpha = transition.to;
          nodeAlphaValuesRef.current.set(transition.nodeId, transition.to);
          nodeAlphaTransitions.splice(index, 1);
        }
      }
      for (let index = selectionAlphaTransitions.length - 1; index >= 0; index -= 1) {
        const transition = selectionAlphaTransitions[index];
        const value = motionIsReduced ? transition.to : transitionValue(transition, now);
        transition.displayObject.alpha = value;
        selectionAlphaValuesRef.current.set(transition.nodeId, value);
        if (motionIsReduced || transitionProgress(transition, now) >= 1) {
          transition.displayObject.alpha = transition.to;
          selectionAlphaValuesRef.current.set(transition.nodeId, transition.to);
          selectionAlphaTransitions.splice(index, 1);
        }
      }
      for (let index = labelAlphaTransitions.length - 1; index >= 0; index -= 1) {
        const transition = labelAlphaTransitions[index];
        const value = motionIsReduced ? transition.to : transitionValue(transition, now);
        transition.displayObject.alpha = value;
        labelAlphaValuesRef.current.set(transition.nodeId, value);
        if (motionIsReduced || transitionProgress(transition, now) >= 1) {
          transition.displayObject.alpha = transition.to;
          if (transition.to <= 0.001) labelAlphaValuesRef.current.delete(transition.nodeId);
          else labelAlphaValuesRef.current.set(transition.nodeId, transition.to);
          labelAlphaTransitions.splice(index, 1);
        }
      }

      renderDateTransitionFrame(graphTransition.sample(now), now);

      wheel.rotation = transform.rotation;
      camera.scale.set(transform.zoom);
      updateLabelTransforms();
      updateInteractiveHitAreas();
      updateDiagnostics(now);
    };
    updateLabelTransforms();
    updateInteractiveHitAreas();
    updateDiagnostics(performance.now(), true);
    let forceRelaxationTickerAttached = false;
    const animateForceRelaxation = () => {
      const now = performance.now();
      advanceForceRelaxation(now);
      advanceEdgeRoutes(now);
      if (
        renderedRelaxationState.stopped &&
        edgeRouteState.diagnostics.stopped
      ) {
        app.ticker.remove(animateForceRelaxation);
        forceRelaxationTickerAttached = false;
      }
    };
    function ensureForceRelaxationTicker(): void {
      if (
        forceRelaxationTickerAttached ||
        (renderedRelaxationState.stopped &&
          edgeRouteState.diagnostics.stopped)
      ) {
        return;
      }
      app?.ticker.add(animateForceRelaxation);
      forceRelaxationTickerAttached = true;
    }
    ensureForceRelaxationTicker();
    app.ticker.add(animateGraph);

    return () => {
      activeCanvas.removeEventListener("pointerdown", onCanvasTouchPointerDown);
      window.removeEventListener("pointerup", onGlobalTouchEnd);
      window.removeEventListener("pointercancel", onGlobalTouchEnd);
      activeCanvas.removeEventListener("wheel", onWheel);
      app.ticker?.remove(animateForceRelaxation);
      forceRelaxationTickerAttached = false;
      app.ticker?.remove(animateGraph);
      pointerCleanupRef.current?.();
      pointerCleanupRef.current = null;
      if (sceneRef.current?.wheel === wheel) sceneRef.current = null;
    };
  }, [
    cameraResetKey,
    canvasGeneration,
    motionIsReduced ? null : focusedNodeId,
    motionIsReduced ? null : focusedWorkstreamId,
    graphPalette,
    groupColorOverrides,
    groups,
    manualNodeOffsets,
    motionIsReduced,
    motionIsReduced ? null : multiSelectedNodeIds,
    nodeById,
    nodes,
    relations,
    motionIsReduced ? null : selectedNodeId,
    motionIsReduced ? null : selectedRelationId,
    motionIsReduced ? null : selectedSet,
    viewport,
    visibleKinds,
    visibleRelationKinds,
    workstreams,
  ]);

  useLayoutEffect(() => {
    if (!dateWindowSnapshot) return;
    sceneRef.current?.applyDateWindowSnapshot?.(dateWindowSnapshot);
  }, [dateWindowSnapshot]);

  useEffect(() => {
    if (!motionIsReduced) return;
    sceneRef.current?.applyReducedSemanticState?.({
      selectedNodeId,
      selectedRelationId,
      multiSelectedNodeIds,
      focusedWorkstreamId,
      focusedNodeId,
    });
  }, [
    focusedNodeId,
    focusedWorkstreamId,
    motionIsReduced,
    multiSelectedNodeIds,
    selectedNodeId,
    selectedRelationId,
  ]);

  const requestCameraZoom = useCallback(
    (command: "in" | "out" | "fit") => {
      const transform = transformRef.current;
      const scene = sceneRef.current;

      // Camera controls take ownership at the current rendered frame. This is
      // the same interruption rule used by pinch and wheel manipulation.
      focusZoomTransitionRef.current = null;
      focusZoomTargetRef.current = focusZoomRef.current;
      const intendedZoom = manualZoomTransitionRef.current
        ? clampZoom(
            manualZoomTransitionRef.current.to * focusZoomTargetRef.current,
          )
        : transform.targetZoom;
      const targetZoom =
        command === "fit"
          ? 1
          : clampZoom(intendedZoom * (command === "in" ? 1.22 : 1 / 1.22));
      const targetManualZoom =
        targetZoom / Math.max(0.001, focusZoomRef.current);

      if (command === "fit") {
        transform.panX = 0;
        transform.panY = 0;
        if (scene) scene.camera.position.set(scene.center.x, scene.center.y);
      }

      transform.targetZoom = targetZoom;
      if (motionIsReduced) {
        manualZoomRef.current = targetManualZoom;
        manualZoomTransitionRef.current = null;
        transform.zoom = targetZoom;
        if (scene) scene.camera.scale.set(targetZoom);
      } else {
        manualZoomTransitionRef.current = {
          from: manualZoomRef.current,
          to: targetManualZoom,
          startedAt: performance.now(),
          durationMs: 300,
        };
      }

      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.dataset.graphTargetZoom = targetZoom.toFixed(4);
        wrapper.dataset.graphAnimating = motionIsReduced ? "false" : "true";
        wrapper.dataset.graphAnimationKinds = motionIsReduced ? "none" : "zoom";
      }
    },
    [motionIsReduced],
  );

  const dispatchKeyboardAction = useCallback((nodeId: string) => {
    const scene = sceneRef.current;
    const position = scene?.positions.get(nodeId);
    if (!scene || !position) return;
    const sourceWorld = representativePoint(position);
    const sourceCanvas = screenFromWorld(sourceWorld, scene.center, transformRef.current);
    const radialLength = Math.max(1, Math.hypot(sourceWorld.x, sourceWorld.y));
    const destinationCanvas = {
      x: sourceCanvas.x + (sourceWorld.x / radialLength) * 72,
      y: sourceCanvas.y + (sourceWorld.y / radialLength) * 72,
    };
    const destinationWorld = worldFromScreen(
      destinationCanvas,
      scene.center,
      transformRef.current,
    );
    callbacksRef.current.onActionDragComplete?.({
      sourceNodeId: nodeId,
      trigger: "keyboard",
      graphPoint: {
        x: destinationWorld.x + scene.center.x,
        y: destinationWorld.y + scene.center.y,
      },
      canvasPoint: destinationCanvas,
    });
  }, []);

  const handleSemanticNodeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, node: WorkNode) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        // FOCUS_NODE owns both canonical selection and semantic focus. A
        // second selection dispatch would repeat every reduced-motion canvas
        // update in the same input frame.
        callbacksRef.current.onNodeFocus?.(node.id, node.workstreamId);
      } else if (event.key === " ") {
        event.preventDefault();
        callbacksRef.current.onNodeSelect?.(node.id, {
          additive: true,
          source: "semantic-mirror",
        });
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        dispatchKeyboardAction(node.id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        callbacksRef.current.onStepOut?.();
      }
    },
    [dispatchKeyboardAction],
  );

  return (
    <div
      ref={wrapperRef}
      className={className}
      role="group"
      aria-label={ariaLabel}
      data-testid="temporal-graph"
      data-graph-current-rotation={transformRef.current.rotation.toFixed(6)}
      data-graph-target-rotation={transformRef.current.targetRotation.toFixed(6)}
      data-graph-current-zoom={transformRef.current.zoom.toFixed(4)}
      data-graph-target-zoom={transformRef.current.targetZoom.toFixed(4)}
      data-graph-animating="false"
      data-graph-animation-kinds="none"
      data-graph-alpha-animating="false"
      data-graph-animation-easing="quintic-smootherstep"
      data-graph-pointer-mode="idle"
      data-graph-touch-lasso-delay-ms="360"
      data-graph-min-hit-target-css-px="44"
      data-graph-physics-active="false"
      data-graph-physics-converged="false"
      data-graph-physics-iterations="0"
      data-graph-physics-step="0"
      data-graph-physics-max-overlap="0.000"
      data-graph-physics-overlap-count="0"
      data-graph-physics-total-overlap="0.000"
      data-graph-physics-glyph-overlap-count="0"
      data-graph-physics-glyph-total-overlap="0.000"
      data-graph-physics-max-glyph-overlap="0.000"
      data-graph-physics-max-motion="0.000"
      data-graph-physics-stop-reason="running"
      data-graph-edge-physics-active="false"
      data-graph-edge-physics-converged="false"
      data-graph-edge-physics-step="0"
      data-graph-edge-physics-stop-reason="running"
      data-graph-edge-physics-max-motion="0.000"
      data-graph-edge-node-violations="0"
      data-graph-edge-conflicts="0"
      data-graph-edge-minimum-node-clearance="unbounded"
      data-graph-edge-minimum-clearance="unbounded"
      data-graph-focus-repulsion-selected-id="none"
      data-graph-focus-repulsion-affected-count="0"
      data-graph-selected-node-id={selectedNodeId ?? "none"}
      data-graph-manual-offset-count={Object.keys(manualNodeOffsets).length}
      data-graph-stream-labels-hidden="0"
      data-graph-visible-stream-labels-out-of-bounds="0"
      data-graph-ring-label-count="0"
      data-graph-ring-labels-hidden="0"
      data-graph-visible-ring-labels-out-of-bounds="0"
      data-graph-group-labels-hidden="0"
      data-graph-visible-group-labels-out-of-bounds="0"
      data-graph-focused-label-clearance="4"
      data-graph-focused-label-count="0"
      data-graph-focused-labels-hidden="0"
      data-graph-performance-fps="0.00"
      data-graph-performance-mean-frame-ms="0.000"
      data-graph-performance-max-frame-ms="0.000"
      data-graph-performance-long-frames-over-100-ms="0"
      data-reduced-motion={motionIsReduced ? "true" : "false"}
      style={{
        backgroundColor: colorToCss(graphPalette.background),
        height: "100%",
        isolation: "isolate",
        minHeight: 320,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
        touchAction: "none",
        width: "100%",
      }}
    >
      <div
        ref={canvasHostRef}
        aria-hidden="true"
        style={{ inset: 0, position: "absolute" }}
      />

      <div
        aria-label="Graph camera controls"
        role="toolbar"
        style={{
          alignItems: "center",
          background: `${colorToCss(graphPalette.background)}e8`,
          border: `1px solid ${colorToCss(graphPalette.ring)}80`,
          borderRadius: 12,
          boxShadow: `0 8px 24px ${colorToCss(graphPalette.ink)}4d`,
          display: "flex",
          gap: 4,
          padding: 4,
          position: "absolute",
          right: 14,
          top: 88,
          touchAction: "manipulation",
          zIndex: 8,
        }}
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          data-graph-camera-control="zoom-in"
          onClick={() => requestCameraZoom("in")}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            borderRadius: 8,
            color: colorToCss(graphPalette.selectedLabel),
            cursor: "pointer",
            display: "inline-flex",
            height: 44,
            justifyContent: "center",
            padding: 0,
            touchAction: "manipulation",
            width: 44,
          }}
        >
          <MagnifyingGlassPlus aria-hidden="true" size={20} weight="regular" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          data-graph-camera-control="zoom-out"
          onClick={() => requestCameraZoom("out")}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            borderRadius: 8,
            color: colorToCss(graphPalette.selectedLabel),
            cursor: "pointer",
            display: "inline-flex",
            height: 44,
            justifyContent: "center",
            padding: 0,
            touchAction: "manipulation",
            width: 44,
          }}
        >
          <MagnifyingGlassMinus aria-hidden="true" size={20} weight="regular" />
        </button>
        <button
          type="button"
          aria-label="Fit graph to view"
          title="Fit graph to view"
          data-graph-camera-control="fit"
          onClick={() => requestCameraZoom("fit")}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            borderRadius: 8,
            color: colorToCss(graphPalette.selectedLabel),
            cursor: "pointer",
            display: "inline-flex",
            height: 44,
            justifyContent: "center",
            padding: 0,
            touchAction: "manipulation",
            width: 44,
          }}
        >
          <CornersOut aria-hidden="true" size={20} weight="regular" />
        </button>
      </div>

      <nav className="temporal-graph-semantic-nav" aria-label="Graph nodes and relationships">
        <p id="temporal-graph-keyboard-help">
          Nodes are ordered chronologically. Press Enter to select, show evidence, and focus;
          Space to add or remove a node from the group selection; A to start an action; and Escape
          to step outward.
        </p>
        <ol>
          {semanticNodes.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                aria-describedby="temporal-graph-keyboard-help"
                aria-current={node.id === selectedNodeId ? "true" : undefined}
                aria-pressed={selectedSet.has(node.id)}
                onClick={() =>
                  callbacksRef.current.onNodeSelect?.(node.id, {
                    additive: false,
                    source: "semantic-mirror",
                  })
                }
                onDoubleClick={() =>
                  callbacksRef.current.onNodeFocus?.(node.id, node.workstreamId)
                }
                onKeyDown={(event) => handleSemanticNodeKeyDown(event, node)}
              >
                {node.title}. {String(node.status)}. Lifecycle {String(node.lifecycle).replaceAll("-", " ")}. Started {node.startedAt}.
              </button>
            </li>
          ))}
        </ol>
        <h2>Visible relationships</h2>
        <ol>
          {relations
            .filter((relation) => {
              if (!semanticVisibleRelationIds.has(relation.id)) return false;
              const kind = normalizedKind(String(relation.kind));
              return visibleRelationKinds
                ? visibleKinds.has(kind)
                : relation.visibleByDefault || visibleKinds.has(kind);
            })
            .map((relation) => {
              const source = nodeById.get(relation.sourceNodeId);
              const target = nodeById.get(relation.targetNodeId);
              return (
                <li key={relation.id}>
                  <button
                    type="button"
                    aria-pressed={relation.id === selectedRelationId}
                    onClick={() => callbacksRef.current.onRelationSelect?.(relation.id)}
                  >
                    {source?.title ?? relation.sourceNodeId} {relation.label ?? String(relation.kind)}{" "}
                    {target?.title ?? relation.targetNodeId}
                  </button>
                </li>
              );
            })}
        </ol>
      </nav>

      {initializationError ? (
        <p
          role="status"
          style={{
            color: colorToCss(graphPalette.primary),
            font: "500 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif",
            inset: "50% auto auto 50%",
            margin: 0,
            maxWidth: 420,
            padding: 20,
            position: "absolute",
            textAlign: "center",
            transform: "translate(-50%, -50%)",
          }}
        >
          {initializationError} The chronological list remains available to assistive technology.
        </p>
      ) : null}
    </div>
  );
}
