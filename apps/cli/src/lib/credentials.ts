import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { RuntimeError } from "@mdcms/shared";

const CREDENTIAL_STORE_VERSION = 1;
const KEYCHAIN_SERVICE = "mdcms-cli";

export type CredentialTuple = {
  serverUrl: string;
  project: string;
  environment: string;
};

export type CredentialProfile = {
  authMode: "api_key";
  apiKey: string;
  apiKeyId?: string;
  createdAt: string;
  updatedAt: string;
};

type CredentialsFilePayload = {
  version: number;
  profiles: Record<string, CredentialProfile>;
};

export type CredentialStore = {
  getProfile: (
    tuple: CredentialTuple,
  ) => Promise<CredentialProfile | undefined>;
  setProfile: (
    tuple: CredentialTuple,
    profile: CredentialProfile,
  ) => Promise<void>;
  deleteProfile: (tuple: CredentialTuple) => Promise<boolean>;
};

type FileCredentialStoreOptions = {
  filePath: string;
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

type CommandRunner = (
  command: string,
  args: string[],
  options?: { input?: string },
) => CommandResult;

type CredentialStoreOptions = {
  env?: NodeJS.ProcessEnv;
  filePath?: string;
  commandRunner?: CommandRunner;
};

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: `Credential field "${field}" must be a non-empty string.`,
      statusCode: 400,
      details: {
        field,
      },
    });
  }

  return value.trim();
}

