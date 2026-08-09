import {
  ForgeAdapterError,
  type ForgeActivityListResponse,
  type ForgeBatchCreateRequest,
  type ForgeBatchDeleteRequest,
  type ForgeBatchMutationResponse,
  type ForgeBatchRestoreRequest,
  type ForgeBatchSearchRequest,
  type ForgeBatchSearchResponse,
  type ForgeBatchUpdateRequest,
  type ForgeDeletedEntityRecord,
  type ForgeDirectCreateWorkItemRequest,
  type ForgeDirectCreateWorkItemResponse,
  type ForgeFixtureTransport,
  type ForgeMutationResult,
  type ForgeRawRecord,
  type ForgeSearchMatch,
  type ForgeSupportedEntityType,
  type ForgeTaskDetailResponse,
  type ForgeTransportErrorCode,
} from './contracts'

const EPOCH = Date.parse('2026-08-09T08:00:00.000Z')

function clone<T>(value: T): T {
  return structuredClone(value)
}

function iso(minute: number): string {
  return new Date(EPOCH + minute * 60_000).toISOString()
}

const HUMAN = {
  id: 'user-fixture-owner',
  kind: 'human',
  handle: 'fixture-owner',
  displayName: 'Fixture Owner',
  description: 'Fixture owner',
  accentColor: '#5779a8',
  createdAt: iso(0),
  updatedAt: iso(0),
} as const

const BOT = {
  id: 'user-threadwake-agent',
  kind: 'bot',
  handle: 'threadwake-agent',
  displayName: 'Threadwake Agent',
  description: 'Dedicated attributable fixture agent',
  accentColor: '#6f88a8',
  createdAt: iso(0),
  updatedAt: iso(0),
} as const

function ownership(overrides: ForgeRawRecord = {}): ForgeRawRecord {
  return {
    userId: HUMAN.id,
    user: HUMAN,
    ownerUserId: HUMAN.id,
    ownerUser: HUMAN,
    assigneeUserIds: [BOT.id],
    assignees: [BOT],
    ...overrides,
  }
}

function task(
  id: string,
  title: string,
  level: 'issue' | 'task' | 'subtask',
  status: 'backlog' | 'focus' | 'in_progress' | 'blocked' | 'done',
  parentWorkItemId: string | null,
  overrides: ForgeRawRecord = {},
): ForgeRawRecord {
  return {
    id,
    title,
    description: `${title} fixture description.`,
    level,
    status,
    priority: 'medium',
    owner: 'Threadwake Agent',
    goalId: 'goal-threadwake',
    projectId: 'project-threadwake',
    parentWorkItemId,
    dueDate: null,
    effort: 'deep',
    energy: 'steady',
    points: 100,
    sortOrder: 0,
    plannedDurationSeconds: 86_400,
    schedulingRules: null,
    resolutionKind: null,
    splitParentTaskId: null,
    aiInstructions: '',
    executionMode: 'hitl',
    acceptanceCriteria: [],
    blockerLinks: [],
    completionReport: null,
    closeoutState: 'not_applicable',
    gitRefs: [],
    completedAt: null,
    createdAt: iso(10),
    updatedAt: iso(10),
    tagIds: [],
    time: {
      totalTrackedSeconds: 0,
      totalCreditedSeconds: 0,
      liveTrackedSeconds: 0,
      liveCreditedSeconds: 0,
      manualAdjustedSeconds: 0,
      activeRunCount: 0,
      hasCurrentRun: false,
      currentRunId: null,
    },
    actionPointSummary: {
      costBand: 'standard',
      totalCostAp: 100,
      expectedDurationSeconds: 86_400,
      sustainRateApPerHour: 100 / 24,
      spentTodayAp: 0,
      spentTotalAp: 0,
      remainingAp: 100,
    },
    splitSuggestion: { shouldSplit: false, reason: null, thresholdSeconds: 172_800 },
    ...ownership(),
    ...overrides,
  }
}

