import {
  RuntimeError,
  extendEnv,
  parseCoreEnv,
  type CoreEnv,
} from "@mdcms/shared";

const OIDC_PROVIDER_IDS = [
  "okta",
  "azure-ad",
  "google-workspace",
  "auth0",
] as const;
const DEFAULT_OIDC_SCOPES = ["openid", "email", "profile"] as const;
const TOKEN_ENDPOINT_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
] as const;

export type OidcProviderId = (typeof OIDC_PROVIDER_IDS)[number];
export type OidcTokenEndpointAuthMethod =
  (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

export type OidcDiscoveryOverrides = {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  jwksUri?: string;
  tokenEndpointAuthMethod?: OidcTokenEndpointAuthMethod;
};

export type OidcProviderConfig = {
  providerId: OidcProviderId;
  issuer: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  trustedOrigins?: string[];
  discoveryOverrides?: OidcDiscoveryOverrides;
};

export type ServerEnv = CoreEnv & {
  PORT: number;
  SERVICE_NAME: string;
  MDCMS_AUTH_OIDC_PROVIDERS: OidcProviderConfig[];
};

function parsePort(rawValue: string | undefined): number {
  const resolvedValue = rawValue ?? "4000";
  const parsedPort = Number(resolvedValue);

  if (Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
    return parsedPort;
  }

  throw new RuntimeError({
    code: "INVALID_ENV",
    message: "PORT must be an integer between 1 and 65535.",
    details: {
      key: "PORT",
      value: resolvedValue,
    },
  });
}

function createInvalidEnvError(
  value: unknown,
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_ENV",
    message,
    details: {
      key: "MDCMS_AUTH_OIDC_PROVIDERS",
      value,
      ...details,
    },
  });
}

function parseNonEmptyString(
  value: unknown,
  field: string,
  index: number,
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw createInvalidEnvError(value, `${field} must be a non-empty string.`, {
    field,
    index,
  });
}

function parseAbsoluteUrl(
  value: unknown,
  field: string,
  index: number,
): string {
  const resolved = parseNonEmptyString(value, field, index);

  try {
    const url = new URL(resolved);

    if (
      url.pathname === "/" &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      !resolved.endsWith("/")
    ) {
      return url.origin;
    }

    return url.toString();
  } catch {
    throw createInvalidEnvError(value, `${field} must be an absolute URL.`, {
      field,
      index,
    });
  }
}

function parseOrigin(value: unknown, field: string, index: number): string {
  const resolved = parseAbsoluteUrl(value, field, index);
  const url = new URL(resolved);

  if (
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    (resolved !== url.origin && resolved !== url.origin + "/")
  ) {
    throw createInvalidEnvError(
      value,
      `${field} must be an absolute origin in scheme://host[:port] form.`,
      {
        field,
        index,
      },
    );
  }

  return url.origin;
}

function parseScopes(value: unknown, index: number): string[] {
  if (value === undefined) {
    return [...DEFAULT_OIDC_SCOPES];
  }

  if (!Array.isArray(value)) {
    throw createInvalidEnvError(value, "scopes must be an array of strings.", {
      field: "scopes",
      index,
    });
  }

  const scopes = value.map((scope) =>
    parseNonEmptyString(scope, "scopes", index),
  );

  if (scopes.length === 0) {
    throw createInvalidEnvError(value, "scopes must not be empty.", {
      field: "scopes",
      index,
    });
  }

  return scopes;
}

function parseTrustedOrigins(
  value: unknown,
  index: number,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createInvalidEnvError(
      value,
      "trustedOrigins must be an array of absolute origins.",
      {
        field: "trustedOrigins",
        index,
      },
    );
  }

  return value.map((origin) => parseOrigin(origin, "trustedOrigins", index));
}

