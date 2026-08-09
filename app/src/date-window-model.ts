import type {
  DateWindow,
  GraphRelation,
  WorkGroup,
  WorkGroupId,
  WorkNode,
  WorkNodeId,
} from './domain'

export const UTC_DAY_MS = 24 * 60 * 60 * 1000

export interface DateWindowBounds extends DateWindow {}

export type DateWindowParseIssue =
  | 'incomplete'
  | 'invalid-date'
  | 'reversed'
  | 'out-of-bounds'

export interface ParsedDateWindow {
  window: DateWindow
  /** False when the caller should replace the URL with the returned canonical window. */
  canonical: boolean
  invalidReason?: DateWindowParseIssue
}

export interface ClippedNodeInterval {
  nodeId: WorkNodeId
  startMs: number
  endMs: number
  clippedStartMs: number
  clippedEndMs: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface ProjectedWorkGroup {
  /** The canonical group object. The projection never creates a second group identity. */
  group: WorkGroup
  visibleMemberNodeIds: readonly WorkNodeId[]
  hiddenMemberNodeIds: readonly WorkNodeId[]
  hiddenMemberCount: number
}

export interface DateWindowProjection {
  window: DateWindow
  /** Canonical node and relation objects in their original order. */
  visibleNodes: readonly WorkNode[]
  visibleRelations: readonly GraphRelation[]
  visibleNodeIds: ReadonlySet<WorkNodeId>
  hiddenNodeIds: ReadonlySet<WorkNodeId>
  clippedIntervals: ReadonlyMap<WorkNodeId, ClippedNodeInterval>
  groups: readonly ProjectedWorkGroup[]
}

interface NodeInterval {
  startMs: number
  endMs: number
}

function finiteTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function nodeInterval(node: WorkNode): NodeInterval | undefined {
  const startedAt = finiteTimestamp(node.startedAt)
  if (startedAt === undefined) return undefined
  const parsedEnd = finiteTimestamp(node.endedAt)
  const endedAt = parsedEnd === undefined ? startedAt : parsedEnd
  return {
    startMs: Math.min(startedAt, endedAt),
    endMs: Math.max(startedAt, endedAt),
  }
}

export function utcDayStart(timestampMs: number): number {
  if (!Number.isFinite(timestampMs)) return Number.NaN
  return Math.floor(timestampMs / UTC_DAY_MS) * UTC_DAY_MS
}

export function utcDayEnd(timestampMs: number): number {
  const start = utcDayStart(timestampMs)
  return Number.isFinite(start) ? start + UTC_DAY_MS - 1 : Number.NaN
}

function canonicalBounds(bounds: DateWindowBounds): DateWindowBounds {
  const startMs = utcDayStart(bounds.startMs)
  const endMs = utcDayEnd(bounds.endMs)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return { startMs: 0, endMs: UTC_DAY_MS - 1 }
  }
  return { startMs, endMs }
}

/**
 * Derives the complete temporal extent, rounded outward to inclusive UTC days.
 * Empty or wholly invalid fixtures use the UTC day containing fallbackTimestampMs.
 */
export function deriveFullDateWindow(
  nodes: readonly WorkNode[],
  fallbackTimestampMs = 0,
): DateWindowBounds {
  let earliest = Number.POSITIVE_INFINITY
  let latest = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    const startedAt = finiteTimestamp(node.startedAt)
    const endedAt = finiteTimestamp(node.endedAt)
    if (startedAt !== undefined) {
      earliest = Math.min(earliest, startedAt)
      latest = Math.max(latest, startedAt)
    }
    if (endedAt !== undefined) {
      earliest = Math.min(earliest, endedAt)
      latest = Math.max(latest, endedAt)
    }
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    const fallback = Number.isFinite(fallbackTimestampMs) ? fallbackTimestampMs : 0
    return { startMs: utcDayStart(fallback), endMs: utcDayEnd(fallback) }
  }

  return { startMs: utcDayStart(earliest), endMs: utcDayEnd(latest) }
}

/**
 * Produces an inclusive UTC-day window clamped to the available bounds.
 * Invalid or reversed input falls back to the complete bounds.
 */
export function normalizeDateWindow(
  candidate: DateWindow,
  availableBounds: DateWindowBounds,
): DateWindow {
  const bounds = canonicalBounds(availableBounds)
  if (
    !Number.isFinite(candidate.startMs)
    || !Number.isFinite(candidate.endMs)
    || candidate.startMs > candidate.endMs
  ) {
    return bounds
  }

  const startMs = Math.max(bounds.startMs, utcDayStart(candidate.startMs))
  const endMs = Math.min(bounds.endMs, utcDayEnd(candidate.endMs))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return bounds
  return { startMs, endMs }
}

