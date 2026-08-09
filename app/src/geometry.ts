import type { ManualNodeOffset, WorkNode, Workstream } from './domain'

export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1_000
export const MIN_ZOOM = 0.55
export const MAX_ZOOM = 2.4
export const DEFAULT_INNER_RADIUS_RATIO = 0.18
export const MIN_INNER_RADIUS_RATIO = 0.08
export const MAX_INNER_RADIUS_RATIO = 0.32

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface GraphNodePosition extends Point {
  nodeId: string
  startX: number
  startY: number
  endX: number
  endY: number
  angle: number
  radius: number
  startRadius: number
  endRadius: number
  isDuration: boolean
  isSatellite: boolean
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface TimeRing {
  radius: number
  date: string
  label: string
}

export interface GraphLayout {
  positions: Record<string, GraphNodePosition>
  rings: TimeRing[]
  center: Point
  innerRadius: number
  outerRadius: number
  minDate: string
  maxDate: string
  ringCadence: string
}

export interface TemporalTimeDomain {
  startMs: number
  endMs: number
}

export interface TemporalVisibleInterval {
  startMs: number
  endMs: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export type RingCadence =
  | { unit: 'hour'; step: 1 | 2 | 3 | 6 | 12 }
  | { unit: 'day'; step: 1 | 2 | 3 | 7 | 14 }
  | { unit: 'month'; step: 1 | 2 | 3 | 6 }
  | { unit: 'year'; step: 1 }

export interface TemporalLayoutOptions {
  width: number
  height: number
  padding?: number
  /** Fraction of the available wheel radius reserved as the central orientation well. */
  innerRadiusRatio?: number
  rotationRadians?: number
  zoom?: number
  pan?: Point
  /** Explicit absolute-time domain; independent of the currently visible nodes. */
  timeDomain?: TemporalTimeDomain
  /** Optional clipped intervals for nodes that cross the active date-window edge. */
  visibleIntervals?: ReadonlyMap<string, TemporalVisibleInterval>
}

export type RelaxationStopReason = 'running' | 'converged' | 'max-steps'

export interface ForceRelaxationOptions {
  collisionRadius?: number
  collisionRadii?: Readonly<Record<string, number>>
  /** Visible half-thicknesses when collisionRadii include selection/influence expansion. */
  glyphRadii?: Readonly<Record<string, number>>
  pinnedOffsets?: Readonly<Record<string, ManualNodeOffset>>
  collisionPadding?: number
  collisionIterations?: number
  repulsionStrength?: number
  anchorStrength?: number
  targetStrength?: number
  relationshipStrength?: number
  satelliteRelationshipStrength?: number
  damping?: number
  alphaDecay?: number
  alphaMin?: number
  maxAngularDrift?: number
  maxSatelliteRadialDrift?: number
  maxVelocity?: number
  motionThreshold?: number
  velocityThreshold?: number
  overlapTolerance?: number
  stableStepsRequired?: number
  maxSteps?: number
}

export interface ResolvedForceRelaxationOptions {
  collisionRadius: number
  collisionRadii: Readonly<Record<string, number>>
  glyphRadii: Readonly<Record<string, number>>
  pinnedOffsets: Readonly<Record<string, ManualNodeOffset>>
  collisionPadding: number
  collisionIterations: number
  repulsionStrength: number
  anchorStrength: number
  targetStrength: number
  relationshipStrength: number
  satelliteRelationshipStrength: number
  damping: number
  alphaDecay: number
  alphaMin: number
  maxAngularDrift: number
  maxSatelliteRadialDrift: number
  maxVelocity: number
  motionThreshold: number
  velocityThreshold: number
  overlapTolerance: number
  stableStepsRequired: number
  maxSteps: number
}

/** Derived render geometry only; semantic dates, radii, and workstream angles remain untouched. */
export interface ForceRelaxationNode {
  nodeId: string
  workstreamId: string
  parentNodeId?: string
  satelliteOfNodeId?: string
  anchorX: number
  anchorY: number
  anchorAngle: number
  anchorRadius: number
  startRadius: number
  endRadius: number
  collisionRadius: number
  glyphRadius: number
  pinned: boolean
  maxAngleOffset: number
  angleOffset: number
  targetAngleOffset: number
  angularVelocity: number
  radialOffset: number
  targetRadialOffset: number
  radialVelocity: number
  renderAngle: number
  x: number
  y: number
}

export interface ForceRelaxationState {
  nodes: Record<string, ForceRelaxationNode>
  center: Point
  options: ResolvedForceRelaxationOptions
  layoutKey: string
  step: number
  alpha: number
  maxMotion: number
  maxSpeed: number
  stableSteps: number
  initialOverlapCount: number
  overlapCount: number
  totalOverlap: number
  maximumOverlap: number
  initialGlyphOverlapCount: number
  glyphOverlapCount: number
  glyphTotalOverlap: number
  maximumGlyphOverlap: number
  stopped: boolean
  converged: boolean
  stopReason: RelaxationStopReason
}

export const DEFAULT_FORCE_RELAXATION_OPTIONS: ResolvedForceRelaxationOptions = {
  collisionRadius: 6,
  collisionRadii: {},
  glyphRadii: {},
  pinnedOffsets: {},
  collisionPadding: 3,
  collisionIterations: 1,
  repulsionStrength: 0.34,
  anchorStrength: 0.0001,
  targetStrength: 0.28,
  relationshipStrength: 0.018,
  satelliteRelationshipStrength: 0.065,
  damping: 0.72,
  alphaDecay: 0.03,
  alphaMin: 0.05,
  maxAngularDrift: 0.24,
  maxSatelliteRadialDrift: 14,
  maxVelocity: 2,
  motionThreshold: 0.05,
  velocityThreshold: 0.02,
  overlapTolerance: 0.05,
  stableStepsRequired: 12,
  maxSteps: 180,
}

/** Clamp a persisted/manual drag request to the node's current semantic corridor. */
export function clampManualNodeOffset(
  node: Pick<ForceRelaxationNode, 'maxAngleOffset' | 'satelliteOfNodeId'>,
  offset: ManualNodeOffset,
  maxSatelliteRadialDrift = DEFAULT_FORCE_RELAXATION_OPTIONS.maxSatelliteRadialDrift,
): ManualNodeOffset {
  const angleOffset = clampToRange(
    Number.isFinite(offset.angleOffset) ? offset.angleOffset : 0,
    -node.maxAngleOffset,
    node.maxAngleOffset,
  )
  if (!node.satelliteOfNodeId) return { angleOffset }
  return {
    angleOffset,
    radialOffset: clampToRange(
      Number.isFinite(offset.radialOffset) ? offset.radialOffset as number : 0,
      -maxSatelliteRadialDrift,
      maxSatelliteRadialDrift,
    ),
  }
}

function timestamp(value: string): number {
  const result = Date.parse(value)
  if (!Number.isFinite(result)) {
    throw new Error(`Invalid ISO date: ${value}`)
  }
  return result
}

function isoDate(value: number): string {
  return new Date(value).toISOString()
}

function formatRingDate(value: number, cadence?: RingCadence): string {
  const includesTime = cadence?.unit === 'hour'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includesTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(value))
}

function stableFanOffset(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return (((Math.abs(hash) % 9) - 4) / 4) * 0.022
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function clampInnerRadiusRatio(value: number): number {
  return Math.min(MAX_INNER_RADIUS_RATIO, Math.max(MIN_INNER_RADIUS_RATIO, value))
}

export function normalizeAngle(value: number): number {
  const fullTurn = Math.PI * 2
  return ((value % fullTurn) + fullTurn) % fullTurn
}

/** Returns the signed shortest rotation from `from` to `to`, in radians. */
export function shortestAngleDelta(from: number, to: number): number {
  const fullTurn = Math.PI * 2
  return ((to - from + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

/**
 * Returns the nearest absolute graph rotation that places an unrotated lane or node
 * angle on a requested screen axis. Zero is the right-facing three-o'clock axis.
 */
export function rotationForFocusedAngle(
  focusAngle: number,
  currentRotation = 0,
  targetAxis = 0,
): number {
  return currentRotation + shortestAngleDelta(focusAngle + currentRotation, targetAxis)
}

/** Rotation that places a stable workstream lane on the three-o'clock axis. */
export function rotationForFocusedStream(
  stream: number | Pick<Workstream, 'angle'>,
  currentRotation = 0,
): number {
  return rotationForFocusedAngle(typeof stream === 'number' ? stream : stream.angle, currentRotation)
}

/**
 * Rotation that places the exact selected-node position on the three-o'clock axis.
 * Unlike stream focus, this includes the node's deterministic branch fan or satellite
 * offset. Pass a position from an unrotated layout when rotation is applied by a
 * renderer-level world transform.
 */
export function rotationForFocusedNode(
  position: Pick<GraphNodePosition, 'angle'>,
  currentRotation = 0,
): number {
  return rotationForFocusedAngle(position.angle, currentRotation)
}

export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number,
): Point {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  }
}

export function dateToRadius(
  date: string | number,
  minDate: string | number,
  maxDate: string | number,
  innerRadius: number,
  outerRadius: number,
): number {
  const value = typeof date === 'number' ? date : timestamp(date)
  const minimum = typeof minDate === 'number' ? minDate : timestamp(minDate)
  const maximum = typeof maxDate === 'number' ? maxDate : timestamp(maxDate)
  if (maximum <= minimum) return (innerRadius + outerRadius) / 2
  const ratio = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)))
  return innerRadius + ratio * (outerRadius - innerRadius)
}

