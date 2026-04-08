import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { RuntimeError } from "@mdcms/shared";

import { createCredentialStore, type CredentialStore } from "./credentials.js";
import type { CliCommand, CliCommandContext } from "./framework.js";

const DEFAULT_CLI_LOGIN_SCOPES = [
  "projects:read",
  "projects:write",
  "schema:read",
  "schema:write",
  "content:read",
  "content:read:draft",
  "content:write",
  "content:write:draft",
  "content:delete",
] as const;

type LoginOptions = {
  credentialStore?: CredentialStore;
  openBrowserUrl?: (url: string) => Promise<boolean>;
  createState?: () => string;
  createCallbackListener?: () => Promise<LoopbackCallbackListener>;
};

export type LoopbackCallbackListener = {
  redirectUri: string;
  waitForCallback: () => Promise<{ code: string; state: string }>;
  close: () => Promise<void>;
};

type LoginStartResponse = {
  challengeId: string;
  authorizeUrl: string;
  expiresAt: string;
};

type LoginExchangeResponse = {
  id: string;
  key: string;
};

function parseLoginArgs(args: string[]): { help: boolean } {
  for (const token of args) {
    if (token === "--help" || token === "-h") {
      continue;
    }

    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Unknown login flag "${token}".`,
      statusCode: 400,
    });
  }

  return {
    help: args.includes("--help") || args.includes("-h"),
  };
}

function renderLoginHelp(): string {
  return [
    "Usage: mdcms login",
    "",
    "Authenticate through browser-based flow and store credentials",
    "for the current server/project/environment tuple.",
    "",
  ].join("\n");
}

export function createLoopbackCallbackListener(): Promise<LoopbackCallbackListener> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = createServer();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finalize = (handler: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      handler();
    };

    const callbackPromise = new Promise<{ code: string; state: string }>(
      (resolveCallback, rejectCallback) => {
        timeout = setTimeout(
          () => {
            finalize(() => {
              rejectCallback(
                new RuntimeError({
                  code: "LOGIN_TIMEOUT",
                  message:
                    "Timed out waiting for browser callback. Please retry `mdcms login`.",
                  statusCode: 408,
                }),
              );
            });
          },
          2 * 60 * 1000,
        );

        server.on("request", (request, response) => {
          const url = new URL(request.url ?? "/", "http://127.0.0.1");

          if (url.pathname !== "/callback") {
            response.statusCode = 404;
            response.end("Not Found");
            return;
          }

          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code || !state) {
            response.statusCode = 400;
            response.end("Missing code/state query params.");
            return;
          }

          response.statusCode = 200;
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(
            "<html><body><h1>MDCMS CLI</h1><p>Login complete. You can close this tab.</p></body></html>",
          );

          finalize(() => {
            resolveCallback({ code, state });
          });
        });
      },
    );

    server.once("error", (error) => {
      finalize(() => {
        reject(
          new RuntimeError({
            code: "INTERNAL_ERROR",
            message: "Failed to start loopback callback listener.",
            statusCode: 500,
            details:
              error instanceof Error ? { cause: error.message } : undefined,
          }),
        );
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finalize(() => {
          reject(
            new RuntimeError({
              code: "INTERNAL_ERROR",
              message: "Failed to resolve loopback callback listener address.",
              statusCode: 500,
            }),
          );
        });
        return;
      }

      const listener: LoopbackCallbackListener = {
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        waitForCallback: () => callbackPromise,
        close: async () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          }),
      };

      resolve(listener);
    });
  });
}

export async function openBrowserUrl(url: string): Promise<boolean> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const child = spawn("open", [url], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    }

    if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    }

    const child = spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function parseStartResponse(payload: unknown): LoginStartResponse {
  const body = payload as {
    data?: {
      challengeId?: unknown;
      authorizeUrl?: unknown;
      expiresAt?: unknown;
    };
  };

  if (
    !body?.data ||
    typeof body.data.challengeId !== "string" ||
    typeof body.data.authorizeUrl !== "string" ||
    typeof body.data.expiresAt !== "string"
  ) {
    throw new RuntimeError({
      code: "REMOTE_ERROR",
      message: "Login start response payload is invalid.",
      statusCode: 502,
    });
  }

  return {
    challengeId: body.data.challengeId,
    authorizeUrl: body.data.authorizeUrl,
    expiresAt: body.data.expiresAt,
  };
}

function parseExchangeResponse(payload: unknown): LoginExchangeResponse {
  const body = payload as {
    data?: {
      id?: unknown;
      key?: unknown;
    };
  };

  if (
    !body?.data ||
    typeof body.data.id !== "string" ||
    typeof body.data.key !== "string"
  ) {
    throw new RuntimeError({
      code: "REMOTE_ERROR",
      message: "Login exchange response payload is invalid.",
      statusCode: 502,
    });
  }

  return {
    id: body.data.id,
    key: body.data.key,
  };
}

function throwRemoteError(
  responseStatus: number,
  payload: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): never {
  const body = payload as { code?: unknown; message?: unknown };
  throw new RuntimeError({
    code: typeof body?.code === "string" ? body.code : fallbackCode,
    message: typeof body?.message === "string" ? body.message : fallbackMessage,
    statusCode: responseStatus,
  });
}

export function createLoginCommand(options: LoginOptions = {}): CliCommand {
  const openUrl = options.openBrowserUrl ?? openBrowserUrl;
  const createState =
    options.createState ??
    (() => `state_${randomBytes(18).toString("base64url")}_${Date.now()}`);
  const createListener =
    options.createCallbackListener ?? createLoopbackCallbackListener;

  return {
    name: "login",
    description: "Authenticate via browser flow and store scoped credentials",
    requiresTarget: false,
    requiresConfig: false,
    run: async (context: CliCommandContext): Promise<number> => {
      const store =
        options.credentialStore ??
        createCredentialStore({
          env: context.env,
        });
      const parsed = parseLoginArgs(context.args);
      if (parsed.help) {
        context.stdout.write(`${renderLoginHelp()}\n`);
        return 0;
      }

      const listener = await createListener();
      const state = createState();

      try {
        const startResponse = await context.fetcher(
          `${context.serverUrl}/api/v1/auth/cli/login/start`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              redirectUri: listener.redirectUri,
              state,
              scopes: DEFAULT_CLI_LOGIN_SCOPES,
            }),
          },
        );
        const startBody = await startResponse.json().catch(() => undefined);

        if (!startResponse.ok) {
          throwRemoteError(
            startResponse.status,
            startBody,
            "REMOTE_ERROR",
            "Failed to start CLI login flow.",
          );
        }

        const start = parseStartResponse(startBody);
        const browserOpened = await openUrl(start.authorizeUrl);

        if (!browserOpened) {
          context.stdout.write(
            `Could not open browser automatically. Open this URL manually:\n${start.authorizeUrl}\n`,
          );
        } else {
          context.stdout.write(
            "Browser login started. Complete authentication in your browser...\n",
          );
        }

        const callback = await listener.waitForCallback();
        if (callback.state !== state) {
          throw new RuntimeError({
            code: "INVALID_LOGIN_EXCHANGE",
            message:
              "Browser callback state does not match login request state.",
            statusCode: 400,
          });
        }

        const exchangeResponse = await context.fetcher(
          `${context.serverUrl}/api/v1/auth/cli/login/exchange`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              challengeId: start.challengeId,
              state,
              code: callback.code,
            }),
          },
        );
        const exchangeBody = await exchangeResponse
          .json()
          .catch(() => undefined);

        if (!exchangeResponse.ok) {
          throwRemoteError(
            exchangeResponse.status,
            exchangeBody,
            "REMOTE_ERROR",
            "Failed to exchange CLI login code.",
          );
        }

        const exchanged = parseExchangeResponse(exchangeBody);
        const nowIso = new Date().toISOString();

        await store.setProfile(
          {
            serverUrl: context.serverUrl!,
            project: context.project ?? "*",
            environment: context.environment ?? "*",
          },
          {
            authMode: "api_key",
            apiKey: exchanged.key,
            apiKeyId: exchanged.id,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        );

        context.stdout.write(
          `Login successful for ${context.project ?? "*"}/${context.environment ?? "*"}. Credentials stored.\n`,
        );
        context.stdout.write(
          `MDCMS_DEMO_API_KEY="${exchanged.key}" (use this value for demo app requests if needed).\n`,
        );

        return 0;
      } finally {
        await listener.close();
      }
    },
  };
}
