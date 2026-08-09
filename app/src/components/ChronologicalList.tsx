import {
  ArrowRight,
  CalendarDots,
  CheckSquare,
  Crosshair,
  FolderOpen,
  GitBranch,
  Link,
  ListBullets,
  SelectionSlash,
  Sparkle,
  Square,
  Stack,
} from "@phosphor-icons/react";
import type {
  GraphRelation,
  SourceThread,
  WorkGroup,
  WorkNode,
  Workstream,
} from "../domain";

export interface ChronologicalListProps {
  nodes: WorkNode[];
  relations: GraphRelation[];
  workstreams: Workstream[];
  sourceThreads: SourceThread[];
  groups?: WorkGroup[];
  allNodes?: WorkNode[];
  selectedNodeId?: string;
  selectedRelationId?: string;
  multiSelectedNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onStartAction: (nodeId: string) => void;
  onToggleMultiSelect: (nodeId: string) => void;
  onSelectRelation: (relationId: string) => void;
  onCreateGroup?: (nodeIds: string[]) => void;
  onClearMultiSelection?: () => void;
  onToggleGroup?: (groupId: string) => void;
  onUngroup?: (groupId: string) => void;
}

const fullDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : fullDateFormatter.format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : timeFormatter.format(date);
}

function relationCopy(relation: GraphRelation, target: WorkNode | undefined): string {
  const kind = relation.kind.replaceAll("-", " ");
  return target ? `${kind} ${target.title}` : relation.label ?? kind;
}

