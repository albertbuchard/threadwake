export type WorkstreamId = string
export type WorkNodeId = string
export type ArtifactId = string
export type RelationId = string
export type TransferId = string
export type QueueItemId = string
export type WorkGroupId = string
export type SourceThreadId = string
export type FixtureProjectId = string

export type WorkNodeType =
  | 'idea'
  | 'experiment'
  | 'decision'
  | 'feature'
  | 'plan'
  | 'deliverable'
  | 'verification'
  | 'test'
  | 'status'
  | 'summary'
  | 'visualization'

export type WorkNodeStatus =
  | 'successful'
  | 'failed'
  | 'rejected'
  | 'blocked'
  | 'active'
  | 'planned'
  | 'queued'
  | 'working'
  | 'ready'

export type ArtifactKind =
  | 'goal'
  | 'csv'
  | 'report'
  | 'figure'
  | 'manifest'
  | 'code'
  | 'patch'
  | 'other'

export type RelationKind =
  | 'continues'
  | 'branches-from'
  | 'action-of'
  | 'depends-on'
  | 'same-source-thread'
  | 'related-to'

export type TransferResolution = 'resolved' | 'missing' | 'stale'
export type ExecutionKind = 'plan' | 'goal'
export type QueueItemStatus = 'draft' | 'queued' | 'simulated-running' | 'completed'
export type WorkLifecycle =
  | 'planned'
  | 'ongoing'
  | 'awaiting-review'
  | 'backlog'
  | 'done'
  | 'abandoned'
export type ViewMode = 'graph' | 'kanban'
export type FocusLevel = 'project' | 'workstream' | 'node' | 'relation'
export type ImmediateActionKind =
  | 'continue'
  | 'verify'
  | 'test'
  | 'report-status'
  | 'summarize'
  | 'visualize'

export interface ActivityEntry {
  id: string
  at: string
  kind: 'created' | 'progress' | 'decision' | 'failure' | 'output' | 'completed' | 'note'
  message: string
}

export interface Workstream {
  id: WorkstreamId
  name: string
  description: string
  /** Stable lane angle in radians. Time is never encoded in this value. */
  angle: number
  color: string
  owner: string
}

export interface SourceThread {
  id: SourceThreadId
  title: string
  summary: string
  startedAt: string
  lastActiveAt: string
}

export interface WorkNode {
  id: WorkNodeId
  title: string
  type: WorkNodeType
  status: WorkNodeStatus
  /** Canonical board position. Execution evidence remains in status/activity. */
  lifecycle: WorkLifecycle
  workstreamId: WorkstreamId
  sourceThreadIds: SourceThreadId[]
  owner: string
  startedAt: string
  endedAt?: string
  summary: string
  outcome: string
  origin: string
  failureReason?: string
  decision?: string
  unresolvedQuestions: string[]
  nextActions: string[]
  artifactIds: ArtifactId[]
  activity: ActivityEntry[]
  parentNodeId?: WorkNodeId
  satelliteOfNodeId?: WorkNodeId
  groupId?: WorkGroupId
  abandonmentReason?: string
}

export interface Artifact {
  id: ArtifactId
  nodeId: WorkNodeId
  name: string
  kind: ArtifactKind
  path: string
  summary: string
  createdAt: string
  /** References pin this revision so later changes can be reported as stale. */
  revision: number
  available: boolean
}

export interface GraphRelation {
  id: RelationId
  kind: RelationKind
  sourceNodeId: WorkNodeId
  targetNodeId: WorkNodeId
  label?: string
  transferId?: TransferId
  visibleByDefault: boolean
}

export interface ArtifactReference {
  artifactId: ArtifactId
  required: boolean
  expectedRevision: number
  resolution: TransferResolution
}

export interface ContextTransfer {
  id: TransferId
  relationId: RelationId
  parentNodeId: WorkNodeId
  childNodeId: WorkNodeId
  instructions: string
  includeParentGoalFile: boolean
  parentGoalFile?: ArtifactReference
  artifacts: ArtifactReference[]
  updatedAt: string
}

export interface QueueItem {
  id: QueueItemId
  /** A stable, contiguous, zero-based position in the visible queue. */
  order: number
  nodeId: WorkNodeId
  parentNodeId: WorkNodeId
  parentQueueItemId?: QueueItemId
  title: string
  prompt: string
  executionKind: ExecutionKind
  selected: boolean
  status: QueueItemStatus
  relationId: RelationId
  contextTransferId: TransferId
  activity: ActivityEntry[]
  outputArtifactIds: ArtifactId[]
  progress: number
  /** Set only by Play selected; it authorizes chained execution after dependencies finish. */
  playRequested: boolean
  blockedReason?: string
}

