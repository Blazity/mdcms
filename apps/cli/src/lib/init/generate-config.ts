import type { InferredType } from "./infer-schema.js";
import type { LocaleConfig } from "./detect-locale.js";

export type GenerateConfigInput = {
  project: string;
  serverUrl: string;
  environment: string;
  contentDirectories: string[];
  types: InferredType[];
  localeConfig: LocaleConfig | null;
};

/**
 * Determine whether any field in the provided inferred types represents a reference.
 *
 * @param types - The inferred types to scan for reference-typed fields
 * @returns `true` if any field's `zodType` begins with `"reference("`, `false` otherwise
 */
function hasReferences(types: InferredType[]): boolean {
  return types.some((t) =>
    Object.values(t.fields).some((f) => f.zodType.startsWith("reference(")),
  );
}

/**
 * Determines whether any field across the provided types uses a `z.` Zod type.
 *
 * @param types - Array of inferred types to scan for Zod-typed fields
 * @returns `true` if at least one field's `zodType` starts with `"z."`, `false` otherwise
 */
function hasZodFields(types: InferredType[]): boolean {
  return types.some((t) =>
    Object.values(t.fields).some((f) => f.zodType.startsWith("z.")),
  );
}

/**
 * Render the expression string for a field's Zod type, appending `.optional()` when the field is optional.
 *
 * @param field - Object containing the field's Zod expression and optionality
 *   - `zodType`: The Zod type expression as a string (e.g., `"z.string()"`)
 *   - `optional`: Whether the field should be marked optional
 * @returns The `zodType` string with `.optional()` appended if `optional` is `true`, otherwise the original `zodType`
 */
function renderFieldValue(field: {
  zodType: string;
  optional: boolean;
}): string {
  const base = field.zodType;
  if (field.optional) {
    return `${base}.optional()`;
  }
  return base;
}

/**
 * Render a `defineType(...)` block for an inferred content type.
 *
 * @param type - The inferred type to render; its `name`, `directory`, optional `localized` flag, and `fields` map are used to build the block.
 * @returns A formatted string containing a `defineType("<name>", { ... })` entry (including `directory`, optional `localized`, and `fields`) suitable for insertion into the generated config `types` array.
 */
function renderType(type: InferredType): string {
  const lines: string[] = [];
  lines.push(`    defineType("${type.name}", {`);
  lines.push(`      directory: "${type.directory}",`);

  if (type.localized) {
    lines.push("      localized: true,");
  }

  lines.push("      fields: {");

  for (const [name, field] of Object.entries(type.fields)) {
    lines.push(`        ${name}: ${renderFieldValue(field)},`);
  }

  lines.push("      },");
  lines.push("    }),");

  return lines.join("\n");
}

/**
 * Generate a TypeScript source string for an MDCMS CLI configuration from the given input.
 *
 * Builds a complete `export default defineConfig({ ... })` source including conditional imports (`reference`, `z`), project/environment/serverUrl, contentDirectories, optional `locales` (default, supported, aliases), an `environments` entry for the given environment, and a `types` array rendered from the provided inferred types.
 *
 * @param input - Configuration input containing project metadata, content directories, inferred types, and optional locale settings
 * @returns The generated TypeScript source text for the configuration file
 */
export function generateConfigSource(input: GenerateConfigInput): string {
  const lines: string[] = [];

  // Imports
  const sharedImports = ["defineConfig", "defineType"];
  if (hasReferences(input.types)) {
    sharedImports.push("reference");
  }
  lines.push(`import { ${sharedImports.join(", ")} } from "@mdcms/cli";`);

  if (hasZodFields(input.types)) {
    lines.push('import { z } from "zod";');
  }

  lines.push("");
  lines.push("export default defineConfig({");
  lines.push(`  project: "${input.project}",`);
  lines.push(`  environment: "${input.environment}",`);
  lines.push(`  serverUrl: "${input.serverUrl}",`);
  lines.push(
    `  contentDirectories: [${input.contentDirectories.map((d) => `"${d}"`).join(", ")}],`,
  );

  // Locales
  if (input.localeConfig) {
    const lc = input.localeConfig;
    lines.push("  locales: {");
    lines.push(`    default: "${lc.defaultLocale}",`);
    lines.push(
      `    supported: [${lc.supported.map((s) => `"${s}"`).join(", ")}],`,
    );

    if (Object.keys(lc.aliases).length > 0) {
      lines.push("    aliases: {");
      for (const [raw, normalized] of Object.entries(lc.aliases)) {
        lines.push(`      ${raw}: "${normalized}",`);
      }
      lines.push("    },");
    }

    lines.push("  },");
  }

  // Environments
  lines.push("  environments: {");
  lines.push(`    ${input.environment}: {},`);
  lines.push("  },");

  // Types
  if (input.types.length > 0) {
    lines.push("  types: [");
    for (const type of input.types) {
      lines.push(renderType(type));
    }
    lines.push("  ],");
  }

  lines.push("});");
  lines.push("");

  return lines.join("\n");
}
