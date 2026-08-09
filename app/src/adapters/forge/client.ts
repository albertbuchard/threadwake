import type { WorkLifecycle } from '../../domain'
import {
  FORGE_ADAPTER_CONTRACT_VERSION,
  ForgeAdapterError,
  forgeExternalId,
  type ForgeActivitySource,
  type ForgeDeletedEntityRecord,
  type ForgeFixtureTransport,
  type ForgeMutationFailure,
  type ForgeRawRecord,
  type ForgeSearchMatch,
  type ForgeSupportedEntityType,
  type ForgeTransportCandidate,
  type ForgeTransportErrorCode,
  type ForgeWorkItem,
} from './contracts'
import { assertValidForgeHierarchy } from './hierarchy'
import {
  decodeForgeActivity,
  decodeForgeTag,
  decodeForgeWorkItem,
  decodeWorkItemMatch,
  projectForgeLifecycle,
  type ThreadwakeForgeWorkProjection,
} from './mapper'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as ForgeRawRecord)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function canonicalPayloadFingerprint(value: unknown): Promise<string> {
  return `sha256:${await sha256(canonicalJson(value))}`
}

export async function directCreateIdempotencyKey(clientOperationId: string): Promise<string> {
  if (!clientOperationId.trim()) {
    throw new ForgeAdapterError('validation_error', 'A durable client operation ID is required for Forge creation.')
  }
  const operationDigest = await sha256(clientOperationId)
  return `threadwake:create-task:${FORGE_ADAPTER_CONTRACT_VERSION}:${operationDigest.slice(0, 32)}`
}

function equivalent(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function adapterCode(code: string): ForgeTransportErrorCode {
  if (
    code === 'offline'
    || code === 'permission_denied'
    || code === 'token_scope_denied'
    || code === 'validation_error'
    || code === 'idempotency_conflict'
    || code === 'concurrency_conflict'
    || code === 'not_found'
    || code === 'unsupported_contract_value'
    || code === 'stale_undo'
    || code === 'live_transport_forbidden'
    || code === 'atomic_batch_failed'
  ) return code
  if (code === 'rolled_back' || code === 'not_executed') return 'atomic_batch_failed'
  return 'validation_error'
}

function throwMutationFailure(result: ForgeMutationFailure): never {
  throw new ForgeAdapterError(adapterCode(result.error.code), result.error.message, {
    error: result.error,
    id: result.id,
    entityType: result.entityType,
  })
}

export interface ForgeNormalizedEntity {
  externalId: string
  entityType: ForgeSupportedEntityType
  forgeId: string
  updatedAt: string | null
  deleted: boolean
  deletedRecord?: ForgeDeletedEntityRecord
  raw: ForgeRawRecord
}

export interface ForgeConfirmedSnapshot {
  syncState: 'confirmed'
  syncedAt: string
  entities: ForgeNormalizedEntity[]
  work: ThreadwakeForgeWorkProjection[]
  pendingIntentions: ForgePendingIntention[]
}

export interface ForgeStaleSnapshot extends Omit<ForgeConfirmedSnapshot, 'syncState'> {
  syncState: 'stale'
  staleSince: string
  syncError: { code: ForgeTransportErrorCode; message: string }
  retryAction: 'reconcile-before-write'
}

export type ForgeSnapshot = ForgeConfirmedSnapshot | ForgeStaleSnapshot

export interface ForgePendingIntention {
  id: string
  entityExternalId: string
  kind: 'create' | 'update' | 'delete' | 'restore'
  patch: ForgeRawRecord
  baseUpdatedAt: string | null
  createdAt: string
  expiresAt: string
  state: 'pending-offline'
  autoFlush: false
}

export interface ForgeAuditReceipt {
  clientRef: string
  actor: string
  source: ForgeActivitySource
  operationKind: 'create' | 'update' | 'undo-update' | 'rollback-create' | 'abandon' | 'restore'
  operationHash: string
  baseUpdatedAt: string | null
  returnedId: string
  finalUpdatedAt: string
  inverseOperation: {
    kind: 'soft-delete' | 'sparse-update' | 'restore'
    patch?: ForgeRawRecord
  }
  timeOfCheckToTimeOfUseLimitation: true
}

export interface ForgeCreateReceipt extends ForgeAuditReceipt {
  idempotencyKey: string
  payloadFingerprint: string
  replayed: boolean
  deduplicatedBySearch: boolean
}

export interface ForgeUpdateResult {
  item: ForgeWorkItem
  sparsePatch: ForgeRawRecord
  receipt: ForgeAuditReceipt
}

export interface ForgeCreateInput {
  clientOperationId: string
  clientRef: string
  actor: string
  source: ForgeActivitySource
  data: ForgeRawRecord
}

export interface ForgeUpdateInput {
  id: string
  clientRef: string
  actor: string
  source: ForgeActivitySource
  baseUpdatedAt: string
  changes: ForgeRawRecord
}

function normalizedEntity(match: ForgeSearchMatch): ForgeNormalizedEntity {
  const raw = clone(match.entity)
  return {
    externalId: forgeExternalId(match.entityType, match.id),
    entityType: match.entityType,
    forgeId: match.id,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    deleted: match.deleted,
    ...(match.deletedRecord ? { deletedRecord: clone(match.deletedRecord) } : {}),
    raw,
  }
}

function safeUpdatedAt(raw: ForgeRawRecord): string {
  const value = raw.updatedAt
  if (typeof value !== 'string') throw new ForgeAdapterError('validation_error', 'Forge mutation result omitted updatedAt.', { raw })
  return value
}

function sparsePatch(current: ForgeRawRecord, changes: ForgeRawRecord): {
  patch: ForgeRawRecord
  inverse: ForgeRawRecord
} {
  const patch: ForgeRawRecord = {}
  const inverse: ForgeRawRecord = {}
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      throw new ForgeAdapterError('validation_error', `Forge field “${key}” cannot be changed by a sparse update.`)
    }
    if (equivalent(current[key], value)) continue
    patch[key] = clone(value)
    inverse[key] = clone(current[key])
  }
  return { patch, inverse }
}