export function createTimeRings(
  minDate: string | number,
  maxDate: string | number,
  innerRadius: number,
  outerRadius: number,
): TimeRing[] {
  const startMs = typeof minDate === 'number' ? minDate : timestamp(minDate)
  const endMs = typeof maxDate === 'number' ? maxDate : timestamp(maxDate)
  return createAdaptiveTimeRings({ startMs, endMs }, innerRadius, outerRadius).rings
}

const RING_CADENCE_LADDER: readonly RingCadence[] = [
  { unit: 'hour', step: 1 },
  { unit: 'hour', step: 2 },
  { unit: 'hour', step: 3 },
  { unit: 'hour', step: 6 },
  { unit: 'hour', step: 12 },
  { unit: 'day', step: 1 },
  { unit: 'day', step: 2 },
  { unit: 'day', step: 3 },
  { unit: 'day', step: 7 },
  { unit: 'day', step: 14 },
  { unit: 'month', step: 1 },
  { unit: 'month', step: 2 },
  { unit: 'month', step: 3 },
  { unit: 'month', step: 6 },
  { unit: 'year', step: 1 },
]

export function ringCadenceKey(cadence: RingCadence): string {
  return `${cadence.step}-${cadence.unit}${cadence.step === 1 ? '' : 's'}`
}

function fixedCadenceMs(cadence: Extract<RingCadence, { unit: 'hour' | 'day' }>): number {
  return cadence.step * (cadence.unit === 'hour' ? 3_600_000 : 86_400_000)
}

function alignedCadenceTicks(domain: TemporalTimeDomain, cadence: RingCadence): number[] {
  const result: number[] = []
  if (domain.endMs < domain.startMs) return result
  if (cadence.unit === 'hour' || cadence.unit === 'day') {
    const intervalMs = fixedCadenceMs(cadence)
    let value = Math.ceil(domain.startMs / intervalMs) * intervalMs
    for (; value <= domain.endMs; value += intervalMs) result.push(value)
    return result
  }

  const start = new Date(domain.startMs)
  if (cadence.unit === 'month') {
    let totalMonths = start.getUTCFullYear() * 12 + start.getUTCMonth()
    if (
      start.getUTCDate() > 1
      || start.getUTCHours() > 0
      || start.getUTCMinutes() > 0
      || start.getUTCSeconds() > 0
      || start.getUTCMilliseconds() > 0
    ) totalMonths += 1
    const remainder = ((totalMonths % cadence.step) + cadence.step) % cadence.step
    if (remainder !== 0) totalMonths += cadence.step - remainder
    while (true) {
      const value = Date.UTC(Math.floor(totalMonths / 12), totalMonths % 12, 1)
      if (value > domain.endMs) break
      result.push(value)
      totalMonths += cadence.step
    }
    return result
  }

  let year = start.getUTCFullYear()
  if (
    start.getUTCMonth() > 0
    || start.getUTCDate() > 1
    || start.getUTCHours() > 0
    || start.getUTCMinutes() > 0
    || start.getUTCSeconds() > 0
    || start.getUTCMilliseconds() > 0
  ) year += 1
  for (; Date.UTC(year, 0, 1) <= domain.endMs; year += cadence.step) {
    result.push(Date.UTC(year, 0, 1))
  }
  return result
}

function minimumTickSpacing(
  ticks: readonly number[],
  domain: TemporalTimeDomain,
  radialSpan: number,
): number {
  if (ticks.length < 2 || domain.endMs <= domain.startMs) return Number.POSITIVE_INFINITY
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < ticks.length; index += 1) {
    minimum = Math.min(
      minimum,
      ((ticks[index] as number) - (ticks[index - 1] as number))
        / (domain.endMs - domain.startMs)
        * radialSpan,
    )
  }
  return minimum
}

export function chooseRingCadence(
  domain: TemporalTimeDomain,
  radialSpanCssPx: number,
  minimumSpacingCssPx = 42,
): RingCadence {
  for (const cadence of RING_CADENCE_LADDER) {
    const ticks = alignedCadenceTicks(domain, cadence)
    if (minimumTickSpacing(ticks, domain, radialSpanCssPx) >= minimumSpacingCssPx) return cadence
  }
  return RING_CADENCE_LADDER.at(-1) as RingCadence
}

export function createAdaptiveTimeRings(
  domain: TemporalTimeDomain,
  innerRadius: number,
  outerRadius: number,
  minimumSpacingCssPx = 42,
): { rings: TimeRing[]; cadence: RingCadence } {
  const normalized = domain.endMs > domain.startMs
    ? domain
    : { startMs: domain.startMs, endMs: domain.startMs + 86_400_000 - 1 }
  const radialSpan = Math.max(0, outerRadius - innerRadius)
  const cadence = chooseRingCadence(normalized, radialSpan, minimumSpacingCssPx)
  const ticks = alignedCadenceTicks(normalized, cadence)
  const withBoundaries = [...ticks]
  const first = withBoundaries[0]
  if (
    first === undefined
    || dateToRadius(first, normalized.startMs, normalized.endMs, innerRadius, outerRadius) - innerRadius >= minimumSpacingCssPx
  ) withBoundaries.unshift(normalized.startMs)
  const last = withBoundaries.at(-1)
  if (
    last === undefined
    || outerRadius - dateToRadius(last, normalized.startMs, normalized.endMs, innerRadius, outerRadius) >= minimumSpacingCssPx
  ) withBoundaries.push(normalized.endMs)
  const values = [...new Set(withBoundaries)].sort((left, right) => left - right)
  return {
    cadence,
    rings: values.map((value) => ({
      radius: dateToRadius(value, normalized.startMs, normalized.endMs, innerRadius, outerRadius),
      date: isoDate(value),
      label: formatRingDate(value, cadence),
    })),
  }
}

export function createTemporalLayout(
  nodes: readonly WorkNode[],
  workstreams: readonly Workstream[],
  options: TemporalLayoutOptions,
): GraphLayout {
  const {
    width,
    height,
    padding = Math.max(30, Math.min(width, height) * 0.055),
    innerRadiusRatio: requestedInnerRadiusRatio = DEFAULT_INNER_RADIUS_RATIO,
    rotationRadians = 0,
    zoom: requestedZoom = 1,
    pan = { x: 0, y: 0 },
    timeDomain,
    visibleIntervals,
  } = options

  const zoom = clampZoom(requestedZoom)
  const innerRadiusRatio = clampInnerRadiusRatio(requestedInnerRadiusRatio)
  const center = { x: width / 2 + pan.x, y: height / 2 + pan.y }
  const availableRadius = Math.max(24, Math.min(width, height) / 2 - padding)
  // Keep a compact orientation well, then spend most of the wheel on absolute time.
  // The old 30% well visually compressed dates; 18% retains the center while adding
  // roughly 17% more usable radial span at the same viewport and outer padding.
  const unscaledInner = availableRadius * innerRadiusRatio
  const innerRadius = unscaledInner * zoom
  const outerRadius = availableRadius * zoom
  const dateValues = nodes.flatMap((node) => [timestamp(node.startedAt), timestamp(node.endedAt ?? node.startedAt)])
  const minimum = timeDomain?.startMs ?? (dateValues.length > 0 ? Math.min(...dateValues) : Date.UTC(2026, 0, 1))
  const maximum = timeDomain?.endMs ?? (dateValues.length > 0 ? Math.max(...dateValues) : minimum + TWO_WEEKS_MS)
  const effectiveMaximum = maximum === minimum ? minimum + TWO_WEEKS_MS : maximum
  const streams = new Map(workstreams.map((stream) => [stream.id, stream]))
  const positions: Record<string, GraphNodePosition> = {}

  for (const node of nodes.filter((candidate) => !candidate.satelliteOfNodeId)) {
    const stream = streams.get(node.workstreamId)
    if (!stream) continue
    const fan = node.parentNodeId ? stableFanOffset(node.id) : 0
    const angle = normalizeAngle(stream.angle + rotationRadians + fan)
    const visibleInterval = visibleIntervals?.get(node.id)
    const visibleStart = visibleInterval?.startMs ?? timestamp(node.startedAt)
    const visibleEnd = visibleInterval?.endMs ?? timestamp(node.endedAt ?? node.startedAt)
    const startRadius = dateToRadius(visibleStart, minimum, effectiveMaximum, innerRadius, outerRadius)
    const endRadius = dateToRadius(visibleEnd, minimum, effectiveMaximum, innerRadius, outerRadius)
    const start = polarToCartesian(center.x, center.y, startRadius, angle)
    const end = polarToCartesian(center.x, center.y, endRadius, angle)
    positions[node.id] = {
      nodeId: node.id,
      x: end.x,
      y: end.y,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      angle,
      radius: endRadius,
      startRadius,
      endRadius,
      isDuration: visibleEnd > visibleStart,
      isSatellite: false,
      continuesBefore: visibleInterval?.continuesBefore ?? false,
      continuesAfter: visibleInterval?.continuesAfter ?? false,
    }
  }

  const satellitesByParent = new Map<string, WorkNode[]>()
  for (const node of nodes.filter((candidate) => candidate.satelliteOfNodeId)) {
    const parentId = node.satelliteOfNodeId as string
    satellitesByParent.set(parentId, [...(satellitesByParent.get(parentId) ?? []), node])
  }

  for (const [parentId, satellites] of satellitesByParent) {
    const parent = positions[parentId]
    if (!parent) continue
    const sorted = [...satellites].sort((left, right) => left.id.localeCompare(right.id))
    sorted.forEach((node, index) => {
      const centeredIndex = index - (sorted.length - 1) / 2
      const angle = normalizeAngle(parent.angle + centeredIndex * 0.075)
      const radius = parent.radius + 18 * zoom + Math.abs(centeredIndex) * 2
      const point = polarToCartesian(center.x, center.y, radius, angle)
      positions[node.id] = {
        nodeId: node.id,
        x: point.x,
        y: point.y,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
        angle,
        radius,
        startRadius: radius,
        endRadius: radius,
        isDuration: false,
        isSatellite: true,
        continuesBefore: false,
        continuesAfter: false,
      }
    })
  }

  const adaptiveRings = createAdaptiveTimeRings(
    { startMs: minimum, endMs: effectiveMaximum },
    innerRadius,
    outerRadius,
  )
  return {
    positions,
    rings: adaptiveRings.rings,
    center,
    innerRadius,
    outerRadius,
    minDate: isoDate(minimum),
    maxDate: isoDate(effectiveMaximum),
    ringCadence: ringCadenceKey(adaptiveRings.cadence),
  }
}

