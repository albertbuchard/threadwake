import type {
  ActivityEntry,
  AppAction,
  AppState,
  Artifact,
  ArtifactReference,
  ContextTransfer,
  CoreAppState,
  GraphRelation,
  ImmediateActionKind,
  QueueItem,
  TransferResolution,
  WorkNode,
} from './domain'
import { createInitialState } from './seed'
import { expandWindowAfterNodeMutation } from './date-window-model'
import {
  lifecycleLabel,
  fixtureProjectAttachmentClosure,
  validateFixtureProjectAttachment,
  validateLifecycleMove,
  validateViewGroupSelection,
} from './kanban-model'

const HISTORY_LIMIT = 40
const DEMO_CLOCK_EPOCH = Date.parse('2026-08-09T10:00:00.000Z')
const MAX_PERSISTED_MANUAL_ANGLE_OFFSET = 0.24
const MAX_PERSISTED_SATELLITE_RADIAL_OFFSET = 14

function demoTimestamp(sequence: number): string {
  return new Date(DEMO_CLOCK_EPOCH + sequence * 60_000).toISOString()
}

function validDateWindow(window: AppState['dateWindow']): boolean {
  return Number.isFinite(window.startMs)
    && Number.isFinite(window.endMs)
    && window.startMs <= window.endMs
}

function sameDateWindow(
  left: AppState['dateWindow'],
  right: AppState['dateWindow'],
): boolean {
  return left.startMs === right.startMs && left.endMs === right.endMs
}

function coreSnapshot(state: AppState): CoreAppState {
  const { history: _history, ...core } = state
  return structuredClone(core)
}

function commit(state: AppState, next: CoreAppState): AppState {
  return {
    ...next,
    history: [...state.history, coreSnapshot(state)].slice(-HISTORY_LIMIT),
  }
}

function activity(sequence: number, kind: ActivityEntry['kind'], message: string): ActivityEntry {
  return {
    id: `activity-demo-${sequence}`,
    at: demoTimestamp(sequence),
    kind,
    message,
  }
}

function focusForCreatedChild(state: AppState, node: WorkNode): AppState['focus'] {
  const trail = state.focus.level === 'node'
    ? state.focus.trail
    : [...state.focus.trail, {
        level: state.focus.level,
        workstreamId: state.focus.workstreamId,
        nodeId: state.focus.nodeId,
        relationId: state.focus.relationId,
      }]
  return {
    level: 'node',
    workstreamId: node.workstreamId,
    nodeId: node.id,
    trail,
  }
}

function artifactForReference(reference: ArtifactReference, artifacts: readonly Artifact[]): Artifact | undefined {
  return artifacts.find((candidate) => candidate.id === reference.artifactId)
}

export function resolveArtifactReference(
  reference: ArtifactReference,
  parentNodeId: string,
  artifacts: readonly Artifact[],
): TransferResolution {
  const artifactItem = artifactForReference(reference, artifacts)
  if (!artifactItem || !artifactItem.available || artifactItem.nodeId !== parentNodeId) return 'missing'
  if (artifactItem.revision !== reference.expectedRevision) return 'stale'
  return 'resolved'
}

export function resolveContextTransfer(
  transfer: ContextTransfer,
  artifacts: readonly Artifact[],
): ContextTransfer {
  const resolve = (reference: ArtifactReference): ArtifactReference => ({
    ...reference,
    resolution: resolveArtifactReference(reference, transfer.parentNodeId, artifacts),
  })
  return {
    ...transfer,
    parentGoalFile: transfer.parentGoalFile ? resolve(transfer.parentGoalFile) : undefined,
    artifacts: transfer.artifacts.map(resolve),
  }
}

export function getTransferBlockReason(transfer: ContextTransfer | undefined): string | undefined {
  if (!transfer) return 'The context transfer is missing.'
  const references = [
    ...(transfer.includeParentGoalFile && transfer.parentGoalFile ? [transfer.parentGoalFile] : []),
    ...transfer.artifacts,
  ]
  const blocked = references.find((reference) => reference.required && reference.resolution !== 'resolved')
  if (!blocked) return undefined
  return `Required output “${blocked.artifactId}” is ${blocked.resolution}. Repair or remove the reference before playing this item.`
}

function resolvedTransfers(transfers: readonly ContextTransfer[], artifacts: readonly Artifact[]): ContextTransfer[] {
  return transfers.map((transfer) => resolveContextTransfer(transfer, artifacts))
}

function relationForQueueItem(item: QueueItem, relations: readonly GraphRelation[]): GraphRelation | undefined {
  return relations.find((relation) => relation.id === item.relationId)
}

function queueDependencyReason(item: QueueItem, queue: readonly QueueItem[]): string | undefined {
  if (!item.parentQueueItemId) return undefined
  const parent = queue.find((candidate) => candidate.id === item.parentQueueItemId)
  if (!parent) return 'The planned parent no longer exists.'
  if (parent.status !== 'completed') return `Waiting for “${parent.title}” to complete first.`
  return undefined
}

function queueBlockReason(
  item: QueueItem,
  queue: readonly QueueItem[],
  transfers: readonly ContextTransfer[],
): string | undefined {
  const transfer = transfers.find((candidate) => candidate.id === item.contextTransferId)
  return getTransferBlockReason(transfer) ?? queueDependencyReason(item, queue)
}

function normalizeOrders(queue: readonly QueueItem[]): QueueItem[] {
  return queue.map((item, order) => ({ ...item, order }))
}

function syncQueueBlocks(queue: readonly QueueItem[], transfers: readonly ContextTransfer[]): QueueItem[] {
  return queue.map((item) => ({
    ...item,
    blockedReason: queueBlockReason(item, queue, transfers),
  }))
}

function syncNodesWithQueue(nodes: readonly WorkNode[], queue: readonly QueueItem[]): WorkNode[] {
  const byNode = new Map(queue.map((item) => [item.nodeId, item]))
  return nodes.map((node) => {
    const item = byNode.get(node.id)
    if (!item) return node
    const status: WorkNode['status'] =
      item.status === 'simulated-running'
        ? 'working'
        : item.status === 'completed'
          ? 'ready'
          : item.status === 'queued'
            ? 'queued'
            : 'planned'
    const lifecycle: WorkNode['lifecycle'] =
      item.status === 'simulated-running'
        ? 'ongoing'
        : item.status === 'completed'
          ? 'done'
          : 'planned'
    return { ...node, status, lifecycle }
  })
}

