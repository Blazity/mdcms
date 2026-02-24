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

const MODULE_KINDS: ModuleKind[] = ["domain", "core"];
const STUDIO_MODES: StudioExecutionMode[] = ["iframe", "module"];
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const MODULE_MANIFEST_KEYS = [
  "id",
  "version",
  "apiVersion",
  "kind",
  "dependsOn",
  "minCoreVersion",
  "maxCoreVersion",
] as const;
const MODULE_PACKAGE_KEYS = ["manifest", "server", "cli"] as const;
const SERVER_SURFACE_KEYS = ["mount", "actions"] as const;
const CLI_SURFACE_KEYS = [
  "actionAliases",
  "outputFormatters",
  "preflightHooks",
] as const;
const CLI_ACTION_ALIAS_KEYS = ["alias", "actionId"] as const;
const CLI_OUTPUT_FORMATTER_KEYS = ["actionId", "format"] as const;
const CLI_PREFLIGHT_HOOK_KEYS = ["id", "run"] as const;
const STUDIO_BOOTSTRAP_KEYS = [
  "apiVersion",
  "studioVersion",
  "mode",
  "entryUrl",
  "integritySha256",
  "signature",
  "keyId",
  "buildId",
  "minStudioPackageVersion",
  "minHostBridgeVersion",
  "expiresAt",
] as const;
const HOST_BRIDGE_KEYS = [
  "version",
  "resolveComponent",
  "renderMdxPreview",
] as const;
const STUDIO_MOUNT_CONTEXT_KEYS = ["apiBaseUrl", "auth", "hostBridge"] as const;
const STUDIO_MOUNT_AUTH_KEYS = ["mode", "token"] as const;
const REMOTE_STUDIO_MODULE_KEYS = ["mount"] as const;
const MODULE_COMPATIBILITY_OPTIONS_KEYS = [
  "coreVersion",
  "supportedApiVersion",
] as const;
const STUDIO_COMPATIBILITY_OPTIONS_KEYS = [
  "studioPackageVersion",
  "hostBridgeVersion",
  "supportedApiVersion",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function throwContractError(
  code: string,
  message: string,
  details: Record<string, unknown>,
): never {
  throw new RuntimeError({
    code,
    message,
    statusCode: 500,
    details,
  });
}

function assertRecord(
  value: unknown,
  path: string,
  code: string,
): asserts value is Record<string, unknown> {
  if (isRecord(value)) {
    return;
  }

  throwContractError(code, `${path} must be an object.`, {
    path,
    valueType: toValueType(value),
  });
}

function assertNoUnknownKeys(
  value: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  code: string,
): void {
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );

  if (unknownKeys.length === 0) {
    return;
  }

  throwContractError(
    code,
    `${path} contains unknown field(s): ${unknownKeys.join(", ")}.`,
    {
      path,
      unknownKeys,
      allowedKeys,
    },
  );
}

function assertRequiredNonEmptyString(
  value: unknown,
  path: string,
  code: string,
): asserts value is string {
  if (typeof value === "string" && value.trim().length > 0) {
    return;
  }

  throwContractError(code, `${path} must be a non-empty string.`, {
    path,
    valueType: toValueType(value),
    value,
  });
}

function assertOptionalNonEmptyString(
  value: unknown,
  path: string,
  code: string,
): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }

  assertRequiredNonEmptyString(value, path, code);
}

function assertFunction(
  value: unknown,
  path: string,
  code: string,
): asserts value is (...args: unknown[]) => unknown {
  if (typeof value === "function") {
    return;
  }

  throwContractError(code, `${path} must be a function.`, {
    path,
    valueType: toValueType(value),
  });
}

function parseStrictSemver(
  value: string,
  path: string,
  code: string,
): StrictSemver {
  const match = SEMVER_PATTERN.exec(value);

  if (!match) {
    throwContractError(
      code,
      `${path} must use strict x.y.z version format (no pre-release/build metadata).`,
      {
        path,
        value,
      },
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
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

function assertOptionalStrictSemver(
  value: unknown,
  path: string,
  code: string,
): StrictSemver | undefined {
  if (value === undefined) {
    return undefined;
  }

  assertRequiredNonEmptyString(value, path, code);
  return parseStrictSemver(value, path, code);
}

function assertDependsOnArray(
  value: unknown,
  path: string,
  code: string,
): asserts value is string[] | undefined {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throwContractError(code, `${path} must be an array of non-empty strings.`, {
      path,
      valueType: toValueType(value),
    });
  }

  const seen = new Set<string>();

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    assertRequiredNonEmptyString(item, itemPath, code);

    if (seen.has(item)) {
      throwContractError(
        code,
        `${path} contains duplicate dependency id "${item}".`,
        {
          path,
          value: item,
        },
      );
    }

    seen.add(item);
  });
}