export function computeGraphLayout(
  nodes: readonly WorkNode[],
  workstreams: readonly Workstream[],
  width: number,
  height: number,
  rotationRadians = 0,
  zoom = 1,
  pan: Point = { x: 0, y: 0 },
): GraphLayout {
  return createTemporalLayout(nodes, workstreams, {
    width,
    height,
    rotationRadians,
    zoom,
    pan,
  })
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function resolveForceRelaxationOptions(options: ForceRelaxationOptions = {}): ResolvedForceRelaxationOptions {
  const collisionRadii = Object.fromEntries(
    Object.entries(options.collisionRadii ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )
  const glyphRadii = Object.fromEntries(
    Object.entries(options.glyphRadii ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )
  const pinnedOffsets = Object.fromEntries(
    Object.entries(options.pinnedOffsets ?? {})
      .filter(([, offset]) => Number.isFinite(offset.angleOffset))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, offset]) => [nodeId, {
        angleOffset: offset.angleOffset,
        radialOffset: Number.isFinite(offset.radialOffset) ? offset.radialOffset : undefined,
      }]),
  )
  return {
    collisionRadius: Math.max(0.1, finiteOr(options.collisionRadius, DEFAULT_FORCE_RELAXATION_OPTIONS.collisionRadius)),
    collisionRadii,
    glyphRadii,
    pinnedOffsets,
    collisionPadding: Math.max(0, finiteOr(options.collisionPadding, DEFAULT_FORCE_RELAXATION_OPTIONS.collisionPadding)),
    collisionIterations: Math.max(1, Math.min(16, Math.floor(finiteOr(options.collisionIterations, DEFAULT_FORCE_RELAXATION_OPTIONS.collisionIterations)))),
    repulsionStrength: Math.max(0, finiteOr(options.repulsionStrength, DEFAULT_FORCE_RELAXATION_OPTIONS.repulsionStrength)),
    anchorStrength: Math.max(0, finiteOr(options.anchorStrength, DEFAULT_FORCE_RELAXATION_OPTIONS.anchorStrength)),
    targetStrength: Math.max(0, Math.min(1, finiteOr(options.targetStrength, DEFAULT_FORCE_RELAXATION_OPTIONS.targetStrength))),
    relationshipStrength: Math.max(0, finiteOr(options.relationshipStrength, DEFAULT_FORCE_RELAXATION_OPTIONS.relationshipStrength)),
    satelliteRelationshipStrength: Math.max(0, finiteOr(options.satelliteRelationshipStrength, DEFAULT_FORCE_RELAXATION_OPTIONS.satelliteRelationshipStrength)),
    damping: Math.min(0.98, Math.max(0, finiteOr(options.damping, DEFAULT_FORCE_RELAXATION_OPTIONS.damping))),
    alphaDecay: Math.min(0.5, Math.max(0, finiteOr(options.alphaDecay, DEFAULT_FORCE_RELAXATION_OPTIONS.alphaDecay))),
    alphaMin: Math.min(1, Math.max(0, finiteOr(options.alphaMin, DEFAULT_FORCE_RELAXATION_OPTIONS.alphaMin))),
    maxAngularDrift: Math.min(Math.PI / 4, Math.max(0, finiteOr(options.maxAngularDrift, DEFAULT_FORCE_RELAXATION_OPTIONS.maxAngularDrift))),
    maxSatelliteRadialDrift: Math.max(0, Math.min(32, finiteOr(options.maxSatelliteRadialDrift, DEFAULT_FORCE_RELAXATION_OPTIONS.maxSatelliteRadialDrift))),
    maxVelocity: Math.max(0.01, finiteOr(options.maxVelocity, DEFAULT_FORCE_RELAXATION_OPTIONS.maxVelocity)),
    motionThreshold: Math.max(0, finiteOr(options.motionThreshold, DEFAULT_FORCE_RELAXATION_OPTIONS.motionThreshold)),
    velocityThreshold: Math.max(0, finiteOr(options.velocityThreshold, DEFAULT_FORCE_RELAXATION_OPTIONS.velocityThreshold)),
    overlapTolerance: Math.max(0, finiteOr(options.overlapTolerance, DEFAULT_FORCE_RELAXATION_OPTIONS.overlapTolerance)),
    stableStepsRequired: Math.max(1, Math.floor(finiteOr(options.stableStepsRequired, DEFAULT_FORCE_RELAXATION_OPTIONS.stableStepsRequired))),
    maxSteps: Math.max(1, Math.floor(finiteOr(options.maxSteps, DEFAULT_FORCE_RELAXATION_OPTIONS.maxSteps))),
  }
}

function circularMean(angles: readonly number[]): number {
  if (angles.length === 0) return 0
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0)
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0)
  return normalizeAngle(Math.atan2(y, x))
}

