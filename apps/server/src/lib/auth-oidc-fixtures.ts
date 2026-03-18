import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import type { OidcProviderConfig, OidcProviderId } from "./env.js";

export const OIDC_FIXTURE_PROVIDER_IDS = [
  "okta",
  "azure-ad",
  "google-workspace",
  "auth0",
] as const satisfies readonly OidcProviderId[];

export type OidcFixtureClaims = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
};

export type OidcFixtureUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
};

export type MockOidcProvider = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksEndpoint: string;
  close: () => Promise<void>;
};

export type OidcFixture = {
  providerId: OidcProviderId;
  providerConfig: OidcProviderConfig;
  claims: OidcFixtureClaims;
  user: OidcFixtureUser;
};

function createFixtureBaseClaims(): Pick<
  OidcFixtureClaims,
  "sub" | "email" | "email_verified" | "picture"
> {
  return {
    sub: "oidc-fixture-user",
    email: "fixture.user@example.com",
    email_verified: true,
    picture: "https://fixtures.mdcms.local/avatar.png",
  };
}

function createFixtureClaims(providerId: OidcProviderId): OidcFixtureClaims {
  const base = createFixtureBaseClaims();

  switch (providerId) {
    case "okta":
      return {
        ...base,
        name: "Fixture User",
      };
    case "azure-ad":
      return {
        ...base,
        given_name: "Fixture",
        family_name: "User",
      };
    case "google-workspace":
      return {
        ...base,
        preferred_username: "Fixture User",
      };
    case "auth0":
      return {
        ...base,
        name: "Fixture User",
      };
  }
}

function createFixtureProviderConfig(
  providerId: OidcProviderId,
): OidcProviderConfig {
  const baseUrl = `https://fixtures.mdcms.local/${providerId}`;

  return {
    providerId,
    issuer: baseUrl,
    domain: `${providerId}.example.com`,
    clientId: `${providerId}-client-id`,
    clientSecret: `${providerId}-client-secret`,
    scopes: ["openid", "email", "profile"],
    discoveryOverrides: {
      authorizationEndpoint: `${baseUrl}/authorize`,
      tokenEndpoint: `${baseUrl}/token`,
      userInfoEndpoint: `${baseUrl}/userinfo`,
      jwksUri: `${baseUrl}/jwks`,
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  };
}

export function normalizeOidcFixtureClaims(
  claims: OidcFixtureClaims,
): OidcFixtureUser {
  const id = claims.sub?.trim();
  const email = claims.email?.trim();

  if (!id) {
    throw new Error("OIDC fixture claims require sub.");
  }

  if (!email) {
    throw new Error("OIDC fixture claims require email.");
  }

  const preferredName = claims.name?.trim();
  const combinedName = [claims.given_name, claims.family_name]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
  const fallbackName =
    preferredName || combinedName || claims.preferred_username?.trim() || email;

  return {
    id,
    email,
    emailVerified: claims.email_verified === true,
    name: fallbackName,
    image: claims.picture?.trim() || null,
  };
}

export function createOidcFixture(providerId: OidcProviderId): OidcFixture {
  const claims = createFixtureClaims(providerId);

  return {
    providerId,
    providerConfig: createFixtureProviderConfig(providerId),
    claims,
    user: normalizeOidcFixtureClaims(claims),
  };
}

export function createMissingEmailOidcFixture(
  providerId: OidcProviderId,
): OidcFixture {
  const fixture = createOidcFixture(providerId);
  const { email: _email, ...claims } = fixture.claims;

  return {
    ...fixture,
    claims,
  };
}

export function createMissingSubOidcFixture(
  providerId: OidcProviderId,
): OidcFixture {
  const fixture = createOidcFixture(providerId);
  const { sub: _sub, ...claims } = fixture.claims;

  return {
    ...fixture,
    claims,
  };
}

export async function startMockOidcProvider(
  claims: OidcFixtureClaims,
): Promise<MockOidcProvider> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const kid = "mock-oidc-key";
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as Record<string, unknown> & {
    kid?: string;
    use?: string;
    alg?: string;
  };
  publicJwk.kid = kid;
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  let issuer = "";

  async function writeJson(
    response: ServerResponse<IncomingMessage>,
    status: number,
    body: unknown,
  ): Promise<void> {
    response.statusCode = status;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
  }

  async function signIdToken(
    payload: Record<string, unknown>,
  ): Promise<string> {
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid }),
    ).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signingInput = `${header}.${encodedPayload}`;
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );

    return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", issuer);

    if (url.pathname === "/authorize") {
      response.statusCode = 200;
      response.end("ok");
      return;
    }

    if (url.pathname === "/token") {
      const idToken = await signIdToken({
        iss: issuer,
        aud: "mock-client-id",
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        ...claims,
      });

      await writeJson(response, 200, {
        token_type: "Bearer",
        access_token: "mock-access-token",
        expires_in: 300,
        id_token: idToken,
      });
      return;
    }

    if (url.pathname === "/userinfo") {
      await writeJson(response, 200, claims);
      return;
    }

    if (url.pathname === "/jwks") {
      await writeJson(response, 200, {
        keys: [publicJwk],
      });
      return;
    }

    response.statusCode = 404;
    response.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  issuer = `http://127.0.0.1:${address.port}`;

  return {
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    userInfoEndpoint: `${issuer}/userinfo`,
    jwksEndpoint: `${issuer}/jwks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

export function createOidcEnv(
  provider: MockOidcProvider,
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify([
      {
        providerId: "okta",
        issuer: provider.issuer,
        domain: "example.com",
        clientId: "mock-client-id",
        clientSecret: "mock-client-secret",
        scopes: ["openid", "email", "profile"],
        discoveryOverrides: {
          authorizationEndpoint: provider.authorizationEndpoint,
          tokenEndpoint: provider.tokenEndpoint,
          userInfoEndpoint: provider.userInfoEndpoint,
          jwksUri: provider.jwksEndpoint,
          tokenEndpointAuthMethod: "client_secret_basic",
        },
      },
    ]),
  };
}
