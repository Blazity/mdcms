import type { DiscoveredFile } from "./scan.js";

export type InferredField = {
  zodType: string;
  optional: boolean;
  samples: number;
};

export type InferredType = {
  name: string;
  directory: string;
  localized: boolean;
  fields: Record<string, InferredField>;
  fileCount: number;
};

const KNOWN_SINGULARS: Record<string, string> = {
  posts: "post",
  pages: "page",
  authors: "author",
  categories: "category",
  tags: "tag",
  articles: "article",
  products: "product",
  users: "user",
  images: "image",
  comments: "comment",
  reviews: "review",
  events: "event",
};

const LOCALE_KEYS = new Set(["locale", "lang", "language"]);

/**
 * Derives a singular form from a collection name using known mappings and simple English suffix rules.
 *
 * @param name - The collection name to singularize (case-insensitive)
 * @returns The singular lowercase form of `name` (e.g., `posts` → `post`, `categories` → `category`)
 */
function singularize(name: string): string {
  const lower = name.toLowerCase();
  if (KNOWN_SINGULARS[lower] !== undefined) {
    return KNOWN_SINGULARS[lower]!;
  }
  if (lower.endsWith("ies")) {
    return lower.slice(0, -3) + "y";
  }
  if (lower.endsWith("s") && !lower.endsWith("ss") && !lower.endsWith("us")) {
    return lower.slice(0, -1);
  }
  return lower;
}

/**
 * Infer a Zod type expression string from a runtime value.
 *
 * @param value - The runtime value to inspect. If `value` is an array, the first non-null/undefined element is used to infer the element type.
 * @returns One of the following Zod expressions as a string: `z.string()`, `z.number()`, `z.boolean()`, `z.array(z.<primitive>())`, or `z.unknown()`. For arrays, if no supported primitive element is found, `z.array(z.string())` is returned.
 */
function inferZodType(value: unknown): string {
  if (typeof value === "string") return "z.string()";
  if (typeof value === "number") return "z.number()";
  if (typeof value === "boolean") return "z.boolean()";
  if (Array.isArray(value)) {
    const first = value.find((v) => v !== null && v !== undefined);
    if (typeof first === "string") return "z.array(z.string())";
    if (typeof first === "number") return "z.array(z.number())";
    if (typeof first === "boolean") return "z.array(z.boolean())";
    return "z.array(z.string())";
  }
  return "z.unknown()";
}

/**
 * Infer schema types from the frontmatter of discovered files grouped by the provided directories.
 *
 * @param files - Discovered files whose `frontmatter` will be analyzed for field keys and sample values.
 * @param selectedDirectories - Directories to group files by and for which to produce inferred types.
 * @returns An array of `InferredType` objects for each directory that contains files; each entry includes the inferred singular `name`, `directory` path, `localized` flag (always `false`), `fields` mapping (each field contains a `zodType`, `optional: true`, and `samples` count), and `fileCount`.
export function inferSchema(
  files: DiscoveredFile[],
  selectedDirectories: string[],
): InferredType[] {
  const dirSet = new Set(selectedDirectories);

  // Group files by directory
  const groups = new Map<string, DiscoveredFile[]>();
  for (const dir of selectedDirectories) {
    groups.set(dir, []);
  }

  for (const file of files) {
    for (const dir of dirSet) {
      if (file.relativePath.startsWith(dir + "/")) {
        groups.get(dir)!.push(file);
        break;
      }
    }
  }

  // First pass: compute all type names so we can detect references
  const typeNameByDir = new Map<string, string>();
  for (const dir of selectedDirectories) {
    const basename = dir.split("/").pop() ?? dir;
    typeNameByDir.set(dir, singularize(basename));
  }
  const allTypeNames = new Set(typeNameByDir.values());

  const results: InferredType[] = [];

  for (const dir of selectedDirectories) {
    const dirFiles = groups.get(dir)!;
    if (dirFiles.length === 0) continue;

    const typeName = typeNameByDir.get(dir)!;
    const fileCount = dirFiles.length;

    // Collect all field keys and their sample values
    const fieldSamples = new Map<
      string,
      { values: unknown[]; count: number }
    >();

    for (const file of dirFiles) {
      for (const [key, value] of Object.entries(file.frontmatter)) {
        if (LOCALE_KEYS.has(key)) continue;

        if (!fieldSamples.has(key)) {
          fieldSamples.set(key, { values: [], count: 0 });
        }
        const entry = fieldSamples.get(key)!;
        entry.values.push(value);
        entry.count++;
      }
    }

    // Build fields
    const fields: Record<string, InferredField> = {};
    for (const [key, { values, count }] of fieldSamples) {
      // Use the first non-null/undefined value to infer type
      const sampleValue =
        values.find((v) => v !== null && v !== undefined) ?? values[0];

      let zodType: string;
      // Reference detection: field name matches another type name AND value is a string
      if (allTypeNames.has(key) && typeof sampleValue === "string") {
        zodType = `reference("${key}")`;
      } else {
        zodType = inferZodType(sampleValue);
      }

      fields[key] = {
        zodType,
        optional: true,
        samples: count,
      };
    }

    results.push({
      name: typeName,
      directory: dir,
      localized: false,
      fields,
      fileCount,
    });
  }

  return results;
}