function stableHash(value: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function forceRelaxationKey(
  layout: GraphLayout,
  nodes: readonly WorkNode[],
  options: ForceRelaxationOptions = {},
): string {
  const resolved = resolveForceRelaxationOptions(options)
  const nodeInput = [...nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => {
      const position = layout.positions[node.id]
      return [
        node.id,
        node.workstreamId,
        node.parentNodeId ?? '',
        node.satelliteOfNodeId ?? '',
        position?.x.toFixed(4) ?? 'missing',
        position?.y.toFixed(4) ?? 'missing',
        position?.angle.toFixed(7) ?? 'missing',
        position?.startRadius.toFixed(4) ?? 'missing',
        position?.endRadius.toFixed(4) ?? 'missing',
        (resolved.collisionRadii[node.id] ?? resolved.collisionRadius).toFixed(3),
      ].join(':')
    })
    .join('|')
  const optionInput = JSON.stringify({ ...resolved, collisionRadii: Object.entries(resolved.collisionRadii) })
  return `relax-${stableHash(`${layout.center.x.toFixed(3)}:${layout.center.y.toFixed(3)}:${layout.outerRadius.toFixed(3)}|${nodeInput}|${optionInput}`)}`
}

export interface ForceOverlapMetrics {
  count: number
  total: number
  maximum: number
}

function clampToRange(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Exact centerline distance between two radial point/capsule nodes. Duration length
 * is represented by the semantic start/end radii rather than inflated into a large
 * midpoint circle. This keeps collision radii meaningful as glyph half-thicknesses.
 */
export function radialSegmentDistance(
  left: Pick<ForceRelaxationNode, 'startRadius' | 'endRadius' | 'renderAngle' | 'radialOffset'>,
  right: Pick<ForceRelaxationNode, 'startRadius' | 'endRadius' | 'renderAngle' | 'radialOffset'>,
): number {
  return radialSegmentDistanceAt(
    left,
    right,
    left.renderAngle,
    right.renderAngle,
    left.radialOffset,
    right.radialOffset,
  )
}

function radialSegmentDistanceAt(
  left: Pick<ForceRelaxationNode, 'startRadius' | 'endRadius'>,
  right: Pick<ForceRelaxationNode, 'startRadius' | 'endRadius'>,
  leftAngle: number,
  rightAngle: number,
  leftRadialOffset: number,
  rightRadialOffset: number,
): number {
  const leftMinimum = Math.min(left.startRadius, left.endRadius) + leftRadialOffset
  const leftMaximum = Math.max(left.startRadius, left.endRadius) + leftRadialOffset
  const rightMinimum = Math.min(right.startRadius, right.endRadius) + rightRadialOffset
  const rightMaximum = Math.max(right.startRadius, right.endRadius) + rightRadialOffset
  const cosine = Math.cos(Math.abs(shortestAngleDelta(leftAngle, rightAngle)))
  let minimumSquared = Number.POSITIVE_INFINITY
  const consider = (leftRadius: number, rightRadius: number) => {
    const squared = leftRadius ** 2 + rightRadius ** 2 - 2 * leftRadius * rightRadius * cosine
    minimumSquared = Math.min(minimumSquared, Math.max(0, squared))
  }

  // The convex quadratic reaches its rectangle-constrained minimum at a corner or
  // at the projection of one interval endpoint onto the other radial segment.
  consider(leftMinimum, clampToRange(leftMinimum * cosine, rightMinimum, rightMaximum))
  consider(leftMaximum, clampToRange(leftMaximum * cosine, rightMinimum, rightMaximum))
  consider(clampToRange(rightMinimum * cosine, leftMinimum, leftMaximum), rightMinimum)
  consider(clampToRange(rightMaximum * cosine, leftMinimum, leftMaximum), rightMaximum)
  return Math.sqrt(minimumSquared)
}

/** Positive values are penetration; zero means the glyphs/capsules are separate. */
export function forcePairPenetration(
  left: ForceRelaxationNode,
  right: ForceRelaxationNode,
  padding = 0,
): number {
  return Math.max(
    0,
    left.collisionRadius + right.collisionRadius + Math.max(0, padding)
      - radialSegmentDistance(left, right),
  )
}

/** Visible-glyph penetration, excluding optional selection influence and padding. */
export function forceGlyphPairPenetration(
  left: ForceRelaxationNode,
  right: ForceRelaxationNode,
): number {
  return Math.max(0, left.glyphRadius + right.glyphRadius - radialSegmentDistance(left, right))
}

function overlapMetrics(
  nodes: readonly ForceRelaxationNode[],
  padding: number,
  visibleGlyphs = false,
): ForceOverlapMetrics {
  let count = 0
  let total = 0
  let maximum = 0
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    if (!left) continue
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]
      if (!right) continue
      const penetration = visibleGlyphs
        ? forceGlyphPairPenetration(left, right)
        : forcePairPenetration(left, right, padding)
      if (penetration > 1e-9) {
        count += 1
        total += penetration
        maximum = Math.max(maximum, penetration)
      }
    }
  }
  return { count, total, maximum }
}

/** Padded clearance diagnostics for a complete immutable solver snapshot. */
export function measureForceRelaxationOverlaps(
  state: ForceRelaxationState,
  padding = state.options.collisionPadding,
): ForceOverlapMetrics {
  return overlapMetrics(Object.values(state.nodes), Math.max(0, padding))
}

function renderedRelaxationNode(
  node: ForceRelaxationNode,
  center: Point,
  angleOffset: number,
  angularVelocity: number,
  radialOffset = node.radialOffset,
  radialVelocity = node.radialVelocity,
): ForceRelaxationNode {
  const renderAngle = normalizeAngle(node.anchorAngle + angleOffset)
  const renderRadius = node.anchorRadius + radialOffset
  const point = polarToCartesian(center.x, center.y, renderRadius, renderAngle)
  return { ...node, angleOffset, angularVelocity, radialOffset, radialVelocity, renderAngle, x: point.x, y: point.y }
}

interface PackingScore {
  maximumGlyphPenetration: number
  glyphOverlapCount: number
  glyphTotalPenetration: number
  maximumPenetration: number
  overlapCount: number
  totalPenetration: number
  driftCost: number
}

function candidateIsBetter(candidate: PackingScore, current: PackingScore | undefined): boolean {
  if (!current) return true
  const epsilon = 1e-7
  // Visible glyph/capsule separation is the hard feasibility objective. Expanded
  // collision radii encode a selected-node influence field and remain a secondary
  // spacing objective, so they may never make the packer accept visible overlap.
  if (candidate.maximumGlyphPenetration < current.maximumGlyphPenetration - epsilon) return true
  if (candidate.maximumGlyphPenetration > current.maximumGlyphPenetration + epsilon) return false
  if (candidate.glyphOverlapCount !== current.glyphOverlapCount) return candidate.glyphOverlapCount < current.glyphOverlapCount
  if (candidate.glyphTotalPenetration < current.glyphTotalPenetration - epsilon) return true
  if (candidate.glyphTotalPenetration > current.glyphTotalPenetration + epsilon) return false
  if (candidate.maximumPenetration < current.maximumPenetration - epsilon) return true
  if (candidate.maximumPenetration > current.maximumPenetration + epsilon) return false
  if (candidate.overlapCount !== current.overlapCount) return candidate.overlapCount < current.overlapCount
  if (candidate.totalPenetration < current.totalPenetration - epsilon) return true
  if (candidate.totalPenetration > current.totalPenetration + epsilon) return false
  return candidate.driftCost < current.driftCost - epsilon
}

function packingScore(
  offsets: readonly number[],
  radialOffsets: readonly number[],
  nodes: readonly ForceRelaxationNode[],
  options: ResolvedForceRelaxationOptions,
  parentIndices: readonly number[] = [],
): PackingScore {
  let maximumGlyphPenetration = 0
  let glyphOverlapCount = 0
  let glyphTotalPenetration = 0
  let maximumPenetration = 0
  let overlapCount = 0
  let totalPenetration = 0
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    if (!left) continue
    const leftAngle = left.anchorAngle + (offsets[leftIndex] ?? 0)
    const leftRadialOffset = radialOffsets[leftIndex] ?? 0
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]
      if (!right) continue
      const distance = radialSegmentDistanceAt(
        left,
        right,
        leftAngle,
        right.anchorAngle + (offsets[rightIndex] ?? 0),
        leftRadialOffset,
        radialOffsets[rightIndex] ?? 0,
      )
      const penetration = Math.max(
        0,
        left.collisionRadius + right.collisionRadius + options.collisionPadding - distance,
      )
      const glyphPenetration = Math.max(0, left.glyphRadius + right.glyphRadius - distance)
      maximumGlyphPenetration = Math.max(maximumGlyphPenetration, glyphPenetration)
      if (glyphPenetration > 1e-9) glyphOverlapCount += 1
      glyphTotalPenetration += glyphPenetration
      maximumPenetration = Math.max(maximumPenetration, penetration)
      if (penetration > options.overlapTolerance) overlapCount += 1
      totalPenetration += penetration
    }
  }
  const driftCost = nodes.reduce((sum, node, index) => {
    const offset = offsets[index] ?? 0
    const radialOffset = radialOffsets[index] ?? 0
    const parentIndex = parentIndices[index] ?? -1
    const parentOffset = parentIndex < 0 ? undefined : offsets[parentIndex]
    return sum + offset ** 2 + radialOffset ** 2 * 0.0001
      + (parentOffset === undefined ? 0 : (offset - parentOffset) ** 2 * 0.2)
  }, 0)
  return {
    maximumGlyphPenetration,
    glyphOverlapCount,
    glyphTotalPenetration,
    maximumPenetration,
    overlapCount,
    totalPenetration,
    driftCost,
  }
}

