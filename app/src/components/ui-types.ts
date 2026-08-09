import type {
  Artifact,
  ContextTransfer,
  GraphRelation,
  ImmediateActionKind,
  QueueItem,
  SourceThread,
  WorkNode,
  WorkGroup,
  Workstream,
} from "../domain";

export type WorkbenchView = "graph" | "list";

export type RelationLayer =
  | "depends-on"
  | "same-source-thread"
  | "related-to";

export type ActionKind = ImmediateActionKind | "plan-next";

export type QueueMoveDirection = "up" | "down";

export interface ActionDraft {
  parentNodeId: string;
  kind: ActionKind;
  prompt: string;
}

export interface TransferDraft {
  instructions: string;
  includeParentGoalFile: boolean;
  artifactIds: string[];
}

export interface NodeInspectorData {
  node: WorkNode;
  workstream?: Workstream;
  sourceThreads: SourceThread[];
  artifacts: Artifact[];
  parent?: WorkNode;
  children: WorkNode[];
}

export interface RelationInspectorData {
  relation: GraphRelation;
  transfer: ContextTransfer;
  parent: WorkNode;
  child: WorkNode;
  availableArtifacts: Artifact[];
}

export interface QueueRailData {
  items: QueueItem[];
  nodes: WorkNode[];
  groups: WorkGroup[];
  transfers: ContextTransfer[];
  artifacts: Artifact[];
}
