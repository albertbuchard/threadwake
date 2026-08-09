/**
 * Pure contract for linking canonical Threadwake work to captured Codex messages.
 *
 * This module intentionally performs no navigation, storage, rendering, network, or
 * host calls. Raw Codex identities stay in the private snapshot and in explicit
 * in-memory host/copy payloads; ordinary URL state uses only opaque fixture-local IDs.
 */

export const CODEX_TASK_LINK_SCHEMA_VERSION = "threadwake-codex-task-links/v1" as const;
export const CODEX_TASK_LINK_ROUTE_VERSION = "1" as const;

export const WORK_MESSAGE_RELATIONSHIPS = [
  "originated-in",
  "decided-in",
  "implemented-in",
  "validated-in",
  "blocked-in",
  "discussed-in",
] as const;

export const PRIMARY_WORK_MESSAGE_RELATIONSHIPS = [
  "originated-in",
  "decided-in",
  "implemented-in",
  "validated-in",
  "blocked-in",
] as const;

export const CODEX_MESSAGE_ROLES = ["user", "assistant", "system", "developer", "tool"] as const;
export const CODEX_MESSAGE_AVAILABILITIES = [
  "available",
  "stale",
  "archived",
  "permission-denied",
  "deleted",
  "unavailable",
] as const;

export type WorkMessageRelationship = (typeof WORK_MESSAGE_RELATIONSHIPS)[number];
export type PrimaryWorkMessageRelationship = (typeof PRIMARY_WORK_MESSAGE_RELATIONSHIPS)[number];
export type CodexMessageRole = (typeof CODEX_MESSAGE_ROLES)[number];
export type CodexMessageAvailability = (typeof CODEX_MESSAGE_AVAILABILITIES)[number];
export type ThreadwakeSourceSurface = "graph" | "kanban" | "list";

export interface CodexCaptureSource {
  tool: string;
  operation: "read-only-thread-inspection";
  observedAt: string;
  identityScope: "source-exposed" | "capture-local";
}

export interface CodexTaskReference {
  /** Opaque fixture-local task identity used by the demo. */
  id: string;
  /** Private raw Codex task/thread identity. */
  threadId: string;
  hostId: string | null;
  title: string;
  kind: "codex-task";
  capturedStatus: "active" | "archived" | "unknown";
  capturedAt: string;
  sourceUpdatedAt: string | null;
}

export interface CodexMessageReference {
  /** Opaque fixture-local message identity; the only message identity allowed in URLs. */
  id: string;
  taskReferenceId: string;
  /** Private raw Codex identities. */
  threadId: string;
  turnId: string;
  itemId: string;
  role: CodexMessageRole;
  messageTimestamp: string | null;
  capturedAt: string;
  excerpt: string | null;
  excerptSha256: string | null;
  captureSource: CodexCaptureSource;
  availability: CodexMessageAvailability;
  replacementReason: string | null;
}

export interface WorkMessageLink {
  id: string;
  nodeId: string;
  messageReferenceId: string;
  relationship: WorkMessageRelationship;
  primary: boolean;
  explanation: string;
}

export interface CodexTaskLinkPrivacy {
  classification: "private-owner-only";
  containsConversationDerivedData: true;
  publicExportAllowed: false;
}

