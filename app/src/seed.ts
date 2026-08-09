import type {
  ActivityEntry,
  AppState,
  Artifact,
  ArtifactReference,
  ContextTransfer,
  CoreAppState,
  GraphRelation,
  QueueItem,
  SourceThread,
  WorkGroup,
  WorkNode,
  WorkNodeStatus,
  WorkNodeType,
  WorkLifecycle,
  Workstream,
} from './domain'

const OWNER = 'Fixture owner + Threadwake agent'

function activity(id: string, at: string, kind: ActivityEntry['kind'], message: string): ActivityEntry {
  return { id, at, kind, message }
}

interface NodeInput {
  id: string
  title: string
  type: WorkNodeType
  status: WorkNodeStatus
  workstreamId: string
  sourceThreadIds: string[]
  startedAt: string
  endedAt?: string
  summary: string
  outcome: string
  origin: string
  failureReason?: string
  decision?: string
  unresolvedQuestions?: string[]
  nextActions?: string[]
  artifactIds?: string[]
  parentNodeId?: string
  satelliteOfNodeId?: string
  groupId?: string
}

function workNode(input: NodeInput): WorkNode {
  const terminalKind = input.status === 'failed' ? 'failure' : input.status === 'planned' ? 'created' : 'completed'
  return {
    ...input,
    lifecycle: 'done',
    owner: OWNER,
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    nextActions: input.nextActions ?? [],
    artifactIds: input.artifactIds ?? [],
    activity: [
      activity(
        `${input.id}-activity-1`,
        input.endedAt ?? input.startedAt,
        terminalKind,
        input.status === 'planned'
          ? 'Draft prepared locally. No agent was started and no output was produced.'
          : input.outcome,
      ),
    ],
  }
}

export const WORKSTREAMS: Workstream[] = [
  {
    id: 'stream-visual-map',
    name: 'Temporal map',
    description: 'Represent absolute time and stable workstream identity without turning the map into a hairball.',
    angle: -2.46,
    color: '#74d8ff',
    owner: OWNER,
  },
  {
    id: 'stream-extraction',
    name: 'Work-unit extraction',
    description: 'Separate meaningful units of work from the chats in which they happened.',
    angle: -1.14,
    color: '#a7f2d0',
    owner: OWNER,
  },
  {
    id: 'stream-continuity',
    name: 'Continuity recovery',
    description: 'Recover ownership, status, dormant branches, and understandable next steps across threads.',
    angle: 0.02,
    color: '#f6e7ac',
    owner: OWNER,
  },
  {
    id: 'stream-provenance',
    name: 'Evidence and provenance',
    description: 'Preserve executed evidence, artifact lineage, and explicit parent-to-child context.',
    angle: 1.32,
    color: '#ffb38f',
    owner: OWNER,
  },
  {
    id: 'stream-navigation',
    name: 'Organisation and navigation',
    description: 'Make search, grouping, focus, and chronological alternatives dependable.',
    angle: 2.56,
    color: '#c9b6ff',
    owner: OWNER,
  },
]

export const SOURCE_THREADS: SourceThread[] = [
  {
    id: 'thread-origin',
    title: 'Why chat tabs stop scaling',
    summary: 'The originating discussion framed the harness as an environment for structure, state, history, and follow-up.',
    startedAt: '2026-04-20T09:00:00.000Z',
    lastActiveAt: '2026-05-08T18:00:00.000Z',
  },
  {
    id: 'thread-rendering',
    title: 'Orbital renderer experiments',
    summary: 'Canvas, WebGL, density, labels, and focus-camera experiments for the temporal map.',
    startedAt: '2026-05-03T08:30:00.000Z',
    lastActiveAt: '2026-07-27T16:20:00.000Z',
  },
  {
    id: 'thread-extraction',
    title: 'Work-unit extraction research',
    summary: 'Attempts to infer work units from long conversations without losing topic boundaries.',
    startedAt: '2026-05-10T11:00:00.000Z',
    lastActiveAt: '2026-07-12T13:15:00.000Z',
  },
  {
    id: 'thread-recovery',
    title: 'Status and ownership recovery',
    summary: 'Cross-thread audits, dormant work detection, plain-language handoffs, and search.',
    startedAt: '2026-05-24T07:45:00.000Z',
    lastActiveAt: '2026-07-31T17:40:00.000Z',
  },
  {
    id: 'thread-evidence',
    title: 'Experiment evidence and handoffs',
    summary: 'Preserved failures, manifests, artifact references, context-transfer rules, and queue choreography.',
    startedAt: '2026-06-02T10:20:00.000Z',
    lastActiveAt: '2026-08-08T21:30:00.000Z',
  },
]