function packingScoreForCandidate(
  candidateIndex: number,
  candidateAngleOffset: number,
  candidateRadialOffset: number,
  offsets: readonly number[],
  radialOffsets: readonly number[],
  nodes: readonly ForceRelaxationNode[],
  options: ResolvedForceRelaxationOptions,
  parentIndices: readonly number[],
  unaffected: Pick<
    PackingScore,
    | 'maximumGlyphPenetration'
    | 'glyphOverlapCount'
    | 'glyphTotalPenetration'
    | 'maximumPenetration'
    | 'overlapCount'
    | 'totalPenetration'
  >,
): PackingScore {
  const candidate = nodes[candidateIndex]
  if (!candidate) return packingScore(offsets, radialOffsets, nodes, options, parentIndices)
  let maximumGlyphPenetration = unaffected.maximumGlyphPenetration
  let glyphOverlapCount = unaffected.glyphOverlapCount
  let glyphTotalPenetration = unaffected.glyphTotalPenetration
  let maximumPenetration = unaffected.maximumPenetration
  let overlapCount = unaffected.overlapCount
  let totalPenetration = unaffected.totalPenetration
  for (let otherIndex = 0; otherIndex < nodes.length; otherIndex += 1) {
    const other = nodes[otherIndex]
    if (!other || otherIndex === candidateIndex) continue
    const distance = radialSegmentDistanceAt(
      candidate,
      other,
      candidate.anchorAngle + candidateAngleOffset,
      other.anchorAngle + (offsets[otherIndex] ?? 0),
      candidateRadialOffset,
      radialOffsets[otherIndex] ?? 0,
    )
    const penetration = Math.max(
      0,
      candidate.collisionRadius + other.collisionRadius + options.collisionPadding - distance,
    )
    const glyphPenetration = Math.max(0, candidate.glyphRadius + other.glyphRadius - distance)
    maximumGlyphPenetration = Math.max(maximumGlyphPenetration, glyphPenetration)
    if (glyphPenetration > 1e-9) glyphOverlapCount += 1
    glyphTotalPenetration += glyphPenetration
    maximumPenetration = Math.max(maximumPenetration, penetration)
    if (penetration > options.overlapTolerance) overlapCount += 1
    totalPenetration += penetration
  }
  let driftCost = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const offset = index === candidateIndex ? candidateAngleOffset : offsets[index] ?? 0
    const radialOffset = index === candidateIndex ? candidateRadialOffset : radialOffsets[index] ?? 0
    const parentIndex = parentIndices[index] ?? -1
    const parentOffset = parentIndex < 0
      ? undefined
      : parentIndex === candidateIndex
        ? candidateAngleOffset
        : offsets[parentIndex]
    driftCost += offset ** 2 + radialOffset ** 2 * 0.0001
      + (parentOffset === undefined ? 0 : (offset - parentOffset) ** 2 * 0.2)
  }
  return {
    maximumGlyphPenetration,
    glyphOverlapCount,
    glyphTotalPenetration,
    maximumPenetration,
    overlapCount,
    totalPenetration,
    driftCost,
  }
}

function packingScoreWithoutNode(
  excludedIndex: number,
  offsets: readonly number[],
  radialOffsets: readonly number[],
  nodes: readonly ForceRelaxationNode[],
  options: ResolvedForceRelaxationOptions,
): Pick<
  PackingScore,
  | 'maximumGlyphPenetration'
  | 'glyphOverlapCount'
  | 'glyphTotalPenetration'
  | 'maximumPenetration'
  | 'overlapCount'
  | 'totalPenetration'
> {
  let maximumGlyphPenetration = 0
  let glyphOverlapCount = 0
  let glyphTotalPenetration = 0
  let maximumPenetration = 0
  let overlapCount = 0
  let totalPenetration = 0
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    if (!left || leftIndex === excludedIndex) continue
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]
      if (!right || rightIndex === excludedIndex) continue
      const distance = radialSegmentDistanceAt(
        left,
        right,
        left.anchorAngle + (offsets[leftIndex] ?? 0),
        right.anchorAngle + (offsets[rightIndex] ?? 0),
        radialOffsets[leftIndex] ?? 0,
        radialOffsets[rightIndex] ?? 0,
      )
      const penetration = Math.max(
        0,
        left.collisionRadius + right.collisionRadius + options.collisionPadding - distance,
      )
      const glyphPenetration = Math.max(0, left.glyphRadius + right.glyphRadius - distance)
      maximumGlyphPenetration = Math.max(maximumGlyphPenetration, glyphPenetration)
      if (glyphPenetration > 1e-9) glyphOverlapCount += 1
      glyphTotalPenetration += glyphPenetration
      maximumPenetration = Math.max(maximumPenetration, penetration)
      if (penetration > options.overlapTolerance) overlapCount += 1
      totalPenetration += penetration
    }
  }
  return {
    maximumGlyphPenetration,
    glyphOverlapCount,
    glyphTotalPenetration,
    maximumPenetration,
    overlapCount,
    totalPenetration,
  }
}

function minimumAngularSeparationForPair(
  left: ForceRelaxationNode,
  right: ForceRelaxationNode,
  requiredDistance: number,
  leftRadialOffset = 0,
  rightRadialOffset = 0,
): number {
  if (radialSegmentDistanceAt(left, right, 0, 0, leftRadialOffset, rightRadialOffset) >= requiredDistance) return 0
  if (radialSegmentDistanceAt(left, right, 0, Math.PI, leftRadialOffset, rightRadialOffset) < requiredDistance) return Math.PI
  let lower = 0
  let upper = Math.PI
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const midpoint = (lower + upper) / 2
    if (radialSegmentDistanceAt(left, right, 0, midpoint, leftRadialOffset, rightRadialOffset) < requiredDistance) lower = midpoint
    else upper = midpoint
  }
  return upper
}

function uniqueBoundedValues(values: readonly number[], bound: number): number[] {
  return [...new Set(values.map((value) => clampToRange(value, -bound, bound).toFixed(8)))]
    .map(Number)
    .sort((left, right) => left - right)
}

function optimisePrimaryStream(
  nodes: readonly ForceRelaxationNode[],
  options: ResolvedForceRelaxationOptions,
): number[] {
  if (nodes.length === 0) return []
  const laneCenter = circularMean(nodes.map((node) => node.anchorAngle))
  const order = nodes.map((_, index) => index).sort((left, right) =>
    shortestAngleDelta(
      laneCenter,
      (nodes[left]?.anchorAngle ?? 0) + (nodes[left]?.pinned ? nodes[left]?.targetAngleOffset ?? 0 : 0),
    )
      - shortestAngleDelta(
        laneCenter,
        (nodes[right]?.anchorAngle ?? 0) + (nodes[right]?.pinned ? nodes[right]?.targetAngleOffset ?? 0 : 0),
      )
      || (nodes[left]?.nodeId ?? '').localeCompare(nodes[right]?.nodeId ?? ''))
  const anchors = nodes.map((node) => shortestAngleDelta(laneCenter, node.anchorAngle))
  const lower = nodes.map((node, index) => node.pinned
    ? (anchors[index] ?? 0) + node.targetAngleOffset
    : (anchors[index] ?? 0) - node.maxAngleOffset)
  const upper = nodes.map((node, index) => node.pinned
    ? (anchors[index] ?? 0) + node.targetAngleOffset
    : (anchors[index] ?? 0) + node.maxAngleOffset)

  const earliestFeasible = (allowedPenetration: number): number[] | undefined => {
    const positions = nodes.map(() => 0)
    for (let currentOrder = 0; currentOrder < order.length; currentOrder += 1) {
      const currentIndex = order[currentOrder]
      const current = currentIndex === undefined ? undefined : nodes[currentIndex]
      if (!current || currentIndex === undefined) continue
      let position = lower[currentIndex] ?? 0
      for (let priorOrder = 0; priorOrder < currentOrder; priorOrder += 1) {
        const priorIndex = order[priorOrder]
        const prior = priorIndex === undefined ? undefined : nodes[priorIndex]
        if (!prior || priorIndex === undefined) continue
        const requiredDistance = Math.max(
          prior.glyphRadius + current.glyphRadius + options.overlapTolerance,
          prior.collisionRadius + current.collisionRadius + options.collisionPadding - allowedPenetration,
        )
        const gap = minimumAngularSeparationForPair(prior, current, requiredDistance)
        position = Math.max(position, (positions[priorIndex] ?? 0) + gap)
      }
      if (position > (upper[currentIndex] ?? 0) + 1e-9) return undefined
      positions[currentIndex] = position
    }
    return positions
  }

  let allowedPenetration = 0
  if (!earliestFeasible(0)) {
    let lowerPenetration = 0
    let upperPenetration = nodes.reduce((maximum, left, leftIndex) =>
      Math.max(maximum, ...nodes.slice(leftIndex + 1).map((right) =>
        left.collisionRadius + right.collisionRadius + options.collisionPadding)), 0)
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const midpoint = (lowerPenetration + upperPenetration) / 2
      if (earliestFeasible(midpoint)) upperPenetration = midpoint
      else lowerPenetration = midpoint
    }
    allowedPenetration = upperPenetration
  }

  const feasibilitySlack = allowedPenetration + 1e-6
  const latest = [...upper]
  for (let currentOrder = order.length - 1; currentOrder >= 0; currentOrder -= 1) {
    const currentIndex = order[currentOrder]
    const current = currentIndex === undefined ? undefined : nodes[currentIndex]
    if (!current || currentIndex === undefined) continue
    for (let laterOrder = currentOrder + 1; laterOrder < order.length; laterOrder += 1) {
      const laterIndex = order[laterOrder]
      const later = laterIndex === undefined ? undefined : nodes[laterIndex]
      if (!later || laterIndex === undefined) continue
      const requiredDistance = Math.max(
        current.glyphRadius + later.glyphRadius + options.overlapTolerance,
        current.collisionRadius + later.collisionRadius + options.collisionPadding - feasibilitySlack,
      )
      const gap = minimumAngularSeparationForPair(current, later, requiredDistance)
      latest[currentIndex] = Math.min(latest[currentIndex] ?? 0, (latest[laterIndex] ?? 0) - gap)
    }
  }

  const chosen = nodes.map(() => 0)
  for (let currentOrder = 0; currentOrder < order.length; currentOrder += 1) {
    const currentIndex = order[currentOrder]
    const current = currentIndex === undefined ? undefined : nodes[currentIndex]
    if (!current || currentIndex === undefined) continue
    let feasibleLower = lower[currentIndex] ?? 0
    for (let priorOrder = 0; priorOrder < currentOrder; priorOrder += 1) {
      const priorIndex = order[priorOrder]
      const prior = priorIndex === undefined ? undefined : nodes[priorIndex]
      if (!prior || priorIndex === undefined) continue
      const requiredDistance = Math.max(
        prior.glyphRadius + current.glyphRadius + options.overlapTolerance,
        prior.collisionRadius + current.collisionRadius + options.collisionPadding - feasibilitySlack,
      )
      const gap = minimumAngularSeparationForPair(prior, current, requiredDistance)
      feasibleLower = Math.max(feasibleLower, (chosen[priorIndex] ?? 0) + gap)
    }
    chosen[currentIndex] = clampToRange(
      anchors[currentIndex] ?? 0,
      feasibleLower,
      Math.max(feasibleLower, latest[currentIndex] ?? upper[currentIndex] ?? feasibleLower),
    )
  }
  return chosen.map((position, index) => clampToRange(
    position - (anchors[index] ?? 0),
    -(nodes[index]?.maxAngleOffset ?? 0),
    nodes[index]?.maxAngleOffset ?? 0,
  ))
}