function activity(
  id: string,
  entityId: string,
  eventType: string,
  metadata: ForgeRawRecord,
  at: string,
): ForgeRawRecord {
  return {
    id,
    entityType: 'task',
    entityId,
    eventType,
    title: eventType,
    description: `${eventType} fixture event.`,
    actor: BOT.handle,
    source: 'agent',
    metadata,
    createdAt: at,
    ...ownership(),
  }
}

export interface ForgeFixtureData {
  entities: Record<ForgeSupportedEntityType, ForgeRawRecord[]>
  deletedRecords: ForgeDeletedEntityRecord[]
  activity: ForgeRawRecord[]
  accessGrants: ForgeRawRecord[]
}

export function createDeterministicForgeFixture(): ForgeFixtureData {
  const completedReport = {
    modifiedFiles: ['src/fixture.ts'],
    workSummary: 'Completed against the deterministic fixture.',
    linkedGitRefIds: ['git-ref-solved-bug'],
  }
  const solvedGitRef = {
    id: 'git-ref-solved-bug',
    workItemId: 'task-solved-bug',
    refType: 'commit',
    provider: 'git',
    repository: 'example/threadwake-fixture',
    refValue: 'dc893aea',
    url: null,
    rawUrl: null,
    urlSafety: 'absent',
    displayTitle: 'Fixture closeout commit',
    createdAt: iso(15),
    updatedAt: iso(15),
  }
  const entities: ForgeFixtureData['entities'] = {
    goal: [{
      id: 'goal-threadwake',
      title: 'Threadwake canonical storage',
      description: 'Fixture goal.',
      horizon: 'year',
      status: 'active',
      targetPoints: 1200,
      themeColor: '#526f94',
      createdAt: iso(1),
      updatedAt: iso(1),
      tagIds: [],
      fixtureUnknownGoalField: { retained: true },
      ...ownership(),
    }],
    strategy: [{
      id: 'strategy-threadwake',
      title: 'Integrate through verified contracts',
      overview: 'Fixture strategy.',
      endStateDescription: 'Threadwake imports Forge truth without live writes.',
      status: 'active',
      targetGoalIds: ['goal-threadwake'],
      targetProjectIds: ['project-threadwake'],
      linkedEntities: [{ entityType: 'project', entityId: 'project-threadwake' }],
      graph: {
        nodes: [
          { id: 'strategy-node-project', entityType: 'project', entityId: 'project-threadwake', title: 'Project', branchLabel: '', notes: '' },
          { id: 'strategy-node-task', entityType: 'task', entityId: 'task-ongoing', title: 'Task', branchLabel: '', notes: '' },
        ],
        edges: [{ from: 'strategy-node-project', to: 'strategy-node-task', label: 'contains work', condition: '' }],
      },
      metrics: {},
      isLocked: false,
      lockedAt: null,
      lockedByUserId: null,
      lockedByUser: null,
      createdAt: iso(2),
      updatedAt: iso(2),
      ...ownership(),
    }],
    project: [{
      id: 'project-threadwake',
      goalId: 'goal-threadwake',
      title: 'Threadwake project/group',
      description: 'The supported epic-like boundary; Forge has no epic entity.',
      status: 'active',
      workflowStatus: 'in_progress',
      targetPoints: 1000,
      themeColor: '#526f94',
      productRequirementsDocument: 'Fixture-only integration.',
      schedulingRules: {},
      createdAt: iso(3),
      updatedAt: iso(3),
      ...ownership(),
    }],
    tag: [
      { id: 'tag-bug', name: 'bug', kind: 'category', color: '#b75b63', description: 'Bug work.', ...ownership() },
      { id: 'tag-validation', name: 'validation', kind: 'category', color: '#668a72', description: 'Validation work.', ...ownership() },
      { id: 'tag-report', name: 'report', kind: 'category', color: '#716995', description: 'Report work.', ...ownership() },
      { id: 'tag-awaiting-review', name: 'awaiting-review', kind: 'execution', color: '#5577a6', description: 'Owner-approved review projection.', ...ownership() },
      { id: 'tag-awaiting-approval', name: 'awaiting-approval', kind: 'execution', color: '#5577a6', description: 'Owner-approved approval projection.', ...ownership() },
    ],
    task: [
      task('issue-integration', 'Forge integration issue', 'issue', 'focus', null, {
        sortOrder: 1,
        fixtureUnknown: { roundTrip: 'keep-me' },
      }),
      task('task-ongoing', 'Implement adapter', 'task', 'in_progress', 'issue-integration', { sortOrder: 2 }),
      task('subtask-validation', 'Validate mappings', 'subtask', 'done', 'task-ongoing', {
        sortOrder: 3,
        tagIds: ['tag-validation'],
        completedAt: iso(30),
        resolutionKind: 'completed',
        closeoutState: 'complete',
        completionReport: { modifiedFiles: [], workSummary: 'Validation completed with a recorded failure.', linkedGitRefIds: [] },
      }),
      task('task-solved-bug', 'Fix stale identity bug', 'task', 'done', 'issue-integration', {
        sortOrder: 4,
        tagIds: ['tag-bug'],
        completedAt: iso(31),
        resolutionKind: 'completed',
        closeoutState: 'complete',
        completionReport: completedReport,
        gitRefs: [solvedGitRef],
      }),
      task('subtask-report', 'Write integration report', 'subtask', 'done', 'task-solved-bug', {
        sortOrder: 5,
        tagIds: ['tag-report'],
        completedAt: iso(32),
        resolutionKind: 'completed',
        closeoutState: 'complete',
        completionReport: { modifiedFiles: [], workSummary: 'Report retained as child work.', linkedGitRefIds: [] },
      }),
      task('task-review', 'Review adapter evidence', 'task', 'blocked', 'issue-integration', {
        sortOrder: 6,
        tagIds: ['tag-awaiting-review'],
        blockerLinks: [{ entityType: 'task', entityId: 'subtask-validation', label: 'Review validation evidence' }],
      }),
      task('task-native-blocked', 'Resolve native dependency', 'task', 'blocked', 'issue-integration', { sortOrder: 7 }),
      task('task-backlog', 'Consider live transport later', 'task', 'backlog', 'issue-integration', { sortOrder: 8 }),
      task('task-abandoned', 'Discard unsafe proxy idea', 'task', 'backlog', 'issue-integration', { sortOrder: 9 }),
      task('task-read-only', 'Observe restricted assignment', 'task', 'focus', 'issue-integration', {
        sortOrder: 10,
        assigneeUserIds: [HUMAN.id],
        assignees: [HUMAN],
      }),
    ],
  }

  const abandoned = entities.task.find((entry) => entry.id === 'task-abandoned')
  if (!abandoned) throw new Error('Deterministic fixture construction failed.')

  return {
    entities,
    deletedRecords: [{
      entityType: 'task',
      entityId: 'task-abandoned',
      title: 'Discard unsafe proxy idea',
      subtitle: 'Soft-deleted fixture work',
      deletedAt: iso(40),
      deletedByActor: BOT.handle,
      deletedSource: 'agent',
      deleteReason: 'threadwake:abandoned',
      snapshot: clone(abandoned),
    }],
    activity: [
      activity('activity-native-blocked', 'task-native-blocked', 'task.status_changed', {
        previousStatus: 'in_progress',
        status: 'blocked',
      }, iso(35)),
      activity('activity-review', 'task-review', 'task.status_changed', {
        previousStatus: 'in_progress',
        status: 'blocked',
      }, iso(36)),
      activity('activity-validation-failed', 'subtask-validation', 'task.completed', {
        outcome: 'failed',
        closeoutState: 'complete',
      }, iso(37)),
      activity('activity-bug-solved', 'task-solved-bug', 'task.completed', {
        outcome: 'solved',
        closeoutState: 'complete',
      }, iso(38)),
    ],
    accessGrants: [{
      id: 'grant-read-only',
      subjectUserId: BOT.id,
      targetUserId: HUMAN.id,
      accessLevel: 'view',
      config: { self: false, mutable: false, linkedEntities: true, rights: { canAffectEntities: false } },
      createdAt: iso(4),
      updatedAt: iso(4),
    }],
  }
}

