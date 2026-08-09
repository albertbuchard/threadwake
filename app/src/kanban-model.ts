import type {
  FixtureProject,
  FixtureProjectAttachment,
  FixtureProjectAttachmentPlan,
  WorkGroup,
  WorkLifecycle,
  WorkNode,
} from "./domain";

export interface LifecycleColumnDefinition {
  id: WorkLifecycle;
  label: string;
  description: string;
  defaultCollapsed: boolean;
}

export const LIFECYCLE_COLUMNS: readonly LifecycleColumnDefinition[] = [
  {
    id: "planned",
    label: "Planned",
    description: "Committed next work that has not started.",
    defaultCollapsed: false,
  },
  {
    id: "ongoing",
    label: "Ongoing",
    description: "Work that is actively being carried forward.",
    defaultCollapsed: false,
  },
  {
    id: "awaiting-review",
    label: "Awaiting review or approval",
    description: "Finished output that needs a named review or approval decision.",
    defaultCollapsed: false,
  },
  {
    id: "backlog",
    label: "Backlog",
    description: "Useful future work that is not yet committed.",
    defaultCollapsed: true,
  },
  {
    id: "done",
    label: "Done",
    description: "Completed work retained with its evidence and history.",
    defaultCollapsed: true,
  },
  {
    id: "abandoned",
    label: "Abandoned",
    description: "Deliberately discontinued work retained with its reason and history.",
    defaultCollapsed: true,
  },
] as const;

export const DEFAULT_COLLAPSED_LIFECYCLES: WorkLifecycle[] = LIFECYCLE_COLUMNS
  .filter((column) => column.defaultCollapsed)
  .map((column) => column.id);

export function lifecycleLabel(lifecycle: WorkLifecycle): string {
  return LIFECYCLE_COLUMNS.find((column) => column.id === lifecycle)?.label ?? lifecycle;
}

export function isTerminalLifecycle(lifecycle: WorkLifecycle): boolean {
  return lifecycle === "done" || lifecycle === "abandoned";
}

function normalizedSearch(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

export function nodeMatchesKanbanQuery(node: WorkNode, query: string): boolean {
  const needle = normalizedSearch(query.trim());
  if (!needle) return true;
  return normalizedSearch([
    node.title,
    node.summary,
    node.outcome,
    node.type,
    node.status,
    node.lifecycle,
    node.owner,
    node.failureReason,
    node.decision,
    ...node.unresolvedQuestions,
  ].filter(Boolean).join(" ")).includes(needle);
}

export interface KanbanColumnModel extends LifecycleColumnDefinition {
  nodes: WorkNode[];
  totalCount: number;
  filteredCount: number;
  collapsed: boolean;
  selectedOutsideFilter: boolean;
}

export function buildKanbanColumns(
  nodes: readonly WorkNode[],
  collapsedLifecycles: readonly WorkLifecycle[],
  query: string,
  selectedNodeId?: string,
): KanbanColumnModel[] {
  const collapsed = new Set(collapsedLifecycles);
  return LIFECYCLE_COLUMNS.map((definition) => {
    const canonical = nodes
      .filter((node) => node.lifecycle === definition.id)
      .sort((left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt)
        || left.id.localeCompare(right.id),
      );
    const selectedOutsideFilter = canonical.some(
      (node) => node.id === selectedNodeId && !nodeMatchesKanbanQuery(node, query),
    );
    const visible = canonical.filter(
      (node) => nodeMatchesKanbanQuery(node, query) || node.id === selectedNodeId,
    );
    return {
      ...definition,
      nodes: visible,
      totalCount: canonical.length,
      filteredCount: canonical.length - visible.length,
      collapsed: collapsed.has(definition.id),
      selectedOutsideFilter,
    };
  });
}

function descendantIds(nodes: readonly WorkNode[], rootId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const parentId = queue[index];
    for (const node of nodes) {
      if (node.parentNodeId !== parentId && node.satelliteOfNodeId !== parentId) continue;
      if (descendants.has(node.id)) continue;
      descendants.add(node.id);
      queue.push(node.id);
    }
  }
  return descendants;
}

export function validateLifecycleMove(
  nodes: readonly WorkNode[],
  nodeId: string,
  target: WorkLifecycle,
): string | null {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return "The work item no longer exists.";
  if (node.lifecycle === target) return null;
  if (isTerminalLifecycle(target)) {
    const descendants = descendantIds(nodes, node.id);
    const liveChild = nodes.find(
      (candidate) => descendants.has(candidate.id) && !isTerminalLifecycle(candidate.lifecycle),
    );
    if (liveChild) {
      return `Move “${liveChild.title}” to a terminal lifecycle first, or leave “${node.title}” active.`;
    }
  }
  return null;
}