function optimiseSatellites(
  streamNodes: readonly ForceRelaxationNode[],
  options: ResolvedForceRelaxationOptions,
): { offsets: number[]; radialOffsets: number[] } {
  const offsets = streamNodes.map((node) => node.targetAngleOffset)
  const radialOffsets = streamNodes.map((node) => node.pinned ? node.targetRadialOffset : 0)
  const indexById = new Map(streamNodes.map((node, index) => [node.nodeId, index]))
  const parentIndices = streamNodes.map((node) => {
    const parentId = node.satelliteOfNodeId ?? node.parentNodeId
    return parentId ? indexById.get(parentId) ?? -1 : -1
  })
  let currentScore = packingScore(offsets, radialOffsets, streamNodes, options, parentIndices)
  const satellites = streamNodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.satelliteOfNodeId && !node.pinned)
    .sort((left, right) => left.node.nodeId.localeCompare(right.node.nodeId))
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false
    for (const { node, index } of satellites) {
      const parentIndex = node.satelliteOfNodeId ? indexById.get(node.satelliteOfNodeId) : undefined
      const angleValues = [
        offsets[index] ?? 0,
        parentIndex === undefined ? 0 : offsets[parentIndex] ?? 0,
        0,
        -node.maxAngleOffset,
        node.maxAngleOffset,
      ]
      for (let grid = 1; grid < 8; grid += 1) {
        angleValues.push(-node.maxAngleOffset + (2 * node.maxAngleOffset * grid) / 8)
      }
      const radialValues: number[] = []
      for (let radial = -options.maxSatelliteRadialDrift; radial <= options.maxSatelliteRadialDrift + 1e-8; radial += 4) {
        radialValues.push(radial)
      }
      radialValues.push(radialOffsets[index] ?? 0, 0)
      const previousAngle = offsets[index] ?? 0
      const previousRadial = radialOffsets[index] ?? 0
      const unaffected = packingScoreWithoutNode(index, offsets, radialOffsets, streamNodes, options)
      let bestAngle = previousAngle
      let bestRadial = previousRadial
      let bestScore = currentScore
      const boundedAngles = uniqueBoundedValues(angleValues, node.maxAngleOffset)
      const boundedRadials = uniqueBoundedValues(radialValues, options.maxSatelliteRadialDrift)
      for (const angle of boundedAngles) {
        for (const radial of boundedRadials) {
          offsets[index] = angle
          radialOffsets[index] = radial
          const candidate = packingScoreForCandidate(
            index,
            angle,
            radial,
            offsets,
            radialOffsets,
            streamNodes,
            options,
            parentIndices,
            unaffected,
          )
          if (candidateIsBetter(candidate, bestScore)) {
            bestScore = candidate
            bestAngle = angle
            bestRadial = radial
          }
        }
      }
      offsets[index] = bestAngle
      radialOffsets[index] = bestRadial
      if (Math.abs(bestAngle - previousAngle) > 1e-9 || Math.abs(bestRadial - previousRadial) > 1e-9) {
        currentScore = bestScore
        changed = true
      }
    }
    if (!changed) break
  }
  return { offsets, radialOffsets }
}

function planPackedTargetOffsets(
  sourceNodes: Record<string, ForceRelaxationNode>,
  _center: Point,
  options: ResolvedForceRelaxationOptions,
): Record<string, ForceRelaxationNode> {
  const byStream = new Map<string, ForceRelaxationNode[]>()
  for (const node of Object.values(sourceNodes).sort((left, right) => left.nodeId.localeCompare(right.nodeId))) {
    byStream.set(node.workstreamId, [...(byStream.get(node.workstreamId) ?? []), node])
  }
  const result = { ...sourceNodes }
  for (const streamNodes of byStream.values()) {
    const primaries = streamNodes.filter((node) => !node.satelliteOfNodeId)
    const primaryOffsets = optimisePrimaryStream(primaries, options)
    for (let index = 0; index < primaries.length; index += 1) {
      const node = primaries[index]
      if (!node) continue
      result[node.nodeId] = { ...result[node.nodeId] as ForceRelaxationNode, targetAngleOffset: primaryOffsets[index] ?? 0 }
    }
    const targetedStream = streamNodes.map((node) => result[node.nodeId] as ForceRelaxationNode)
    const satelliteTargets = optimiseSatellites(targetedStream, options)
    for (let index = 0; index < targetedStream.length; index += 1) {
      const node = targetedStream[index]
      if (!node) continue
      result[node.nodeId] = {
        ...node,
        targetAngleOffset: satelliteTargets.offsets[index] ?? node.targetAngleOffset,
        targetRadialOffset: node.satelliteOfNodeId ? satelliteTargets.radialOffsets[index] ?? 0 : 0,
      }
    }
  }
  return result
}

export function createForceRelaxation(
  layout: GraphLayout,
  nodes: readonly WorkNode[],
  options: ForceRelaxationOptions = {},
): ForceRelaxationState {
  const resolved = resolveForceRelaxationOptions(options)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const laneAngles = new Map<string, number[]>()
  for (const node of nodes) {
    if (node.satelliteOfNodeId) continue
    const position = layout.positions[node.id]
    if (!position) continue
    laneAngles.set(node.workstreamId, [...(laneAngles.get(node.workstreamId) ?? []), position.angle])
  }
  const laneCenters = new Map(
    [...laneAngles.entries()].map(([workstreamId, angles]) => [workstreamId, circularMean(angles)]),
  )
  const allLaneCenters = [...laneCenters.entries()]
  const physicsNodes: Record<string, ForceRelaxationNode> = {}

  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    const position = layout.positions[node.id]
    if (!position) continue
    const laneCenter = laneCenters.get(node.workstreamId) ?? position.angle
    let nearestLaneGap = Number.POSITIVE_INFINITY
    for (const [otherWorkstreamId, otherAngle] of allLaneCenters) {
      if (otherWorkstreamId === node.workstreamId) continue
      nearestLaneGap = Math.min(nearestLaneGap, Math.abs(shortestAngleDelta(laneCenter, otherAngle)))
    }
    const anchorRadius = (position.startRadius + position.endRadius) / 2
    const corridorCap = Number.isFinite(nearestLaneGap) ? nearestLaneGap * 0.25 : resolved.maxAngularDrift
    const maxAngleOffset = Math.min(resolved.maxAngularDrift, 30 / Math.max(1, anchorRadius), corridorCap)
    const requestedPin = resolved.pinnedOffsets[node.id]
    const pinnedOffset = requestedPin
      ? clampManualNodeOffset(
        { maxAngleOffset, satelliteOfNodeId: node.satelliteOfNodeId },
        requestedPin,
        resolved.maxSatelliteRadialDrift,
      )
      : undefined
    const anchor = polarToCartesian(layout.center.x, layout.center.y, anchorRadius, position.angle)
    const requestedCollisionRadius = Math.max(
      0.1,
      resolved.collisionRadii[node.id] ?? resolved.collisionRadius,
    )
    const glyphRadius = Math.max(
      0.1,
      resolved.glyphRadii[node.id] ?? requestedCollisionRadius,
    )
    physicsNodes[node.id] = {
      nodeId: node.id,
      workstreamId: node.workstreamId,
      parentNodeId: node.parentNodeId && nodeById.has(node.parentNodeId) ? node.parentNodeId : undefined,
      satelliteOfNodeId: node.satelliteOfNodeId && nodeById.has(node.satelliteOfNodeId) ? node.satelliteOfNodeId : undefined,
      anchorX: anchor.x,
      anchorY: anchor.y,
      anchorAngle: position.angle,
      anchorRadius,
      startRadius: position.startRadius,
      endRadius: position.endRadius,
      collisionRadius: Math.max(requestedCollisionRadius, glyphRadius),
      glyphRadius,
      pinned: Boolean(pinnedOffset),
      maxAngleOffset,
      angleOffset: 0,
      targetAngleOffset: pinnedOffset?.angleOffset ?? 0,
      angularVelocity: 0,
      radialOffset: 0,
      targetRadialOffset: pinnedOffset?.radialOffset ?? 0,
      radialVelocity: 0,
      renderAngle: position.angle,
      x: anchor.x,
      y: anchor.y,
    }
  }

  const plannedNodes = planPackedTargetOffsets(physicsNodes, layout.center, resolved)
  const ordered = Object.values(plannedNodes)
  const overlaps = overlapMetrics(ordered, resolved.collisionPadding)
  const glyphOverlaps = overlapMetrics(ordered, 0, true)
  return {
    nodes: plannedNodes,
    center: { ...layout.center },
    options: resolved,
    layoutKey: forceRelaxationKey(layout, nodes, options),
    step: 0,
    alpha: 1,
    maxMotion: 0,
    maxSpeed: 0,
    stableSteps: 0,
    initialOverlapCount: overlaps.count,
    overlapCount: overlaps.count,
    totalOverlap: overlaps.total,
    maximumOverlap: overlaps.maximum,
    initialGlyphOverlapCount: glyphOverlaps.count,
    glyphOverlapCount: glyphOverlaps.count,
    glyphTotalOverlap: glyphOverlaps.total,
    maximumGlyphOverlap: glyphOverlaps.maximum,
    stopped: false,
    converged: false,
    stopReason: 'running',
  }
}

