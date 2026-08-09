import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ForgeAdapterError,
  type ForgeRawRecord,
} from './contracts'
import {
  canonicalPayloadFingerprint,
  directCreateIdempotencyKey,
  lifecycleSparsePatch,
  reconcileForgeRecord,
  ThreadwakeForgeFixtureClient,
} from './client'
import { InMemoryForgeTransport, fixtureTransportForError } from './fixture'
import { decodeForgeWorkItem } from './mapper'

async function createPayload(transport: InMemoryForgeTransport, title: string): Promise<ForgeRawRecord> {
  const template = (await transport.getWorkItem('task-backlog')).task
  const payload = structuredClone(template)
  delete payload.id
  payload.title = title
  payload.description = `${title} fixture create.`
  payload.status = 'focus'
  payload.parentWorkItemId = 'issue-integration'
  payload.createdAt = '2026-08-09T13:00:00.000Z'
  payload.updatedAt = '2026-08-09T13:00:00.000Z'
  return payload
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fixture-only Forge import and reconciliation', () => {
  it('imports a deterministic snapshot sorted by immutable external identity', async () => {
    const client = new ThreadwakeForgeFixtureClient(new InMemoryForgeTransport())
    const snapshot = await client.importSnapshot('2026-08-09T14:00:00.000Z')

    expect(snapshot.syncState).toBe('confirmed')
    expect(snapshot.entities.map((entity) => entity.externalId)).toEqual(
      [...snapshot.entities.map((entity) => entity.externalId)].sort(),
    )
    expect(new Set(snapshot.entities.map((entity) => entity.externalId)).size).toBe(snapshot.entities.length)
    expect(snapshot.work.find((item) => item.forgeId === 'issue-integration')).toMatchObject({
      externalId: 'task:issue-integration',
      lifecycle: 'planned',
    })
    expect(snapshot.work.find((item) => item.forgeId === 'task-abandoned')).toMatchObject({
      lifecycle: 'abandoned',
      projectionKind: 'abandoned-soft-delete',
      abandonmentReason: 'threadwake:abandoned',
    })
  })

  it('retains the last confirmed snapshot as explicitly stale after a transient offline error', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const confirmed = await client.importSnapshot('2026-08-09T14:00:00.000Z')
    transport.setOffline(true)

    const stale = await client.importWithStaleFallback('2026-08-09T14:05:00.000Z', confirmed)
    expect(stale).toMatchObject({
      syncState: 'stale',
      staleSince: '2026-08-09T14:05:00.000Z',
      syncError: { code: 'offline' },
      retryAction: 'reconcile-before-write',
    })
    expect(stale.entities).toEqual(confirmed.entities)
  })

  it('separates bounded offline intentions from confirmed Forge state and never auto-flushes them', () => {
    const client = new ThreadwakeForgeFixtureClient(new InMemoryForgeTransport())
    const intention = client.queueOfflineIntention({
      id: 'pending-1',
      entityExternalId: 'task:task-backlog',
      kind: 'update',
      patch: { title: 'Pending local title' },
      baseUpdatedAt: '2026-08-09T08:10:00.000Z',
      createdAt: '2026-08-09T14:00:00.000Z',
      expiresAt: '2026-08-09T15:00:00.000Z',
    })
    expect(intention).toMatchObject({ state: 'pending-offline', autoFlush: false })
    expect(() => client.queueOfflineIntention({
      ...intention,
      id: 'expired',
      createdAt: '2026-08-09T15:00:00.000Z',
      expiresAt: '2026-08-09T14:00:00.000Z',
    })).toThrow('expire within 24 hours')
  })

  it('detects local/remote field conflicts and permits only non-overlapping reconciliation', () => {
    const base = { id: 'task-1', title: 'Base', status: 'focus', updatedAt: 't1', unknown: { keep: true } }
    expect(reconcileForgeRecord(base, { ...base, updatedAt: 't2' }, { title: 'Local' })).toMatchObject({
      kind: 'apply-local',
      sparsePatch: { title: 'Local' },
    })
    expect(reconcileForgeRecord(base, { ...base, title: 'Remote', updatedAt: 't2' }, { title: 'Local' })).toEqual({
      kind: 'conflict',
      confirmed: { ...base, title: 'Remote', updatedAt: 't2' },
      conflictingFields: ['title'],
    })
    expect(reconcileForgeRecord(base, { ...base, title: 'Local', updatedAt: 't2' }, { title: 'Local' })).toMatchObject({
      kind: 'unchanged',
    })
  })
})

