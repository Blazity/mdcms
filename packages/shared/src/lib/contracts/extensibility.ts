import { z } from "zod";

import { RuntimeError } from "../runtime/error.js";
import {
  assertActionCatalogList,
  type ActionCatalogItem,
} from "./action-catalog.js";

export const EXTENSIBILITY_API_VERSION = "1" as const;
export const HOST_BRIDGE_VERSION = "1" as const;

/**
 * ModuleKind classifies first-party modules by runtime responsibility.
 */
export type ModuleKind = "domain" | "core";

/**
 * ModuleManifest is the shared server/cli module metadata contract.
 */
export type ModuleManifest = {
  id: string;
  version: string;
  apiVersion: typeof EXTENSIBILITY_API_VERSION;
  kind?: ModuleKind;
  dependsOn?: string[];
  minCoreVersion?: string;
  maxCoreVersion?: string;
};

/**
 * ActionDefinition is the canonical action metadata contract exposed by modules.
 */
export type ActionDefinition = ActionCatalogItem;

/**
 * ServerSurface defines optional server runtime wiring exported by a module.
 */
export type ServerSurface<App = unknown, AppDeps = unknown> = {
  mount: (app: App, deps: AppDeps) => void;
  actions?: ActionDefinition[];
};

/**
 * CliActionAlias maps a local command alias to a backend action id.
 */
export type CliActionAlias = {
  alias: string;
  actionId: string;
};

/**
 * CliOutputFormatter formats action output for human-readable CLI printing.
 */
export type CliOutputFormatter = {
  actionId?: string;
  format: (output: unknown) => string;
};

/**
 * CliPreflightHook runs local checks before executing an action.
 */
export type CliPreflightHook = {
  id: string;
  run: (context: { actionId: string; input: unknown }) => void | Promise<void>;
};

/**
 * CliSurface defines the action-based extensibility hooks supported by CLI.
 */
export type CliSurface = {
  actionAliases?: CliActionAlias[];
  outputFormatters?: CliOutputFormatter[];
  preflightHooks?: CliPreflightHook[];
};

/**
 * MdcmsModulePackage is the unified module contract consumed by server and CLI.
 */
export type MdcmsModulePackage<App = unknown, AppDeps = unknown> = {
  manifest: ModuleManifest;
  server?: ServerSurface<App, AppDeps>;
  cli?: CliSurface;
};

/**
 * StudioExecutionMode declares how the remote Studio runtime is executed.
 */
export type StudioExecutionMode = "iframe" | "module";

/**
 * StudioBootstrapManifest is the server-delivered Studio runtime bootstrap payload.
 */
export type StudioBootstrapManifest = {
  apiVersion: typeof EXTENSIBILITY_API_VERSION;
  studioVersion: string;
  mode: StudioExecutionMode;
  entryUrl: string;
  integritySha256: string;
  signature: string;
  keyId: string;
  buildId: string;
  minStudioPackageVersion: string;
  minHostBridgeVersion: string;
  expiresAt: string;
};

/**
 * HostBridgeV1 is the minimal typed bridge exposed by the host app to Studio.
 */
export type HostBridgeV1 = {
  version: typeof HOST_BRIDGE_VERSION;
  resolveComponent: (name: string) => unknown | null;
  renderMdxPreview: (input: {
    container: unknown;
    componentName: string;
    props: Record<string, unknown>;
    key: string;
  }) => () => void;
};

/**
 * StudioMountContext provides runtime context required by a remote Studio module.
 */
export type StudioMountContext = {
  apiBaseUrl: string;
  auth: {
    mode: "cookie" | "token";
    token?: string;
  };
  hostBridge: HostBridgeV1;
};

/**
 * RemoteStudioModule is the runtime-loaded Studio entry contract.
 */
export type RemoteStudioModule = {
  mount: (container: unknown, ctx: StudioMountContext) => () => void;
};

/**
 * ModuleManifestCompatibilityOptions are runtime inputs for module compatibility checks.
 */
export type ModuleManifestCompatibilityOptions = {
  coreVersion: string;
  supportedApiVersion?: string;
};

/**
 * StudioBootstrapCompatibilityOptions are runtime inputs for Studio bootstrap compatibility checks.
 */
