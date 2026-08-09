export const CONTRACT_VERSION = "1.0.0" as const;

export const WORK_UNIT_KINDS = [
  "goal",
  "task",
  "investigation",
  "decision",
] as const;

export const LIFECYCLE_STATES = [
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "done",
] as const;

export const OUTCOMES = [
  "pending",
  "succeeded",
  "rejected",
  "cancelled",
  "failed",
] as const;

export const EVIDENCE_KINDS = [
  "assertion",
  "artifact",
  "decision",
  "test_receipt",
] as const;

export const PROVENANCE_SOURCES = [
  "fixture",
  "forge",
  "import",
  "user",
] as const;

export const RELATION_KINDS = [
  "blocks",
  "depends_on",
  "related_to",
] as const;

export const ERROR_CODES = [
  "CONFIRMATION_REQUIRED",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL",
  "INVALID_ARGUMENT",
  "NOT_FOUND",
  "OFFLINE",
  "UNAUTHORIZED",
  "UNSUPPORTED",
] as const;

export const FIXTURE_CONFIRMATION = "confirm_fixture_write" as const;
export const FIXTURE_UNDO_CONFIRMATION = "confirm_fixture_undo" as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