/**
 * assertModuleManifest validates module metadata used by server/cli bootstrap.
 * Unknown fields are rejected to keep module contracts deterministic.
 */
export function assertModuleManifest(
  value: unknown,
  path = "manifest",
): asserts value is ModuleManifest {
  const code = "INVALID_MODULE_MANIFEST";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, MODULE_MANIFEST_KEYS, code);

  assertRequiredNonEmptyString(value.id, `${path}.id`, code);
  assertRequiredNonEmptyString(value.version, `${path}.version`, code);
  assertRequiredNonEmptyString(value.apiVersion, `${path}.apiVersion`, code);

  if (value.apiVersion !== EXTENSIBILITY_API_VERSION) {
    throwContractError(
      code,
      `${path}.apiVersion must be "${EXTENSIBILITY_API_VERSION}".`,
      {
        path: `${path}.apiVersion`,
        value: value.apiVersion,
      },
    );
  }

  if (value.kind !== undefined) {
    if (
      typeof value.kind !== "string" ||
      !MODULE_KINDS.includes(value.kind as ModuleKind)
    ) {
      throwContractError(
        code,
        `${path}.kind must be one of: ${MODULE_KINDS.join(", ")}.`,
        {
          path: `${path}.kind`,
          value: value.kind,
        },
      );
    }
  }

  assertDependsOnArray(value.dependsOn, `${path}.dependsOn`, code);

  const minVersion = assertOptionalStrictSemver(
    value.minCoreVersion,
    `${path}.minCoreVersion`,
    code,
  );
  const maxVersion = assertOptionalStrictSemver(
    value.maxCoreVersion,
    `${path}.maxCoreVersion`,
    code,
  );

  if (
    minVersion !== undefined &&
    maxVersion !== undefined &&
    compareStrictSemver(minVersion, maxVersion) > 0
  ) {
    throwContractError(
      code,
      `${path}.minCoreVersion must be less than or equal to ${path}.maxCoreVersion.`,
      {
        path,
        minCoreVersion: minVersion.raw,
        maxCoreVersion: maxVersion.raw,
      },
    );
  }
}

/**
 * assertMdcmsModulePackage validates a bundled module contract and all nested
 * server/cli surface metadata.
 */