export function validateViewGroupSelection(
  nodes: readonly WorkNode[],
  groups: readonly WorkGroup[],
  nodeIds: readonly string[],
  targetGroupId?: string,
): string | null {
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length === 0) return "Select at least one work item.";
  if (!targetGroupId && uniqueIds.length < 2) return "Select at least two work items for a new visual group.";
  if (targetGroupId && !groups.some((group) => group.id === targetGroupId)) {
    return "The selected visual group no longer exists.";
  }
  for (const nodeId of uniqueIds) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.id.startsWith("group-node:")) return "The selection contains a missing or synthetic work item.";
    if (node.groupId && node.groupId !== targetGroupId) {
      const current = groups.find((group) => group.id === node.groupId);
      return `“${node.title}” already belongs to “${current?.name ?? "another visual group"}”. Ungroup it first.`;
    }
  }
  return null;
}

export function validateParentAssignment(
  nodes: readonly WorkNode[],
  nodeId: string,
  proposedParentId: string | undefined,
): string | null {
  if (!proposedParentId) return null;
  if (nodeId === proposedParentId) return "A work item cannot parent itself.";
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const parent = nodes.find((candidate) => candidate.id === proposedParentId);
  if (!node || !parent) return "The child or proposed parent no longer exists.";
  if (isTerminalLifecycle(parent.lifecycle)) {
    return `“${parent.title}” is ${lifecycleLabel(parent.lifecycle)} and cannot accept new child work.`;
  }
  if (descendantIds(nodes, nodeId).has(proposedParentId)) {
    return "That parent assignment would create a cycle.";
  }
  return null;
}

export function validateFixtureProjectAttachment(
  nodes: readonly WorkNode[],
  projects: readonly FixtureProject[],
  attachments: readonly FixtureProjectAttachment[],
  nodeIds: readonly string[],
  plan: FixtureProjectAttachmentPlan,
  canWrite: boolean,
): string | null {
  if (plan.mode === "visual-only") return null;
  if (!canWrite) return "This fixture is read-only. No Project attachment was prepared.";
  const uniqueIds = [...new Set(nodeIds)];
  if (uniqueIds.length !== nodeIds.length) return "The selection contains duplicate work identities.";
  if (uniqueIds.length === 0) return "Select at least one primary work item.";
  const selected = uniqueIds.map((nodeId) => nodes.find((node) => node.id === nodeId));
  if (selected.some((node) => !node)) return "The selection contains a missing work item.";
  for (const node of selected as WorkNode[]) {
    if (isTerminalLifecycle(node.lifecycle)) {
      return `“${node.title}” is ${lifecycleLabel(node.lifecycle)} history and cannot be attached to a new Project.`;
    }
  }
  const selectedSet = new Set(uniqueIds);
  for (const nodeId of uniqueIds) {
    if ([...descendantIds(nodes, nodeId)].some((descendantId) => selectedSet.has(descendantId))) {
      return "The selection mixes parent and child work. Attach only the primary work boundary.";
    }
  }
  if (plan.mode === "new-project") {
    if (!plan.projectName.trim()) return "Name the new fixture Project before confirmation.";
  }
  if (plan.mode === "existing-project") {
    const project = projects.find((candidate) => candidate.id === plan.projectId);
    if (!project) return "The selected fixture Project no longer exists.";
    if (project.status !== "active") {
      return `“${project.name}” is ${project.status} and cannot accept new work.`;
    }
    if (nodes.some((node) => node.id === project.id)) {
      return "A work item cannot also be its own Project boundary.";
    }
  }
  const closure = fixtureProjectAttachmentClosure(nodes, uniqueIds);
  if (closure.error) return closure.error;
  const attachmentIds = new Set(closure.nodeIds);
  const targetProjectId = plan.mode === "existing-project" ? plan.projectId : undefined;
  const conflicting = attachments.find(
    (attachment) => attachmentIds.has(attachment.nodeId) && attachment.projectId !== targetProjectId,
  );
  if (conflicting) return "At least one selected work item or required ancestor already has a different fixture Project plan.";
  return null;
}

export function fixtureProjectAttachmentClosure(
  nodes: readonly WorkNode[],
  nodeIds: readonly string[],
): { nodeIds: string[]; error: string | null } {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const closure = new Set<string>();
  for (const nodeId of nodeIds) {
    let currentId: string | undefined = nodeId;
    const path = new Set<string>();
    while (currentId) {
      if (path.has(currentId)) {
        return { nodeIds: [], error: "The proposed Project attachment contains a hierarchy cycle." };
      }
      path.add(currentId);
      const node = nodeById.get(currentId);
      if (!node) return { nodeIds: [], error: "The proposed Project attachment contains an orphaned work identity." };
      closure.add(node.id);
      if (node.parentNodeId && node.satelliteOfNodeId && node.parentNodeId !== node.satelliteOfNodeId) {
        return { nodeIds: [], error: `“${node.title}” has conflicting parent identities.` };
      }
      currentId = node.parentNodeId ?? node.satelliteOfNodeId;
    }
  }
  return { nodeIds: [...closure], error: null };
}
