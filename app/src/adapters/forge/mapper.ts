import type { WorkLifecycle } from '../../domain'
import {
  ForgeAdapterError,
  forgeExternalId,
  type ForgeActivityEvent,
  type ForgeActivitySource,
  type ForgeBlockerLink,
  type ForgeCloseoutState,
  type ForgeCompletionReport,
  type ForgeDeletedEntityRecord,
  type ForgeExecutionMode,
  type ForgeGitRef,
  type ForgeOwnership,
  type ForgeRawRecord,
  type ForgeResolutionKind,
  type ForgeSearchMatch,
  type ForgeSupportedEntityType,
  type ForgeTag,
  type ForgeTaskEffort,
  type ForgeTaskEnergy,
  type ForgeTaskPriority,
  type ForgeTaskTimeSummary,
  type ForgeUserSummary,
  type ForgeWorkItem,
  type ForgeWorkItemLevel,
  type ForgeWorkItemStatus,
} from './contracts'

const WORK_ITEM_LEVELS = new Set<ForgeWorkItemLevel>(['issue', 'task', 'subtask'])
const WORK_ITEM_STATUSES = new Set<ForgeWorkItemStatus>([
  'backlog',
  'focus',
  'in_progress',
  'blocked',
  'done',
])
const PRIORITIES = new Set<ForgeTaskPriority>(['low', 'medium', 'high', 'critical'])
const EFFORTS = new Set<ForgeTaskEffort>(['light', 'deep', 'marathon'])
const ENERGIES = new Set<ForgeTaskEnergy>(['low', 'steady', 'high'])
const EXECUTION_MODES = new Set<ForgeExecutionMode>(['afk', 'hitl'])
const RESOLUTION_KINDS = new Set<ForgeResolutionKind>(['completed', 'split'])
const CLOSEOUT_STATES = new Set<ForgeCloseoutState>(['not_applicable', 'complete', 'deferred'])
const ACTIVITY_SOURCES = new Set<ForgeActivitySource>(['ui', 'openclaw', 'agent', 'system'])

function cloneRaw(raw: ForgeRawRecord): ForgeRawRecord {
  return structuredClone(raw)
}

function stringValue(raw: ForgeRawRecord, key: string): string {
  const value = raw[key]
  if (typeof value !== 'string') {
    throw new ForgeAdapterError('validation_error', `Forge field “${key}” must be a string.`, { key, value })
  }
  return value
}

function nullableString(raw: ForgeRawRecord, key: string): string | null {
  const value = raw[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new ForgeAdapterError('validation_error', `Forge field “${key}” must be a string or null.`, { key, value })
  }
  return value
}

function numberValue(raw: ForgeRawRecord, key: string, fallback = 0): number {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ForgeAdapterError('validation_error', `Forge field “${key}” must be a finite number.`, { key, value })
  }
  return value
}

function stringArray(raw: ForgeRawRecord, key: string): string[] {
  const value = raw[key]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ForgeAdapterError('validation_error', `Forge field “${key}” must be a string array.`, { key, value })
  }
  return [...value]
}

function recordValue(raw: ForgeRawRecord, key: string): ForgeRawRecord {
  const value = raw[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return cloneRaw(value as ForgeRawRecord)
}

function optionalRecord(raw: ForgeRawRecord, key: string): ForgeRawRecord | null {
  if (raw[key] === null || raw[key] === undefined) return null
  return recordValue(raw, key)
}

function enumValue<T extends string>(
  raw: ForgeRawRecord,
  key: string,
  supported: ReadonlySet<T>,
): T {
  const value = raw[key]
  if (typeof value !== 'string' || !supported.has(value as T)) {
    throw new ForgeAdapterError(
      'unsupported_contract_value',
      `Forge returned unsupported ${key} “${String(value)}”.`,
      { key, value, raw: cloneRaw(raw) },
    )
  }
  return value as T
}

function decodeUser(value: unknown): ForgeUserSummary | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ForgeAdapterError('validation_error', 'Forge user summary must be an object or null.')
  }
  const raw = value as ForgeRawRecord
  const kind = raw.kind
  if (kind !== 'human' && kind !== 'bot') {
    throw new ForgeAdapterError('unsupported_contract_value', `Unsupported Forge user kind “${String(kind)}”.`, { raw })
  }
  return {
    id: stringValue(raw, 'id'),
    kind,
    handle: stringValue(raw, 'handle'),
    displayName: stringValue(raw, 'displayName'),
    description: stringValue(raw, 'description'),
    accentColor: stringValue(raw, 'accentColor'),
    createdAt: stringValue(raw, 'createdAt'),
    updatedAt: stringValue(raw, 'updatedAt'),
  }
}