function workItemWithReadDefaults(data: ForgeRawRecord, provisionalId: string, now: string): ForgeRawRecord {
  return {
    ...clone(data),
    id: typeof data.id === 'string' ? data.id : provisionalId,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
  }
}

export interface LifecycleMutationEvidence {
  markerTagId?: string
  markerTagName?: 'awaiting-review' | 'awaiting-approval'
  blockerLink?: { entityType: string; entityId: string; label?: string }
}

export function lifecycleSparsePatch(
  item: ForgeWorkItem,
  lifecycle: WorkLifecycle,
  evidence: LifecycleMutationEvidence = {},
): ForgeRawRecord {
  if (lifecycle === 'abandoned') {
    throw new ForgeAdapterError('validation_error', 'Abandoned is a reversible soft deletion, not a Forge work-item status. Use abandonWorkItem().')
  }
  if (lifecycle === 'awaiting-review') {
    if (!evidence.markerTagId || !evidence.markerTagName || !evidence.blockerLink) {
      throw new ForgeAdapterError(
        'validation_error',
        'Awaiting review or approval requires an explicit execution marker and review blocker evidence.',
      )
    }
    return {
      status: 'blocked',
      tagIds: [...new Set([...item.tagIds, evidence.markerTagId])],
      blockerLinks: [
        ...item.blockerLinks.filter((link) =>
          link.entityType !== evidence.blockerLink?.entityType || link.entityId !== evidence.blockerLink?.entityId),
        evidence.blockerLink,
      ],
    }
  }
  return {
    status: lifecycle === 'backlog'
      ? 'backlog'
      : lifecycle === 'planned'
        ? 'focus'
        : lifecycle === 'ongoing'
          ? 'in_progress'
          : 'done',
  }
}

export class ThreadwakeForgeFixtureClient {
  private readonly transport: ForgeFixtureTransport
  private readonly updateLocks = new Map<string, Promise<void>>()
  private readonly createReceipts = new Map<string, ForgeCreateReceipt>()
  private readonly pendingIntentions: ForgePendingIntention[] = []