describe('direct create idempotency and search-before-create', () => {
  it('derives the stable key from operation identity, keeps the payload fingerprint separate, and conflicts on changed reuse', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const data = await createPayload(transport, 'Create fixture adapter task')
    const input = {
      clientOperationId: 'durable-operation-001',
      clientRef: 'create-001',
      actor: 'threadwake-agent',
      source: 'agent' as const,
      data,
    }

    const first = await client.createWorkItem(input)
    const replay = await client.createWorkItem(input)
    expect(first.receipt).toMatchObject({ replayed: false, deduplicatedBySearch: false })
    expect(replay.receipt).toMatchObject({ replayed: true, deduplicatedBySearch: false })
    expect(replay.item.id).toBe(first.item.id)
    expect(first.receipt.idempotencyKey).toBe(await directCreateIdempotencyKey(input.clientOperationId))
    expect(first.receipt.payloadFingerprint).toBe(await canonicalPayloadFingerprint(data))

    const changedData = { ...data, title: 'Changed data under same logical operation' }
    expect(await directCreateIdempotencyKey(input.clientOperationId)).toBe(first.receipt.idempotencyKey)
    expect(await canonicalPayloadFingerprint(changedData)).not.toBe(first.receipt.payloadFingerprint)
    await expect(client.createWorkItem({ ...input, data: changedData })).rejects.toMatchObject({
      code: 'idempotency_conflict',
    })
  })

  it('finds an exact existing work item before a new client creates a duplicate', async () => {
    const transport = new InMemoryForgeTransport()
    const data = await createPayload(transport, 'Search-before-create task')
    const first = await new ThreadwakeForgeFixtureClient(transport).createWorkItem({
      clientOperationId: 'first-client-operation',
      clientRef: 'first-client',
      actor: 'threadwake-agent',
      source: 'agent',
      data,
    })
    const second = await new ThreadwakeForgeFixtureClient(transport).createWorkItem({
      clientOperationId: 'second-client-operation',
      clientRef: 'second-client',
      actor: 'threadwake-agent',
      source: 'agent',
      data,
    })
    expect(second.item.id).toBe(first.item.id)
    expect(second.receipt).toMatchObject({ deduplicatedBySearch: true, replayed: false })
  })

  it('rolls back a new create only while it is unchanged and has no dependent user work', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const standalone = await client.createWorkItem({
      clientOperationId: 'rollback-safe-create',
      clientRef: 'rollback-safe-create',
      actor: 'threadwake-agent',
      source: 'agent',
      data: await createPayload(transport, 'Rollback-safe fixture task'),
    })
    const rollback = await client.rollbackCreate(standalone.receipt, 'rollback-safe')
    expect(rollback).toMatchObject({
      operationKind: 'rollback-create',
      inverseOperation: { kind: 'restore' },
    })
    const deleted = await transport.search({ searches: [{ entityTypes: ['task'], ids: [standalone.item.id], includeDeleted: true, limit: 1 }] })
    expect(deleted.results[0]?.matches[0]).toMatchObject({
      deleted: true,
      deletedRecord: { deleteReason: 'threadwake:rollback-create' },
    })

    const parent = await client.createWorkItem({
      clientOperationId: 'rollback-parent-create',
      clientRef: 'rollback-parent-create',
      actor: 'threadwake-agent',
      source: 'agent',
      data: await createPayload(transport, 'Created parent with future child'),
    })
    const childTemplate = (await transport.getWorkItem('subtask-validation')).task
    const childData = {
      ...childTemplate,
      id: undefined,
      title: 'Dependent child created later',
      parentWorkItemId: parent.item.id,
      createdAt: '2026-08-09T13:05:00.000Z',
      updatedAt: '2026-08-09T13:05:00.000Z',
    }
    await client.createWorkItem({
      clientOperationId: 'rollback-dependent-create',
      clientRef: 'rollback-dependent-create',
      actor: 'threadwake-agent',
      source: 'agent',
      data: childData,
    })
    await expect(client.rollbackCreate(parent.receipt, 'rollback-parent-refused')).rejects.toMatchObject({
      code: 'stale_undo',
    })
  })

  it('does not misrepresent batch task idempotency and rolls back an atomic batch exactly', async () => {
    const transport = new InMemoryForgeTransport()
    const before = transport.count('tag')
    const repeated = {
      atomic: false,
      operations: [{
        entityType: 'tag' as const,
        clientRef: 'batch-non-idempotent',
        idempotencyKey: 'ignored-for-this-capability',
        data: { name: 'fixture-tag', kind: 'category', color: '#777777', description: '', userId: 'user-fixture-owner' },
      }],
    }
    const first = await transport.batchCreate(repeated)
    const second = await transport.batchCreate(repeated)
    expect(first.results[0]?.id).not.toBe(second.results[0]?.id)
    expect(transport.count('tag')).toBe(before + 2)

    const beforeAtomic = transport.count('tag')
    const atomic = await transport.batchCreate({
      atomic: true,
      operations: [
        { entityType: 'tag', clientRef: 'will-roll-back', data: { id: 'tag-atomic-first', name: 'first' } },
        { entityType: 'tag', clientRef: 'fails', data: { id: 'tag-bug', name: 'duplicate' } },
        { entityType: 'tag', clientRef: 'skipped', data: { id: 'tag-atomic-last', name: 'last' } },
      ],
    })
    expect(atomic.results.map((result) => result.ok ? 'ok' : result.error.code)).toEqual([
      'rolled_back',
      'validation_error',
      'not_executed',
    ])
    expect(transport.count('tag')).toBe(beforeAtomic)
  })
})