function decodeUsers(value: unknown): ForgeUserSummary[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ForgeAdapterError('validation_error', 'Forge assignees must be an array.')
  return value.map(decodeUser).filter((user): user is ForgeUserSummary => user !== null)
}

function decodeOwnership(raw: ForgeRawRecord): ForgeOwnership {
  return {
    userId: nullableString(raw, 'userId'),
    user: decodeUser(raw.user),
    ownerUserId: nullableString(raw, 'ownerUserId'),
    ownerUser: decodeUser(raw.ownerUser),
    assigneeUserIds: stringArray(raw, 'assigneeUserIds'),
    assignees: decodeUsers(raw.assignees),
  }
}

function decodeBlockerLinks(value: unknown): ForgeBlockerLink[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ForgeAdapterError('validation_error', 'Forge blockerLinks must be an array.')
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ForgeAdapterError('validation_error', 'Each Forge blocker link must be an object.')
    }
    const raw = entry as ForgeRawRecord
    const label = raw.label
    return {
      entityType: stringValue(raw, 'entityType'),
      entityId: stringValue(raw, 'entityId'),
      ...(typeof label === 'string' ? { label } : {}),
    }
  })
}

function decodeCompletionReport(value: unknown): ForgeCompletionReport | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ForgeAdapterError('validation_error', 'Forge completionReport must be an object or null.')
  }
  const raw = value as ForgeRawRecord
  return {
    modifiedFiles: stringArray(raw, 'modifiedFiles'),
    workSummary: stringValue(raw, 'workSummary'),
    linkedGitRefIds: stringArray(raw, 'linkedGitRefIds'),
  }
}

function decodeGitRefs(value: unknown): ForgeGitRef[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ForgeAdapterError('validation_error', 'Forge gitRefs must be an array.')
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ForgeAdapterError('validation_error', 'Each Forge Git reference must be an object.')
    }
    const raw = entry as ForgeRawRecord
    const refType = enumValue(raw, 'refType', new Set(['commit', 'branch', 'pull_request'] as const))
    const urlSafety = enumValue(raw, 'urlSafety', new Set(['absent', 'safe', 'unsafe'] as const))
    return {
      id: stringValue(raw, 'id'),
      workItemId: stringValue(raw, 'workItemId'),
      refType,
      provider: stringValue(raw, 'provider'),
      repository: stringValue(raw, 'repository'),
      refValue: stringValue(raw, 'refValue'),
      url: nullableString(raw, 'url'),
      rawUrl: nullableString(raw, 'rawUrl'),
      urlSafety,
      displayTitle: stringValue(raw, 'displayTitle'),
      createdAt: stringValue(raw, 'createdAt'),
      updatedAt: stringValue(raw, 'updatedAt'),
    }
  })
}

function decodeTime(value: unknown): ForgeTaskTimeSummary {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ForgeRawRecord
    : {}
  return {
    totalTrackedSeconds: numberValue(raw, 'totalTrackedSeconds'),
    totalCreditedSeconds: numberValue(raw, 'totalCreditedSeconds'),
    liveTrackedSeconds: numberValue(raw, 'liveTrackedSeconds'),
    liveCreditedSeconds: numberValue(raw, 'liveCreditedSeconds'),
    manualAdjustedSeconds: numberValue(raw, 'manualAdjustedSeconds'),
    activeRunCount: numberValue(raw, 'activeRunCount'),
    hasCurrentRun: raw.hasCurrentRun === true,
    currentRunId: nullableString(raw, 'currentRunId'),
  }
}

