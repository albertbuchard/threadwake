import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import { FixtureWorkGraphStore } from "../src/fixture-store.js";
import { startLoopbackHttpServer, type LoopbackHttpServer } from "../src/http.js";
import { TOOL_NAMES } from "../src/tool-catalog.js";

let runningServer: LoopbackHttpServer | undefined;

afterEach(async () => {
  if (runningServer !== undefined) {
    await runningServer.close();
    runningServer = undefined;
  }
});

describe("loopback Streamable HTTP transport", () => {
  it("rejects a hostile Origin and serves a stateful MCP client on loopback", async () => {
    runningServer = await startLoopbackHttpServer({
      repository: new FixtureWorkGraphStore(),
      host: "127.0.0.1",
      port: 0,
    });

    const forbidden = await fetch(runningServer.mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        origin: "https://hostile.invalid",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "hostile-test", version: "0.1.0" },
        },
      }),
    });
    expect(forbidden.status).toBe(403);

    const client = new Client({ name: "http-test-client", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(runningServer.mcpUrl);
    await client.connect(transport);
    const result = await client.callTool({
      name: TOOL_NAMES.list,
      arguments: { limit: 1 },
    });

    expect(runningServer.mcpUrl.hostname).toBe("127.0.0.1");
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      total: 4,
      items: [{ id: "unit-synthetic-goal" }],
    });

    await client.close();
  });

  it("refuses a non-loopback bind address", async () => {
    await expect(
      startLoopbackHttpServer({
        repository: new FixtureWorkGraphStore(),
        host: "0.0.0.0" as "127.0.0.1",
        port: 0,
      }),
    ).rejects.toThrow(/loopback/i);
  });

  it("cleans up a text/plain initialization before accepting a valid client", async () => {
    runningServer = await startLoopbackHttpServer({
      repository: new FixtureWorkGraphStore(),
      host: "127.0.0.1",
      port: 0,
    });

    const rejected = await fetch(runningServer.mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "text/plain",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "wrong-content-type", version: "0.1.0" },
        },
      }),
    });
    expect(rejected.status).toBe(415);

    const client = new Client({ name: "valid-after-415", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(runningServer.mcpUrl));
      const result = await client.callTool({
        name: TOOL_NAMES.list,
        arguments: { limit: 1 },
      });
      expect(result.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it("cleans up a transport-rejected initialization before accepting a valid client", async () => {
    runningServer = await startLoopbackHttpServer({
      repository: new FixtureWorkGraphStore(),
      host: "127.0.0.1",
      port: 0,
    });

    const rejected = await fetch(runningServer.mcpUrl, {
      method: "POST",
      headers: {
        accept: "text/plain",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "wrong-accept", version: "0.1.0" },
        },
      }),
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);

    const client = new Client({ name: "valid-after-rejection", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(runningServer.mcpUrl));
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain(TOOL_NAMES.capabilities);
    } finally {
      await client.close();
    }
  });

  it("serializes concurrent initialization into exactly one usable session", async () => {
    runningServer = await startLoopbackHttpServer({
      repository: new FixtureWorkGraphStore(),
      host: "127.0.0.1",
      port: 0,
    });

    const clients = [
      new Client({ name: "concurrent-client-one", version: "0.1.0" }),
      new Client({ name: "concurrent-client-two", version: "0.1.0" }),
    ];
    const results = await Promise.allSettled(
      clients.map((client) =>
        client.connect(new StreamableHTTPClientTransport(runningServer!.mcpUrl)),
      ),
    );
    const successfulIndexes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [index] : [],
    );

    expect(successfulIndexes).toHaveLength(1);
    const activeClient = clients[successfulIndexes[0]!]!;
    const result = await activeClient.callTool({
      name: TOOL_NAMES.list,
      arguments: { limit: 1 },
    });
    expect(result.isError).not.toBe(true);

    await Promise.allSettled(clients.map((client) => client.close()));
  });
});
