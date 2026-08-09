import type { AppAction, AppState } from './domain'
import { createInitialState } from './seed'
import {
  appReducer,
  selectAvailableTransferArtifacts,
  selectQueueBlockReason,
  selectSearchResults,
  selectTransferById,
  selectTransferSummary,
  selectVisibleNodes,
  selectVisibleRelations,
} from './state'

function reduce(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state)
}

describe('Threadwake deterministic fixture', () => {
  it('contains the required recoverable project shape and rich evidence', () => {
    const state = createInitialState()
    const historicalPrimary = state.nodes.filter((node) => !node.satelliteOfNodeId && node.status !== 'planned')
    const satellites = state.nodes.filter((node) => node.satelliteOfNodeId)
    expect(historicalPrimary).toHaveLength(24)
    expect(satellites).toHaveLength(6)
    expect(state.nodes).toHaveLength(32)
    expect(state.workstreams).toHaveLength(5)
    expect(state.sourceThreads).toHaveLength(5)
    expect(state.groups).toHaveLength(1)
    expect(state.queue).toHaveLength(2)
    expect(new Set(state.artifacts.map((artifact) => artifact.kind))).toEqual(
      new Set(['goal', 'csv', 'report', 'figure', 'manifest', 'code']),
    )

    const failure = state.nodes.find((node) => node.id === 'node-renderer-failure')
    expect(state.selectedNodeId).toBe(failure?.id)
    expect(failure?.outcome).toContain('12–18 frames per second')
    expect(failure?.outcome).toContain('labels became unreadable')
    expect(failure?.failureReason).toContain('label collision')
    expect(failure?.artifactIds).toEqual(expect.arrayContaining([
      'artifact-renderer-csv',
      'artifact-label-figure',
      'artifact-renderer-report',
    ]))
  })
})

