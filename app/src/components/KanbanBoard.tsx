import {
  CaretDown,
  CaretRight,
  CirclesFour,
  DotsSixVertical,
  Lock,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  FixtureProject,
  FixtureProjectAttachment,
  WorkGroup,
  WorkLifecycle,
  WorkNode,
  Workstream,
} from "../domain";
import {
  buildKanbanColumns,
  LIFECYCLE_COLUMNS,
  lifecycleLabel,
} from "../kanban-model";

export type KanbanDataState =
  | "ready"
  | "loading"
  | "error"
  | "empty"
  | "readonly"
  | "partial-error"
  | "offline-pending"
  | "reconciliation-conflict"
  | "invalid-hierarchy";

export interface KanbanBoardProps {
  nodes: WorkNode[];
  groups: WorkGroup[];
  workstreams: Workstream[];
  fixtureProjects?: FixtureProject[];
  fixtureProjectAttachments?: FixtureProjectAttachment[];
  selectedNodeId?: string;
  multiSelectedNodeIds: string[];
  collapsedLifecycles: WorkLifecycle[];
  searchQuery: string;
  dataState?: KanbanDataState;
  onSelectNode: (nodeId: string) => void;
  onToggleMultiSelect: (nodeId: string) => void;
  onMoveNode: (nodeId: string, lifecycle: WorkLifecycle) => void;
  onToggleColumn: (lifecycle: WorkLifecycle) => void;
  onCreateGroup: (nodeIds: string[]) => void;
  onRetry?: () => void;
}

function typeLabel(node: WorkNode): string {
  if (node.type === "verification" || node.type === "test") return "Validation";
  if (node.type === "status" || node.type === "summary") return "Report";
  if (node.type === "experiment" && node.status === "failed") return "Issue / experiment";
  if (node.satelliteOfNodeId) return "Child work";
  return node.type.replaceAll("-", " ");
}

function KanbanCard({
  node,
  nodes,
  workstream,
  group,
  fixtureProject,
  selected,
  multiSelected,
  readonly,
  shownOutsideFilter,
  onSelect,
  onToggleMultiSelect,
  onMove,
  onDragStart,
  selectedRef,
}: {
  node: WorkNode;
  nodes: WorkNode[];
  workstream?: Workstream;
  group?: WorkGroup;
  fixtureProject?: FixtureProject;
  selected: boolean;
  multiSelected: boolean;
  readonly: boolean;
  shownOutsideFilter: boolean;
  onSelect: () => void;
  onToggleMultiSelect: () => void;
  onMove: (lifecycle: WorkLifecycle) => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  selectedRef?: React.RefObject<HTMLElement | null>;
}) {
  const parent = nodes.find(
    (candidate) => candidate.id === (node.parentNodeId ?? node.satelliteOfNodeId),
  );
  const childCount = nodes.filter(
    (candidate) => candidate.parentNodeId === node.id || candidate.satelliteOfNodeId === node.id,
  ).length;
  return (
    <article
      ref={selected ? selectedRef : undefined}
      className={`kanban-card${selected ? " is-selected" : ""}${multiSelected ? " is-multi-selected" : ""}`}
      data-kanban-node-id={node.id}
      data-lifecycle={node.lifecycle}
      draggable={!readonly}
      onDragStart={onDragStart}
      style={group ? { "--card-group-color": group.overlayColor } as React.CSSProperties : undefined}
    >
      <header className="kanban-card__meta">
        <span className="kanban-card__drag" aria-hidden="true">
          <DotsSixVertical size={16} />
        </span>
        <span>{typeLabel(node)}</span>
        <span className={`kanban-card__status status-${node.status}`}>{node.status.replaceAll("-", " ")}</span>
      </header>
      <button
        type="button"
        className="kanban-card__open"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <strong>{node.title}</strong>
        <span>{node.summary}</span>
      </button>
      <dl className="kanban-card__facts">
        <div><dt>Workstream</dt><dd>{workstream?.name ?? "Unknown"}</dd></div>
        {parent ? <div><dt>Parent</dt><dd>{parent.title}</dd></div> : <div><dt>Hierarchy</dt><dd>Primary work</dd></div>}
        {childCount ? <div><dt>Children</dt><dd>{childCount}</dd></div> : null}
        {group ? <div><dt>Visual group</dt><dd><CirclesFour aria-hidden="true" size={13} /> {group.name}</dd></div> : null}
        {fixtureProject ? <div><dt>Fixture Project plan</dt><dd>{fixtureProject.name}</dd></div> : null}
      </dl>
      {node.lifecycle === "abandoned" && node.abandonmentReason ? (
        <p className="kanban-card__reason"><WarningCircle aria-hidden="true" size={14} /> {node.abandonmentReason}</p>
      ) : null}
      {shownOutsideFilter ? <p className="kanban-card__exception">Shown because it is selected.</p> : null}
      <footer className="kanban-card__actions">
        <label>
          <input
            type="checkbox"
            checked={multiSelected}
            onChange={onToggleMultiSelect}
            aria-label={`Add ${node.title} to grouping selection`}
          />
          Select
        </label>
        <label className="kanban-card__move">
          <span>Move</span>
          <select
            value={node.lifecycle}
            disabled={readonly}
            aria-label={`Move ${node.title} to lifecycle`}
            onChange={(event) => onMove(event.currentTarget.value as WorkLifecycle)}
          >
            {LIFECYCLE_COLUMNS.map((column) => (
              <option key={column.id} value={column.id}>{column.label}</option>
            ))}
          </select>
        </label>
      </footer>
    </article>
  );
}