export const ARTIFACTS: Artifact[] = [
  {
    id: 'artifact-origin-goal',
    nodeId: 'node-map-question',
    name: 'Agent workspace redesign goal',
    kind: 'goal',
    path: 'artifacts/agent-workspace-redesign-goal.md',
    summary: 'Defines recovery, continuity, planning, and explicit context transfer as the product objective.',
    createdAt: '2026-04-22T12:00:00.000Z',
    revision: 3,
    available: true,
  },
  {
    id: 'artifact-canvas-code',
    nodeId: 'node-canvas-prototype',
    name: 'Canvas renderer prototype',
    kind: 'code',
    path: 'artifacts/renderers/canvas-prototype.ts',
    summary: 'The first direct canvas implementation used in density experiments.',
    createdAt: '2026-05-10T17:30:00.000Z',
    revision: 2,
    available: true,
  },
  {
    id: 'artifact-renderer-csv',
    nodeId: 'node-renderer-failure',
    name: '10,000-node frame measurements',
    kind: 'csv',
    path: 'artifacts/renderer/10k-frame-times.csv',
    summary: 'Frame-rate and long-task measurements showing sustained rendering at only 12–18 frames per second.',
    createdAt: '2026-05-18T16:00:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-label-figure',
    nodeId: 'node-renderer-failure',
    name: 'Label collision evidence',
    kind: 'figure',
    path: 'artifacts/renderer/label-collision.png',
    summary: 'A captured dense state where overlapping labels became unreadable.',
    createdAt: '2026-05-18T16:04:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-renderer-report',
    nodeId: 'node-renderer-failure',
    name: 'Failed renderer experiment report',
    kind: 'report',
    path: 'artifacts/renderer/failed-renderer-report.md',
    summary: 'Explains why the monolithic immediate-mode approach was abandoned and what remains unresolved.',
    createdAt: '2026-05-19T09:30:00.000Z',
    revision: 2,
    available: true,
  },
  {
    id: 'artifact-hybrid-manifest',
    nodeId: 'node-hybrid-renderer',
    name: 'Hybrid renderer decision manifest',
    kind: 'manifest',
    path: 'artifacts/renderer/hybrid-decision.json',
    summary: 'Records the decision to split the retained graph canvas from semantic DOM controls.',
    createdAt: '2026-05-27T15:10:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-drift-csv',
    nodeId: 'node-topic-drift-failure',
    name: 'Topic-drift error table',
    kind: 'csv',
    path: 'artifacts/extraction/topic-drift-errors.csv',
    summary: 'Examples where long threads were incorrectly collapsed into one work unit.',
    createdAt: '2026-05-31T17:00:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-extraction-report',
    nodeId: 'node-hybrid-extraction',
    name: 'Hybrid extraction decision report',
    kind: 'report',
    path: 'artifacts/extraction/hybrid-decision.md',
    summary: 'Combines model suggestions with explicit user-authored work-unit boundaries.',
    createdAt: '2026-06-14T12:20:00.000Z',
    revision: 2,
    available: true,
  },
  {
    id: 'artifact-ownership-csv',
    nodeId: 'node-cross-thread-map',
    name: 'Cross-thread ownership table',
    kind: 'csv',
    path: 'artifacts/recovery/thread-ownership.csv',
    summary: 'Maps work units to source threads while keeping thread identity as provenance only.',
    createdAt: '2026-06-26T18:10:00.000Z',
    revision: 4,
    available: true,
  },
  {
    id: 'artifact-evidence-manifest',
    nodeId: 'node-evidence-preservation',
    name: 'Failed-run evidence manifest',
    kind: 'manifest',
    path: 'artifacts/evidence/failed-run-manifest.json',
    summary: 'Indexes failures, executed-code evidence, measurements, decisions, and unresolved questions.',
    createdAt: '2026-06-29T14:00:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-transfer-goal',
    nodeId: 'node-transfer-model',
    name: 'Context-transfer implementation goal',
    kind: 'goal',
    path: 'artifacts/transfers/context-transfer-goal.md',
    summary: 'Requires every executable edge to state exactly what its child receives.',
    createdAt: '2026-07-22T09:00:00.000Z',
    revision: 5,
    available: true,
  },
  {
    id: 'artifact-transfer-csv',
    nodeId: 'node-transfer-model',
    name: 'Artifact handoff cases',
    kind: 'csv',
    path: 'artifacts/transfers/handoff-cases.csv',
    summary: 'Fixture cases for resolved, missing, stale, optional, and required transfers.',
    createdAt: '2026-07-22T09:10:00.000Z',
    revision: 2,
    available: true,
  },
  {
    id: 'artifact-transfer-report',
    nodeId: 'node-transfer-model',
    name: 'Parent-output handoff report',
    kind: 'report',
    path: 'artifacts/transfers/handoff-report.md',
    summary: 'Plain-language explanation of how edge-level context differs from graph topology.',
    createdAt: '2026-07-22T09:15:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-transfer-figure',
    nodeId: 'node-transfer-model',
    name: 'Transfer editor states',
    kind: 'figure',
    path: 'artifacts/transfers/editor-states.png',
    summary: 'Resolved, missing, and stale reference treatments in one figure.',
    createdAt: '2026-07-22T09:20:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-transfer-manifest',
    nodeId: 'node-transfer-model',
    name: 'Transfer fixture manifest',
    kind: 'manifest',
    path: 'artifacts/transfers/fixture-manifest.json',
    summary: 'Machine-readable inventory of seeded transfer examples.',
    createdAt: '2026-07-22T09:25:00.000Z',
    revision: 1,
    available: true,
  },
  {
    id: 'artifact-transfer-code',
    nodeId: 'node-transfer-model',
    name: 'Transfer resolution prototype',
    kind: 'code',
    path: 'artifacts/transfers/resolve-transfer.ts',
    summary: 'Pure reference resolution and stale-revision comparison prototype.',
    createdAt: '2026-07-22T09:30:00.000Z',
    revision: 3,
    available: true,
  },
  {
    id: 'artifact-search-report',
    nodeId: 'node-search-index',
    name: 'Search recovery test report',
    kind: 'report',
    path: 'artifacts/navigation/search-recovery.md',
    summary: 'Shows that failed renderer and label collision queries recover the historical evidence.',
    createdAt: '2026-07-24T17:00:00.000Z',
    revision: 1,
    available: true,
  },
]

