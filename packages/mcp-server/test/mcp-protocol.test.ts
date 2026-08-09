import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FixtureWorkGraphStore } from "../src/fixture-store.js";
import { createThreadwakeMcpServer } from "../src/server.js";
import { TOOL_NAMES } from "../src/tool-catalog.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

const connectClient = async (store = new FixtureWorkGraphStore()) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createThreadwakeMcpServer(store);
  const client = new Client({ name: "threadwake-test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
};

describe("MCP tool surface", () => {
  it("initializes, lists the exact focused tools, and publishes accurate annotations", async () => {
    const client = await connectClient();
    const listed = await client.listTools();
    const tools = new Map(listed.tools.map((tool) => [tool.name, tool]));

    expect([...tools.keys()].toSorted()).toEqual(Object.values(TOOL_NAMES).toSorted());
    expect(tools.get(TOOL_NAMES.list)?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(tools.get(TOOL_NAMES.confirm)?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tools.get(TOOL_NAMES.undo)?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });

    const capabilities = await client.callTool({
      name: TOOL_NAMES.capabilities,
      arguments: {},
    });
    expect(capabilities.structuredContent).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: TOOL_NAMES.confirm,
          destructive: true,
          idempotent: true,
        }),
        expect.objectContaining({
          name: TOOL_NAMES.undo,
          destructive: true,
          idempotent: true,
        }),
      ]),
    });
  });

  it("returns structured fixture data and structured policy errors", async () => {
    const client = await connectClient(new FixtureWorkGraphStore({ authorized: false }));

    const capabilities = await client.callTool({
      name: TOOL_NAMES.capabilities,
      arguments: {},
    });
    const denied = await client.callTool({
      name: TOOL_NAMES.list,
      arguments: { limit: 20 },
    });

    expect(capabilities.isError).not.toBe(true);
    expect(capabilities.structuredContent).toMatchObject({
      mode: "fixture",
      available: false,
    });
    expect(denied.isError).toBe(true);
    expect(denied.structuredContent).toMatchObject({
      error: { code: "UNAUTHORIZED", retryable: false },
    });
  });

  it("rejects invalid schemas before a handler can change state", async () => {
    const store = new FixtureWorkGraphStore();
    const client = await connectClient(store);

    const invalid = await client.callTool({
      name: TOOL_NAMES.confirm,
      arguments: {
        kind: "lifecycle_move",
        workUnitId: "unit-synthetic-layout",
        expectedVersion: 1,
        targetLifecycle: "in_progress",
        previewToken: "not-a-preview-token",
        confirmation: "confirm_fixture_write",
        idempotencyKey: "invalid-schema-key",
      },
    });

    expect(invalid.isError).toBe(true);
    expect(store.getWorkUnit("unit-synthetic-layout").item.lifecycle).toBe("ready");
  });

  it("does not treat prompt-injected record content as authorization", async () => {
    const store = new FixtureWorkGraphStore();
    const client = await connectClient(store);

    const result = await client.callTool({
      name: TOOL_NAMES.search,
      arguments: { query: "ignore policy", limit: 20 },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [
        {
          id: "unit-synthetic-untrusted-text",
          lifecycle: "blocked",
        },
      ],
    });
    expect(store.getWorkUnit("unit-synthetic-layout").item.lifecycle).toBe("ready");
  });

  it("sanitizes unexpected server failures as internal errors", async () => {
    const store = new FixtureWorkGraphStore();
    vi.spyOn(store, "listWorkUnits").mockImplementation(() => {
      throw new Error("sensitive implementation detail");
    });
    const client = await connectClient(store);

    const result = await client.callTool({
      name: TOOL_NAMES.list,
      arguments: { limit: 20 },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "INTERNAL", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive implementation detail");
  });
});