describe('planned actions and ordered queue execution', () => {
  it('Plan next action creates an editable inert draft and never executes it', () => {
    const before = createInitialState()
    const after = appReducer(before, {
      type: 'PLAN_NEXT_ACTION',
      parentNodeId: 'node-renderer-failure',
      title: 'Prepare a label-density experiment',
      prompt: 'Write a precise experiment prompt, but do not run it.',
      executionKind: 'plan',
    })

    const item = after.queue.at(-1)
    const node = after.nodes.find((candidate) => candidate.id === item?.nodeId)
    const relation = after.relations.find((candidate) => candidate.id === item?.relationId)
    expect(after.queue).toHaveLength(before.queue.length + 1)
    expect(item).toMatchObject({
      order: before.queue.length,
      parentNodeId: 'node-renderer-failure',
      executionKind: 'plan',
      selected: false,
      status: 'draft',
      progress: 0,
      playRequested: false,
      outputArtifactIds: [],
    })
    expect(node?.status).toBe('planned')
    expect(node?.parentNodeId).toBe('node-renderer-failure')
    expect(relation).toMatchObject({
      sourceNodeId: 'node-renderer-failure',
      targetNodeId: node?.id,
    })
    expect(after.selectedNodeId).toBe(node?.id)
    expect(after.focus).toMatchObject({ level: 'node', nodeId: node?.id, workstreamId: node?.workstreamId })
    expect(node?.artifactIds).toEqual([])
    expect(node?.activity.at(-1)?.message).toContain('No timer or agent was started')
    expect(after.queue.some((candidate) => candidate.status === 'simulated-running')).toBe(false)
  })

  it('binds a queued child to its exact dragged parent and focuses the created branch', () => {
    const parentState = appReducer(createInitialState(), {
      type: 'PLAN_NEXT_ACTION',
      parentNodeId: 'node-search-index',
      title: 'Prepare the parent plan',
      prompt: 'Prepare only.',
    })
    const parentItem = parentState.queue.at(-1)
    const state = appReducer(parentState, {
      type: 'ADD_QUEUE_CHILD',
      parentQueueItemId: parentItem?.id as string,
      title: 'Prepare the exact child plan',
      prompt: 'Prepare this child without running it.',
    })
    const childItem = state.queue.at(-1)
    const child = state.nodes.find((candidate) => candidate.id === childItem?.nodeId)
    const relation = state.relations.find((candidate) => candidate.id === childItem?.relationId)

    expect(childItem).toMatchObject({
      parentQueueItemId: parentItem?.id,
      parentNodeId: parentItem?.nodeId,
      status: 'draft',
      playRequested: false,
    })
    expect(child?.parentNodeId).toBe(parentItem?.nodeId)
    expect(relation).toMatchObject({ sourceNodeId: parentItem?.nodeId, targetNodeId: child?.id })
    expect(state.selectedNodeId).toBe(child?.id)
    expect(state.focus).toMatchObject({ level: 'node', nodeId: child?.id, workstreamId: child?.workstreamId })
    expect(state.queue.some((candidate) => candidate.status === 'simulated-running')).toBe(false)
  })

  it('keeps stable contiguous order and refuses to move a child ahead of its dependency', () => {
    const withIndependentItems = reduce(
      createInitialState(),
      {
        type: 'PLAN_NEXT_ACTION',
        parentNodeId: 'node-search-index',
        title: 'Independent search plan',
        prompt: 'Prepare search follow-up.',
      },
      {
        type: 'PLAN_NEXT_ACTION',
        parentNodeId: 'node-grouping-design',
        title: 'Independent grouping plan',
        prompt: 'Prepare grouping follow-up.',
      },
    )
    const lastId = withIndependentItems.queue.at(-1)?.id as string
    const reordered = appReducer(withIndependentItems, { type: 'REORDER_QUEUE_ITEM', queueItemId: lastId, toIndex: 2 })
    expect(reordered.queue.map((item) => item.order)).toEqual([0, 1, 2, 3])
    expect(reordered.queue[2]?.id).toBe(lastId)

    const rejected = appReducer(reordered, {
      type: 'REORDER_QUEUE_ITEM',
      queueItemId: 'queue-review-handoff',
      toIndex: 0,
    })
    expect(rejected.queue.map((item) => item.id)).toEqual(reordered.queue.map((item) => item.id))
    expect(rejected.announcement).toContain('child before its dependency')
  })

  it('Play selected starts selected items only', () => {
    const before = createInitialState()
    const after = appReducer(before, { type: 'PLAY_SELECTED' })
    expect(after.queue[0]?.status).toBe('simulated-running')
    expect(after.queue[0]?.playRequested).toBe(true)
    expect(after.queue[1]?.status).toBe('draft')
    expect(after.queue[1]?.playRequested).toBe(false)
    expect(after.nodes.find((node) => node.id === after.queue[0]?.nodeId)?.status).toBe('working')
    expect(after.nodes.find((node) => node.id === after.queue[1]?.nodeId)?.status).toBe('planned')
  })

  it('runs an explicitly selected chain in dependency order after the required parent output appears', () => {
    let state = appReducer(createInitialState(), { type: 'TOGGLE_QUEUE_SELECTION', queueItemId: 'queue-review-handoff' })
    state = appReducer(state, { type: 'PLAY_SELECTED' })
    expect(state.queue[0]?.status).toBe('simulated-running')
    expect(state.queue[1]?.status).toBe('queued')
    expect(state.queue[1]?.blockedReason).toContain('missing')

    state = appReducer(state, {
      type: 'DISCOVER_QUEUE_OUTPUT',
      queueItemId: 'queue-progressive-handoff',
      artifact: {
        id: 'artifact-planned-handoff-report',
        name: 'Discovered handoff report',
        kind: 'report',
        path: 'artifacts/demo/discovered-handoff.md',
        summary: 'The report required by the chained review.',
      },
    })
    expect(selectTransferById(state, 'transfer-relation-review-plan')?.artifacts[0]?.resolution).toBe('resolved')
    expect(state.queue[1]?.status).toBe('queued')
    expect(state.queue[1]?.blockedReason).toContain('complete first')

    state = appReducer(state, { type: 'COMPLETE_QUEUE_ITEM', queueItemId: 'queue-progressive-handoff' })
    expect(state.queue[0]?.status).toBe('completed')
    expect(state.queue[1]?.status).toBe('simulated-running')
  })

  it('leaves a later chained item queued when it is deselected before its dependency finishes', () => {
    let state = reduce(
      createInitialState(),
      { type: 'TOGGLE_QUEUE_SELECTION', queueItemId: 'queue-review-handoff' },
      { type: 'PLAY_SELECTED' },
      { type: 'TOGGLE_QUEUE_SELECTION', queueItemId: 'queue-review-handoff' },
      {
        type: 'DISCOVER_QUEUE_OUTPUT',
        queueItemId: 'queue-progressive-handoff',
        artifact: {
          id: 'artifact-planned-handoff-report',
          name: 'Discovered handoff report',
          kind: 'report',
          path: 'artifacts/demo/discovered-handoff.md',
          summary: 'The report required by the chained review.',
        },
      },
    )
    expect(state.queue[1]?.selected).toBe(false)
    expect(state.queue[1]?.playRequested).toBe(false)
    state = appReducer(state, { type: 'COMPLETE_QUEUE_ITEM', queueItemId: 'queue-progressive-handoff' })
    expect(state.queue[1]?.status).toBe('queued')
  })
})