function startEligibleQueueItems(
  queue: readonly QueueItem[],
  transfers: readonly ContextTransfer[],
  sequence: number,
): { queue: QueueItem[]; nextSequence: number; startedNodeIds: string[] } {
  let nextSequence = sequence
  const startedNodeIds: string[] = []
  const result = normalizeOrders(queue).map((item, _index, allItems) => {
    if (!item.playRequested || (item.status !== 'draft' && item.status !== 'queued')) return item
    const reason = queueBlockReason(item, allItems, transfers)
    if (reason) return { ...item, status: 'queued' as const, blockedReason: reason }
    nextSequence += 1
    startedNodeIds.push(item.nodeId)
    return {
      ...item,
      status: 'simulated-running' as const,
      progress: Math.max(item.progress, 8),
      blockedReason: undefined,
      activity: [
        ...item.activity,
        activity(nextSequence, 'progress', `Deterministic demo started in ${item.executionKind === 'goal' ? 'Goal' : 'Plan'} mode.`),
      ],
    }
  })
  return { queue: result, nextSequence, startedNodeIds }
}

function allDescendantQueueIds(queue: readonly QueueItem[], queueItemId: string): Set<string> {
  const descendants = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const item of queue) {
      if (item.parentQueueItemId === queueItemId || (item.parentQueueItemId && descendants.has(item.parentQueueItemId))) {
        if (!descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      }
    }
  }
  return descendants
}

function respectsDependencyOrder(queue: readonly QueueItem[]): boolean {
  const positions = new Map(queue.map((item, index) => [item.id, index]))
  return queue.every((item) => {
    if (!item.parentQueueItemId) return true
    const parentPosition = positions.get(item.parentQueueItemId)
    const childPosition = positions.get(item.id)
    return parentPosition !== undefined && childPosition !== undefined && parentPosition < childPosition
  })
}

function topologicallyOrderQueue(queue: readonly QueueItem[]): QueueItem[] | undefined {
  const remaining = [...queue]
  const ordered: QueueItem[] = []
  const queuedIds = new Set(queue.map((item) => item.id))
  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((item) =>
      !item.parentQueueItemId
      || !queuedIds.has(item.parentQueueItemId)
      || ordered.some((parent) => parent.id === item.parentQueueItemId),
    )
    if (nextIndex < 0) return undefined
    const [next] = remaining.splice(nextIndex, 1)
    if (next) ordered.push(next)
  }
  return normalizeOrders(ordered)
}

function addPlannedAction(
  state: AppState,
  input: {
    parentNodeId: string
    parentQueueItemId?: string
    title: string
    prompt: string
    executionKind?: 'plan' | 'goal'
  },
): AppState {
  const parent = state.nodes.find((node) => node.id === input.parentNodeId)
  if (!parent) return state
  if (input.parentQueueItemId) {
    const queueParent = state.queue.find((item) => item.id === input.parentQueueItemId)
    if (!queueParent || queueParent.nodeId !== input.parentNodeId) return state
  }

  const sequence = state.nextSequence
  const at = demoTimestamp(sequence)
  const nodeId = `node-planned-${sequence}`
  const relationId = `relation-planned-${sequence}`
  const transferId = `transfer-planned-${sequence}`
  const queueItemId = `queue-planned-${sequence}`
  const relationKind: GraphRelation['kind'] = input.parentQueueItemId ? 'depends-on' : 'continues'
  const newNode: WorkNode = {
    id: nodeId,
    title: input.title,
    type: 'plan',
    status: 'planned',
    lifecycle: 'planned',
    workstreamId: parent.workstreamId,
    sourceThreadIds: [...parent.sourceThreadIds],
    owner: parent.owner,
    startedAt: at,
    summary: input.prompt,
    outcome: 'This editable draft has not run. It contains no generated output.',
    origin: `Planned from “${parent.title}”.`,
    unresolvedQuestions: [],
    nextActions: ['Select this queue item and press Play selected when the prompt and transferred context are ready.'],
    artifactIds: [],
    activity: [activity(sequence, 'created', 'Draft prepared locally. No timer or agent was started.')],
    parentNodeId: parent.id,
  }
  const newRelation: GraphRelation = {
    id: relationId,
    kind: relationKind,
    sourceNodeId: parent.id,
    targetNodeId: nodeId,
    label: input.parentQueueItemId ? 'Runs after planned parent' : 'Prepared next action',
    transferId,
    visibleByDefault: true,
  }
  const newTransfer: ContextTransfer = {
    id: transferId,
    relationId,
    parentNodeId: parent.id,
    childNodeId: nodeId,
    instructions: '',
    includeParentGoalFile: false,
    artifacts: [],
    updatedAt: at,
  }
  const newQueueItem: QueueItem = {
    id: queueItemId,
    order: state.queue.length,
    nodeId,
    parentNodeId: parent.id,
    parentQueueItemId: input.parentQueueItemId,
    title: input.title,
    prompt: input.prompt,
    executionKind: input.executionKind ?? 'plan',
    selected: false,
    status: 'draft',
    relationId,
    contextTransferId: transferId,
    activity: [activity(sequence + 1, 'created', 'Queue draft created. Explicit Play selected is required to begin the deterministic demo.')],
    outputArtifactIds: [],
    progress: 0,
    playRequested: false,
    blockedReason: input.parentQueueItemId ? `Waiting for “${parent.title}” to complete first.` : undefined,
  }

  const nextNodes = [...state.nodes, newNode]
  return commit(state, {
    ...coreSnapshot(state),
    nodes: nextNodes,
    dateWindow: expandWindowAfterNodeMutation(state.nodes, nextNodes, state.dateWindow),
    relations: [...state.relations, newRelation],
    transfers: [...state.transfers, newTransfer],
    queue: normalizeOrders([...state.queue, newQueueItem]),
    selectedNodeId: nodeId,
    selectedRelationId: undefined,
    focus: focusForCreatedChild(state, newNode),
    announcement: `Planned “${input.title}”. It is queued as an inert draft and has not run.`,
    nextSequence: sequence + 2,
  })
}