  constructor(candidate: ForgeTransportCandidate) {
    if (candidate.kind !== 'fixture') {
      throw new ForgeAdapterError(
        'live_transport_forbidden',
        'This Threadwake checkpoint permits only the isolated in-memory Forge fixture transport.',
      )
    }
    this.transport = candidate
  }

  private async serialized<T>(entityId: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.updateLocks.get(entityId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const queued = prior.then(() => gate, () => gate)
    this.updateLocks.set(entityId, queued)
    await prior
    try {
      return await operation()
    } finally {
      release()
      if (this.updateLocks.get(entityId) === queued) this.updateLocks.delete(entityId)
    }
  }

  async importSnapshot(syncedAt: string): Promise<ForgeConfirmedSnapshot> {
    const response = await this.transport.search({
      searches: [{
        entityTypes: ['goal', 'strategy', 'project', 'task', 'tag'],
        includeDeleted: true,
        limit: 200,
        clientRef: 'threadwake-import',
      }],
    })
    const matches = response.results[0]?.matches ?? []
    const entities = matches.map(normalizedEntity).sort((left, right) => left.externalId.localeCompare(right.externalId))
    const tags = new Map(
      matches
        .filter((match) => match.entityType === 'tag' && !match.deleted)
        .map((match) => {
          const tag = decodeForgeTag(match.entity)
          return [tag.id, tag] as const
        }),
    )
    const taskMatches = matches.filter((match) => match.entityType === 'task')
    const decoded = taskMatches.map((match) => ({ match, ...decodeWorkItemMatch(match) }))
    const projectIds = new Set(matches.filter((match) => match.entityType === 'project' && !match.deleted).map((match) => match.id))
    assertValidForgeHierarchy(decoded.map(({ item }) => item), projectIds)

    const work = await Promise.all(decoded.map(async ({ match, item, deletedRecord }) => {
      const activityResponse = await this.transport.getActivity('task', item.id)
      const activity = activityResponse.events.map(decodeForgeActivity)
      return projectForgeLifecycle(
        item,
        tags,
        activity,
        deletedRecord,
        syncedAt,
        FORGE_ADAPTER_CONTRACT_VERSION,
      )
    }))
    work.sort((left, right) => left.externalId.localeCompare(right.externalId))
    return {
      syncState: 'confirmed',
      syncedAt,
      entities,
      work,
      pendingIntentions: clone(this.pendingIntentions),
    }
  }

  async importWithStaleFallback(
    syncedAt: string,
    previous?: ForgeConfirmedSnapshot,
  ): Promise<ForgeSnapshot> {
    try {
      return await this.importSnapshot(syncedAt)
    } catch (error) {
      if (!previous || !(error instanceof ForgeAdapterError) || error.code !== 'offline') throw error
      return {
        ...clone(previous),
        syncState: 'stale',
        staleSince: syncedAt,
        syncError: { code: error.code, message: error.message },
        retryAction: 'reconcile-before-write',
        pendingIntentions: clone(this.pendingIntentions),
      }
    }
  }

  private async hierarchyBeforeCreate(data: ForgeRawRecord, operationId: string): Promise<void> {
    const response = await this.transport.search({
      searches: [{ entityTypes: ['task', 'project'], includeDeleted: true, limit: 200 }],
    })
    const matches = response.results[0]?.matches ?? []
    const items = matches
      .filter((match) => match.entityType === 'task')
      .map((match) => decodeForgeWorkItem(match.entity))
    const projectIds = new Set(matches.filter((match) => match.entityType === 'project' && !match.deleted).map((match) => match.id))
    const now = new Date().toISOString()
    const proposed = decodeForgeWorkItem(workItemWithReadDefaults(data, `pending:${operationId}`, now))
    assertValidForgeHierarchy([...items, proposed], projectIds)
  }

  private async hierarchyContext(): Promise<{
    matches: ForgeSearchMatch[]
    items: ForgeWorkItem[]
    projectIds: Set<string>
  }> {
    const response = await this.transport.search({
      searches: [{ entityTypes: ['task', 'project'], includeDeleted: true, limit: 200 }],
    })
    const matches = response.results[0]?.matches ?? []
    return {
      matches,
      items: matches.filter((match) => match.entityType === 'task').map((match) => decodeForgeWorkItem(match.entity)),
      projectIds: new Set(matches.filter((match) => match.entityType === 'project' && !match.deleted).map((match) => match.id)),
    }
  }

  private async assertHierarchyUpdate(before: ForgeWorkItem, patch: ForgeRawRecord): Promise<void> {
    if (!['level', 'parentWorkItemId', 'projectId'].some((key) => key in patch)) return
    const context = await this.hierarchyContext()
    const proposed = decodeForgeWorkItem({ ...before.raw, ...clone(patch) })
    assertValidForgeHierarchy(
      context.items.map((item) => item.id === before.id ? proposed : item),
      context.projectIds,
    )
  }

  private async liveDescendantIds(id: string): Promise<string[]> {
    const context = await this.hierarchyContext()
    const deleted = new Set(context.matches
      .filter((match) => match.entityType === 'task' && match.deleted)
      .map((match) => match.id))
    const descendants = new Set<string>()
    let changed = true
    while (changed) {
      changed = false
      for (const item of context.items) {
        if (deleted.has(item.id) || descendants.has(item.id)) continue
        if (item.parentWorkItemId === id || (item.parentWorkItemId && descendants.has(item.parentWorkItemId))) {
          descendants.add(item.id)
          changed = true
        }
      }
    }
    return [...descendants].sort()
  }

  async createWorkItem(input: ForgeCreateInput): Promise<{ item: ForgeWorkItem; receipt: ForgeCreateReceipt }> {
    const payloadFingerprint = await canonicalPayloadFingerprint(input.data)
    const idempotencyKey = await directCreateIdempotencyKey(input.clientOperationId)
    const prior = this.createReceipts.get(input.clientOperationId)
    if (!prior) {
      await this.hierarchyBeforeCreate(input.data, input.clientOperationId)
      const existing = await this.transport.search({ searches: [{
        entityTypes: ['task'],
        query: typeof input.data.title === 'string' ? input.data.title : '',
        includeDeleted: true,
        limit: 200,
      }] })
      const exact = existing.results[0]?.matches.find((match) =>
        match.entityType === 'task'
        && match.entity.title === input.data.title
        && match.entity.projectId === input.data.projectId
        && match.entity.parentWorkItemId === input.data.parentWorkItemId)
      if (exact) {
        const item = decodeForgeWorkItem(exact.entity)
        const receipt: ForgeCreateReceipt = {
          clientRef: input.clientRef,
          actor: input.actor,
          source: input.source,
          operationKind: 'create',
          operationHash: await canonicalPayloadFingerprint({ kind: 'create', data: input.data }),
          baseUpdatedAt: null,
          returnedId: item.id,
          finalUpdatedAt: item.updatedAt,
          inverseOperation: { kind: 'soft-delete' },
          timeOfCheckToTimeOfUseLimitation: true,
          idempotencyKey,
          payloadFingerprint,
          replayed: false,
          deduplicatedBySearch: true,
        }
        return { item, receipt }
      }
    }

    const response = await this.transport.directCreateWorkItem({
      data: clone(input.data),
      idempotencyKey,
      payloadFingerprint,
      clientRef: input.clientRef,
    })
    const item = decodeForgeWorkItem(response.entity)
    const receipt: ForgeCreateReceipt = {
      clientRef: input.clientRef,
      actor: input.actor,
      source: input.source,
      operationKind: 'create',
      operationHash: await canonicalPayloadFingerprint({ kind: 'create', data: input.data }),
      baseUpdatedAt: null,
      returnedId: item.id,
      finalUpdatedAt: item.updatedAt,
      inverseOperation: { kind: 'soft-delete' },
      timeOfCheckToTimeOfUseLimitation: true,
      idempotencyKey,
      payloadFingerprint,
      replayed: response.replayed,
      deduplicatedBySearch: false,
    }
    this.createReceipts.set(input.clientOperationId, receipt)
    return { item, receipt }
  }

  async updateWorkItem(input: ForgeUpdateInput): Promise<ForgeUpdateResult> {
    return this.serialized(input.id, async () => {
      const beforeRaw = (await this.transport.getWorkItem(input.id)).task
      const before = decodeForgeWorkItem(beforeRaw)
      if (before.updatedAt !== input.baseUpdatedAt) {
        throw new ForgeAdapterError('concurrency_conflict', 'Forge changed after the Threadwake base snapshot. The update was not sent.', {
          expectedUpdatedAt: input.baseUpdatedAt,
          actualUpdatedAt: before.updatedAt,
          id: input.id,
        })
      }
      const { patch, inverse } = sparsePatch(before.raw, input.changes)
      if (Object.keys(patch).length === 0) {
        const receipt: ForgeAuditReceipt = {
          clientRef: input.clientRef,
          actor: input.actor,
          source: input.source,
          operationKind: 'update',
          operationHash: await canonicalPayloadFingerprint({ kind: 'update', id: input.id, patch }),
          baseUpdatedAt: before.updatedAt,
          returnedId: before.id,
          finalUpdatedAt: before.updatedAt,
          inverseOperation: { kind: 'sparse-update', patch: {} },
          timeOfCheckToTimeOfUseLimitation: true,
        }
        return { item: before, sparsePatch: patch, receipt }
      }

      await this.assertHierarchyUpdate(before, patch)
      if (patch.status === 'done') {
        const context = await this.hierarchyContext()
        const byId = new Map(context.items.map((item) => [item.id, item]))
        const unfinished = (await this.liveDescendantIds(before.id)).filter((id) => byId.get(id)?.status !== 'done')
        if (unfinished.length > 0) {
          throw new ForgeAdapterError('validation_error', 'Threadwake will not complete a parent while live child work remains.', {
            id: before.id,
            unfinishedDescendantIds: unfinished,
          })
        }
      }

      const response = await this.transport.batchUpdate({
        atomic: true,
        operations: [{ entityType: 'task', id: input.id, clientRef: input.clientRef, patch }],
      })
      const result = response.results[0]
      if (!result) throw new ForgeAdapterError('validation_error', 'Forge returned no update result.')
      if (!result.ok) throwMutationFailure(result)
      const after = decodeForgeWorkItem((await this.transport.getWorkItem(input.id)).task)
      const expected = { ...before.raw, ...patch }
      for (const [key, value] of Object.entries(expected)) {
        if (key !== 'updatedAt' && !equivalent(after.raw[key], value)) {
          throw new ForgeAdapterError('concurrency_conflict', 'Forge read-back did not equal the intended sparse update.', {
            id: input.id,
            key,
            intended: value,
            actual: after.raw[key],
          })
        }
      }
      const receipt: ForgeAuditReceipt = {
        clientRef: input.clientRef,
        actor: input.actor,
        source: input.source,
        operationKind: 'update',
        operationHash: await canonicalPayloadFingerprint({ kind: 'update', id: input.id, patch }),
        baseUpdatedAt: before.updatedAt,
        returnedId: after.id,
        finalUpdatedAt: after.updatedAt,
        inverseOperation: { kind: 'sparse-update', patch: inverse },
        timeOfCheckToTimeOfUseLimitation: true,
      }
      return { item: after, sparsePatch: patch, receipt }
    })
  }

  async undoUpdate(receipt: ForgeAuditReceipt, clientRef: string): Promise<ForgeUpdateResult> {
    if (receipt.inverseOperation.kind !== 'sparse-update') {
      throw new ForgeAdapterError('validation_error', 'This Forge receipt is not an update receipt.')
    }
    const current = decodeForgeWorkItem((await this.transport.getWorkItem(receipt.returnedId)).task)
    if (current.updatedAt !== receipt.finalUpdatedAt) {
      throw new ForgeAdapterError('stale_undo', 'Forge changed after this operation. Automatic undo was refused.', {
        expectedUpdatedAt: receipt.finalUpdatedAt,
        actualUpdatedAt: current.updatedAt,
      })
    }
    const result = await this.updateWorkItem({
      id: current.id,
      clientRef,
      actor: receipt.actor,
      source: receipt.source,
      baseUpdatedAt: current.updatedAt,
      changes: receipt.inverseOperation.patch ?? {},
    })
    return {
      ...result,
      receipt: { ...result.receipt, operationKind: 'undo-update' },
    }
  }

  async abandonWorkItem(input: Omit<ForgeUpdateInput, 'changes'>): Promise<ForgeAuditReceipt> {
    return this.serialized(input.id, async () => {
      const before = decodeForgeWorkItem((await this.transport.getWorkItem(input.id)).task)
      if (before.updatedAt !== input.baseUpdatedAt) {
        throw new ForgeAdapterError('concurrency_conflict', 'Forge changed before abandonment. The soft delete was not sent.')
      }
      const descendants = await this.liveDescendantIds(input.id)
      if (descendants.length > 0) {
        throw new ForgeAdapterError('validation_error', 'Threadwake will not abandon a parent while live child work remains.', {
          id: input.id,
          liveDescendantIds: descendants,
        })
      }
      const response = await this.transport.batchDelete({
        atomic: true,
        operations: [{ entityType: 'task', id: input.id, clientRef: input.clientRef, mode: 'soft', reason: 'threadwake:abandoned' }],
      })
      const result = response.results[0]
      if (!result) throw new ForgeAdapterError('validation_error', 'Forge returned no delete result.')
      if (!result.ok) throwMutationFailure(result)
      const readBack = await this.transport.search({ searches: [{ entityTypes: ['task'], ids: [input.id], includeDeleted: true, limit: 1 }] })
      const deletedMatch = readBack.results[0]?.matches[0]
      if (!deletedMatch?.deleted || deletedMatch.deletedRecord?.deleteReason !== 'threadwake:abandoned') {
        throw new ForgeAdapterError('concurrency_conflict', 'Forge abandonment read-back did not contain the expected reversible tombstone.')
      }
      const finalUpdatedAt = deletedMatch.deletedRecord.deletedAt
      return {
        clientRef: input.clientRef,
        actor: input.actor,
        source: input.source,
        operationKind: 'abandon',
        operationHash: await canonicalPayloadFingerprint({ kind: 'abandon', id: input.id, reason: 'threadwake:abandoned' }),
        baseUpdatedAt: before.updatedAt,
        returnedId: input.id,
        finalUpdatedAt,
        inverseOperation: { kind: 'restore' },
        timeOfCheckToTimeOfUseLimitation: true,
      }
    })
  }

  async restoreWorkItem(id: string, clientRef: string, actor: string): Promise<ForgeAuditReceipt> {
    return this.serialized(id, async () => {
      const beforeResponse = await this.transport.search({ searches: [{ entityTypes: ['task'], ids: [id], includeDeleted: true, limit: 1 }] })
      const before = beforeResponse.results[0]?.matches[0]
      if (!before?.deleted || before.deletedRecord?.deleteReason !== 'threadwake:abandoned') {
        throw new ForgeAdapterError('validation_error', 'Threadwake can restore only an explicit threadwake:abandoned tombstone through this action.')
      }
      const response = await this.transport.batchRestore({
        atomic: true,
        operations: [{ entityType: 'task', id, clientRef }],
      })
      const result = response.results[0]
      if (!result) throw new ForgeAdapterError('validation_error', 'Forge returned no restore result.')
      if (!result.ok) throwMutationFailure(result)
      const after = decodeForgeWorkItem((await this.transport.getWorkItem(id)).task)
      const readBack = await this.transport.search({ searches: [{ entityTypes: ['task'], ids: [id], includeDeleted: true, limit: 1 }] })
      if (readBack.results[0]?.matches[0]?.deleted) {
        throw new ForgeAdapterError('concurrency_conflict', 'Forge restore read-back still reports the work item as deleted.')
      }
      return {
        clientRef,
        actor,
        source: 'agent',
        operationKind: 'restore',
        operationHash: await canonicalPayloadFingerprint({ kind: 'restore', id }),
        baseUpdatedAt: before.deletedRecord.deletedAt,
        returnedId: id,
        finalUpdatedAt: after.updatedAt,
        inverseOperation: { kind: 'soft-delete' },
        timeOfCheckToTimeOfUseLimitation: true,
      }
    })
  }

  async rollbackCreate(receipt: ForgeCreateReceipt, clientRef: string): Promise<ForgeAuditReceipt> {
    if (receipt.operationKind !== 'create' || receipt.inverseOperation.kind !== 'soft-delete') {
      throw new ForgeAdapterError('validation_error', 'This receipt cannot roll back a Forge creation.')
    }
    return this.serialized(receipt.returnedId, async () => {
      const current = decodeForgeWorkItem((await this.transport.getWorkItem(receipt.returnedId)).task)
      if (current.updatedAt !== receipt.finalUpdatedAt) {
        throw new ForgeAdapterError('stale_undo', 'The created Forge work item changed, so automatic create rollback was refused.')
      }
      const descendants = await this.liveDescendantIds(current.id)
      if (descendants.length > 0) {
        throw new ForgeAdapterError('stale_undo', 'The created Forge work item acquired dependent work, so automatic rollback was refused.', {
          dependentWorkItemIds: descendants,
        })
      }
      const response = await this.transport.batchDelete({
        atomic: true,
        operations: [{ entityType: 'task', id: current.id, clientRef, mode: 'soft', reason: 'threadwake:rollback-create' }],
      })
      const result = response.results[0]
      if (!result) throw new ForgeAdapterError('validation_error', 'Forge returned no create-rollback result.')
      if (!result.ok) throwMutationFailure(result)
      return {
        clientRef,
        actor: receipt.actor,
        source: receipt.source,
        operationKind: 'rollback-create',
        operationHash: await canonicalPayloadFingerprint({ kind: 'rollback-create', id: current.id }),
        baseUpdatedAt: current.updatedAt,
        returnedId: current.id,
        finalUpdatedAt: result.deletedRecord?.deletedAt ?? current.updatedAt,
        inverseOperation: { kind: 'restore' },
        timeOfCheckToTimeOfUseLimitation: true,
      }
    })
  }

  queueOfflineIntention(input: {
    id: string
    entityExternalId: string
    kind: ForgePendingIntention['kind']
    patch: ForgeRawRecord
    baseUpdatedAt: string | null
    createdAt: string
    expiresAt: string
  }): ForgePendingIntention {
    const lifetimeMs = Date.parse(input.expiresAt) - Date.parse(input.createdAt)
    if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > 24 * 60 * 60 * 1_000) {
      throw new ForgeAdapterError('validation_error', 'An offline Forge intention must expire within 24 hours of creation.')
    }
    const intention: ForgePendingIntention = {
      ...clone(input),
      state: 'pending-offline',
      autoFlush: false,
    }
    this.pendingIntentions.push(intention)
    return clone(intention)
  }
}