const RAW_WORK_NODES: WorkNode[] = [
  workNode({
    id: 'node-map-question', title: 'Frame the temporal work map', type: 'idea', status: 'successful',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-origin'], startedAt: '2026-04-22T09:00:00.000Z', endedAt: '2026-04-24T12:00:00.000Z',
    summary: 'Ask whether months of agent work can be recovered as a temporal graph instead of a list of chats.',
    outcome: 'The team adopted work units, workstreams, artifacts, and source-thread provenance as separate concepts.',
    origin: 'The recurring cost of reconstructing context from cryptically named chat tabs.',
    artifactIds: ['artifact-origin-goal'], nextActions: ['Test a radial encoding of absolute time.'],
  }),
  workNode({
    id: 'node-canvas-prototype', title: 'Build the first orbital canvas', type: 'experiment', status: 'successful',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-origin', 'thread-rendering'], startedAt: '2026-05-05T08:30:00.000Z', endedAt: '2026-05-10T17:30:00.000Z',
    summary: 'Place work on concentric date rings and stable angular workstream lanes.',
    outcome: 'The visual grammar worked at hundreds of nodes and established radius as time, never angle.',
    origin: 'Continued the temporal-map question.', parentNodeId: 'node-map-question', artifactIds: ['artifact-canvas-code'],
    unresolvedQuestions: ['Would the immediate-mode renderer remain legible at much higher density?'], nextActions: ['Stress-test at 10,000 nodes.'],
  }),
  workNode({
    id: 'node-renderer-failure', title: 'Failed renderer experiment: 10,000 nodes', type: 'experiment', status: 'failed',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-rendering'], startedAt: '2026-05-15T09:00:00.000Z', endedAt: '2026-05-19T09:30:00.000Z',
    summary: 'Stress-test a monolithic immediate-mode canvas with 10,000 work nodes and labels.',
    outcome: 'Frame rate fell to 12–18 frames per second at 10,000 nodes, labels became unreadable, and pointer hit testing lagged. The approach was abandoned, but its measurements and label-collision evidence were preserved.',
    failureReason: 'Every frame redrew all geometry and labels. Dense label collision destroyed readability before raw point rendering reached its limit.',
    decision: 'Reject the monolithic renderer; retain the evidence and test a retained GPU graph with semantic DOM surfaces.',
    origin: 'The unresolved scaling question from the first orbital canvas.', parentNodeId: 'node-canvas-prototype',
    artifactIds: ['artifact-renderer-csv', 'artifact-label-figure', 'artifact-renderer-report'],
    unresolvedQuestions: ['How much density can remain visible without labels?', 'Which labels should enter the DOM only after focus?'],
    nextActions: ['Prototype a retained PixiJS graph.', 'Keep labels and controls in semantic HTML.'],
  }),
  workNode({
    id: 'node-hybrid-renderer', title: 'Choose a retained graph and semantic DOM', type: 'decision', status: 'successful',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-rendering'], startedAt: '2026-05-23T10:00:00.000Z', endedAt: '2026-05-27T15:10:00.000Z',
    summary: 'Compare a retained GPU graph, DOM overlays, and full SVG after the density failure.',
    outcome: 'PixiJS became responsible for graph geometry while inspectors, controls, and accessibility remained React DOM.',
    decision: 'Use a hybrid renderer and scope the demo to roughly 30 nodes rather than claim production-scale density.',
    origin: 'A direct response to the 10,000-node renderer failure.', parentNodeId: 'node-renderer-failure', artifactIds: ['artifact-hybrid-manifest'],
    nextActions: ['Build a DOM semantic mirror.', 'Verify focus rotation.'],
  }),
  workNode({
    id: 'node-semantic-mirror', title: 'Define the semantic graph mirror', type: 'feature', status: 'active',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-rendering', 'thread-recovery'], startedAt: '2026-06-09T08:00:00.000Z',
    summary: 'Expose every visible canvas node and relation through chronological, keyboard-reachable DOM controls.',
    outcome: 'The semantic path now mirrors selection, focus, relation inspection, action creation, and grouping.',
    origin: 'The retained-renderer decision required an equally capable non-canvas path.', parentNodeId: 'node-hybrid-renderer',
    unresolvedQuestions: ['How should the mobile bottom sheet offset a selected graph point?'], nextActions: ['Validate at 390 by 844 CSS pixels.'],
  }),

  workNode({
    id: 'node-work-unit-hypothesis', title: 'Separate work units from chats', type: 'idea', status: 'successful',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-origin', 'thread-extraction'], startedAt: '2026-05-11T11:00:00.000Z', endedAt: '2026-05-13T14:00:00.000Z',
    summary: 'Treat a meaningful experiment, decision, feature, or deliverable as the unit of organisation.',
    outcome: 'Source threads became provenance metadata rather than graph containers.', origin: 'The same chat repeatedly contained several unrelated workstreams.',
    nextActions: ['Test automatic topic segmentation.'],
  }),
  workNode({
    id: 'node-topic-drift-failure', title: 'Topic-drift extraction failure', type: 'experiment', status: 'failed',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-extraction'], startedAt: '2026-05-26T09:15:00.000Z', endedAt: '2026-05-31T17:00:00.000Z',
    summary: 'Use embedding similarity alone to split long agent chats into work units.',
    outcome: 'The extractor merged recurring terms across unrelated goals and split single experiments whenever their vocabulary changed.',
    failureReason: 'Lexical continuity was treated as goal continuity, so topic drift and returning motifs confused the boundary detector.',
    origin: 'The work-unit hypothesis needed a scalable extraction method.', parentNodeId: 'node-work-unit-hypothesis', artifactIds: ['artifact-drift-csv'],
    unresolvedQuestions: ['Which boundaries must remain explicitly user-authored?'], nextActions: ['Compare a manual taxonomy.', 'Test a hybrid suggestion workflow.'],
  }),
  workNode({
    id: 'node-manual-taxonomy', title: 'Reject a fully manual taxonomy', type: 'decision', status: 'rejected',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-extraction'], startedAt: '2026-06-03T13:00:00.000Z', endedAt: '2026-06-05T10:00:00.000Z',
    summary: 'Evaluate whether the user should manually label every work unit and relationship.',
    outcome: 'Manual curation was accurate but recreated the maintenance burden the product was meant to remove.',
    decision: 'Keep user correction and explicit boundaries, but do not require exhaustive manual graph construction.',
    origin: 'A conservative response to the topic-drift failure.', parentNodeId: 'node-topic-drift-failure', nextActions: ['Design hybrid extraction.'],
  }),
  workNode({
    id: 'node-hybrid-extraction', title: 'Adopt hybrid work-unit extraction', type: 'decision', status: 'successful',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-extraction', 'thread-recovery'], startedAt: '2026-06-09T10:10:00.000Z', endedAt: '2026-06-14T12:20:00.000Z',
    summary: 'Combine automated boundary suggestions with durable user corrections and named goals.',
    outcome: 'The design preserves assistance without letting vocabulary similarity silently rewrite work history.',
    decision: 'Use model suggestions as proposals; treat explicit user correction and artifact lineage as authoritative.',
    origin: 'Synthesized the embedding failure and rejected manual taxonomy.', parentNodeId: 'node-manual-taxonomy', artifactIds: ['artifact-extraction-report'],
    nextActions: ['Define evaluation cases for topic drift and returning work.'],
  }),
  workNode({
    id: 'node-extraction-evaluator', title: 'Specify extraction evaluation cases', type: 'test', status: 'active',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-extraction'], startedAt: '2026-07-03T09:00:00.000Z',
    summary: 'Create cases for topic drift, resumed work, several goals in one thread, and one goal across threads.',
    outcome: 'A bounded evaluator now describes what correct extraction would preserve.', origin: 'The hybrid decision required falsifiable cases.',
    parentNodeId: 'node-hybrid-extraction', unresolvedQuestions: ['What evidence threshold should permit an automatic merge?'], nextActions: ['Run the evaluator against future extraction implementations.'],
  }),

  workNode({
    id: 'node-ownership-audit', title: 'Audit ownership across old threads', type: 'status', status: 'successful',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery'], startedAt: '2026-05-25T07:45:00.000Z', endedAt: '2026-05-28T11:00:00.000Z',
    summary: 'Ask which task genuinely owns each unresolved stream instead of trusting recent chat titles.',
    outcome: 'Ownership often differed from the most recent thread, confirming that thread lists could not serve as a project map.',
    origin: 'Repeated thirty-minute context-reconstruction sessions.', groupId: 'group-recovery-arc', nextActions: ['Build a persistent status recovery view.'],
  }),
  workNode({
    id: 'node-status-recovery', title: 'Recover status without compressed jargon', type: 'feature', status: 'blocked',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery'], startedAt: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-08T16:00:00.000Z',
    summary: 'Produce a plain-language account of what happened, why it matters, and what remains open.',
    outcome: 'The first status view recovered facts but still assumed too much local terminology.', origin: 'Continued the ownership audit.',
    parentNodeId: 'node-ownership-audit', groupId: 'group-recovery-arc', unresolvedQuestions: ['How much prior context does a returning reader actually remember?'], nextActions: ['Add explicit origin, outcome, and unresolved fields.'],
  }),
  workNode({
    id: 'node-cross-thread-map', title: 'Map cross-thread ownership', type: 'deliverable', status: 'successful',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery', 'thread-evidence'], startedAt: '2026-06-20T09:00:00.000Z', endedAt: '2026-06-26T18:10:00.000Z',
    summary: 'Record which work unit owns a goal while preserving every source thread that contributed.',
    outcome: 'One work unit can now span threads and one thread can contribute to several work units without conflation.', origin: 'The status-recovery block exposed missing ownership structure.',
    parentNodeId: 'node-status-recovery', groupId: 'group-recovery-arc', artifactIds: ['artifact-ownership-csv'], nextActions: ['Rewrite status output for readers returning after weeks.'],
  }),
  workNode({
    id: 'node-plain-status', title: 'Write reader-facing status', type: 'summary', status: 'successful',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery'], startedAt: '2026-07-01T08:00:00.000Z', endedAt: '2026-07-04T14:00:00.000Z',
    summary: 'Replace compressed project shorthand with direct descriptions of design, evidence, decisions, and next steps.',
    outcome: 'A returning reader can understand the work without asking a second question to decode the first answer.', origin: 'The ownership map made the factual structure available.',
    parentNodeId: 'node-cross-thread-map', groupId: 'group-recovery-arc', nextActions: ['Detect dormant work that has not been explicitly rejected.'],
  }),
  workNode({
    id: 'node-dormant-recovery', title: 'Distinguish dormant work from rejected work', type: 'feature', status: 'active',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery'], startedAt: '2026-07-18T09:30:00.000Z',
    summary: 'Keep forgotten, paused, failed, and explicitly rejected work visibly distinct.',
    outcome: 'The fixture now makes unfinished state and abandonment reasons inspectable.', origin: 'Reader-facing status still could not tell silence from a decision.',
    parentNodeId: 'node-plain-status', groupId: 'group-recovery-arc', unresolvedQuestions: ['When should dormant work be recommended for revival?'], nextActions: ['Use unresolved questions and dependencies to rank next actions.'],
  }),

  workNode({
    id: 'node-experiment-ledger', title: 'Define experiment provenance', type: 'idea', status: 'successful',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-06-04T10:20:00.000Z', endedAt: '2026-06-07T12:00:00.000Z',
    summary: 'Treat failures, measurements, manifests, and the code that actually ran as durable project evidence.',
    outcome: 'Experiment state became a first-class workgraph concern rather than a disposable chat result.', origin: 'Past failures were repeatedly rediscovered and rerun.', nextActions: ['Preserve one failed run end to end.'],
  }),
  workNode({
    id: 'node-evidence-preservation', title: 'Preserve failed-run evidence', type: 'deliverable', status: 'successful',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence', 'thread-rendering'], startedAt: '2026-06-21T10:00:00.000Z', endedAt: '2026-06-29T14:00:00.000Z',
    summary: 'Keep results, failure reasons, executed-code evidence, and unresolved questions together.',
    outcome: 'The failed renderer can be understood without rerunning it or trusting a conversation summary.', origin: 'The experiment-provenance definition.',
    parentNodeId: 'node-experiment-ledger', artifactIds: ['artifact-evidence-manifest'], nextActions: ['Add checksums and compact artifact manifests.'],
  }),
  workNode({
    id: 'node-manifest-checksum', title: 'Add artifact manifests and checksums', type: 'feature', status: 'successful',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-07-06T09:00:00.000Z', endedAt: '2026-07-10T17:00:00.000Z',
    summary: 'Make artifact identity and revision explicit enough to detect a stale handoff.',
    outcome: 'Artifacts now have stable identifiers, availability, and revisions that transfers can pin.', origin: 'Preserved evidence still needed a dependable identity layer.',
    parentNodeId: 'node-evidence-preservation', nextActions: ['Model context at each executable edge.'],
  }),
  workNode({
    id: 'node-transfer-model', title: 'Model explicit parent-output transfer', type: 'feature', status: 'successful',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-07-15T08:30:00.000Z', endedAt: '2026-07-22T09:30:00.000Z',
    summary: 'Give every executable parent-to-child edge editable instructions, an optional goal file, and selected artifact references.',
    outcome: 'Graph topology no longer implies hidden context. Each child can receive free text and any combination of goal, CSV, report, figure, manifest, and code outputs.',
    decision: 'Context belongs to the relation and remains independently editable even when nodes share a parent.', origin: 'Artifact revision tracking made explicit handoff possible.',
    parentNodeId: 'node-manifest-checksum', artifactIds: ['artifact-transfer-goal', 'artifact-transfer-csv', 'artifact-transfer-report', 'artifact-transfer-figure', 'artifact-transfer-manifest', 'artifact-transfer-code'],
    nextActions: ['Demonstrate progressive output discovery.', 'Block execution on required stale references.'],
  }),
  workNode({
    id: 'node-stale-reference-rule', title: 'Block stale required transfers', type: 'decision', status: 'active',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-07-28T11:00:00.000Z',
    summary: 'Prevent a queued child from running when a required output is missing or has changed revision.',
    outcome: 'The queue explains the blocking reference and offers refresh or removal instead of silently running with wrong context.',
    decision: 'Optional problems remain visible; only required missing or stale references block execution.', origin: 'The explicit transfer model needed an execution safety rule.',
    parentNodeId: 'node-transfer-model', unresolvedQuestions: ['Should a refreshed reference preserve the prior revision in activity history?'], nextActions: ['Exercise the rule with a chained queue.'],
  }),

  workNode({
    id: 'node-grouping-design', title: 'Design non-destructive grouping', type: 'feature', status: 'successful',
    workstreamId: 'stream-navigation', sourceThreadIds: ['thread-origin', 'thread-recovery'], startedAt: '2026-06-12T09:00:00.000Z', endedAt: '2026-06-18T16:00:00.000Z',
    summary: 'Let users collapse a named set of nodes without rewriting dates, lineage, provenance, or transfers.',
    outcome: 'Groups became a view-level organisation layer with expanded hull and collapsed mega-node states.', origin: 'Large maps needed structure beyond filters.', nextActions: ['Connect grouping to multi-select and Undo.'],
  }),
  workNode({
    id: 'node-search-index', title: 'Search failures, evidence, and unresolved work', type: 'feature', status: 'successful',
    workstreamId: 'stream-navigation', sourceThreadIds: ['thread-recovery', 'thread-rendering'], startedAt: '2026-07-19T10:00:00.000Z', endedAt: '2026-07-24T17:00:00.000Z',
    summary: 'Index titles, summaries, outcomes, failures, decisions, source threads, artifacts, and unresolved questions.',
    outcome: 'Queries for “failed renderer” and “label collision” recover the 10,000-node failure and its evidence.', origin: 'Context recovery required direct retrieval rather than visual browsing alone.',
    parentNodeId: 'node-grouping-design', artifactIds: ['artifact-search-report'], nextActions: ['Add semantic focus after selection.'],
  }),
  workNode({
    id: 'node-semantic-focus', title: 'Rotate focused streams to three o’clock', type: 'feature', status: 'successful',
    workstreamId: 'stream-navigation', sourceThreadIds: ['thread-rendering', 'thread-recovery'], startedAt: '2026-07-25T08:00:00.000Z', endedAt: '2026-07-29T15:00:00.000Z',
    summary: 'Use explicit semantic focus to rotate one workstream onto a readable center-to-right timeline.',
    outcome: 'Focus uses the shortest angular path and never changes stable stream lanes or dates.', origin: 'Search needed a predictable destination on the map.', parentNodeId: 'node-search-index', nextActions: ['Provide an equivalent chronological list.'],
  }),
  workNode({
    id: 'node-chronological-list', title: 'Build the chronological alternative', type: 'feature', status: 'active',
    workstreamId: 'stream-navigation', sourceThreadIds: ['thread-recovery'], startedAt: '2026-07-30T08:30:00.000Z',
    summary: 'Offer selection, focus, relation editing, actions, and grouping without canvas pointer precision.',
    outcome: 'The list is designed as a complete semantic route through the core flow, not a decorative duplicate.', origin: 'The semantic mirror and focus behavior needed a visible alternative surface.',
    parentNodeId: 'node-semantic-focus', unresolvedQuestions: ['How much relation detail belongs inline on mobile?'], nextActions: ['Verify keyboard and touch-sized flows.'],
  }),

  workNode({
    id: 'satellite-frame-check', title: 'Verify frame measurements', type: 'verification', status: 'successful',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-rendering'], startedAt: '2026-05-20T10:00:00.000Z',
    summary: 'Check that the renderer failure report matches the captured frame-time CSV.', outcome: 'The 12–18 frames-per-second range was confirmed.', origin: 'Verification of the failed renderer experiment.',
    parentNodeId: 'node-renderer-failure', satelliteOfNodeId: 'node-renderer-failure', nextActions: [],
  }),
  workNode({
    id: 'satellite-label-figure', title: 'Visualize label collisions', type: 'visualization', status: 'successful',
    workstreamId: 'stream-visual-map', sourceThreadIds: ['thread-rendering'], startedAt: '2026-05-21T10:00:00.000Z',
    summary: 'Prepare the captured label-collision state for later inspection.', outcome: 'The failure became visually recoverable.', origin: 'A scoped output of the failed renderer experiment.',
    parentNodeId: 'node-renderer-failure', satelliteOfNodeId: 'node-renderer-failure', artifactIds: ['artifact-label-figure'], nextActions: [],
  }),
  workNode({
    id: 'satellite-extraction-summary', title: 'Summarize extraction failures', type: 'summary', status: 'successful',
    workstreamId: 'stream-extraction', sourceThreadIds: ['thread-extraction'], startedAt: '2026-06-02T08:00:00.000Z',
    summary: 'Compare topic drift with the maintenance cost of manual taxonomy.', outcome: 'The summary motivated the hybrid extraction decision.', origin: 'A scoped synthesis of two rejected approaches.',
    parentNodeId: 'node-topic-drift-failure', satelliteOfNodeId: 'node-topic-drift-failure', nextActions: [],
  }),
  workNode({
    id: 'satellite-ownership-status', title: 'Report ownership status', type: 'status', status: 'successful',
    workstreamId: 'stream-continuity', sourceThreadIds: ['thread-recovery'], startedAt: '2026-06-27T08:00:00.000Z',
    summary: 'Turn the ownership table into a concise reader-facing status.', outcome: 'Five live streams and two dormant branches were explained.', origin: 'A scoped report from the cross-thread map.',
    parentNodeId: 'node-cross-thread-map', satelliteOfNodeId: 'node-cross-thread-map', nextActions: [],
  }),
  workNode({
    id: 'satellite-manifest-test', title: 'Test manifest resolution', type: 'test', status: 'successful',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-07-11T08:00:00.000Z',
    summary: 'Resolve available, absent, and changed artifact revisions.', outcome: 'The three transfer states were reproduced deterministically.', origin: 'A scoped test of artifact manifests.',
    parentNodeId: 'node-manifest-checksum', satelliteOfNodeId: 'node-manifest-checksum', nextActions: [],
  }),
  workNode({
    id: 'satellite-focus-test', title: 'Test shortest focus rotation', type: 'test', status: 'successful',
    workstreamId: 'stream-navigation', sourceThreadIds: ['thread-rendering'], startedAt: '2026-07-29T18:00:00.000Z',
    summary: 'Verify wrap-around rotation near minus pi and plus pi.', outcome: 'Every focus path remained at or below half a turn.', origin: 'A scoped geometry test of semantic focus.',
    parentNodeId: 'node-semantic-focus', satelliteOfNodeId: 'node-semantic-focus', nextActions: [],
  }),

  workNode({
    id: 'planned-progressive-handoff', title: 'Demonstrate progressive output handoff', type: 'plan', status: 'planned',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-08-06T09:00:00.000Z',
    summary: 'Prepare a deterministic run that reveals outputs one at a time and makes them selectable by a child.',
    outcome: 'This remains an editable draft. It has not run.', origin: 'Planned from the explicit context-transfer model.',
    parentNodeId: 'node-transfer-model', nextActions: ['Select the queue item and press Play selected when ready.'],
  }),
  workNode({
    id: 'planned-review-handoff', title: 'Review the discovered handoff report', type: 'plan', status: 'planned',
    workstreamId: 'stream-provenance', sourceThreadIds: ['thread-evidence'], startedAt: '2026-08-08T09:00:00.000Z',
    summary: 'Prepare a child that waits for the parent run to discover its report before reviewing it.',
    outcome: 'This remains an editable draft and is blocked on a required output that does not exist yet.', origin: 'Chained after the progressive handoff plan.',
    parentNodeId: 'planned-progressive-handoff', unresolvedQuestions: ['Will the discovered report satisfy the pinned reference?'], nextActions: ['Repair or remove the missing reference, then select and play.'],
  }),
]