export interface CodexTaskLinkSnapshot {
  schemaVersion: typeof CODEX_TASK_LINK_SCHEMA_VERSION;
  fixtureId: string;
  capturedAt: string;
  tasks: CodexTaskReference[];
  messages: CodexMessageReference[];
  links: WorkMessageLink[];
  privacy: CodexTaskLinkPrivacy;
  /** SHA-256 of the canonical snapshot with this field omitted. */
  snapshotSha256: string;
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

declare const verifiedSnapshotBrand: unique symbol;
export type VerifiedCodexTaskLinkSnapshot = DeepReadonly<CodexTaskLinkSnapshot> & {
  readonly [verifiedSnapshotBrand]: true;
};

export type CodexTaskLinkIssueCode =
  | "invalid-type"
  | "unknown-field"
  | "missing-field"
  | "invalid-value"
  | "duplicate-identity"
  | "missing-reference"
  | "identity-mismatch"
  | "correspondence-mismatch"
  | "primary-link-mismatch"
  | "private-identity-leak"
  | "digest-mismatch";

export interface CodexTaskLinkValidationIssue {
  code: CodexTaskLinkIssueCode;
  path: string;
  message: string;
}

export type CodexTaskLinkParseResult =
  | { ok: true; value: CodexTaskLinkSnapshot }
  | { ok: false; issues: CodexTaskLinkValidationIssue[] };

export interface ParseCodexTaskLinkSnapshotOptions {
  /** The complete immutable canonical work-node identity set for this fixture. */
  canonicalNodeIds: readonly string[];
}

export type CodexTaskLinkDigestVerification =
  | {
      ok: true;
      value: VerifiedCodexTaskLinkSnapshot;
      issues: CodexTaskLinkValidationIssue[];
      verifiedMessageCount: number;
      snapshotDigest: string;
    }
  | {
      ok: false;
      issues: CodexTaskLinkValidationIssue[];
      verifiedMessageCount: number;
      snapshotDigest: string | null;
    };

export interface ResolvedWorkMessageLink {
  link: DeepReadonly<WorkMessageLink>;
  message: DeepReadonly<CodexMessageReference>;
  task: DeepReadonly<CodexTaskReference>;
}

export type CodexTaskLinkResolution =
  | { ok: true; value: ResolvedWorkMessageLink }
  | {
      ok: false;
      reason: "missing-node-link" | "missing-message" | "missing-task" | "unavailable-message";
      message: string;
    };

export interface CodexMessageNavigationTarget {
  shell: "codex";
  sourceReferenceId: string;
  nodeId: string;
  returnSurface: ThreadwakeSourceSurface;
  returnContextId: string;
  /** Private in-memory identities; never serialize this object into a URL or history. */
  taskReferenceId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  messageLevelSupport: "internal-demo-only";
  nativeHostOpenScope: "task-only";
}

export interface CodexTaskLinkRouteState {
  routeVersion: typeof CODEX_TASK_LINK_ROUTE_VERSION;
  shell: "codex" | "threadwake";
  sourceReferenceId: string | null;
  nodeId: string | null;
  returnSurface: ThreadwakeSourceSurface | null;
  returnContextId: string | null;
}

export type CodexTaskLinkRouteParseResult =
  | { ok: true; value: CodexTaskLinkRouteState }
  | { ok: false; issues: CodexTaskLinkValidationIssue[] };

export interface CodexNativeTaskOpenRequest {
  transport: "host-native-task-navigation";
  scope: "task-only";
  threadId: string;
  hostId: string | null;
  exactMessageSupported: false;
  label: "Open task in Codex";
}

export interface PrivateCodexReferenceCopyPayload {
  classification: "private-owner-only";
  label: "Copy private Codex task/message reference";
  warning: string;
  value: string;
}

type JsonRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const OPAQUE_REFERENCE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+){1,15}$/;
const FORBIDDEN_TEXT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u;
const FORBIDDEN_PRIVATE_ROUTE_KEYS = new Set([
  "task",
  "thread",
  "threadid",
  "turn",
  "turnid",
  "message",
  "messageid",
  "item",
  "itemid",
  "excerpt",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: CodexTaskLinkValidationIssue[],
  code: CodexTaskLinkIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function validateExactKeys(
  value: JsonRecord,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  issues: CodexTaskLinkValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      addIssue(issues, "unknown-field", `${path}.${key}`, "Unknown fields are not accepted by this schema version.");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      addIssue(issues, "missing-field", `${path}.${key}`, "This field is required.");
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
  options: { min?: number; max: number; pattern?: RegExp; allowControls?: boolean },
): value is string {
  if (typeof value !== "string") {
    addIssue(issues, "invalid-type", path, "Expected a string.");
    return false;
  }
  const min = options.min ?? 1;
  if (value.length < min || value.length > options.max) {
    addIssue(issues, "invalid-value", path, `Expected ${min} to ${options.max} characters.`);
    return false;
  }
  if (!options.allowControls && FORBIDDEN_TEXT_CONTROLS.test(value)) {
    addIssue(issues, "invalid-value", path, "Unsafe control or bidirectional override characters are not allowed.");
    return false;
  }
  if (options.pattern && !options.pattern.test(value)) {
    addIssue(issues, "invalid-value", path, "The value does not match the required format.");
    return false;
  }
  return true;
}

function validateNullableString(
  value: unknown,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
  options: { min?: number; max: number; pattern?: RegExp },
): value is string | null {
  if (value === null) return true;
  return validateString(value, path, issues, options);
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateIsoInstant(
  value: unknown,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
  nullable = false,
): value is string | null {
  if (nullable && value === null) return true;
  if (!isIsoInstant(value)) {
    addIssue(issues, "invalid-value", path, "Expected a canonical UTC ISO-8601 instant.");
    return false;
  }
  return true;
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: CodexTaskLinkValidationIssue[],
): value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    addIssue(issues, "invalid-value", path, `Expected one of: ${allowed.join(", ")}.`);
    return false;
  }
  return true;
}

function validateBooleanLiteral(
  value: unknown,
  expected: boolean,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
): void {
  if (value !== expected) {
    addIssue(issues, "invalid-value", path, `Expected the literal value ${String(expected)}.`);
  }
}

export function isOpaqueCodexReferenceId(value: string): boolean {
  return OPAQUE_REFERENCE_PATTERN.test(value) && value.length <= 96;
}

function validateOpaqueReference(
  value: unknown,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
): value is string {
  if (!validateString(value, path, issues, { max: 96, pattern: OPAQUE_REFERENCE_PATTERN })) return false;
  return true;
}

function validateSourceIdentity(
  value: unknown,
  path: string,
  issues: CodexTaskLinkValidationIssue[],
): value is string {
  return validateString(value, path, issues, { min: 4, max: 256, pattern: SAFE_SOURCE_ID_PATTERN });
}

function validateTask(value: unknown, index: number, issues: CodexTaskLinkValidationIssue[]): void {
  const path = `$.tasks[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, "invalid-type", path, "Expected a task object.");
    return;
  }
  const keys = ["id", "threadId", "hostId", "title", "kind", "capturedStatus", "capturedAt", "sourceUpdatedAt"];
  validateExactKeys(value, keys, keys, path, issues);
  validateOpaqueReference(value.id, `${path}.id`, issues);
  validateSourceIdentity(value.threadId, `${path}.threadId`, issues);
  validateNullableString(value.hostId, `${path}.hostId`, issues, { min: 4, max: 256, pattern: SAFE_SOURCE_ID_PATTERN });
  validateString(value.title, `${path}.title`, issues, { max: 200 });
  validateEnum(value.kind, ["codex-task"] as const, `${path}.kind`, issues);
  validateEnum(value.capturedStatus, ["active", "archived", "unknown"] as const, `${path}.capturedStatus`, issues);
  validateIsoInstant(value.capturedAt, `${path}.capturedAt`, issues);
  validateIsoInstant(value.sourceUpdatedAt, `${path}.sourceUpdatedAt`, issues, true);
}

function validateCaptureSource(value: unknown, path: string, issues: CodexTaskLinkValidationIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, "invalid-type", path, "Expected a capture-source object.");
    return;
  }
  const keys = ["tool", "operation", "observedAt", "identityScope"];
  validateExactKeys(value, keys, keys, path, issues);
  validateString(value.tool, `${path}.tool`, issues, { max: 120, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/ });
  validateEnum(value.operation, ["read-only-thread-inspection"] as const, `${path}.operation`, issues);
  validateIsoInstant(value.observedAt, `${path}.observedAt`, issues);
  validateEnum(value.identityScope, ["source-exposed", "capture-local"] as const, `${path}.identityScope`, issues);
}

function validateMessage(value: unknown, index: number, issues: CodexTaskLinkValidationIssue[]): void {
  const path = `$.messages[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, "invalid-type", path, "Expected a message object.");
    return;
  }
  const keys = [
    "id", "taskReferenceId", "threadId", "turnId", "itemId", "role", "messageTimestamp",
    "capturedAt", "excerpt", "excerptSha256", "captureSource", "availability", "replacementReason",
  ];
  validateExactKeys(value, keys, keys, path, issues);
  validateOpaqueReference(value.id, `${path}.id`, issues);
  validateOpaqueReference(value.taskReferenceId, `${path}.taskReferenceId`, issues);
  validateSourceIdentity(value.threadId, `${path}.threadId`, issues);
  validateSourceIdentity(value.turnId, `${path}.turnId`, issues);
  validateSourceIdentity(value.itemId, `${path}.itemId`, issues);
  validateEnum(value.role, CODEX_MESSAGE_ROLES, `${path}.role`, issues);
  validateIsoInstant(value.messageTimestamp, `${path}.messageTimestamp`, issues, true);
  validateIsoInstant(value.capturedAt, `${path}.capturedAt`, issues);
  validateNullableString(value.excerpt, `${path}.excerpt`, issues, { max: 2_000 });
  validateNullableString(value.excerptSha256, `${path}.excerptSha256`, issues, { min: 64, max: 64, pattern: SHA256_PATTERN });
  validateCaptureSource(value.captureSource, `${path}.captureSource`, issues);
  const availability = value.availability;
  const availabilityValid = validateEnum(availability, CODEX_MESSAGE_AVAILABILITIES, `${path}.availability`, issues);
  validateNullableString(value.replacementReason, `${path}.replacementReason`, issues, { max: 500 });

  if (availabilityValid) {
    const hasExcerpt = typeof value.excerpt === "string";
    const hasDigest = typeof value.excerptSha256 === "string";
    const hasReason = typeof value.replacementReason === "string";
    if (availability === "available" && (!hasExcerpt || !hasDigest || hasReason)) {
      addIssue(issues, "invalid-value", path, "Available messages require an excerpt and digest and must not have a replacement reason.");
    }
    if (availability === "stale" && (!hasExcerpt || !hasDigest || !hasReason)) {
      addIssue(issues, "invalid-value", path, "Stale messages require the last allowlisted excerpt, digest, and an explicit reason.");
    }
    if (availability !== "available" && availability !== "stale" && (hasExcerpt || hasDigest || !hasReason)) {
      addIssue(issues, "invalid-value", path, "Unavailable messages must omit recovered content and provide a truthful fallback reason.");
    }
  }
}