/**
 * Recompute deterministic targets while preserving the currently rendered geometry
 * for nodes that still exist. This is the selection/filter warm-start path: it
 * restarts convergence metadata without snapping retained nodes to semantic anchors.
 */
export function retargetForceRelaxation(
  previousState: ForceRelaxationState,
  layout: GraphLayout,
  nodes: readonly WorkNode[],
  options: ForceRelaxationOptions = {},
): ForceRelaxationState {
  const fresh = createForceRelaxation(layout, nodes, options)
  const warmedNodes: Record<string, ForceRelaxationNode> = {}
  for (const freshNode of Object.values(fresh.nodes).sort((left, right) => left.nodeId.localeCompare(right.nodeId))) {
    const previous = previousState.nodes[freshNode.nodeId]
    if (!previous) {
      warmedNodes[freshNode.nodeId] = freshNode
      continue
    }
    const angleOffset = clampToRange(
      previous.angleOffset,
      -freshNode.maxAngleOffset,
      freshNode.maxAngleOffset,
    )
    const maxAngularVelocity = fresh.options.maxVelocity / Math.max(1, freshNode.anchorRadius)
    const angularVelocity = clampToRange(previous.angularVelocity, -maxAngularVelocity, maxAngularVelocity)
    const radialOffset = freshNode.satelliteOfNodeId
      ? clampToRange(
        previous.radialOffset,
        -fresh.options.maxSatelliteRadialDrift,
        fresh.options.maxSatelliteRadialDrift,
      )
      : 0
    const radialVelocity = freshNode.satelliteOfNodeId
      ? clampToRange(previous.radialVelocity, -fresh.options.maxVelocity, fresh.options.maxVelocity)
      : 0
    warmedNodes[freshNode.nodeId] = renderedRelaxationNode(
      freshNode,
      fresh.center,
      angleOffset,
      angularVelocity,
      radialOffset,
      radialVelocity,
    )
  }
  const warmed = Object.values(warmedNodes)
  const overlaps = overlapMetrics(warmed, fresh.options.collisionPadding)
  const glyphOverlaps = overlapMetrics(warmed, 0, true)
  return {
    ...fresh,
    nodes: warmedNodes,
    step: 0,
    alpha: 1,
    maxMotion: 0,
    maxSpeed: 0,
    stableSteps: 0,
    initialOverlapCount: overlaps.count,
    overlapCount: overlaps.count,
    totalOverlap: overlaps.total,
    maximumOverlap: overlaps.maximum,
    initialGlyphOverlapCount: glyphOverlaps.count,
    glyphOverlapCount: glyphOverlaps.count,
    glyphTotalOverlap: glyphOverlaps.total,
    maximumGlyphOverlap: glyphOverlaps.maximum,
    stopped: false,
    converged: false,
    stopReason: 'running',
  }
}

interface CollisionProjectionResult {
  nodes: Record<string, ForceRelaxationNode>
  maximumFeasiblePenetration: number
}

/**
 * Position-based angular constraints prevent the damped force pass from settling in
 * a penetrated local equilibrium. Every correction remains on the semantic radius,
 * inside the node's angular corridor, and within one max-velocity budget per step.
 */
function projectAngularCollisions(
  sourceNodes: Record<string, ForceRelaxationNode>,
  center: Point,
  options: ResolvedForceRelaxationOptions,
  baselineOffsets: ReadonlyMap<string, number>,
): CollisionProjectionResult {
  let nodes = { ...sourceNodes }
  const startingOffsets = new Map(Object.values(nodes).map((node) => [
    node.nodeId,
    baselineOffsets.get(node.nodeId) ?? node.angleOffset,
  ]))
  let maximumFeasiblePenetration = 0

  for (let iteration = 0; iteration < options.collisionIterations; iteration += 1) {
    const ordered = Object.values(nodes).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    const pairs: Array<{ leftId: string; rightId: string; penetration: number }> = []
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      const left = ordered[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
        const right = ordered[rightIndex]
        if (!right) continue
        const penetration = forcePairPenetration(left, right, options.collisionPadding)
        if (penetration > options.overlapTolerance) pairs.push({ leftId: left.nodeId, rightId: right.nodeId, penetration })
      }
    }
    if (pairs.length === 0) break
    pairs.sort((left, right) => right.penetration - left.penetration
      || left.leftId.localeCompare(right.leftId)
      || left.rightId.localeCompare(right.rightId))

    let changed = false
    for (const pair of pairs) {
      const left = nodes[pair.leftId]
      const right = nodes[pair.rightId]
      if (!left || !right) continue
      const requiredDistance = left.collisionRadius + right.collisionRadius + options.collisionPadding
      const requiredAngle = minimumAngularSeparationForPair(
        left,
        right,
        requiredDistance,
        left.radialOffset,
        right.radialOffset,
      )
      const currentDifference = shortestAngleDelta(left.renderAngle, right.renderAngle)
      const missingAngle = requiredAngle - Math.abs(currentDifference)
      if (missingAngle <= 1e-8) continue

      const anchorDifference = shortestAngleDelta(left.anchorAngle, right.anchorAngle)
      const direction = Math.abs(currentDifference) > 1e-7
        ? Math.sign(currentDifference)
        : Math.abs(anchorDifference) > 1e-7
          ? Math.sign(anchorDifference)
          : 1
      const leftStart = startingOffsets.get(left.nodeId) ?? left.angleOffset
      const rightStart = startingOffsets.get(right.nodeId) ?? right.angleOffset
      const leftStepBudget = options.maxVelocity / Math.max(1, left.anchorRadius)
      const rightStepBudget = options.maxVelocity / Math.max(1, right.anchorRadius)
      const leftBoundAvailability = direction > 0
        ? left.angleOffset + left.maxAngleOffset
        : left.maxAngleOffset - left.angleOffset
      const rightBoundAvailability = direction > 0
        ? right.maxAngleOffset - right.angleOffset
        : right.angleOffset + right.maxAngleOffset
      const leftStepAvailability = Math.max(0, leftStepBudget - Math.abs(left.angleOffset - leftStart))
      const rightStepAvailability = Math.max(0, rightStepBudget - Math.abs(right.angleOffset - rightStart))
      const leftAvailability = left.pinned ? 0 : Math.min(leftBoundAvailability, leftStepAvailability)
      const rightAvailability = right.pinned ? 0 : Math.min(rightBoundAvailability, rightStepAvailability)
      let leftMove = Math.min(missingAngle / 2, leftAvailability)
      let rightMove = Math.min(missingAngle - leftMove, rightAvailability)
      leftMove += Math.min(missingAngle - leftMove - rightMove, leftAvailability - leftMove)
      if (leftMove + rightMove <= 1e-10) {
        maximumFeasiblePenetration = Math.max(maximumFeasiblePenetration, pair.penetration)
        continue
      }

      const leftOffset = left.angleOffset - direction * leftMove
      const rightOffset = right.angleOffset + direction * rightMove
      nodes[left.nodeId] = renderedRelaxationNode(left, center, leftOffset, left.angularVelocity)
      nodes[right.nodeId] = renderedRelaxationNode(right, center, rightOffset, right.angularVelocity)
      changed = true
    }
    if (!changed) break
  }

  return { nodes, maximumFeasiblePenetration }
}

