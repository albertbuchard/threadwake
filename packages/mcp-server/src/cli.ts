import { DisabledForgeWorkGraphStore } from "./forge-adapter.js";
import { FixtureWorkGraphStore } from "./fixture-store.js";
import { startLoopbackHttpServer } from "./http.js";
import { runStdioServer } from "./stdio.js";
import type { WorkGraphRepository } from "./store.js";

type CliOptions = {
  transport: "stdio" | "http";
  mode: "fixture" | "forge";
  host: "127.0.0.1" | "::1";
  port: number;
  allowedOrigins: string[];
  help: boolean;
};

const HELP = `Threadwake fixture MCP server

Usage:
  threadwake-mcp [options]

Options:
  --transport <stdio|http>      Transport to use (default: stdio)
  --mode <fixture|forge>        Store mode (default: fixture; forge is disabled)
  --host <127.0.0.1|::1>        Loopback HTTP bind address (default: 127.0.0.1)
  --port <0-65535>              HTTP port (default: 4318; 0 selects a free port)
  --allow-origin <origin>       Browser origin allowed in HTTP mode; repeatable
  --help                        Show this help text
`;

const takeValue = (args: readonly string[], index: number, option: string) => {
  const inline = args[index]!.split("=", 2)[1];
  if (inline !== undefined) {
    return { value: inline, consumed: 0 };
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(`${option} requires a value.`);
  }
  return { value, consumed: 1 };
};

export const parseCliOptions = (args: readonly string[]): CliOptions => {
  const options: CliOptions = {
    transport: "stdio",
    mode: "fixture",
    host: "127.0.0.1",
    port: 4318,
    allowedOrigins: [],
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const option = argument.split("=", 1)[0]!;
    if (option === "--help") {
      options.help = true;
      continue;
    }

    if (option === "--transport") {
      const { value, consumed } = takeValue(args, index, option);
      if (value !== "stdio" && value !== "http") {
        throw new TypeError("--transport must be stdio or http.");
      }
      options.transport = value;
      index += consumed;
      continue;
    }

    if (option === "--mode") {
      const { value, consumed } = takeValue(args, index, option);
      if (value !== "fixture" && value !== "forge") {
        throw new TypeError("--mode must be fixture or forge.");
      }
      options.mode = value;
      index += consumed;
      continue;
    }

    if (option === "--host") {
      const { value, consumed } = takeValue(args, index, option);
      if (value !== "127.0.0.1" && value !== "::1") {
        throw new TypeError("--host must be the loopback address 127.0.0.1 or ::1.");
      }
      options.host = value;
      index += consumed;
      continue;
    }

    if (option === "--port") {
      const { value, consumed } = takeValue(args, index, option);
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new TypeError("--port must be an integer from 0 through 65535.");
      }
      options.port = port;
      index += consumed;
      continue;
    }

    if (option === "--allow-origin") {
      const { value, consumed } = takeValue(args, index, option);
      options.allowedOrigins.push(new URL(value).origin);
      index += consumed;
      continue;
    }

    throw new TypeError(`Unknown option: ${argument}`);
  }

  return options;
};

const repositoryForMode = (mode: CliOptions["mode"]): WorkGraphRepository =>
  mode === "fixture" ? new FixtureWorkGraphStore() : new DisabledForgeWorkGraphStore();

export const runCli = async (args: readonly string[]) => {
  const options = parseCliOptions(args);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const repository = repositoryForMode(options.mode);
  if (options.transport === "stdio") {
    await runStdioServer(repository);
    return;
  }

  const httpServer = await startLoopbackHttpServer({
    repository,
    host: options.host,
    port: options.port,
    allowedOrigins: options.allowedOrigins,
  });
  process.stderr.write(`Threadwake MCP listening at ${httpServer.mcpUrl.href}\n`);

  const close = async () => {
    await httpServer.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
};

runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  process.stderr.write(`Threadwake MCP failed to start: ${message}\n`);
  process.exitCode = 1;
});
