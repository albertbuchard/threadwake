import { describe, expect, it } from "vitest";

import {
  DisabledForgeWorkGraphStore,
  mapForgeFixtureRecord,
} from "../src/forge-adapter.js";

const forgeShapedFixture = {
  id: "forge-shaped-unit",
  projectId: "forge-shaped-project",
  groupId: null,
  parentId: null,
  kind: "task" as const,
  title: "Synthetic Forge-shaped unit",
  summary: "This record exists only to verify deterministic contract mapping.",
  lifecycle: "ready" as const,
  outcome: "pending" as const,
  rejectedReason: null,
  evidenceIds: [],
  context: {
    objective: "Validate a fixture-shaped mapping.",
    constraints: ["Perform no live input or output."],
    acceptedEvidenceIds: [],
    nextAction: "Keep the adapter disabled.",
  },
  sortOrder: 1,
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  sourceRevision: "fixture-revision-one",
};

describe("disabled Forge boundary", () => {
  it("maps only an explicit fixture-shaped record into the public contract", () => {
    const mapped = mapForgeFixtureRecord(forgeShapedFixture);

    expect(mapped.id).toBe("forge-shaped-unit");
    expect(mapped.provenance).toEqual({
      source: "forge",
      sourceId: "forge-shaped-unit",
      revision: "fixture-revision-one",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("rejects unsupported source concepts instead of approximating them", () => {
    expect(() =>
      mapForgeFixtureRecord({
        ...forgeShapedFixture,
        kind: "epic",
      }),
    ).toThrow();
  });

  it("advertises unavailable Forge mode and performs no reads or writes", () => {
    const store = new DisabledForgeWorkGraphStore();

    expect(store.capabilities().available).toBe(false);
    expect(store.health().status).toBe("unsupported");
    expect(() => store.listWorkUnits({ limit: 20 })).toThrowError(/disabled/i);
  });
});
