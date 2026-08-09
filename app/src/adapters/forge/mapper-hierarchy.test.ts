import { describe, expect, it } from 'vitest'

import {
  FORGE_CAPABILITIES,
  FORGE_CONTRACT_PROVENANCE,
  FORGE_PERMISSION_CONTRACT,
  FORGE_SUPPORTED_SURFACES,
  ForgeAdapterError,
  forgeExternalId,
  type ForgeDeletedEntityRecord,
} from './contracts'
import { inspectForgeHierarchy, inspectForgeStrategyGraph } from './hierarchy'
import { InMemoryForgeTransport } from './fixture'
import {
  decodeForgeActivity,
  decodeForgeTag,
  decodeForgeWorkItem,
  projectForgeLifecycle,
  rawRoundTrip,
} from './mapper'

async function fixtureWorkItems() {
  const transport = new InMemoryForgeTransport()
  const response = await transport.search({ searches: [{ entityTypes: ['task'], includeDeleted: true, limit: 200 }] })
  return response.results[0]?.matches.map((match) => decodeForgeWorkItem(match.entity)) ?? []
}

describe('Forge contract and lifecycle mapper', () => {
  it('states the verified fixture-only capability boundary without inventing an epic/group entity', () => {
    expect(FORGE_CAPABILITIES).toMatchObject({
      runtimeMode: 'fixture-only',
      hasEpicOrGroupEntity: false,
      hasAwaitingReviewStatus: false,
      hasAbandonedStatus: false,
      directTaskCreateIdempotency: true,
      batchTaskCreateIdempotency: false,
      ordinaryUpdatePrecondition: false,
      liveTransportAllowed: false,
    })
    expect(FORGE_CONTRACT_PROVENANCE.forgeCommit).toBe('dc893aea')
    expect(FORGE_CONTRACT_PROVENANCE.dirtyCheckoutWarning).toContain('read-only and dirty')
    expect(forgeExternalId('task', 'same-id')).toBe('task:same-id')
    expect(forgeExternalId('project', 'same-id')).toBe('project:same-id')
    expect(FORGE_SUPPORTED_SURFACES.mcp.completeTaskRun).toBe('forge_complete_task_run')
    expect(FORGE_SUPPORTED_SURFACES.taskRunSemantics).toEqual({
      releaseCompletesTask: false,
      completionStoresCloseoutAtomically: true,
    })
    expect(FORGE_PERMISSION_CONTRACT.tokenScopePolicyDimensions).toEqual(['userIds', 'projectIds', 'tagIds'])
  })

  it('preserves exact IDs, ownership, unknown fields, completion evidence, and raw round trips', async () => {
    const transport = new InMemoryForgeTransport()
    const issue = decodeForgeWorkItem((await transport.getWorkItem('issue-integration')).task)
    const solved = decodeForgeWorkItem((await transport.getWorkItem('task-solved-bug')).task)

    expect(issue.id).toBe('issue-integration')
    expect(issue.ownerUserId).toBe('user-fixture-owner')
    expect(issue.assigneeUserIds).toEqual(['user-threadwake-agent'])
    expect(issue.raw.fixtureUnknown).toEqual({ roundTrip: 'keep-me' })
    expect(rawRoundTrip(issue)).toEqual(issue.raw)
    expect(solved.completionReport).toMatchObject({
      workSummary: 'Completed against the deterministic fixture.',
      linkedGitRefIds: ['git-ref-solved-bug'],
    })
    expect(solved.gitRefs[0]).toMatchObject({ refType: 'commit', refValue: 'dc893aea' })
  })

  it('maps all six Threadwake lifecycles while keeping native blocked and unrelated deletion distinct', async () => {
    const transport = new InMemoryForgeTransport()
    const response = await transport.search({ searches: [{ entityTypes: ['task', 'tag'], includeDeleted: true, limit: 200 }] })
    const matches = response.results[0]?.matches ?? []
    const tags = new Map(matches
      .filter((match) => match.entityType === 'tag')
      .map((match) => {
        const tag = decodeForgeTag(match.entity)
        return [tag.id, tag] as const
      }))

    const projections = await Promise.all(matches
      .filter((match) => match.entityType === 'task')
      .map(async (match) => {
        const item = decodeForgeWorkItem(match.entity)
        const activity = (await transport.getActivity('task', item.id)).events.map(decodeForgeActivity)
        return projectForgeLifecycle(item, tags, activity, match.deletedRecord, '2026-08-09T12:00:00.000Z', 'test-v1')
      }))
    const byId = new Map(projections.map((projection) => [projection.forgeId, projection]))

    expect(new Set(projections.map((projection) => projection.lifecycle).filter(Boolean))).toEqual(
      new Set(['planned', 'ongoing', 'awaiting-review', 'backlog', 'done', 'abandoned']),
    )
    expect(byId.get('task-review')).toMatchObject({
      lifecycle: 'awaiting-review',
      projectionKind: 'awaiting-review-marker',
      reviewMarker: 'awaiting-review',
      nativeBlocked: false,
    })
    expect(byId.get('task-native-blocked')).toMatchObject({
      lifecycle: 'ongoing',
      projectionKind: 'native-blocked',
      reviewMarker: null,
      nativeBlocked: true,
    })
    expect(byId.get('task-solved-bug')).toMatchObject({ lifecycle: 'done', role: 'bug' })
    expect(byId.get('subtask-validation')).toMatchObject({ lifecycle: 'done', role: 'validation' })
    expect(byId.get('subtask-report')).toMatchObject({ lifecycle: 'done', role: 'report' })

    const backlog = byId.get('task-backlog')
    expect(backlog).toBeDefined()
    const unrelatedDeletion: ForgeDeletedEntityRecord = {
      entityType: 'task',
      entityId: 'task-backlog',
      title: 'Consider live transport later',
      subtitle: '',
      deletedAt: '2026-08-09T12:00:00.000Z',
      deletedByActor: 'someone',
      deletedSource: 'ui',
      deleteReason: 'user-cleanup',
      snapshot: backlog?.workItem.raw ?? {},
    }
    const unrelated = projectForgeLifecycle(
      backlog!.workItem,
      tags,
      backlog!.activity,
      unrelatedDeletion,
      '2026-08-09T12:00:00.000Z',
      'test-v1',
    )
    expect(unrelated).toMatchObject({ lifecycle: null, projectionKind: 'unrelated-deleted', deleted: true })
  })

  it('rejects unknown Forge statuses and levels without discarding the raw value', async () => {
    const transport = new InMemoryForgeTransport()
    const raw = (await transport.getWorkItem('task-backlog')).task
    const unsupported = { ...raw, status: 'awaiting_review', unknownPayload: { retained: 7 } }

    try {
      decodeForgeWorkItem(unsupported)
      throw new Error('Expected unsupported contract value.')
    } catch (error) {
      expect(error).toBeInstanceOf(ForgeAdapterError)
      expect(error).toMatchObject({ code: 'unsupported_contract_value' })
      expect((error as ForgeAdapterError).details.raw).toMatchObject({
        status: 'awaiting_review',
        unknownPayload: { retained: 7 },
      })
    }
  })
})