export type StudioBootstrapCompatibilityOptions = {
  studioPackageVersion: string;
  hostBridgeVersion: string;
  supportedApiVersion?: string;
};

type StrictSemver = {
  major: number;
  minor: number;
  patch: number;
  raw: string;
};

const MODULE_KIND_VALUES = ["domain", "core"] as const;
const STUDIO_MODE_VALUES = ["iframe", "module"] as const;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const nonEmptyStringSchema = z.string().trim().min(1, {
  message: "must be a non-empty string.",
});

const strictSemverSchema = nonEmptyStringSchema.refine(
  (value) => SEMVER_PATTERN.test(value),
  {
    message:
      "must use strict x.y.z version format (no pre-release/build metadata).",
  },
);

const functionSchema = z.custom<(...args: unknown[]) => unknown>(
  (value) => typeof value === "function",
  {
    message: "must be a function.",
  },
);

const moduleManifestSchema = z
  .object({
    id: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
    apiVersion: nonEmptyStringSchema.refine(
      (value) => value === EXTENSIBILITY_API_VERSION,
      {
        message: `must be "${EXTENSIBILITY_API_VERSION}".`,
      },
    ),
    kind: z.enum(MODULE_KIND_VALUES).optional(),
    dependsOn: z.array(nonEmptyStringSchema).optional(),
    minCoreVersion: strictSemverSchema.optional(),
    maxCoreVersion: strictSemverSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.dependsOn !== undefined) {
      const seen = new Set<string>();

      manifest.dependsOn.forEach((dependency, index) => {
        if (seen.has(dependency)) {
          context.addIssue({
            code: "custom",
            path: ["dependsOn", index],
            message: `contains duplicate dependency id \"${dependency}\".`,
          });
        }

        seen.add(dependency);
      });
    }

    if (
      manifest.minCoreVersion !== undefined &&
      manifest.maxCoreVersion !== undefined
    ) {
      const minVersion = toStrictSemver(manifest.minCoreVersion);
      const maxVersion = toStrictSemver(manifest.maxCoreVersion);

      if (compareStrictSemver(minVersion, maxVersion) > 0) {
        context.addIssue({
          code: "custom",
          path: ["minCoreVersion"],
          message: "must be less than or equal to maxCoreVersion.",
        });
      }
    }
  });

const cliActionAliasSchema = z
  .object({
    alias: nonEmptyStringSchema,
    actionId: nonEmptyStringSchema,
  })
  .strict();

const cliOutputFormatterSchema = z
  .object({
    actionId: nonEmptyStringSchema.optional(),
    format: functionSchema,
  })
  .strict();

const cliPreflightHookSchema = z
  .object({
    id: nonEmptyStringSchema,
    run: functionSchema,
  })
  .strict();

const cliSurfaceSchema = z
  .object({
    actionAliases: z.array(cliActionAliasSchema).optional(),
    outputFormatters: z.array(cliOutputFormatterSchema).optional(),
    preflightHooks: z.array(cliPreflightHookSchema).optional(),
  })
  .strict();

const serverSurfaceSchema = z
  .object({
    mount: functionSchema,
    actions: z.array(z.unknown()).optional(),
  })
  .strict();

const modulePackageSchema = z
  .object({
    manifest: moduleManifestSchema,
    server: serverSurfaceSchema.optional(),
    cli: cliSurfaceSchema.optional(),
  })
  .strict();

const studioBootstrapManifestSchema = z
  .object({
    apiVersion: nonEmptyStringSchema.refine(
      (value) => value === EXTENSIBILITY_API_VERSION,
      {
        message: `must be "${EXTENSIBILITY_API_VERSION}".`,
      },
    ),
    studioVersion: nonEmptyStringSchema,
    mode: z.enum(STUDIO_MODE_VALUES),
    entryUrl: nonEmptyStringSchema,
    integritySha256: nonEmptyStringSchema,
    signature: nonEmptyStringSchema,
    keyId: nonEmptyStringSchema,
    buildId: nonEmptyStringSchema,
    minStudioPackageVersion: strictSemverSchema,
    minHostBridgeVersion: strictSemverSchema,
    expiresAt: nonEmptyStringSchema.refine(
      (value) => !Number.isNaN(Date.parse(value)),
      {
        message: "must be an ISO-8601 date string.",
      },
    ),
  })
  .strict();