export interface InMemoryForgeTransportOptions {
  data?: ForgeFixtureData
  writeAccess?: boolean
  scopedProjectIds?: string[]
  deniedEntityIds?: string[]
  offline?: boolean
}

interface IdempotencyReceipt {
  payloadFingerprint: string
  entity: ForgeRawRecord
}

export class InMemoryForgeTransport implements ForgeFixtureTransport {
  readonly kind = 'fixture' as const
  private readonly entities: Record<ForgeSupportedEntityType, Map<string, ForgeRawRecord>>
  private readonly deletedRecords = new Map<string, ForgeDeletedEntityRecord>()
  private readonly activityEvents: ForgeRawRecord[]
  private readonly idempotencyReceipts = new Map<string, IdempotencyReceipt>()
  private readonly deniedEntityIds: Set<string>
  private readonly scopedProjectIds: Set<string> | null
  private writeAccess: boolean
  private offline: boolean
  private sequence = 100

  constructor(options: InMemoryForgeTransportOptions = {}) {
    const data = clone(options.data ?? createDeterministicForgeFixture())
    this.entities = {
      goal: new Map(data.entities.goal.map((entry) => [String(entry.id), entry])),
      strategy: new Map(data.entities.strategy.map((entry) => [String(entry.id), entry])),
      project: new Map(data.entities.project.map((entry) => [String(entry.id), entry])),
      task: new Map(data.entities.task.map((entry) => [String(entry.id), entry])),
      tag: new Map(data.entities.tag.map((entry) => [String(entry.id), entry])),
    }
    for (const record of data.deletedRecords) this.deletedRecords.set(`${record.entityType}:${record.entityId}`, record)
    this.activityEvents = data.activity
    this.writeAccess = options.writeAccess ?? true
    this.offline = options.offline ?? false
    this.scopedProjectIds = options.scopedProjectIds ? new Set(options.scopedProjectIds) : null
    this.deniedEntityIds = new Set(options.deniedEntityIds ?? ['task-read-only'])
  }