export function decodeForgeWorkItem(rawInput: ForgeRawRecord): ForgeWorkItem {
  const raw = cloneRaw(rawInput)
  const executionMode = raw.executionMode === null || raw.executionMode === undefined
    ? null
    : enumValue(raw, 'executionMode', EXECUTION_MODES)
  const resolutionKind = raw.resolutionKind === null || raw.resolutionKind === undefined
    ? null
    : enumValue(raw, 'resolutionKind', RESOLUTION_KINDS)
  return {
    id: stringValue(raw, 'id'),
    title: stringValue(raw, 'title'),
    description: stringValue(raw, 'description'),
    level: enumValue(raw, 'level', WORK_ITEM_LEVELS),
    status: enumValue(raw, 'status', WORK_ITEM_STATUSES),
    priority: enumValue(raw, 'priority', PRIORITIES),
    owner: stringValue(raw, 'owner'),
    goalId: nullableString(raw, 'goalId'),
    projectId: nullableString(raw, 'projectId'),
    parentWorkItemId: nullableString(raw, 'parentWorkItemId'),
    dueDate: nullableString(raw, 'dueDate'),
    effort: enumValue(raw, 'effort', EFFORTS),
    energy: enumValue(raw, 'energy', ENERGIES),
    points: numberValue(raw, 'points'),
    sortOrder: numberValue(raw, 'sortOrder'),
    plannedDurationSeconds: raw.plannedDurationSeconds === null
      ? null
      : numberValue(raw, 'plannedDurationSeconds', 86_400),
    schedulingRules: optionalRecord(raw, 'schedulingRules'),
    resolutionKind,
    splitParentTaskId: nullableString(raw, 'splitParentTaskId'),
    aiInstructions: typeof raw.aiInstructions === 'string' ? raw.aiInstructions : '',
    executionMode,
    acceptanceCriteria: stringArray(raw, 'acceptanceCriteria'),
    blockerLinks: decodeBlockerLinks(raw.blockerLinks),
    completionReport: decodeCompletionReport(raw.completionReport),
    closeoutState: enumValue(raw, 'closeoutState', CLOSEOUT_STATES),
    gitRefs: decodeGitRefs(raw.gitRefs),
    completedAt: nullableString(raw, 'completedAt'),
    createdAt: stringValue(raw, 'createdAt'),
    updatedAt: stringValue(raw, 'updatedAt'),
    tagIds: stringArray(raw, 'tagIds'),
    ...decodeOwnership(raw),
    time: decodeTime(raw.time),
    raw,
  }
}

export function decodeForgeTag(rawInput: ForgeRawRecord): ForgeTag {
  const raw = cloneRaw(rawInput)
  const kind = enumValue(raw, 'kind', new Set(['value', 'category', 'execution'] as const))
  return {
    id: stringValue(raw, 'id'),
    name: stringValue(raw, 'name'),
    kind,
    color: stringValue(raw, 'color'),
    description: stringValue(raw, 'description'),
    ...decodeOwnership(raw),
    raw,
  }
}

export function decodeForgeActivity(rawInput: ForgeRawRecord): ForgeActivityEvent {
  const raw = cloneRaw(rawInput)
  const entityType = stringValue(raw, 'entityType') as ForgeActivityEvent['entityType']
  const source = enumValue(raw, 'source', ACTIVITY_SOURCES)
  return {
    id: stringValue(raw, 'id'),
    entityType,
    entityId: stringValue(raw, 'entityId'),
    eventType: stringValue(raw, 'eventType'),
    title: stringValue(raw, 'title'),
    description: stringValue(raw, 'description'),
    actor: nullableString(raw, 'actor'),
    source,
    metadata: recordValue(raw, 'metadata'),
    createdAt: stringValue(raw, 'createdAt'),
    ...decodeOwnership(raw),
    raw,
  }
}

export type ForgeWorkRole = 'work' | 'bug' | 'validation' | 'report' | 'knowledge'
export type ForgeLifecycleProjectionKind =
  | 'native'
  | 'awaiting-review-marker'
  | 'native-blocked'
  | 'abandoned-soft-delete'
  | 'unrelated-deleted'

export interface ThreadwakeForgeWorkProjection {
  externalId: string
  forgeId: string
  entityType: 'task'
  lifecycle: WorkLifecycle | null
  projectionKind: ForgeLifecycleProjectionKind
  role: ForgeWorkRole
  nativeStatus: ForgeWorkItemStatus
  nativeBlocked: boolean
  reviewMarker: 'awaiting-review' | 'awaiting-approval' | null
  deleted: boolean
  abandonmentReason: string | null
  workItem: ForgeWorkItem
  activity: ForgeActivityEvent[]
  provenance: {
    sourceRoute: '/api/v1/entities/search' | '/api/v1/work-items/:id'
    sourceActor: string | null
    adapterVersion: string
    syncedAt: string
    raw: ForgeRawRecord
  }
}

function roleFromTags(item: ForgeWorkItem, tags: ReadonlyMap<string, ForgeTag>): ForgeWorkRole {
  const names = item.tagIds
    .map((id) => tags.get(id)?.name.toLocaleLowerCase())
    .filter((name): name is string => Boolean(name))
  if (names.includes('bug')) return 'bug'
  if (names.includes('validation')) return 'validation'
  if (names.includes('report')) return 'report'
  if (names.includes('knowledge')) return 'knowledge'
  return 'work'
}

