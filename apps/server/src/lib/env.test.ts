import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import { parseServerEnv } from "./env.js";

test("parseServerEnv parses valid OIDC provider config", () => {
  const env = parseServerEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "1.2.3",
    PORT: "4100",
    SERVICE_NAME: "mdcms-server",
    MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
      {
        providerId: "okta",
        issuer: "https://example.okta.com/oauth2/default",
        domain: "example.com",
        clientId: "okta-client-id",
        clientSecret: "okta-client-secret",
        scopes: ["openid", "email", "profile"],
        trustedOrigins: ["https://fixtures.mdcms.local"],
        discoveryOverrides: {
          authorizationEndpoint: "https://fixtures.mdcms.local/authorize",
          tokenEndpoint: "https://fixtures.mdcms.local/token",
          userInfoEndpoint: "https://fixtures.mdcms.local/userinfo",
          jwksUri: "https://fixtures.mdcms.local/jwks",
          tokenEndpointAuthMethod: "client_secret_post",
        },
      },
    ]),
  } as NodeJS.ProcessEnv);

  assert.equal(env.PORT, 4100);
  assert.equal(env.MDCMS_AUTH_OIDC_PROVIDERS.length, 1);
  assert.deepEqual(env.MDCMS_AUTH_OIDC_PROVIDERS[0], {
    providerId: "okta",
    issuer: "https://example.okta.com/oauth2/default",
    domain: "example.com",
    clientId: "okta-client-id",
    clientSecret: "okta-client-secret",
    scopes: ["openid", "email", "profile"],
    trustedOrigins: ["https://fixtures.mdcms.local"],
    discoveryOverrides: {
      authorizationEndpoint: "https://fixtures.mdcms.local/authorize",
      tokenEndpoint: "https://fixtures.mdcms.local/token",
      userInfoEndpoint: "https://fixtures.mdcms.local/userinfo",
      jwksUri: "https://fixtures.mdcms.local/jwks",
      tokenEndpointAuthMethod: "client_secret_post",
    },
  });
});

test("parseServerEnv preserves bare-origin OIDC issuers without adding a slash", () => {
  const env = parseServerEnv({
    MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
      {
        providerId: "auth0",
        issuer: "https://tenant.example.com",
        domain: "example.com",
        clientId: "auth0-client-id",
        clientSecret: "auth0-client-secret",
      },
    ]),
  } as NodeJS.ProcessEnv);

  assert.equal(
    env.MDCMS_AUTH_OIDC_PROVIDERS[0]?.issuer,
    "https://tenant.example.com",
  );
});

test("parseServerEnv rejects malformed OIDC provider JSON", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: "not-json",
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});

test("parseServerEnv rejects non-array OIDC provider payloads", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify({
          providerId: "okta",
        }),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message === "MDCMS_AUTH_OIDC_PROVIDERS must be a JSON array.",
  );
});

test("parseServerEnv rejects unsupported OIDC provider IDs", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "github",
            issuer: "https://github.example.com",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});

test("parseServerEnv rejects duplicate OIDC provider IDs and domains", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://okta-a.example.com",
            domain: "example.com",
            clientId: "client-id-a",
            clientSecret: "client-secret-a",
          },
          {
            providerId: "okta",
            issuer: "https://okta-b.example.com",
            domain: "example.com",
            clientId: "client-id-b",
            clientSecret: "client-secret-b",
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});

test("parseServerEnv rejects missing required OIDC provider fields", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});

test("parseServerEnv rejects blank scope entries as non-empty strings", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://example.okta.com/oauth2/default",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
            scopes: ["openid", "   "],
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message === "scopes must be a non-empty string.",
  );
});

test("parseServerEnv rejects empty scopes arrays", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://example.okta.com/oauth2/default",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
            scopes: [],
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message === "scopes must not be empty.",
  );
});

test("parseServerEnv preserves non-empty-string errors for blank OIDC URL fields", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message === "issuer must be a non-empty string.",
  );

  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://example.okta.com/oauth2/default",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
            discoveryOverrides: {
              authorizationEndpoint: "",
            },
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message ===
        "discoveryOverrides.authorizationEndpoint must be a non-empty string.",
  );
});

test("parseServerEnv preserves discovery override unknown-key and auth-method envelopes", () => {
  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://example.okta.com/oauth2/default",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
            discoveryOverrides: {
              unsupported: "https://fixtures.mdcms.local/unsupported",
            },
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message === "discoveryOverrides.unsupported is not supported." &&
      error.details?.overrideKey === "unsupported",
  );

  assert.throws(
    () =>
      parseServerEnv({
        MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
          {
            providerId: "okta",
            issuer: "https://example.okta.com/oauth2/default",
            domain: "example.com",
            clientId: "client-id",
            clientSecret: "client-secret",
            discoveryOverrides: {
              tokenEndpointAuthMethod: "private_key_jwt",
            },
          },
        ]),
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.message ===
        "discoveryOverrides.tokenEndpointAuthMethod must be client_secret_basic or client_secret_post.",
  );
});