const hostBridgeV1Schema = z
  .object({
    version: nonEmptyStringSchema.refine(
      (value) => value === HOST_BRIDGE_VERSION,
      {
        message: `must be "${HOST_BRIDGE_VERSION}".`,
      },
    ),
    resolveComponent: functionSchema,
    renderMdxPreview: functionSchema,
  })
  .strict();

const studioMountAuthSchema = z
  .object({
    mode: z.enum(["cookie", "token"]),
    token: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((auth, context) => {
    if (auth.mode === "token" && auth.token === undefined) {
      context.addIssue({
        code: "custom",
        path: ["token"],
        message: "must be a non-empty string.",
      });
    }
  });

const studioMountContextSchema = z
  .object({
    apiBaseUrl: nonEmptyStringSchema,
    auth: studioMountAuthSchema,
    hostBridge: hostBridgeV1Schema,
  })
  .strict();

const remoteStudioModuleSchema = z
  .object({
    mount: functionSchema,
  })
  .strict();

const moduleCompatibilityOptionsSchema = z
  .object({
    coreVersion: strictSemverSchema,
    supportedApiVersion: nonEmptyStringSchema.optional(),
  })
  .strict();

const studioCompatibilityOptionsSchema = z
  .object({
    studioPackageVersion: strictSemverSchema,
    hostBridgeVersion: strictSemverSchema,
    supportedApiVersion: nonEmptyStringSchema.optional(),
  })
  .strict();

function toStrictSemver(value: string): StrictSemver {
  const [major, minor, patch] = value.split(".").map(Number);

  return {
    major,
    minor,
    patch,
    raw: value,
  };
}

function compareStrictSemver(
  left: StrictSemver,
  right: StrictSemver,
): -1 | 0 | 1 {
  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }

  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }

  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }

  return 0;
}

function formatIssuePath(
  path: string,
  issuePath: readonly PropertyKey[],
): string {
  if (issuePath.length === 0) {
    return path;
  }

  return issuePath.reduce<string>((acc, segment) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }

    if (typeof segment === "symbol") {
      return `${acc}.[${String(segment)}]`;
    }

    return `${acc}.${segment}`;
  }, path);
}

function toValidationMessage(
  path: string,
  issue: z.core.$ZodIssue,
  fallback: string,
): string {
  const issuePath = formatIssuePath(path, issue.path ?? []);

  if (
    issue.code === "unrecognized_keys" &&
    "keys" in issue &&
    Array.isArray(issue.keys)
  ) {
    return `${issuePath} contains unknown field(s): ${issue.keys.join(", ")}.`;
  }

  if (issue.code === "custom") {
    return `${issuePath} ${issue.message}`;
  }

  if (issue.message) {
    return `${issuePath} ${issue.message}`;
  }

  return fallback;
}

function throwValidationRuntimeError(
  code: string,
  path: string,
  error: z.ZodError,
  fallbackMessage: string,
): never {
  const [firstIssue] = error.issues;
  const message = firstIssue
    ? toValidationMessage(path, firstIssue, fallbackMessage)
    : fallbackMessage;

  throw new RuntimeError({
    code,
    message,
    statusCode: 500,
    details: {
      path: firstIssue ? formatIssuePath(path, firstIssue.path ?? []) : path,
      issues: error.issues,
    },
  });
}

function assertWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: string,
  code: string,
  fallbackMessage: string,
): asserts value is T {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    return;
  }

  throwValidationRuntimeError(code, path, parsed.error, fallbackMessage);
}

/**
 * assertModuleManifest validates module metadata used by server/cli bootstrap.
 * Unknown fields are rejected to keep module contracts deterministic.
 */
export function assertModuleManifest(
  value: unknown,
  path = "manifest",
): asserts value is ModuleManifest {
  assertWithSchema(
    moduleManifestSchema,
    value,
    path,
    "INVALID_MODULE_MANIFEST",
    `${path} is invalid.`,
  );
}

/**
 * assertMdcmsModulePackage validates a bundled module contract and all nested
 * server/cli surface metadata.
 */
