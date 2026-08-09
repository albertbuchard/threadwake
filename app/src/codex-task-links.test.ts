import { describe, expect, it } from "vitest";

import {
  buildCodexMessageNavigationTarget,
  buildCodexNativeTaskOpenRequest,
  buildCodexTaskLinkSearchParams,
  buildPrivateCodexReferenceCopyPayload,
  canonicaliseCodexTaskLinkSnapshot,
  CODEX_TASK_LINK_ROUTE_VERSION,
  CODEX_TASK_LINK_SCHEMA_VERSION,
  computeCodexTaskLinkSnapshotDigest,
  normaliseCodexMessageExcerpt,
  parseCodexTaskLinkSearchParams,
  parseCodexTaskLinkSnapshot,
  resolvePrimaryWorkMessageLink,
  resolveWorkMessageLink,
  sha256Text,
  verifyCodexTaskLinkSnapshotDigests,
  type CodexTaskLinkSnapshot,
  type VerifiedCodexTaskLinkSnapshot,
} from "./codex-task-links";

const NODE_IDS = ["node-contract-alpha", "node-contract-beta"] as const;

function cloneSnapshot(snapshot: CodexTaskLinkSnapshot): CodexTaskLinkSnapshot {
  return structuredClone(snapshot);
}

async function createContractTestSnapshot(): Promise<CodexTaskLinkSnapshot> {
  // These reserved test identities are explicitly synthetic and never presented as
  // observed Codex provenance. No private snapshot or conversation-derived fixture is included.
  const originExcerpt = "<script>untrusted instructions stay plain text</script>\r\n  No tool call.  ";
  const validationExcerpt = "The contract test preserves one canonical identity.";
  const snapshot: CodexTaskLinkSnapshot = {
    schemaVersion: CODEX_TASK_LINK_SCHEMA_VERSION,
    fixtureId: "fixture-contract-test",
    capturedAt: "2026-08-09T17:20:00.000Z",
    tasks: [
      {
        id: "task-contract-alpha",
        threadId: "test-thread-alpha",
        hostId: null,
        title: "Contract-only synthetic task",
        kind: "codex-task",
        capturedStatus: "active",
        capturedAt: "2026-08-09T17:20:00.000Z",
        sourceUpdatedAt: null,
      },
    ],
    messages: [
      {
        id: "source-origin-alpha",
        taskReferenceId: "task-contract-alpha",
        threadId: "test-thread-alpha",
        turnId: "test-turn-alpha",
        itemId: "test-item-alpha",
        role: "user",
        messageTimestamp: null,
        capturedAt: "2026-08-09T17:20:00.000Z",
        excerpt: originExcerpt,
        excerptSha256: await sha256Text(normaliseCodexMessageExcerpt(originExcerpt)),
        captureSource: {
          tool: "contract_test_only",
          operation: "read-only-thread-inspection",
          observedAt: "2026-08-09T17:20:00.000Z",
          identityScope: "capture-local",
        },
        availability: "available",
        replacementReason: null,
      },
      {
        id: "source-validation-beta",
        taskReferenceId: "task-contract-alpha",
        threadId: "test-thread-alpha",
        turnId: "test-turn-beta",
        itemId: "test-item-beta",
        role: "assistant",
        messageTimestamp: "2026-08-09T17:19:59.000Z",
        capturedAt: "2026-08-09T17:20:00.000Z",
        excerpt: validationExcerpt,
        excerptSha256: await sha256Text(validationExcerpt),
        captureSource: {
          tool: "contract_test_only",
          operation: "read-only-thread-inspection",
          observedAt: "2026-08-09T17:20:00.000Z",
          identityScope: "capture-local",
        },
        availability: "stale",
        replacementReason: "The contract-only source was intentionally marked stale for fallback coverage.",
      },
    ],
    links: [
      {
        id: "link-alpha-origin",
        nodeId: "node-contract-alpha",
        messageReferenceId: "source-origin-alpha",
        relationship: "originated-in",
        primary: true,
        explanation: "Reserved contract data models the originating relationship.",
      },
      {
        id: "link-alpha-context",
        nodeId: "node-contract-alpha",
        messageReferenceId: "source-validation-beta",
        relationship: "discussed-in",
        primary: false,
        explanation: "Discussion is retained only as additional context.",
      },
      {
        id: "link-beta-validation",
        nodeId: "node-contract-beta",
        messageReferenceId: "source-validation-beta",
        relationship: "validated-in",
        primary: true,
        explanation: "Reserved contract data models the validation relationship.",
      },
    ],
    privacy: {
      classification: "private-owner-only",
      containsConversationDerivedData: true,
      publicExportAllowed: false,
    },
    snapshotSha256: "0".repeat(64),
  };
  snapshot.snapshotSha256 = await computeCodexTaskLinkSnapshotDigest(snapshot);
  return snapshot;
}