export function assertMdcmsModulePackage(
  value: unknown,
  path = "module",
): asserts value is MdcmsModulePackage {
  const code = "INVALID_MDCMS_MODULE_PACKAGE";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, MODULE_PACKAGE_KEYS, code);

  if (value.manifest === undefined) {
    throwContractError(code, `${path}.manifest is required.`, {
      path: `${path}.manifest`,
    });
  }

  assertModuleManifest(value.manifest, `${path}.manifest`);

  if (value.server !== undefined) {
    assertRecord(value.server, `${path}.server`, code);
    assertNoUnknownKeys(
      value.server,
      `${path}.server`,
      SERVER_SURFACE_KEYS,
      code,
    );

    assertFunction(value.server.mount, `${path}.server.mount`, code);

    if (value.server.actions !== undefined) {
      assertActionCatalogList(value.server.actions, `${path}.server.actions`);
    }
  }

  if (value.cli !== undefined) {
    assertRecord(value.cli, `${path}.cli`, code);
    assertNoUnknownKeys(value.cli, `${path}.cli`, CLI_SURFACE_KEYS, code);

    if (value.cli.actionAliases !== undefined) {
      if (!Array.isArray(value.cli.actionAliases)) {
        throwContractError(
          code,
          `${path}.cli.actionAliases must be an array when provided.`,
          {
            path: `${path}.cli.actionAliases`,
            valueType: toValueType(value.cli.actionAliases),
          },
        );
      }

      value.cli.actionAliases.forEach((alias, index) => {
        const aliasPath = `${path}.cli.actionAliases[${index}]`;
        assertRecord(alias, aliasPath, code);
        assertNoUnknownKeys(alias, aliasPath, CLI_ACTION_ALIAS_KEYS, code);
        assertRequiredNonEmptyString(alias.alias, `${aliasPath}.alias`, code);
        assertRequiredNonEmptyString(
          alias.actionId,
          `${aliasPath}.actionId`,
          code,
        );
      });
    }

    if (value.cli.outputFormatters !== undefined) {
      if (!Array.isArray(value.cli.outputFormatters)) {
        throwContractError(
          code,
          `${path}.cli.outputFormatters must be an array when provided.`,
          {
            path: `${path}.cli.outputFormatters`,
            valueType: toValueType(value.cli.outputFormatters),
          },
        );
      }

      value.cli.outputFormatters.forEach((formatter, index) => {
        const formatterPath = `${path}.cli.outputFormatters[${index}]`;
        assertRecord(formatter, formatterPath, code);
        assertNoUnknownKeys(
          formatter,
          formatterPath,
          CLI_OUTPUT_FORMATTER_KEYS,
          code,
        );
        assertOptionalNonEmptyString(
          formatter.actionId,
          `${formatterPath}.actionId`,
          code,
        );
        assertFunction(formatter.format, `${formatterPath}.format`, code);
      });
    }

    if (value.cli.preflightHooks !== undefined) {
      if (!Array.isArray(value.cli.preflightHooks)) {
        throwContractError(
          code,
          `${path}.cli.preflightHooks must be an array when provided.`,
          {
            path: `${path}.cli.preflightHooks`,
            valueType: toValueType(value.cli.preflightHooks),
          },
        );
      }

      value.cli.preflightHooks.forEach((hook, index) => {
        const hookPath = `${path}.cli.preflightHooks[${index}]`;
        assertRecord(hook, hookPath, code);
        assertNoUnknownKeys(hook, hookPath, CLI_PREFLIGHT_HOOK_KEYS, code);
        assertRequiredNonEmptyString(hook.id, `${hookPath}.id`, code);
        assertFunction(hook.run, `${hookPath}.run`, code);
      });
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
  const code = "INVALID_STUDIO_BOOTSTRAP_MANIFEST";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, STUDIO_BOOTSTRAP_KEYS, code);

  assertRequiredNonEmptyString(value.apiVersion, `${path}.apiVersion`, code);

  if (value.apiVersion !== EXTENSIBILITY_API_VERSION) {
    throwContractError(
      code,
      `${path}.apiVersion must be "${EXTENSIBILITY_API_VERSION}".`,
      {
        path: `${path}.apiVersion`,
        value: value.apiVersion,
      },
    );
  }

  assertRequiredNonEmptyString(
    value.studioVersion,
    `${path}.studioVersion`,
    code,
  );
  assertRequiredNonEmptyString(value.mode, `${path}.mode`, code);

  if (
    typeof value.mode !== "string" ||
    !STUDIO_MODES.includes(value.mode as StudioExecutionMode)
  ) {
    throwContractError(
      code,
      `${path}.mode must be one of: ${STUDIO_MODES.join(", ")}.`,
      {
        path: `${path}.mode`,
        value: value.mode,
      },
    );
  }

  assertRequiredNonEmptyString(value.entryUrl, `${path}.entryUrl`, code);
  assertRequiredNonEmptyString(
    value.integritySha256,
    `${path}.integritySha256`,
    code,
  );
  assertRequiredNonEmptyString(value.signature, `${path}.signature`, code);
  assertRequiredNonEmptyString(value.keyId, `${path}.keyId`, code);
  assertRequiredNonEmptyString(value.buildId, `${path}.buildId`, code);
  assertRequiredNonEmptyString(
    value.minStudioPackageVersion,
    `${path}.minStudioPackageVersion`,
    code,
  );
  assertRequiredNonEmptyString(
    value.minHostBridgeVersion,
    `${path}.minHostBridgeVersion`,
    code,
  );
  assertRequiredNonEmptyString(value.expiresAt, `${path}.expiresAt`, code);

  parseStrictSemver(
    value.minStudioPackageVersion,
    `${path}.minStudioPackageVersion`,
    code,
  );
  parseStrictSemver(
    value.minHostBridgeVersion,
    `${path}.minHostBridgeVersion`,
    code,
  );

  if (Number.isNaN(Date.parse(value.expiresAt))) {
    throwContractError(
      code,
      `${path}.expiresAt must be an ISO-8601 date string.`,
      {
        path: `${path}.expiresAt`,
        value: value.expiresAt,
      },
    );
  }
}

