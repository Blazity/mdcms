import type { DiscoveredFile } from "./scan.js";
import type { InferredType } from "./infer-schema.js";

export type LocaleConfig = {
  defaultLocale: string;
  supported: string[];
  aliases: Record<string, string>;
};

const RESERVED_TOKENS = new Set(["__mdcms_default__"]);

const BCP47_PATTERN = /^([a-z]{2,3})(?:[-_]([a-zA-Z]{2,4}))?$/i;

export function normalizeLocale(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const normalized = trimmed.replace(/_/g, "-");
  const match = normalized.match(BCP47_PATTERN);
  if (!match) return null;

  const language = match[1]!.toLowerCase();
  const region = match[2];

  if (!region) return language;

  if (region.length === 2) {
    return `${language}-${region.toUpperCase()}`;
  }

  return `${language}-${region.charAt(0).toUpperCase()}${region.slice(1).toLowerCase()}`;
}

function filesBelongToDirectory(
  file: DiscoveredFile,
  directory: string,
): boolean {
  return (
    file.relativePath === directory ||
    file.relativePath.startsWith(`${directory}/`)
  );
}

export async function detectLocaleConfig(
  files: DiscoveredFile[],
  types: InferredType[],
  prompter?: {
    select: (
      message: string,
      choices: { label: string; value: string }[],
    ) => Promise<string>;
  },
): Promise<LocaleConfig | null> {
  const allLocales: string[] = [];
  const rawToNormalized: Record<string, string> = {};
  let hasMultiLocaleType = false;

  for (const type of types) {
    const typeFiles = files.filter((f) =>
      filesBelongToDirectory(f, type.directory),
    );
    const typeLocales = new Set<string>();

    for (const file of typeFiles) {
      if (!file.localeHint) continue;

      const raw = file.localeHint.rawValue;
      if (RESERVED_TOKENS.has(raw)) continue;

      const normalized = normalizeLocale(raw);
      if (!normalized) {
        if (!prompter) continue;

        const currentSupported = [...new Set(allLocales)];
        const choices = [
          ...currentSupported.map((l) => ({ label: l, value: l })),
          { label: "Skip this file", value: "__skip__" },
        ];
        const selection = await prompter.select(
          `Cannot normalize locale "${raw}" from ${file.relativePath}. Map to:`,
          choices,
        );

        if (selection === "__skip__") continue;

        typeLocales.add(selection);
        allLocales.push(selection);
        rawToNormalized[raw] = selection;
        continue;
      }

      typeLocales.add(normalized);
      allLocales.push(normalized);

      if (raw !== normalized) {
        rawToNormalized[raw] = normalized;
      }
    }

    if (typeLocales.size >= 1) {
      type.localized = true;
      hasMultiLocaleType = true;
    }
  }

  if (!hasMultiLocaleType) {
    return null;
  }

  const localeCounts: Record<string, number> = {};
  for (const locale of allLocales) {
    localeCounts[locale] = (localeCounts[locale] ?? 0) + 1;
  }

  const sorted = Object.entries(localeCounts).sort((a, b) => b[1] - a[1]);
  const defaultLocale = sorted[0]?.[0] ?? "en";
  const supported = [...new Set(allLocales)].sort();

  const aliases: Record<string, string> = {};
  for (const [raw, normalized] of Object.entries(rawToNormalized)) {
    aliases[raw] = normalized;
  }

  return {
    defaultLocale,
    supported,
    aliases,
  };
}