function immediateType(actionKind: ImmediateActionKind): WorkNode['type'] {
  switch (actionKind) {
    case 'continue': return 'feature'
    case 'verify': return 'verification'
    case 'test': return 'test'
    case 'report-status': return 'status'
    case 'summarize': return 'summary'
    case 'visualize': return 'visualization'
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_NODE': {
      if (action.nodeId && !state.nodes.some((node) => node.id === action.nodeId)) return state
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedRelationId: undefined,
        announcement: action.nodeId
          ? `${state.nodes.find((node) => node.id === action.nodeId)?.title ?? 'Work unit'} selected.`
          : 'Selection cleared.',
      }
    }
    case 'SELECT_RELATION': {
      if (action.relationId && !state.relations.some((relation) => relation.id === action.relationId)) return state
      return {
        ...state,
        selectedRelationId: action.relationId,
        selectedNodeId: undefined,
        announcement: action.relationId ? 'Context-transfer relation selected.' : 'Relation selection cleared.',
      }
    }
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query }
    case 'SET_VIEW':
      return { ...state, view: action.view, announcement: `${action.view === 'graph' ? 'Graph' : 'Kanban'} view shown.` }
    case 'RESTORE_ROUTE_STATE':
      if (!validDateWindow(action.dateWindow)) {
        return { ...state, announcement: 'The saved route contained an invalid date window and was not restored.' }
      }
      return {
        ...state,
        view: action.view,
        selectedNodeId: action.selectedNodeId,
        selectedRelationId: action.selectedRelationId,
        focus: structuredClone(action.focus),
        layers: { ...action.layers },
        searchQuery: action.searchQuery,
        collapsedLifecycles: [...action.collapsedLifecycles],
        dateWindow: { ...action.dateWindow },
        announcement: action.announcement,
      }
    case 'SET_DATE_WINDOW': {
      if (!validDateWindow(action.window)) {
        return { ...state, announcement: 'That date window is invalid. The timeline was not changed.' }
      }
      if (sameDateWindow(state.dateWindow, action.window)) return state
      const sourceLabel = action.source === 'reset'
        ? 'The full timeline is shown.'
        : action.source === 'reveal'
          ? 'The date window now includes the selected work.'
          : 'The graph date window changed.'
      return commit(state, {
        ...coreSnapshot(state),
        dateWindow: { ...action.window },
        announcement: sourceLabel,
      })
    }
    case 'RESTORE_DATE_WINDOW':
      if (!validDateWindow(action.window)) {
        return { ...state, announcement: 'That restored date window is invalid. The timeline was not changed.' }
      }
      return {
        ...state,
        dateWindow: { ...action.window },
        announcement: action.announcement ?? 'The graph date window was restored from navigation history.',
      }
    case 'CLEAR_SELECTION_AND_FOCUS':
      return {
        ...state,
        selectedNodeId: undefined,
        selectedRelationId: undefined,
        multiSelectedNodeIds: [],
        focus: { level: 'project', trail: [] },
        announcement: 'Selection cleared. Project overview restored.',
      }
    case 'MOVE_NODE_LIFECYCLE': {
      const node = state.nodes.find((candidate) => candidate.id === action.nodeId)
      if (!node) return { ...state, announcement: 'That work item no longer exists.' }
      const invalid = validateLifecycleMove(state.nodes, node.id, action.lifecycle)
      if (invalid) return { ...state, announcement: invalid }
      if (node.lifecycle === action.lifecycle) return state
      const sequence = state.nextSequence
      const abandonedReason = action.lifecycle === 'abandoned'
        ? action.reason?.trim() || 'Discontinued from Kanban after explicit confirmation.'
        : node.abandonmentReason
      return commit(state, {
        ...coreSnapshot(state),
        nodes: state.nodes.map((candidate) => candidate.id === node.id
          ? {
              ...candidate,
              lifecycle: action.lifecycle,
              abandonmentReason: abandonedReason,
              activity: [
                ...candidate.activity,
                activity(
                  sequence,
                  action.lifecycle === 'done' ? 'completed' : 'note',
                  `Lifecycle moved from ${lifecycleLabel(node.lifecycle)} to ${lifecycleLabel(action.lifecycle)}.${action.lifecycle === 'abandoned' ? ` Reason: ${abandonedReason}` : ''}`,
                ),
              ],
            }
          : candidate),
        announcement: `Moved “${node.title}” to ${lifecycleLabel(action.lifecycle)}. Graph and Kanban now show the same lifecycle.`,
        nextSequence: sequence + 1,
      })
    }
    case 'TOGGLE_LIFECYCLE_COLLAPSED': {
      const collapsed = new Set(state.collapsedLifecycles)
      if (collapsed.has(action.lifecycle)) collapsed.delete(action.lifecycle)
      else collapsed.add(action.lifecycle)
      return {
        ...state,
        collapsedLifecycles: [...collapsed],
        announcement: `${lifecycleLabel(action.lifecycle)} ${collapsed.has(action.lifecycle) ? 'collapsed' : 'expanded'}.`,
      }
    }
    case 'FOCUS_WORKSTREAM': {
      if (!state.workstreams.some((stream) => stream.id === action.workstreamId)) return state
      return {
        ...state,
        focus: {
          level: 'workstream',
          workstreamId: action.workstreamId,
          trail: [...state.focus.trail, {
            level: state.focus.level,
            workstreamId: state.focus.workstreamId,
            nodeId: state.focus.nodeId,
            relationId: state.focus.relationId,
          }],
        },
        announcement: `${state.workstreams.find((stream) => stream.id === action.workstreamId)?.name ?? 'Workstream'} focused.`,
      }
    }
    case 'FOCUS_NODE': {
      const node = state.nodes.find((candidate) => candidate.id === action.nodeId)
      if (!node) return state
      const trail = state.focus.level === 'node'
        ? state.focus.trail
        : [...state.focus.trail, {
            level: state.focus.level,
            workstreamId: state.focus.workstreamId,
            nodeId: state.focus.nodeId,
            relationId: state.focus.relationId,
          }]
      return {
        ...state,
        selectedNodeId: node.id,
        selectedRelationId: undefined,
        focus: {
          level: 'node',
          workstreamId: node.workstreamId,
          nodeId: node.id,
          trail,
        },
        announcement: `${node.title} focused.`,
      }
    }
    case 'FOCUS_RELATION': {
      const relation = state.relations.find((candidate) => candidate.id === action.relationId)
      if (!relation) return state
      const child = state.nodes.find((node) => node.id === relation.targetNodeId)
      return {
        ...state,
        selectedNodeId: undefined,
        selectedRelationId: relation.id,
        focus: {
          level: 'relation',
          workstreamId: child?.workstreamId,
          relationId: relation.id,
          trail: [...state.focus.trail, {
            level: state.focus.level,
            workstreamId: state.focus.workstreamId,
            nodeId: state.focus.nodeId,
            relationId: state.focus.relationId,
          }],
        },
        announcement: 'Relation and its explicit context transfer focused.',
      }
    }
    case 'STEP_FOCUS_OUT': {
      const previous = state.focus.trail.at(-1)
      if (!previous) return {
        ...state,
        selectedNodeId: undefined,
        selectedRelationId: undefined,
        focus: { level: 'project', trail: [] },
        announcement: 'Project overview shown.',
      }
      return {
        ...state,
        selectedNodeId: previous.nodeId,
        selectedRelationId: previous.relationId,
        focus: { ...previous, trail: state.focus.trail.slice(0, -1) },
        announcement: previous.level === 'project' ? 'Project overview shown.' : 'Stepped outward one focus level.',
      }
    }
    case 'SET_LAYER':
      return { ...state, layers: { ...state.layers, [action.layer]: action.visible } }
    case 'TOGGLE_LAYER':
      return { ...state, layers: { ...state.layers, [action.layer]: !state.layers[action.layer] } }
    case 'TOGGLE_MULTI_SELECT': {
      if (!state.nodes.some((node) => node.id === action.nodeId)) return state
      const selected = state.multiSelectedNodeIds.includes(action.nodeId)
      return {
        ...state,
        multiSelectedNodeIds: selected
          ? state.multiSelectedNodeIds.filter((id) => id !== action.nodeId)
          : [...state.multiSelectedNodeIds, action.nodeId],
      }
    }
    case 'SET_MULTI_SELECTION': {
      const existing = new Set(state.nodes.map((node) => node.id))
      return { ...state, multiSelectedNodeIds: [...new Set(action.nodeIds)].filter((id) => existing.has(id)) }
    }
    case 'CLEAR_MULTI_SELECTION':
      return { ...state, multiSelectedNodeIds: [] }
    case 'SET_MANUAL_NODE_OFFSET': {
      const node = state.nodes.find((candidate) => candidate.id === action.nodeId)
      if (!node || !Number.isFinite(action.offset.angleOffset)) return state
      const angleOffset = Math.min(
        MAX_PERSISTED_MANUAL_ANGLE_OFFSET,
        Math.max(-MAX_PERSISTED_MANUAL_ANGLE_OFFSET, action.offset.angleOffset),
      )
      const requestedRadial = Number.isFinite(action.offset.radialOffset)
        ? action.offset.radialOffset as number
        : 0
      const radialOffset = node.satelliteOfNodeId
        ? Math.min(
          MAX_PERSISTED_SATELLITE_RADIAL_OFFSET,
          Math.max(-MAX_PERSISTED_SATELLITE_RADIAL_OFFSET, requestedRadial),
        )
        : undefined
      return commit(state, {
        ...coreSnapshot(state),
        manualNodeOffsets: {
          ...state.manualNodeOffsets,
          [node.id]: { angleOffset, radialOffset },
        },
        announcement: `${node.title} pinned to a manual graph position.`,
      })
    }
    case 'CLEAR_MANUAL_NODE_OFFSET': {
      const node = state.nodes.find((candidate) => candidate.id === action.nodeId)
      if (!node || !state.manualNodeOffsets[action.nodeId]) return state
      const manualNodeOffsets = { ...state.manualNodeOffsets }
      delete manualNodeOffsets[action.nodeId]
      return commit(state, {
        ...coreSnapshot(state),
        manualNodeOffsets,
        announcement: `${node.title} returned to automatic graph packing.`,
      })
    }
    case 'CLEAR_MANUAL_NODE_OFFSETS':
      if (Object.keys(state.manualNodeOffsets).length === 0) return state
      return commit(state, {
        ...coreSnapshot(state),
        manualNodeOffsets: {},
        announcement: 'All manual graph positions cleared.',
      })
    case 'PLAN_NEXT_ACTION':
      return addPlannedAction(state, action)
    case 'ADD_QUEUE_CHILD': {
      const parent = state.queue.find((item) => item.id === action.parentQueueItemId)
      if (!parent) return state
      return addPlannedAction(state, {
        parentNodeId: parent.nodeId,
        parentQueueItemId: parent.id,
        title: action.title,
        prompt: action.prompt,
        executionKind: action.executionKind,
      })
    }
    case 'UPDATE_QUEUE_ITEM': {
      if (!state.queue.some((item) => item.id === action.queueItemId)) return state
      const queue = state.queue.map((item) => item.id === action.queueItemId ? { ...item, ...action.changes } : item)
      return commit(state, {
        ...coreSnapshot(state),
        queue,
        nodes: state.nodes.map((node) => {
          const changed = queue.find((item) => item.nodeId === node.id)
          return changed ? { ...node, title: changed.title, summary: changed.prompt } : node
        }),
        announcement: 'Queued draft updated. It remains non-running.',
      })
    }
    case 'TOGGLE_QUEUE_SELECTION': {
      if (!state.queue.some((item) => item.id === action.queueItemId)) return state
      return {
        ...state,
        queue: state.queue.map((item) => {
          if (item.id !== action.queueItemId) return item
          const selected = !item.selected
          return {
            ...item,
            selected,
            playRequested: !selected && item.status !== 'simulated-running' ? false : item.playRequested,
          }
        }),
      }
    }
    case 'SET_QUEUE_SELECTION': {
      const ids = new Set(action.queueItemIds)
      return {
        ...state,
        queue: state.queue.map((item) => ids.has(item.id)
          ? {
              ...item,
              selected: action.selected,
              playRequested: !action.selected && item.status !== 'simulated-running' ? false : item.playRequested,
            }
          : item),
      }
    }
    case 'REORDER_QUEUE_ITEM': {
      const fromIndex = state.queue.findIndex((item) => item.id === action.queueItemId)
      if (fromIndex < 0) return state
      const toIndex = Math.max(0, Math.min(state.queue.length - 1, action.toIndex))
      if (fromIndex === toIndex) return state
      const candidate = [...state.queue]
      const [moved] = candidate.splice(fromIndex, 1)
      if (!moved) return state
      candidate.splice(toIndex, 0, moved)
      if (!respectsDependencyOrder(candidate)) {
        return { ...state, announcement: 'That move would place a child before its dependency, so the queue was not changed.' }
      }
      return commit(state, {
        ...coreSnapshot(state),
        queue: normalizeOrders(candidate),
        announcement: `Moved “${moved.title}” while preserving dependency order.`,
      })
    }
    case 'PLAY_SELECTED': {
      const selected = state.queue.filter((item) => item.selected && (item.status === 'draft' || item.status === 'queued'))
      if (selected.length === 0) return { ...state, announcement: 'Select at least one queued draft before pressing Play.' }
      const selectedIds = new Set(selected.map((item) => item.id))
      const prepared = state.queue.map((item) => {
        if (!selectedIds.has(item.id)) return item
        return {
          ...item,
          playRequested: true,
          status: 'queued' as const,
          activity: [
            ...item.activity,
            activity(state.nextSequence + item.order + 1, 'progress', 'Play selected requested this item. Dependencies and required transfers are being checked.'),
          ],
        }
      })
      const started = startEligibleQueueItems(prepared, state.transfers, state.nextSequence + state.queue.length + 1)
      const queue = syncQueueBlocks(started.queue, state.transfers)
      return commit(state, {
        ...coreSnapshot(state),
        queue,
        nodes: syncNodesWithQueue(state.nodes, queue),
        announcement: started.startedNodeIds.length > 0
          ? `${started.startedNodeIds.length} selected item${started.startedNodeIds.length === 1 ? '' : 's'} started in the deterministic demo.`
          : 'Selected items remain queued because a dependency or required transfer is unresolved.',
        nextSequence: started.nextSequence + 1,
      })
    }
    case 'DISCOVER_QUEUE_OUTPUT': {
      const item = state.queue.find((candidate) => candidate.id === action.queueItemId)
      if (!item || item.status !== 'simulated-running') return state
      const id = action.artifact.id ?? `artifact-demo-${state.nextSequence}`
      if (state.artifacts.some((artifactItem) => artifactItem.id === id)) return state
      const createdAt = demoTimestamp(state.nextSequence)
      const discovered: Artifact = {
        id,
        nodeId: item.nodeId,
        name: action.artifact.name,
        kind: action.artifact.kind,
        path: action.artifact.path,
        summary: action.artifact.summary,
        createdAt,
        revision: 1,
        available: true,
      }
      const artifacts = [...state.artifacts, discovered]
      const transfers = resolvedTransfers(state.transfers, artifacts)
      const queueWithOutput = state.queue.map((candidate) => candidate.id === item.id
        ? {
            ...candidate,
            outputArtifactIds: [...candidate.outputArtifactIds, id],
            progress: Math.min(92, candidate.progress + 24),
            activity: [...candidate.activity, activity(state.nextSequence, 'output', `Discovered ${action.artifact.kind} output “${action.artifact.name}”.`)],
          }
        : candidate)
      const queue = syncQueueBlocks(queueWithOutput, transfers)
      return commit(state, {
        ...coreSnapshot(state),
        artifacts,
        transfers,
        queue,
        nodes: state.nodes.map((node) => node.id === item.nodeId
          ? { ...node, artifactIds: [...node.artifactIds, id], activity: [...node.activity, activity(state.nextSequence + 1, 'output', `Output available: ${action.artifact.name}.`)] }
          : node),
        announcement: `${action.artifact.name} discovered. It is now available in child transfer editors.`,
        nextSequence: state.nextSequence + 2,
      })
    }
    case 'COMPLETE_QUEUE_ITEM': {
      const item = state.queue.find((candidate) => candidate.id === action.queueItemId)
      if (!item || item.status !== 'simulated-running') return state
      const completedQueue = state.queue.map((candidate) => candidate.id === item.id
        ? {
            ...candidate,
            status: 'completed' as const,
            progress: 100,
            selected: false,
            playRequested: false,
            blockedReason: undefined,
            activity: [...candidate.activity, activity(state.nextSequence, 'completed', 'Deterministic demo completed.')],
          }
        : candidate)
      const started = startEligibleQueueItems(completedQueue, state.transfers, state.nextSequence + 1)
      const queue = syncQueueBlocks(started.queue, state.transfers)
      return commit(state, {
        ...coreSnapshot(state),
        queue,
        nodes: syncNodesWithQueue(state.nodes, queue),
        announcement: started.startedNodeIds.length > 0
          ? `“${item.title}” completed; the next authorized child started.`
          : `“${item.title}” completed in the deterministic demo.`,
        nextSequence: started.nextSequence + 1,
      })
    }
    case 'CHANGE_QUEUE_PARENT': {
      const item = state.queue.find((candidate) => candidate.id === action.queueItemId)
      const newParent = state.nodes.find((node) => node.id === action.parentNodeId)
      if (!item || !newParent) return state
      if (action.parentQueueItemId) {
        const parentQueueItem = state.queue.find((candidate) => candidate.id === action.parentQueueItemId)
        const descendants = allDescendantQueueIds(state.queue, item.id)
        if (!parentQueueItem || parentQueueItem.nodeId !== newParent.id || parentQueueItem.id === item.id || descendants.has(parentQueueItem.id)) return state
      }
      const changedQueue = state.queue.map((candidate) => candidate.id === item.id
        ? { ...candidate, parentNodeId: newParent.id, parentQueueItemId: action.parentQueueItemId }
        : candidate)
      const queue = topologicallyOrderQueue(changedQueue)
      if (!queue) return state
      const relations = state.relations.map((relation) => relation.id === item.relationId
        ? { ...relation, sourceNodeId: newParent.id, kind: action.parentQueueItemId ? 'depends-on' as const : 'continues' as const }
        : relation)
      const transfers = resolvedTransfers(state.transfers.map((transfer) => transfer.id === item.contextTransferId
        ? { ...transfer, parentNodeId: newParent.id, updatedAt: demoTimestamp(state.nextSequence) }
        : transfer), state.artifacts)
      const synchronizedQueue = syncQueueBlocks(queue, transfers)
      return commit(state, {
        ...coreSnapshot(state),
        queue: synchronizedQueue,
        relations,
        transfers,
        nodes: state.nodes.map((node) => node.id === item.nodeId ? { ...node, parentNodeId: newParent.id, origin: `Planned from “${newParent.title}”.` } : node),
        announcement: `Parent changed to “${newParent.title}”. Existing artifact references were rechecked against that parent.`,
        nextSequence: state.nextSequence + 1,
      })
    }
    case 'UPDATE_CONTEXT_TRANSFER': {
      const current = state.transfers.find((transfer) => transfer.id === action.transferId)
      if (!current) return state
      const requiredIds = new Set(action.requiredArtifactIds ?? [])
      const artifactIds = action.artifactIds ?? current.artifacts.map((reference) => reference.artifactId)
      const references: ArtifactReference[] = artifactIds.map((artifactId) => {
        const artifactItem = state.artifacts.find((candidate) => candidate.id === artifactId)
        const existing = current.artifacts.find((candidate) => candidate.artifactId === artifactId)
        return {
          artifactId,
          required: action.requiredArtifactIds ? requiredIds.has(artifactId) : existing?.required ?? false,
          expectedRevision: artifactItem?.revision ?? existing?.expectedRevision ?? 1,
          resolution: 'missing',
        }
      })
      const includeGoal = action.includeParentGoalFile ?? current.includeParentGoalFile
      const parentGoal = state.artifacts.find((artifactItem) => artifactItem.nodeId === current.parentNodeId && artifactItem.kind === 'goal' && artifactItem.available)
      const updated: ContextTransfer = resolveContextTransfer({
        ...current,
        instructions: action.instructions ?? current.instructions,
        includeParentGoalFile: includeGoal,
        parentGoalFile: includeGoal
          ? {
              artifactId: parentGoal?.id ?? `missing-goal:${current.parentNodeId}`,
              required: true,
              expectedRevision: parentGoal?.revision ?? 0,
              resolution: parentGoal ? 'resolved' : 'missing',
            }
          : current.parentGoalFile,
        artifacts: references,
        updatedAt: demoTimestamp(state.nextSequence),
      }, state.artifacts)
      const transfers = state.transfers.map((transfer) => transfer.id === updated.id ? updated : transfer)
      return commit(state, {
        ...coreSnapshot(state),
        transfers,
        queue: syncQueueBlocks(state.queue, transfers),
        announcement: 'Context transfer saved and its references rechecked.',
        nextSequence: state.nextSequence + 1,
      })
    }
    case 'REMOVE_TRANSFER_REFERENCE': {
      const current = state.transfers.find((transfer) => transfer.id === action.transferId)
      if (!current) return state
      const updated: ContextTransfer = {
        ...current,
        includeParentGoalFile: current.parentGoalFile?.artifactId === action.artifactId ? false : current.includeParentGoalFile,
        artifacts: current.artifacts.filter((reference) => reference.artifactId !== action.artifactId),
        updatedAt: demoTimestamp(state.nextSequence),
      }
      const transfers = state.transfers.map((transfer) => transfer.id === updated.id ? updated : transfer)
      return commit(state, {
        ...coreSnapshot(state),
        transfers,
        queue: syncQueueBlocks(state.queue, transfers),
        announcement: 'Transfer reference removed.',
        nextSequence: state.nextSequence + 1,
      })
    }
    case 'REFRESH_TRANSFER_REFERENCE': {
      const current = state.transfers.find((transfer) => transfer.id === action.transferId)
      const artifactItem = state.artifacts.find((artifact) => artifact.id === action.artifactId)
      if (!current || !artifactItem || artifactItem.nodeId !== current.parentNodeId || !artifactItem.available) return state
      const refresh = (reference: ArtifactReference): ArtifactReference => reference.artifactId === artifactItem.id
        ? { ...reference, expectedRevision: artifactItem.revision, resolution: 'resolved' }
        : reference
      const updated: ContextTransfer = {
        ...current,
        parentGoalFile: current.parentGoalFile ? refresh(current.parentGoalFile) : undefined,
        artifacts: current.artifacts.map(refresh),
        updatedAt: demoTimestamp(state.nextSequence),
      }
      const transfers = state.transfers.map((transfer) => transfer.id === updated.id ? updated : transfer)
      return commit(state, {
        ...coreSnapshot(state),
        transfers,
        queue: syncQueueBlocks(state.queue, transfers),
        announcement: `Reference refreshed to revision ${artifactItem.revision}.`,
        nextSequence: state.nextSequence + 1,
      })
    }
    case 'UPDATE_ARTIFACT': {
      if (!state.artifacts.some((artifactItem) => artifactItem.id === action.artifactId)) return state
      const artifacts = state.artifacts.map((artifactItem) => artifactItem.id === action.artifactId ? { ...artifactItem, ...action.changes } : artifactItem)
      const transfers = resolvedTransfers(state.transfers, artifacts)
      return commit(state, {
        ...coreSnapshot(state),
        artifacts,
        transfers,
        queue: syncQueueBlocks(state.queue, transfers),
        announcement: 'Artifact changed; dependent transfer references were rechecked.',
      })
    }
    case 'CREATE_IMMEDIATE_ACTION': {
      const parent = state.nodes.find((node) => node.id === action.parentNodeId)
      if (!parent) return state
      const sequence = state.nextSequence
      const at = demoTimestamp(sequence)
      const nodeId = `node-immediate-${sequence}`
      const relationId = `relation-immediate-${sequence}`
      const transferId = `transfer-immediate-${sequence}`
      const isContinue = action.actionKind === 'continue'
      const node: WorkNode = {
        id: nodeId,
        title: action.title,
        type: immediateType(action.actionKind),
        status: 'queued',
        lifecycle: 'planned',
        workstreamId: parent.workstreamId,
        sourceThreadIds: [...parent.sourceThreadIds],
        owner: parent.owner,
        startedAt: at,
        summary: action.prompt,
        outcome: 'Queued for deterministic immediate-action simulation.',
        origin: `${isContinue ? 'Continued' : 'Created as a scoped action'} from “${parent.title}”.`,
        unresolvedQuestions: [],
        nextActions: [],
        artifactIds: [],
        activity: [activity(sequence, 'created', 'Immediate demo action queued.')],
        parentNodeId: parent.id,
        satelliteOfNodeId: isContinue ? undefined : parent.id,
      }
      const relationItem: GraphRelation = {
        id: relationId,
        kind: isContinue ? 'branches-from' : 'action-of',
        sourceNodeId: parent.id,
        targetNodeId: node.id,
        transferId,
        visibleByDefault: true,
      }
      const transfer: ContextTransfer = {
        id: transferId,
        relationId,
        parentNodeId: parent.id,
        childNodeId: node.id,
        instructions: action.prompt,
        includeParentGoalFile: false,
        artifacts: [],
        updatedAt: at,
      }
      const nextNodes = [...state.nodes, node]
      return commit(state, {
        ...coreSnapshot(state),
        nodes: nextNodes,
        dateWindow: expandWindowAfterNodeMutation(state.nodes, nextNodes, state.dateWindow),
        relations: [...state.relations, relationItem],
        transfers: [...state.transfers, transfer],
        selectedNodeId: node.id,
        selectedRelationId: undefined,
        focus: focusForCreatedChild(state, node),
        announcement: `${action.title} queued as an explicit deterministic demo action.`,
        nextSequence: sequence + 1,
      })
    }
    case 'ADVANCE_IMMEDIATE_ACTION': {
      const node = state.nodes.find((candidate) => candidate.id === action.nodeId)
      if (!node || (node.status !== 'queued' && node.status !== 'working')) return state
      const becomesReady = node.status === 'working'
      const artifactId = `artifact-immediate-${state.nextSequence}`
      const output: Artifact | undefined = becomesReady ? {
        id: artifactId,
        nodeId: node.id,
        name: `${node.title} result`,
        kind: node.type === 'visualization' ? 'figure' : 'report',
        path: `artifacts/demo/${node.id}-result.${node.type === 'visualization' ? 'png' : 'md'}`,
        summary: `Deterministic mocked output for ${node.title}.`,
        createdAt: demoTimestamp(state.nextSequence),
        revision: 1,
        available: true,
      } : undefined
      const artifacts = output ? [...state.artifacts, output] : state.artifacts
      const transfers = output ? resolvedTransfers(state.transfers, artifacts) : state.transfers
      return commit(state, {
        ...coreSnapshot(state),
        artifacts,
        transfers,
        queue: output ? syncQueueBlocks(state.queue, transfers) : state.queue,
        nodes: state.nodes.map((candidate) => candidate.id === node.id
          ? {
              ...candidate,
              status: becomesReady ? 'ready' : 'working',
              lifecycle: becomesReady ? 'awaiting-review' : 'ongoing',
              outcome: becomesReady ? 'The deterministic immediate-action simulation is ready.' : 'The deterministic immediate-action simulation is working.',
              artifactIds: output ? [...candidate.artifactIds, output.id] : candidate.artifactIds,
              activity: [...candidate.activity, activity(state.nextSequence, becomesReady ? 'completed' : 'progress', becomesReady ? 'Demo output is ready.' : 'Deterministic demo is working.')],
            }
          : candidate),
        announcement: becomesReady ? `${node.title} is ready with a mocked output.` : `${node.title} is working in the deterministic demo.`,
        nextSequence: state.nextSequence + 1,
      })
    }
    case 'CREATE_GROUP': {
      const requestedIds = action.nodeIds ?? state.multiSelectedNodeIds
      const invalid = validateViewGroupSelection(state.nodes, state.groups, requestedIds)
      if (invalid) return { ...state, announcement: invalid }
      const nodeIds = [...new Set(requestedIds)]
      const sequence = state.nextSequence
      const groupId = `group-demo-${sequence}`
      return commit(state, {
        ...coreSnapshot(state),
        groups: [...state.groups, {
          id: groupId,
          name: action.name,
          note: action.note,
          overlayColor: action.overlayColor,
          memberNodeIds: nodeIds,
          collapsed: false,
          createdAt: demoTimestamp(sequence),
        }],
        nodes: state.nodes.map((node) => nodeIds.includes(node.id) ? { ...node, groupId } : node),
        multiSelectedNodeIds: [],
        announcement: `Grouped ${nodeIds.length} work units as “${action.name}” without changing lineage or provenance.`,
        nextSequence: sequence + 1,
      })
    }
    case 'ADD_NODES_TO_GROUP': {
      const group = state.groups.find((candidate) => candidate.id === action.groupId)
      if (!group) return { ...state, announcement: 'That visual group no longer exists.' }
      const invalid = validateViewGroupSelection(state.nodes, state.groups, action.nodeIds, group.id)
      if (invalid) return { ...state, announcement: invalid }
      const nodeIds = [...new Set(action.nodeIds)]
      const members = [...new Set([...group.memberNodeIds, ...nodeIds])]
      return commit(state, {
        ...coreSnapshot(state),
        groups: state.groups.map((candidate) => candidate.id === group.id
          ? { ...candidate, memberNodeIds: members }
          : candidate),
        nodes: state.nodes.map((node) => nodeIds.includes(node.id) ? { ...node, groupId: group.id } : node),
        multiSelectedNodeIds: [],
        announcement: `Added ${nodeIds.length} work item${nodeIds.length === 1 ? '' : 's'} to “${group.name}” without changing parentage or provenance.`,
      })
    }
    case 'APPLY_GROUPING_PLAN': {
      const invalidGroup = validateViewGroupSelection(
        state.nodes,
        state.groups,
        action.nodeIds,
        action.targetGroupId,
      )
      if (invalidGroup) return { ...state, announcement: invalidGroup }
      const invalidProject = validateFixtureProjectAttachment(
        state.nodes,
        state.fixtureProjects,
        state.fixtureProjectAttachments,
        action.nodeIds,
        action.projectPlan,
        true,
      )
      if (invalidProject) return { ...state, announcement: invalidProject }
      const nodeIds = [...new Set(action.nodeIds)]
      const sequence = state.nextSequence
      const groupId = action.targetGroupId ?? `group-demo-${sequence}`
      const existingGroup = action.targetGroupId
        ? state.groups.find((candidate) => candidate.id === action.targetGroupId)
        : undefined
      const projectId = action.projectPlan.mode === 'existing-project'
        ? action.projectPlan.projectId
        : action.projectPlan.mode === 'new-project'
          ? `fixture-project-demo-${sequence}`
          : undefined
      const fixtureProjects = action.projectPlan.mode === 'new-project'
        ? [...state.fixtureProjects, {
            id: projectId!,
            name: action.projectPlan.projectName.trim(),
            status: 'active' as const,
            source: 'isolated-fixture' as const,
            createdAt: demoTimestamp(sequence),
          }]
        : state.fixtureProjects
      const attachmentNodeIds = projectId
        ? fixtureProjectAttachmentClosure(state.nodes, nodeIds).nodeIds
        : []
      const fixtureProjectAttachments = projectId
        ? [
            ...state.fixtureProjectAttachments.filter((attachment) => !attachmentNodeIds.includes(attachment.nodeId)),
            ...attachmentNodeIds.map((nodeId) => ({
              nodeId,
              projectId,
              source: 'threadwake-fixture-plan' as const,
              preparedAt: demoTimestamp(sequence),
            })),
          ]
        : state.fixtureProjectAttachments
      return commit(state, {
        ...coreSnapshot(state),
        groups: existingGroup
          ? state.groups.map((candidate) => candidate.id === existingGroup.id
              ? { ...candidate, memberNodeIds: [...new Set([...candidate.memberNodeIds, ...nodeIds])] }
              : candidate)
          : [...state.groups, {
              id: groupId,
              name: action.name,
              note: action.note,
              overlayColor: action.overlayColor,
              memberNodeIds: nodeIds,
              collapsed: false,
              createdAt: demoTimestamp(sequence),
            }],
        nodes: state.nodes.map((node) => nodeIds.includes(node.id) ? { ...node, groupId } : node),
        fixtureProjects,
        fixtureProjectAttachments,
        multiSelectedNodeIds: [],
        announcement: projectId
          ? `Grouped ${nodeIds.length} selected work item${nodeIds.length === 1 ? '' : 's'} and prepared one isolated fixture Project attachment plan with every required ancestor. Undo is available.`
          : `Grouped ${nodeIds.length} work item${nodeIds.length === 1 ? '' : 's'} as a view-only overlay. Undo is available.`,
        nextSequence: sequence + 1,
      })
    }
    case 'TOGGLE_GROUP_COLLAPSED': {
      const group = state.groups.find((candidate) => candidate.id === action.groupId)
      if (!group) return state
      return commit(state, {
        ...coreSnapshot(state),
        groups: state.groups.map((candidate) => candidate.id === group.id ? { ...candidate, collapsed: !candidate.collapsed } : candidate),
        announcement: `${group.name} ${group.collapsed ? 'expanded' : 'collapsed'} without changing its members.`,
      })
    }
    case 'UNGROUP': {
      if (!state.groups.some((group) => group.id === action.groupId)) return state
      return commit(state, {
        ...coreSnapshot(state),
        groups: state.groups.filter((group) => group.id !== action.groupId),
        nodes: state.nodes.map((node) => node.groupId === action.groupId ? { ...node, groupId: undefined } : node),
        announcement: 'Group removed; its work units and graph history remain.',
      })
    }
    case 'UNDO': {
      const previous = state.history.at(-1)
      if (!previous) return { ...state, announcement: 'Nothing to undo.' }
      return {
        ...structuredClone(previous),
        history: state.history.slice(0, -1),
      }
    }
    case 'RESET':
      return createInitialState()
  }
}

