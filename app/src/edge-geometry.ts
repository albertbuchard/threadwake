/**
 * Deterministic, bounded routing for the small retained workgraph.
 *
 * This module deliberately depends only on structural render geometry. It does not
 * own graph semantics, dates, node positions, or a timer. Callers advance it from
 * their existing fixed-step ticker and can stop calling once diagnostics.stopped is
 * true.
 */

export interface EdgePoint {
  x: number
  y: number
}

/**
 * `point` is the exact endpoint used by visual routes. `segmentStart` to
 * `segmentEnd`, expanded by `halfThickness`, is the node's collision capsule.
 * Point nodes use the same value for both segment endpoints.
 */
export interface EdgeRouteNodeGeometry {
  nodeId: string
  point: EdgePoint
  segmentStart: EdgePoint
  segmentEnd: EdgePoint
  halfThickness: number
}

export interface VisualEdgeRouteInput {
  id: string
  sourceNodeId: string
  targetNodeId: string
  halfThickness?: number
}

export interface EdgeRouteCurve {
  id: string
  sourceNodeId: string
  targetNodeId: string
  constituentEdgeIds: readonly string[]
  start: EdgePoint
  control1: EdgePoint
  control2: EdgePoint
  end: EdgePoint
  seedControl1: EdgePoint
  seedControl2: EdgePoint
  halfThickness: number
}

export interface RelaxedEdgeRoute extends EdgeRouteCurve {
  control1Velocity: EdgePoint
  control2Velocity: EdgePoint
}

export type EdgeRouteStopReason = 'running' | 'converged' | 'max-steps'

export interface EdgeRouteRelaxationOptions {
  routeHalfThickness?: number
  nodePadding?: number
  edgePadding?: number
  sampleCount?: number
  nodeRepulsionStrength?: number
  edgeRepulsionStrength?: number
  seedStrength?: number
  lengthStrength?: number
  curvatureStrength?: number
  damping?: number
  maxVelocity?: number
  maxControlDrift?: number
  motionThreshold?: number
  velocityThreshold?: number
  clearanceTolerance?: number
  stableStepsRequired?: number
  maxSteps?: number
}

export interface ResolvedEdgeRouteRelaxationOptions {
  routeHalfThickness: number
  nodePadding: number
  edgePadding: number
  sampleCount: number
  nodeRepulsionStrength: number
  edgeRepulsionStrength: number
  seedStrength: number
  lengthStrength: number
  curvatureStrength: number
  damping: number
  maxVelocity: number
  maxControlDrift: number
  motionThreshold: number
  velocityThreshold: number
  clearanceTolerance: number
  stableStepsRequired: number
  maxSteps: number
}

export interface EdgeRouteDiagnostics {
  step: number
  converged: boolean
  stopped: boolean
  stopReason: EdgeRouteStopReason
  maxMotion: number
  maxSpeed: number
  nodeViolations: number
  edgeConflicts: number
  minimumNodeClearance: number
  minimumEdgeClearance: number
}

export interface EdgeRouteRelaxationState {
  nodes: readonly EdgeRouteNodeGeometry[]
  routes: Readonly<Record<string, RelaxedEdgeRoute>>
  routeOrder: readonly string[]
  options: ResolvedEdgeRouteRelaxationOptions
  stableSteps: number
  diagnostics: EdgeRouteDiagnostics
}

