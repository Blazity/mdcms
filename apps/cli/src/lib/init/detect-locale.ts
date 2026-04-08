import type { DiscoveredFile } from "./scan.js";
import type { InferredType } from "./infer-schema.js";

export type LocaleConfig = {
  defaultLocale: string;
  supported: string[];
  aliases: Record<string, string>;
};

const RESERVED_TOKENS = new Set(["__mdcms_default__"]);

const BCP47_PATTERN = /^([a-z]{2,3})(?:[-_]([a-zA-Z]{2,4}))?$/i;

/**
 * Normalize a raw locale hint into a standardized BCP-47-like locale identifier.
 *
 * Trims whitespace, converts underscores to hyphens, validates the format, and
 * returns a normalized locale using a lowercased language subtag and a formatted
 * region subtag when present. If the input is empty or does not match the
 * expected pattern, returns `null`.
 *
 * @param raw - The raw locale string to normalize (may include whitespace, underscores, or mixed case)
 * @returns The normalized locale (e.g., `en`, `en-US`, `zh-Hant`) or `null` if the input is empty or invalid
 */
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

/**
 * Determine whether a discovered file resides in or directly under a specified directory.
 *
 * @param file - The discovered file whose `relativePath` will be checked
 * @param directory - The directory path to match against `file.relativePath`
 * @returns `true` if `file.relativePath` equals `directory` or starts with `${directory}/`, `false` otherwise
 */
function filesBelongToDirectory(
  file: DiscoveredFile,
  directory: string,
): boolean {
  return (
    file.relativePath === directory ||
    file.relativePath.startsWith(`${directory}/`)
  );
}

/**
 * Infer a project locale configuration by examining discovered files and their locale hints.
 *
 * Scans each inferred type's files for locale hints, normalizes or interactively maps unrecognized hints,
 * marks types as localized when they contain two or more distinct locales, and—if any type is localized—
 * produces a LocaleConfig with a most-frequent default, sorted supported locales, and alias mappings.
 *
 * @param files - Discovered files containing optional `localeHint.rawValue` and `relativePath`
 * @param types - Inferred types with `directory` and mutable `localized` flag updated when multiple locales are found
 * @param prompter - Optional interactive selector used to map raw locale hints that fail normalization; if omitted such files are skipped
 * @returns A LocaleConfig with `defaultLocale`, `supported`, and `aliases`, or `null` if no inferred type contains multiple locales
 */
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

    if (typeLocales.size >= 2) {
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