export function selectNodeById(state: AppState, nodeId = state.selectedNodeId): WorkNode | undefined {
  return nodeId ? state.nodes.find((node) => node.id === nodeId) : undefined
}

export function selectRelationById(state: AppState, relationId = state.selectedRelationId): GraphRelation | undefined {
  return relationId ? state.relations.find((relation) => relation.id === relationId) : undefined
}

export function selectTransferById(state: AppState, transferId?: string): ContextTransfer | undefined {
  return transferId ? state.transfers.find((transfer) => transfer.id === transferId) : undefined
}

export function selectArtifactById(state: AppState, artifactId?: string): Artifact | undefined {
  return artifactId ? state.artifacts.find((artifact) => artifact.id === artifactId) : undefined
}

export function selectArtifactsForNode(state: AppState, nodeId: string): Artifact[] {
  return state.artifacts
    .filter((artifact) => artifact.nodeId === nodeId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

export function selectQueueItemByNodeId(state: AppState, nodeId: string): QueueItem | undefined {
  return state.queue.find((item) => item.nodeId === nodeId)
}

export function selectOrderedQueue(state: AppState): QueueItem[] {
  return [...state.queue].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function selectAvailableTransferArtifacts(state: AppState, transferId: string): Artifact[] {
  const transfer = selectTransferById(state, transferId)
  if (!transfer) return []
  return state.artifacts
    .filter((artifact) => artifact.nodeId === transfer.parentNodeId && artifact.available)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name))
}

export interface TransferSummary {
  instructionPresent: boolean
  includeParentGoalFile: boolean
  selectedArtifactCount: number
  resolvedCount: number
  missingCount: number
  staleCount: number
  blockingCount: number
}

export function selectTransferSummary(state: AppState, transferId: string): TransferSummary | undefined {
  const transfer = selectTransferById(state, transferId)
  if (!transfer) return undefined
  const references = [
    ...(transfer.includeParentGoalFile && transfer.parentGoalFile ? [transfer.parentGoalFile] : []),
    ...transfer.artifacts,
  ]
  return {
    instructionPresent: transfer.instructions.trim().length > 0,
    includeParentGoalFile: transfer.includeParentGoalFile,
    selectedArtifactCount: transfer.artifacts.length,
    resolvedCount: references.filter((reference) => reference.resolution === 'resolved').length,
    missingCount: references.filter((reference) => reference.resolution === 'missing').length,
    staleCount: references.filter((reference) => reference.resolution === 'stale').length,
    blockingCount: references.filter((reference) => reference.required && reference.resolution !== 'resolved').length,
  }
}

export function selectQueueBlockReason(state: AppState, queueItemId: string): string | undefined {
  const item = state.queue.find((candidate) => candidate.id === queueItemId)
  return item ? queueBlockReason(item, state.queue, state.transfers) : undefined
}

export function selectCanPlayQueueItem(state: AppState, queueItemId: string): boolean {
  const item = state.queue.find((candidate) => candidate.id === queueItemId)
  return Boolean(item && item.selected && (item.status === 'draft' || item.status === 'queued') && !selectQueueBlockReason(state, queueItemId))
}

export function selectVisibleNodes(state: AppState): WorkNode[] {
  const collapsedMemberIds = new Set(
    state.groups.filter((group) => group.collapsed).flatMap((group) => group.memberNodeIds),
  )
  return state.nodes.filter((node) => !collapsedMemberIds.has(node.id))
}

export function selectVisibleRelations(state: AppState): GraphRelation[] {
  const visibleNodeIds = new Set(selectVisibleNodes(state).map((node) => node.id))
  return state.relations.filter((relation) =>
    state.layers[relation.kind]
    && visibleNodeIds.has(relation.sourceNodeId)
    && visibleNodeIds.has(relation.targetNodeId),
  )
}

function normalizedSearchText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '')
}

