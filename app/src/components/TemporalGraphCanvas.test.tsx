import { describe, expect, it } from "vitest";

import type { GraphRelation, WorkNode } from "../domain";
import {
  createEdgeRouteRelaxation,
  runEdgeRouteRelaxationToStop,
  sampleEdgeRoute,
  stepEdgeRouteRelaxation,
  type EdgeRouteRelaxationOptions,
  type EdgeRouteNodeGeometry,
  type VisualEdgeRouteInput,
} from "../edge-geometry";
import {
  applyForceRelaxation,
  createForceRelaxation,
  createTemporalLayout,
  runForceRelaxationToStop,
  stepForceRelaxation,
  type ForceRelaxationOptions,
} from "../geometry";
import {
  UTC_DAY_MS,
  deriveFullDateWindow,
  projectDateWindow,
} from "../date-window-model";
import { createInitialState } from "../seed";
import { appReducer, selectVisibleNodes } from "../state";

function edgeOptionsForViewport(
  _width: number,
  _height: number,
): EdgeRouteRelaxationOptions {
  return {
    sampleCount: 8,
    nodePadding: 10,
    nodeRepulsionStrength: 5.4,
    seedStrength: 0.015,
    lengthStrength: 0.004,
    curvatureStrength: 0.006,
    maxControlDrift: 120,
    velocityThreshold: 0.035,
  };
}

