import {
  CONTRACT_VERSION,
  WorkUnitSchema,
  type CapabilitiesResult,
  type ChangePreviewResult,
  type ChangeReceipt,
  type ConfirmFixtureChangeInput,
  type GetEvidenceInput,
  type GetEvidenceResult,
  type GetWorkUnitResult,
  type HealthResult,
  type LifecycleChangeRequest,
  type ListWorkUnitsInput,
  type ListWorkUnitsResult,
  type SearchWorkUnitsInput,
  type UndoFixtureChangeInput,
  type UndoReceipt,
  type WorkUnit,
} from "@threadwake/contracts";
import { z } from "zod";

import { WorkGraphError } from "./errors.js";
import type { WorkGraphRepository } from "./store.js";
import { TOOL_CAPABILITIES } from "./tool-catalog.js";

export const ForgeFixtureRecordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    groupId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
    parentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
    kind: z.enum(["goal", "task", "investigation", "decision"]),
    title: z.string().min(1).max(240),
    summary: z.string().min(1).max(1_000),
    lifecycle: z.enum(["planned", "ready", "in_progress", "blocked", "done"]),
    outcome: z.enum(["pending", "succeeded", "rejected", "cancelled", "failed"]),
    rejectedReason: z.string().min(1).max(1_000).nullable(),
    evidenceIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    context: z.object({
      objective: z.string().min(1).max(4_000),
      constraints: z.array(z.string().min(1).max(4_000)),
      acceptedEvidenceIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
      nextAction: z.string().min(1).max(4_000),
    }),
    sortOrder: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime({ offset: true }),
    sourceRevision: z.string().min(1).max(128),
  })
  .strict();

export type ForgeFixtureRecord = z.infer<typeof ForgeFixtureRecordSchema>;

export const mapForgeFixtureRecord = (value: unknown): WorkUnit => {
  const record = ForgeFixtureRecordSchema.parse(value);
  return WorkUnitSchema.parse({
    id: record.id,
    projectId: record.projectId,
    groupId: record.groupId,
    parentId: record.parentId,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    lifecycle: record.lifecycle,
    outcome: record.outcome,
    rejectedReason: record.rejectedReason,
    evidenceIds: record.evidenceIds,
    context: record.context,
    sortOrder: record.sortOrder,
    version: record.version,
    updatedAt: record.updatedAt,
    provenance: {
      source: "forge",
      sourceId: record.id,
      revision: record.sourceRevision,
      occurredAt: record.updatedAt,
    },
  });
};

const unsupported = (): never => {
  throw new WorkGraphError(
    "UNSUPPORTED",
    "Forge mode is disabled. This package contains no live Forge input/output implementation.",
  );
};

export class DisabledForgeWorkGraphStore implements WorkGraphRepository {
  capabilities(): CapabilitiesResult {
    return {
      contractVersion: CONTRACT_VERSION,
      mode: "forge",
      synthetic: false,
      available: false,
      tools: structuredClone(TOOL_CAPABILITIES),
      limitations: [
        "Forge mode is a disabled adapter boundary.",
        "Only fixture-shaped mapping validation is implemented.",
        "No Forge service or user data is read or written.",
      ],
    };
  }

  health(): HealthResult {
    return {
      contractVersion: CONTRACT_VERSION,
      mode: "forge",
      status: "unsupported",
    };
  }

  listWorkUnits(_input: ListWorkUnitsInput): ListWorkUnitsResult {
    return unsupported();
  }

  getWorkUnit(_id: string): GetWorkUnitResult {
    return unsupported();
  }

  searchWorkUnits(_input: SearchWorkUnitsInput): ListWorkUnitsResult {
    return unsupported();
  }

  getEvidence(_input: GetEvidenceInput): GetEvidenceResult {
    return unsupported();
  }

  previewFixtureChange(_input: LifecycleChangeRequest): ChangePreviewResult {
    return unsupported();
  }

  confirmFixtureChange(_input: ConfirmFixtureChangeInput): ChangeReceipt {
    return unsupported();
  }

  undoFixtureChange(_input: UndoFixtureChangeInput): UndoReceipt {
    return unsupported();
  }
}
