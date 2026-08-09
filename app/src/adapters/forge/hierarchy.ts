import { ForgeAdapterError, type ForgeStrategyGraphEdge, type ForgeStrategyGraphNode, type ForgeWorkItem } from './contracts'

export type ForgeHierarchyIssueCode =
  | 'duplicate_id'
  | 'missing_project'
  | 'missing_parent'
  | 'self_parent'
  | 'wrong_parent_level'
  | 'cross_project_parent'
  | 'transitive_cycle'
  | 'orphan'

export interface ForgeHierarchyIssue {
  code: ForgeHierarchyIssueCode
  workItemId: string
  parentWorkItemId?: string
  message: string
}

const REQUIRED_PARENT_LEVEL = {
  task: 'issue',
  subtask: 'task',
} as const

export function inspectForgeHierarchy(
  workItems: readonly ForgeWorkItem[],
  projectIds: ReadonlySet<string>,
): ForgeHierarchyIssue[] {
  const issues: ForgeHierarchyIssue[] = []
  const byId = new Map<string, ForgeWorkItem>()

  for (const item of workItems) {
    if (byId.has(item.id)) {
      issues.push({
        code: 'duplicate_id',
        workItemId: item.id,
        message: `Forge work item “${item.id}” appears more than once.`,
      })
      continue
    }
    byId.set(item.id, item)
  }

  for (const item of byId.values()) {
    if (!item.projectId || !projectIds.has(item.projectId)) {
      issues.push({
        code: 'missing_project',
        workItemId: item.id,
        message: `Forge ${item.level} “${item.id}” must reference an existing project.`,
      })
    }

    if (item.level === 'issue') {
      if (item.parentWorkItemId) {
        issues.push({
          code: 'wrong_parent_level',
          workItemId: item.id,
          parentWorkItemId: item.parentWorkItemId,
          message: `Forge issue “${item.id}” must be a project root and cannot have a work-item parent.`,
        })
      }
      continue
    }

    if (!item.parentWorkItemId) {
      issues.push({
        code: 'orphan',
        workItemId: item.id,
        message: `Forge ${item.level} “${item.id}” must have a ${REQUIRED_PARENT_LEVEL[item.level]} parent.`,
      })
      continue
    }
    if (item.parentWorkItemId === item.id) {
      issues.push({
        code: 'self_parent',
        workItemId: item.id,
        parentWorkItemId: item.parentWorkItemId,
        message: `Forge work item “${item.id}” cannot parent itself.`,
      })
      continue
    }

    const parent = byId.get(item.parentWorkItemId)
    if (!parent) {
      issues.push({
        code: 'missing_parent',
        workItemId: item.id,
        parentWorkItemId: item.parentWorkItemId,
        message: `Forge ${item.level} “${item.id}” references missing parent “${item.parentWorkItemId}”.`,
      })
      continue
    }
    if (parent.level !== REQUIRED_PARENT_LEVEL[item.level]) {
      issues.push({
        code: 'wrong_parent_level',
        workItemId: item.id,
        parentWorkItemId: parent.id,
        message: `Forge ${item.level} “${item.id}” requires a ${REQUIRED_PARENT_LEVEL[item.level]} parent, not ${parent.level}.`,
      })
    }
    if (!item.projectId || !parent.projectId || item.projectId !== parent.projectId) {
      issues.push({
        code: 'cross_project_parent',
        workItemId: item.id,
        parentWorkItemId: parent.id,
        message: `Forge child “${item.id}” and parent “${parent.id}” must share one project.`,
      })
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const reportedCycleMembers = new Set<string>()
  const visit = (id: string, chain: string[]): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      const cycleStart = chain.indexOf(id)
      const cycle = cycleStart >= 0 ? chain.slice(cycleStart) : [id]
      for (const memberId of cycle) {
        if (reportedCycleMembers.has(memberId)) continue
        reportedCycleMembers.add(memberId)
        issues.push({
          code: 'transitive_cycle',
          workItemId: memberId,
          parentWorkItemId: byId.get(memberId)?.parentWorkItemId ?? undefined,
          message: `Forge hierarchy contains a cycle through ${[...cycle, id].join(' → ')}.`,
        })
      }
      return
    }
    visiting.add(id)
    const parentId = byId.get(id)?.parentWorkItemId
    if (parentId && byId.has(parentId)) visit(parentId, [...chain, id])
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id, [])

  return issues.sort((left, right) =>
    left.workItemId.localeCompare(right.workItemId) || left.code.localeCompare(right.code))
}