describe('sparse concurrency, lifecycle, permissions, and rollback', () => {
  it('sends only changed fields, records an exact inverse, and performs safe undo', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const before = decodeForgeWorkItem((await transport.getWorkItem('task-ongoing')).task)
    const updated = await client.updateWorkItem({
      id: before.id,
      clientRef: 'update-title',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: before.updatedAt,
      changes: { title: 'Adapter implementation updated', status: before.status },
    })
    expect(updated.sparsePatch).toEqual({ title: 'Adapter implementation updated' })
    expect(updated.receipt).toMatchObject({
      baseUpdatedAt: before.updatedAt,
      returnedId: before.id,
      inverseOperation: { kind: 'sparse-update', patch: { title: before.title } },
      timeOfCheckToTimeOfUseLimitation: true,
    })
    const undone = await client.undoUpdate(updated.receipt, 'undo-title')
    expect(undone.item.title).toBe(before.title)
    expect(undone.receipt.operationKind).toBe('undo-update')
  })

  it('refuses stale pre-write updates and stale inverse undo', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const initial = decodeForgeWorkItem((await transport.getWorkItem('task-ongoing')).task)
    transport.mutateWithoutAdapter('task', initial.id, { description: 'Concurrent Forge edit.' })
    await expect(client.updateWorkItem({
      id: initial.id,
      clientRef: 'stale-update',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: initial.updatedAt,
      changes: { title: 'Should not write' },
    })).rejects.toMatchObject({ code: 'concurrency_conflict' })

    const fresh = decodeForgeWorkItem((await transport.getWorkItem(initial.id)).task)
    const updated = await client.updateWorkItem({
      id: fresh.id,
      clientRef: 'fresh-update',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: fresh.updatedAt,
      changes: { title: 'Fresh safe update' },
    })
    transport.mutateWithoutAdapter('task', fresh.id, { description: 'Later external edit.' })
    await expect(client.undoUpdate(updated.receipt, 'stale-undo')).rejects.toMatchObject({ code: 'stale_undo' })
  })

  it('revalidates the whole hierarchy before reparenting and rejects terminal parents with live descendants', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const task = decodeForgeWorkItem((await transport.getWorkItem('task-ongoing')).task)
    await expect(client.updateWorkItem({
      id: task.id,
      clientRef: 'wrong-parent-level',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: task.updatedAt,
      changes: { parentWorkItemId: 'task-solved-bug' },
    })).rejects.toMatchObject({ code: 'validation_error' })

    const issue = decodeForgeWorkItem((await transport.getWorkItem('issue-integration')).task)
    await expect(client.updateWorkItem({
      id: issue.id,
      clientRef: 'terminal-parent',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: issue.updatedAt,
      changes: { status: 'done' },
    })).rejects.toMatchObject({ code: 'validation_error' })
    await expect(client.abandonWorkItem({
      id: issue.id,
      clientRef: 'abandon-live-parent',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: issue.updatedAt,
    })).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('requires explicit review evidence and uses soft deletion rather than invented statuses for abandonment', async () => {
    const transport = new InMemoryForgeTransport()
    const item = decodeForgeWorkItem((await transport.getWorkItem('task-ongoing')).task)
    expect(() => lifecycleSparsePatch(item, 'awaiting-review')).toThrow('requires an explicit execution marker')
    expect(lifecycleSparsePatch(item, 'awaiting-review', {
      markerTagId: 'tag-awaiting-review',
      markerTagName: 'awaiting-review',
      blockerLink: { entityType: 'task', entityId: 'subtask-validation', label: 'Review evidence' },
    })).toMatchObject({
      status: 'blocked',
      tagIds: expect.arrayContaining(['tag-awaiting-review']),
      blockerLinks: expect.arrayContaining([{ entityType: 'task', entityId: 'subtask-validation', label: 'Review evidence' }]),
    })
    expect(() => lifecycleSparsePatch(item, 'abandoned')).toThrow('soft deletion')
  })

  it('soft-deletes abandonment, imports it truthfully, and restores it reversibly', async () => {
    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    const before = decodeForgeWorkItem((await transport.getWorkItem('task-backlog')).task)
    const receipt = await client.abandonWorkItem({
      id: before.id,
      clientRef: 'abandon-backlog',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: before.updatedAt,
    })
    expect(receipt).toMatchObject({ operationKind: 'abandon', inverseOperation: { kind: 'restore' } })
    expect((await client.importSnapshot('2026-08-09T15:00:00.000Z')).work.find((item) => item.forgeId === before.id)).toMatchObject({
      lifecycle: 'abandoned',
      projectionKind: 'abandoned-soft-delete',
    })
    const restored = await client.restoreWorkItem(before.id, 'restore-backlog', 'threadwake-agent')
    expect(restored).toMatchObject({ operationKind: 'restore', inverseOperation: { kind: 'soft-delete' } })
    expect((await client.importSnapshot('2026-08-09T15:01:00.000Z')).work.find((item) => item.forgeId === before.id)).toMatchObject({
      lifecycle: 'backlog',
      projectionKind: 'native',
    })
  })

  it('refuses to restore unrelated soft deletions through the abandonment action', async () => {
    const transport = new InMemoryForgeTransport()
    const response = await transport.batchDelete({
      atomic: true,
      operations: [{ entityType: 'task', id: 'task-backlog', mode: 'soft', reason: 'user-cleanup' }],
    })
    expect(response.results[0]?.ok).toBe(true)
    await expect(new ThreadwakeForgeFixtureClient(transport).restoreWorkItem(
      'task-backlog',
      'restore-unrelated',
      'threadwake-agent',
    )).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('surfaces permission denial, token-scope denial, validation failure, and offline state without optimistic success', async () => {
    const restrictedTransport = new InMemoryForgeTransport()
    const restrictedClient = new ThreadwakeForgeFixtureClient(restrictedTransport)
    const restricted = decodeForgeWorkItem((await restrictedTransport.getWorkItem('task-read-only')).task)
    expect(restricted.assigneeUserIds).toEqual(['user-fixture-owner'])
    await expect(restrictedClient.updateWorkItem({
      id: restricted.id,
      clientRef: 'assignment-view-only',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: restricted.updatedAt,
      changes: { title: 'Must remain unchanged' },
    })).rejects.toMatchObject({ code: 'permission_denied' })

    const permissionTransport = fixtureTransportForError('permission_denied')
    const permissionClient = new ThreadwakeForgeFixtureClient(permissionTransport)
    const item = decodeForgeWorkItem((await permissionTransport.getWorkItem('task-ongoing')).task)
    await expect(permissionClient.updateWorkItem({
      id: item.id,
      clientRef: 'denied',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: item.updatedAt,
      changes: { title: 'Denied' },
    })).rejects.toMatchObject({ code: 'permission_denied' })
    await expect(new ThreadwakeForgeFixtureClient(
      fixtureTransportForError('token_scope_denied'),
    ).importSnapshot('2026-08-09T15:00:00.000Z')).rejects.toMatchObject({ code: 'token_scope_denied' })
    await expect(new ThreadwakeForgeFixtureClient(
      fixtureTransportForError('offline'),
    ).importSnapshot('2026-08-09T15:00:00.000Z')).rejects.toMatchObject({ code: 'offline' })

    await expect(new InMemoryForgeTransport().directCreateWorkItem({
      data: { title: '' },
      idempotencyKey: 'invalid',
      payloadFingerprint: 'sha256:invalid',
      clientRef: 'invalid',
    })).rejects.toMatchObject({ code: 'validation_error' })
  })
})

describe('live transport prohibition', () => {
  it('rejects live candidates and never calls fetch, XMLHttpRequest, WebSocket, a filesystem, MCP, or a Forge service', async () => {
    expect(() => new ThreadwakeForgeFixtureClient({ kind: 'live' })).toThrowError(
      expect.objectContaining({ code: 'live_transport_forbidden' }),
    )
    const fetchSpy = vi.fn(() => { throw new Error('Network access is forbidden in adapter tests.') })
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('XHR is forbidden.') } })
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('WebSocket is forbidden.') } })

    const transport = new InMemoryForgeTransport()
    const client = new ThreadwakeForgeFixtureClient(transport)
    await client.importSnapshot('2026-08-09T16:00:00.000Z')
    const item = decodeForgeWorkItem((await transport.getWorkItem('task-backlog')).task)
    await client.updateWorkItem({
      id: item.id,
      clientRef: 'fixture-only-update',
      actor: 'threadwake-agent',
      source: 'agent',
      baseUpdatedAt: item.updatedAt,
      changes: { title: 'Still only memory' },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