describe('explicit context transfer and artifact resolution', () => {
  it('keeps each relation transfer independent and accepts multiple selected outputs', () => {
    const before = createInitialState()
    const childBefore = structuredClone(selectTransferById(before, 'transfer-relation-review-plan'))
    const after = appReducer(before, {
      type: 'UPDATE_CONTEXT_TRANSFER',
      transferId: 'transfer-relation-progressive-plan',
      instructions: 'Use only the selected CSV and figure.',
      includeParentGoalFile: false,
      artifactIds: ['artifact-transfer-csv', 'artifact-transfer-figure'],
      requiredArtifactIds: ['artifact-transfer-csv'],
    })

    const updated = selectTransferById(after, 'transfer-relation-progressive-plan')
    expect(updated?.instructions).toBe('Use only the selected CSV and figure.')
    expect(updated?.artifacts.map((reference) => reference.artifactId)).toEqual([
      'artifact-transfer-csv',
      'artifact-transfer-figure',
    ])
    expect(updated?.artifacts.every((reference) => reference.resolution === 'resolved')).toBe(true)
    expect(selectTransferSummary(after, updated?.id ?? '')).toMatchObject({
      selectedArtifactCount: 2,
      resolvedCount: 2,
      blockingCount: 0,
    })
    expect(selectTransferById(after, 'transfer-relation-review-plan')).toEqual(childBefore)
  })

  it('marks changed revisions stale, blocks required use, and requires another explicit Play after repair', () => {
    let state = appReducer(createInitialState(), {
      type: 'UPDATE_ARTIFACT',
      artifactId: 'artifact-transfer-csv',
      changes: { revision: 3 },
    })
    const stale = selectTransferById(state, 'transfer-relation-progressive-plan')?.artifacts.find(
      (reference) => reference.artifactId === 'artifact-transfer-csv',
    )
    expect(stale?.resolution).toBe('stale')
    expect(selectQueueBlockReason(state, 'queue-progressive-handoff')).toContain('stale')

    state = appReducer(state, { type: 'PLAY_SELECTED' })
    expect(state.queue[0]?.status).toBe('queued')
    expect(state.queue[0]?.playRequested).toBe(true)

    state = appReducer(state, {
      type: 'REFRESH_TRANSFER_REFERENCE',
      transferId: 'transfer-relation-progressive-plan',
      artifactId: 'artifact-transfer-csv',
    })
    expect(state.queue[0]?.status).toBe('queued')
    expect(selectQueueBlockReason(state, 'queue-progressive-handoff')).toBeUndefined()

    state = appReducer(state, { type: 'PLAY_SELECTED' })
    expect(state.queue[0]?.status).toBe('simulated-running')
  })

  it('synchronizes node, relation, queue, and transfer parent changes and rechecks old references', () => {
    const state = appReducer(createInitialState(), {
      type: 'CHANGE_QUEUE_PARENT',
      queueItemId: 'queue-progressive-handoff',
      parentNodeId: 'node-renderer-failure',
    })
    const item = state.queue.find((candidate) => candidate.id === 'queue-progressive-handoff')
    const relation = state.relations.find((candidate) => candidate.id === item?.relationId)
    const transfer = selectTransferById(state, item?.contextTransferId)
    const node = state.nodes.find((candidate) => candidate.id === item?.nodeId)
    expect(item?.parentNodeId).toBe('node-renderer-failure')
    expect(relation?.sourceNodeId).toBe('node-renderer-failure')
    expect(transfer?.parentNodeId).toBe('node-renderer-failure')
    expect(node?.parentNodeId).toBe('node-renderer-failure')
    expect(transfer?.parentGoalFile?.resolution).toBe('missing')
    expect(transfer?.artifacts.every((reference) => reference.resolution === 'missing')).toBe(true)
  })

  it('makes progressively discovered outputs visible to child transfer editors immediately', () => {
    let state = appReducer(createInitialState(), { type: 'PLAY_SELECTED' })
    state = appReducer(state, {
      type: 'DISCOVER_QUEUE_OUTPUT',
      queueItemId: 'queue-progressive-handoff',
      artifact: {
        id: 'artifact-planned-handoff-report',
        name: 'New report',
        kind: 'report',
        path: 'artifacts/demo/new-report.md',
        summary: 'Newly revealed output.',
      },
    })
    const parentNode = state.nodes.find((node) => node.id === 'planned-progressive-handoff')
    expect(parentNode?.artifactIds).toContain('artifact-planned-handoff-report')
    expect(state.queue[0]?.outputArtifactIds).toContain('artifact-planned-handoff-report')
    expect(state.queue[0]?.activity.at(-1)?.kind).toBe('output')
    expect(selectAvailableTransferArtifacts(state, 'transfer-relation-review-plan').map((artifact) => artifact.id)).toContain(
      'artifact-planned-handoff-report',
    )
  })
})

