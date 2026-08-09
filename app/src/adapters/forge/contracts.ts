export const FORGE_ADAPTER_CONTRACT_VERSION = 'threadwake-forge-fixture-v1' as const

export const FORGE_CONTRACT_PROVENANCE = {
  auditedAt: '2026-08-09',
  forgeCommit: 'dc893aea',
  dirtyCheckoutWarning:
    'The Forge checkout was read-only and dirty under a separate release owner. These contracts were verified without changing it.',
  sourceFiles: [
    'apps/api/src/types.ts',
    'apps/api/src/repositories/tasks.ts',
    'apps/api/src/repositories/projects.ts',
    'apps/api/src/repositories/strategies.ts',
    'apps/api/src/services/entity-crud.ts',
    'apps/api/src/managers/platform/authorization-manager.ts',
    'apps/api/migrations/046_work_item_hierarchy.sql',
  ],
} as const

export const FORGE_CAPABILITIES = {
  runtimeMode: 'fixture-only',
  supportedEntityTypes: ['goal', 'strategy', 'project', 'task', 'tag'],
  workItemLevels: ['issue', 'task', 'subtask'],
  workItemStatuses: ['backlog', 'focus', 'in_progress', 'blocked', 'done'],
  hasEpicOrGroupEntity: false,
  hasAwaitingReviewStatus: false,
  hasAbandonedStatus: false,
  directTaskCreateIdempotency: true,
  batchTaskCreateIdempotency: false,
  ordinaryUpdatePrecondition: false,
  atomicBatchRollback: true,
  softDeleteAndRestore: true,
  liveTransportAllowed: false,
} as const

export const FORGE_SUPPORTED_SURFACES = {
  rest: {
    search: 'POST /api/v1/entities/search',
    batchCreate: 'POST /api/v1/entities/create',
    batchUpdate: 'POST /api/v1/entities/update',
    batchDelete: 'POST /api/v1/entities/delete',
    batchRestore: 'POST /api/v1/entities/restore',
    workItems: 'GET|POST /api/v1/work-items',
    workItem: 'GET|PATCH /api/v1/work-items/:id',
    workItemBoard: 'GET /api/v1/work-items/board',
    workItemHierarchy: 'GET /api/v1/work-items/hierarchy',
    activity: 'GET /api/v1/activity',
    startTaskRun: 'POST /api/v1/tasks/:id/runs',
    heartbeatTaskRun: 'POST /api/v1/task-runs/:id/heartbeat',
    focusTaskRun: 'POST /api/v1/task-runs/:id/focus',
    completeTaskRun: 'POST /api/v1/task-runs/:id/complete',
    releaseTaskRun: 'POST /api/v1/task-runs/:id/release',
  },
  mcp: {
    search: 'forge_search_entities',
    batchCreate: 'forge_create_entities',
    batchUpdate: 'forge_update_entities',
    batchDelete: 'forge_delete_entities',
    batchRestore: 'forge_restore_entities',
    startTaskRun: 'forge_start_task_run',
    heartbeatTaskRun: 'forge_heartbeat_task_run',
    focusTaskRun: 'forge_focus_task_run',
    completeTaskRun: 'forge_complete_task_run',
    releaseTaskRun: 'forge_release_task_run',
  },
  taskRunSemantics: {
    releaseCompletesTask: false,
    completionStoresCloseoutAtomically: true,
  },
} as const

export const FORGE_PERMISSION_CONTRACT = {
  readsRequireAnyBaseScope: ['read', 'write'],
  mutationsRequireBaseScope: ['write'],
  operatorSessionSatisfiesBaseScope: true,
  tokenScopePolicyDimensions: ['userIds', 'projectIds', 'tagIds'],
  scopedResultAuthorizationOccursAfterMutation: true,
  dedicatedThreadwakeActorRequiredForAttribution: true,
} as const

export type ForgeSupportedEntityType =
  | 'goal'
  | 'strategy'
  | 'project'
  | 'task'
  | 'tag'