function dateValue(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function selectedNeighborhood(
  nodes: readonly WorkNode[],
  relations: readonly GraphRelation[],
  selectedNodeId: string,
): ReadonlyMap<string, 0 | 1 | 2> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(
    [...nodeIds].sort().map((nodeId) => [nodeId, new Set<string>()]),
  );
  const connect = (left: string, right: string) => {
    if (left === right || !nodeIds.has(left) || !nodeIds.has(right)) return;
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  };
  for (const relation of relations) {
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

function edgeWidth(relation: GraphRelation): number {
  switch (relation.kind) {
    case "action-of":
      return 1;
    case "same-source-thread":
      return 0.75;
    case "related-to":
      return 0.9;
    default:
      return 1.15;
  }
}

function createdChildDiagnostics(
  width: number,
  height: number,
  edgeOptions: EdgeRouteRelaxationOptions = edgeOptionsForViewport(width, height),
  createChild = true,
) {
  const initial = createInitialState();
  const state = createChild
    ? appReducer(initial, {
        type: "PLAN_NEXT_ACTION",
        parentNodeId: "node-status-recovery",
        title: "Draft a clear recovery handoff",
        prompt: "Draft a clear recovery handoff, but do not run it.",
        executionKind: "plan",
      })
    : initial;
  const nodes = selectVisibleNodes(state);
  const nodeIds = new Set(nodes.map((node) => node.id));
  // These fixtures keep every group expanded, so the complete runtime display
  // topology is the canonical topology restricted only by displayed endpoints.
  // Layer flags filter routes, but never the force-repulsion neighborhood.
  const relations = state.relations.filter(
    (relation) => nodeIds.has(relation.sourceNodeId) && nodeIds.has(relation.targetNodeId),
  );
  const visibleRelations = relations.filter((relation) => state.layers[relation.kind]);
  const layout = createTemporalLayout(nodes, state.workstreams, {
    width,
    height,
    padding: Math.max(30, Math.min(width, height) * 0.055),
  });
  const baseCollisionRadii = Object.fromEntries(
    nodes.map((node) => {
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
  const selectedNodeId = state.selectedNodeId ?? "";
  const influence = selectedNeighborhood(nodes, relations, selectedNodeId);
  const collisionRadii = Object.fromEntries(
    Object.entries(baseCollisionRadii).map(([nodeId, radius]) => {
      const distance = influence.get(nodeId);
      return [
        nodeId,
        radius + (distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0),
      ];
    }),
  );
  const forceOptions: ForceRelaxationOptions = {
    collisionPadding: 4,
    collisionRadii,
    glyphRadii: baseCollisionRadii,
    pinnedOffsets: state.manualNodeOffsets,
  };
  const force = runForceRelaxationToStop(
    createForceRelaxation(layout, nodes, forceOptions),
  );
  const relaxed = applyForceRelaxation(layout, force);
  const edgeNodes: EdgeRouteNodeGeometry[] = nodes.map((node) => {
    const position = relaxed.positions[node.id];
    return {
      nodeId: node.id,
      point: { x: position.endX - relaxed.center.x, y: position.endY - relaxed.center.y },
      segmentStart: {
        x: position.startX - relaxed.center.x,
        y: position.startY - relaxed.center.y,
      },
      segmentEnd: {
        x: position.endX - relaxed.center.x,
        y: position.endY - relaxed.center.y,
      },
      halfThickness: baseCollisionRadii[node.id] ?? 8.5,
    };
  });
  const edgeInputs: VisualEdgeRouteInput[] = visibleRelations.map((relation) => ({
    id: relation.id,
    sourceNodeId: relation.sourceNodeId,
    targetNodeId: relation.targetNodeId,
    halfThickness: edgeWidth(relation) / 2,
  }));
  const routed = runEdgeRouteRelaxationToStop(
    createEdgeRouteRelaxation(edgeNodes, edgeInputs, {
      sampleCount: 8,
      ...edgeOptions,
    }),
  );
  const routeSamples = routed.routeOrder.flatMap((routeId) => {
    const route = routed.routes[routeId];
    return route ? sampleEdgeRoute(route, 24) : [];
  });
  let maximumControlDrift = 0;
  let maximumPathInflation = 1;
  for (const routeId of routed.routeOrder) {
    const route = routed.routes[routeId];
    if (!route) continue;
    maximumControlDrift = Math.max(
      maximumControlDrift,
      Math.hypot(
        route.control1.x - route.seedControl1.x,
        route.control1.y - route.seedControl1.y,
      ),
      Math.hypot(
        route.control2.x - route.seedControl2.x,
        route.control2.y - route.seedControl2.y,
      ),
    );
    const samples = sampleEdgeRoute(route, 24);
    const pathLength = samples.slice(1).reduce((sum, point, index) => {
      const previous = samples[index];
      return previous
        ? sum + Math.hypot(point.x - previous.x, point.y - previous.y)
        : sum;
    }, 0);
    const chordLength = Math.max(
      1,
      Math.hypot(route.end.x - route.start.x, route.end.y - route.start.y),
    );
    maximumPathInflation = Math.max(
      maximumPathInflation,
      pathLength / chordLength,
    );
  }
  const routeBounds = routeSamples.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x + relaxed.center.x),
      top: Math.min(bounds.top, point.y + relaxed.center.y),
      right: Math.max(bounds.right, point.x + relaxed.center.x),
      bottom: Math.max(bounds.bottom, point.y + relaxed.center.y),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  return {
    force: {
      converged: force.converged,
      step: force.step,
      glyphOverlapCount: force.glyphOverlapCount,
    },
    edge: routed.diagnostics,
    routeBounds,
    routeQuality: { maximumControlDrift, maximumPathInflation },
  };
}

describe("created-child route relaxation", () => {
  it.each([
    [848, 782],
    [390, 722],
    [390, 844],
    [848, 904],
    [2304, 1152],
  ])("keeps created-child routes clear and bounded at %d×%d", (width, height) => {
    const diagnostics = createdChildDiagnostics(width, height);
    expect(diagnostics.force.glyphOverlapCount).toBe(0);
    expect(diagnostics.edge.stopped).toBe(true);
    expect(diagnostics.edge.converged).toBe(true);
    expect(diagnostics.edge.stopReason).toBe("converged");
    expect(diagnostics.edge.step).toBeLessThan(180);
    expect(diagnostics.edge.nodeViolations).toBe(0);
    expect(diagnostics.edge.edgeConflicts).toBe(0);
    expect(diagnostics.edge.minimumNodeClearance).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.left).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.top).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.right).toBeLessThanOrEqual(width);
    expect(diagnostics.routeBounds.bottom).toBeLessThanOrEqual(height);
    expect(diagnostics.routeQuality.maximumControlDrift).toBeLessThan(60);
    expect(diagnostics.routeQuality.maximumPathInflation).toBeLessThan(1.5);
  });

  it.each([
    [848, 782],
    [390, 722],
    [1280, 590],
    [1280, 658],
    [2304, 959],
  ])("keeps the initial graph clear and bounded at %d×%d", (width, height) => {
    const diagnostics = createdChildDiagnostics(width, height, undefined, false);
    expect(diagnostics.force.glyphOverlapCount).toBe(0);
    expect(diagnostics.edge.converged).toBe(true);
    expect(diagnostics.edge.stopReason).toBe("converged");
    expect(diagnostics.edge.step).toBeLessThan(180);
    expect(diagnostics.edge.nodeViolations).toBe(0);
    expect(diagnostics.edge.edgeConflicts).toBe(0);
    expect(diagnostics.edge.minimumNodeClearance).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.left).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.top).toBeGreaterThanOrEqual(0);
    expect(diagnostics.routeBounds.right).toBeLessThanOrEqual(width);
    expect(diagnostics.routeBounds.bottom).toBeLessThanOrEqual(height);
    expect(diagnostics.routeQuality.maximumControlDrift).toBeLessThan(60);
    expect(diagnostics.routeQuality.maximumPathInflation).toBeLessThan(1.5);
  });

  it.each([
    [1440, 838, 0, 0],
    [390, 722, 0, 0],
    [1440, 838, 27, 55],
    [390, 722, 74, 108],
  ])(
    "keeps filtered absolute-time geometry coherent at %d×%d for UTC-day offsets %d–%d",
    (width, height, startDayOffset, endDayOffset) => {
      const state = createInitialState();
      const bounds = deriveFullDateWindow(state.nodes);
      const maximumOffset = Math.floor((bounds.endMs - bounds.startMs) / UTC_DAY_MS);
      const startOffset = Math.min(startDayOffset, maximumOffset);
      const endOffset = Math.min(endDayOffset, maximumOffset);
      const window = {
        startMs: bounds.startMs + startOffset * UTC_DAY_MS,
        endMs: bounds.startMs + (endOffset + 1) * UTC_DAY_MS - 1,
      };
      const projection = projectDateWindow(
        state.nodes,
        state.relations,
        state.groups,
        window,
        bounds,
      );
      const visibleIntervals = new Map(
        [...projection.clippedIntervals].map(([nodeId, interval]) => [nodeId, {
          startMs: interval.clippedStartMs,
          endMs: interval.clippedEndMs,
          continuesBefore: interval.continuesBefore,
          continuesAfter: interval.continuesAfter,
        }]),
      );
      const layout = createTemporalLayout(state.nodes, state.workstreams, {
        width,
        height,
        padding: Math.max(30, Math.min(width, height) * 0.055),
        timeDomain: window,
        visibleIntervals,
      });
      const baseCollisionRadii = Object.fromEntries(
        projection.visibleNodes.map((node) => [node.id, layout.positions[node.id]?.isDuration ? 9 : 8.5]),
      );
      const influence = selectedNeighborhood(
        projection.visibleNodes,
        projection.visibleRelations,
        state.selectedNodeId ?? "",
      );
      const collisionRadii = Object.fromEntries(
        Object.entries(baseCollisionRadii).map(([nodeId, radius]) => {
          const distance = influence.get(nodeId);
          return [nodeId, radius + (
            distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0
          )];
        }),
      );
      const initialForce = createForceRelaxation(
        layout,
        projection.visibleNodes,
        {
          collisionPadding: 4,
          collisionRadii,
          glyphRadii: baseCollisionRadii,
          pinnedOffsets: state.manualNodeOffsets,
        },
      );
      let previewForce = initialForce;
      let previewForceSteps = 0;
      while (previewForce.glyphOverlapCount > 0 && previewForceSteps < 16) {
        previewForce = stepForceRelaxation(previewForce);
        previewForceSteps += 1;
      }
      expect(previewForce.glyphOverlapCount).toBe(0);
      expect(previewForceSteps).toBeLessThanOrEqual(16);
      const force = runForceRelaxationToStop(initialForce);
      const relaxed = applyForceRelaxation(layout, force);
      expect(force.glyphOverlapCount).toBe(0);
      expect(force.stopped).toBe(true);
      expect(layout.minDate).toBe(new Date(window.startMs).toISOString());
      expect(layout.maxDate).toBe(new Date(window.endMs).toISOString());
      expect(new Set(projection.visibleNodes.map((node) => node.id)).size).toBe(
        projection.visibleNodes.length,
      );

      for (const node of projection.visibleNodes) {
        const position = relaxed.positions[node.id];
        expect(position).toBeDefined();
        expect(Number.isFinite(position?.startX)).toBe(true);
        expect(Number.isFinite(position?.endY)).toBe(true);
        if (!position?.isSatellite) {
          expect(position.startRadius).toBeGreaterThanOrEqual(layout.innerRadius - 0.001);
          expect(position.endRadius).toBeLessThanOrEqual(layout.outerRadius + 0.001);
        }
      }
      const ringSpacing = layout.rings.slice(1).map((ring, index) =>
        ring.radius - (layout.rings[index]?.radius ?? ring.radius),
      );
      expect(ringSpacing.every((spacing) => spacing >= 41.5)).toBe(true);

      const edgeNodes: EdgeRouteNodeGeometry[] = projection.visibleNodes.flatMap((node) => {
        const position = relaxed.positions[node.id];
        if (!position) return [];
        return [{
          nodeId: node.id,
          point: { x: position.endX - relaxed.center.x, y: position.endY - relaxed.center.y },
          segmentStart: { x: position.startX - relaxed.center.x, y: position.startY - relaxed.center.y },
          segmentEnd: { x: position.endX - relaxed.center.x, y: position.endY - relaxed.center.y },
          halfThickness: baseCollisionRadii[node.id] ?? 8.5,
        }];
      });
      const edgeInputs: VisualEdgeRouteInput[] = [...projection.visibleRelations]
        .filter((relation) => state.layers[relation.kind])
        .sort((left, right) => {
          const priority = (relation: GraphRelation) => {
            switch (relation.kind) {
              case "same-source-thread": return 0;
              case "related-to": return 1;
              case "depends-on": return 2;
              case "action-of": return 4;
              default: return 3;
            }
          };
          return priority(left) - priority(right) || left.id.localeCompare(right.id);
        })
        .map((relation) => ({
        id: relation.id,
        sourceNodeId: relation.sourceNodeId,
        targetNodeId: relation.targetNodeId,
        halfThickness: edgeWidth(relation) / 2,
      }));
      const initialRoutes = createEdgeRouteRelaxation(
        edgeNodes,
        edgeInputs,
        edgeOptionsForViewport(width, height),
      );
      let previewRoutes = initialRoutes;
      let previewRouteSteps = 0;
      while (
        (previewRoutes.diagnostics.nodeViolations > 0
          || previewRoutes.diagnostics.edgeConflicts > 0)
        && previewRouteSteps < 16
      ) {
        previewRoutes = stepEdgeRouteRelaxation(previewRoutes, 2);
        previewRouteSteps += 2;
      }
      expect(previewRoutes.diagnostics.nodeViolations).toBe(0);
      expect(previewRoutes.diagnostics.edgeConflicts).toBe(0);
      expect(previewRouteSteps).toBeLessThanOrEqual(16);
      const routed = runEdgeRouteRelaxationToStop(initialRoutes);
      expect(routed.diagnostics.stopped).toBe(true);
      expect(routed.diagnostics.nodeViolations).toBe(0);
      expect(routed.diagnostics.edgeConflicts).toBe(0);
    },
  );
});