export function ChronologicalList({
  nodes,
  relations,
  workstreams,
  sourceThreads,
  groups = [],
  allNodes = nodes,
  selectedNodeId,
  selectedRelationId,
  multiSelectedNodeIds,
  onSelectNode,
  onFocusNode,
  onStartAction,
  onToggleMultiSelect,
  onSelectRelation,
  onCreateGroup,
  onClearMultiSelection,
  onToggleGroup,
  onUngroup,
}: ChronologicalListProps) {
  const orderedNodes = [...nodes].sort(
    (left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const workstreamById = new Map(
    workstreams.map((workstream) => [workstream.id, workstream]),
  );
  const threadById = new Map(sourceThreads.map((thread) => [thread.id, thread]));
  const multiSelected = new Set(multiSelectedNodeIds);

  return (
    <section className="chronological-view" aria-labelledby="chronological-title">
      <header className="chronological-header">
        <div>
          <p className="view-eyebrow">Accessible graph alternative</p>
          <h2 id="chronological-title">
            <ListBullets aria-hidden="true" size={21} weight="duotone" /> Chronological
            work
          </h2>
          <p>
            The same work units and links, ordered by when each line of work began.
          </p>
        </div>
        {multiSelectedNodeIds.length ? (
          <div className="list-selection-actions" aria-live="polite">
            <span>{multiSelectedNodeIds.length} selected</span>
            {onClearMultiSelection ? (
              <button type="button" onClick={onClearMultiSelection}>
                Clear
              </button>
            ) : null}
            {onCreateGroup && multiSelectedNodeIds.length > 1 ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onCreateGroup(multiSelectedNodeIds)}
              >
                <Stack aria-hidden="true" size={17} /> Group selected
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {orderedNodes.length ? (
        <ol className="chronological-list">
          {orderedNodes.map((node, index) => {
            const isSelected = selectedNodeId === node.id;
            const isMultiSelected = multiSelected.has(node.id);
            const workstream = workstreamById.get(node.workstreamId);
            const collapsedGroup = node.groupId
              ? groups.find((group) => group.id === node.groupId && group.collapsed)
              : undefined;
            const groupMembers = collapsedGroup
              ? collapsedGroup.memberNodeIds
                  .map((nodeId) => allNodes.find((candidate) => candidate.id === nodeId))
                  .filter((candidate): candidate is WorkNode => Boolean(candidate))
              : [];
            const groupStatusSummary = [...new Set(groupMembers.map((member) => member.status.replaceAll("-", " ")))]
              .join(" · ");
            const threads = node.sourceThreadIds
              .map((threadId) => threadById.get(threadId))
              .filter((thread) => thread !== undefined);
            const outgoing = relations.filter(
              (relation) => relation.sourceNodeId === node.id,
            );
            const previousNode = orderedNodes[index - 1];
            const beginsDay =
              !previousNode || formatDate(previousNode.startedAt) !== formatDate(node.startedAt);

            return (
              <li className="chronological-entry" key={node.id}>
                {beginsDay ? (
                  <div className="chronological-day">
                    <CalendarDots aria-hidden="true" size={16} />
                    <time dateTime={node.startedAt}>{formatDate(node.startedAt)}</time>
                  </div>
                ) : null}

                <article
                  className={`list-node list-node--${node.status}${isSelected ? " list-node--selected" : ""}`}
                  aria-labelledby={`list-node-title-${node.id}`}
                >
                  <div className="list-node__rail">
                    <span
                      className={`list-node__marker status-marker--${node.status}`}
                      aria-hidden="true"
                    />
                    <span className="list-node__line" aria-hidden="true" />
                  </div>

                  {collapsedGroup ? (
                    <span className="list-node__multi-select list-node__group-marker" aria-hidden="true">
                      <Stack size={20} weight="duotone" />
                    </span>
                  ) : (
                    <label className="list-node__multi-select">
                      <input
                        type="checkbox"
                        checked={isMultiSelected}
                        onChange={() => onToggleMultiSelect(node.id)}
                      />
                      {isMultiSelected ? (
                        <CheckSquare aria-hidden="true" size={20} weight="fill" />
                      ) : (
                        <Square aria-hidden="true" size={20} />
                      )}
                      <span className="visually-hidden">
                        {isMultiSelected ? "Remove" : "Add"} {node.title} {" "}
                        {isMultiSelected ? "from" : "to"} the group selection
                      </span>
                    </label>
                  )}

                  <button
                    className="list-node__summary"
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => collapsedGroup
                      ? onToggleGroup?.(collapsedGroup.id)
                      : onSelectNode(node.id)}
                    onKeyDown={(event) => {
                      if (collapsedGroup) return;
                      if (event.key === "Enter" && event.shiftKey) {
                        event.preventDefault();
                        onFocusNode(node.id);
                      } else if (event.key.toLowerCase() === "a") {
                        event.preventDefault();
                        onStartAction(node.id);
                      }
                    }}
                  >
                    <span className="list-node__meta">
                      <time dateTime={node.startedAt}>{formatTime(node.startedAt)}</time>
                      <span>{collapsedGroup ? "collapsed group" : node.type.replaceAll("-", " ")}</span>
                      <span className={`status-label status-label--${node.status}`}>
                        {node.status.replaceAll("-", " ")}
                      </span>
                    </span>
                    <strong id={`list-node-title-${node.id}`}>{node.title}</strong>
                    <span className="list-node__description">{node.summary}</span>
                    <span className="list-node__provenance">
                      {collapsedGroup ? <Stack aria-hidden="true" size={14} /> : <GitBranch aria-hidden="true" size={14} />}
                      {collapsedGroup
                        ? `${groupMembers.length} work units · ${formatDate(node.startedAt)}${node.endedAt ? ` – ${formatDate(node.endedAt)}` : ""}${groupStatusSummary ? ` · ${groupStatusSummary}` : ""}`
                        : `${workstream?.name ?? "Unknown workstream"}${threads.length ? ` · ${threads.map((thread) => thread.title).join(", ")}` : ""}`}
                    </span>
                  </button>

                  <div className="list-node__facts">
                    <span>
                      {collapsedGroup ? <Stack aria-hidden="true" size={15} /> : <FolderOpen aria-hidden="true" size={15} />}
                      {collapsedGroup
                        ? `${groupMembers.length} work units`
                        : `${node.artifactIds.length} ${node.artifactIds.length === 1 ? "artifact" : "artifacts"}`}
                    </span>
                    <span>
                      {collapsedGroup
                        ? groupMembers.reduce((total, member) => total + member.unresolvedQuestions.length, 0)
                        : node.unresolvedQuestions.length} unresolved
                    </span>
                  </div>

                  <div className="list-node__actions">
                    {collapsedGroup ? (
                      <>
                        <button type="button" onClick={() => onToggleGroup?.(collapsedGroup.id)}>
                          <FolderOpen aria-hidden="true" size={16} /> Expand group
                        </button>
                        <button type="button" onClick={() => onUngroup?.(collapsedGroup.id)}>
                          <SelectionSlash aria-hidden="true" size={16} /> Ungroup
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onFocusNode(node.id)}>
                          <Crosshair aria-hidden="true" size={16} /> Focus
                        </button>
                        <button type="button" onClick={() => onStartAction(node.id)}>
                          <Sparkle aria-hidden="true" size={16} weight="fill" /> Start from here
                        </button>
                      </>
                    )}
                  </div>

                  {outgoing.length ? (
                    <div className="list-relations" aria-label={`Links from ${node.title}`}>
                      <span>Leads to</span>
                      <ul>
                        {outgoing.map((relation) => (
                          <li key={relation.id}>
                            <button
                              type="button"
                              className={
                                selectedRelationId === relation.id
                                  ? "list-relation list-relation--selected"
                                  : "list-relation"
                              }
                              aria-pressed={selectedRelationId === relation.id}
                              onClick={() => onSelectRelation(relation.id)}
                            >
                              {relation.transferId ? (
                                <Link aria-hidden="true" size={15} />
                              ) : (
                                <ArrowRight aria-hidden="true" size={15} />
                              )}
                              <span>
                                {relationCopy(
                                  relation,
                                  nodeById.get(relation.targetNodeId),
                                )}
                              </span>
                              {relation.transferId ? <small>Edit handoff</small> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="chronological-empty-state">
          <ListBullets aria-hidden="true" size={25} weight="duotone" />
          <h3>No work matches this view</h3>
          <p>Clear the search or enable another relation layer to recover more history.</p>
        </div>
      )}
    </section>
  );
}