export function assertValidForgeHierarchy(
  workItems: readonly ForgeWorkItem[],
  projectIds: ReadonlySet<string>,
): void {
  const issues = inspectForgeHierarchy(workItems, projectIds)
  if (issues.length > 0) {
    throw new ForgeAdapterError('validation_error', 'Threadwake rejected an invalid Forge hierarchy before transport.', {
      issues,
    })
  }
}

export type ForgeStrategyGraphIssueCode =
  | 'duplicate_node'
  | 'missing_entity'
  | 'missing_edge_node'
  | 'self_edge'
  | 'duplicate_edge'
  | 'cycle'
  | 'missing_start'
  | 'missing_terminal'

export interface ForgeStrategyGraphIssue {
  code: ForgeStrategyGraphIssueCode
  message: string
  nodeId?: string
}

export function inspectForgeStrategyGraph(
  nodes: readonly ForgeStrategyGraphNode[],
  edges: readonly ForgeStrategyGraphEdge[],
  knownEntityIds: ReadonlySet<string>,
): ForgeStrategyGraphIssue[] {
  const issues: ForgeStrategyGraphIssue[] = []
  const nodeIds = new Set<string>()
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: 'duplicate_node', nodeId: node.id, message: `Strategy graph node “${node.id}” is duplicated.` })
    }
    nodeIds.add(node.id)
    if (!knownEntityIds.has(`${node.entityType}:${node.entityId}`)) {
      issues.push({ code: 'missing_entity', nodeId: node.id, message: `Strategy graph node “${node.id}” references a missing entity.` })
    }
  }

  const edgeKeys = new Set<string>()
  const outgoing = new Map<string, string[]>()
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: 'missing_edge_node', message: `Strategy edge “${edge.from} → ${edge.to}” references a missing graph node.` })
      continue
    }
    if (edge.from === edge.to) {
      issues.push({ code: 'self_edge', nodeId: edge.from, message: `Strategy graph node “${edge.from}” cannot point to itself.` })
      continue
    }
    const key = `${edge.from}\u0000${edge.to}`
    if (edgeKeys.has(key)) {
      issues.push({ code: 'duplicate_edge', message: `Strategy edge “${edge.from} → ${edge.to}” is duplicated.` })
      continue
    }
    edgeKeys.add(key)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  }

  if (nodes.length > 0 && ![...incoming.values()].some((count) => count === 0)) {
    issues.push({ code: 'missing_start', message: 'Strategy graph needs at least one start node.' })
  }
  if (nodes.length > 0 && !nodes.some((node) => (outgoing.get(node.id) ?? []).length === 0)) {
    issues.push({ code: 'missing_terminal', message: 'Strategy graph needs at least one terminal node.' })
  }

  const active = new Set<string>()
  const complete = new Set<string>()
  let cycleFound = false
  const visit = (nodeId: string): void => {
    if (complete.has(nodeId) || cycleFound) return
    if (active.has(nodeId)) {
      cycleFound = true
      return
    }
    active.add(nodeId)
    for (const next of outgoing.get(nodeId) ?? []) visit(next)
    active.delete(nodeId)
    complete.add(nodeId)
  }
  for (const node of nodes) visit(node.id)
  if (cycleFound) issues.push({ code: 'cycle', message: 'Strategy graph must remain directed and acyclic.' })

  return issues
}