function normalizeServerUrl(serverUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Server URL "${serverUrl}" is invalid.`,
      statusCode: 400,
    });
  }

  parsed.hash = "";
  parsed.search = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizeTuple(tuple: CredentialTuple): CredentialTuple {
  return {
    serverUrl: normalizeServerUrl(
      assertNonEmptyString(tuple.serverUrl, "serverUrl"),
    ),
    project: assertNonEmptyString(tuple.project, "project"),
    environment: assertNonEmptyString(tuple.environment, "environment"),
  };
}

function toTupleKey(tuple: CredentialTuple): string {
  const normalized = normalizeTuple(tuple);
  return `${normalized.serverUrl}|${normalized.project}|${normalized.environment}`;
}

function validateProfile(
  value: unknown,
  fieldPrefix: string,
): CredentialProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: `Credential profile "${fieldPrefix}" must be an object.`,
      statusCode: 400,
    });
  }

  const candidate = value as Record<string, unknown>;
  const authMode = assertNonEmptyString(
    candidate.authMode,
    `${fieldPrefix}.authMode`,
  );
  if (authMode !== "api_key") {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: `Credential profile "${fieldPrefix}" has unsupported auth mode "${authMode}".`,
      statusCode: 400,
    });
  }

  const apiKey = assertNonEmptyString(
    candidate.apiKey,
    `${fieldPrefix}.apiKey`,
  );
  const apiKeyId =
    typeof candidate.apiKeyId === "string" &&
    candidate.apiKeyId.trim().length > 0
      ? candidate.apiKeyId.trim()
      : undefined;
  const createdAt = assertNonEmptyString(
    candidate.createdAt,
    `${fieldPrefix}.createdAt`,
  );
  const updatedAt = assertNonEmptyString(
    candidate.updatedAt,
    `${fieldPrefix}.updatedAt`,
  );

  return {
    authMode: "api_key",
    apiKey,
    apiKeyId,
    createdAt,
    updatedAt,
  };
}

function parseCredentialsFile(raw: string): CredentialsFilePayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: "Credential store JSON is malformed.",
      statusCode: 400,
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: "Credential store must be an object payload.",
      statusCode: 400,
    });
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== CREDENTIAL_STORE_VERSION) {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: `Credential store version must be ${CREDENTIAL_STORE_VERSION}.`,
      statusCode: 400,
    });
  }

  if (
    !candidate.profiles ||
    typeof candidate.profiles !== "object" ||
    Array.isArray(candidate.profiles)
  ) {
    throw new RuntimeError({
      code: "INVALID_CREDENTIALS_FILE",
      message: 'Credential store field "profiles" must be an object map.',
      statusCode: 400,
    });
  }

  const profiles: Record<string, CredentialProfile> = {};
  for (const [key, value] of Object.entries(candidate.profiles)) {
    profiles[key] = validateProfile(value, key);
  }

  return {
    version: CREDENTIAL_STORE_VERSION,
    profiles,
  };
}

export function resolveCredentialsFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home =
    env.HOME?.trim() ||
    env.USERPROFILE?.trim() ||
    (typeof homedir === "function" ? homedir() : "");

  if (!home) {
    throw new RuntimeError({
      code: "CREDENTIAL_STORE_UNAVAILABLE",
      message: "Could not resolve home directory for credential storage.",
      statusCode: 500,
    });
  }

  return join(home, ".mdcms", "credentials.json");
}

async function readCredentialsFile(
  filePath: string,
): Promise<CredentialsFilePayload> {
  if (!existsSync(filePath)) {
    return {
      version: CREDENTIAL_STORE_VERSION,
      profiles: {},
    };
  }

  const raw = await readFile(filePath, "utf8");
  return parseCredentialsFile(raw);
}

async function writeCredentialsFile(
  filePath: string,
  payload: CredentialsFilePayload,
): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const content = `${JSON.stringify(payload, null, 2)}\n`;

  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600);
}

export function createFileCredentialStore(
  options: FileCredentialStoreOptions,
): CredentialStore {
  const filePath = options.filePath;

  return {
    async getProfile(tuple) {
      const key = toTupleKey(tuple);
      const payload = await readCredentialsFile(filePath);
      return payload.profiles[key];
    },

    async setProfile(tuple, profile) {
      const key = toTupleKey(tuple);
      const payload = await readCredentialsFile(filePath);
      payload.profiles[key] = validateProfile(profile, key);
      await writeCredentialsFile(filePath, payload);
    },

    async deleteProfile(tuple) {
      const key = toTupleKey(tuple);
      const payload = await readCredentialsFile(filePath);
      const exists = Boolean(payload.profiles[key]);
      delete payload.profiles[key];
      await writeCredentialsFile(filePath, payload);
      return exists;
    },
  };
}

function defaultCommandRunner(
  command: string,
  args: string[],
  options?: { input?: string },
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: options?.input,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status,
  };
}

function toKeychainAccount(tuple: CredentialTuple): string {
  return Buffer.from(toTupleKey(tuple), "utf8").toString("base64url");
}

function createMacOsCredentialStore(
  commandRunner: CommandRunner,
): CredentialStore | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  const probe = commandRunner("security", ["-h"]);
  if (!probe.ok && probe.code === null) {
    return undefined;
  }

  return {
    async getProfile(tuple) {
      const account = toKeychainAccount(tuple);
      const result = commandRunner("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
      ]);

      if (!result.ok) {
        if (result.stderr.toLowerCase().includes("could not be found")) {
          return undefined;
        }

        throw new RuntimeError({
          code: "CREDENTIAL_STORE_UNAVAILABLE",
          message: "OS credential store lookup failed.",
          statusCode: 500,
          details: {
            stderr: result.stderr.trim(),
          },
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout.trim());
      } catch {
        throw new RuntimeError({
          code: "INVALID_CREDENTIALS_FILE",
          message: "OS credential store payload is malformed.",
          statusCode: 400,
        });
      }

      return validateProfile(parsed, "os-keychain");
    },

    async setProfile(tuple, profile) {
      const account = toKeychainAccount(tuple);
      const serialized = JSON.stringify(
        validateProfile(profile, "os-keychain"),
      );
      const result = commandRunner("security", [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
        serialized,
      ]);

      if (!result.ok) {
        throw new RuntimeError({
          code: "CREDENTIAL_STORE_UNAVAILABLE",
          message: "OS credential store write failed.",
          statusCode: 500,
          details: {
            stderr: result.stderr.trim(),
          },
        });
      }
    },

    async deleteProfile(tuple) {
      const account = toKeychainAccount(tuple);
      const result = commandRunner("security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
      ]);

      if (result.ok) {
        return true;
      }

      if (result.stderr.toLowerCase().includes("could not be found")) {
        return false;
      }

      throw new RuntimeError({
        code: "CREDENTIAL_STORE_UNAVAILABLE",
        message: "OS credential store delete failed.",
        statusCode: 500,
        details: {
          stderr: result.stderr.trim(),
        },
      });
    },
  };
}

export function createCredentialStore(
  options: CredentialStoreOptions = {},
): CredentialStore {
  const fileStore = createFileCredentialStore({
    filePath: options.filePath ?? resolveCredentialsFilePath(options.env),
  });
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const osStore = createMacOsCredentialStore(commandRunner);

  return {
    async getProfile(tuple) {
      if (osStore) {
        try {
          const profile = await osStore.getProfile(tuple);
          if (profile) {
            return profile;
          }
        } catch (error) {
          if (
            !(error instanceof RuntimeError) ||
            error.code !== "CREDENTIAL_STORE_UNAVAILABLE"
          ) {
            throw error;
          }
        }
      }

      return fileStore.getProfile(tuple);
    },

    async setProfile(tuple, profile) {
      if (osStore) {
        try {
          await osStore.setProfile(tuple, profile);
          await fileStore.deleteProfile(tuple);
          return;
        } catch (error) {
          if (
            !(error instanceof RuntimeError) ||
            error.code !== "CREDENTIAL_STORE_UNAVAILABLE"
          ) {
            throw error;
          }
        }
      }

      await fileStore.setProfile(tuple, profile);
    },

    async deleteProfile(tuple) {
      let osDeleted = false;
      if (osStore) {
        try {
          osDeleted = await osStore.deleteProfile(tuple);
        } catch (error) {
          if (
            !(error instanceof RuntimeError) ||
            error.code !== "CREDENTIAL_STORE_UNAVAILABLE"
          ) {
            throw error;
          }
        }
      }
      const fileDeleted = await fileStore.deleteProfile(tuple);
      return osDeleted || fileDeleted;
    },
  };
}

export function createInMemoryCredentialStore(
  seed: Record<string, CredentialProfile> = {},
): CredentialStore {
  const map = new Map<string, CredentialProfile>(Object.entries(seed));

  return {
    async getProfile(tuple) {
      return map.get(toTupleKey(tuple));
    },
    async setProfile(tuple, profile) {
      map.set(toTupleKey(tuple), validateProfile(profile, "in-memory-profile"));
    },
    async deleteProfile(tuple) {
      return map.delete(toTupleKey(tuple));
    },
  };
}

export async function clearCredentialsFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
