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

function hasReferences(types: InferredType[]): boolean {
  return types.some((t) =>
    Object.values(t.fields).some((f) => f.zodType.startsWith("reference(")),
  );
}

function hasZodFields(types: InferredType[]): boolean {
  return types.some((t) =>
    Object.values(t.fields).some((f) => f.zodType.startsWith("z.")),
  );
}

function renderFieldValue(field: { zodType: string; optional: boolean }): string {
  const base = field.zodType;
  if (field.optional) {
    return `${base}.optional()`;
  }
  return base;
}

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

export function generateConfigSource(input: GenerateConfigInput): string {
  const lines: string[] = [];

  // Imports
  const sharedImports = ["defineConfig", "defineType"];
  if (hasReferences(input.types)) {
    sharedImports.push("reference");
  }
  lines.push(
    `import { ${sharedImports.join(", ")} } from "@mdcms/shared";`,
  );

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
