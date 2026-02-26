import { parseServerEnv } from "@mdcms/server";

import { createAppServerRequestHandler } from "../app-server.js";

type BunServer = {
  stop: (closeActiveConnections?: boolean) => void;
};

type BunRuntime = {
  serve: (options: {
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
  }) => BunServer;
};

declare const Bun: BunRuntime;

const env = parseServerEnv(process.env);
const { handler, moduleLoadReport } = createAppServerRequestHandler({
  env: process.env,
});

const server = Bun.serve({
  port: env.PORT,
  fetch: (request: Request) => handler(request),
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`[app-server] received ${signal}, shutting down`);
  server.stop(true);
  await Promise.resolve();
}

function registerSignalHandler(signal: NodeJS.Signals): void {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

registerSignalHandler("SIGINT");
registerSignalHandler("SIGTERM");

console.info(
  `[app-server] listening on port ${env.PORT} as ${env.SERVICE_NAME} (${env.NODE_ENV})`,
);
console.info(
  `[app-server] loaded modules: ${moduleLoadReport.loadedModuleIds.join(", ") || "none"}`,
);
