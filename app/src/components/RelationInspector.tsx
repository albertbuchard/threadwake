import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowsLeftRight,
  CheckCircle,
  Compass,
  File,
  FileCsv,
  FileText,
  FloppyDisk,
  Link,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Artifact, ArtifactReference } from "../domain";
import type { RelationInspectorData, TransferDraft } from "./ui-types";

export interface RelationInspectorProps {
  data: RelationInspectorData | null;
  onClose?: () => void;
  onSave: (transferId: string, draft: TransferDraft) => void;
  onSelectNode: (nodeId: string) => void;
  onRefreshReference?: (transferId: string, artifactId: string) => void;
  onRemoveReference?: (transferId: string, artifactId: string) => void;
}

function artifactIcon(kind: Artifact["kind"]) {
  const props = { "aria-hidden": true, size: 17, weight: "duotone" as const };
  if (kind === "goal") return <Compass {...props} />;
  if (kind === "csv") return <FileCsv {...props} />;
  if (kind === "report") return <FileText {...props} />;
  return <File {...props} />;
}

function referenceLabel(reference: ArtifactReference): string {
  if (reference.resolution === "missing") return "Missing";
  if (reference.resolution === "stale") return "Changed since selected";
  return "Ready";
}

export function RelationInspector({
  data,
  onClose,
  onSave,
  onSelectNode,
  onRefreshReference,
  onRemoveReference,
}: RelationInspectorProps) {
  const [instructions, setInstructions] = useState("");
  const [includeGoalFile, setIncludeGoalFile] = useState(false);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setInstructions(data?.transfer.instructions ?? "");
    setIncludeGoalFile(data?.transfer.includeParentGoalFile ?? false);
    setSelectedArtifactIds(
      new Set(data?.transfer.artifacts.map((reference) => reference.artifactId) ?? []),
    );
    setSaved(false);
  }, [data?.transfer.id, data?.transfer.updatedAt]);

  const artifactById = useMemo(
    () => new Map(data?.availableArtifacts.map((artifact) => [artifact.id, artifact]) ?? []),
    [data?.availableArtifacts],
  );

  if (!data) {
    return (
      <aside className="inspector inspector--empty" aria-label="Context transfer">
        <div className="inspector-empty-state">
          <Link aria-hidden="true" size={24} weight="duotone" />
          <h2>Select a parent–child link</h2>
          <p>
            A link records exactly which instructions and outputs the child will receive.
          </p>
        </div>
      </aside>
    );
  }

  const { relation, transfer, parent, child, availableArtifacts } = data;
  const goalArtifact = transfer.parentGoalFile
    ? artifactById.get(transfer.parentGoalFile.artifactId)
    : availableArtifacts.find((artifact) => artifact.kind === "goal");
  const nonGoalArtifacts = availableArtifacts.filter(
    (artifact) => artifact.id !== goalArtifact?.id,
  );
  const unresolvedReferences = [
    ...(includeGoalFile && transfer.parentGoalFile ? [transfer.parentGoalFile] : []),
    ...transfer.artifacts.filter((reference) =>
      selectedArtifactIds.has(reference.artifactId),
    ),
  ].filter((reference) => reference.resolution !== "resolved");

  const toggleArtifact = (artifactId: string) => {
    setSaved(false);
    setSelectedArtifactIds((current) => {
      const next = new Set(current);
      if (next.has(artifactId)) next.delete(artifactId);
      else next.add(artifactId);
      return next;
    });
  };

  const handleSave = () => {
    onSave(transfer.id, {
      instructions: instructions.trim(),
      includeParentGoalFile: includeGoalFile,
      artifactIds: Array.from(selectedArtifactIds),
    });
    setSaved(true);
  };

  return (
    <aside
      className="inspector relation-inspector"
      aria-labelledby="relation-inspector-title"
    >
      <header className="inspector-header">
        <div>
          <p className="inspector-eyebrow">
            <ArrowsLeftRight aria-hidden="true" size={15} /> Context transfer
          </p>
          <h2 id="relation-inspector-title">What does the child receive?</h2>
        </div>
        {onClose ? (
          <button
            className="icon-button"
            type="button"
            aria-label="Close relation details"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        ) : null}
      </header>

      <div className="inspector-scroll">
        <div className="relation-route" aria-label="Relationship direction">
          <button type="button" onClick={() => onSelectNode(parent.id)}>
            <small>Parent</small>
            <strong>{parent.title}</strong>
          </button>
          <span className="relation-route__line">
            <ArrowRight aria-hidden="true" size={19} />
            <small>{relation.label ?? relation.kind.replaceAll("-", " ")}</small>
          </span>
          <button type="button" onClick={() => onSelectNode(child.id)}>
            <small>Child</small>
            <strong>{child.title}</strong>
          </button>
        </div>

        {unresolvedReferences.length ? (
          <div className="transfer-warning" role="alert">
            <WarningCircle aria-hidden="true" size={19} weight="fill" />
            <div>
              <strong>This handoff needs attention</strong>
              <p>
                {unresolvedReferences.length} selected reference
                {unresolvedReferences.length === 1 ? " is" : "s are"} missing or out of
                date. Required references block this child until repaired or removed.
              </p>
            </div>
          </div>
        ) : (
          <div className="transfer-ready" role="status">
            <CheckCircle aria-hidden="true" size={18} weight="fill" />
            The selected handoff is ready.
          </div>
        )}

        <form
          className="transfer-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <section className="inspector-section">
            <label className="field-label" htmlFor={`transfer-instructions-${transfer.id}`}>
              Instructions for the child
            </label>
            <p className="field-help" id={`transfer-help-${transfer.id}`}>
              Explain what the child should know or do. This text is passed verbatim.
            </p>
            <textarea
              id={`transfer-instructions-${transfer.id}`}
              aria-describedby={`transfer-help-${transfer.id}`}
              rows={5}
              value={instructions}
              onChange={(event) => {
                setSaved(false);
                setInstructions(event.target.value);
              }}
              placeholder="For example: use the accepted benchmark thresholds and explain any deviation."
            />
          </section>

          <section className="inspector-section transfer-source-section">
            <h3>Parent goal file</h3>
            <label className="transfer-option transfer-option--goal">
              <input
                type="checkbox"
                checked={includeGoalFile}
                onChange={(event) => {
                  setSaved(false);
                  setIncludeGoalFile(event.target.checked);
                }}
              />
              <span className="transfer-option__icon">
                <Compass aria-hidden="true" size={18} weight="duotone" />
              </span>
              <span className="transfer-option__body">
                <strong>{goalArtifact?.name ?? "Include the parent goal file"}</strong>
                <small>
                  {goalArtifact
                    ? `${goalArtifact.path} · revision ${goalArtifact.revision}`
                    : "No goal file is currently available from this parent."}
                </small>
              </span>
              {includeGoalFile && transfer.parentGoalFile ? (
                <span
                  className={`reference-state reference-state--${transfer.parentGoalFile.resolution}`}
                >
                  {referenceLabel(transfer.parentGoalFile)}
                </span>
              ) : null}
            </label>
            {includeGoalFile && !goalArtifact ? (
              <p className="inline-warning">
                <WarningCircle aria-hidden="true" size={16} />
                The child will stay blocked until this goal file exists or is excluded.
              </p>
            ) : null}
          </section>

          <fieldset className="inspector-section transfer-source-section">
            <legend>
              Parent artifacts <span className="section-count">Choose any number</span>
            </legend>
            {nonGoalArtifacts.length ? (
              <div className="transfer-options">
                {nonGoalArtifacts.map((artifact) => {
                  const reference = transfer.artifacts.find(
                    (candidate) => candidate.artifactId === artifact.id,
                  );
                  return (
                    <label className="transfer-option" key={artifact.id}>
                      <input
                        type="checkbox"
                        checked={selectedArtifactIds.has(artifact.id)}
                        onChange={() => toggleArtifact(artifact.id)}
                      />
                      <span className="transfer-option__icon">
                        {artifactIcon(artifact.kind)}
                      </span>
                      <span className="transfer-option__body">
                        <strong>{artifact.name}</strong>
                        <small>
                          {artifact.summary} · revision {artifact.revision}
                        </small>
                      </span>
                      {reference ? (
                        <span
                          className={`reference-state reference-state--${reference.resolution}`}
                        >
                          {referenceLabel(reference)}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="empty-inline">
                This parent has no additional outputs yet. New demo outputs will appear
                here while it runs.
              </p>
            )}
          </fieldset>

          {unresolvedReferences.length ? (
            <section className="inspector-section broken-references">
              <h3>References to repair</h3>
              <ul>
                {unresolvedReferences.map((reference) => {
                  const artifact = artifactById.get(reference.artifactId);
                  return (
                    <li key={reference.artifactId}>
                      <span>
                        <strong>{artifact?.name ?? reference.artifactId}</strong>
                        <small>{referenceLabel(reference)}</small>
                      </span>
                      <span className="reference-actions">
                        {reference.resolution === "stale" && onRefreshReference ? (
                          <button
                            type="button"
                            onClick={() =>
                              onRefreshReference(transfer.id, reference.artifactId)
                            }
                          >
                            Use latest
                          </button>
                        ) : null}
                        {onRemoveReference ? (
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveReference(transfer.id, reference.artifactId)
                            }
                          >
                            <Trash aria-hidden="true" size={15} /> Remove
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <footer className="transfer-save-bar">
            <span className="save-state" aria-live="polite">
              {saved ? "Transfer saved." : `Last saved ${new Date(transfer.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
            <button className="button button--primary" type="submit">
              <FloppyDisk aria-hidden="true" size={18} weight="fill" /> Save transfer
            </button>
          </footer>
        </form>
      </div>
    </aside>
  );
}