export const DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS: ResolvedEdgeRouteRelaxationOptions = {
  routeHalfThickness: 0.75,
  nodePadding: 4,
  edgePadding: 2.5,
  sampleCount: 12,
  nodeRepulsionStrength: 0.58,
  edgeRepulsionStrength: 0.42,
  seedStrength: 0.025,
  lengthStrength: 0.012,
  curvatureStrength: 0.018,
  damping: 0.68,
  maxVelocity: 1.5,
  maxControlDrift: 52,
  motionThreshold: 0.05,
  velocityThreshold: 0.02,
  clearanceTolerance: 0.05,
  stableStepsRequired: 12,
  maxSteps: 180,
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function resolveOptions(options: EdgeRouteRelaxationOptions = {}): ResolvedEdgeRouteRelaxationOptions {
  return {
    routeHalfThickness: Math.max(0.05, finiteOr(options.routeHalfThickness, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.routeHalfThickness)),
    nodePadding: Math.max(0, finiteOr(options.nodePadding, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.nodePadding)),
    edgePadding: Math.max(0, finiteOr(options.edgePadding, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.edgePadding)),
    sampleCount: Math.max(6, Math.min(48, Math.floor(finiteOr(options.sampleCount, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.sampleCount)))),
    nodeRepulsionStrength: Math.max(0, finiteOr(options.nodeRepulsionStrength, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.nodeRepulsionStrength)),
    edgeRepulsionStrength: Math.max(0, finiteOr(options.edgeRepulsionStrength, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.edgeRepulsionStrength)),
    seedStrength: Math.max(0, finiteOr(options.seedStrength, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.seedStrength)),
    lengthStrength: Math.max(0, finiteOr(options.lengthStrength, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.lengthStrength)),
    curvatureStrength: Math.max(0, finiteOr(options.curvatureStrength, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.curvatureStrength)),
    damping: Math.max(0, Math.min(0.98, finiteOr(options.damping, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.damping))),
    maxVelocity: Math.max(0.01, finiteOr(options.maxVelocity, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.maxVelocity)),
    maxControlDrift: Math.max(1, finiteOr(options.maxControlDrift, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.maxControlDrift)),
    motionThreshold: Math.max(0, finiteOr(options.motionThreshold, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.motionThreshold)),
    velocityThreshold: Math.max(0, finiteOr(options.velocityThreshold, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.velocityThreshold)),
    clearanceTolerance: Math.max(0, finiteOr(options.clearanceTolerance, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.clearanceTolerance)),
    stableStepsRequired: Math.max(1, Math.floor(finiteOr(options.stableStepsRequired, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.stableStepsRequired))),
    maxSteps: Math.max(1, Math.min(180, Math.floor(finiteOr(options.maxSteps, DEFAULT_EDGE_ROUTE_RELAXATION_OPTIONS.maxSteps)))),
  }
}

function clonePoint(point: EdgePoint): EdgePoint {
  return { x: point.x, y: point.y }
}

function assertPoint(point: EdgePoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must contain finite coordinates.`)
  }
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function directedRouteId(sourceNodeId: string, targetNodeId: string): string {
  return `route:${sourceNodeId.length}:${sourceNodeId}:${targetNodeId.length}:${targetNodeId}`
}

function magnitude(point: EdgePoint): number {
  return Math.hypot(point.x, point.y)
}

function deterministicDirection(key: string): EdgePoint {
  const angle = (stableHash(key) / 0xffff_ffff) * Math.PI * 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function clampVector(point: EdgePoint, maximum: number): EdgePoint {
  const length = magnitude(point)
  if (length <= maximum || length <= 1e-12) return point
  const scale = maximum / length
  return { x: point.x * scale, y: point.y * scale }
}

function clampControlToSeed(control: EdgePoint, seed: EdgePoint, maximum: number): EdgePoint {
  const delta = clampVector({ x: control.x - seed.x, y: control.y - seed.y }, maximum)
  return { x: seed.x + delta.x, y: seed.y + delta.y }
}

function seedControls(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  start: EdgePoint,
  end: EdgePoint,
): { control1: EdgePoint; control2: EdgePoint } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length <= 1e-8) {
    const direction = deterministicDirection(id)
    const normal = { x: -direction.y, y: direction.x }
    return {
      control1: { x: start.x + direction.x * 18 + normal.x * 10, y: start.y + direction.y * 18 + normal.y * 10 },
      control2: { x: end.x - direction.x * 18 + normal.x * 10, y: end.y - direction.y * 18 + normal.y * 10 },
    }
  }

  const unitX = dx / length
  const unitY = dy / length
  const normalX = -unitY
  const normalY = unitX
  // Reciprocal directed routes bend to opposite sides. The small hash-derived scale
  // prevents unrelated equal-length routes from producing a conspicuous repeated arc.
  const unorderedPairKey = sourceNodeId.localeCompare(targetNodeId) <= 0
    ? `${sourceNodeId}\u0000${targetNodeId}`
    : `${targetNodeId}\u0000${sourceNodeId}`
  // The chord normal reverses when source and target reverse. Reusing the same
  // unordered-pair sign therefore places reciprocal directed routes on opposite
  // physical sides of the chord.
  const sign = stableHash(unorderedPairKey) % 2 === 0 ? 1 : -1
  const scale = 0.88 + (stableHash(unorderedPairKey) % 25) / 100
  const bend = Math.min(18, Math.max(2.5, length * 0.075)) * scale * sign
  return {
    control1: {
      x: start.x + dx / 3 + normalX * bend,
      y: start.y + dy / 3 + normalY * bend,
    },
    control2: {
      x: start.x + (2 * dx) / 3 + normalX * bend,
      y: start.y + (2 * dy) / 3 + normalY * bend,
    },
  }
}

function cloneNode(node: EdgeRouteNodeGeometry): EdgeRouteNodeGeometry {
  if (!node.nodeId) throw new Error('Edge-route node geometry requires a non-empty nodeId.')
  assertPoint(node.point, `Node ${node.nodeId} point`)
  assertPoint(node.segmentStart, `Node ${node.nodeId} segmentStart`)
  assertPoint(node.segmentEnd, `Node ${node.nodeId} segmentEnd`)
  if (!Number.isFinite(node.halfThickness) || node.halfThickness < 0) {
    throw new Error(`Node ${node.nodeId} halfThickness must be a finite non-negative number.`)
  }
  return {
    nodeId: node.nodeId,
    point: clonePoint(node.point),
    segmentStart: clonePoint(node.segmentStart),
    segmentEnd: clonePoint(node.segmentEnd),
    halfThickness: node.halfThickness,
  }
}

/** Coalesces exact duplicate directed source-target visuals and seeds one cubic route. */
export function coalesceVisualEdgeRoutes(
  sourceNodes: readonly EdgeRouteNodeGeometry[],
  sourceEdges: readonly VisualEdgeRouteInput[],
  options: EdgeRouteRelaxationOptions = {},
): RelaxedEdgeRoute[] {
  const resolved = resolveOptions(options)
  const nodes = [...sourceNodes].map(cloneNode).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  const nodeById = new Map<string, EdgeRouteNodeGeometry>()
  for (const node of nodes) {
    if (nodeById.has(node.nodeId)) throw new Error(`Duplicate edge-route node id: ${node.nodeId}`)
    nodeById.set(node.nodeId, node)
  }

  const seenEdgeIds = new Set<string>()
  const groups = new Map<string, VisualEdgeRouteInput[]>()
  for (const edge of [...sourceEdges].sort((left, right) =>
    left.sourceNodeId.localeCompare(right.sourceNodeId)
      || left.targetNodeId.localeCompare(right.targetNodeId)
      || left.id.localeCompare(right.id))) {
    if (!edge.id) throw new Error('Visual edge routes require a non-empty stable id.')
    if (seenEdgeIds.has(edge.id)) throw new Error(`Duplicate visual edge id: ${edge.id}`)
    seenEdgeIds.add(edge.id)
    if (!nodeById.has(edge.sourceNodeId)) throw new Error(`Unknown visual edge source node: ${edge.sourceNodeId}`)
    if (!nodeById.has(edge.targetNodeId)) throw new Error(`Unknown visual edge target node: ${edge.targetNodeId}`)
    if (edge.halfThickness !== undefined && (!Number.isFinite(edge.halfThickness) || edge.halfThickness < 0)) {
      throw new Error(`Visual edge ${edge.id} halfThickness must be a finite non-negative number.`)
    }
    const key = directedRouteId(edge.sourceNodeId, edge.targetNodeId)
    groups.set(key, [...(groups.get(key) ?? []), { ...edge }])
  }

  const routes: RelaxedEdgeRoute[] = []
  for (const [id, edges] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const representative = edges[0]
    if (!representative) continue
    const source = nodeById.get(representative.sourceNodeId)
    const target = nodeById.get(representative.targetNodeId)
    if (!source || !target) continue
    const start = clonePoint(source.point)
    const end = clonePoint(target.point)
    const seed = seedControls(id, representative.sourceNodeId, representative.targetNodeId, start, end)
    routes.push({
      id,
      sourceNodeId: representative.sourceNodeId,
      targetNodeId: representative.targetNodeId,
      constituentEdgeIds: edges.map((edge) => edge.id).sort((left, right) => left.localeCompare(right)),
      start,
      control1: clonePoint(seed.control1),
      control2: clonePoint(seed.control2),
      end,
      seedControl1: clonePoint(seed.control1),
      seedControl2: clonePoint(seed.control2),
      halfThickness: edges.reduce(
        (maximum, edge) => Math.max(maximum, edge.halfThickness ?? resolved.routeHalfThickness),
        resolved.routeHalfThickness,
      ),
      control1Velocity: { x: 0, y: 0 },
      control2Velocity: { x: 0, y: 0 },
    })
  }
  return routes
}

/** Evaluates one point on a cubic route. Exact endpoints are returned verbatim. */
export function pointOnEdgeRoute(route: EdgeRouteCurve, t: number): EdgePoint {
  const bounded = Math.max(0, Math.min(1, t))
  if (bounded === 0) return clonePoint(route.start)
  if (bounded === 1) return clonePoint(route.end)
  const inverse = 1 - bounded
  const startWeight = inverse ** 3
  const control1Weight = 3 * inverse ** 2 * bounded
  const control2Weight = 3 * inverse * bounded ** 2
  const endWeight = bounded ** 3
  return {
    x: route.start.x * startWeight
      + route.control1.x * control1Weight
      + route.control2.x * control2Weight
      + route.end.x * endWeight,
    y: route.start.y * startWeight
      + route.control1.y * control1Weight
      + route.control2.y * control2Weight
      + route.end.y * endWeight,
  }
}

/** Returns `sampleCount + 1` points, including the two exact endpoints. */
export function sampleEdgeRoute(route: EdgeRouteCurve, sampleCount = 18): EdgePoint[] {
  const count = Math.max(2, Math.min(128, Math.floor(sampleCount)))
  return Array.from({ length: count + 1 }, (_, index) => pointOnEdgeRoute(route, index / count))
}

function closestPointOnSegment(point: EdgePoint, start: EdgePoint, end: EdgePoint): EdgePoint {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-12) return clonePoint(start)
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ))
  return { x: start.x + dx * projection, y: start.y + dy * projection }
}

function pointSegmentDistance(point: EdgePoint, start: EdgePoint, end: EdgePoint): number {
  const closest = closestPointOnSegment(point, start, end)
  return Math.hypot(point.x - closest.x, point.y - closest.y)
}

function cross(a: EdgePoint, b: EdgePoint, c: EdgePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsIntersect(a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  const epsilon = 1e-9
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true
  const onSegment = (value: number, first: EdgePoint, second: EdgePoint, point: EdgePoint) =>
    Math.abs(value) <= epsilon
      && point.x >= Math.min(first.x, second.x) - epsilon
      && point.x <= Math.max(first.x, second.x) + epsilon
      && point.y >= Math.min(first.y, second.y) - epsilon
      && point.y <= Math.max(first.y, second.y) + epsilon
  return onSegment(abC, a, b, c)
    || onSegment(abD, a, b, d)
    || onSegment(cdA, c, d, a)
    || onSegment(cdB, c, d, b)
}

function segmentDistance(a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): number {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  )
}

/** Physical clearance from a route stroke to a non-endpoint node capsule. */
export function minimumRouteNodeClearance(
  route: EdgeRouteCurve,
  node: EdgeRouteNodeGeometry,
  sampleCount = 18,
): number {
  if (node.nodeId === route.sourceNodeId || node.nodeId === route.targetNodeId) {
    return Number.POSITIVE_INFINITY
  }
  const samples = sampleEdgeRoute(route, sampleCount)
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < samples.length - 1; index += 1) {
    const start = samples[index]
    const end = samples[index + 1]
    if (!start || !end) continue
    minimum = Math.min(minimum, segmentDistance(start, end, node.segmentStart, node.segmentEnd))
  }
  return minimum - route.halfThickness - node.halfThickness
}

/** Physical clearance between two route strokes, excluding unavoidable shared endpoints. */
export function minimumRouteSeparation(
  left: EdgeRouteCurve,
  right: EdgeRouteCurve,
  sampleCount = 18,
): number {
  if (left.id === right.id) return Number.POSITIVE_INFINITY
  const leftSamples = sampleEdgeRoute(left, sampleCount)
  const rightSamples = sampleEdgeRoute(right, sampleCount)
  const sharesLeftStart = left.sourceNodeId === right.sourceNodeId || left.sourceNodeId === right.targetNodeId
  const sharesLeftEnd = left.targetNodeId === right.sourceNodeId || left.targetNodeId === right.targetNodeId
  const sharesRightStart = right.sourceNodeId === left.sourceNodeId || right.sourceNodeId === left.targetNodeId
  const sharesRightEnd = right.targetNodeId === left.sourceNodeId || right.targetNodeId === left.targetNodeId
  const leftStart = sharesLeftStart ? 1 : 0
  const leftEnd = leftSamples.length - 1 - (sharesLeftEnd ? 1 : 0)
  const rightStart = sharesRightStart ? 1 : 0
  const rightEnd = rightSamples.length - 1 - (sharesRightEnd ? 1 : 0)
  let minimum = Number.POSITIVE_INFINITY
  for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
    const leftA = leftSamples[leftIndex]
    const leftB = leftSamples[leftIndex + 1]
    if (!leftA || !leftB) continue
    for (let rightIndex = rightStart; rightIndex < rightEnd; rightIndex += 1) {
      const rightA = rightSamples[rightIndex]
      const rightB = rightSamples[rightIndex + 1]
      if (!rightA || !rightB) continue
      minimum = Math.min(minimum, segmentDistance(leftA, leftB, rightA, rightB))
    }
  }
  return minimum - left.halfThickness - right.halfThickness
}

interface SampledRouteGeometry {
  route: RelaxedEdgeRoute
  points: readonly EdgePoint[]
}

function sampleRoutes(
  routes: readonly RelaxedEdgeRoute[],
  sampleCount: number,
): SampledRouteGeometry[] {
  return routes.map((route) => ({ route, points: sampleEdgeRoute(route, sampleCount) }))
}

/**
 * Per-step diagnostics deliberately use the same fixed samples as the force pass.
 * The exported clearance helpers retain the more expensive segment-accurate check
 * for inspection and tests, while ticker work stays bounded at O((R*N + R^2)*S).
 */
function computeClearanceDiagnostics(
  routes: readonly RelaxedEdgeRoute[],
  nodes: readonly EdgeRouteNodeGeometry[],
  options: ResolvedEdgeRouteRelaxationOptions,
  sampledRoutes = sampleRoutes(routes, options.sampleCount),
): Pick<EdgeRouteDiagnostics, 'nodeViolations' | 'edgeConflicts' | 'minimumNodeClearance' | 'minimumEdgeClearance'> {
  let nodeViolations = 0
  let edgeConflicts = 0
  let minimumNodeClearance = Number.POSITIVE_INFINITY
  let minimumEdgeClearance = Number.POSITIVE_INFINITY
  for (const sampled of sampledRoutes) {
    const route = sampled.route
    for (const node of nodes) {
      if (node.nodeId === route.sourceNodeId || node.nodeId === route.targetNodeId) continue
      let clearance = Number.POSITIVE_INFINITY
      for (let index = 1; index < sampled.points.length - 1; index += 1) {
        const point = sampled.points[index]
        if (!point) continue
        clearance = Math.min(
          clearance,
          pointSegmentDistance(point, node.segmentStart, node.segmentEnd)
            - route.halfThickness
            - node.halfThickness,
        )
      }
      minimumNodeClearance = Math.min(minimumNodeClearance, clearance)
      if (clearance < -options.clearanceTolerance) nodeViolations += 1
    }
  }
  const inset = Math.max(1, Math.ceil(options.sampleCount * 0.11))
  for (let leftIndex = 0; leftIndex < sampledRoutes.length; leftIndex += 1) {
    const left = sampledRoutes[leftIndex]
    if (!left) continue
    for (let rightIndex = leftIndex + 1; rightIndex < sampledRoutes.length; rightIndex += 1) {
      const right = sampledRoutes[rightIndex]
      if (!right) continue
      let clearance = Number.POSITIVE_INFINITY
      for (let index = inset; index < left.points.length - inset; index += 1) {
        const leftPoint = left.points[index]
        if (!leftPoint) continue
        // Corresponding and adjacent normalized samples capture local parallelism
        // and crossings without an S-by-S scan for every pair on every ticker step.
        for (let offset = -1; offset <= 1; offset += 1) {
          const rightPoint = right.points[index + offset]
          if (!rightPoint) continue
          clearance = Math.min(
            clearance,
            Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y)
              - left.route.halfThickness
              - right.route.halfThickness,
          )
        }
      }
      minimumEdgeClearance = Math.min(minimumEdgeClearance, clearance)
      if (clearance < -options.clearanceTolerance) edgeConflicts += 1
    }
  }
  return { nodeViolations, edgeConflicts, minimumNodeClearance, minimumEdgeClearance }
}

export function createEdgeRouteRelaxation(
  sourceNodes: readonly EdgeRouteNodeGeometry[],
  sourceEdges: readonly VisualEdgeRouteInput[],
  options: EdgeRouteRelaxationOptions = {},
): EdgeRouteRelaxationState {
  const resolved = resolveOptions(options)
  const nodes = [...sourceNodes].map(cloneNode).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  const seeded = coalesceVisualEdgeRoutes(nodes, sourceEdges, resolved)
  const routes = Object.fromEntries(seeded.map((route) => [route.id, route]))
  const clearance = computeClearanceDiagnostics(seeded, nodes, resolved)
  return {
    nodes,
    routes,
    routeOrder: seeded.map((route) => route.id),
    options: resolved,
    stableSteps: 0,
    diagnostics: {
      step: 0,
      converged: false,
      stopped: false,
      stopReason: 'running',
      maxMotion: 0,
      maxSpeed: 0,
      ...clearance,
    },
  }
}

interface RouteAcceleration {
  control1: EdgePoint
  control2: EdgePoint
}

function addForce(target: EdgePoint, force: EdgePoint, weight = 1): void {
  target.x += force.x * weight
  target.y += force.y * weight
}

function bezierControlWeights(t: number): { control1: number; control2: number } {
  const inverse = 1 - t
  return {
    control1: 3 * inverse ** 2 * t,
    control2: 3 * inverse * t ** 2,
  }
}

function normalizedDirection(dx: number, dy: number, fallbackKey: string): EdgePoint {
  const length = Math.hypot(dx, dy)
  if (length <= 1e-9) return deterministicDirection(fallbackKey)
  return { x: dx / length, y: dy / length }
}

function seedRegularization(route: RelaxedEdgeRoute, options: ResolvedEdgeRouteRelaxationOptions): RouteAcceleration {
  const acceleration: RouteAcceleration = {
    control1: {
      x: (route.seedControl1.x - route.control1.x) * options.seedStrength,
      y: (route.seedControl1.y - route.control1.y) * options.seedStrength,
    },
    control2: {
      x: (route.seedControl2.x - route.control2.x) * options.seedStrength,
      y: (route.seedControl2.y - route.control2.y) * options.seedStrength,
    },
  }

  const firstHandle = { x: route.control1.x - route.start.x, y: route.control1.y - route.start.y }
  const seededFirstHandle = { x: route.seedControl1.x - route.start.x, y: route.seedControl1.y - route.start.y }
  const firstLength = magnitude(firstHandle)
  const seededFirstLength = magnitude(seededFirstHandle)
  if (firstLength > 1e-9) {
    const force = (seededFirstLength - firstLength) * options.lengthStrength / firstLength
    acceleration.control1.x += firstHandle.x * force
    acceleration.control1.y += firstHandle.y * force
  }

  const secondHandle = { x: route.control2.x - route.end.x, y: route.control2.y - route.end.y }
  const seededSecondHandle = { x: route.seedControl2.x - route.end.x, y: route.seedControl2.y - route.end.y }
  const secondLength = magnitude(secondHandle)
  const seededSecondLength = magnitude(seededSecondHandle)
  if (secondLength > 1e-9) {
    const force = (seededSecondLength - secondLength) * options.lengthStrength / secondLength
    acceleration.control2.x += secondHandle.x * force
    acceleration.control2.y += secondHandle.y * force
  }

  const currentDifference = {
    x: route.control2.x - route.control1.x,
    y: route.control2.y - route.control1.y,
  }
  const seededDifference = {
    x: route.seedControl2.x - route.seedControl1.x,
    y: route.seedControl2.y - route.seedControl1.y,
  }
  const curvatureError = {
    x: (seededDifference.x - currentDifference.x) * options.curvatureStrength * 0.5,
    y: (seededDifference.y - currentDifference.y) * options.curvatureStrength * 0.5,
  }
  acceleration.control1.x -= curvatureError.x
  acceleration.control1.y -= curvatureError.y
  acceleration.control2.x += curvatureError.x
  acceleration.control2.y += curvatureError.y
  return acceleration
}

function advanceOnce(state: EdgeRouteRelaxationState): EdgeRouteRelaxationState {
  if (state.diagnostics.stopped) return state
  const routes = state.routeOrder.flatMap((id) => state.routes[id] ? [state.routes[id]] : [])
  const sampledRoutes = sampleRoutes(routes, state.options.sampleCount)
  const accelerations = new Map<string, RouteAcceleration>()
  for (const route of routes) accelerations.set(route.id, seedRegularization(route, state.options))

  for (const sampled of sampledRoutes) {
    const route = sampled.route
    const acceleration = accelerations.get(route.id)
    if (!acceleration) continue
    for (let sampleIndex = 1; sampleIndex < state.options.sampleCount; sampleIndex += 1) {
      const t = sampleIndex / state.options.sampleCount
      const point = sampled.points[sampleIndex]
      if (!point) continue
      const weights = bezierControlWeights(t)
      for (const node of state.nodes) {
        if (node.nodeId === route.sourceNodeId || node.nodeId === route.targetNodeId) continue
        const closest = closestPointOnSegment(point, node.segmentStart, node.segmentEnd)
        const dx = point.x - closest.x
        const dy = point.y - closest.y
        const distance = Math.hypot(dx, dy)
        const required = route.halfThickness + node.halfThickness + state.options.nodePadding
        const penetration = required - distance
        if (penetration <= 0) continue
        const direction = normalizedDirection(dx, dy, `${route.id}|${node.nodeId}|${sampleIndex}`)
        const forceScale = penetration * state.options.nodeRepulsionStrength / state.options.sampleCount
        const force = { x: direction.x * forceScale, y: direction.y * forceScale }
        addForce(acceleration.control1, force, weights.control1)
        addForce(acceleration.control2, force, weights.control2)
      }
    }
  }

  // One closest interior sample pair per route pair is enough for this small graph and
  // avoids over-counting long parallel sections. Endpoint insets preserve exact shared
  // endpoints without treating their necessary convergence as a conflict force.
  const firstInteriorSample = Math.max(1, Math.ceil(state.options.sampleCount * 0.11))
  const lastInteriorSample = Math.min(state.options.sampleCount - 1, Math.floor(state.options.sampleCount * 0.89))
  for (let leftIndex = 0; leftIndex < sampledRoutes.length; leftIndex += 1) {
    const leftSampled = sampledRoutes[leftIndex]
    const left = leftSampled?.route
    if (!left) continue
    for (let rightIndex = leftIndex + 1; rightIndex < sampledRoutes.length; rightIndex += 1) {
      const rightSampled = sampledRoutes[rightIndex]
      const right = rightSampled?.route
      if (!right) continue
      let minimumDistance = Number.POSITIVE_INFINITY
      let leftT = 0.5
      let rightT = 0.5
      let leftPoint = pointOnEdgeRoute(left, leftT)
      let rightPoint = pointOnEdgeRoute(right, rightT)
      for (let leftSample = firstInteriorSample; leftSample <= lastInteriorSample; leftSample += 1) {
        const candidateLeftT = leftSample / state.options.sampleCount
        const candidateLeft = leftSampled?.points[leftSample]
        if (!candidateLeft) continue
        for (let offset = -1; offset <= 1; offset += 1) {
          const rightSample = leftSample + offset
          if (rightSample < firstInteriorSample || rightSample > lastInteriorSample) continue
          const candidateRightT = rightSample / state.options.sampleCount
          const candidateRight = rightSampled?.points[rightSample]
          if (!candidateRight) continue
          const distance = Math.hypot(candidateLeft.x - candidateRight.x, candidateLeft.y - candidateRight.y)
          if (distance < minimumDistance) {
            minimumDistance = distance
            leftT = candidateLeftT
            rightT = candidateRightT
            leftPoint = candidateLeft
            rightPoint = candidateRight
          }
        }
      }
      const required = left.halfThickness + right.halfThickness + state.options.edgePadding
      const penetration = required - minimumDistance
      if (penetration <= 0) continue
      const direction = normalizedDirection(
        leftPoint.x - rightPoint.x,
        leftPoint.y - rightPoint.y,
        `${left.id}|${right.id}`,
      )
      const force = {
        x: direction.x * penetration * state.options.edgeRepulsionStrength,
        y: direction.y * penetration * state.options.edgeRepulsionStrength,
      }
      const leftWeights = bezierControlWeights(leftT)
      const rightWeights = bezierControlWeights(rightT)
      const leftAcceleration = accelerations.get(left.id)
      const rightAcceleration = accelerations.get(right.id)
      if (leftAcceleration) {
        addForce(leftAcceleration.control1, force, leftWeights.control1)
        addForce(leftAcceleration.control2, force, leftWeights.control2)
      }
      if (rightAcceleration) {
        addForce(rightAcceleration.control1, force, -rightWeights.control1)
        addForce(rightAcceleration.control2, force, -rightWeights.control2)
      }
    }
  }

  let maxMotion = 0
  let maxSpeed = 0
  const nextRoutes: RelaxedEdgeRoute[] = []
  for (const route of routes) {
    const acceleration = accelerations.get(route.id) ?? { control1: { x: 0, y: 0 }, control2: { x: 0, y: 0 } }
    const control1Velocity = clampVector({
      x: (route.control1Velocity.x + acceleration.control1.x) * state.options.damping,
      y: (route.control1Velocity.y + acceleration.control1.y) * state.options.damping,
    }, state.options.maxVelocity)
    const control2Velocity = clampVector({
      x: (route.control2Velocity.x + acceleration.control2.x) * state.options.damping,
      y: (route.control2Velocity.y + acceleration.control2.y) * state.options.damping,
    }, state.options.maxVelocity)
    const unclampedControl1 = { x: route.control1.x + control1Velocity.x, y: route.control1.y + control1Velocity.y }
    const unclampedControl2 = { x: route.control2.x + control2Velocity.x, y: route.control2.y + control2Velocity.y }
    const control1 = clampControlToSeed(unclampedControl1, route.seedControl1, state.options.maxControlDrift)
    const control2 = clampControlToSeed(unclampedControl2, route.seedControl2, state.options.maxControlDrift)
    const actualControl1Velocity = { x: control1.x - route.control1.x, y: control1.y - route.control1.y }
    const actualControl2Velocity = { x: control2.x - route.control2.x, y: control2.y - route.control2.y }
    maxMotion = Math.max(maxMotion, magnitude(actualControl1Velocity), magnitude(actualControl2Velocity))
    maxSpeed = Math.max(maxSpeed, magnitude(control1Velocity), magnitude(control2Velocity))
    nextRoutes.push({
      ...route,
      start: clonePoint(route.start),
      end: clonePoint(route.end),
      control1,
      control2,
      control1Velocity: actualControl1Velocity,
      control2Velocity: actualControl2Velocity,
    })
  }

  const nextSamples = sampleRoutes(nextRoutes, state.options.sampleCount)
  const clearance = computeClearanceDiagnostics(nextRoutes, state.nodes, state.options, nextSamples)
  const motionStable = maxMotion < state.options.motionThreshold && maxSpeed < state.options.velocityThreshold
  // Convergence describes a stationary route equilibrium. Residual impossible or
  // corridor-bounded conflicts remain explicit diagnostics rather than causing a
  // perpetual ticker; callers can decide how to display or escalate them.
  const stableSteps = motionStable ? state.stableSteps + 1 : 0
  const step = state.diagnostics.step + 1
  const converged = stableSteps >= state.options.stableStepsRequired
  const atMaximum = step >= state.options.maxSteps
  const stopped = converged || atMaximum
  const stopReason: EdgeRouteStopReason = converged ? 'converged' : atMaximum ? 'max-steps' : 'running'
  return {
    ...state,
    routes: Object.fromEntries(nextRoutes.map((route) => [route.id, route])),
    stableSteps,
    diagnostics: {
      step,
      converged,
      stopped,
      stopReason,
      maxMotion,
      maxSpeed,
      ...clearance,
    },
  }
}

/** Advances a bounded number of fixed steps. A stopped state is returned unchanged. */
export function stepEdgeRouteRelaxation(
  state: EdgeRouteRelaxationState,
  steps = 1,
): EdgeRouteRelaxationState {
  const requested = Math.max(0, Math.floor(steps))
  let next = state
  for (let index = 0; index < requested && !next.diagnostics.stopped; index += 1) {
    next = advanceOnce(next)
  }
  return next
}

/** Runs synchronously only to convergence or the configured hard maximum of 180 steps. */
export function runEdgeRouteRelaxationToStop(state: EdgeRouteRelaxationState): EdgeRouteRelaxationState {
  let next = state
  while (!next.diagnostics.stopped) next = advanceOnce(next)
  return next
}