  setOffline(value: boolean): void { this.offline = value }
  setWriteAccess(value: boolean): void { this.writeAccess = value }

  private assertOnline(): void {
    if (this.offline) throw new ForgeAdapterError('offline', 'The isolated Forge fixture transport is offline.')
  }

  private assertWrite(entityId?: string): void {
    this.assertOnline()
    if (!this.writeAccess || (entityId && this.deniedEntityIds.has(entityId))) {
      throw new ForgeAdapterError('permission_denied', 'The fixture principal does not have Forge write permission.', { entityId })
    }
  }

  private assertScope(entity: ForgeRawRecord): void {
    if (!this.scopedProjectIds) return
    const projectId = entity.projectId
    if (typeof projectId === 'string' && !this.scopedProjectIds.has(projectId)) {
      throw new ForgeAdapterError('token_scope_denied', 'The Forge token scope excludes this project.', { projectId })
    }
  }

  private now(): string {
    this.sequence += 1
    return iso(this.sequence)
  }

  async search(request: ForgeBatchSearchRequest): Promise<ForgeBatchSearchResponse> {
    this.assertOnline()
    return {
      results: request.searches.map((search) => {
        const types = search.entityTypes ?? ['goal', 'strategy', 'project', 'task', 'tag']
        const needle = search.query?.trim().toLocaleLowerCase() ?? ''
        const ids = search.ids ? new Set(search.ids) : null
        const statuses = search.status ? new Set(search.status) : null
        const userIds = search.userIds ? new Set(search.userIds) : null
        const matches: ForgeSearchMatch[] = []
        for (const entityType of types) {
          for (const entity of this.entities[entityType].values()) {
            const id = String(entity.id)
            const deletedRecord = this.deletedRecords.get(`${entityType}:${id}`)
            if (deletedRecord && !search.includeDeleted) continue
            if (ids && !ids.has(id)) continue
            if (needle && !`${String(entity.title ?? entity.name ?? '')} ${String(entity.description ?? '')}`.toLocaleLowerCase().includes(needle)) continue
            if (statuses && (typeof entity.status !== 'string' || !statuses.has(entity.status))) continue
            if (userIds && ![entity.userId, entity.ownerUserId].some((value) => typeof value === 'string' && userIds.has(value))) continue
            if (search.linkedTo) {
              const linked = search.linkedTo
              const linkedMatch = linked.entityType === 'project'
                ? entity.projectId === linked.entityId || (entityType === 'project' && id === linked.entityId)
                : linked.entityType === 'goal'
                  ? entity.goalId === linked.entityId || (entityType === 'goal' && id === linked.entityId)
                  : false
              if (!linkedMatch) continue
            }
            this.assertScope(entity)
            matches.push({
              deleted: Boolean(deletedRecord),
              entityType,
              id,
              entity: clone(entity),
              ...(deletedRecord ? { deletedRecord: clone(deletedRecord) } : {}),
            })
          }
        }
        matches.sort((left, right) =>
          left.entityType.localeCompare(right.entityType) || left.id.localeCompare(right.id))
        return { ok: true as const, clientRef: search.clientRef, matches: matches.slice(0, search.limit ?? 25) }
      }),
    }
  }

