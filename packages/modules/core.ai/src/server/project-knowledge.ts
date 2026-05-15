import type {
  SchemaRegistryFieldSnapshot,
  SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

export type ProjectKnowledgeInput = {
  project: string;
  environment: string;
  registeredTypes: SchemaRegistryTypeSnapshot[];
  supportedLocales: string[];
  currentUser?: { id: string; displayName: string };
};

/**
 * Renders the per-turn "Project knowledge" block injected into the
 * chat system prompt. Pure function; safe to snapshot.
 */
export function renderProjectKnowledgeBlock(
  input: ProjectKnowledgeInput,
): string {
  const lines: string[] = [
    "## Project knowledge",
    "",
    `Project: ${sanitizeForPrompt(input.project)}`,
    `Environment: ${sanitizeForPrompt(input.environment)}`,
  ];

  if (input.currentUser) {
    lines.push(
      `Current user: ${sanitizeForPrompt(input.currentUser.displayName)} (id: ${sanitizeForPrompt(input.currentUser.id)})`,
    );
  }

  lines.push("");

  if (input.registeredTypes.length === 0) {
    lines.push(
      "No content types are registered yet — propose_create_document will fail until at least one is synced.",
    );
  } else {
    lines.push(
      "### Content types registered in this project",
      "Use these exact `type` ids when calling propose_create_document. Anything else will fail validation. Path prefixes are conventions, not enforced.",
      "",
    );
    const sortedTypes = [...input.registeredTypes].sort((a, b) =>
      a.type.localeCompare(b.type),
    );
    for (const schema of sortedTypes) {
      lines.push(...renderTypeEntry(schema));
      lines.push("");
    }
  }

  if (input.supportedLocales.length > 0) {
    lines.push("", "### Supported locales");
    lines.push(input.supportedLocales.join(", "));
  }

  return lines.join("\n");
}

/**
 * Strip characters that would break the markdown structure of the
 * prompt. The display name comes from `authUsers.name` which is
 * user-controlled; this prevents a backtick or newline in a name
 * from mangling the prompt.
 */
function sanitizeForPrompt(value: string): string {
  return value.replace(/[`\n\r]/g, " ").trim();
}

const MAX_NESTED_DEPTH = 1;

function renderTypeEntry(schema: SchemaRegistryTypeSnapshot): string[] {
  const lines: string[] = [
    `- **${schema.type}** (directory: ${schema.directory}, localized: ${schema.localized ? "yes" : "no"})`,
  ];
  const fieldEntries = Object.entries(schema.fields);
  if (fieldEntries.length === 0) {
    lines.push("  (no fields)");
    return lines;
  }
  lines.push("  Fields:");
  for (const [name, field] of fieldEntries) {
    lines.push(...renderFieldLines(name, field, 1));
  }
  return lines;
}

function renderFieldLines(
  name: string,
  field: SchemaRegistryFieldSnapshot,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const descriptor = renderKindDescriptor(field, depth);
  const flags: string[] = [field.required ? "required" : "optional"];
  if (field.nullable) flags.push("nullable");
  const lines = [`${indent}- ${name} (${descriptor}, ${flags.join(", ")})`];

  // Inline-expand nested objects up to MAX_NESTED_DEPTH; deeper levels
  // were already collapsed to "<nested object>" by renderKindDescriptor.
  if (field.kind === "object" && field.fields && depth <= MAX_NESTED_DEPTH) {
    for (const [subName, subField] of Object.entries(field.fields)) {
      lines.push(...renderFieldLines(subName, subField, depth + 1));
    }
  }

  return lines;
}

function renderKindDescriptor(
  field: SchemaRegistryFieldSnapshot,
  depth: number,
): string {
  if (field.kind === "enum" && field.options) {
    const formatted = field.options
      .map((option) => JSON.stringify(option))
      .join(" | ");
    return `enum: ${formatted}`;
  }
  if (field.kind === "reference" && field.reference) {
    return `reference → ${field.reference.targetType}`;
  }
  if (field.kind === "array" && field.item) {
    return `array of ${renderKindDescriptor(field.item, depth)}`;
  }
  if (field.kind === "object" && depth > MAX_NESTED_DEPTH) {
    return "<nested object> — call get_entry on a sibling for the full shape";
  }
  return field.kind;
}