function validateLink(value: unknown, index: number, issues: CodexTaskLinkValidationIssue[]): void {
  const path = `$.links[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, "invalid-type", path, "Expected a work-message link object.");
    return;
  }
  const keys = ["id", "nodeId", "messageReferenceId", "relationship", "primary", "explanation"];
  validateExactKeys(value, keys, keys, path, issues);
  validateOpaqueReference(value.id, `${path}.id`, issues);
  validateSourceIdentity(value.nodeId, `${path}.nodeId`, issues);
  validateOpaqueReference(value.messageReferenceId, `${path}.messageReferenceId`, issues);
  validateEnum(value.relationship, WORK_MESSAGE_RELATIONSHIPS, `${path}.relationship`, issues);
  if (typeof value.primary !== "boolean") addIssue(issues, "invalid-type", `${path}.primary`, "Expected a boolean.");
  validateString(value.explanation, `${path}.explanation`, issues, { max: 500 });
  if (value.primary === true && value.relationship === "discussed-in") {
    addIssue(issues, "primary-link-mismatch", `${path}.relationship`, "A discussion-only link cannot be a node's primary source.");
  }
}

function validatePrivacy(value: unknown, issues: CodexTaskLinkValidationIssue[]): void {
  const path = "$.privacy";
  if (!isRecord(value)) {
    addIssue(issues, "invalid-type", path, "Expected a privacy object.");
    return;
  }
  const keys = ["classification", "containsConversationDerivedData", "publicExportAllowed"];
  validateExactKeys(value, keys, keys, path, issues);
  validateEnum(value.classification, ["private-owner-only"] as const, `${path}.classification`, issues);
  validateBooleanLiteral(value.containsConversationDerivedData, true, `${path}.containsConversationDerivedData`, issues);
  validateBooleanLiteral(value.publicExportAllowed, false, `${path}.publicExportAllowed`, issues);
}

export function normaliseCodexMessageExcerpt(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  const result: JsonRecord = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalJsonValue(value[key]);
  return result;
}

function compareAsciiOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicaliseCodexTaskLinkSnapshot(snapshot: DeepReadonly<CodexTaskLinkSnapshot>): CodexTaskLinkSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    fixtureId: snapshot.fixtureId,
    capturedAt: snapshot.capturedAt,
    tasks: snapshot.tasks
      .map((task) => ({ ...task }))
      .sort((left, right) => compareAsciiOrdinal(left.id, right.id)),
    messages: snapshot.messages
      .map((message) => ({
        ...message,
        excerpt: message.excerpt === null ? null : normaliseCodexMessageExcerpt(message.excerpt),
        captureSource: { ...message.captureSource },
      }))
      .sort((left, right) => compareAsciiOrdinal(left.id, right.id)),
    links: snapshot.links
      .map((link) => ({ ...link }))
      .sort((left, right) => compareAsciiOrdinal(left.nodeId, right.nodeId)
        || Number(right.primary) - Number(left.primary)
        || compareAsciiOrdinal(left.id, right.id)),
    privacy: { ...snapshot.privacy },
    snapshotSha256: snapshot.snapshotSha256,
  };
}

export async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeCodexTaskLinkSnapshotDigest(snapshot: DeepReadonly<CodexTaskLinkSnapshot>): Promise<string> {
  const canonical = canonicaliseCodexTaskLinkSnapshot(snapshot);
  const unsigned: Omit<CodexTaskLinkSnapshot, "snapshotSha256"> = {
    schemaVersion: canonical.schemaVersion,
    fixtureId: canonical.fixtureId,
    capturedAt: canonical.capturedAt,
    tasks: canonical.tasks,
    messages: canonical.messages,
    links: canonical.links,
    privacy: canonical.privacy,
  };
  return sha256Text(JSON.stringify(canonicalJsonValue(unsigned)));
}

function validateRootShape(input: unknown, issues: CodexTaskLinkValidationIssue[]): input is CodexTaskLinkSnapshot {
  if (!isRecord(input)) {
    addIssue(issues, "invalid-type", "$", "Expected a snapshot object.");
    return false;
  }
  const keys = ["schemaVersion", "fixtureId", "capturedAt", "tasks", "messages", "links", "privacy", "snapshotSha256"];
  validateExactKeys(input, keys, keys, "$", issues);
  validateEnum(input.schemaVersion, [CODEX_TASK_LINK_SCHEMA_VERSION] as const, "$.schemaVersion", issues);
  validateOpaqueReference(input.fixtureId, "$.fixtureId", issues);
  validateIsoInstant(input.capturedAt, "$.capturedAt", issues);
  if (!Array.isArray(input.tasks)) addIssue(issues, "invalid-type", "$.tasks", "Expected an array.");
  else input.tasks.forEach((value, index) => validateTask(value, index, issues));
  if (!Array.isArray(input.messages)) addIssue(issues, "invalid-type", "$.messages", "Expected an array.");
  else input.messages.forEach((value, index) => validateMessage(value, index, issues));
  if (!Array.isArray(input.links)) addIssue(issues, "invalid-type", "$.links", "Expected an array.");
  else input.links.forEach((value, index) => validateLink(value, index, issues));
  validatePrivacy(input.privacy, issues);
  validateString(input.snapshotSha256, "$.snapshotSha256", issues, { min: 64, max: 64, pattern: SHA256_PATTERN });
  return issues.length === 0;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function containsPrivateIdentity(opaqueId: string, privateIds: readonly string[]): boolean {
  const folded = opaqueId.toLowerCase();
  return privateIds.some((id) => id.length > 0 && folded.includes(id.toLowerCase()));
}

export function parseCodexTaskLinkSnapshot(
  input: unknown,
  options: ParseCodexTaskLinkSnapshotOptions,
): CodexTaskLinkParseResult {
  const issues: CodexTaskLinkValidationIssue[] = [];
  const canonicalNodeIds = [...options.canonicalNodeIds];
  for (const [index, nodeId] of canonicalNodeIds.entries()) {
    validateSourceIdentity(nodeId, `options.canonicalNodeIds[${index}]`, issues);
  }
  for (const duplicate of findDuplicates(canonicalNodeIds)) {
    addIssue(issues, "duplicate-identity", "options.canonicalNodeIds", `Duplicate canonical node identity: ${duplicate}.`);
  }
  if (!validateRootShape(input, issues)) return { ok: false, issues };

  const snapshot = canonicaliseCodexTaskLinkSnapshot(input);
  const taskIds = snapshot.tasks.map((task) => task.id);
  const messageIds = snapshot.messages.map((message) => message.id);
  const linkIds = snapshot.links.map((link) => link.id);
  for (const [path, values] of [["$.tasks", taskIds], ["$.messages", messageIds], ["$.links", linkIds]] as const) {
    for (const duplicate of findDuplicates(values)) {
      addIssue(issues, "duplicate-identity", path, `Duplicate fixture-local identity: ${duplicate}.`);
    }
  }

  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const messagesById = new Map(snapshot.messages.map((message) => [message.id, message]));
  const rawMessageIdentities = new Set<string>();
  const rawTaskIdentities = new Set<string>();
  for (const [index, task] of snapshot.tasks.entries()) {
    const rawTaskIdentity = `${task.hostId ?? ""}\u0000${task.threadId}`;
    if (rawTaskIdentities.has(rawTaskIdentity)) {
      addIssue(issues, "duplicate-identity", `$.tasks[${index}]`, "The same observed host/task identity appears more than once.");
    }
    rawTaskIdentities.add(rawTaskIdentity);
    if (containsPrivateIdentity(task.id, [task.threadId, task.hostId ?? ""])) {
      addIssue(issues, "private-identity-leak", `$.tasks[${index}].id`, "Opaque fixture-local IDs must not contain raw Codex identities.");
    }
  }
  for (const [index, message] of snapshot.messages.entries()) {
    const task = tasksById.get(message.taskReferenceId);
    if (!task) {
      addIssue(issues, "missing-reference", `$.messages[${index}].taskReferenceId`, "The referenced task does not exist.");
    } else if (task.threadId !== message.threadId) {
      addIssue(issues, "identity-mismatch", `$.messages[${index}].threadId`, "The message thread does not match its referenced task.");
    }
    const rawIdentity = `${message.threadId}\u0000${message.turnId}\u0000${message.itemId}`;
    if (rawMessageIdentities.has(rawIdentity)) {
      addIssue(issues, "duplicate-identity", `$.messages[${index}]`, "The same observed task/turn/item identity appears more than once.");
    }
    rawMessageIdentities.add(rawIdentity);
    if (containsPrivateIdentity(message.id, [message.threadId, message.turnId, message.itemId])) {
      addIssue(issues, "private-identity-leak", `$.messages[${index}].id`, "Opaque fixture-local IDs must not contain raw Codex identities.");
    }
  }

  const canonicalNodeSet = new Set(canonicalNodeIds);
  const linksByNode = new Map<string, WorkMessageLink[]>();
  const pairIdentities = new Set<string>();
  for (const [index, link] of snapshot.links.entries()) {
    if (!messagesById.has(link.messageReferenceId)) {
      addIssue(issues, "missing-reference", `$.links[${index}].messageReferenceId`, "The referenced message does not exist.");
    }
    if (!canonicalNodeSet.has(link.nodeId)) {
      addIssue(issues, "correspondence-mismatch", `$.links[${index}].nodeId`, "The link references a non-canonical work node.");
    }
    const pairIdentity = `${link.nodeId}\u0000${link.messageReferenceId}`;
    if (pairIdentities.has(pairIdentity)) {
      addIssue(issues, "duplicate-identity", `$.links[${index}]`, "A node/message pair may be linked only once.");
    }
    pairIdentities.add(pairIdentity);
    linksByNode.set(link.nodeId, [...(linksByNode.get(link.nodeId) ?? []), link]);
  }
  for (const nodeId of canonicalNodeIds) {
    const links = linksByNode.get(nodeId) ?? [];
    if (links.length === 0) {
      addIssue(issues, "correspondence-mismatch", "$.links", `Canonical node ${nodeId} has no message reference.`);
      continue;
    }
    const primary = links.filter((link) => link.primary);
    if (primary.length !== 1) {
      addIssue(issues, "primary-link-mismatch", "$.links", `Canonical node ${nodeId} must have exactly one primary source.`);
    } else if (!(PRIMARY_WORK_MESSAGE_RELATIONSHIPS as readonly string[]).includes(primary[0].relationship)) {
      addIssue(issues, "primary-link-mismatch", "$.links", `Canonical node ${nodeId} has a discussion-only primary source.`);
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: snapshot };
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const child of Object.values(value as JsonRecord)) deepFreeze(child);
  return Object.freeze(value) as DeepReadonly<T>;
}

export async function verifyCodexTaskLinkSnapshotDigests(
  snapshot: CodexTaskLinkSnapshot,
  options: ParseCodexTaskLinkSnapshotOptions,
): Promise<CodexTaskLinkDigestVerification> {
  const structural = parseCodexTaskLinkSnapshot(snapshot, options);
  if (!structural.ok) {
    return { ok: false, issues: structural.issues, verifiedMessageCount: 0, snapshotDigest: null };
  }
  const canonical = canonicaliseCodexTaskLinkSnapshot(structural.value);
  const issues: CodexTaskLinkValidationIssue[] = [];
  let verifiedMessageCount = 0;
  for (const [index, message] of canonical.messages.entries()) {
    if (message.excerpt === null || message.excerptSha256 === null) continue;
    const actual = await sha256Text(normaliseCodexMessageExcerpt(message.excerpt));
    if (actual !== message.excerptSha256) {
      addIssue(issues, "digest-mismatch", `$.messages[${index}].excerptSha256`, "The allowlisted excerpt digest does not match its normalised content.");
    } else {
      verifiedMessageCount += 1;
    }
  }
  const snapshotDigest = await computeCodexTaskLinkSnapshotDigest(canonical);
  if (snapshotDigest !== canonical.snapshotSha256) {
    addIssue(issues, "digest-mismatch", "$.snapshotSha256", "The canonical snapshot digest does not match the snapshot content.");
  }
  if (issues.length > 0) return { ok: false, issues, verifiedMessageCount, snapshotDigest };
  return {
    ok: true,
    value: deepFreeze(canonical) as VerifiedCodexTaskLinkSnapshot,
    issues,
    verifiedMessageCount,
    snapshotDigest,
  };
}

export function resolveWorkMessageLink(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  nodeId: string,
  messageReferenceId?: string,
): CodexTaskLinkResolution {
  const candidates = snapshot.links.filter((link) => link.nodeId === nodeId);
  const link = messageReferenceId
    ? candidates.find((candidate) => candidate.messageReferenceId === messageReferenceId)
    : candidates.find((candidate) => candidate.primary);
  if (!link) {
    return { ok: false, reason: "missing-node-link", message: "This work item has no matching source-message link." };
  }
  const message = snapshot.messages.find((candidate) => candidate.id === link.messageReferenceId);
  if (!message) return { ok: false, reason: "missing-message", message: "The captured source message no longer resolves." };
  const task = snapshot.tasks.find((candidate) => candidate.id === message.taskReferenceId);
  if (!task) return { ok: false, reason: "missing-task", message: "The captured source task no longer resolves." };
  if (!["available", "stale"].includes(message.availability)) {
    return {
      ok: false,
      reason: "unavailable-message",
      message: message.replacementReason ?? "The source message is currently unavailable; open the containing task instead.",
    };
  }
  return { ok: true, value: { link, message, task } };
}

export function resolvePrimaryWorkMessageLink(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  nodeId: string,
): CodexTaskLinkResolution {
  return resolveWorkMessageLink(snapshot, nodeId);
}

export function buildCodexMessageNavigationTarget(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  context: {
    nodeId: string;
    messageReferenceId?: string;
    returnSurface: ThreadwakeSourceSurface;
    returnContextId: string;
  },
): CodexMessageNavigationTarget {
  const resolution = resolveWorkMessageLink(snapshot, context.nodeId, context.messageReferenceId);
  if (!resolution.ok) throw new Error(resolution.message);
  if (!isOpaqueCodexReferenceId(context.returnContextId)) throw new Error("The return context must be an opaque fixture-local identity.");
  return {
    shell: "codex",
    sourceReferenceId: resolution.value.message.id,
    nodeId: context.nodeId,
    returnSurface: context.returnSurface,
    returnContextId: context.returnContextId,
    taskReferenceId: resolution.value.task.id,
    threadId: resolution.value.message.threadId,
    turnId: resolution.value.message.turnId,
    itemId: resolution.value.message.itemId,
    messageLevelSupport: "internal-demo-only",
    nativeHostOpenScope: "task-only",
  };
}

function privateSnapshotValues(snapshot: VerifiedCodexTaskLinkSnapshot): string[] {
  return [
    ...snapshot.tasks.flatMap((task) => [task.threadId, task.hostId ?? ""]),
    ...snapshot.messages.flatMap((message) => [
      message.threadId,
      message.turnId,
      message.itemId,
      message.excerpt ?? "",
    ]),
  ].filter((value) => value.length > 0);
}

function routePrivacyIssues(
  params: URLSearchParams,
  snapshot: VerifiedCodexTaskLinkSnapshot,
): CodexTaskLinkValidationIssue[] {
  const issues: CodexTaskLinkValidationIssue[] = [];
  const privateValues = privateSnapshotValues(snapshot);
  for (const [key, value] of params.entries()) {
    if (FORBIDDEN_PRIVATE_ROUTE_KEYS.has(key.toLowerCase())) {
      addIssue(issues, "private-identity-leak", `search.${key}`, "Raw Codex identity fields and excerpts are forbidden in URL state.");
    }
    if (containsPrivateIdentity(key, privateValues) || containsPrivateIdentity(value, privateValues)) {
      addIssue(issues, "private-identity-leak", `search.${key}`, "A URL field contains private captured task or message data.");
    }
  }
  return issues;
}

export function buildCodexTaskLinkSearchParams(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  target: CodexMessageNavigationTarget,
): URLSearchParams {
  if (!isOpaqueCodexReferenceId(target.sourceReferenceId)) {
    throw new Error("The URL source must be an opaque fixture-local identity.");
  }
  if (!SAFE_SOURCE_ID_PATTERN.test(target.nodeId)) {
    throw new Error("The URL selection must be a canonical work-node identity.");
  }
  if (!isOpaqueCodexReferenceId(target.returnContextId)) {
    throw new Error("The URL return context must be an opaque fixture-local identity.");
  }
  const params = new URLSearchParams();
  params.set("twv", CODEX_TASK_LINK_ROUTE_VERSION);
  params.set("shell", "codex");
  params.set("source", target.sourceReferenceId);
  params.set("selected", target.nodeId);
  params.set("view", target.returnSurface);
  params.set("return", target.returnContextId);
  if (routePrivacyIssues(params, snapshot).length > 0) {
    throw new Error("The proposed URL state contains private Codex task or message data.");
  }
  return params;
}

export function parseCodexTaskLinkSearchParams(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  input: string | URLSearchParams,
): CodexTaskLinkRouteParseResult {
  const params = typeof input === "string" ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input) : input;
  const issues = routePrivacyIssues(params, snapshot);
  for (const key of ["twv", "shell", "source", "selected", "view", "return"] as const) {
    const count = [...params.keys()].filter((candidate) => candidate.toLowerCase() === key).length;
    if (count > 1) {
      addIssue(issues, "duplicate-identity", `search.${key}`, "A route field may occur only once.");
    }
  }
  const routeVersion = params.get("twv");
  if (routeVersion !== CODEX_TASK_LINK_ROUTE_VERSION) {
    addIssue(issues, "invalid-value", "search.twv", "The route version is missing or unsupported.");
  }
  const shell = params.get("shell");
  if (shell !== "codex" && shell !== "threadwake") {
    addIssue(issues, "invalid-value", "search.shell", "Expected codex or threadwake.");
  }
  const sourceReferenceId = params.get("source");
  if (sourceReferenceId !== null && !isOpaqueCodexReferenceId(sourceReferenceId)) {
    addIssue(issues, "invalid-value", "search.source", "Expected an opaque fixture-local source identity.");
  }
  const nodeId = params.get("selected");
  if (nodeId !== null && !SAFE_SOURCE_ID_PATTERN.test(nodeId)) {
    addIssue(issues, "invalid-value", "search.selected", "Expected a canonical work-node identity.");
  }
  const view = params.get("view");
  if (view !== null && !(["graph", "kanban", "list"] as const).includes(view as ThreadwakeSourceSurface)) {
    addIssue(issues, "invalid-value", "search.view", "Expected graph, kanban, or list.");
  }
  const returnContextId = params.get("return");
  if (returnContextId !== null && !isOpaqueCodexReferenceId(returnContextId)) {
    addIssue(issues, "invalid-value", "search.return", "Expected an opaque fixture-local return-context identity.");
  }
  if (shell === "codex" && sourceReferenceId === null) {
    addIssue(issues, "missing-field", "search.source", "Codex mode requires an opaque source identity.");
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      routeVersion: CODEX_TASK_LINK_ROUTE_VERSION,
      shell: shell as "codex" | "threadwake",
      sourceReferenceId,
      nodeId,
      returnSurface: view as ThreadwakeSourceSurface | null,
      returnContextId,
    },
  };
}

export function buildCodexNativeTaskOpenRequest(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  taskReferenceId: string,
): CodexNativeTaskOpenRequest {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskReferenceId);
  if (!task) throw new Error("The verified snapshot does not contain that task reference.");
  return {
    transport: "host-native-task-navigation",
    scope: "task-only",
    threadId: task.threadId,
    hostId: task.hostId,
    exactMessageSupported: false,
    label: "Open task in Codex",
  };
}

export function buildPrivateCodexReferenceCopyPayload(
  snapshot: VerifiedCodexTaskLinkSnapshot,
  request: { nodeId: string; messageReferenceId?: string },
  acknowledgement: "copy-private-reference",
): PrivateCodexReferenceCopyPayload {
  if (acknowledgement !== "copy-private-reference") throw new Error("Explicit private-reference acknowledgement is required.");
  const resolution = resolveWorkMessageLink(snapshot, request.nodeId, request.messageReferenceId);
  if (!resolution.ok) throw new Error(resolution.message);
  return {
    classification: "private-owner-only",
    label: "Copy private Codex task/message reference",
    warning: "This reference contains private Codex task and message identifiers. Do not share it publicly.",
    value: [
      `task=${resolution.value.task.threadId}`,
      `turn=${resolution.value.message.turnId}`,
      `item=${resolution.value.message.itemId}`,
    ].join("\n"),
  };
}