export function KanbanBoard({
  nodes,
  groups,
  workstreams,
  fixtureProjects = [],
  fixtureProjectAttachments = [],
  selectedNodeId,
  multiSelectedNodeIds,
  collapsedLifecycles,
  searchQuery,
  dataState = "ready",
  onSelectNode,
  onToggleMultiSelect,
  onMoveNode,
  onToggleColumn,
  onCreateGroup,
  onRetry,
}: KanbanBoardProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const selectedCardRef = useRef<HTMLElement | null>(null);
  const readonly = dataState === "readonly"
    || dataState === "partial-error"
    || dataState === "offline-pending"
    || dataState === "reconciliation-conflict"
    || dataState === "invalid-hierarchy";
  const displayedNodes = dataState === "empty" ? [] : nodes;
  const columns = useMemo(
    () => buildKanbanColumns(displayedNodes, collapsedLifecycles, searchQuery, selectedNodeId),
    [collapsedLifecycles, displayedNodes, searchQuery, selectedNodeId],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const streamById = useMemo(
    () => new Map(workstreams.map((workstream) => [workstream.id, workstream])),
    [workstreams],
  );
  const groupByNodeId = useMemo(
    () => new Map(groups.flatMap((group) => group.memberNodeIds.map((nodeId) => [nodeId, group] as const))),
    [groups],
  );
  const fixtureProjectById = useMemo(
    () => new Map(fixtureProjects.map((project) => [project.id, project])),
    [fixtureProjects],
  );
  const fixtureProjectByNodeId = useMemo(
    () => new Map(fixtureProjectAttachments.flatMap((attachment) => {
      const project = fixtureProjectById.get(attachment.projectId);
      return project ? [[attachment.nodeId, project] as const] : [];
    })),
    [fixtureProjectAttachments, fixtureProjectById],
  );
  const multiSelected = useMemo(() => new Set(multiSelectedNodeIds), [multiSelectedNodeIds]);

  useEffect(() => {
    if (typeof selectedCardRef.current?.scrollIntoView === "function") {
      selectedCardRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedNodeId]);

  if (dataState === "loading") {
    return (
      <section className="kanban-message-state" aria-live="polite" aria-busy="true">
        <strong>Loading canonical work…</strong>
        <p>The board is waiting for the same work identities used by the graph.</p>
      </section>
    );
  }
  if (dataState === "error") {
    return (
      <section className="kanban-message-state is-error" role="alert">
        <WarningCircle aria-hidden="true" size={24} />
        <strong>The canonical work could not be loaded.</strong>
        <p>No local lifecycle was changed. Retry when the fixture transport is available.</p>
        {onRetry ? <button className="button button--secondary" type="button" onClick={onRetry}>Retry</button> : null}
      </section>
    );
  }

  const preservedStateMessage = dataState === "partial-error"
    ? {
        title: "Some canonical work could not be refreshed.",
        detail: "The last complete fixture snapshot remains visible and read-only; no partial result was applied.",
      }
    : dataState === "offline-pending"
      ? {
          title: "Offline with a pending reconciliation.",
          detail: "The last complete fixture snapshot remains visible and read-only until its provenance can be checked.",
        }
      : dataState === "reconciliation-conflict"
        ? {
            title: "A reconciliation conflict needs a decision.",
            detail: "Canonical identities and both fixture versions are preserved; automatic mutation is paused.",
          }
        : dataState === "invalid-hierarchy"
          ? {
              title: "The fixture hierarchy is invalid.",
              detail: "The last valid canonical snapshot remains visible; Project attachment and lifecycle mutation are paused.",
            }
          : null;

  return (
    <section className="kanban-board" aria-labelledby="kanban-title" data-kanban-state={dataState}>
      {preservedStateMessage ? (
        <div
          className="kanban-message-state is-inline is-error"
          role={dataState === "offline-pending" ? "status" : "alert"}
        >
          <WarningCircle aria-hidden="true" size={22} />
          <strong>{preservedStateMessage.title}</strong>
          <p>{preservedStateMessage.detail}</p>
        </div>
      ) : null}
      <header className="kanban-board__intro">
        <div>
          <p className="eyebrow">One canonical work model</p>
          <h1 id="kanban-title">Lifecycle board</h1>
          <p>Graph shows how work is connected; Kanban shows where the same work sits in its lifecycle.</p>
        </div>
        <div className="kanban-board__summary">
          <span>{displayedNodes.length} work items</span>
          <span>{groups.length} visual group{groups.length === 1 ? "" : "s"}</span>
          {readonly ? <strong><Lock aria-hidden="true" size={14} /> Read-only fixture</strong> : null}
        </div>
      </header>

      {multiSelectedNodeIds.length > 0 ? (
        <div className="kanban-group-toolbar" role="status">
          <span>{multiSelectedNodeIds.length} selected for visual grouping</span>
          <button
            className="button button--secondary"
            type="button"
            disabled={multiSelectedNodeIds.length < 1}
            onClick={() => onCreateGroup(multiSelectedNodeIds)}
          >
            <CirclesFour aria-hidden="true" size={16} /> Group selected
          </button>
          <small>A visual group never changes Forge hierarchy or identifiers.</small>
        </div>
      ) : null}

      <div className="kanban-columns" aria-label="Work lifecycle columns">
        {columns.map((column) => {
          const selectedInColumn = column.nodes.find((node) => node.id === selectedNodeId);
          const visibleNodes = column.collapsed
            ? selectedInColumn ? [selectedInColumn] : []
            : column.nodes;
          return (
            <section
              key={column.id}
              className={`kanban-column lifecycle-${column.id}${column.collapsed ? " is-collapsed" : ""}${draggedNodeId ? " is-drop-ready" : ""}`}
              aria-labelledby={`kanban-column-${column.id}`}
              onDragOver={(event) => {
                if (readonly) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (readonly) return;
                event.preventDefault();
                const nodeId = event.dataTransfer.getData("application/x-threadwake-node") || draggedNodeId;
                setDraggedNodeId(null);
                if (nodeId) onMoveNode(nodeId, column.id);
              }}
            >
              <header className="kanban-column__header">
                <button
                  type="button"
                  aria-expanded={!column.collapsed}
                  aria-controls={`kanban-column-body-${column.id}`}
                  onClick={() => onToggleColumn(column.id)}
                >
                  {column.collapsed ? <CaretRight aria-hidden="true" size={17} /> : <CaretDown aria-hidden="true" size={17} />}
                  <span>
                    <strong id={`kanban-column-${column.id}`}>{column.label}</strong>
                    <small>{column.description}</small>
                  </span>
                  <b>{column.totalCount}</b>
                </button>
              </header>
              <div id={`kanban-column-body-${column.id}`} className="kanban-column__body">
                {column.filteredCount ? <p className="kanban-column__filter-note">{column.filteredCount} hidden by search</p> : null}
                {column.collapsed && selectedInColumn ? <p className="kanban-column__selected-note">Selected work remains visible in this collapsed column.</p> : null}
                {visibleNodes.map((node) => (
                  <KanbanCard
                    key={node.id}
                    node={node}
                    nodes={nodes}
                    workstream={streamById.get(node.workstreamId)}
                    group={groupByNodeId.get(node.id)}
                    fixtureProject={fixtureProjectByNodeId.get(node.id)}
                    selected={node.id === selectedNodeId}
                    multiSelected={multiSelected.has(node.id)}
                    readonly={readonly}
                    shownOutsideFilter={column.selectedOutsideFilter && node.id === selectedNodeId}
                    selectedRef={selectedCardRef}
                    onSelect={() => onSelectNode(node.id)}
                    onToggleMultiSelect={() => onToggleMultiSelect(node.id)}
                    onMove={(lifecycle) => onMoveNode(node.id, lifecycle)}
                    onDragStart={(event) => {
                      setDraggedNodeId(node.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-threadwake-node", node.id);
                    }}
                  />
                ))}
                {!column.collapsed && visibleNodes.length === 0 ? (
                  <p className="kanban-column__empty">
                    {searchQuery ? "No matching work in this lifecycle." : `No work is ${lifecycleLabel(column.id).toLocaleLowerCase()}.`}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {displayedNodes.length === 0 ? (
        <div className="kanban-board__empty" role="status">
          <strong>No canonical work is available.</strong>
          <p>The six lifecycle categories remain visible so an empty source cannot be mistaken for a loading or error state.</p>
        </div>
      ) : null}
      <p className="kanban-board__contract">
        Every work item appears in exactly one lifecycle. Dragging is optional; each card has the same keyboard-accessible Move control.
      </p>
    </section>
  );
}