export function selectSearchResults(state: AppState, query = state.searchQuery): WorkNode[] {
  const needle = normalizedSearchText(query.trim())
  if (!needle) return []
  const threadById = new Map(state.sourceThreads.map((thread) => [thread.id, thread]))
  const streamById = new Map(state.workstreams.map((stream) => [stream.id, stream]))
  return state.nodes
    .map((node) => {
      const artifacts = selectArtifactsForNode(state, node.id)
      const title = normalizedSearchText(node.title)
      const artifactNames = normalizedSearchText(artifacts.map((artifact) => artifact.name).join(' '))
      const failureEvidence = normalizedSearchText([
        node.failureReason,
        node.outcome,
        node.decision,
      ].filter(Boolean).join(' '))
      const coreDescription = normalizedSearchText([
        node.summary,
        node.origin,
        ...node.unresolvedQuestions,
        ...node.nextActions,
      ].filter(Boolean).join(' '))
      const supportingContext = normalizedSearchText([
        node.type,
        node.status,
        streamById.get(node.workstreamId)?.name,
        ...node.sourceThreadIds.flatMap((id) => {
          const thread = threadById.get(id)
          return [id, thread?.title, thread?.summary]
        }),
        ...artifacts.flatMap((artifact) => [artifact.kind, artifact.path, artifact.summary]),
      ].filter(Boolean).join(' '))
      const score =
        (title.includes(needle) ? 24 : 0)
        + (artifactNames.includes(needle) ? 20 : 0)
        + (failureEvidence.includes(needle) ? 16 : 0)
        + (coreDescription.includes(needle) ? 8 : 0)
        + (supportingContext.includes(needle) ? 3 : 0)
      return { node, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.node.startedAt.localeCompare(left.node.startedAt)
      || left.node.id.localeCompare(right.node.id),
    )
    .map(({ node }) => node)
}

export function selectChronologicalNodes(state: AppState): WorkNode[] {
  return [...selectVisibleNodes(state)].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id),
  )
}

export function selectRelationsForNode(state: AppState, nodeId: string): GraphRelation[] {
  return state.relations.filter((relation) => relation.sourceNodeId === nodeId || relation.targetNodeId === nodeId)
}

export function selectRelationTransfer(state: AppState, relationId: string): ContextTransfer | undefined {
  const relation = selectRelationById(state, relationId)
  return relation?.transferId ? selectTransferById(state, relation.transferId) : undefined
}

export function selectQueueRelation(state: AppState, queueItemId: string): GraphRelation | undefined {
  const item = state.queue.find((candidate) => candidate.id === queueItemId)
  return item ? relationForQueueItem(item, state.relations) : undefined
}