export interface WorkGroup {
  id: WorkGroupId
  name: string
  note: string
  /** View-only overlay colour; Forge has no epic/group entity or task colour. */
  overlayColor: string
  memberNodeIds: WorkNodeId[]
  collapsed: boolean
  createdAt: string
}

/**
 * An isolated, deterministic representation of Forge's real Project boundary.
 * It is a planning fixture only and is never evidence of a live Forge write.
 */
export interface FixtureProject {
  id: FixtureProjectId
  name: string
  status: 'active' | 'paused' | 'completed'
  source: 'isolated-fixture'
  createdAt: string
}

export interface FixtureProjectAttachment {
  nodeId: WorkNodeId
  projectId: FixtureProjectId
  source: 'threadwake-fixture-plan'
  preparedAt: string
}

export type FixtureProjectAttachmentPlan =
  | { mode: 'visual-only' }
  | { mode: 'existing-project'; projectId: FixtureProjectId }
  | { mode: 'new-project'; projectName: string }

export interface FocusState {
  level: FocusLevel
  workstreamId?: WorkstreamId
  nodeId?: WorkNodeId
  relationId?: RelationId
  /** Prior semantic levels, used by Escape/breadcrumb navigation. */
  trail: Array<{
    level: FocusLevel
    workstreamId?: WorkstreamId
    nodeId?: WorkNodeId
    relationId?: RelationId
  }>
}

/** Persisted semantic drag intent; geometry clamps it to the current viewport corridor. */
export interface ManualNodeOffset {
  angleOffset: number
  radialOffset?: number
}

/** Inclusive absolute-time interval used by every temporal graph projection. */
export interface DateWindow {
  startMs: number
  endMs: number
}

export type LayerVisibility = Record<RelationKind, boolean>

export interface CoreAppState {
  workstreams: Workstream[]
  sourceThreads: SourceThread[]
  nodes: WorkNode[]
  artifacts: Artifact[]
  relations: GraphRelation[]
  transfers: ContextTransfer[]
  queue: QueueItem[]
  groups: WorkGroup[]
  fixtureProjects: FixtureProject[]
  fixtureProjectAttachments: FixtureProjectAttachment[]
  selectedNodeId?: WorkNodeId
  selectedRelationId?: RelationId
  multiSelectedNodeIds: WorkNodeId[]
  manualNodeOffsets: Record<WorkNodeId, ManualNodeOffset>
  /** Canonical committed graph window. Renderer previews remain ephemeral UI state. */
  dateWindow: DateWindow
  focus: FocusState
  layers: LayerVisibility
  searchQuery: string
  view: ViewMode
  collapsedLifecycles: WorkLifecycle[]
  announcement: string
  /** Monotonic deterministic sequence used for locally created demo entities. */
  nextSequence: number
}

export interface AppState extends CoreAppState {
  history: CoreAppState[]
}

export type QueueItemEditableFields = Partial<
  Pick<QueueItem, 'title' | 'prompt' | 'executionKind'>
>