/**
 * The lifecycle is explicit fixture data rather than an inference from execution
 * status. A failed experiment can truthfully be Done, and abandoned work keeps
 * its failed/blocked evidence instead of inventing a contradictory status.
 */
export const WORK_NODE_LIFECYCLES: Record<string, WorkLifecycle> = {
  'node-map-question': 'done',
  'node-canvas-prototype': 'done',
  'node-renderer-failure': 'done',
  'node-hybrid-renderer': 'done',
  'node-semantic-mirror': 'ongoing',
  'node-work-unit-hypothesis': 'done',
  'node-topic-drift-failure': 'done',
  'node-manual-taxonomy': 'done',
  'node-hybrid-extraction': 'done',
  'node-extraction-evaluator': 'awaiting-review',
  'node-ownership-audit': 'done',
  'node-status-recovery': 'abandoned',
  'node-cross-thread-map': 'done',
  'node-plain-status': 'done',
  'node-dormant-recovery': 'ongoing',
  'node-experiment-ledger': 'done',
  'node-evidence-preservation': 'done',
  'node-manifest-checksum': 'done',
  'node-transfer-model': 'done',
  'node-stale-reference-rule': 'ongoing',
  'node-grouping-design': 'done',
  'node-search-index': 'done',
  'node-semantic-focus': 'done',
  'node-chronological-list': 'ongoing',
  'satellite-frame-check': 'done',
  'satellite-label-figure': 'done',
  'satellite-extraction-summary': 'done',
  'satellite-ownership-status': 'done',
  'satellite-manifest-test': 'done',
  'satellite-focus-test': 'done',
  'planned-progressive-handoff': 'planned',
  'planned-review-handoff': 'backlog',
}