async function verifyValidSnapshot(): Promise<VerifiedCodexTaskLinkSnapshot> {
  const source = await createContractTestSnapshot();
  const result = parseCodexTaskLinkSnapshot(source, {
    canonicalNodeIds: NODE_IDS,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("\n"));
  const verified = await verifyCodexTaskLinkSnapshotDigests(result.value, { canonicalNodeIds: NODE_IDS });
  expect(verified.ok).toBe(true);
  if (!verified.ok) throw new Error(verified.issues.map((issue) => issue.message).join("\n"));
  return verified.value;
}

describe("Codex task/message reference contract", () => {
  it("parses a complete deterministic correspondence without upgrading discussion into primary evidence", async () => {
    const source = await createContractTestSnapshot();
    source.messages.reverse();
    source.links.reverse();
    source.tasks.reverse();
    source.snapshotSha256 = await computeCodexTaskLinkSnapshotDigest(source);

    const result = parseCodexTaskLinkSnapshot(source, { canonicalNodeIds: NODE_IDS });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.messages.map((message) => message.id)).toEqual([
      "source-origin-alpha",
      "source-validation-beta",
    ]);
    expect(result.value.links.filter((link) => link.primary).map((link) => link.relationship)).toEqual([
      "originated-in",
      "validated-in",
    ]);
    expect(result.value.links.find((link) => link.relationship === "discussed-in")?.primary).toBe(false);
    expect(canonicaliseCodexTaskLinkSnapshot(result.value)).toEqual(result.value);
  });

  it("normalises excerpts and verifies every available content digest plus the snapshot digest", async () => {
    const source = await createContractTestSnapshot();
    const verification = await verifyCodexTaskLinkSnapshotDigests(source, { canonicalNodeIds: NODE_IDS });

    expect(normaliseCodexMessageExcerpt("e\u0301  \r\nnext  ")).toBe("é\nnext");
    expect(verification).toMatchObject({ ok: true, verifiedMessageCount: 2 });
    expect(verification.snapshotDigest).toBe(source.snapshotSha256);
    if (!verification.ok) return;
    expect(Object.isFrozen(verification.value)).toBe(true);
    expect(Object.isFrozen(verification.value.messages)).toBe(true);
    expect(Object.isFrozen(verification.value.messages[0])).toBe(true);
    expect(Object.isFrozen(verification.value.messages[0].captureSource)).toBe(true);
    const frozenMessage = verification.value.messages[0] as unknown as { excerpt: string | null };
    expect(() => {
      frozenMessage.excerpt = "Mutation after verification.";
    }).toThrow(TypeError);
    source.messages[0].excerpt = "The mutable input changed later.";
    expect(verification.value.messages[0].excerpt).not.toBe(source.messages[0].excerpt);
  });

  it("rejects a discussion-only primary and any missing, extra, or duplicate canonical correspondence", async () => {
    const discussedPrimary = await createContractTestSnapshot();
    discussedPrimary.links[0].relationship = "discussed-in";
    expect(parseCodexTaskLinkSnapshot(discussedPrimary, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "primary-link-mismatch" })]),
    });

    const missing = await createContractTestSnapshot();
    missing.links = missing.links.filter((link) => link.nodeId !== "node-contract-beta");
    expect(parseCodexTaskLinkSnapshot(missing, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "correspondence-mismatch" })]),
    });

    const extra = await createContractTestSnapshot();
    extra.links.push({
      ...extra.links[0],
      id: "link-extra-primary",
      nodeId: "node-contract-extra",
    });
    expect(parseCodexTaskLinkSnapshot(extra, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "correspondence-mismatch" })]),
    });

    const duplicate = await createContractTestSnapshot();
    duplicate.messages.push({ ...duplicate.messages[0] });
    expect(parseCodexTaskLinkSnapshot(duplicate, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "duplicate-identity" })]),
    });
  });

  it("rejects missing references, primary-count ambiguity, unsupported enums, and malformed digests", async () => {
    const missingReference = await createContractTestSnapshot();
    missingReference.links[0].messageReferenceId = "source-does-not-exist";
    expect(parseCodexTaskLinkSnapshot(missingReference, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "missing-reference" })]),
    });

    const multiplePrimary = await createContractTestSnapshot();
    multiplePrimary.links[1] = {
      ...multiplePrimary.links[1],
      relationship: "decided-in",
      primary: true,
    };
    expect(parseCodexTaskLinkSnapshot(multiplePrimary, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "primary-link-mismatch" })]),
    });

    const noPrimary = await createContractTestSnapshot();
    noPrimary.links[0].primary = false;
    expect(parseCodexTaskLinkSnapshot(noPrimary, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "primary-link-mismatch" })]),
    });

    const invalidEnums = await createContractTestSnapshot();
    Object.assign(invalidEnums.messages[0], { role: "operator", excerptSha256: "not-a-digest" });
    Object.assign(invalidEnums.links[0], { relationship: "proved-everything" });
    expect(parseCodexTaskLinkSnapshot(invalidEnums, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "invalid-value", path: "$.messages[0].role" }),
        expect.objectContaining({ code: "invalid-value", path: "$.messages[0].excerptSha256" }),
        expect.objectContaining({ code: "invalid-value", path: "$.links[0].relationship" }),
      ]),
    });

    const duplicateRealTask = await createContractTestSnapshot();
    duplicateRealTask.tasks.push({
      ...duplicateRealTask.tasks[0],
      id: "task-contract-duplicate",
      title: "Conflicting duplicate projection of the same real task",
    });
    expect(parseCodexTaskLinkSnapshot(duplicateRealTask, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({
        code: "duplicate-identity",
        message: expect.stringContaining("host/task"),
      })]),
    });
  });

  it("rejects schema drift, unknown fields, malformed times, unsafe controls, and mismatched task identity", async () => {
    const snapshot = await createContractTestSnapshot();
    const input = snapshot as CodexTaskLinkSnapshot & { unexpected?: string };
    input.unexpected = "not in v1";
    input.messages[0].capturedAt = "August 9";
    input.messages[0].excerpt = "unsafe\u202Etext";
    Object.assign(input, { schemaVersion: "future-schema" });

    const result = parseCodexTaskLinkSnapshot(input, { canonicalNodeIds: NODE_IDS });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-field" }),
      expect.objectContaining({ code: "invalid-value", path: "$.schemaVersion" }),
      expect.objectContaining({ code: "invalid-value", path: "$.messages[0].capturedAt" }),
      expect.objectContaining({ code: "invalid-value", path: "$.messages[0].excerpt" }),
    ]));

    const mismatched = await createContractTestSnapshot();
    mismatched.messages[0].threadId = "different-thread";
    expect(parseCodexTaskLinkSnapshot(mismatched, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "identity-mismatch" })]),
    });

    const tooShortToAuditSafely = await createContractTestSnapshot();
    tooShortToAuditSafely.messages[0].itemId = "a-b";
    tooShortToAuditSafely.messages[0].id = "source-a-b";
    tooShortToAuditSafely.links[0].messageReferenceId = "source-a-b";
    expect(parseCodexTaskLinkSnapshot(tooShortToAuditSafely, { canonicalNodeIds: NODE_IDS })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({
        code: "invalid-value",
        path: "$.messages[0].itemId",
      })]),
    });
  });

  it("keeps markup and instruction-like message content inert plain data", async () => {
    const snapshot = await verifyValidSnapshot();
    const message = snapshot.messages.find((candidate) => candidate.id === "source-origin-alpha");

    expect(message?.excerpt).toBe("<script>untrusted instructions stay plain text</script>\n  No tool call.");
    expect(typeof message?.excerpt).toBe("string");
    expect(snapshot.messages).toHaveLength(2);
  });

  it("resolves one-to-many and many-to-one provenance while preserving canonical work identity", async () => {
    const snapshot = await verifyValidSnapshot();
    const alphaPrimary = resolvePrimaryWorkMessageLink(snapshot, "node-contract-alpha");
    const alphaContext = resolveWorkMessageLink(snapshot, "node-contract-alpha", "source-validation-beta");
    const betaPrimary = resolvePrimaryWorkMessageLink(snapshot, "node-contract-beta");

    expect(alphaPrimary).toMatchObject({ ok: true, value: { link: { relationship: "originated-in" } } });
    expect(alphaContext).toMatchObject({ ok: true, value: { link: { relationship: "discussed-in" } } });
    expect(betaPrimary).toMatchObject({ ok: true, value: { link: { relationship: "validated-in" } } });
    if (alphaContext.ok && betaPrimary.ok) {
      expect(alphaContext.value.message.id).toBe(betaPrimary.value.message.id);
      expect(alphaContext.value.link.nodeId).not.toBe(betaPrimary.value.link.nodeId);
    }
  });

  it("builds exact internal navigation but serializes only opaque references into URL state", async () => {
    const snapshot = await verifyValidSnapshot();
    const resolution = resolvePrimaryWorkMessageLink(snapshot, "node-contract-alpha");
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const target = buildCodexMessageNavigationTarget(snapshot, {
      nodeId: "node-contract-alpha",
      returnSurface: "kanban",
      returnContextId: "return-context-alpha",
    });
    const params = buildCodexTaskLinkSearchParams(snapshot, target);
    const serialized = params.toString();

    expect(target).toMatchObject({
      threadId: "test-thread-alpha",
      turnId: "test-turn-alpha",
      itemId: "test-item-alpha",
      messageLevelSupport: "internal-demo-only",
      nativeHostOpenScope: "task-only",
    });
    expect(Object.fromEntries(params)).toEqual({
      twv: CODEX_TASK_LINK_ROUTE_VERSION,
      shell: "codex",
      source: "source-origin-alpha",
      selected: "node-contract-alpha",
      view: "kanban",
      return: "return-context-alpha",
    });
    for (const privateValue of [target.threadId, target.turnId, target.itemId, resolution.value.message.excerpt ?? ""]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(parseCodexTaskLinkSearchParams(snapshot, params)).toEqual({
      ok: true,
      value: {
        routeVersion: CODEX_TASK_LINK_ROUTE_VERSION,
        shell: "codex",
        sourceReferenceId: "source-origin-alpha",
        nodeId: "node-contract-alpha",
        returnSurface: "kanban",
        returnContextId: "return-context-alpha",
      },
    });
  });

  it("rejects raw task, turn, item, message, and excerpt URL parameters", async () => {
    const snapshot = await verifyValidSnapshot();
    const result = parseCodexTaskLinkSearchParams(
      snapshot,
      "?twv=1&shell=codex&source=source-origin-alpha&task=private-task&turn=private-turn&item=private-item&excerpt=private",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.filter((issue) => issue.code === "private-identity-leak")).toHaveLength(4);

    const duplicate = parseCodexTaskLinkSearchParams(
      snapshot,
      "?twv=1&shell=codex&source=source-origin-alpha&source=source-validation-beta",
    );
    expect(duplicate).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "duplicate-identity", path: "search.source" })]),
    });

    const mixedCaseAlias = parseCodexTaskLinkSearchParams(
      snapshot,
      "?twv=1&shell=codex&source=source-origin-alpha&ThReAdId=test-thread-alpha",
    );
    expect(mixedCaseAlias).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "private-identity-leak" })]),
    });

    const disguisedValue = parseCodexTaskLinkSearchParams(
      snapshot,
      "?twv=1&shell=codex&source=source-origin-alpha&note=test-thread-alpha",
    );
    expect(disguisedValue).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "private-identity-leak", path: "search.note" })]),
    });

    const primary = resolvePrimaryWorkMessageLink(snapshot, "node-contract-alpha");
    expect(primary.ok).toBe(true);
    if (!primary.ok) return;
    const unsafeTarget = {
      ...buildCodexMessageNavigationTarget(snapshot, {
        nodeId: "node-contract-alpha",
        returnSurface: "graph" as const,
        returnContextId: "return-context-alpha",
      }),
      returnContextId: "return-test-item-alpha",
    };
    expect(() => buildCodexTaskLinkSearchParams(snapshot, unsafeTarget)).toThrow("private Codex");
  });

  it("labels native opening as task-level only and makes raw copying an explicit private action", async () => {
    const snapshot = await verifyValidSnapshot();
    const resolution = resolvePrimaryWorkMessageLink(snapshot, "node-contract-alpha");
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(buildCodexNativeTaskOpenRequest(snapshot, resolution.value.task.id)).toEqual({
      transport: "host-native-task-navigation",
      scope: "task-only",
      threadId: "test-thread-alpha",
      hostId: null,
      exactMessageSupported: false,
      label: "Open task in Codex",
    });
    const copy = buildPrivateCodexReferenceCopyPayload(
      snapshot,
      { nodeId: "node-contract-alpha" },
      "copy-private-reference",
    );
    expect(copy.classification).toBe("private-owner-only");
    expect(copy.warning).toContain("Do not share");
    expect(copy.value).toContain("task=test-thread-alpha");
    expect(() => buildPrivateCodexReferenceCopyPayload(
      snapshot,
      { nodeId: "node-contract-alpha" },
      "not-acknowledged" as "copy-private-reference",
    )).toThrow("acknowledgement");
  });

  it("returns a truthful recoverable state when a captured message is unavailable", async () => {
    const source = await createContractTestSnapshot();
    source.messages[0] = {
      ...source.messages[0],
      availability: "permission-denied",
      excerpt: null,
      excerptSha256: null,
      replacementReason: "The owner-only task is not available to this viewer.",
    };
    source.snapshotSha256 = await computeCodexTaskLinkSnapshotDigest(source);
    const parsed = parseCodexTaskLinkSnapshot(source, { canonicalNodeIds: NODE_IDS });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const verified = await verifyCodexTaskLinkSnapshotDigests(parsed.value, { canonicalNodeIds: NODE_IDS });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(resolvePrimaryWorkMessageLink(verified.value, "node-contract-alpha")).toEqual({
      ok: false,
      reason: "unavailable-message",
      message: "The owner-only task is not available to this viewer.",
    });
  });

  it("detects excerpt and snapshot mutation without trusting a structurally valid fixture", async () => {
    const mutated = await createContractTestSnapshot();
    mutated.messages[0].excerpt = "Changed after capture.";

    const structural = parseCodexTaskLinkSnapshot(mutated, { canonicalNodeIds: NODE_IDS });
    expect(structural.ok).toBe(true);

    const verification = await verifyCodexTaskLinkSnapshotDigests(mutated, { canonicalNodeIds: NODE_IDS });
    expect(verification.ok).toBe(false);
    expect("value" in verification).toBe(false);
    expect(verification.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "digest-mismatch", path: "$.messages[0].excerptSha256" }),
      expect.objectContaining({ code: "digest-mismatch", path: "$.snapshotSha256" }),
    ]));
  });

  it("uses one locale-independent ordinal order and fixed digest for mixed ASCII node identities", async () => {
    const snapshot = await createContractTestSnapshot();
    for (const link of snapshot.links) {
      link.nodeId = link.nodeId === "node-contract-alpha" ? "node-Z" : "node_a";
    }
    snapshot.links.reverse();
    snapshot.snapshotSha256 = await computeCodexTaskLinkSnapshotDigest(snapshot);

    const canonical = canonicaliseCodexTaskLinkSnapshot(snapshot);
    expect(canonical.links.map((link) => link.nodeId)).toEqual(["node-Z", "node-Z", "node_a"]);
    expect(snapshot.snapshotSha256).toBe("3067603da7daac1af7547355a0ecd5115668f9c2e9626fed3c75c3bbb38b0d60");

    const verified = await verifyCodexTaskLinkSnapshotDigests(snapshot, {
      canonicalNodeIds: ["node_a", "node-Z"],
    });
    expect(verified.ok).toBe(true);
  });
});