export type ForgeReconcileDecision =
  | { kind: 'unchanged'; confirmed: ForgeRawRecord }
  | { kind: 'apply-local'; confirmed: ForgeRawRecord; sparsePatch: ForgeRawRecord }
  | { kind: 'accept-forge'; confirmed: ForgeRawRecord }
  | { kind: 'conflict'; confirmed: ForgeRawRecord; conflictingFields: string[] }

export function reconcileForgeRecord(
  base: ForgeRawRecord,
  confirmed: ForgeRawRecord,
  pendingChanges: ForgeRawRecord,
): ForgeReconcileDecision {
  const local = sparsePatch(base, pendingChanges).patch
  if (Object.keys(local).length === 0) return { kind: 'accept-forge', confirmed: clone(confirmed) }
  const conflictingFields = Object.keys(local).filter((key) =>
    !equivalent(base[key], confirmed[key]) && !equivalent(local[key], confirmed[key]))
  if (conflictingFields.length > 0) {
    return { kind: 'conflict', confirmed: clone(confirmed), conflictingFields: conflictingFields.sort() }
  }
  const unresolved = Object.fromEntries(Object.entries(local).filter(([key, value]) => !equivalent(confirmed[key], value)))
  if (Object.keys(unresolved).length === 0) return { kind: 'unchanged', confirmed: clone(confirmed) }
  return { kind: 'apply-local', confirmed: clone(confirmed), sparsePatch: unresolved }
}