function reviewMarkerFromTags(
  item: ForgeWorkItem,
  tags: ReadonlyMap<string, ForgeTag>,
): 'awaiting-review' | 'awaiting-approval' | null {
  for (const id of item.tagIds) {
    const tag = tags.get(id)
    if (tag?.kind !== 'execution') continue
    if (tag.name === 'awaiting-review' || tag.name === 'awaiting-approval') return tag.name
  }
  return null
}

function previousStatusFromActivity(activity: readonly ForgeActivityEvent[]): ForgeWorkItemStatus | null {
  const ordered = [...activity].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  for (const event of ordered) {
    if (event.metadata.corrected === true) continue
    const value = event.metadata.previousStatus ?? event.metadata.fromStatus
    if (typeof value === 'string' && WORK_ITEM_STATUSES.has(value as ForgeWorkItemStatus)) {
      return value as ForgeWorkItemStatus
    }
  }
  return null
}

function blockedLifecycle(activity: readonly ForgeActivityEvent[]): WorkLifecycle {
  switch (previousStatusFromActivity(activity)) {
    case 'focus': return 'planned'
    case 'in_progress': return 'ongoing'
    case 'done': return 'done'
    case 'backlog':
    case 'blocked':
    default:
      return 'backlog'
  }
}

export function projectForgeLifecycle(
  item: ForgeWorkItem,
  tags: ReadonlyMap<string, ForgeTag>,
  activity: readonly ForgeActivityEvent[],
  deletedRecord: ForgeDeletedEntityRecord | undefined,
  syncedAt: string,
  adapterVersion: string,
): ThreadwakeForgeWorkProjection {
  const marker = reviewMarkerFromTags(item, tags)
  let lifecycle: WorkLifecycle | null
  let projectionKind: ForgeLifecycleProjectionKind
  let nativeBlocked = false

  if (deletedRecord) {
    if (deletedRecord.deleteReason === 'threadwake:abandoned') {
      lifecycle = 'abandoned'
      projectionKind = 'abandoned-soft-delete'
    } else {
      lifecycle = null
      projectionKind = 'unrelated-deleted'
    }
  } else if (item.status === 'blocked' && marker) {
    lifecycle = 'awaiting-review'
    projectionKind = 'awaiting-review-marker'
  } else if (item.status === 'blocked') {
    lifecycle = blockedLifecycle(activity)
    projectionKind = 'native-blocked'
    nativeBlocked = true
  } else {
    lifecycle = item.status === 'backlog'
      ? 'backlog'
      : item.status === 'focus'
        ? 'planned'
        : item.status === 'in_progress'
          ? 'ongoing'
          : 'done'
    projectionKind = 'native'
  }

  const sourceActor = [...activity]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.actor ?? null
  return {
    externalId: forgeExternalId('task', item.id),
    forgeId: item.id,
    entityType: 'task',
    lifecycle,
    projectionKind,
    role: roleFromTags(item, tags),
    nativeStatus: item.status,
    nativeBlocked,
    reviewMarker: marker,
    deleted: Boolean(deletedRecord),
    abandonmentReason: projectionKind === 'abandoned-soft-delete'
      ? deletedRecord?.deleteReason ?? null
      : null,
    workItem: item,
    activity: [...activity],
    provenance: {
      sourceRoute: '/api/v1/entities/search',
      sourceActor,
      adapterVersion,
      syncedAt,
      raw: cloneRaw(item.raw),
    },
  }
}

export function decodeWorkItemMatch(match: ForgeSearchMatch): {
  item: ForgeWorkItem
  deletedRecord?: ForgeDeletedEntityRecord
} {
  if (match.entityType !== 'task') {
    throw new ForgeAdapterError('validation_error', 'Expected a Forge task search match.', {
      entityType: match.entityType,
      id: match.id,
    })
  }
  const item = decodeForgeWorkItem(match.entity)
  if (item.id !== match.id) {
    throw new ForgeAdapterError('validation_error', 'Forge search match ID does not equal its entity ID.', {
      matchId: match.id,
      entityId: item.id,
    })
  }
  return { item, deletedRecord: match.deletedRecord }
}

export function rawRoundTrip<T extends { raw: ForgeRawRecord }>(decoded: T): ForgeRawRecord {
  return cloneRaw(decoded.raw)
}

export function assertSupportedEntityType(value: string): ForgeSupportedEntityType {
  if (value === 'goal' || value === 'strategy' || value === 'project' || value === 'task' || value === 'tag') {
    return value
  }
  throw new ForgeAdapterError('unsupported_contract_value', `Unsupported Forge entity type “${value}”.`, { value })
}