describe('strict Forge hierarchy and strategy DAG preflight', () => {
  it('accepts only the complete issue → task → subtask fixture tree', async () => {
    expect(inspectForgeHierarchy(await fixtureWorkItems(), new Set(['project-threadwake']))).toEqual([])
  })

  it('finds missing parents, roots, wrong levels, project crossings, self-parenting, orphans, and transitive cycles', async () => {
    const base = await fixtureWorkItems()
    const replace = (id: string, changes: Partial<(typeof base)[number]>) =>
      base.map((item) => item.id === id ? { ...item, ...changes } : item)

    expect(inspectForgeHierarchy(
      replace('task-ongoing', { parentWorkItemId: 'missing-parent' }),
      new Set(['project-threadwake']),
    ).map((issue) => issue.code)).toContain('missing_parent')
    expect(inspectForgeHierarchy(
      replace('task-ongoing', { parentWorkItemId: null }),
      new Set(['project-threadwake']),
    ).map((issue) => issue.code)).toContain('orphan')
    expect(inspectForgeHierarchy(
      replace('subtask-validation', { parentWorkItemId: 'issue-integration' }),
      new Set(['project-threadwake']),
    ).map((issue) => issue.code)).toContain('wrong_parent_level')
    expect(inspectForgeHierarchy(
      replace('task-ongoing', { projectId: 'project-other' }),
      new Set(['project-threadwake', 'project-other']),
    ).map((issue) => issue.code)).toContain('cross_project_parent')
    expect(inspectForgeHierarchy(
      replace('task-ongoing', { parentWorkItemId: 'task-ongoing' }),
      new Set(['project-threadwake']),
    ).map((issue) => issue.code)).toContain('self_parent')

    const cycle = base.map((item) => {
      if (item.id === 'issue-integration') return { ...item, parentWorkItemId: 'task-ongoing' }
      return item
    })
    expect(inspectForgeHierarchy(cycle, new Set(['project-threadwake'])).map((issue) => issue.code)).toContain('transitive_cycle')
    expect(inspectForgeHierarchy(
      replace('task-backlog', { projectId: 'missing-project' }),
      new Set(['project-threadwake']),
    ).map((issue) => issue.code)).toContain('missing_project')
  })

  it('separately validates Forge strategy graph identity and acyclicity', () => {
    const nodes = [
      { id: 'a', entityType: 'project' as const, entityId: 'p', title: '', branchLabel: '', notes: '' },
      { id: 'b', entityType: 'task' as const, entityId: 't', title: '', branchLabel: '', notes: '' },
    ]
    const known = new Set(['project:p', 'task:t'])
    expect(inspectForgeStrategyGraph(nodes, [{ from: 'a', to: 'b', label: '', condition: '' }], known)).toEqual([])
    expect(inspectForgeStrategyGraph(nodes, [
      { from: 'a', to: 'b', label: '', condition: '' },
      { from: 'b', to: 'a', label: '', condition: '' },
    ], known).map((issue) => issue.code)).toEqual(expect.arrayContaining(['missing_start', 'missing_terminal', 'cycle']))
  })
})