export const WORK_NODES: WorkNode[] = RAW_WORK_NODES.map((node) => ({
  ...node,
  lifecycle: WORK_NODE_LIFECYCLES[node.id],
  abandonmentReason: node.id === 'node-status-recovery'
    ? 'Superseded by the cross-thread ownership map and the reader-facing status work. Its original blocked result remains preserved.'
    : undefined,
}))

const executableKinds = new Set<GraphRelation['kind']>(['continues', 'branches-from', 'action-of', 'depends-on'])

function relation(
  id: string,
  kind: GraphRelation['kind'],
  sourceNodeId: string,
  targetNodeId: string,
  label?: string,
): GraphRelation {
  return {
    id,
    kind,
    sourceNodeId,
    targetNodeId,
    label,
    transferId: executableKinds.has(kind) ? `transfer-${id}` : undefined,
    visibleByDefault: kind !== 'same-source-thread' && kind !== 'related-to',
  }
}

export const RELATIONS: GraphRelation[] = [
  relation('relation-map-canvas', 'continues', 'node-map-question', 'node-canvas-prototype'),
  relation('relation-canvas-failure', 'continues', 'node-canvas-prototype', 'node-renderer-failure'),
  relation('relation-failure-hybrid', 'branches-from', 'node-renderer-failure', 'node-hybrid-renderer'),
  relation('relation-hybrid-semantic', 'continues', 'node-hybrid-renderer', 'node-semantic-mirror'),
  relation('relation-unit-drift', 'continues', 'node-work-unit-hypothesis', 'node-topic-drift-failure'),
  relation('relation-drift-manual', 'branches-from', 'node-topic-drift-failure', 'node-manual-taxonomy'),
  relation('relation-manual-hybrid', 'branches-from', 'node-manual-taxonomy', 'node-hybrid-extraction'),
  relation('relation-hybrid-evaluator', 'continues', 'node-hybrid-extraction', 'node-extraction-evaluator'),
  relation('relation-audit-status', 'continues', 'node-ownership-audit', 'node-status-recovery'),
  relation('relation-status-map', 'branches-from', 'node-status-recovery', 'node-cross-thread-map'),
  relation('relation-map-plain', 'continues', 'node-cross-thread-map', 'node-plain-status'),
  relation('relation-plain-dormant', 'continues', 'node-plain-status', 'node-dormant-recovery'),
  relation('relation-ledger-preserve', 'continues', 'node-experiment-ledger', 'node-evidence-preservation'),
  relation('relation-preserve-manifest', 'continues', 'node-evidence-preservation', 'node-manifest-checksum'),
  relation('relation-manifest-transfer', 'continues', 'node-manifest-checksum', 'node-transfer-model'),
  relation('relation-transfer-stale', 'continues', 'node-transfer-model', 'node-stale-reference-rule'),
  relation('relation-group-search', 'continues', 'node-grouping-design', 'node-search-index'),
  relation('relation-search-focus', 'continues', 'node-search-index', 'node-semantic-focus'),
  relation('relation-focus-list', 'continues', 'node-semantic-focus', 'node-chronological-list'),
  relation('relation-frame-check', 'action-of', 'node-renderer-failure', 'satellite-frame-check'),
  relation('relation-label-figure', 'action-of', 'node-renderer-failure', 'satellite-label-figure'),
  relation('relation-extraction-summary', 'action-of', 'node-topic-drift-failure', 'satellite-extraction-summary'),
  relation('relation-ownership-status', 'action-of', 'node-cross-thread-map', 'satellite-ownership-status'),
  relation('relation-manifest-test', 'action-of', 'node-manifest-checksum', 'satellite-manifest-test'),
  relation('relation-focus-test', 'action-of', 'node-semantic-focus', 'satellite-focus-test'),
  relation('relation-progressive-plan', 'continues', 'node-transfer-model', 'planned-progressive-handoff', 'Prepared context'),
  relation('relation-review-plan', 'depends-on', 'planned-progressive-handoff', 'planned-review-handoff', 'Waits for discovered report'),
  relation('relation-extraction-search', 'depends-on', 'node-hybrid-extraction', 'node-search-index'),
  relation('relation-provenance-search', 'depends-on', 'node-evidence-preservation', 'node-search-index'),
  relation('relation-shared-render-thread', 'same-source-thread', 'node-renderer-failure', 'node-semantic-focus'),
  relation('relation-shared-recovery-thread', 'same-source-thread', 'node-cross-thread-map', 'node-chronological-list'),
  relation('relation-map-transfer', 'related-to', 'node-map-question', 'node-transfer-model'),
  relation('relation-failures-related', 'related-to', 'node-renderer-failure', 'node-topic-drift-failure'),
]