export type ForgeWorkItemLevel = 'issue' | 'task' | 'subtask'
export type ForgeWorkItemStatus = 'backlog' | 'focus' | 'in_progress' | 'blocked' | 'done'
export type ForgeLifecycleStatus = 'active' | 'paused' | 'completed'
export type ForgeActivitySource = 'ui' | 'openclaw' | 'agent' | 'system'
export type ForgeTagKind = 'value' | 'category' | 'execution'
export type ForgeAccessLevel = 'view' | 'manage'
export type ForgeTaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type ForgeTaskEffort = 'light' | 'deep' | 'marathon'
export type ForgeTaskEnergy = 'low' | 'steady' | 'high'
export type ForgeExecutionMode = 'afk' | 'hitl'
export type ForgeResolutionKind = 'completed' | 'split'
export type ForgeCloseoutState = 'not_applicable' | 'complete' | 'deferred'

export type ForgeRawRecord = Record<string, unknown>

export interface ForgeUserSummary {
  id: string
  kind: 'human' | 'bot'
  handle: string
  displayName: string
  description: string
  accentColor: string
  createdAt: string
  updatedAt: string
}

export interface ForgeOwnership {
  userId: string | null
  user: ForgeUserSummary | null
  ownerUserId: string | null
  ownerUser: ForgeUserSummary | null
  assigneeUserIds: string[]
  assignees: ForgeUserSummary[]
}

export interface ForgeAccessGrant {
  id: string
  subjectUserId: string
  targetUserId: string
  accessLevel: ForgeAccessLevel
  config: ForgeRawRecord
  createdAt: string
  updatedAt: string
}

export interface ForgeGoal extends ForgeOwnership {
  id: string
  title: string
  description: string
  horizon: 'quarter' | 'year' | 'lifetime'
  status: ForgeLifecycleStatus
  targetPoints: number
  themeColor: string
  createdAt: string
  updatedAt: string
  tagIds: string[]
  raw: ForgeRawRecord
}

export interface ForgeStrategyGraphNode {
  id: string
  entityType: 'project' | 'task'
  entityId: string
  title: string
  branchLabel: string
  notes: string
}

export interface ForgeStrategyGraphEdge {
  from: string
  to: string
  label: string
  condition: string
}

export interface ForgeStrategy extends ForgeOwnership {
  id: string
  title: string
  overview: string
  endStateDescription: string
  status: ForgeLifecycleStatus
  targetGoalIds: string[]
  targetProjectIds: string[]
  linkedEntities: Array<{ entityType: ForgeSupportedEntityType; entityId: string }>
  graph: { nodes: ForgeStrategyGraphNode[]; edges: ForgeStrategyGraphEdge[] }
  isLocked: boolean
  lockedAt: string | null
  lockedByUserId: string | null
  createdAt: string
  updatedAt: string
  raw: ForgeRawRecord
}

export interface ForgeProject extends ForgeOwnership {
  id: string
  goalId: string
  title: string
  description: string
  status: ForgeLifecycleStatus
  workflowStatus: ForgeWorkItemStatus
  targetPoints: number
  themeColor: string
  productRequirementsDocument: string
  schedulingRules: ForgeRawRecord
  createdAt: string
  updatedAt: string
  raw: ForgeRawRecord
}

export interface ForgeTag extends ForgeOwnership {
  id: string
  name: string
  kind: ForgeTagKind
  color: string
  description: string
  raw: ForgeRawRecord
}

export interface ForgeBlockerLink {
  entityType: string
  entityId: string
  label?: string
}

export interface ForgeCompletionReport {
  modifiedFiles: string[]
  workSummary: string
  linkedGitRefIds: string[]
}

export interface ForgeGitRef {
  id: string
  workItemId: string
  refType: 'commit' | 'branch' | 'pull_request'
  provider: string
  repository: string
  refValue: string
  url: string | null
  rawUrl: string | null
  urlSafety: 'absent' | 'safe' | 'unsafe'
  displayTitle: string
  createdAt: string
  updatedAt: string
}