export type AppAction =
  | { type: 'SELECT_NODE'; nodeId?: WorkNodeId }
  | { type: 'SELECT_RELATION'; relationId?: RelationId }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_VIEW'; view: ViewMode }
  | {
      type: 'RESTORE_ROUTE_STATE'
      view: ViewMode
      selectedNodeId?: WorkNodeId
      selectedRelationId?: RelationId
      focus: FocusState
      layers: LayerVisibility
      searchQuery: string
      collapsedLifecycles: WorkLifecycle[]
      dateWindow: DateWindow
      announcement: string
    }
  | { type: 'SET_DATE_WINDOW'; window: DateWindow; source: 'gesture' | 'reset' | 'reveal' }
  | { type: 'RESTORE_DATE_WINDOW'; window: DateWindow; announcement?: string }
  | { type: 'CLEAR_SELECTION_AND_FOCUS' }
  | { type: 'MOVE_NODE_LIFECYCLE'; nodeId: WorkNodeId; lifecycle: WorkLifecycle; reason?: string }
  | { type: 'TOGGLE_LIFECYCLE_COLLAPSED'; lifecycle: WorkLifecycle }
  | { type: 'FOCUS_WORKSTREAM'; workstreamId: WorkstreamId }
  | { type: 'FOCUS_NODE'; nodeId: WorkNodeId }
  | { type: 'FOCUS_RELATION'; relationId: RelationId }
  | { type: 'STEP_FOCUS_OUT' }
  | { type: 'SET_LAYER'; layer: RelationKind; visible: boolean }
  | { type: 'TOGGLE_LAYER'; layer: RelationKind }
  | { type: 'TOGGLE_MULTI_SELECT'; nodeId: WorkNodeId }
  | { type: 'SET_MULTI_SELECTION'; nodeIds: WorkNodeId[] }
  | { type: 'CLEAR_MULTI_SELECTION' }
  | { type: 'SET_MANUAL_NODE_OFFSET'; nodeId: WorkNodeId; offset: ManualNodeOffset }
  | { type: 'CLEAR_MANUAL_NODE_OFFSET'; nodeId: WorkNodeId }
  | { type: 'CLEAR_MANUAL_NODE_OFFSETS' }
  | {
      type: 'PLAN_NEXT_ACTION'
      parentNodeId: WorkNodeId
      title: string
      prompt: string
      executionKind?: ExecutionKind
      parentQueueItemId?: QueueItemId
    }
  | {
      type: 'ADD_QUEUE_CHILD'
      parentQueueItemId: QueueItemId
      title: string
      prompt: string
      executionKind?: ExecutionKind
    }
  | { type: 'UPDATE_QUEUE_ITEM'; queueItemId: QueueItemId; changes: QueueItemEditableFields }
  | { type: 'TOGGLE_QUEUE_SELECTION'; queueItemId: QueueItemId }
  | { type: 'SET_QUEUE_SELECTION'; queueItemIds: QueueItemId[]; selected: boolean }
  | { type: 'REORDER_QUEUE_ITEM'; queueItemId: QueueItemId; toIndex: number }
  | { type: 'PLAY_SELECTED' }
  | {
      type: 'DISCOVER_QUEUE_OUTPUT'
      queueItemId: QueueItemId
      artifact: {
        id?: ArtifactId
        name: string
        kind: ArtifactKind
        path: string
        summary: string
      }
    }
  | { type: 'COMPLETE_QUEUE_ITEM'; queueItemId: QueueItemId }
  | {
      type: 'CHANGE_QUEUE_PARENT'
      queueItemId: QueueItemId
      parentNodeId: WorkNodeId
      parentQueueItemId?: QueueItemId
    }
  | {
      type: 'UPDATE_CONTEXT_TRANSFER'
      transferId: TransferId
      instructions?: string
      includeParentGoalFile?: boolean
      artifactIds?: ArtifactId[]
      requiredArtifactIds?: ArtifactId[]
    }
  | { type: 'REMOVE_TRANSFER_REFERENCE'; transferId: TransferId; artifactId: ArtifactId }
  | { type: 'REFRESH_TRANSFER_REFERENCE'; transferId: TransferId; artifactId: ArtifactId }
  | {
      type: 'UPDATE_ARTIFACT'
      artifactId: ArtifactId
      changes: Partial<Pick<Artifact, 'available' | 'revision' | 'name' | 'path' | 'summary'>>
    }
  | {
      type: 'CREATE_IMMEDIATE_ACTION'
      parentNodeId: WorkNodeId
      actionKind: ImmediateActionKind
      title: string
      prompt: string
    }
  | { type: 'ADVANCE_IMMEDIATE_ACTION'; nodeId: WorkNodeId }
  | { type: 'CREATE_GROUP'; name: string; note: string; overlayColor: string; nodeIds?: WorkNodeId[] }
  | { type: 'ADD_NODES_TO_GROUP'; groupId: WorkGroupId; nodeIds: WorkNodeId[] }
  | {
      type: 'APPLY_GROUPING_PLAN'
      nodeIds: WorkNodeId[]
      targetGroupId?: WorkGroupId
      name: string
      note: string
      overlayColor: string
      projectPlan: FixtureProjectAttachmentPlan
    }
  | { type: 'TOGGLE_GROUP_COLLAPSED'; groupId: WorkGroupId }
  | { type: 'UNGROUP'; groupId: WorkGroupId }
  | { type: 'UNDO' }
  | { type: 'RESET' }