export function isFullDateWindow(
  window: DateWindow,
  availableBounds: DateWindowBounds,
): boolean {
  const bounds = canonicalBounds(availableBounds)
  const normalized = normalizeDateWindow(window, bounds)
  return normalized.startMs === bounds.startMs && normalized.endMs === bounds.endMs
}

function parseIsoDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp)) return undefined
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : undefined
}

export function parseDateWindowParams(
  searchParams: URLSearchParams,
  availableBounds: DateWindowBounds,
): ParsedDateWindow {
  const bounds = canonicalBounds(availableBounds)
  const startValue = searchParams.get('windowStart')
  const endValue = searchParams.get('windowEnd')

  if (startValue === null && endValue === null) {
    return { window: bounds, canonical: true }
  }
  if (startValue === null || endValue === null) {
    return { window: bounds, canonical: false, invalidReason: 'incomplete' }
  }

  const parsedStart = parseIsoDate(startValue)
  const parsedEndDay = parseIsoDate(endValue)
  if (parsedStart === undefined || parsedEndDay === undefined) {
    return { window: bounds, canonical: false, invalidReason: 'invalid-date' }
  }

  const parsedEnd = utcDayEnd(parsedEndDay)
  if (parsedStart > parsedEnd) {
    return { window: bounds, canonical: false, invalidReason: 'reversed' }
  }
  if (parsedStart < bounds.startMs || parsedEnd > bounds.endMs) {
    return { window: bounds, canonical: false, invalidReason: 'out-of-bounds' }
  }

  const window = { startMs: parsedStart, endMs: parsedEnd }
  return {
    window,
    // A full window is canonically represented by omitting both parameters.
    canonical: !isFullDateWindow(window, bounds),
  }
}

/** Returns a new parameter object and never mutates the caller's object. */
export function writeDateWindowParams(
  searchParams: URLSearchParams,
  window: DateWindow,
  availableBounds: DateWindowBounds,
): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  const bounds = canonicalBounds(availableBounds)
  const normalized = normalizeDateWindow(window, bounds)
  if (isFullDateWindow(normalized, bounds)) {
    next.delete('windowStart')
    next.delete('windowEnd')
    return next
  }

  next.set('windowStart', new Date(normalized.startMs).toISOString().slice(0, 10))
  next.set('windowEnd', new Date(normalized.endMs).toISOString().slice(0, 10))
  return next
}

export function dateWindowDurationDays(window: DateWindow): number {
  if (
    !Number.isFinite(window.startMs)
    || !Number.isFinite(window.endMs)
    || window.startMs > window.endMs
  ) return 0
  return Math.floor((utcDayStart(window.endMs) - utcDayStart(window.startMs)) / UTC_DAY_MS) + 1
}

export function dateWindowIsoLabels(window: DateWindow): {
  start: string
  end: string
  durationDays: number
} {
  return {
    start: new Date(window.startMs).toISOString().slice(0, 10),
    end: new Date(window.endMs).toISOString().slice(0, 10),
    durationDays: dateWindowDurationDays(window),
  }
}

