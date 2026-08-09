import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  SyntheticWorkGraphDocumentSchema,
  WorkGraphDocumentSchema,
  findParentCycle,
  parseWorkGraphDocument,
  type WorkGraphDocument,
} from "../src/index.js";

const provenance = {
  source: "fixture" as const,
  sourceId: "fixture-source",
  revision: "fixture-v1",
  occurredAt: "2026-01-01T00:00:00.000Z",
};

const makeGraph = (): WorkGraphDocument => ({
  contractVersion: CONTRACT_VERSION,
  graphId: "synthetic-graph",
  graphRevision: 1,
  label: "Synthetic contract fixture",
  synthetic: true,
  projects: [
    {
      id: "project-one",
      name: "Project one",
      description: "A deterministic synthetic project.",
      sortOrder: 1,
      provenance,
    },
  ],
  groups: [],
  workUnits: [
    {
      id: "unit-parent",
      projectId: "project-one",
      groupId: null,
      parentId: null,
      kind: "goal",
      title: "Parent unit",
      summary: "A deterministic synthetic parent.",
      lifecycle: "in_progress",
      outcome: "pending",
      rejectedReason: null,
      evidenceIds: [],
      context: {
        objective: "Exercise contract validation.",
        constraints: ["Use synthetic data."],
        acceptedEvidenceIds: [],
        nextAction: "Validate the child.",
      },
      sortOrder: 1,
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      provenance,
    },
    {
      id: "unit-child",
      projectId: "project-one",
      groupId: null,
      parentId: "unit-parent",
      kind: "task",
      title: "Child unit",
      summary: "A deterministic synthetic child.",
      lifecycle: "ready",
      outcome: "pending",
      rejectedReason: null,
      evidenceIds: [],
      context: {
        objective: "Remain attached to the parent.",
        constraints: ["Do not invent hierarchy."],
        acceptedEvidenceIds: [],
        nextAction: "Wait for a valid transition.",
      },
      sortOrder: 2,
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      provenance,
    },
  ],
  relations: [],
  evidence: [],
});

describe("WorkGraphDocumentSchema", () => {
  it("accepts and detaches a valid versioned graph", () => {
    const source = makeGraph();
    const parsed = parseWorkGraphDocument(source);

    source.workUnits[0]!.title = "Mutated after parsing";

    expect(parsed.contractVersion).toBe("1.0.0");
    expect(parsed.workUnits[0]!.title).toBe("Parent unit");
  });

  it("rejects orphaned work units", () => {
    const graph = makeGraph();
    graph.workUnits[1]!.parentId = "missing-parent";

    const result = WorkGraphDocumentSchema.safeParse(graph);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("missing parent"))).toBe(true);
  });

  it("rejects hierarchy cycles", () => {
    const graph = makeGraph();
    graph.workUnits[0]!.parentId = "unit-child";

    const result = WorkGraphDocumentSchema.safeParse(graph);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("cycle"))).toBe(true);
  });

  it("keeps lifecycle and outcome consistent and explicit", () => {
    const graph = makeGraph();
    graph.workUnits[1]!.outcome = "succeeded";

    const result = WorkGraphDocumentSchema.safeParse(graph);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("outcome"))).toBe(true);
  });

  it("keeps the generic contract usable for non-synthetic provenance while specializing fixtures", () => {
    const graph = makeGraph();
    graph.synthetic = false;
    for (const project of graph.projects) {
      project.provenance = { ...project.provenance, source: "forge" };
    }
    for (const unit of graph.workUnits) {
      unit.provenance = { ...unit.provenance, source: "forge" };
    }

    expect(WorkGraphDocumentSchema.safeParse(graph).success).toBe(true);
    expect(SyntheticWorkGraphDocumentSchema.safeParse(graph).success).toBe(false);
  });
});

describe("findParentCycle", () => {
  it("visits each item at most once in a long acyclic hierarchy", () => {
    const ids = Array.from({ length: 20_000 }, (_, index) => `unit-${index}`);
    let parentLookups = 0;

    const cycle = findParentCycle(ids, (id) => {
      parentLookups += 1;
      const index = Number(id.slice("unit-".length));
      return index === 0 ? null : `unit-${index - 1}`;
    });

    expect(cycle).toBeNull();
    expect(parentLookups).toBe(ids.length);
  });

  it("detects a cycle without revisiting completed paths", () => {
    const parents = new Map([
      ["unit-a", "unit-b"],
      ["unit-b", "unit-c"],
      ["unit-c", "unit-a"],
    ]);
    let parentLookups = 0;

    const cycle = findParentCycle([...parents.keys()], (id) => {
      parentLookups += 1;
      return parents.get(id);
    });

    expect(cycle).toBe("unit-a");
    expect(parentLookups).toBe(3);
  });
});