export function assertMdcmsModulePackage(
  value: unknown,
  path = "module",
): asserts value is MdcmsModulePackage {
  assertWithSchema(
    modulePackageSchema,
    value,
    path,
    "INVALID_MDCMS_MODULE_PACKAGE",
    `${path} is invalid.`,
  );

  const parsed = modulePackageSchema.parse(value);

  if (parsed.server?.actions !== undefined) {
    try {
      assertActionCatalogList(parsed.server.actions, `${path}.server.actions`);
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw new RuntimeError({
          code: "INVALID_MDCMS_MODULE_PACKAGE",
          message: error.message,
          statusCode: 500,
          details: {
            path: `${path}.server.actions`,
            cause: error.details,
          },
        });
      }

      throw error;
    }
  }
}

/**
 * assertStudioBootstrapManifest validates the server-delivered Studio bootstrap
 * payload, including compatibility metadata and strict object shape checks.
 */
export function assertStudioBootstrapManifest(
  value: unknown,
  path = "studioBootstrapManifest",
): asserts value is StudioBootstrapManifest {
  assertWithSchema(
    studioBootstrapManifestSchema,
    value,
    path,
    "INVALID_STUDIO_BOOTSTRAP_MANIFEST",
    `${path} is invalid.`,
  );
}

/**
 * assertHostBridgeV1 validates the minimum host bridge contract required by
 * Studio runtime module execution mode.
 */
export function assertHostBridgeV1(
  value: unknown,
  path = "hostBridge",
): asserts value is HostBridgeV1 {
  assertWithSchema(
    hostBridgeV1Schema,
    value,
    path,
    "INVALID_STUDIO_RUNTIME_CONTRACT",
    `${path} is invalid.`,
  );
}

/**
 * assertStudioMountContext validates mount-time context for remote Studio
 * runtimes, including auth mode/token constraints.
 */
export function assertStudioMountContext(
  value: unknown,
  path = "studioMountContext",
): asserts value is StudioMountContext {
  assertWithSchema(
    studioMountContextSchema,
    value,
    path,
    "INVALID_STUDIO_RUNTIME_CONTRACT",
    `${path} is invalid.`,
  );
}

/**
 * assertRemoteStudioModule validates runtime-loaded Studio module entry shape.
 */
export function assertRemoteStudioModule(
  value: unknown,
  path = "remoteStudioModule",
): asserts value is RemoteStudioModule {
  assertWithSchema(
    remoteStudioModuleSchema,
    value,
    path,
    "INVALID_STUDIO_RUNTIME_CONTRACT",
    `${path} is invalid.`,
  );
}

/**
 * assertModuleManifestCompatibility verifies module manifest compatibility
 * against the running MDCMS core version and supported API version.
 */
export function assertModuleManifestCompatibility(
  manifest: ModuleManifest,
  options: ModuleManifestCompatibilityOptions,
): void {
  assertModuleManifest(manifest, "manifest");
  assertWithSchema(
    moduleCompatibilityOptionsSchema,
    options,
    "options",
    "INCOMPATIBLE_MODULE_MANIFEST",
    "options is invalid.",
  );

  const parsedOptions = moduleCompatibilityOptionsSchema.parse(options);
  const supportedApiVersion =
    parsedOptions.supportedApiVersion ?? EXTENSIBILITY_API_VERSION;

  if (manifest.apiVersion !== supportedApiVersion) {
    throw new RuntimeError({
      code: "INCOMPATIBLE_MODULE_MANIFEST",
      message: `manifest.apiVersion ${manifest.apiVersion} is not supported (expected ${supportedApiVersion}).`,
      statusCode: 500,
      details: {
        path: "manifest.apiVersion",
        manifestApiVersion: manifest.apiVersion,
        supportedApiVersion,
      },
    });
  }

  const coreVersion = toStrictSemver(parsedOptions.coreVersion);

  if (manifest.minCoreVersion !== undefined) {
    const minVersion = toStrictSemver(manifest.minCoreVersion);

    if (compareStrictSemver(coreVersion, minVersion) < 0) {
      throw new RuntimeError({
        code: "INCOMPATIBLE_MODULE_MANIFEST",
        message: `Core version ${parsedOptions.coreVersion} is below manifest.minCoreVersion ${manifest.minCoreVersion}.`,
        statusCode: 500,
        details: {
          path: "manifest.minCoreVersion",
          coreVersion: parsedOptions.coreVersion,
          minCoreVersion: manifest.minCoreVersion,
        },
      });
    }
  }

  if (manifest.maxCoreVersion !== undefined) {
    const maxVersion = toStrictSemver(manifest.maxCoreVersion);

    if (compareStrictSemver(coreVersion, maxVersion) > 0) {
      throw new RuntimeError({
        code: "INCOMPATIBLE_MODULE_MANIFEST",
        message: `Core version ${parsedOptions.coreVersion} is above manifest.maxCoreVersion ${manifest.maxCoreVersion}.`,
        statusCode: 500,
        details: {
          path: "manifest.maxCoreVersion",
          coreVersion: parsedOptions.coreVersion,
          maxCoreVersion: manifest.maxCoreVersion,
        },
      });
    }
  }
}