/**
 * assertHostBridgeV1 validates the minimum host bridge contract required by
 * Studio runtime module execution mode.
 */
export function assertHostBridgeV1(
  value: unknown,
  path = "hostBridge",
): asserts value is HostBridgeV1 {
  const code = "INVALID_STUDIO_RUNTIME_CONTRACT";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, HOST_BRIDGE_KEYS, code);

  assertRequiredNonEmptyString(value.version, `${path}.version`, code);

  if (value.version !== HOST_BRIDGE_VERSION) {
    throwContractError(
      code,
      `${path}.version must be "${HOST_BRIDGE_VERSION}".`,
      {
        path: `${path}.version`,
        value: value.version,
      },
    );
  }

  assertFunction(value.resolveComponent, `${path}.resolveComponent`, code);
  assertFunction(value.renderMdxPreview, `${path}.renderMdxPreview`, code);
}

/**
 * assertStudioMountContext validates mount-time context for remote Studio
 * runtimes, including auth mode/token constraints.
 */
export function assertStudioMountContext(
  value: unknown,
  path = "studioMountContext",
): asserts value is StudioMountContext {
  const code = "INVALID_STUDIO_RUNTIME_CONTRACT";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, STUDIO_MOUNT_CONTEXT_KEYS, code);

  assertRequiredNonEmptyString(value.apiBaseUrl, `${path}.apiBaseUrl`, code);
  assertRecord(value.auth, `${path}.auth`, code);
  assertNoUnknownKeys(value.auth, `${path}.auth`, STUDIO_MOUNT_AUTH_KEYS, code);
  assertRequiredNonEmptyString(value.auth.mode, `${path}.auth.mode`, code);

  if (value.auth.mode !== "cookie" && value.auth.mode !== "token") {
    throwContractError(code, `${path}.auth.mode must be "cookie" or "token".`, {
      path: `${path}.auth.mode`,
      value: value.auth.mode,
    });
  }

  if (value.auth.mode === "token") {
    assertRequiredNonEmptyString(value.auth.token, `${path}.auth.token`, code);
  } else if (value.auth.token !== undefined) {
    assertOptionalNonEmptyString(value.auth.token, `${path}.auth.token`, code);
  }

  assertHostBridgeV1(value.hostBridge, `${path}.hostBridge`);
}

/**
 * assertRemoteStudioModule validates runtime-loaded Studio module entry shape.
 */
export function assertRemoteStudioModule(
  value: unknown,
  path = "remoteStudioModule",
): asserts value is RemoteStudioModule {
  const code = "INVALID_STUDIO_RUNTIME_CONTRACT";

  assertRecord(value, path, code);
  assertNoUnknownKeys(value, path, REMOTE_STUDIO_MODULE_KEYS, code);
  assertFunction(value.mount, `${path}.mount`, code);
}

/**
 * assertModuleManifestCompatibility verifies module manifest compatibility
 * against the running MDCMS core version and supported API version.
 */
