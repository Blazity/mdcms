import assert from "node:assert/strict";
import { test } from "node:test";

import { createInMemoryCredentialStore } from "./credentials.js";
import { runMdcmsCli } from "./framework.js";
import { createLoginCommand } from "./login.js";

test("login command stores exchanged API key in scoped credential profile", async () => {
  const credentialStore = createInMemoryCredentialStore();
  let openedUrl: string | undefined;
  let startCalled = false;
  let exchangeCalled = false;

  const exitCode = await runMdcmsCli(["login"], {
    commands: [
      createLoginCommand({
        credentialStore,
        createState: () => "state_test_login_abcdefghijklmnop",
        openBrowserUrl: async (url) => {
          openedUrl = url;
          return true;
        },
        createCallbackListener: async () => ({
          redirectUri: "http://127.0.0.1:41001/callback",
          waitForCallback: async () => ({
            code: "code_test_login_abcdefghijklmnop",
            state: "state_test_login_abcdefghijklmnop",
          }),
          close: async () => undefined,
        }),
      }),
    ],
    env: {} as NodeJS.ProcessEnv,
    fetcher: async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/v1/auth/cli/login/start")) {
        startCalled = true;
        const body = JSON.parse(String(init?.body)) as {
          redirectUri: string;
          state: string;
          scopes: string[];
          project?: string;
        };
        assert.equal(body.project, undefined);
        assert.equal(body.redirectUri, "http://127.0.0.1:41001/callback");
        assert.equal(body.state, "state_test_login_abcdefghijklmnop");
        assert.ok(body.scopes.includes("projects:read"));
        assert.ok(body.scopes.includes("projects:write"));

        return new Response(
          JSON.stringify({
            data: {
              challengeId: "challenge-id-1",
              authorizeUrl:
                "http://localhost:4000/api/v1/auth/cli/login/authorize?challenge=challenge-id-1&state=state_test_login_abcdefghijklmnop",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/api/v1/auth/cli/login/exchange")) {
        exchangeCalled = true;
        const body = JSON.parse(String(init?.body)) as {
          challengeId: string;
          state: string;
          code: string;
        };
        assert.equal(body.challengeId, "challenge-id-1");
        assert.equal(body.state, "state_test_login_abcdefghijklmnop");
        assert.equal(body.code, "code_test_login_abcdefghijklmnop");

        return new Response(
          JSON.stringify({
            data: {
              id: "key-id-1",
              key: "mdcms_key_test_value",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected URL in fetch mock: ${url}`);
    },
    loadConfig: async () => ({
      config: {
        serverUrl: "http://localhost:4000",
        project: "marketing-site",
        environment: "staging",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
  });

  assert.equal(exitCode, 0);
  assert.equal(startCalled, true);
  assert.equal(exchangeCalled, true);
  assert.ok(openedUrl);

  const stored = await credentialStore.getProfile({
    serverUrl: "http://localhost:4000",
    project: "marketing-site",
    environment: "staging",
  });
  assert.ok(stored);
  assert.equal(stored?.apiKey, "mdcms_key_test_value");
  assert.equal(stored?.apiKeyId, "key-id-1");
});

test("login command prints manual URL when browser cannot be opened", async () => {
  let stdout = "";

  const exitCode = await runMdcmsCli(["login"], {
    commands: [
      createLoginCommand({
        credentialStore: createInMemoryCredentialStore(),
        createState: () => "state_manual_abcdefghijklmnop",
        openBrowserUrl: async () => false,
        createCallbackListener: async () => ({
          redirectUri: "http://127.0.0.1:41002/callback",
          waitForCallback: async () => ({
            code: "code_manual_abcdefghijklmnop",
            state: "state_manual_abcdefghijklmnop",
          }),
          close: async () => undefined,
        }),
      }),
    ],
    env: {} as NodeJS.ProcessEnv,
    fetcher: async (input) => {
      const url = String(input);

      if (url.endsWith("/api/v1/auth/cli/login/start")) {
        return new Response(
          JSON.stringify({
            data: {
              challengeId: "challenge-id-2",
              authorizeUrl: "http://localhost:4000/auth",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.endsWith("/api/v1/auth/cli/login/exchange")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "key-id-2",
              key: "mdcms_key_manual",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`Unexpected URL in fetch mock: ${url}`);
    },
    loadConfig: async () => ({
      config: {
        serverUrl: "http://localhost:4000",
        project: "marketing-site",
        environment: "staging",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: { write: () => undefined },
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.includes("Open this URL manually"), true);
});