/**
 * assertStudioBootstrapCompatibility validates Studio bootstrap compatibility
 * against local package and host bridge versions.
 */
export function assertStudioBootstrapCompatibility(
  manifest: StudioBootstrapManifest,
  options: StudioBootstrapCompatibilityOptions,
): void {
  assertStudioBootstrapManifest(manifest, "manifest");
  assertWithSchema(
    studioCompatibilityOptionsSchema,
    options,
    "options",
    "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST",
    "options is invalid.",
  );

  const parsedOptions = studioCompatibilityOptionsSchema.parse(options);
  const supportedApiVersion =
    parsedOptions.supportedApiVersion ?? EXTENSIBILITY_API_VERSION;

  if (manifest.apiVersion !== supportedApiVersion) {
    throw new RuntimeError({
      code: "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST",
      message: `manifest.apiVersion ${manifest.apiVersion} is not supported (expected ${supportedApiVersion}).`,
      statusCode: 500,
      details: {
        path: "manifest.apiVersion",
        manifestApiVersion: manifest.apiVersion,
        supportedApiVersion,
      },
    });
  }

  const studioPackageVersion = toStrictSemver(
    parsedOptions.studioPackageVersion,
  );
  const hostBridgeVersion = toStrictSemver(parsedOptions.hostBridgeVersion);
  const minStudioPackageVersion = toStrictSemver(
    manifest.minStudioPackageVersion,
  );
  const minHostBridgeVersion = toStrictSemver(manifest.minHostBridgeVersion);

  if (compareStrictSemver(studioPackageVersion, minStudioPackageVersion) < 0) {
    throw new RuntimeError({
      code: "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST",
      message: `Studio package version ${parsedOptions.studioPackageVersion} is below manifest.minStudioPackageVersion ${manifest.minStudioPackageVersion}.`,
      statusCode: 500,
      details: {
        path: "manifest.minStudioPackageVersion",
        studioPackageVersion: parsedOptions.studioPackageVersion,
        minStudioPackageVersion: manifest.minStudioPackageVersion,
      },
    });
  }

  if (compareStrictSemver(hostBridgeVersion, minHostBridgeVersion) < 0) {
    throw new RuntimeError({
      code: "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST",
      message: `Host bridge version ${parsedOptions.hostBridgeVersion} is below manifest.minHostBridgeVersion ${manifest.minHostBridgeVersion}.`,
      statusCode: 500,
      details: {
        path: "manifest.minHostBridgeVersion",
        hostBridgeVersion: parsedOptions.hostBridgeVersion,
        minHostBridgeVersion: manifest.minHostBridgeVersion,
      },
    });
  }
}

/**
 * isModuleManifest is a non-throwing type guard for runtime checks.
 */
export function isModuleManifest(value: unknown): value is ModuleManifest {
  return moduleManifestSchema.safeParse(value).success;
}

/**
 * isStudioBootstrapManifest is a non-throwing type guard for runtime checks.
 */
export function isStudioBootstrapManifest(
  value: unknown,
): value is StudioBootstrapManifest {
  return studioBootstrapManifestSchema.safeParse(value).success;
}
