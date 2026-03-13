import { parseServerEnv } from "../lib/env.js";
import { prepareServerRequestHandlerWithModules } from "../lib/runtime-with-modules.js";

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
const { handler } = await prepareServerRequestHandlerWithModules({
  env: process.env,
});

const server = Bun.serve({
  port: env.PORT,
  fetch: handler,
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`[server] received ${signal}, shutting down`);
  server.stop(true);
}

function registerSignalHandler(signal: NodeJS.Signals): void {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

registerSignalHandler("SIGINT");
registerSignalHandler("SIGTERM");

console.info(
  `[server] listening on port ${env.PORT} as ${env.SERVICE_NAME} (${env.NODE_ENV})`,
);
