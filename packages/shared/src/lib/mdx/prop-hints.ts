import { RuntimeError } from "../runtime/error.js";

export type MdxSelectOptionValue = string | number | boolean;

export type MdxSelectOption =
  | MdxSelectOptionValue
  | { label: string; value: MdxSelectOptionValue };

export type MdxPropHint =
  | { format: "url" }
  | { widget: "color-picker" }
  | { widget: "textarea" }
  | { widget: "slider"; min: number; max: number; step?: number }
  | { widget: "image" }
  | { widget: "select"; options: MdxSelectOption[] }
  | { widget: "hidden" }
  | { widget: "json" };

export function parseMdxPropHints(
  value: unknown,
  field: string,
): Record<string, MdxPropHint> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value) || Array.isArray(value)) {
    throw invalidConfig(field, "must be an object map when provided.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, hint]) => {
      if (name.trim().length === 0) {
        throw invalidConfig(field, "must not contain empty prop names.");
      }

      return [name, parseMdxPropHint(hint, `${field}.${name}`)];
    }),
  );
}

export function getMdxPropHintWidget(
  hint: MdxPropHint | undefined,
): MdxPropHint extends { widget: infer T } ? T : never {
  if (!hint || !("widget" in hint)) {
    return undefined as never;
  }

  return hint.widget as never;
}

export function getMdxPropHintFormat(
  hint: MdxPropHint | undefined,
): "url" | undefined {
  if (!hint || !("format" in hint)) {
    return undefined;
  }

  return hint.format;
}

export function isMdxSelectOptionValue(
  value: unknown,
): value is MdxSelectOptionValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseMdxPropHint(value: unknown, field: string): MdxPropHint {
  if (!isPlainObject(value) || Array.isArray(value)) {
    throw invalidConfig(field, "must be an object.");
  }

  const hint = value as Record<string, unknown>;
  const format = hint.format;
  const widget = hint.widget;

  if (format !== undefined) {
    if (Object.keys(hint).length !== 1 || format !== "url") {
      throw invalidConfig(
        field,
        'must be exactly { format: "url" } when using string format hints.',
      );
    }

    return { format: "url" };
  }

  switch (widget) {
    case "color-picker":
    case "textarea":
    case "image":
    case "hidden":
    case "json":
      if (Object.keys(hint).length !== 1) {
        throw invalidConfig(
          field,
          `must not include extra keys for widget "${widget}".`,
        );
      }

      return { widget };
    case "slider":
      return parseSliderHint(hint, field);
    case "select":
      return parseSelectHint(hint, field);
    default:
      throw invalidConfig(
        field,
        "must declare a supported widget or format hint.",
      );
  }
}

function parseSliderHint(
  hint: Record<string, unknown>,
  field: string,
): Extract<MdxPropHint, { widget: "slider" }> {
  const allowedKeys = new Set(["widget", "min", "max", "step"]);

  for (const key of Object.keys(hint)) {
    if (!allowedKeys.has(key)) {
      throw invalidConfig(field, `contains unsupported key "${key}".`);
    }
  }

  const min = hint.min;
  const max = hint.max;
  const step = hint.step;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw invalidConfig(
      field,
      'must include finite numeric "min" and "max" values for the slider widget.',
    );
  }

  if ((min as number) >= (max as number)) {
    throw invalidConfig(
      field,
      'must satisfy "min < max" for the slider widget.',
    );
  }

  if (step !== undefined && (!Number.isFinite(step) || (step as number) <= 0)) {
    throw invalidConfig(
      field,
      'must use a finite "step" greater than 0 for the slider widget.',
    );
  }

  return step === undefined
    ? { widget: "slider", min: min as number, max: max as number }
    : {
        widget: "slider",
        min: min as number,
        max: max as number,
        step: step as number,
      };
}

function parseSelectHint(
  hint: Record<string, unknown>,
  field: string,
): Extract<MdxPropHint, { widget: "select" }> {
  const allowedKeys = new Set(["widget", "options"]);

  for (const key of Object.keys(hint)) {
    if (!allowedKeys.has(key)) {
      throw invalidConfig(field, `contains unsupported key "${key}".`);
    }
  }

  if (!Array.isArray(hint.options) || hint.options.length === 0) {
    throw invalidConfig(
      field,
      'must include a non-empty "options" array for the select widget.',
    );
  }

  return {
    widget: "select",
    options: hint.options.map((option, index) =>
      parseSelectOption(option, `${field}.options[${index}]`),
    ),
  };
}

function parseSelectOption(value: unknown, field: string): MdxSelectOption {
  if (isMdxSelectOptionValue(value)) {
    if (typeof value === "string" && value.trim().length === 0) {
      throw invalidConfig(field, "must not be an empty string.");
    }

    return value;
  }

  if (!isPlainObject(value) || Array.isArray(value)) {
    throw invalidConfig(
      field,
      "must be a scalar option value or an object with label/value.",
    );
  }

  const option = value as Record<string, unknown>;
  const keys = Object.keys(option);

  if (
    keys.length !== 2 ||
    !keys.includes("label") ||
    !keys.includes("value") ||
    typeof option.label !== "string" ||
    option.label.trim().length === 0 ||
    !isMdxSelectOptionValue(option.value) ||
    (typeof option.value === "string" && option.value.trim().length === 0)
  ) {
    throw invalidConfig(
      field,
      "must use a non-empty label plus a string, number, or boolean value.",
    );
  }

  return {
    label: option.label,
    value: option.value,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidConfig(field: string, message: string): RuntimeError {
  return new RuntimeError({
    code: "INVALID_CONFIG",
    message: `Config field "${field}" ${message}`,
    statusCode: 400,
    details: { field },
  });
}