describe('grouping, navigation, immediate actions, undo, and reset', () => {
  it('groups and collapses without changing dates, lineage, provenance, relations, or transfers', () => {
    const initial = createInitialState()
    const nodeIds = ['node-map-question', 'node-canvas-prototype', 'node-renderer-failure', 'node-hybrid-renderer']
    const invariantBefore = initial.nodes
      .filter((node) => nodeIds.includes(node.id))
      .map(({ id, startedAt, endedAt, parentNodeId, sourceThreadIds }) => ({ id, startedAt, endedAt, parentNodeId, sourceThreadIds }))
    const relationsBefore = structuredClone(initial.relations)
    const transfersBefore = structuredClone(initial.transfers)

    let state = appReducer(initial, {
      type: 'CREATE_GROUP',
      name: 'Renderer arc',
      note: 'Preserved renderer history.',
      overlayColor: '#78dce8',
      nodeIds,
    })
    const group = state.groups.at(-1)
    state = appReducer(state, { type: 'TOGGLE_GROUP_COLLAPSED', groupId: group?.id as string })
    const invariantAfter = state.nodes
      .filter((node) => nodeIds.includes(node.id))
      .map(({ id, startedAt, endedAt, parentNodeId, sourceThreadIds }) => ({ id, startedAt, endedAt, parentNodeId, sourceThreadIds }))
    expect(group?.memberNodeIds).toEqual(nodeIds)
    expect(state.groups.at(-1)?.collapsed).toBe(true)
    expect(invariantAfter).toEqual(invariantBefore)
    expect(state.relations).toEqual(relationsBefore)
    expect(state.transfers).toEqual(transfersBefore)

    state = appReducer(state, { type: 'UNDO' })
    expect(state.groups.at(-1)?.collapsed).toBe(false)
  })

  it('searches failure evidence, focuses semantically, and reveals hidden layers without changing graph data', () => {
    let state = appReducer(createInitialState(), { type: 'SET_SEARCH_QUERY', query: 'label collision' })
    expect(selectSearchResults(state).map((node) => node.id)).toContain('node-renderer-failure')
    expect(selectSearchResults(state)[0]?.id).toBe('node-renderer-failure')
    const nodesBefore = state.nodes
    state = appReducer(state, { type: 'FOCUS_NODE', nodeId: 'node-renderer-failure' })
    expect(state.focus).toMatchObject({ level: 'node', nodeId: 'node-renderer-failure', workstreamId: 'stream-visual-map' })
    state = appReducer(state, { type: 'FOCUS_NODE', nodeId: 'node-hybrid-renderer' })
    expect(state.focus).toMatchObject({ level: 'node', nodeId: 'node-hybrid-renderer', workstreamId: 'stream-visual-map' })
    expect(state.focus.trail).toHaveLength(1)
    expect(selectVisibleNodes(state)).toHaveLength(state.nodes.length)
    state = appReducer(state, { type: 'STEP_FOCUS_OUT' })
    expect(state.focus.level).toBe('project')
    expect(selectVisibleRelations(state).some((relation) => relation.kind === 'same-source-thread')).toBe(false)
    state = appReducer(state, { type: 'TOGGLE_LAYER', layer: 'same-source-thread' })
    expect(selectVisibleRelations(state).some((relation) => relation.kind === 'same-source-thread')).toBe(true)
    expect(state.nodes).toBe(nodesBefore)
  })

  it('creates and advances immediate branches and satellites with deterministic output', () => {
    let state = appReducer(createInitialState(), {
      type: 'CREATE_IMMEDIATE_ACTION',
      parentNodeId: 'node-renderer-failure',
      actionKind: 'verify',
      title: 'Verify preserved measurements',
      prompt: 'Check the CSV against the report.',
    })
    const node = state.nodes.at(-1)
    expect(node).toMatchObject({
      status: 'queued',
      parentNodeId: 'node-renderer-failure',
      satelliteOfNodeId: 'node-renderer-failure',
    })
    expect(state.relations.at(-1)).toMatchObject({
      kind: 'action-of',
      sourceNodeId: 'node-renderer-failure',
      targetNodeId: node?.id,
    })
    expect(state.selectedNodeId).toBe(node?.id)
    expect(state.focus).toMatchObject({ level: 'node', nodeId: node?.id, workstreamId: node?.workstreamId })
    state = appReducer(state, { type: 'ADVANCE_IMMEDIATE_ACTION', nodeId: node?.id as string })
    expect(state.nodes.at(-1)?.status).toBe('working')
    state = appReducer(state, { type: 'ADVANCE_IMMEDIATE_ACTION', nodeId: node?.id as string })
    expect(state.nodes.at(-1)?.status).toBe('ready')
    expect(state.nodes.at(-1)?.artifactIds).toHaveLength(1)
  })

  it('persists clamped manual graph offsets with undo, clear, and reset semantics', () => {
    const initial = createInitialState()
    const nodesBefore = structuredClone(initial.nodes)
    const movedPrimary = appReducer(initial, {
      type: 'SET_MANUAL_NODE_OFFSET',
      nodeId: 'node-renderer-failure',
      offset: { angleOffset: 99, radialOffset: 99 },
    })
    expect(movedPrimary.manualNodeOffsets['node-renderer-failure']).toEqual({
      angleOffset: 0.24,
      radialOffset: undefined,
    })
    expect(appReducer(movedPrimary, { type: 'UNDO' })).toEqual(initial)

    const movedSatellite = appReducer(initial, {
      type: 'SET_MANUAL_NODE_OFFSET',
      nodeId: 'satellite-label-figure',
      offset: { angleOffset: -99, radialOffset: 99 },
    })
    expect(movedSatellite.manualNodeOffsets['satellite-label-figure']).toEqual({
      angleOffset: -0.24,
      radialOffset: 14,
    })
    const cleared = appReducer(movedSatellite, {
      type: 'CLEAR_MANUAL_NODE_OFFSET',
      nodeId: 'satellite-label-figure',
    })
    expect(cleared.manualNodeOffsets).toEqual({})
    expect(appReducer(cleared, { type: 'UNDO' })).toEqual(movedSatellite)
    expect(appReducer(movedSatellite, { type: 'CLEAR_MANUAL_NODE_OFFSETS' }).manualNodeOffsets).toEqual({})
    expect(appReducer(movedSatellite, { type: 'RESET' })).toEqual(createInitialState())
    expect(initial.nodes).toEqual(nodesBefore)
  })

  it('Undo restores the exact prior snapshot and Reset restores the exact deterministic fixture', () => {
    const initial = createInitialState()
    const planned = appReducer(initial, {
      type: 'PLAN_NEXT_ACTION',
      parentNodeId: 'node-search-index',
      title: 'Prepare search follow-up',
      prompt: 'Prepare only.',
    })
    expect(planned).not.toEqual(initial)
    expect(appReducer(planned, { type: 'UNDO' })).toEqual(initial)

    const changed = reduce(
      planned,
      { type: 'TOGGLE_LAYER', layer: 'related-to' },
      { type: 'SET_SEARCH_QUERY', query: 'changed' },
      { type: 'RESET' },
    )
    expect(changed).toEqual(createInitialState())
  })
})