function parseDiscoveryOverrides(
  value: unknown,
  index: number,
): OidcDiscoveryOverrides | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createInvalidEnvError(
      value,
      "discoveryOverrides must be an object when provided.",
      {
        field: "discoveryOverrides",
        index,
      },
    );
  }

  const input = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "authorizationEndpoint",
    "tokenEndpoint",
    "userInfoEndpoint",
    "jwksUri",
    "tokenEndpointAuthMethod",
  ]);

  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw createInvalidEnvError(
        value,
        `discoveryOverrides.${key} is not supported.`,
        {
          field: "discoveryOverrides",
          index,
          overrideKey: key,
        },
      );
    }
  }

  const tokenEndpointAuthMethod = input.tokenEndpointAuthMethod;
  if (
    tokenEndpointAuthMethod !== undefined &&
    !TOKEN_ENDPOINT_AUTH_METHODS.includes(
      tokenEndpointAuthMethod as OidcTokenEndpointAuthMethod,
    )
  ) {
    throw createInvalidEnvError(
      tokenEndpointAuthMethod,
      "discoveryOverrides.tokenEndpointAuthMethod must be client_secret_basic or client_secret_post.",
      {
        field: "discoveryOverrides.tokenEndpointAuthMethod",
        index,
      },
    );
  }

  return {
    authorizationEndpoint:
      input.authorizationEndpoint === undefined
        ? undefined
        : parseAbsoluteUrl(
            input.authorizationEndpoint,
            "discoveryOverrides.authorizationEndpoint",
            index,
          ),
    tokenEndpoint:
      input.tokenEndpoint === undefined
        ? undefined
        : parseAbsoluteUrl(
            input.tokenEndpoint,
            "discoveryOverrides.tokenEndpoint",
            index,
          ),
    userInfoEndpoint:
      input.userInfoEndpoint === undefined
        ? undefined
        : parseAbsoluteUrl(
            input.userInfoEndpoint,
            "discoveryOverrides.userInfoEndpoint",
            index,
          ),
    jwksUri:
      input.jwksUri === undefined
        ? undefined
        : parseAbsoluteUrl(input.jwksUri, "discoveryOverrides.jwksUri", index),
    tokenEndpointAuthMethod: tokenEndpointAuthMethod as
      | OidcTokenEndpointAuthMethod
      | undefined,
  };
}

function parseOidcProviderId(value: unknown, index: number): OidcProviderId {
  const providerId = parseNonEmptyString(value, "providerId", index);

  if (OIDC_PROVIDER_IDS.includes(providerId as OidcProviderId)) {
    return providerId as OidcProviderId;
  }

  throw createInvalidEnvError(value, "providerId is not supported.", {
    field: "providerId",
    index,
  });
}

function parseOidcProviders(
  rawValue: string | undefined,
): OidcProviderConfig[] {
  const resolvedValue = rawValue?.trim();

  if (!resolvedValue) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(resolvedValue);
  } catch {
    throw createInvalidEnvError(
      rawValue,
      "MDCMS_AUTH_OIDC_PROVIDERS must be valid JSON.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw createInvalidEnvError(
      parsed,
      "MDCMS_AUTH_OIDC_PROVIDERS must be a JSON array.",
    );
  }

  const providerIds = new Set<string>();
  const domains = new Set<string>();

  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw createInvalidEnvError(
        entry,
        "Each OIDC provider entry must be an object.",
        { index },
      );
    }

    const input = entry as Record<string, unknown>;
    const providerId = parseOidcProviderId(input.providerId, index);
    const domain = parseNonEmptyString(
      input.domain,
      "domain",
      index,
    ).toLowerCase();

    if (providerIds.has(providerId)) {
      throw createInvalidEnvError(
        providerId,
        `providerId ${providerId} must be unique.`,
        { field: "providerId", index },
      );
    }

    if (domains.has(domain)) {
      throw createInvalidEnvError(domain, `domain ${domain} must be unique.`, {
        field: "domain",
        index,
      });
    }

    providerIds.add(providerId);
    domains.add(domain);

    return {
      providerId,
      issuer: parseAbsoluteUrl(input.issuer, "issuer", index),
      domain,
      clientId: parseNonEmptyString(input.clientId, "clientId", index),
      clientSecret: parseNonEmptyString(
        input.clientSecret,
        "clientSecret",
        index,
      ),
      scopes: parseScopes(input.scopes, index),
      trustedOrigins: parseTrustedOrigins(input.trustedOrigins, index),
      discoveryOverrides: parseDiscoveryOverrides(
        input.discoveryOverrides,
        index,
      ),
    };
  });
}

/**
 * parseServerEnv extends the shared core runtime env with server-specific
 * settings used for health and request handling.
 */
export function parseServerEnv(rawEnv: NodeJS.ProcessEnv): ServerEnv {
  const core = parseCoreEnv(rawEnv);

  return extendEnv(core, () => ({
    PORT: parsePort(rawEnv.PORT),
    SERVICE_NAME: rawEnv.SERVICE_NAME?.trim() || "mdcms-server",
    MDCMS_AUTH_OIDC_PROVIDERS: parseOidcProviders(
      rawEnv.MDCMS_AUTH_OIDC_PROVIDERS,
    ),
  }));
}
