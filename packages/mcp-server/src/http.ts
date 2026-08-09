import { randomUUID } from "node:crypto";
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createThreadwakeMcpServer } from "./server.js";
import type { WorkGraphRepository } from "./store.js";

const MAX_REQUEST_BYTES = 1_048_576;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type SessionPair = {
  mcpServer: ReturnType<typeof createThreadwakeMcpServer>;
  transport: StreamableHTTPServerTransport;
};

export interface LoopbackHttpOptions {
  repository: WorkGraphRepository;
  host?: "127.0.0.1" | "::1";
  port?: number;
  allowedOrigins?: readonly string[];
}

export interface LoopbackHttpServer {
  host: "127.0.0.1" | "::1";
  port: number;
  mcpUrl: URL;
  healthUrl: URL;
  close(): Promise<void>;
}

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
) => {
  if (response.headersSent) {
    return;
  }
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value));
};

const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      tooLarge = true;
    } else {
      chunks.push(buffer);
    }
  }

  if (tooLarge) {
    throw new RangeError("REQUEST_TOO_LARGE");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new SyntaxError("INVALID_JSON");
  }
};

const hostnameFromHostHeader = (hostHeader: string | undefined) => {
  if (hostHeader === undefined) {
    return null;
  }
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
};

const isJsonContentType = (contentType: string | string[] | undefined) =>
  typeof contentType === "string" &&
  contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json";

const normalizeOrigins = (origins: readonly string[]) =>
  new Set(
    origins.map((origin) => {
      const parsed = new URL(origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new TypeError("Allowed origins must use http or https.");
      }
      return parsed.origin;
    }),
  );

const closeNodeServer = (server: NodeHttpServer) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });

export const startLoopbackHttpServer = async (
  options: LoopbackHttpOptions,
): Promise<LoopbackHttpServer> => {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4318;
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new TypeError("Threadwake HTTP mode can bind only to a loopback address.");
  }
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new TypeError("The HTTP port must be an integer from 0 through 65535.");
  }

  const allowedOrigins = normalizeOrigins(options.allowedOrigins ?? []);
  let activePair: SessionPair | undefined;
  let provisionalPair: SessionPair | undefined;
  let initializing = false;
  let closing = false;

  const createPair = async (): Promise<SessionPair> => {
    const mcpServer = createThreadwakeMcpServer(options.repository);
    let pair: SessionPair;
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      keepAliveMs: 0,
      sessionIdGenerator: randomUUID,
      onsessionclosed: async () => {
        if (activePair === pair) {
          activePair = undefined;
        }
        await mcpServer.close();
      },
    });
    pair = { mcpServer, transport };
    await mcpServer.connect(transport);
    return pair;
  };

  const disposePair = async (pair: SessionPair) => {
    try {
      await pair.transport.close();
    } catch {
      // Continue closing the paired server even if transport cleanup fails.
    }
    try {
      await pair.mcpServer.close();
    } catch {
      // Disposal is best-effort; no untrusted error details are returned.
    }
  };

  const httpServer = createNodeServer(async (request, response) => {
    const requestHostname = hostnameFromHostHeader(request.headers.host);
    if (requestHostname === null || !LOOPBACK_HOSTS.has(requestHostname)) {
      sendJson(response, 403, jsonRpcError(-32_003, "Forbidden host."));
      return;
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? "/", "http://localhost");
    } catch {
      sendJson(response, 400, jsonRpcError(-32_600, "Malformed request target."));
      return;
    }

    if (requestUrl.pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, options.repository.health(), { "cache-control": "no-store" });
      return;
    }

    if (requestUrl.pathname !== "/mcp") {
      sendJson(response, 404, jsonRpcError(-32_001, "Not found."));
      return;
    }

    const originHeader = request.headers.origin;
    if (originHeader !== undefined && !allowedOrigins.has(originHeader)) {
      sendJson(response, 403, jsonRpcError(-32_003, "Forbidden origin."));
      return;
    }

    if (originHeader !== undefined) {
      response.setHeader("access-control-allow-origin", originHeader);
      response.setHeader("vary", "Origin");
    }
    response.setHeader(
      "access-control-allow-headers",
      "Accept, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
    );
    response.setHeader("access-control-expose-headers", "MCP-Session-Id");
    response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("cache-control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (closing) {
      sendJson(response, 503, jsonRpcError(-32_603, "The local MCP server is closing."));
      return;
    }

    try {
      let parsedBody: unknown;
      if (request.method === "POST") {
        if (!isJsonContentType(request.headers["content-type"])) {
          request.resume();
          sendJson(response, 415, jsonRpcError(-32_600, "Content-Type must be application/json."));
          return;
        }
        parsedBody = await readJsonBody(request);
        if (isInitializeRequest(parsedBody)) {
          if (activePair !== undefined || initializing) {
            sendJson(
              response,
              409,
              jsonRpcError(-32_000, "A local MCP session is already active."),
            );
            return;
          }

          initializing = true;
          try {
            provisionalPair = await createPair();
            await provisionalPair.transport.handleRequest(request, response, parsedBody);
            if (
              !closing &&
              response.statusCode < 400 &&
              provisionalPair.transport.sessionId !== undefined
            ) {
              activePair = provisionalPair;
              provisionalPair = undefined;
            }
          } finally {
            const rejectedPair = provisionalPair;
            provisionalPair = undefined;
            initializing = false;
            if (rejectedPair !== undefined) {
              await disposePair(rejectedPair);
            }
          }
          return;
        }
      }

      if (activePair === undefined) {
        sendJson(
          response,
          400,
          jsonRpcError(-32_000, "Initialize an MCP session before sending this request."),
        );
        return;
      }

      await activePair.transport.handleRequest(request, response, parsedBody);
    } catch (error) {
      if (error instanceof RangeError && error.message === "REQUEST_TOO_LARGE") {
        sendJson(response, 413, jsonRpcError(-32_600, "Request body exceeds 1 MiB."));
        return;
      }
      if (error instanceof SyntaxError && error.message === "INVALID_JSON") {
        sendJson(response, 400, jsonRpcError(-32_700, "Request body is not valid JSON."));
        return;
      }
      sendJson(response, 500, jsonRpcError(-32_603, "Internal server error."));
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(requestedPort, host);
  });

  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    await closeNodeServer(httpServer);
    throw new Error("The loopback HTTP server did not expose a TCP address.");
  }
  const port = address.port;
  const urlHost = host === "::1" ? "[::1]" : host;
  allowedOrigins.add(`http://${urlHost}:${port}`);
  allowedOrigins.add(`http://localhost:${port}`);

  return {
    host,
    port,
    mcpUrl: new URL(`http://${urlHost}:${port}/mcp`),
    healthUrl: new URL(`http://${urlHost}:${port}/health`),
    async close() {
      closing = true;
      const pairs = [activePair, provisionalPair].filter(
        (pair): pair is SessionPair => pair !== undefined,
      );
      activePair = undefined;
      provisionalPair = undefined;
      await Promise.all(pairs.map(disposePair));
      await closeNodeServer(httpServer);
    },
  };
};
