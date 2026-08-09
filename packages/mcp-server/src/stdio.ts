import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createThreadwakeMcpServer } from "./server.js";
import type { WorkGraphRepository } from "./store.js";

export const runStdioServer = async (repository: WorkGraphRepository) => {
  const server = createThreadwakeMcpServer(repository);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
};
