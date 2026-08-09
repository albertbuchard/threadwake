import { z } from "zod";

import {
  CONTRACT_VERSION,
  DEFAULT_PAGE_SIZE,
  ERROR_CODES,
  EVIDENCE_KINDS,
  FIXTURE_CONFIRMATION,
  FIXTURE_UNDO_CONFIRMATION,
  LIFECYCLE_STATES,
  MAX_PAGE_SIZE,
  OUTCOMES,
  PROVENANCE_SOURCES,
  RELATION_KINDS,
  WORK_UNIT_KINDS,
} from "./constants.js";
import { findParentCycle } from "./cycle.js";

const StableIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a stable kebab-case identifier.");

const SafeTextSchema = z.string().min(1).max(4_000);
const SummarySchema = z.string().min(1).max(1_000);
const TimestampSchema = z.iso.datetime({ offset: true });
const ContractVersionSchema = z.literal(CONTRACT_VERSION);

export const LifecycleSchema = z.enum(LIFECYCLE_STATES);
export const OutcomeSchema = z.enum(OUTCOMES);

export const ProvenanceSchema = z
  .object({
    source: z.enum(PROVENANCE_SOURCES),
    sourceId: StableIdSchema,
    revision: z.string().min(1).max(128),
    occurredAt: TimestampSchema,
  })
  .strict();

export const ProjectSchema = z
  .object({
    id: StableIdSchema,
    name: z.string().min(1).max(160),
    description: SummarySchema,
    sortOrder: z.number().int().nonnegative(),
    provenance: ProvenanceSchema,
  })
  .strict();

export const GroupSchema = z
  .object({
    id: StableIdSchema,
    projectId: StableIdSchema,
    parentGroupId: StableIdSchema.nullable(),
    name: z.string().min(1).max(160),
    description: SummarySchema,
    sortOrder: z.number().int().nonnegative(),
    provenance: ProvenanceSchema,
  })
  .strict();

export const ContextTransferSchema = z
  .object({
    objective: SafeTextSchema,
    constraints: z.array(SafeTextSchema).max(24),
    acceptedEvidenceIds: z.array(StableIdSchema).max(100),
    nextAction: SafeTextSchema,
  })
  .strict();

export const WorkUnitSchema = z
  .object({
    id: StableIdSchema,
    projectId: StableIdSchema,
    groupId: StableIdSchema.nullable(),
    parentId: StableIdSchema.nullable(),
    kind: z.enum(WORK_UNIT_KINDS),
    title: z.string().min(1).max(240),
    summary: SummarySchema,
    lifecycle: LifecycleSchema,
    outcome: OutcomeSchema,
    rejectedReason: SummarySchema.nullable(),
    evidenceIds: z.array(StableIdSchema).max(100),
    context: ContextTransferSchema,
    sortOrder: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: TimestampSchema,
    provenance: ProvenanceSchema,
  })
  .strict()
  .superRefine((unit, context) => {
    if (unit.lifecycle === "done" && unit.outcome === "pending") {
      context.addIssue({
        code: "custom",
        message: "A completed work unit must have an explicit non-pending outcome.",
        path: ["outcome"],
      });
    }

    if (unit.lifecycle !== "done" && unit.outcome !== "pending") {
      context.addIssue({
        code: "custom",
        message: "An unfinished work unit must keep its outcome pending.",
        path: ["outcome"],
      });
    }

    if (unit.outcome === "rejected" && unit.rejectedReason === null) {
      context.addIssue({
        code: "custom",
        message: "A rejected outcome requires a rejectedReason.",
        path: ["rejectedReason"],
      });
    }

    if (unit.outcome !== "rejected" && unit.rejectedReason !== null) {
      context.addIssue({
        code: "custom",
        message: "rejectedReason is only valid for a rejected outcome.",
        path: ["rejectedReason"],
      });
    }
  });

