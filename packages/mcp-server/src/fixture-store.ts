import { createHash, createHmac, randomBytes } from "node:crypto";

import {
  CONTRACT_VERSION,
  ChangePreviewResultSchema,
  ChangeReceiptSchema,
  ConfirmFixtureChangeInputSchema,
  GetEvidenceInputSchema,
  LifecycleChangeRequestSchema,
  ListWorkUnitsInputSchema,
  SearchWorkUnitsInputSchema,
  SyntheticWorkGraphDocumentSchema,
  UndoFixtureChangeInputSchema,
  UndoReceiptSchema,
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
  type WorkGraphDocument,
  type WorkUnit,
} from "@threadwake/contracts";

import { WorkGraphError } from "./errors.js";
import { createSyntheticWorkGraphFixture } from "./fixture.js";
import type { WorkGraphRepository } from "./store.js";
import { TOOL_CAPABILITIES } from "./tool-catalog.js";

const CURSOR_PATTERN = /^cursor-v1-(\d+)-(\d+)$/;
const FIXTURE_TIME_ORIGIN = Date.parse("2026-01-01T00:00:00.000Z");

const ALLOWED_TRANSITIONS: Readonly<Record<WorkUnit["lifecycle"], readonly WorkUnit["lifecycle"][]>> = {
  planned: ["ready"],
  ready: ["in_progress", "blocked"],
  in_progress: ["blocked", "done"],
  blocked: ["ready", "in_progress", "done"],
  done: [],
};

type StoredChangeReceipt = ChangeReceipt & {
  beforeUnit: WorkUnit;
};

type IdempotentResult =
  | { kind: "change"; signature: string; result: ChangeReceipt }
  | { kind: "undo"; signature: string; result: UndoReceipt };

type IssuedPreview = {
  graphRevision: number;
  requestSignature: string;
  workUnitId: string;
  expectedVersion: number;
};

export interface FixtureStoreOptions {
  authorized?: boolean;
  online?: boolean;
  graph?: WorkGraphDocument;
}

const clone = <T>(value: T): T => structuredClone(value);

const stateFromUnit = (unit: WorkUnit) => ({
  lifecycle: unit.lifecycle,
  outcome: unit.outcome,
  rejectedReason: unit.rejectedReason,
  version: unit.version,
});

const hashCanonical = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const lifecycleRequestFromConfirmation = (
  request: ConfirmFixtureChangeInput,
): LifecycleChangeRequest => ({
  kind: request.kind,
  workUnitId: request.workUnitId,
  expectedVersion: request.expectedVersion,
  targetLifecycle: request.targetLifecycle,
  ...(request.targetOutcome === undefined ? {} : { targetOutcome: request.targetOutcome }),
  ...(request.rejectedReason === undefined ? {} : { rejectedReason: request.rejectedReason }),
});

export class FixtureWorkGraphStore implements WorkGraphRepository {
  readonly #authorized: boolean;
  readonly #online: boolean;
  readonly #receipts = new Map<string, StoredChangeReceipt>();
  readonly #latestReceiptByUnit = new Map<string, string>();
  readonly #idempotency = new Map<string, IdempotentResult>();
  readonly #issuedPreviews = new Map<string, IssuedPreview>();
  readonly #previewSecret = randomBytes(32);
  #clockSequence = 0;
  #receiptSequence = 0;
  #graph: WorkGraphDocument;