describe('canonical date-window reducer state', () => {
  it('commits one changed interval to one reducer-history entry and Undo restores it', () => {
    const initial = createInitialState()
    const narrowed = {
      startMs: initial.dateWindow.startMs + 86_400_000,
      endMs: initial.dateWindow.endMs - 86_400_000,
    }
    const changed = appReducer(initial, {
      type: 'SET_DATE_WINDOW',
      window: narrowed,
      source: 'gesture',
    })

    expect(changed.dateWindow).toEqual(narrowed)
    expect(changed.history).toHaveLength(1)
    expect(appReducer(changed, { type: 'UNDO' })).toEqual(initial)
  })

  it('restores route state without reducer history and clears hidden focus explicitly', () => {
    const initial = createInitialState()
    const restoredWindow = {
      startMs: initial.dateWindow.startMs,
      endMs: initial.dateWindow.startMs + 86_400_000 - 1,
    }
    const restored = appReducer(initial, {
      type: 'RESTORE_DATE_WINDOW',
      window: restoredWindow,
      announcement: 'Date window restored from the link.',
    })
    const focused = appReducer(restored, { type: 'FOCUS_NODE', nodeId: 'node-renderer-failure' })
    const cleared = appReducer(focused, { type: 'CLEAR_SELECTION_AND_FOCUS' })

    expect(restored.dateWindow).toEqual(restoredWindow)
    expect(restored.history).toHaveLength(0)
    expect(cleared.selectedNodeId).toBeUndefined()
    expect(cleared.selectedRelationId).toBeUndefined()
    expect(cleared.multiSelectedNodeIds).toEqual([])
    expect(cleared.focus).toEqual({ level: 'project', trail: [] })
  })

  it('rejects invalid committed and restored intervals without changing canonical state', () => {
    const initial = createInitialState()
    const invalid = { startMs: initial.dateWindow.endMs, endMs: initial.dateWindow.startMs }

    expect(appReducer(initial, {
      type: 'SET_DATE_WINDOW',
      window: invalid,
      source: 'gesture',
    }).dateWindow).toEqual(initial.dateWindow)
    expect(appReducer(initial, {
      type: 'RESTORE_DATE_WINDOW',
      window: invalid,
    }).dateWindow).toEqual(initial.dateWindow)
  })

  it('keeps full range truthful after node creation but preserves a deliberate subset', () => {
    const initial = createInitialState()
    const expanded = appReducer(initial, {
      type: 'PLAN_NEXT_ACTION',
      parentNodeId: 'node-renderer-failure',
      title: 'Future dated follow-up',
      prompt: 'Prepare only.',
    })
    expect(expanded.dateWindow.endMs).toBe(Date.parse('2026-08-09T23:59:59.999Z'))

    const subsetWindow = {
      startMs: Date.parse('2026-07-01T00:00:00.000Z'),
      endMs: Date.parse('2026-07-31T23:59:59.999Z'),
    }
    const narrowed = appReducer(initial, {
      type: 'RESTORE_DATE_WINDOW',
      window: subsetWindow,
    })
    const preserved = appReducer(narrowed, {
      type: 'PLAN_NEXT_ACTION',
      parentNodeId: 'node-renderer-failure',
      title: 'Another future follow-up',
      prompt: 'Prepare only.',
    })
    expect(preserved.dateWindow).toEqual(subsetWindow)
  })
})