function artifactReference(artifactId: string, required = false, expectedRevision?: number): ArtifactReference {
  const artifactItem = ARTIFACTS.find((candidate) => candidate.id === artifactId)
  return {
    artifactId,
    required,
    expectedRevision: expectedRevision ?? artifactItem?.revision ?? 1,
    resolution: artifactItem?.available ? 'resolved' : 'missing',
  }
}

export const TRANSFERS: ContextTransfer[] = RELATIONS.filter((item) => item.transferId).map((item) => {
  const base: ContextTransfer = {
    id: item.transferId as string,
    relationId: item.id,
    parentNodeId: item.sourceNodeId,
    childNodeId: item.targetNodeId,
    instructions: 'Carry forward the parent outcome, decision, and unresolved questions that are relevant to this child.',
    includeParentGoalFile: false,
    artifacts: [],
    updatedAt: '2026-08-08T21:30:00.000Z',
  }

  if (item.id === 'relation-progressive-plan') {
    return {
      ...base,
      instructions: 'Use the goal and evidence inventory to simulate progressive output discovery. Preserve each artifact kind and explain when it becomes available.',
      includeParentGoalFile: true,
      parentGoalFile: artifactReference('artifact-transfer-goal', true),
      artifacts: [
        artifactReference('artifact-transfer-csv', true),
        artifactReference('artifact-transfer-report'),
        artifactReference('artifact-transfer-figure'),
        artifactReference('artifact-transfer-manifest'),
        artifactReference('artifact-transfer-code'),
      ],
    }
  }

  if (item.id === 'relation-review-plan') {
    return {
      ...base,
      instructions: 'When the parent produces its report, review it in plain language and retain the parent activity history.',
      artifacts: [artifactReference('artifact-planned-handoff-report', true)],
    }
  }
  return base
})

