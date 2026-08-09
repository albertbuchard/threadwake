import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

import { TOOL_NAMES } from "../src/tool-catalog.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distBundlePath = resolve(packageRoot, "dist/threadwake-mcp.mjs");
const pluginServerRoot = resolve(packageRoot, "../../plugins/threadwake/server");
const pluginBundlePath = resolve(pluginServerRoot, "threadwake-mcp.mjs");
const noticesPath = resolve(pluginServerRoot, "THIRD_PARTY_NOTICES.txt");

const bundledPackages = [
  "@hono/node-server@2.1.0",
  "@modelcontextprotocol/sdk@1.30.0",
  "ajv-formats@3.0.1",
  "ajv@8.20.0",
  "content-type@1.0.5",
  "fast-deep-equal@3.1.3",
  "fast-uri@3.1.5",
  "hono@4.13.1",
  "json-schema-traverse@1.0.0",
  "zod-to-json-schema@3.25.2",
  "zod@4.4.3",
];

describe("dependency-bundled stdio artifact", () => {
  it("copies identical bytes and complete notices into the plugin", async () => {
    const [distBundle, pluginBundle, notices] = await Promise.all([
      readFile(distBundlePath),
      readFile(pluginBundlePath),
      readFile(noticesPath, "utf8"),
    ]);

    expect(pluginBundle.equals(distBundle)).toBe(true);
    for (const packageIdentity of bundledPackages) {
      expect(notices).toContain(packageIdentity);
    }
    expect(notices).not.toContain("/Users/");
  });

  it("initializes from a copied plugin archive with no repository dependencies", async () => {
    const isolatedWorkingDirectory = await mkdtemp(resolve(tmpdir(), "threadwake-plugin-archive-"));
    let client: Client | undefined;

    try {
      const isolatedPluginRoot = resolve(isolatedWorkingDirectory, "threadwake");
      await cp(resolve(packageRoot, "../../plugins/threadwake"), isolatedPluginRoot, {
        recursive: true,
      });
      const mcpConfig = JSON.parse(
        await readFile(resolve(isolatedPluginRoot, ".mcp.json"), "utf8"),
      ) as {
        mcpServers: {
          threadwake: {
            command: string;
            args: string[];
            cwd: string;
          };
        };
      };
      const serverConfig = mcpConfig.mcpServers.threadwake;
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        cwd: resolve(isolatedPluginRoot, serverConfig.cwd),
        stderr: "pipe",
      });
      client = new Client({ name: "bundle-test-client", version: "0.1.0" });

      await client.connect(transport);
      const tools = await client.listTools();
      const capabilities = await client.callTool({
        name: TOOL_NAMES.capabilities,
        arguments: {},
      });

      expect(tools.tools.map((tool) => tool.name)).toContain(TOOL_NAMES.preview);
      expect(capabilities.structuredContent).toMatchObject({
        mode: "fixture",
        synthetic: true,
      });
    } finally {
      await client?.close();
      await rm(isolatedWorkingDirectory, { force: true, recursive: true });
    }
  });
});