export interface ForgeTaskTimeSummary {
  totalTrackedSeconds: number
  totalCreditedSeconds: number
  liveTrackedSeconds: number
  liveCreditedSeconds: number
  manualAdjustedSeconds: number
  activeRunCount: number
  hasCurrentRun: boolean
  currentRunId: string | null
}

export interface ForgeTaskRun extends ForgeOwnership {
  id: string
  taskId: string
  taskTitle: string
  actor: string
  status: 'active' | 'completed' | 'released' | 'timed_out'
  timerMode: 'planned' | 'unlimited'
  plannedDurationSeconds: number | null
  elapsedWallSeconds: number
  creditedSeconds: number
  remainingSeconds: number | null
  overtimeSeconds: number
  isCurrent: boolean
  note: string
  leaseTtlSeconds: number
  claimedAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  completedAt: string | null
  releasedAt: string | null
  timedOutAt: string | null
  overrideReason: string | null
  gitContext?: ForgeRawRecord | null
  updatedAt: string
}

export interface ForgeWorkItem extends ForgeOwnership {
  id: string
  title: string
  description: string
  level: ForgeWorkItemLevel
  status: ForgeWorkItemStatus
  priority: ForgeTaskPriority
  owner: string
  goalId: string | null
  projectId: string | null
  parentWorkItemId: string | null
  dueDate: string | null
  effort: ForgeTaskEffort
  energy: ForgeTaskEnergy
  points: number
  sortOrder: number
  plannedDurationSeconds: number | null
  schedulingRules: ForgeRawRecord | null
  resolutionKind: ForgeResolutionKind | null
  splitParentTaskId: string | null
  aiInstructions: string
  executionMode: ForgeExecutionMode | null
  acceptanceCriteria: string[]
  blockerLinks: ForgeBlockerLink[]
  completionReport: ForgeCompletionReport | null
  closeoutState: ForgeCloseoutState
  gitRefs: ForgeGitRef[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
  tagIds: string[]
  time: ForgeTaskTimeSummary
  raw: ForgeRawRecord
}

export interface ForgeActivityEvent extends ForgeOwnership {
  id: string
  entityType: ForgeSupportedEntityType | 'task_run' | 'system'
  entityId: string
  eventType: string
  title: string
  description: string
  actor: string | null
  source: ForgeActivitySource
  metadata: ForgeRawRecord
  createdAt: string
  raw: ForgeRawRecord
}

export interface ForgeDeletedEntityRecord {
  entityType: ForgeSupportedEntityType
  entityId: string
  title: string
  subtitle: string
  deletedAt: string
  deletedByActor: string | null
  deletedSource: ForgeActivitySource
  deleteReason: string
  snapshot: ForgeRawRecord
}

export interface ForgeSearchInput {
  entityTypes?: ForgeSupportedEntityType[]
  query?: string
  ids?: string[]
  status?: string[]
  linkedTo?: { entityType: ForgeSupportedEntityType; entityId: string }
  userIds?: string[]
  includeDeleted?: boolean
  limit?: number
  clientRef?: string
}

export interface ForgeBatchSearchRequest {
  searches: ForgeSearchInput[]
}

export interface ForgeSearchMatch {
  deleted: boolean
  entityType: ForgeSupportedEntityType
  id: string
  entity: ForgeRawRecord
  deletedRecord?: ForgeDeletedEntityRecord
}

export interface ForgeBatchSearchResult {
  ok: true
  clientRef?: string
  matches: ForgeSearchMatch[]
}

export interface ForgeBatchSearchResponse {
  results: ForgeBatchSearchResult[]
}

export interface ForgeValidationIssue {
  path: string
  message: string
  code?: string
  allowedValues?: unknown[]
}

export interface ForgeOperationErrorPayload {
  code: string
  message: string
  operationType?: 'create' | 'update' | 'delete' | 'restore' | 'search'
  entityType?: ForgeSupportedEntityType
  clientRef?: string
  routeHint?: string
  toolHint?: string
  summary?: string
  issues?: ForgeValidationIssue[]
  missingRequiredFields?: string[]
  invalidValueGuidance?: Array<{ path: string; allowedValues: unknown[]; message: string }>
  allowedTopLevelFields?: string[]
  minimalExamplePayload?: ForgeRawRecord
}

export interface ForgeMutationSuccess {
  ok: true
  entityType: ForgeSupportedEntityType
  id: string
  clientRef?: string
  entity: ForgeRawRecord
  deletedRecord?: ForgeDeletedEntityRecord
}

export interface ForgeMutationFailure {
  ok: false
  entityType: ForgeSupportedEntityType
  id?: string
  clientRef?: string
  error: ForgeOperationErrorPayload
}

export type ForgeMutationResult = ForgeMutationSuccess | ForgeMutationFailure
export interface ForgeBatchMutationResponse { results: ForgeMutationResult[] }

export interface ForgeBatchCreateRequest {
  atomic: boolean
  operations: Array<{
    entityType: ForgeSupportedEntityType
    clientRef?: string
    idempotencyKey?: string
    data: ForgeRawRecord
  }>
}

export interface ForgeBatchUpdateRequest {
  atomic: boolean
  operations: Array<{
    entityType: ForgeSupportedEntityType
    id: string
    clientRef?: string
    patch: ForgeRawRecord
  }>
}

export interface ForgeBatchDeleteRequest {
  atomic: boolean
  operations: Array<{
    entityType: ForgeSupportedEntityType
    id: string
    clientRef?: string
    mode: 'soft' | 'hard'
    reason: string
  }>
}

export interface ForgeBatchRestoreRequest {
  atomic: boolean
  operations: Array<{
    entityType: ForgeSupportedEntityType
    id: string
    clientRef?: string
  }>
}

export interface ForgeDirectCreateWorkItemRequest {
  data: ForgeRawRecord
  idempotencyKey: string
  payloadFingerprint: string
  clientRef: string
}

export interface ForgeDirectCreateWorkItemResponse {
  status: 200 | 201
  replayed: boolean
  entity: ForgeRawRecord
}

export interface ForgeTaskDetailResponse {
  task: ForgeRawRecord
}

export interface ForgeActivityListResponse {
  events: ForgeRawRecord[]
}

export type ForgeTransportErrorCode =
  | 'offline'
  | 'permission_denied'
  | 'token_scope_denied'
  | 'validation_error'
  | 'idempotency_conflict'
  | 'concurrency_conflict'
  | 'not_found'
  | 'unsupported_contract_value'
  | 'stale_undo'
  | 'live_transport_forbidden'
  | 'atomic_batch_failed'

export class ForgeAdapterError extends Error {
  constructor(
    readonly code: ForgeTransportErrorCode,
    message: string,
    readonly details: ForgeRawRecord = {},
  ) {
    super(message)
    this.name = 'ForgeAdapterError'
  }
}

export interface ForgeFixtureTransport {
  readonly kind: 'fixture'
  search(request: ForgeBatchSearchRequest): Promise<ForgeBatchSearchResponse>
  getWorkItem(id: string): Promise<ForgeTaskDetailResponse>
  getActivity(entityType: ForgeSupportedEntityType, entityId: string): Promise<ForgeActivityListResponse>
  directCreateWorkItem(request: ForgeDirectCreateWorkItemRequest): Promise<ForgeDirectCreateWorkItemResponse>
  batchCreate(request: ForgeBatchCreateRequest): Promise<ForgeBatchMutationResponse>
  batchUpdate(request: ForgeBatchUpdateRequest): Promise<ForgeBatchMutationResponse>
  batchDelete(request: ForgeBatchDeleteRequest): Promise<ForgeBatchMutationResponse>
  batchRestore(request: ForgeBatchRestoreRequest): Promise<ForgeBatchMutationResponse>
}

export interface ForgeForbiddenLiveTransport {
  readonly kind: 'live'
}

export type ForgeTransportCandidate = ForgeFixtureTransport | ForgeForbiddenLiveTransport

export function forgeExternalId(entityType: ForgeSupportedEntityType, id: string): string {
  return `${entityType}:${id}`
}