  constructor(options: FixtureStoreOptions = {}) {
    this.#authorized = options.authorized ?? true;
    this.#online = options.online ?? true;
    this.#graph = SyntheticWorkGraphDocumentSchema.parse(
      clone(options.graph ?? createSyntheticWorkGraphFixture()),
    );
  }

  capabilities(): CapabilitiesResult {
    const limitations = [
      "All records are labelled synthetic and are held in memory.",
      "Fixture changes reset when the server process exits.",
      "Live Forge input/output and hosted authentication are not implemented.",
    ];

    if (!this.#online) {
      limitations.push("The fixture store is currently configured offline.");
    }
    if (!this.#authorized) {
      limitations.push("Fixture data access is denied by the current test authorization policy.");
    }

    return {
      contractVersion: CONTRACT_VERSION,
      mode: "fixture",
      synthetic: true,
      available: this.#online && this.#authorized,
      tools: clone(TOOL_CAPABILITIES),
      limitations,
    };
  }

  health(): HealthResult {
    return {
      contractVersion: CONTRACT_VERSION,
      mode: "fixture",
      status: this.#online ? "available" : "offline",
    };
  }

  listWorkUnits(input: ListWorkUnitsInput): ListWorkUnitsResult {
    this.#assertReadable();
    const query = ListWorkUnitsInputSchema.parse(input);
    const items = this.#orderedUnits().filter(
      (unit) =>
        (query.projectId === undefined || unit.projectId === query.projectId) &&
        (query.lifecycle === undefined || unit.lifecycle === query.lifecycle) &&
        (query.outcome === undefined || unit.outcome === query.outcome),
    );

    return this.#page(items, query.cursor, query.limit);
  }

  getWorkUnit(id: string): GetWorkUnitResult {
    this.#assertReadable();
    const item = this.#graph.workUnits.find((unit) => unit.id === id);
    if (item === undefined) {
      throw new WorkGraphError("NOT_FOUND", "No work unit has the requested stable identifier.", {
        details: { id },
      });
    }

    const parent =
      item.parentId === null
        ? null
        : (this.#graph.workUnits.find((unit) => unit.id === item.parentId) ?? null);
    const children = this.#orderedUnits().filter((unit) => unit.parentId === item.id);
    const relations = this.#graph.relations
      .filter((relation) => relation.sourceId === item.id || relation.targetId === item.id)
      .toSorted((left, right) => left.id.localeCompare(right.id));

    return clone({
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      item,
      parent,
      children,
      relations,
    });
  }

  searchWorkUnits(input: SearchWorkUnitsInput): ListWorkUnitsResult {
    this.#assertReadable();
    const query = SearchWorkUnitsInputSchema.parse(input);
    const needle = query.query.toLocaleLowerCase("en-US");
    const items = this.#orderedUnits().filter((unit) => {
      if (query.projectId !== undefined && unit.projectId !== query.projectId) {
        return false;
      }

      const searchable = [
        unit.id,
        unit.title,
        unit.summary,
        unit.rejectedReason ?? "",
        unit.context.objective,
        unit.context.nextAction,
        ...unit.context.constraints,
      ]
        .join("\n")
        .toLocaleLowerCase("en-US");

      return searchable.includes(needle);
    });

    return this.#page(items, query.cursor, query.limit);
  }

  getEvidence(input: GetEvidenceInput): GetEvidenceResult {
    this.#assertReadable();
    const query = GetEvidenceInputSchema.parse(input);
    this.getWorkUnit(query.workUnitId);

    const items = this.#graph.evidence
      .filter(
        (evidence) =>
          evidence.workUnitId === query.workUnitId &&
          (query.evidenceId === undefined || evidence.id === query.evidenceId),
      )
      .toSorted((left, right) => left.id.localeCompare(right.id));

    if (query.evidenceId !== undefined && items.length === 0) {
      throw new WorkGraphError(
        "NOT_FOUND",
        "The requested evidence does not exist on the specified work unit.",
        { details: { evidenceId: query.evidenceId, workUnitId: query.workUnitId } },
      );
    }

    return clone({
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      items,
    });
  }

  previewFixtureChange(input: LifecycleChangeRequest): ChangePreviewResult {
    this.#assertWritable();
    const request = LifecycleChangeRequestSchema.parse(input);
    const unit = this.#requireVersion(request.workUnitId, request.expectedVersion);
    const after = this.#nextState(unit, request);
    const previewPayload = {
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      request,
      before: stateFromUnit(unit),
      after,
    };

    const previewToken = this.#previewToken(previewPayload);
    this.#issuedPreviews.set(previewToken, {
      graphRevision: this.#graph.graphRevision,
      requestSignature: hashCanonical(request),
      workUnitId: request.workUnitId,
      expectedVersion: request.expectedVersion,
    });

    return ChangePreviewResultSchema.parse({
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      previewToken,
      workUnitId: unit.id,
      before: stateFromUnit(unit),
      after,
      warnings: [
        "This changes only the in-memory synthetic fixture.",
        "The change is not applied until the confirmed write tool receives this exact preview token.",
      ],
      requiresConfirmation: true,
      reversible: true,
    });
  }

  confirmFixtureChange(input: ConfirmFixtureChangeInput): ChangeReceipt {
    this.#assertWritable();
    const request = ConfirmFixtureChangeInputSchema.parse(input);
    const signature = hashCanonical(request);
    const replay = this.#idempotency.get(request.idempotencyKey);
    if (replay !== undefined) {
      if (replay.kind !== "change" || replay.signature !== signature) {
        throw new WorkGraphError(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for a different operation.",
        );
      }
      return clone(replay.result);
    }

    const lifecycleRequest = lifecycleRequestFromConfirmation(request);
    const issuedPreview = this.#issuedPreviews.get(request.previewToken);
    if (issuedPreview === undefined) {
      throw new WorkGraphError(
        "CONFIRMATION_REQUIRED",
        "Call the preview tool before confirming this exact fixture change.",
      );
    }
    if (
      issuedPreview.graphRevision !== this.#graph.graphRevision ||
      issuedPreview.requestSignature !== hashCanonical(lifecycleRequest) ||
      issuedPreview.workUnitId !== request.workUnitId ||
      issuedPreview.expectedVersion !== request.expectedVersion
    ) {
      throw new WorkGraphError(
        "CONFLICT",
        "The issued preview does not match the current graph state and requested change.",
        { retryable: true },
      );
    }

    const current = this.#requireVersion(request.workUnitId, request.expectedVersion);
    const beforeUnit = clone(current);
    const nextState = this.#nextState(current, request);
    const previewPayload = {
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      request: lifecycleRequest,
      before: stateFromUnit(current),
      after: nextState,
    };
    if (this.#previewToken(previewPayload) !== request.previewToken) {
      throw new WorkGraphError(
        "CONFLICT",
        "The preview token does not match the current graph state and requested change.",
        { retryable: true },
      );
    }
    const receiptId = this.#nextReceiptId("fixture-change");
    const appliedAt = this.#nextTimestamp();
    const nextGraphRevision = this.#graph.graphRevision + 1;
    const updatedUnit: WorkUnit = {
      ...current,
      lifecycle: nextState.lifecycle,
      outcome: nextState.outcome,
      rejectedReason: nextState.rejectedReason,
      version: nextState.version,
      updatedAt: appliedAt,
      provenance: {
        source: "fixture",
        sourceId: receiptId,
        revision: `graph-revision-${nextGraphRevision}`,
        occurredAt: appliedAt,
      },
    };

    this.#replaceUnit(updatedUnit, nextGraphRevision);
    const receipt = ChangeReceiptSchema.parse({
      contractVersion: CONTRACT_VERSION,
      receiptId,
      idempotencyKey: request.idempotencyKey,
      workUnitId: current.id,
      graphRevision: this.#graph.graphRevision,
      before: stateFromUnit(beforeUnit),
      after: stateFromUnit(updatedUnit),
      appliedAt,
      reversible: true,
      undone: false,
      provenance: updatedUnit.provenance,
    });

    this.#receipts.set(receiptId, { ...clone(receipt), beforeUnit });
    this.#latestReceiptByUnit.set(current.id, receiptId);
    this.#idempotency.set(request.idempotencyKey, {
      kind: "change",
      signature,
      result: clone(receipt),
    });

    return clone(receipt);
  }

  undoFixtureChange(input: UndoFixtureChangeInput): UndoReceipt {
    this.#assertWritable();
    const request = UndoFixtureChangeInputSchema.parse(input);
    const signature = hashCanonical(request);
    const replay = this.#idempotency.get(request.idempotencyKey);
    if (replay !== undefined) {
      if (replay.kind !== "undo" || replay.signature !== signature) {
        throw new WorkGraphError(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for a different operation.",
        );
      }
      return clone(replay.result);
    }

    const original = this.#receipts.get(request.receiptId);
    if (original === undefined) {
      throw new WorkGraphError("NOT_FOUND", "No reversible fixture receipt has this identifier.");
    }
    if (original.undone) {
      throw new WorkGraphError("CONFLICT", "This fixture change has already been undone.");
    }
    if (this.#latestReceiptByUnit.get(original.workUnitId) !== original.receiptId) {
      throw new WorkGraphError(
        "CONFLICT",
        "Undo is unsafe because a later change exists on the same work unit.",
      );
    }

    const current = this.#requireVersion(original.workUnitId, request.expectedVersion);
    if (current.version !== original.after.version) {
      throw new WorkGraphError(
        "CONFLICT",
        "Undo is unsafe because the work unit no longer matches the applied change.",
        { retryable: true },
      );
    }

    const undoReceiptId = this.#nextReceiptId("fixture-undo");
    const appliedAt = this.#nextTimestamp();
    const nextGraphRevision = this.#graph.graphRevision + 1;
    const restoredUnit: WorkUnit = {
      ...original.beforeUnit,
      version: current.version + 1,
      updatedAt: appliedAt,
      provenance: {
        source: "fixture",
        sourceId: undoReceiptId,
        revision: `graph-revision-${nextGraphRevision}`,
        occurredAt: appliedAt,
      },
    };

    this.#replaceUnit(restoredUnit, nextGraphRevision);
    this.#receipts.set(original.receiptId, { ...original, undone: true });
    this.#latestReceiptByUnit.delete(original.workUnitId);

    const receipt = UndoReceiptSchema.parse({
      contractVersion: CONTRACT_VERSION,
      receiptId: undoReceiptId,
      revertedReceiptId: original.receiptId,
      idempotencyKey: request.idempotencyKey,
      workUnitId: original.workUnitId,
      graphRevision: this.#graph.graphRevision,
      before: stateFromUnit(current),
      after: stateFromUnit(restoredUnit),
      appliedAt,
      provenance: restoredUnit.provenance,
    });

    this.#idempotency.set(request.idempotencyKey, {
      kind: "undo",
      signature,
      result: clone(receipt),
    });

    return clone(receipt);
  }

  #assertReadable() {
    if (!this.#online) {
      throw new WorkGraphError("OFFLINE", "The fixture store is offline.", { retryable: true });
    }
    if (!this.#authorized) {
      throw new WorkGraphError("UNAUTHORIZED", "The current fixture policy denies data access.");
    }
  }

  #assertWritable() {
    this.#assertReadable();
  }

  #nextState(unit: WorkUnit, request: LifecycleChangeRequest) {
    if (!ALLOWED_TRANSITIONS[unit.lifecycle].includes(request.targetLifecycle)) {
      throw new WorkGraphError(
        "UNSUPPORTED",
        `The fixture does not support a transition from ${unit.lifecycle} to ${request.targetLifecycle}.`,
      );
    }

    if (request.targetLifecycle === "done") {
      if (request.targetOutcome === undefined || request.targetOutcome === "pending") {
        throw new WorkGraphError(
          "INVALID_ARGUMENT",
          "A transition to done requires an explicit non-pending targetOutcome.",
        );
      }
      if (request.targetOutcome === "rejected" && request.rejectedReason === undefined) {
        throw new WorkGraphError(
          "INVALID_ARGUMENT",
          "A rejected target outcome requires a rejectedReason.",
        );
      }
      if (request.targetOutcome !== "rejected" && request.rejectedReason !== undefined) {
        throw new WorkGraphError(
          "INVALID_ARGUMENT",
          "rejectedReason is valid only for a rejected target outcome.",
        );
      }
    } else if (
      (request.targetOutcome !== undefined && request.targetOutcome !== "pending") ||
      request.rejectedReason !== undefined
    ) {
      throw new WorkGraphError(
        "INVALID_ARGUMENT",
        "An unfinished target lifecycle must keep its outcome pending and cannot set rejectedReason.",
      );
    }

    return {
      lifecycle: request.targetLifecycle,
      outcome: request.targetLifecycle === "done" ? (request.targetOutcome ?? "failed") : "pending",
      rejectedReason:
        request.targetLifecycle === "done" && request.targetOutcome === "rejected"
          ? (request.rejectedReason ?? null)
          : null,
      version: unit.version + 1,
    } as const;
  }

  #requireVersion(workUnitId: string, expectedVersion: number): WorkUnit {
    const unit = this.#graph.workUnits.find((candidate) => candidate.id === workUnitId);
    if (unit === undefined) {
      throw new WorkGraphError("NOT_FOUND", "No work unit has the requested stable identifier.", {
        details: { workUnitId },
      });
    }
    if (unit.version !== expectedVersion) {
      throw new WorkGraphError(
        "CONFLICT",
        "The work unit changed after the caller read it.",
        {
          retryable: true,
          details: { expectedVersion, actualVersion: unit.version, workUnitId },
        },
      );
    }
    return unit;
  }

  #orderedUnits() {
    return this.#graph.workUnits.toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );
  }

  #page(items: WorkUnit[], cursor: string | undefined, limit: number): ListWorkUnitsResult {
    const offset = this.#cursorOffset(cursor);
    const pageItems = items.slice(offset, offset + limit);
    const nextOffset = offset + pageItems.length;

    return clone({
      contractVersion: CONTRACT_VERSION,
      graphRevision: this.#graph.graphRevision,
      items: pageItems,
      nextCursor:
        nextOffset < items.length
          ? `cursor-v1-${this.#graph.graphRevision}-${nextOffset}`
          : null,
      total: items.length,
    });
  }

  #cursorOffset(cursor: string | undefined) {
    if (cursor === undefined) {
      return 0;
    }
    const match = CURSOR_PATTERN.exec(cursor);
    if (match === null) {
      throw new WorkGraphError("INVALID_ARGUMENT", "The pagination cursor is malformed.");
    }

    const revision = Number(match[1]);
    const offset = Number(match[2]);
    if (revision !== this.#graph.graphRevision) {
      throw new WorkGraphError(
        "CONFLICT",
        "The pagination cursor belongs to an older graph revision.",
        { retryable: true },
      );
    }
    return offset;
  }

  #replaceUnit(unit: WorkUnit, graphRevision: number) {
    const nextUnits = this.#graph.workUnits.map((candidate) =>
      candidate.id === unit.id ? unit : candidate,
    );
    this.#graph = SyntheticWorkGraphDocumentSchema.parse({
      ...this.#graph,
      graphRevision,
      workUnits: nextUnits,
    });
    this.#issuedPreviews.clear();
  }

  #previewToken(payload: unknown) {
    return `preview:${createHmac("sha256", this.#previewSecret)
      .update(JSON.stringify(payload))
      .digest("hex")}`;
  }

  #nextTimestamp() {
    this.#clockSequence += 1;
    return new Date(FIXTURE_TIME_ORIGIN + this.#clockSequence * 60_000).toISOString();
  }

  #nextReceiptId(prefix: "fixture-change" | "fixture-undo") {
    this.#receiptSequence += 1;
    return `${prefix}-${this.#receiptSequence.toString().padStart(4, "0")}`;
  }
}