function advanceForceRelaxationOnce(state: ForceRelaxationState): ForceRelaxationState {
  if (state.stopped) return state
  const ordered = Object.values(state.nodes).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  const acceleration = new Map(ordered.map((node) => [
    node.nodeId,
    (node.pinned ? 0 : -node.angleOffset * state.options.anchorStrength)
      + (node.targetAngleOffset - node.angleOffset) * state.options.targetStrength,
  ]))
  const activelyResolvingCollisions = state.step < Math.min(3, Math.floor(state.options.maxSteps / 4))

  if (activelyResolvingCollisions) {
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      const left = ordered[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
        const right = ordered[rightIndex]
        if (!right) continue
        const overlap = forcePairPenetration(left, right, state.options.collisionPadding)
        if (overlap <= 0) continue

        const force = overlap * state.options.repulsionStrength * state.alpha
        const currentDifference = shortestAngleDelta(left.renderAngle, right.renderAngle)
        const anchorDifference = shortestAngleDelta(left.anchorAngle, right.anchorAngle)
        const direction = Math.abs(currentDifference) > 1e-7
          ? Math.sign(currentDifference)
          : Math.abs(anchorDifference) > 1e-7
            ? Math.sign(anchorDifference)
            : left.nodeId.localeCompare(right.nodeId) <= 0 ? 1 : -1
        if (!left.pinned) {
          acceleration.set(
            left.nodeId,
            (acceleration.get(left.nodeId) ?? 0) - (direction * force) / Math.max(1, left.anchorRadius),
          )
        }
        if (!right.pinned) {
          acceleration.set(
            right.nodeId,
            (acceleration.get(right.nodeId) ?? 0) + (direction * force) / Math.max(1, right.anchorRadius),
          )
        }
      }
    }

    for (const child of ordered) {
      const parentId = child.satelliteOfNodeId ?? child.parentNodeId
      const parent = parentId ? state.nodes[parentId] : undefined
      if (!parent) continue
      const strength = child.satelliteOfNodeId
        ? state.options.satelliteRelationshipStrength
        : state.options.relationshipStrength
      const difference = child.angleOffset - parent.angleOffset
      if (!child.pinned) {
        acceleration.set(child.nodeId, (acceleration.get(child.nodeId) ?? 0) - difference * strength)
      }
      if (!parent.pinned) {
        acceleration.set(parent.nodeId, (acceleration.get(parent.nodeId) ?? 0) + difference * strength * 0.25)
      }
    }
  }

  let nextNodes: Record<string, ForceRelaxationNode> = {}
  for (const node of ordered) {
    const radius = Math.max(1, node.anchorRadius)
    const maxAngularVelocity = state.options.maxVelocity / radius
    let velocity = (node.angularVelocity + (acceleration.get(node.nodeId) ?? 0)) * state.options.damping
    velocity = Math.min(maxAngularVelocity, Math.max(-maxAngularVelocity, velocity))
    let angleOffset = node.angleOffset + velocity
    const boundedOffset = Math.min(node.maxAngleOffset, Math.max(-node.maxAngleOffset, angleOffset))
    if (boundedOffset !== angleOffset && Math.sign(velocity) === Math.sign(angleOffset)) velocity = 0
    angleOffset = boundedOffset
    let radialVelocity = 0
    let radialOffset = 0
    if (node.satelliteOfNodeId) {
      radialVelocity = (
        node.radialVelocity
        + (node.targetRadialOffset - node.radialOffset) * state.options.targetStrength
      ) * state.options.damping
      radialVelocity = Math.min(state.options.maxVelocity, Math.max(-state.options.maxVelocity, radialVelocity))
      radialOffset = Math.min(
        state.options.maxSatelliteRadialDrift,
        Math.max(-state.options.maxSatelliteRadialDrift, node.radialOffset + radialVelocity),
      )
    }
    const rendered = renderedRelaxationNode(
      node,
      state.center,
      angleOffset,
      velocity,
      radialOffset,
      radialVelocity,
    )
    nextNodes[node.nodeId] = rendered
  }

  const baselineOffsets = new Map(ordered.map((node) => [node.nodeId, node.angleOffset]))
  if (activelyResolvingCollisions) {
    nextNodes = projectAngularCollisions(nextNodes, state.center, state.options, baselineOffsets).nodes
  }
  let maxMotion = 0
  let maxSpeed = 0
  for (const node of ordered) {
    const projected = nextNodes[node.nodeId]
    if (!projected) continue
    const angularDelta = projected.angleOffset - node.angleOffset
    const radialDelta = projected.radialOffset - node.radialOffset
    projected.angularVelocity = angularDelta
    projected.radialVelocity = radialDelta
    const motion = Math.hypot(angularDelta * Math.max(1, node.anchorRadius), radialDelta)
    maxMotion = Math.max(maxMotion, motion)
    maxSpeed = Math.max(maxSpeed, motion)
  }

  const overlaps = overlapMetrics(Object.values(nextNodes), state.options.collisionPadding)
  const glyphOverlaps = overlapMetrics(Object.values(nextNodes), 0, true)
  const step = state.step + 1
  const alpha = Math.max(state.options.alphaMin, state.alpha * (1 - state.options.alphaDecay))
  const stable = maxMotion < state.options.motionThreshold
    && maxSpeed < state.options.velocityThreshold
    && glyphOverlaps.total <= state.options.overlapTolerance
  const stableSteps = stable ? state.stableSteps + 1 : 0
  const converged = stableSteps >= state.options.stableStepsRequired
  const reachedMaximum = step >= state.options.maxSteps
  const stopped = converged || reachedMaximum
  return {
    ...state,
    nodes: nextNodes,
    step,
    alpha,
    maxMotion,
    maxSpeed,
    stableSteps,
    overlapCount: overlaps.count,
    totalOverlap: overlaps.total,
    maximumOverlap: overlaps.maximum,
    glyphOverlapCount: glyphOverlaps.count,
    glyphTotalOverlap: glyphOverlaps.total,
    maximumGlyphOverlap: glyphOverlaps.maximum,
    stopped,
    converged,
    stopReason: converged ? 'converged' : reachedMaximum ? 'max-steps' : 'running',
  }
}

/** Advance a pure immutable snapshot; safe to call from a Pixi ticker without React state. */
export function stepForceRelaxation(state: ForceRelaxationState, steps = 1): ForceRelaxationState {
  let next = state
  const boundedSteps = Math.max(0, Math.floor(steps))
  for (let index = 0; index < boundedSteps && !next.stopped; index += 1) {
    next = advanceForceRelaxationOnce(next)
  }
  return next
}

export function runForceRelaxationToStop(state: ForceRelaxationState): ForceRelaxationState {
  let next = state
  while (!next.stopped) next = advanceForceRelaxationOnce(next)
  return next
}

export function applyForceRelaxation(layout: GraphLayout, state: ForceRelaxationState): GraphLayout {
  const positions: Record<string, GraphNodePosition> = {}
  for (const [nodeId, position] of Object.entries(layout.positions)) {
    const relaxed = state.nodes[nodeId]
    if (!relaxed) {
      positions[nodeId] = position
      continue
    }
    const radialOffset = relaxed.satelliteOfNodeId ? relaxed.radialOffset : 0
    const start = polarToCartesian(state.center.x, state.center.y, position.startRadius + radialOffset, relaxed.renderAngle)
    const end = polarToCartesian(state.center.x, state.center.y, position.endRadius + radialOffset, relaxed.renderAngle)
    positions[nodeId] = {
      ...position,
      x: end.x,
      y: end.y,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      // `angle`, `radius`, `startRadius`, and `endRadius` intentionally remain the
      // semantic anchor values used by chronology and workstream focus.
    }
  }
  return { ...layout, positions }
}

export function shouldRestartForceRelaxation(
  state: ForceRelaxationState,
  layout: GraphLayout,
  nodes: readonly WorkNode[],
  options: ForceRelaxationOptions = {},
): boolean {
  return state.layoutKey !== forceRelaxationKey(layout, nodes, options)
}

/** Exact three-o'clock focus for the currently rendered relaxed endpoint. */
export function rotationForFocusedRelaxedNode(
  node: Pick<ForceRelaxationNode, 'x' | 'y'>,
  center: Point,
  currentRotation = 0,
): number {
  return rotationForFocusedAngle(Math.atan2(node.y - center.y, node.x - center.x), currentRotation)
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  const t = Math.min(1, Math.max(0, projection))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]
    const b = polygon[previous]
    if (!a || !b) continue
    if (distanceToSegment(point, a, b) < 1e-8) return true
    const crosses = a.y > point.y !== b.y > point.y
    const intersectionX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses && point.x < intersectionX) inside = !inside
  }
  return inside
}

export function nodesInRect(
  positions: Record<string, GraphNodePosition> | readonly GraphNodePosition[],
  rect: Rect,
): string[] {
  const values = Array.isArray(positions) ? positions : Object.values(positions)
  const left = Math.min(rect.x, rect.x + rect.width)
  const right = Math.max(rect.x, rect.x + rect.width)
  const top = Math.min(rect.y, rect.y + rect.height)
  const bottom = Math.max(rect.y, rect.y + rect.height)
  return values
    .filter((position) => position.x >= left && position.x <= right && position.y >= top && position.y <= bottom)
    .map((position) => position.nodeId)
}