export function assertModuleManifestCompatibility(
  manifest: ModuleManifest,
  options: ModuleManifestCompatibilityOptions,
): void {
  const code = "INCOMPATIBLE_MODULE_MANIFEST";

  assertModuleManifest(manifest, "manifest");
  assertRecord(options as unknown, "options", code);
  assertNoUnknownKeys(
    options as unknown as Record<string, unknown>,
    "options",
    MODULE_COMPATIBILITY_OPTIONS_KEYS,
    code,
  );
  assertRequiredNonEmptyString(
    options.coreVersion,
    "options.coreVersion",
    code,
  );
  const coreVersion = parseStrictSemver(
    options.coreVersion,
    "options.coreVersion",
    code,
  );

  const supportedApiVersion =
    options.supportedApiVersion ?? EXTENSIBILITY_API_VERSION;

  assertRequiredNonEmptyString(
    supportedApiVersion,
    "options.supportedApiVersion",
    code,
  );

  if (manifest.apiVersion !== supportedApiVersion) {
    throwContractError(
      code,
      `manifest.apiVersion ${manifest.apiVersion} is not supported (expected ${supportedApiVersion}).`,
      {
        path: "manifest.apiVersion",
        manifestApiVersion: manifest.apiVersion,
        supportedApiVersion,
      },
    );
  }

  if (manifest.minCoreVersion !== undefined) {
    const min = parseStrictSemver(
      manifest.minCoreVersion,
      "manifest.minCoreVersion",
      code,
    );

    if (compareStrictSemver(coreVersion, min) < 0) {
      throwContractError(
        code,
        `Core version ${options.coreVersion} is below manifest.minCoreVersion ${manifest.minCoreVersion}.`,
        {
          path: "manifest.minCoreVersion",
          coreVersion: options.coreVersion,
          minCoreVersion: manifest.minCoreVersion,
        },
      );
    }
  }

  if (manifest.maxCoreVersion !== undefined) {
    const max = parseStrictSemver(
      manifest.maxCoreVersion,
      "manifest.maxCoreVersion",
      code,
    );

    if (compareStrictSemver(coreVersion, max) > 0) {
      throwContractError(
        code,
        `Core version ${options.coreVersion} is above manifest.maxCoreVersion ${manifest.maxCoreVersion}.`,
        {
          path: "manifest.maxCoreVersion",
          coreVersion: options.coreVersion,
          maxCoreVersion: manifest.maxCoreVersion,
        },
      );
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
  const code = "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST";

  assertStudioBootstrapManifest(manifest, "manifest");
  assertRecord(options as unknown, "options", code);
  assertNoUnknownKeys(
    options as unknown as Record<string, unknown>,
    "options",
    STUDIO_COMPATIBILITY_OPTIONS_KEYS,
    code,
  );
  assertRequiredNonEmptyString(
    options.studioPackageVersion,
    "options.studioPackageVersion",
    code,
  );
  assertRequiredNonEmptyString(
    options.hostBridgeVersion,
    "options.hostBridgeVersion",
    code,
  );

  const supportedApiVersion =
    options.supportedApiVersion ?? EXTENSIBILITY_API_VERSION;

  assertRequiredNonEmptyString(
    supportedApiVersion,
    "options.supportedApiVersion",
    code,
  );

  if (manifest.apiVersion !== supportedApiVersion) {
    throwContractError(
      code,
      `manifest.apiVersion ${manifest.apiVersion} is not supported (expected ${supportedApiVersion}).`,
      {
        path: "manifest.apiVersion",
        manifestApiVersion: manifest.apiVersion,
        supportedApiVersion,
      },
    );
  }

  const studioPackageVersion = parseStrictSemver(
    options.studioPackageVersion,
    "options.studioPackageVersion",
    code,
  );
  const hostBridgeVersion = parseStrictSemver(
    options.hostBridgeVersion,
    "options.hostBridgeVersion",
    code,
  );
  const minStudioPackageVersion = parseStrictSemver(
    manifest.minStudioPackageVersion,
    "manifest.minStudioPackageVersion",
    code,
  );
  const minHostBridgeVersion = parseStrictSemver(
    manifest.minHostBridgeVersion,
    "manifest.minHostBridgeVersion",
    code,
  );

  if (compareStrictSemver(studioPackageVersion, minStudioPackageVersion) < 0) {
    throwContractError(
      code,
      `Studio package version ${options.studioPackageVersion} is below manifest.minStudioPackageVersion ${manifest.minStudioPackageVersion}.`,
      {
        path: "manifest.minStudioPackageVersion",
        studioPackageVersion: options.studioPackageVersion,
        minStudioPackageVersion: manifest.minStudioPackageVersion,
      },
    );
  }

  if (compareStrictSemver(hostBridgeVersion, minHostBridgeVersion) < 0) {
    throwContractError(
      code,
      `Host bridge version ${options.hostBridgeVersion} is below manifest.minHostBridgeVersion ${manifest.minHostBridgeVersion}.`,
      {
        path: "manifest.minHostBridgeVersion",
        hostBridgeVersion: options.hostBridgeVersion,
        minHostBridgeVersion: manifest.minHostBridgeVersion,
      },
    );
  }
}

/**
 * isModuleManifest is a non-throwing type guard for runtime checks.
 */
export function isModuleManifest(value: unknown): value is ModuleManifest {
  try {
    assertModuleManifest(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * isStudioBootstrapManifest is a non-throwing type guard for runtime checks.
 */
export function isStudioBootstrapManifest(
  value: unknown,
): value is StudioBootstrapManifest {
  try {
    assertStudioBootstrapManifest(value);
    return true;
  } catch {
    return false;
  }
}
