import {
  ArrowBendDownRight,
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  CaretUp,
  CheckCircle,
  Clock,
  File,
  Link,
  PencilSimple,
  Play,
  Plus,
  Queue,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { ContextTransfer, QueueItem } from "../domain";
import type { QueueMoveDirection, QueueRailData } from "./ui-types";

export interface QueueRailProps {
  data: QueueRailData;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onToggleSelection: (queueItemId: string) => void;
  onChangeExecutionKind: (queueItemId: string, kind: "plan" | "goal") => void;
  onEditItem: (queueItemId: string) => void;
  onAddChild: (queueItemId: string) => void;
  onOpenTransfer: (relationId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onMoveItem: (queueItemId: string, direction: QueueMoveDirection) => void;
  canMoveItem?: (queueItemId: string, direction: QueueMoveDirection) => boolean;
  onPlaySelected: () => void;
}

function statusCopy(item: QueueItem): string {
  if (item.blockedReason) return "Blocked";
  if (item.status === "simulated-running") return "Demo running";
  if (item.status === "completed") return "Demo complete";
  if (item.status === "queued") return "Ready to play";
  return "Draft";
}

function transferSummary(transfer: ContextTransfer | undefined): {
  copy: string;
  issueCount: number;
} {
  if (!transfer) return { copy: "No handoff attached", issueCount: 1 };

  const references = [
    ...(transfer.parentGoalFile && transfer.includeParentGoalFile
      ? [transfer.parentGoalFile]
      : []),
    ...transfer.artifacts,
  ];
  const issueCount = references.filter(
    (reference) => reference.resolution !== "resolved",
  ).length;
  const parts = [
    transfer.instructions.trim() ? "instructions" : null,
    transfer.includeParentGoalFile ? "goal file" : null,
    transfer.artifacts.length
      ? `${transfer.artifacts.length} artifact${transfer.artifacts.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return {
    copy: parts.length ? parts.join(" · ") : "No parent context selected",
    issueCount,
  };
}

export function QueueRail({
  data,
  expanded = true,
  onToggleExpanded,
  onToggleSelection,
  onChangeExecutionKind,
  onEditItem,
  onAddChild,
  onOpenTransfer,
  onOpenNode,
  onMoveItem,
  canMoveItem,
  onPlaySelected,
}: QueueRailProps) {
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const orderedItems = [...data.items].sort((left, right) => left.order - right.order);
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const groupByNodeId = new Map(
    data.groups.flatMap((group) =>
      group.memberNodeIds.map((nodeId) => [nodeId, group] as const),
    ),
  );
  const itemById = new Map(orderedItems.map((item) => [item.id, item]));
  const transferById = new Map(
    data.transfers.map((transfer) => [transfer.id, transfer]),
  );
  const artifactById = new Map(
    data.artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const selected = orderedItems.filter((item) => item.selected);
  const running = orderedItems.filter((item) => item.status === "simulated-running");
  const playable = selected.filter(
    (item) =>
      (item.status === "draft" || item.status === "queued") && !item.blockedReason,
  );
  const notReadyCount = selected.length - playable.length;

  return (
    <section
      className={`queue-rail${expanded ? " queue-rail--expanded" : ""}`}
      aria-labelledby="queue-title"
    >
      <header className="queue-header">
        <button
          className="queue-heading"
          type="button"
          onClick={onToggleExpanded}
          disabled={!onToggleExpanded}
          aria-expanded={expanded}
        >
          <span className="queue-heading__icon">
            <Queue aria-hidden="true" size={19} weight="duotone" />
          </span>
          <span>
            <strong id="queue-title">Action queue</strong>
            <small>
              {running.length
                ? `${running.length} deterministic demo ${running.length === 1 ? "run" : "runs"} active`
                : `${orderedItems.length} planned ${orderedItems.length === 1 ? "action" : "actions"}`}
            </small>
          </span>
          {onToggleExpanded ? (
            expanded ? (
              <CaretDown aria-hidden="true" size={17} />
            ) : (
              <CaretUp aria-hidden="true" size={17} />
            )
          ) : null}
        </button>

        <div className="queue-play-group">
          <span aria-live="polite">
            {selected.length} selected
            {notReadyCount ? ` · ${notReadyCount} not ready` : ""}
          </span>
          <button
            className="button button--play"
            type="button"
            onClick={onPlaySelected}
            disabled={!playable.length}
          >
            <Play aria-hidden="true" size={18} weight="fill" />
            Play selected
          </button>
        </div>
      </header>

      {expanded ? (
        <div className="queue-body">
          {orderedItems.length ? (
            <ol className="queue-items" aria-label="Planned actions in execution order">
              {orderedItems.map((item, index) => {
                const node = nodeById.get(item.nodeId);
                const group = groupByNodeId.get(item.nodeId);
                const itemExpanded = expandedItemIds.has(item.id);
                const parentNode = nodeById.get(item.parentNodeId);
                const parentItem = item.parentQueueItemId
                  ? itemById.get(item.parentQueueItemId)
                  : undefined;
                const transfer = transferById.get(item.contextTransferId);
                const summary = transferSummary(transfer);
                const outputs = item.outputArtifactIds
                  .map((artifactId) => artifactById.get(artifactId))
                  .filter((artifact) => artifact !== undefined);
                const allowUp = canMoveItem
                  ? canMoveItem(item.id, "up")
                  : index > 0 && !item.parentQueueItemId;
                const allowDown = canMoveItem
                  ? canMoveItem(item.id, "down")
                  : index < orderedItems.length - 1 &&
                    !item.parentQueueItemId &&
                    orderedItems[index + 1]?.parentQueueItemId !== item.id;

                return (
                  <li
                    key={item.id}
                    className={`queue-card queue-card--${item.status}${item.blockedReason ? " queue-card--blocked" : ""}${itemExpanded ? " is-expanded" : ""}`}
                  >
                    <div className="queue-order" aria-label={`Queue position ${index + 1}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {item.parentQueueItemId ? (
                        <ArrowBendDownRight aria-label="Chained after another action" size={16} />
                      ) : null}
                    </div>

                    <label className="queue-select">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => onToggleSelection(item.id)}
                      />
                      <span className="visually-hidden">Select {item.title}</span>
                    </label>

                    <div className="queue-card__main">
                      <div className="queue-card__heading">
                        <div>
                          <span className={`queue-status queue-status--${item.status}${itemExpanded ? "" : " visually-hidden"}`}>
                            {item.status === "simulated-running" ? (
                              <SpinnerGap aria-hidden="true" size={14} />
                            ) : item.status === "completed" ? (
                              <CheckCircle aria-hidden="true" size={14} weight="fill" />
                            ) : item.blockedReason ? (
                              <WarningCircle aria-hidden="true" size={14} weight="fill" />
                            ) : (
                              <Clock aria-hidden="true" size={14} />
                            )}
                            {statusCopy(item)}
                          </span>
                          <h3>
                            <button
                              type="button"
                              className="queue-card__title-button"
                              onClick={() => onOpenNode(item.nodeId)}
                            >
                              {item.title}
                            </button>
                          </h3>
                          {group ? (
                            <span className="queue-card__group">{group.name}</span>
                          ) : null}
                        </div>
                        <button
                          className="queue-card__disclosure icon-button icon-button--small"
                          type="button"
                          aria-label={`${itemExpanded ? "Collapse" : "Expand"} ${item.title}`}
                          aria-expanded={itemExpanded}
                          onClick={() =>
                            setExpandedItemIds((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          {itemExpanded ? (
                            <CaretDown aria-hidden="true" size={16} />
                          ) : (
                            <CaretRight aria-hidden="true" size={16} />
                          )}
                        </button>
                        {itemExpanded ? <div className="queue-order-controls" aria-label="Change queue order">
                          <button
                            className="icon-button icon-button--small"
                            type="button"
                            aria-label={`Move ${item.title} earlier`}
                            disabled={!allowUp}
                            onClick={() => onMoveItem(item.id, "up")}
                          >
                            <ArrowUp aria-hidden="true" size={15} />
                          </button>
                          <button
                            className="icon-button icon-button--small"
                            type="button"
                            aria-label={`Move ${item.title} later`}
                            disabled={!allowDown}
                            onClick={() => onMoveItem(item.id, "down")}
                          >
                            <ArrowDown aria-hidden="true" size={15} />
                          </button>
                        </div> : null}
                      </div>

                      {itemExpanded ? (
                        <div className="queue-card__details">
                          <p className="queue-prompt">{item.prompt}</p>

                      <div className="queue-parent-line">
                        <ArrowBendDownRight aria-hidden="true" size={15} />
                        <span>
                          {parentItem
                            ? `After queued action: ${parentItem.title}`
                            : `From: ${parentNode?.title ?? node?.origin ?? "Unknown parent"}`}
                        </span>
                      </div>

                      <div className="queue-context-row">
                        <button
                          type="button"
                          className={`queue-transfer-summary${summary.issueCount ? " queue-transfer-summary--warning" : ""}`}
                          onClick={() => onOpenTransfer(item.relationId)}
                        >
                          {summary.issueCount ? (
                            <WarningCircle aria-hidden="true" size={16} weight="fill" />
                          ) : (
                            <Link aria-hidden="true" size={16} />
                          )}
                          <span>
                            <strong>Parent handoff</strong>
                            <small>
                              {summary.copy}
                              {summary.issueCount
                                ? ` · ${summary.issueCount} needs repair`
                                : ""}
                            </small>
                          </span>
                        </button>

                        <fieldset className="execution-toggle">
                          <legend className="visually-hidden">Run {item.title} as</legend>
                          {(["plan", "goal"] as const).map((kind) => (
                            <label key={kind}>
                              <input
                                type="radio"
                                name={`execution-kind-${item.id}`}
                                value={kind}
                                checked={item.executionKind === kind}
                                onChange={() => onChangeExecutionKind(item.id, kind)}
                                disabled={item.status === "simulated-running"}
                              />
                              <span>{kind === "plan" ? "Plan" : "Goal"}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>

                      {item.blockedReason ? (
                        <div className="queue-blocked-reason" role="alert">
                          <WarningCircle aria-hidden="true" size={17} weight="fill" />
                          <span>
                            <strong>Cannot run yet.</strong> {item.blockedReason}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenTransfer(item.relationId)}
                          >
                            Repair handoff
                          </button>
                        </div>
                      ) : null}

                      {item.status === "simulated-running" || item.status === "completed" ? (
                        <div className="queue-progress" aria-live="polite">
                          <div className="queue-progress__label">
                            <span>
                              {item.status === "completed"
                                ? "Deterministic demo complete"
                                : "Deterministic demo progress"}
                            </span>
                            <strong>{Math.round(item.progress)}%</strong>
                          </div>
                          <progress max={100} value={item.progress}>
                            {Math.round(item.progress)}%
                          </progress>
                          {item.activity.at(-1) ? (
                            <small>{item.activity.at(-1)?.message}</small>
                          ) : null}
                        </div>
                      ) : null}

                      {outputs.length ? (
                        <div className="queue-outputs">
                          <span>Discovered outputs</span>
                          <ul>
                            {outputs.map((artifact) => (
                              <li key={artifact.id}>
                                <File aria-hidden="true" size={14} /> {artifact.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                          <div className="queue-card__actions">
                        <button
                          type="button"
                          onClick={() => onEditItem(item.id)}
                          disabled={item.status === "simulated-running"}
                        >
                          <PencilSimple aria-hidden="true" size={16} /> Edit
                        </button>
                        <button type="button" onClick={() => onAddChild(item.id)}>
                          <Plus aria-hidden="true" size={16} /> Add child
                        </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="queue-empty-state">
              <Queue aria-hidden="true" size={23} weight="duotone" />
              <p>
                No actions are planned. Choose <strong>Plan next action</strong> from any
                work unit to prepare one without running it.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