export const EvidenceRecordSchema = z
  .object({
    id: StableIdSchema,
    workUnitId: StableIdSchema,
    kind: z.enum(EVIDENCE_KINDS),
    title: z.string().min(1).max(240),
    summary: SummarySchema,
    locator: z.string().min(1).max(512),
    contentDigest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    createdAt: TimestampSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

export const WorkRelationSchema = z
  .object({
    id: StableIdSchema,
    sourceId: StableIdSchema,
    targetId: StableIdSchema,
    kind: z.enum(RELATION_KINDS),
    provenance: ProvenanceSchema,
  })
  .strict();

const duplicateIndexes = <T>(items: readonly T[], identify: (item: T) => string) => {
  const seen = new Set<string>();
  const duplicates: number[] = [];

  for (const [index, item] of items.entries()) {
    const id = identify(item);
    if (seen.has(id)) {
      duplicates.push(index);
    }
    seen.add(id);
  }

  return duplicates;
};

export const WorkGraphDocumentSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    graphId: StableIdSchema,
    graphRevision: z.number().int().positive(),
    label: z.string().min(1).max(160),
    synthetic: z.boolean(),
    projects: z.array(ProjectSchema).max(1_000),
    groups: z.array(GroupSchema).max(10_000),
    workUnits: z.array(WorkUnitSchema).max(100_000),
    relations: z.array(WorkRelationSchema).max(200_000),
    evidence: z.array(EvidenceRecordSchema).max(200_000),
  })
  .strict()
  .superRefine((graph, context) => {
    const addDuplicateIssues = (
      field: "projects" | "groups" | "workUnits" | "relations" | "evidence",
      records: readonly { id: string }[],
    ) => {
      for (const index of duplicateIndexes(records, (record) => record.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate stable identifier in ${field}.`,
          path: [field, index, "id"],
        });
      }
    };

    addDuplicateIssues("projects", graph.projects);
    addDuplicateIssues("groups", graph.groups);
    addDuplicateIssues("workUnits", graph.workUnits);
    addDuplicateIssues("relations", graph.relations);
    addDuplicateIssues("evidence", graph.evidence);

    const projectById = new Map(graph.projects.map((project) => [project.id, project]));
    const groupById = new Map(graph.groups.map((group) => [group.id, group]));
    const unitById = new Map(graph.workUnits.map((unit) => [unit.id, unit]));
    const evidenceById = new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));

    for (const [index, group] of graph.groups.entries()) {
      if (!projectById.has(group.projectId)) {
        context.addIssue({
          code: "custom",
          message: "Group refers to a missing project.",
          path: ["groups", index, "projectId"],
        });
      }
      if (group.parentGroupId !== null) {
        const parent = groupById.get(group.parentGroupId);
        if (parent === undefined) {
          context.addIssue({
            code: "custom",
            message: "Group refers to a missing parent group.",
            path: ["groups", index, "parentGroupId"],
          });
        } else if (parent.projectId !== group.projectId) {
          context.addIssue({
            code: "custom",
            message: "A group and its parent must belong to the same project.",
            path: ["groups", index, "parentGroupId"],
          });
        }
      }
    }

    const groupCycle = findParentCycle(
      graph.groups.map((group) => group.id),
      (id) => groupById.get(id)?.parentGroupId,
    );
    if (groupCycle !== null) {
      context.addIssue({
        code: "custom",
        message: `Group hierarchy contains a cycle involving ${groupCycle}.`,
        path: ["groups"],
      });
    }

    for (const [index, unit] of graph.workUnits.entries()) {
      if (!projectById.has(unit.projectId)) {
        context.addIssue({
          code: "custom",
          message: "Work unit refers to a missing project.",
          path: ["workUnits", index, "projectId"],
        });
      }

      if (unit.groupId !== null) {
        const group = groupById.get(unit.groupId);
        if (group === undefined) {
          context.addIssue({
            code: "custom",
            message: "Work unit refers to a missing group.",
            path: ["workUnits", index, "groupId"],
          });
        } else if (group.projectId !== unit.projectId) {
          context.addIssue({
            code: "custom",
            message: "A work unit and its group must belong to the same project.",
            path: ["workUnits", index, "groupId"],
          });
        }
      }

      if (unit.parentId !== null) {
        const parent = unitById.get(unit.parentId);
        if (parent === undefined) {
          context.addIssue({
            code: "custom",
            message: "Work unit refers to a missing parent.",
            path: ["workUnits", index, "parentId"],
          });
        } else if (parent.projectId !== unit.projectId) {
          context.addIssue({
            code: "custom",
            message: "A work unit and its parent must belong to the same project.",
            path: ["workUnits", index, "parentId"],
          });
        }
      }

      for (const [evidenceIndex, evidenceId] of unit.evidenceIds.entries()) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence === undefined || evidence.workUnitId !== unit.id) {
          context.addIssue({
            code: "custom",
            message: "Work unit evidence reference is missing or belongs to another unit.",
            path: ["workUnits", index, "evidenceIds", evidenceIndex],
          });
        }
      }

      for (const [evidenceIndex, evidenceId] of unit.context.acceptedEvidenceIds.entries()) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence === undefined || evidence.workUnitId !== unit.id) {
          context.addIssue({
            code: "custom",
            message: "Accepted context evidence is missing or belongs to another unit.",
            path: ["workUnits", index, "context", "acceptedEvidenceIds", evidenceIndex],
          });
        }
      }
    }

    const unitCycle = findParentCycle(
      graph.workUnits.map((unit) => unit.id),
      (id) => unitById.get(id)?.parentId,
    );
    if (unitCycle !== null) {
      context.addIssue({
        code: "custom",
        message: `Work-unit hierarchy contains a cycle involving ${unitCycle}.`,
        path: ["workUnits"],
      });
    }

    for (const [index, relation] of graph.relations.entries()) {
      if (!unitById.has(relation.sourceId) || !unitById.has(relation.targetId)) {
        context.addIssue({
          code: "custom",
          message: "Relation refers to a missing work unit.",
          path: ["relations", index],
        });
      }
      if (relation.sourceId === relation.targetId) {
        context.addIssue({
          code: "custom",
          message: "A relation cannot point to the same work unit.",
          path: ["relations", index],
        });
      }
    }

    for (const [index, evidence] of graph.evidence.entries()) {
      if (!unitById.has(evidence.workUnitId)) {
        context.addIssue({
          code: "custom",
          message: "Evidence refers to a missing work unit.",
          path: ["evidence", index, "workUnitId"],
        });
      }
    }
  });

export const SyntheticWorkGraphDocumentSchema = WorkGraphDocumentSchema.safeExtend({
  synthetic: z.literal(true),
});

export const PageInputSchema = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export const ListWorkUnitsInputSchema = PageInputSchema.extend({
  projectId: StableIdSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  outcome: OutcomeSchema.optional(),
}).strict();

export const SearchWorkUnitsInputSchema = PageInputSchema.extend({
  query: z.string().trim().min(1).max(240),
  projectId: StableIdSchema.optional(),
}).strict();

export const GetWorkUnitInputSchema = z.object({ id: StableIdSchema }).strict();

export const GetEvidenceInputSchema = z
  .object({
    workUnitId: StableIdSchema,
    evidenceId: StableIdSchema.optional(),
  })
  .strict();

export const LifecycleChangeRequestSchema = z
  .object({
    kind: z.literal("lifecycle_move"),
    workUnitId: StableIdSchema,
    expectedVersion: z.number().int().positive(),
    targetLifecycle: LifecycleSchema,
    targetOutcome: OutcomeSchema.optional(),
    rejectedReason: SummarySchema.optional(),
  })
  .strict();

export const PreviewFixtureChangeInputSchema = LifecycleChangeRequestSchema;

export const ConfirmFixtureChangeInputSchema = LifecycleChangeRequestSchema.extend({
  previewToken: z.string().regex(/^preview:[a-f0-9]{64}$/),
  confirmation: z.literal(FIXTURE_CONFIRMATION),
  idempotencyKey: StableIdSchema,
}).strict();

export const UndoFixtureChangeInputSchema = z
  .object({
    receiptId: StableIdSchema,
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal(FIXTURE_UNDO_CONFIRMATION),
    idempotencyKey: StableIdSchema,
  })
  .strict();

export const ListWorkUnitsResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    graphRevision: z.number().int().positive(),
    items: z.array(WorkUnitSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const GetWorkUnitResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    graphRevision: z.number().int().positive(),
    item: WorkUnitSchema,
    parent: WorkUnitSchema.nullable(),
    children: z.array(WorkUnitSchema),
    relations: z.array(WorkRelationSchema),
  })
  .strict();

export const GetEvidenceResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    graphRevision: z.number().int().positive(),
    items: z.array(EvidenceRecordSchema),
  })
  .strict();

export const WorkUnitChangeStateSchema = z
  .object({
    lifecycle: LifecycleSchema,
    outcome: OutcomeSchema,
    rejectedReason: SummarySchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const ChangePreviewResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    graphRevision: z.number().int().positive(),
    previewToken: z.string().regex(/^preview:[a-f0-9]{64}$/),
    workUnitId: StableIdSchema,
    before: WorkUnitChangeStateSchema,
    after: WorkUnitChangeStateSchema,
    warnings: z.array(z.string().min(1).max(400)),
    requiresConfirmation: z.literal(true),
    reversible: z.literal(true),
  })
  .strict();

export const ChangeReceiptSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    receiptId: StableIdSchema,
    idempotencyKey: StableIdSchema,
    workUnitId: StableIdSchema,
    graphRevision: z.number().int().positive(),
    before: WorkUnitChangeStateSchema,
    after: WorkUnitChangeStateSchema,
    appliedAt: TimestampSchema,
    reversible: z.literal(true),
    undone: z.boolean(),
    provenance: ProvenanceSchema,
  })
  .strict();

export const UndoReceiptSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    receiptId: StableIdSchema,
    revertedReceiptId: StableIdSchema,
    idempotencyKey: StableIdSchema,
    workUnitId: StableIdSchema,
    graphRevision: z.number().int().positive(),
    before: WorkUnitChangeStateSchema,
    after: WorkUnitChangeStateSchema,
    appliedAt: TimestampSchema,
    provenance: ProvenanceSchema,
  })
  .strict();

export const ToolCapabilitySchema = z
  .object({
    name: z.string().min(1).max(120),
    readOnly: z.boolean(),
    destructive: z.boolean(),
    openWorld: z.boolean(),
    requiresPreview: z.boolean(),
    requiresConfirmation: z.boolean(),
    idempotent: z.boolean(),
    reversible: z.boolean(),
  })
  .strict();

export const CapabilitiesResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    mode: z.enum(["fixture", "forge"]),
    synthetic: z.boolean(),
    available: z.boolean(),
    tools: z.array(ToolCapabilitySchema),
    limitations: z.array(z.string().min(1).max(400)),
  })
  .strict();

export const HealthResultSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    mode: z.enum(["fixture", "forge"]),
    status: z.enum(["available", "offline", "unsupported"]),
  })
  .strict();

export const WorkGraphErrorSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string().min(1).max(1_000),
        retryable: z.boolean(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type WorkUnit = z.infer<typeof WorkUnitSchema>;
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type WorkRelation = z.infer<typeof WorkRelationSchema>;
export type WorkGraphDocument = z.infer<typeof WorkGraphDocumentSchema>;
export type SyntheticWorkGraphDocument = z.infer<typeof SyntheticWorkGraphDocumentSchema>;
export type ListWorkUnitsInput = z.input<typeof ListWorkUnitsInputSchema>;
export type SearchWorkUnitsInput = z.input<typeof SearchWorkUnitsInputSchema>;
export type GetEvidenceInput = z.input<typeof GetEvidenceInputSchema>;
export type LifecycleChangeRequest = z.infer<typeof LifecycleChangeRequestSchema>;
export type ConfirmFixtureChangeInput = z.infer<typeof ConfirmFixtureChangeInputSchema>;
export type UndoFixtureChangeInput = z.infer<typeof UndoFixtureChangeInputSchema>;
export type ListWorkUnitsResult = z.infer<typeof ListWorkUnitsResultSchema>;
export type GetWorkUnitResult = z.infer<typeof GetWorkUnitResultSchema>;
export type GetEvidenceResult = z.infer<typeof GetEvidenceResultSchema>;
export type ChangePreviewResult = z.infer<typeof ChangePreviewResultSchema>;
export type ChangeReceipt = z.infer<typeof ChangeReceiptSchema>;
export type UndoReceipt = z.infer<typeof UndoReceiptSchema>;
export type CapabilitiesResult = z.infer<typeof CapabilitiesResultSchema>;
export type HealthResult = z.infer<typeof HealthResultSchema>;
export type WorkGraphErrorData = z.infer<typeof WorkGraphErrorSchema>;
