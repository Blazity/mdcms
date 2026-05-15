import type { SchemaRegistryTypeSnapshot } from "@mdcms/shared";

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
    // Filled in subsequent tasks.
    lines.push("### Content types registered in this project");
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