export const QUEUE: QueueItem[] = [
  {
    id: 'queue-progressive-handoff',
    order: 0,
    nodeId: 'planned-progressive-handoff',
    parentNodeId: 'node-transfer-model',
    title: 'Demonstrate progressive output handoff',
    prompt: 'Prepare a deterministic demonstration in which a mocked goal reveals a CSV, report, figure, manifest, and code artifact over time. Do not claim real agent execution.',
    executionKind: 'goal',
    selected: true,
    status: 'draft',
    relationId: 'relation-progressive-plan',
    contextTransferId: 'transfer-relation-progressive-plan',
    activity: [activity('queue-progressive-created', '2026-08-06T09:00:00.000Z', 'created', 'Goal draft prepared. No agent was started.')],
    outputArtifactIds: [],
    progress: 0,
    playRequested: false,
  },
  {
    id: 'queue-review-handoff',
    order: 1,
    nodeId: 'planned-review-handoff',
    parentNodeId: 'planned-progressive-handoff',
    parentQueueItemId: 'queue-progressive-handoff',
    title: 'Review the discovered handoff report',
    prompt: 'Review the report discovered by the parent. Explain the evidence, limitations, and next decision in plain language.',
    executionKind: 'plan',
    selected: false,
    status: 'draft',
    relationId: 'relation-review-plan',
    contextTransferId: 'transfer-relation-review-plan',
    activity: [activity('queue-review-created', '2026-08-08T09:00:00.000Z', 'created', 'Plan draft prepared. It is waiting for a required parent report and has not run.')],
    outputArtifactIds: [],
    progress: 0,
    playRequested: false,
    blockedReason: 'Required output “artifact-planned-handoff-report” is missing from the parent.',
  },
]

