import {
  ArrowRight,
  CalendarDots,
  CaretDown,
  CaretUp,
  ChartLineUp,
  ChatCircleText,
  CheckCircle,
  Compass,
  Crosshair,
  File,
  FileCode,
  FileCsv,
  FileText,
  FolderOpen,
  GitBranch,
  Lightbulb,
  PresentationChart,
  Question,
  Sparkle,
  UserCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Artifact, WorkNode } from "../domain";
import { lifecycleLabel } from "../kanban-model";
import type { NodeInspectorData } from "./ui-types";

export interface NodeInspectorProps {
  data: NodeInspectorData | null;
  collapsed?: boolean;
  onClose?: () => void;
  onToggleDetails?: () => void;
  onFocusNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onStartAction: (nodeId: string, suggestedPrompt?: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatStatus(value: string): string {
  return value.replaceAll("-", " ");
}

function ArtifactIcon({ artifact }: { artifact: Artifact }) {
  const props = { "aria-hidden": true, size: 17, weight: "duotone" as const };

  switch (artifact.kind) {
    case "goal":
      return <Compass {...props} />;
    case "csv":
      return <FileCsv {...props} />;
    case "report":
      return <FileText {...props} />;
    case "figure":
      return <PresentationChart {...props} />;
    case "code":
    case "patch":
      return <FileCode {...props} />;
    default:
      return <File {...props} />;
  }
}

function NodeLink({
  node,
  label,
  onSelect,
}: {
  node: WorkNode;
  label: string;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <button
      className="inspector-node-link"
      type="button"
      onClick={() => onSelect(node.id)}
    >
      <span>{label}</span>
      <strong>{node.title}</strong>
      <ArrowRight aria-hidden="true" size={16} />
    </button>
  );
}

export function NodeInspector({
  data,
  collapsed = false,
  onClose,
  onToggleDetails,
  onFocusNode,
  onSelectNode,
  onStartAction,
  onOpenArtifact,
}: NodeInspectorProps) {
  if (!data) {
    return (
      <aside className="inspector inspector--empty" aria-label="Work details">
        <div className="inspector-empty-state">
          <Sparkle aria-hidden="true" size={24} weight="duotone" />
          <h2>Select a point in the work</h2>
          <p>
            Choose a work unit to recover what it attempted, what happened, and what
            could happen next.
          </p>
        </div>
      </aside>
    );
  }

  const { node, workstream, sourceThreads, artifacts, parent, children } = data;
  const isFailure = node.status === "failed" || node.status === "rejected";
  const happened = node.failureReason ?? node.decision ?? node.outcome;
  const dateRange = node.endedAt
    ? `${formatDate(node.startedAt)} – ${formatDate(node.endedAt)}`
    : `Started ${formatDate(node.startedAt)}`;

  return (
    <aside
      className={`inspector node-inspector${collapsed ? " is-collapsed" : ""}`}
      aria-labelledby="node-inspector-title"
    >
      <header className="inspector-header">
        <div>
          <p className="inspector-eyebrow">
            <span className={`status-dot status-dot--${node.status}`} />
            {formatStatus(node.type)} · {formatStatus(node.status)} · {lifecycleLabel(node.lifecycle)}
          </p>
          <h2 id="node-inspector-title">{node.title}</h2>
        </div>
        <div className="inspector-header-actions">
          {onToggleDetails ? (
            <button
              className="button button--secondary inspector-details-toggle"
              type="button"
              aria-expanded={!collapsed}
              aria-controls="node-inspector-details"
              onClick={onToggleDetails}
            >
              {collapsed ? (
                <CaretDown aria-hidden="true" size={16} />
              ) : (
                <CaretUp aria-hidden="true" size={16} />
              )}
              {collapsed ? "Open details" : "Collapse"}
            </button>
          ) : null}
          {onClose ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Close work details"
              onClick={onClose}
            >
              <X aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>
      </header>

      {!collapsed ? <div className="inspector-scroll" id="node-inspector-details">
        <section className="inspector-section inspector-identity" aria-label="Identity">
          <dl className="identity-grid">
            <div>
              <dt>Lifecycle</dt>
              <dd>{lifecycleLabel(node.lifecycle)}</dd>
            </div>
            <div>
              <dt>
                <UserCircle aria-hidden="true" size={16} /> Owner
              </dt>
              <dd>{node.owner}</dd>
            </div>
            <div>
              <dt>
                <CalendarDots aria-hidden="true" size={16} /> Dates
              </dt>
              <dd>{dateRange}</dd>
            </div>
            <div>
              <dt>
                <GitBranch aria-hidden="true" size={16} /> Workstream
              </dt>
              <dd>{workstream?.name ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt>
                <ChatCircleText aria-hidden="true" size={16} /> Source
              </dt>
              <dd>
                {sourceThreads.length
                  ? sourceThreads.map((thread) => thread.title).join(", ")
                  : "No source thread recorded"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section">
          <h3>
            <Lightbulb aria-hidden="true" size={17} weight="duotone" /> What this was
          </h3>
          <p>{node.summary}</p>
        </section>

        <section
          className={`inspector-section outcome-card${isFailure ? " outcome-card--failure" : ""}`}
        >
          <h3>
            {isFailure ? (
              <WarningCircle aria-hidden="true" size={17} weight="fill" />
            ) : (
              <CheckCircle aria-hidden="true" size={17} weight="duotone" />
            )}
            What happened
          </h3>
          <p>{happened || "No outcome has been recorded yet."}</p>
          {node.failureReason && node.outcome && node.failureReason !== node.outcome ? (
            <p className="inspector-supporting-copy">{node.outcome}</p>
          ) : null}
        </section>

        <section className="inspector-section">
          <h3>
            <GitBranch aria-hidden="true" size={17} weight="duotone" /> Provenance
          </h3>
          <p>{node.origin}</p>
          <div className="lineage-links">
            {parent ? (
              <NodeLink node={parent} label="Came from" onSelect={onSelectNode} />
            ) : (
              <p className="empty-inline">This is a root work unit.</p>
            )}
            {children.slice(0, 3).map((child) => (
              <NodeLink
                key={child.id}
                node={child}
                label="Led to"
                onSelect={onSelectNode}
              />
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <h3>
            <FolderOpen aria-hidden="true" size={17} weight="duotone" /> Artifacts
            <span className="section-count">{artifacts.length}</span>
          </h3>
          {artifacts.length ? (
            <ul className="artifact-list">
              {artifacts.map((artifact) => (
                <li key={artifact.id}>
                  <button
                    type="button"
                    className="artifact-row"
                    onClick={() => onOpenArtifact?.(artifact.id)}
                    disabled={!onOpenArtifact}
                  >
                    <ArtifactIcon artifact={artifact} />
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>
                        {artifact.summary} · revision {artifact.revision}
                      </small>
                    </span>
                    {!artifact.available ? (
                      <span className="artifact-state artifact-state--missing">Missing</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">This work did not produce a saved artifact.</p>
          )}
        </section>

        <section className="inspector-section">
          <h3>
            <Question aria-hidden="true" size={17} weight="duotone" /> Unresolved
            <span className="section-count">{node.unresolvedQuestions.length}</span>
          </h3>
          {node.unresolvedQuestions.length ? (
            <ul className="plain-list">
              {node.unresolvedQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">No unresolved question is recorded.</p>
          )}
        </section>

        <details className="inspector-section activity-disclosure">
          <summary>
            <ChartLineUp aria-hidden="true" size={17} weight="duotone" /> Activity
            <span className="section-count">{node.activity.length}</span>
          </summary>
          <ol className="activity-list">
            {node.activity.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                <span>{entry.message}</span>
              </li>
            ))}
          </ol>
        </details>

        <section className="inspector-section">
          <h3>
            <Compass aria-hidden="true" size={17} weight="duotone" /> Next actions
          </h3>
          {node.nextActions.length ? (
            <div className="next-action-list">
              {node.nextActions.map((action) => (
                <button
                  key={action}
                  className="next-action"
                  type="button"
                  onClick={() => onStartAction(node.id, action)}
                >
                  <span>{action}</span>
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-inline">No follow-up has been proposed.</p>
          )}
        </section>
      </div> : null}

      {!collapsed ? <footer className="inspector-footer">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => onFocusNode(node.id)}
        >
          <Crosshair aria-hidden="true" size={18} />
          Focus this work
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={() => onStartAction(node.id)}
        >
          <Sparkle aria-hidden="true" size={18} weight="fill" />
          Start from here
        </button>
      </footer> : null}
    </aside>
  );
}
