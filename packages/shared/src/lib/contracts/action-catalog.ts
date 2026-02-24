import { RuntimeError } from "../runtime/error.js";

export const API_V1_BASE_PATH = "/api/v1" as const;

export type JsonSchema = Record<string, unknown>;

export type ActionKind = "command" | "query";

export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type StudioActionMeta = {
  visible?: boolean;
  surface?: string;
  label?: string;
  confirm?: string;
  form?: {
    mode?: "auto" | "custom";
    uiHints?: Record<string, unknown>;
  };
};

export type CliActionMeta = {
  visible?: boolean;
  alias?: string;
  inputMode?: "json-or-flags" | "json";
};

export type ActionCatalogItem = {
  id: string;
  kind: ActionKind;
  method: ActionMethod;
  path: string;
  permissions: string[];
  studio?: StudioActionMeta;
  cli?: CliActionMeta;
  requestSchema?: JsonSchema;
  responseSchema?: JsonSchema;
};

export type ActionCatalogListResponse = ActionCatalogItem[];
export type ActionCatalogGetResponse = ActionCatalogItem;

export type ActionCatalogVisibilityPolicyContext = {
  action: ActionCatalogItem;
  request: Request;
};

const ACTION_KINDS: ActionKind[] = ["command", "query"];
const ACTION_METHODS: ActionMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];
const ACTION_INPUT_MODES: NonNullable<CliActionMeta["inputMode"]>[] = [
  "json-or-flags",
  "json",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string") {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path} must be a string when provided.`,
      statusCode: 500,
      details: { path, valueType: typeof value },
    });
  }
}

function assertOptionalBoolean(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "boolean") {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path} must be a boolean when provided.`,
      statusCode: 500,
      details: { path, valueType: typeof value },
    });
  }
}

export function assertJsonSchemaObject(
  value: unknown,
  path = "schema",
): asserts value is JsonSchema {
  if (value === undefined) {
    return;
  }

  if (isRecord(value)) {
    return;
  }

  throw new RuntimeError({
    code: "INVALID_ACTION_CATALOG_SCHEMA",
    message: `${path} must be a JSON object when provided.`,
    statusCode: 500,
    details: { path, valueType: Array.isArray(value) ? "array" : typeof value },
  });
}

export function assertActionCatalogItem(
  value: unknown,
  path = "action",
): asserts value is ActionCatalogItem {
  if (!isRecord(value)) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path} must be an object.`,
      statusCode: 500,
      details: { path },
    });
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path}.id must be a non-empty string.`,
      statusCode: 500,
      details: { path: `${path}.id`, value: value.id },
    });
  }

  if (
    typeof value.kind !== "string" ||
    !ACTION_KINDS.includes(value.kind as ActionKind)
  ) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path}.kind must be one of: ${ACTION_KINDS.join(", ")}.`,
      statusCode: 500,
      details: { path: `${path}.kind`, value: value.kind },
    });
  }

  if (
    typeof value.method !== "string" ||
    !ACTION_METHODS.includes(value.method as ActionMethod)
  ) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path}.method must be one of: ${ACTION_METHODS.join(", ")}.`,
      statusCode: 500,
      details: { path: `${path}.method`, value: value.method },
    });
  }

  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path}.path must be a non-empty string.`,
      statusCode: 500,
      details: { path: `${path}.path`, value: value.path },
    });
  }

  if (
    !Array.isArray(value.permissions) ||
    value.permissions.some((permission) => typeof permission !== "string")
  ) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path}.permissions must be an array of strings.`,
      statusCode: 500,
      details: { path: `${path}.permissions`, value: value.permissions },
    });
  }

  if (value.studio !== undefined) {
    if (!isRecord(value.studio)) {
      throw new RuntimeError({
        code: "INVALID_ACTION_CATALOG_ITEM",
        message: `${path}.studio must be an object when provided.`,
        statusCode: 500,
        details: { path: `${path}.studio` },
      });
    }

    assertOptionalBoolean(value.studio.visible, `${path}.studio.visible`);
    assertOptionalString(value.studio.surface, `${path}.studio.surface`);
    assertOptionalString(value.studio.label, `${path}.studio.label`);
    assertOptionalString(value.studio.confirm, `${path}.studio.confirm`);

    if (value.studio.form !== undefined) {
      if (!isRecord(value.studio.form)) {
        throw new RuntimeError({
          code: "INVALID_ACTION_CATALOG_ITEM",
          message: `${path}.studio.form must be an object when provided.`,
          statusCode: 500,
          details: { path: `${path}.studio.form` },
        });
      }

      if (
        value.studio.form.mode !== undefined &&
        value.studio.form.mode !== "auto" &&
        value.studio.form.mode !== "custom"
      ) {
        throw new RuntimeError({
          code: "INVALID_ACTION_CATALOG_ITEM",
          message: `${path}.studio.form.mode must be "auto" or "custom" when provided.`,
          statusCode: 500,
          details: {
            path: `${path}.studio.form.mode`,
            value: value.studio.form.mode,
          },
        });
      }

      if (value.studio.form.uiHints !== undefined) {
        assertJsonSchemaObject(
          value.studio.form.uiHints,
          `${path}.studio.form.uiHints`,
        );
      }
    }
  }

  if (value.cli !== undefined) {
    if (!isRecord(value.cli)) {
      throw new RuntimeError({
        code: "INVALID_ACTION_CATALOG_ITEM",
        message: `${path}.cli must be an object when provided.`,
        statusCode: 500,
        details: { path: `${path}.cli` },
      });
    }

    assertOptionalBoolean(value.cli.visible, `${path}.cli.visible`);
    assertOptionalString(value.cli.alias, `${path}.cli.alias`);

    if (
      value.cli.inputMode !== undefined &&
      !ACTION_INPUT_MODES.includes(
        value.cli.inputMode as NonNullable<CliActionMeta["inputMode"]>,
      )
    ) {
      throw new RuntimeError({
        code: "INVALID_ACTION_CATALOG_ITEM",
        message: `${path}.cli.inputMode must be one of: ${ACTION_INPUT_MODES.join(", ")}.`,
        statusCode: 500,
        details: { path: `${path}.cli.inputMode`, value: value.cli.inputMode },
      });
    }
  }

  assertJsonSchemaObject(value.requestSchema, `${path}.requestSchema`);
  assertJsonSchemaObject(value.responseSchema, `${path}.responseSchema`);
}

export function assertActionCatalogList(
  value: unknown,
  path = "actions",
): asserts value is ActionCatalogItem[] {
  if (!Array.isArray(value)) {
    throw new RuntimeError({
      code: "INVALID_ACTION_CATALOG_ITEM",
      message: `${path} must be an array.`,
      statusCode: 500,
      details: { path },
    });
  }

  value.forEach((item, index) => {
    assertActionCatalogItem(item, `${path}[${index}]`);
  });
}

export function isActionCatalogItem(
  value: unknown,
): value is ActionCatalogItem {
  try {
    assertActionCatalogItem(value);
    return true;
  } catch {
    return false;
  }
}

export function isActionCatalogList(
  value: unknown,
): value is ActionCatalogItem[] {
  try {
    assertActionCatalogList(value);
    return true;
  } catch {
    return false;
  }
}