  async getWorkItem(id: string): Promise<ForgeTaskDetailResponse> {
    this.assertOnline()
    const taskEntity = this.entities.task.get(id)
    if (!taskEntity) throw new ForgeAdapterError('not_found', `Forge work item “${id}” was not found.`)
    this.assertScope(taskEntity)
    return { task: clone(taskEntity) }
  }

  async getActivity(entityType: ForgeSupportedEntityType, entityId: string): Promise<ForgeActivityListResponse> {
    this.assertOnline()
    const events = this.activityEvents
      .filter((entry) => entry.entityType === entityType && entry.entityId === entityId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    return { events: clone(events) }
  }

  async directCreateWorkItem(request: ForgeDirectCreateWorkItemRequest): Promise<ForgeDirectCreateWorkItemResponse> {
    this.assertWrite()
    const prior = this.idempotencyReceipts.get(request.idempotencyKey)
    if (prior) {
      if (prior.payloadFingerprint !== request.payloadFingerprint) {
        throw new ForgeAdapterError('idempotency_conflict', 'The same Forge idempotency key was reused with changed work-item content.', {
          idempotencyKey: request.idempotencyKey,
        })
      }
      return { status: 200, replayed: true, entity: clone(prior.entity) }
    }
    if (typeof request.data.title !== 'string' || request.data.title.trim() === '') {
      throw new ForgeAdapterError('validation_error', 'Forge work-item title is required.')
    }
    const id = typeof request.data.id === 'string' ? request.data.id : `fixture-created-${this.sequence + 1}`
    if (this.entities.task.has(id)) throw new ForgeAdapterError('validation_error', `Forge work item “${id}” already exists.`)
    const entity = { ...clone(request.data), id, updatedAt: this.now(), createdAt: request.data.createdAt ?? this.now() }
    this.assertScope(entity)
    this.entities.task.set(id, entity)
    this.idempotencyReceipts.set(request.idempotencyKey, { payloadFingerprint: request.payloadFingerprint, entity: clone(entity) })
    return { status: 201, replayed: false, entity: clone(entity) }
  }

  private failure(
    entityType: ForgeSupportedEntityType,
    code: string,
    message: string,
    clientRef?: string,
    id?: string,
  ): ForgeMutationResult {
    return { ok: false, entityType, id, clientRef, error: { code, message, entityType, clientRef } }
  }

  private atomicResults(
    operations: readonly { entityType: ForgeSupportedEntityType; clientRef?: string }[],
    run: (index: number) => ForgeMutationResult,
  ): ForgeMutationResult[] {
    const snapshot = clone(this.snapshotState())
    const results: ForgeMutationResult[] = []
    let failedAt = -1
    for (let index = 0; index < operations.length; index += 1) {
      const result = run(index)
      results.push(result)
      if (!result.ok) { failedAt = index; break }
    }
    if (failedAt < 0) return results
    this.restoreState(snapshot)
    return operations.map((operation, index) => {
      if (index < failedAt) return this.failure(operation.entityType, 'rolled_back', 'Rolled back because an earlier atomic batch operation failed.', operation.clientRef)
      if (index === failedAt) return results[index] as ForgeMutationResult
      return this.failure(operation.entityType, 'not_executed', 'Skipped because an earlier atomic batch operation failed.', operation.clientRef)
    })
  }

  private snapshotState(): { entities: Record<ForgeSupportedEntityType, ForgeRawRecord[]>; deleted: ForgeDeletedEntityRecord[] } {
    return {
      entities: {
        goal: [...this.entities.goal.values()],
        strategy: [...this.entities.strategy.values()],
        project: [...this.entities.project.values()],
        task: [...this.entities.task.values()],
        tag: [...this.entities.tag.values()],
      },
      deleted: [...this.deletedRecords.values()],
    }
  }

  private restoreState(snapshot: ReturnType<InMemoryForgeTransport['snapshotState']>): void {
    for (const type of ['goal', 'strategy', 'project', 'task', 'tag'] as const) {
      this.entities[type].clear()
      for (const entity of snapshot.entities[type]) this.entities[type].set(String(entity.id), clone(entity))
    }
    this.deletedRecords.clear()
    for (const record of snapshot.deleted) this.deletedRecords.set(`${record.entityType}:${record.entityId}`, clone(record))
  }

  async batchCreate(request: ForgeBatchCreateRequest): Promise<ForgeBatchMutationResponse> {
    this.assertWrite()
    const perform = (index: number): ForgeMutationResult => {
      const operation = request.operations[index]
      if (!operation) throw new Error('Missing fixture operation.')
      if (typeof operation.data.id !== 'string') this.sequence += 1
      const id = typeof operation.data.id === 'string' ? operation.data.id : `fixture-batch-${this.sequence}`
      if (this.entities[operation.entityType].has(id)) {
        return this.failure(operation.entityType, 'validation_error', `Forge ${operation.entityType} “${id}” already exists.`, operation.clientRef, id)
      }
      const entity = { ...clone(operation.data), id }
      this.assertScope(entity)
      this.entities[operation.entityType].set(id, entity)
      return { ok: true, entityType: operation.entityType, id, clientRef: operation.clientRef, entity: clone(entity) }
    }
    return { results: request.atomic ? this.atomicResults(request.operations, perform) : request.operations.map((_, index) => perform(index)) }
  }

  async batchUpdate(request: ForgeBatchUpdateRequest): Promise<ForgeBatchMutationResponse> {
    this.assertOnline()
    const perform = (index: number): ForgeMutationResult => {
      const operation = request.operations[index]
      if (!operation) throw new Error('Missing fixture operation.')
      try { this.assertWrite(operation.id) } catch (error) {
        if (error instanceof ForgeAdapterError) return this.failure(operation.entityType, error.code, error.message, operation.clientRef, operation.id)
        throw error
      }
      const current = this.entities[operation.entityType].get(operation.id)
      if (!current) return this.failure(operation.entityType, 'not_found', `Forge ${operation.entityType} “${operation.id}” was not found.`, operation.clientRef, operation.id)
      if ('id' in operation.patch && operation.patch.id !== operation.id) {
        return this.failure(operation.entityType, 'validation_error', 'Forge entity IDs are immutable.', operation.clientRef, operation.id)
      }
      const entity = { ...current, ...clone(operation.patch), id: operation.id, updatedAt: this.now() }
      try { this.assertScope(entity) } catch (error) {
        if (error instanceof ForgeAdapterError) return this.failure(operation.entityType, error.code, error.message, operation.clientRef, operation.id)
        throw error
      }
      this.entities[operation.entityType].set(operation.id, entity)
      return { ok: true, entityType: operation.entityType, id: operation.id, clientRef: operation.clientRef, entity: clone(entity) }
    }
    return { results: request.atomic ? this.atomicResults(request.operations, perform) : request.operations.map((_, index) => perform(index)) }
  }

  async batchDelete(request: ForgeBatchDeleteRequest): Promise<ForgeBatchMutationResponse> {
    this.assertOnline()
    const perform = (index: number): ForgeMutationResult => {
      const operation = request.operations[index]
      if (!operation) throw new Error('Missing fixture operation.')
      try { this.assertWrite(operation.id) } catch (error) {
        if (error instanceof ForgeAdapterError) return this.failure(operation.entityType, error.code, error.message, operation.clientRef, operation.id)
        throw error
      }
      const current = this.entities[operation.entityType].get(operation.id)
      if (!current) return this.failure(operation.entityType, 'not_found', `Forge ${operation.entityType} “${operation.id}” was not found.`, operation.clientRef, operation.id)
      if (operation.mode === 'hard') return this.failure(operation.entityType, 'validation_error', 'Threadwake fixtures prohibit hard delete.', operation.clientRef, operation.id)
      const record: ForgeDeletedEntityRecord = {
        entityType: operation.entityType,
        entityId: operation.id,
        title: String(current.title ?? current.name ?? operation.id),
        subtitle: 'Soft-deleted by fixture adapter',
        deletedAt: this.now(),
        deletedByActor: BOT.handle,
        deletedSource: 'agent',
        deleteReason: operation.reason,
        snapshot: clone(current),
      }
      this.deletedRecords.set(`${operation.entityType}:${operation.id}`, record)
      return { ok: true, entityType: operation.entityType, id: operation.id, clientRef: operation.clientRef, entity: clone(current), deletedRecord: clone(record) }
    }
    return { results: request.atomic ? this.atomicResults(request.operations, perform) : request.operations.map((_, index) => perform(index)) }
  }

  async batchRestore(request: ForgeBatchRestoreRequest): Promise<ForgeBatchMutationResponse> {
    this.assertOnline()
    const perform = (index: number): ForgeMutationResult => {
      const operation = request.operations[index]
      if (!operation) throw new Error('Missing fixture operation.')
      try { this.assertWrite(operation.id) } catch (error) {
        if (error instanceof ForgeAdapterError) return this.failure(operation.entityType, error.code, error.message, operation.clientRef, operation.id)
        throw error
      }
      const key = `${operation.entityType}:${operation.id}`
      const record = this.deletedRecords.get(key)
      const current = this.entities[operation.entityType].get(operation.id)
      if (!record || !current) return this.failure(operation.entityType, 'not_found', `Forge deleted ${operation.entityType} “${operation.id}” was not found.`, operation.clientRef, operation.id)
      const entity = { ...current, updatedAt: this.now() }
      this.entities[operation.entityType].set(operation.id, entity)
      this.deletedRecords.delete(key)
      return { ok: true, entityType: operation.entityType, id: operation.id, clientRef: operation.clientRef, entity: clone(entity) }
    }
    return { results: request.atomic ? this.atomicResults(request.operations, perform) : request.operations.map((_, index) => perform(index)) }
  }

  injectRawEntity(entityType: ForgeSupportedEntityType, entity: ForgeRawRecord): void {
    this.entities[entityType].set(String(entity.id), clone(entity))
  }

  mutateWithoutAdapter(entityType: ForgeSupportedEntityType, id: string, patch: ForgeRawRecord): void {
    const current = this.entities[entityType].get(id)
    if (!current) throw new Error(`Missing fixture ${entityType}:${id}`)
    this.entities[entityType].set(id, { ...current, ...clone(patch), updatedAt: this.now() })
  }

  count(entityType: ForgeSupportedEntityType): number {
    return this.entities[entityType].size
  }
}

export function fixtureTransportForError(code: ForgeTransportErrorCode): InMemoryForgeTransport {
  if (code === 'offline') return new InMemoryForgeTransport({ offline: true })
  if (code === 'permission_denied') return new InMemoryForgeTransport({ writeAccess: false })
  if (code === 'token_scope_denied') return new InMemoryForgeTransport({ scopedProjectIds: ['different-project'] })
  throw new Error(`No whole-transport fixture is defined for ${code}.`)
}
