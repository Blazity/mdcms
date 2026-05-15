import { parseServerEnv } from "../lib/env.js";
import { prepareServerRequestHandlerWithModules } from "../lib/runtime-with-modules.js";

type BunServer = {
  stop: (closeActiveConnections?: boolean) => void;
};

type BunRuntime = {
  serve: (options: {
    port: number;
    fetch: (request: Request) => Response | Promise<Response>;
    /** Per-connection idle timeout in seconds. Bun defaults to 10s, which
     * is far too short for SSE chat streams that sit awaiting the next
     * token from the LLM — we set it to Bun's maximum (255s) so any
     * realistic generation completes before the socket gets closed. */
    idleTimeout?: number;
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
  idleTimeout: 255,
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
