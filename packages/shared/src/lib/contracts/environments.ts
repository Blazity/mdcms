import { RuntimeError } from "../runtime/error.js";

export type EnvironmentSummary = {
  id: string;
  project: string;
  name: string;
  extends: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type EnvironmentCreateInput = {
  name: string;
  extends?: string;
};

function invalidInput(
  path: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: `${path} ${message}`,
    statusCode: 400,
    details: {
      path,
      ...(details ?? {}),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidInput(path, "must be a non-empty string.");
  }
}

export function assertEnvironmentCreateInput(
  value: unknown,
  path = "value",
): asserts value is EnvironmentCreateInput {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  assertNonEmptyString(value.name, `${path}.name`);

  if (value.extends !== undefined && value.extends !== null) {
    assertNonEmptyString(value.extends, `${path}.extends`);
  }
}

export function assertEnvironmentSummary(
  value: unknown,
  path = "value",
): asserts value is EnvironmentSummary {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  assertNonEmptyString(value.id, `${path}.id`);
  assertNonEmptyString(value.project, `${path}.project`);
  assertNonEmptyString(value.name, `${path}.name`);

  if (value.extends !== null && value.extends !== undefined) {
    assertNonEmptyString(value.extends, `${path}.extends`);
  }

  if (typeof value.isDefault !== "boolean") {
    invalidInput(`${path}.isDefault`, "must be a boolean.");
  }

  assertNonEmptyString(value.createdAt, `${path}.createdAt`);
}