export function projectDateWindow(
  nodes: readonly WorkNode[],
  relations: readonly GraphRelation[],
  groups: readonly WorkGroup[],
  requestedWindow: DateWindow,
  availableBounds: DateWindowBounds = deriveFullDateWindow(nodes),
): DateWindowProjection {
  const window = normalizeDateWindow(requestedWindow, availableBounds)
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const intervalByNodeId = new Map<WorkNodeId, NodeInterval>()
  const intersectsWindow = new Set<WorkNodeId>()

  for (const node of nodes) {
    const interval = nodeInterval(node)
    if (interval === undefined) continue
    intervalByNodeId.set(node.id, interval)
    if (interval.startMs <= window.endMs && interval.endMs >= window.startMs) {
      intersectsWindow.add(node.id)
    }
  }

  const visibilityMemo = new Map<WorkNodeId, boolean>()
  const resolving = new Set<WorkNodeId>()
  const isVisible = (nodeId: WorkNodeId): boolean => {
    const memoized = visibilityMemo.get(nodeId)
    if (memoized !== undefined) return memoized
    if (!intersectsWindow.has(nodeId) || resolving.has(nodeId)) {
      visibilityMemo.set(nodeId, false)
      return false
    }

    const node = nodeById.get(nodeId)
    if (node === undefined) {
      visibilityMemo.set(nodeId, false)
      return false
    }
    if (node.satelliteOfNodeId === undefined) {
      visibilityMemo.set(nodeId, true)
      return true
    }

    resolving.add(nodeId)
    const visible = isVisible(node.satelliteOfNodeId)
    resolving.delete(nodeId)
    visibilityMemo.set(nodeId, visible)
    return visible
  }

  const visibleNodeIds = new Set<WorkNodeId>()
  const hiddenNodeIds = new Set<WorkNodeId>()
  const clippedIntervals = new Map<WorkNodeId, ClippedNodeInterval>()

  for (const node of nodes) {
    if (!isVisible(node.id)) {
      hiddenNodeIds.add(node.id)
      continue
    }
    const interval = intervalByNodeId.get(node.id)
    if (interval === undefined) {
      hiddenNodeIds.add(node.id)
      continue
    }
    visibleNodeIds.add(node.id)
    clippedIntervals.set(node.id, {
      nodeId: node.id,
      startMs: interval.startMs,
      endMs: interval.endMs,
      clippedStartMs: Math.max(interval.startMs, window.startMs),
      clippedEndMs: Math.min(interval.endMs, window.endMs),
      continuesBefore: interval.startMs < window.startMs,
      continuesAfter: interval.endMs > window.endMs,
    })
  }

  const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.id))
  const visibleRelations = relations.filter(
    (relation) => visibleNodeIds.has(relation.sourceNodeId) && visibleNodeIds.has(relation.targetNodeId),
  )
  const projectedGroups = groups.map((group): ProjectedWorkGroup => {
    const visibleMemberNodeIds = group.memberNodeIds.filter((nodeId) => visibleNodeIds.has(nodeId))
    const hiddenMemberNodeIds = group.memberNodeIds.filter((nodeId) => !visibleNodeIds.has(nodeId))
    return {
      group,
      visibleMemberNodeIds,
      hiddenMemberNodeIds,
      hiddenMemberCount: hiddenMemberNodeIds.length,
    }
  })

  return {
    window,
    visibleNodes,
    visibleRelations,
    visibleNodeIds,
    hiddenNodeIds,
    clippedIntervals,
    groups: projectedGroups,
  }
}

function addNodeAndSatelliteAncestors(
  nodeId: WorkNodeId,
  nodeById: ReadonlyMap<WorkNodeId, WorkNode>,
  included: Set<WorkNodeId>,
): void {
  if (included.has(nodeId)) return
  included.add(nodeId)
  const parentId = nodeById.get(nodeId)?.satelliteOfNodeId
  if (parentId !== undefined) addNodeAndSatelliteAncestors(parentId, nodeById, included)
}

/**
 * Expands, but never shrinks, a window to include a node's complete interval and
 * every satellite ancestor needed to make that node visible.
 */
export function revealWindowForNode(
  currentWindow: DateWindow,
  nodeId: WorkNodeId,
  nodes: readonly WorkNode[],
  availableBounds: DateWindowBounds = deriveFullDateWindow(nodes),
): DateWindow {
  const normalizedCurrent = normalizeDateWindow(currentWindow, availableBounds)
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  if (!nodeById.has(nodeId)) return normalizedCurrent

  const included = new Set<WorkNodeId>()
  addNodeAndSatelliteAncestors(nodeId, nodeById, included)
  let startMs = normalizedCurrent.startMs
  let endMs = normalizedCurrent.endMs
  for (const includedId of included) {
    const node = nodeById.get(includedId)
    const interval = node === undefined ? undefined : nodeInterval(node)
    if (interval === undefined) continue
    startMs = Math.min(startMs, interval.startMs)
    endMs = Math.max(endMs, interval.endMs)
  }
  return normalizeDateWindow({ startMs, endMs }, availableBounds)
}

/**
 * Keeps "full range" truthful as nodes are added, while preserving a deliberate
 * subset when the user had already narrowed the window.
 */
export function expandWindowAfterNodeMutation(
  previousNodes: readonly WorkNode[],
  nextNodes: readonly WorkNode[],
  previousWindow: DateWindow,
): DateWindow {
  const previousBounds = deriveFullDateWindow(previousNodes)
  const nextBounds = deriveFullDateWindow(nextNodes)
  if (isFullDateWindow(previousWindow, previousBounds)) return nextBounds
  return normalizeDateWindow(previousWindow, nextBounds)
}

export function projectedGroupById(
  projection: DateWindowProjection,
  groupId: WorkGroupId,
): ProjectedWorkGroup | undefined {
  return projection.groups.find((entry) => entry.group.id === groupId)
}