export const GROUPS: WorkGroup[] = [
  {
    id: 'group-recovery-arc',
    name: 'Status recovery arc',
    note: 'The work that moved from uncertain ownership to reader-facing dormant-work recovery.',
    overlayColor: '#d6c5ff',
    memberNodeIds: ['node-ownership-audit', 'node-status-recovery', 'node-cross-thread-map', 'node-plain-status', 'node-dormant-recovery'],
    collapsed: false,
    createdAt: '2026-07-19T08:00:00.000Z',
  },
]

const DAY_MS = 86_400_000
const INITIAL_DATE_VALUES = WORK_NODES.flatMap((node) => [
  Date.parse(node.startedAt),
  Date.parse(node.endedAt ?? node.startedAt),
])
const INITIAL_DATE_START = Math.min(...INITIAL_DATE_VALUES)
const INITIAL_DATE_END = Math.max(...INITIAL_DATE_VALUES)

export const INITIAL_DATE_WINDOW = {
  startMs: Math.floor(INITIAL_DATE_START / DAY_MS) * DAY_MS,
  endMs: Math.floor(INITIAL_DATE_END / DAY_MS) * DAY_MS + DAY_MS - 1,
} as const

export const INITIAL_CORE_STATE: CoreAppState = {
  workstreams: WORKSTREAMS,
  sourceThreads: SOURCE_THREADS,
  nodes: WORK_NODES,
  artifacts: ARTIFACTS,
  relations: RELATIONS,
  transfers: TRANSFERS,
  queue: QUEUE,
  groups: GROUPS,
  fixtureProjects: [
    {
      id: 'fixture-project-threadwake',
      name: 'Threadwake canonical application',
      status: 'active',
      source: 'isolated-fixture',
      createdAt: '2026-08-09T08:00:00.000Z',
    },
    {
      id: 'fixture-project-archive',
      name: 'Archived renderer study',
      status: 'completed',
      source: 'isolated-fixture',
      createdAt: '2026-08-09T08:01:00.000Z',
    },
  ],
  fixtureProjectAttachments: [],
  selectedNodeId: 'node-renderer-failure',
  selectedRelationId: undefined,
  multiSelectedNodeIds: [],
  manualNodeOffsets: {},
  dateWindow: INITIAL_DATE_WINDOW,
  focus: { level: 'project', trail: [] },
  layers: {
    continues: true,
    'branches-from': true,
    'action-of': true,
    'depends-on': true,
    'same-source-thread': false,
    'related-to': false,
  },
  searchQuery: '',
  view: 'graph',
  collapsedLifecycles: ['backlog', 'done', 'abandoned'],
  announcement: 'Failed renderer experiment selected. Its preserved evidence is available in the inspector.',
  nextSequence: 100,
}

function cloneCoreState(state: CoreAppState): CoreAppState {
  return structuredClone(state)
}

export function createInitialState(): AppState {
  return { ...cloneCoreState(INITIAL_CORE_STATE), history: [] }
}

export const INITIAL_STATE: AppState = createInitialState()
