import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { discoverUntrackedFiles } from "./discover.js";

import type { ContentDocumentResponse } from "@mdcms/shared";
import {
  RuntimeError,
  serializeResolvedEnvironmentSchema,
  type ParsedMdcmsConfig,
} from "@mdcms/shared";
import { buildSchemaSyncPayload } from "@mdcms/shared/server";
import { parse as parseYaml } from "yaml";
import { readSchemaState } from "./schema-state.js";
import {
  validateCandidates,
  type DocumentValidationResult,
} from "./validate.js";

import type { CliContentTypeConfig } from "./config.js";
import type { CliCommand, CliCommandContext } from "./framework.js";
import {
  loadScopedManifest,
  resolveScopedManifestPath,
  writeScopedManifestAtomic,
  type ScopedManifest,
  type ScopedManifestEntry,
} from "./manifest.js";

type PushOptions = {
  force: boolean;
  published: boolean;
  validate: boolean;
};

type PushCandidate = {
  documentId: string;
  manifestEntry: ScopedManifestEntry;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
};

type DeletionCandidate = {
  documentId: string;
  path: string;
  format: "md" | "mdx";
  draftRevision: number;
  publishedVersion: number | null;
};

type NewFileCandidate = {
  path: string;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
  resolvedType: string;
  resolvedLocale: string;
  resolvedPath: string;
};

type PushPlan = {
  changedCandidates: PushCandidate[];
  newCandidates: NewFileCandidate[];
  deletionCandidates: DeletionCandidate[];
  trackedCount: number;
  unchangedCount: number;
};

type PushResult = {
  status: "updated" | "created" | "deleted" | "failed";
  documentId: string;
  nextDocumentId?: string;
  path: string;
  message: string;
  reasonCode?: string;
};

type ContentDocumentPayload = Pick<
  ContentDocumentResponse,
  | "documentId"
  | "type"
  | "locale"
  | "path"
  | "format"
  | "draftRevision"
  | "publishedVersion"
>;

/**
 * Parse CLI tokens for the `push` command into a PushOptions object.
 *
 * Recognizes `--force`, `--published`, `--validate`, and help flags (`--help`, `-h`).
 *
 * @param args - The array of CLI tokens supplied to the `push` command
 * @returns An object with boolean flags: `force`, `published`, and `validate`
 * @throws RuntimeError with code `INVALID_INPUT` when an unknown flag is encountered
 */
function parsePushOptions(args: string[]): PushOptions {
  for (const token of args) {
    if (
      token === "--published" ||
      token === "--force" ||
      token === "--validate"
    ) {
      continue;
    }

    if (token === "--help" || token === "-h") {
      continue;
    }

    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Unknown push flag "${token}".`,
      statusCode: 400,
    });
  }

  return {
    force: args.includes("--force"),
    published: args.includes("--published"),
    validate: args.includes("--validate"),
  };
}

/**
 * Render the help and usage text for the `mdcms push` CLI command.
 *
 * @returns A multi-line string describing command usage, behavior, and available options.
 */
function renderPushHelp(): string {
  return [
    "Usage: mdcms push [--force] [--validate] [--published]",
    "",
    "Upload local markdown files to CMS as draft content.",
    "",
    "Behavior:",
    "  - Changed manifest-tracked files are updated on the server.",
    "  - New local files (in content directories, not yet tracked) are",
    "    detected and offered for upload via interactive selection.",
    "  - Locally-deleted files (in manifest but missing on disk) are",
    "    detected and offered for server-side deletion via interactive selection.",
    "",
    "Options:",
    "  --force       Skip all prompts; auto-select all new/deleted files",
    "  --validate    Validate frontmatter against local schema before pushing",
    "  --published   Reserved for future behavior (unsupported in demo mode)",
    "",
  ].join("\n");
}

/**
 * Builds HTTP headers for API requests including project, environment, schema hash, and optional authorization.
 *
 * @param context - CLI command context containing `project`, `environment`, and optional `apiKey`
 * @param schemaHash - Local schema hash to include in `x-mdcms-schema-hash`
 * @returns A Headers instance with `content-type: application/json`, `x-mdcms-project`, `x-mdcms-environment`, `x-mdcms-schema-hash`, and `authorization: Bearer <apiKey>` when `context.apiKey` is present
 */
function toRequestHeaders(
  context: CliCommandContext,
  schemaHash: string,
): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-mdcms-project": context.project,
    "x-mdcms-environment": context.environment,
    "x-mdcms-schema-hash": schemaHash,
  });

  if (context.apiKey) {
    headers.set("authorization", `Bearer ${context.apiKey}`);
  }

  return headers;
}

/**
 * Compute the SHA-256 digest of the provided content as a lowercase hexadecimal string.
 *
 * @returns The lowercase hex-encoded SHA-256 digest of `content`
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Determine the markdown file format from a file path.
 *
 * @param path - The filesystem path or filename to inspect
 * @returns `"md"` if the path ends with `.md`, `"mdx"` if the path ends with `.mdx`
 * @throws RuntimeError with code `UNSUPPORTED_EXTENSION` when the file extension is not `.md` or `.mdx`
 */
export function parseFileFormat(path: string): "md" | "mdx" {
  const extension = extname(path).toLowerCase();

  if (extension === ".md") {
    return "md";
  }

  if (extension === ".mdx") {
    return "mdx";
  }

  throw new RuntimeError({
    code: "UNSUPPORTED_EXTENSION",
    message: `Only .md and .mdx files are supported for push. Received: "${path}".`,
    statusCode: 400,
    details: { path },
  });
}

/**
 * Parses a Markdown/MDX file into its YAML frontmatter and body.
 *
 * @param content - The full text content of a Markdown or MDX file
 * @returns An object with `frontmatter` containing parsed YAML key/value pairs (or `{}` if absent) and `body` containing the remaining document text after the frontmatter block
 * @throws {RuntimeError} `INVALID_LOCAL_DOCUMENT` if a starting `---` frontmatter is not closed or if the YAML frontmatter does not parse to an object map
 */
export function parseMarkdownDocument(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return {
      frontmatter: {},
      body: content,
    };
  }

  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!frontmatterMatch) {
    throw new RuntimeError({
      code: "INVALID_LOCAL_DOCUMENT",
      message: "Frontmatter block is not closed with a terminating --- line.",
      statusCode: 400,
    });
  }

  const rawFrontmatter = frontmatterMatch[1] ?? "";
  const parsed = parseYaml(rawFrontmatter);

  if (parsed === null || parsed === undefined) {
    return {
      frontmatter: {},
      body: content.slice(frontmatterMatch[0].length),
    };
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeError({
      code: "INVALID_LOCAL_DOCUMENT",
      message:
        "Frontmatter must resolve to an object map (arrays/scalars are not supported).",
      statusCode: 400,
    });
  }

  return {
    frontmatter: parsed as Record<string, unknown>,
    body: content.slice(frontmatterMatch[0].length),
  };
}

/**
 * Normalizes a directory path by removing any leading or trailing slashes.
 *
 * @param directory - The directory path which may include leading or trailing slashes; pass `undefined` to represent no directory.
 * @returns The directory path without leading or trailing slashes, or an empty string if `directory` is `undefined` or empty.
 */
function normalizeDirectory(directory: string | undefined): string {
  if (!directory) {
    return "";
  }

  return directory.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Selects the content type config that best matches a file path (without extension).
 *
 * @param typeConfigs - Available content type configurations to choose from.
 * @param pathWithoutExtension - File path with directory segments but without the `.md`/`.mdx` extension (e.g., `blog/2020-01-01-post`).
 * @returns The `CliContentTypeConfig` whose normalized `directory` exactly matches or is the longest prefix of `pathWithoutExtension`; a config with an empty `directory` is used only as a fallback.
 * @throws RuntimeError with code `TYPE_MAPPING_MISSING` if no type configuration matches the provided path.
 */
export function pickTypeConfigForPath(
  typeConfigs: readonly CliContentTypeConfig[],
  pathWithoutExtension: string,
): CliContentTypeConfig {
  let selected: CliContentTypeConfig | undefined;
  let selectedScore = -1;

  for (const typeConfig of typeConfigs) {
    const directory = normalizeDirectory(typeConfig.directory);

    if (directory.length === 0) {
      if (selectedScore < 0) {
        selected = typeConfig;
        selectedScore = 0;
      }
      continue;
    }

    if (
      pathWithoutExtension === directory ||
      pathWithoutExtension.startsWith(`${directory}/`)
    ) {
      if (directory.length > selectedScore) {
        selected = typeConfig;
        selectedScore = directory.length;
      }
    }
  }

  if (!selected) {
    throw new RuntimeError({
      code: "TYPE_MAPPING_MISSING",
      message: `Could not map local path "${pathWithoutExtension}" to a configured content type directory.`,
      statusCode: 400,
      details: {
        path: pathWithoutExtension,
      },
    });
  }

  return selected;
}

/**
 * Resolve the content type, canonical path, and locale for creating a document from a local file path.
 *
 * Determines which configured content type maps to `input.path`, strips the `.md`/`.mdx`
 * extension, and returns the target `type`, normalized `path` (without locale suffix for localized types),
 * and `locale` (extracted from the filename for localized types, or `"en"` for non-localized types).
 *
 * @param input.path - Local file path including the `.md` or `.mdx` extension.
 * @param input.format - File format, either `"md"` or `"mdx"`.
 * @param input.types - Available CLI content type configurations used to map the path to a content type.
 * @returns The resolved `{ type, path, locale }` to use in a create request.
 * @throws RuntimeError — `UNSUPPORTED_EXTENSION` if `input.path` does not end with `.md` or `.mdx`.
 * @throws RuntimeError — `TYPE_MAPPING_MISSING` if no type config matches the file path (propagated from `pickTypeConfigForPath`).
 * @throws RuntimeError — `INVALID_LOCAL_DOCUMENT` if the chosen type is localized but the filename does not include a valid locale segment (expected `<path>.<locale>.<ext>`).
 */
export function resolveCreatePayload(input: {
  path: string;
  format: "md" | "mdx";
  types: readonly CliContentTypeConfig[];
}): {
  type: string;
  path: string;
  locale: string;
} {
  const pathWithoutExtension = input.path.replace(/\.(md|mdx)$/i, "");

  if (pathWithoutExtension === input.path) {
    throw new RuntimeError({
      code: "UNSUPPORTED_EXTENSION",
      message: `Only .md and .mdx files are supported for push. Received: "${input.path}".`,
      statusCode: 400,
      details: { path: input.path },
    });
  }

  const typeConfig = pickTypeConfigForPath(input.types, pathWithoutExtension);

  if (typeConfig.localized) {
    const localeDelimiter = pathWithoutExtension.lastIndexOf(".");

    if (
      localeDelimiter <= 0 ||
      localeDelimiter >= pathWithoutExtension.length - 1
    ) {
      throw new RuntimeError({
        code: "INVALID_LOCAL_DOCUMENT",
        message: `Localized type "${typeConfig.name}" requires local file names in <path>.<locale>.${input.format} form.`,
        statusCode: 400,
        details: {
          type: typeConfig.name,
          path: input.path,
        },
      });
    }

    return {
      type: typeConfig.name,
      path: pathWithoutExtension.slice(0, localeDelimiter),
      locale: pathWithoutExtension.slice(localeDelimiter + 1),
    };
  }

  return {
    type: typeConfig.name,
    path: pathWithoutExtension,
    locale: "en",
  };
}

function parseRemoteDocument(body: unknown): ContentDocumentPayload {
  const payload = body as {
    data?: {
      documentId?: unknown;
      type?: unknown;
      locale?: unknown;
      path?: unknown;
      format?: unknown;
      draftRevision?: unknown;
      publishedVersion?: unknown;
    };
  };

  const data = payload?.data;

  if (!data || typeof data !== "object") {
    throw new RuntimeError({
      code: "REMOTE_ERROR",
      message: 'Server response is missing "data" payload.',
      statusCode: 502,
    });
  }

  if (
    typeof data.documentId !== "string" ||
    typeof data.type !== "string" ||
    typeof data.locale !== "string" ||
    typeof data.path !== "string" ||
    (data.format !== "md" && data.format !== "mdx") ||
    typeof data.draftRevision !== "number" ||
    !Number.isInteger(data.draftRevision) ||
    data.draftRevision < 0 ||
    !(
      data.publishedVersion === null ||
      (typeof data.publishedVersion === "number" &&
        Number.isInteger(data.publishedVersion) &&
        data.publishedVersion >= 0)
    )
  ) {
    throw new RuntimeError({
      code: "REMOTE_ERROR",
      message:
        "Server response does not match expected document payload shape.",
      statusCode: 502,
    });
  }

  return {
    documentId: data.documentId,
    type: data.type,
    locale: data.locale,
    path: data.path,
    format: data.format,
    draftRevision: data.draftRevision,
    publishedVersion: data.publishedVersion,
  };
}

function parseRemoteError(
  body: unknown,
  fallbackStatus: number,
): {
  code: string;
  message: string;
  statusCode: number;
} {
  const payload = body as { code?: unknown; message?: unknown };

  return {
    code: typeof payload?.code === "string" ? payload.code : "REMOTE_ERROR",
    message:
      typeof payload?.message === "string"
        ? payload.message
        : `Server request failed (${fallbackStatus}).`,
    statusCode: fallbackStatus,
  };
}

/**
 * Send an update request for a tracked local document and map server responses to structured outcomes.
 *
 * Sends a PUT to the content API with the candidate's format, frontmatter, body, and manifest revisions. Interprets successful responses, 404 (missing), and specific 409 conflict codes into distinct result kinds.
 *
 * @param candidate - The tracked document candidate to update (includes documentId, manifestEntry revisions, parsed frontmatter, body, format, and local hash)
 * @param schemaHash - Local schema hash to attach to request headers for server-side schema validation
 * @returns One of:
 *  - `{ kind: "updated", remote: ContentDocumentPayload }` when the server updated the document and returned its representation
 *  - `{ kind: "missing" }` when the server reports the document ID does not exist
 *  - `{ kind: "stale", code, message }` when the server rejects the update due to a stale draft revision
 *  - `{ kind: "schema_mismatch", code, message }` when the server reports the local schema hash does not match the server's expected schema
 *  - `{ kind: "path_conflict", code, message }` when the server reports the manifest path conflicts with an existing document (advises running `cms pull`)
 */
async function updateExistingDocument(
  context: CliCommandContext,
  candidate: PushCandidate,
  schemaHash: string,
): Promise<
  | {
      kind: "updated";
      remote: ContentDocumentPayload;
    }
  | {
      kind: "missing";
    }
  | {
      kind: "stale";
      code: string;
      message: string;
    }
  | {
      kind: "schema_mismatch";
      code: string;
      message: string;
    }
  | {
      kind: "path_conflict";
      code: string;
      message: string;
    }
> {
  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content/${candidate.documentId}`,
    {
      method: "PUT",
      headers: toRequestHeaders(context, schemaHash),
      body: JSON.stringify({
        format: candidate.format,
        frontmatter: candidate.frontmatter,
        body: candidate.body,
        draftRevision: candidate.manifestEntry.draftRevision,
        publishedVersion: candidate.manifestEntry.publishedVersion,
      }),
    },
  );

  const body = (await response.json().catch(() => undefined)) as unknown;

  if (response.ok) {
    return {
      kind: "updated",
      remote: parseRemoteDocument(body),
    };
  }

  if (response.status === 404) {
    return { kind: "missing" };
  }

  const remoteError = parseRemoteError(body, response.status);

  if (response.status === 409 && remoteError.code === "STALE_DRAFT_REVISION") {
    return {
      kind: "stale",
      code: remoteError.code,
      message: remoteError.message,
    };
  }

  if (response.status === 409 && remoteError.code === "SCHEMA_HASH_MISMATCH") {
    return {
      kind: "schema_mismatch",
      code: remoteError.code,
      message: remoteError.message,
    };
  }

  if (response.status === 409 && remoteError.code === "CONTENT_PATH_CONFLICT") {
    return {
      kind: "path_conflict",
      code: remoteError.code,
      message: `Path conflict for "${candidate.manifestEntry.path}". The manifest references a stale document ID. Run 'cms pull' to re-sync.`,
    };
  }

  throw new RuntimeError({
    code: remoteError.code,
    message: remoteError.message,
    statusCode: remoteError.statusCode,
  });
}

/**
 * Recreates a missing server document from a local tracked file and returns the created remote document or a structured conflict outcome.
 *
 * @param context - CLI execution context (used for fetcher, config, and server URL)
 * @param candidate - Tracked push candidate containing the local file contents, frontmatter, manifest entry, and format
 * @param schemaHash - Local schema hash propagated to the server via request headers
 * @returns `{ kind: "created"; remote: ContentDocumentPayload }` when creation succeeds; `{ kind: "schema_mismatch"; code: string; message: string }` when the server rejects the payload due to schema hash mismatch; `{ kind: "path_conflict"; code: string; message: string }` when the target path already exists on the server under a different document ID
 * @throws {RuntimeError} `TYPE_MAPPING_MISSING` if no type mappings are configured locally
 * @throws {RuntimeError} for other remote-side errors returned by the server
 */
async function createDocumentFromLocalFile(
  context: CliCommandContext,
  candidate: PushCandidate,
  schemaHash: string,
): Promise<
  | { kind: "created"; remote: ContentDocumentPayload }
  | { kind: "schema_mismatch"; code: string; message: string }
  | { kind: "path_conflict"; code: string; message: string }
> {
  const types = context.config.types ?? [];

  if (types.length === 0) {
    throw new RuntimeError({
      code: "TYPE_MAPPING_MISSING",
      message:
        "Config must define at least one content type mapping to recreate missing documents.",
      statusCode: 400,
    });
  }

  const createTarget = resolveCreatePayload({
    path: candidate.manifestEntry.path,
    format: candidate.format,
    types,
  });

  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content`,
    {
      method: "POST",
      headers: toRequestHeaders(context, schemaHash),
      body: JSON.stringify({
        type: createTarget.type,
        path: createTarget.path,
        locale: createTarget.locale,
        format: candidate.format,
        frontmatter: candidate.frontmatter,
        body: candidate.body,
      }),
    },
  );

  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    const remoteError = parseRemoteError(body, response.status);

    if (
      response.status === 409 &&
      remoteError.code === "SCHEMA_HASH_MISMATCH"
    ) {
      return {
        kind: "schema_mismatch",
        code: remoteError.code,
        message: remoteError.message,
      };
    }

    if (
      response.status === 409 &&
      remoteError.code === "CONTENT_PATH_CONFLICT"
    ) {
      return {
        kind: "path_conflict",
        code: remoteError.code,
        message: `Path "${createTarget.path}" already exists on server under a different document ID. Run 'cms pull' to re-sync your manifest.`,
      };
    }

    throw new RuntimeError({
      code: remoteError.code,
      message: remoteError.message,
      statusCode: remoteError.statusCode,
    });
  }

  return { kind: "created", remote: parseRemoteDocument(body) };
}

/**
 * Create a new content document on the server from an untracked local file candidate.
 *
 * @param candidate - Untracked local file candidate containing resolved `resolvedType`, `resolvedPath`, `resolvedLocale`, `format`, `frontmatter`, and `body`
 * @param schemaHash - Local schema hash included in the request headers to inform server-side validation
 * @returns `{ kind: "created", remote }` when creation succeeds; `{ kind: "schema_mismatch", code, message }` when the server rejects the payload due to a schema hash mismatch; `{ kind: "path_conflict", code, message }` when the target path already exists on the server
 * @throws RuntimeError - If the server returns an error not mapped to `schema_mismatch` or `path_conflict`; the error includes the server-provided code, message, and statusCode
 */
async function createNewDocument(
  context: CliCommandContext,
  candidate: NewFileCandidate,
  schemaHash: string,
): Promise<
  | { kind: "created"; remote: ContentDocumentPayload }
  | { kind: "schema_mismatch"; code: string; message: string }
  | { kind: "path_conflict"; code: string; message: string }
> {
  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content`,
    {
      method: "POST",
      headers: toRequestHeaders(context, schemaHash),
      body: JSON.stringify({
        type: candidate.resolvedType,
        path: candidate.resolvedPath,
        locale: candidate.resolvedLocale,
        format: candidate.format,
        frontmatter: candidate.frontmatter,
        body: candidate.body,
      }),
    },
  );

  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    const remoteError = parseRemoteError(body, response.status);

    if (
      response.status === 409 &&
      remoteError.code === "SCHEMA_HASH_MISMATCH"
    ) {
      return {
        kind: "schema_mismatch",
        code: remoteError.code,
        message: remoteError.message,
      };
    }

    // Issue #10: handle path conflict with actionable message
    if (
      response.status === 409 &&
      remoteError.code === "CONTENT_PATH_CONFLICT"
    ) {
      return {
        kind: "path_conflict",
        code: remoteError.code,
        message: `Path "${candidate.resolvedPath}" already exists on server. Run 'cms pull' to sync, then resolve the duplicate.`,
      };
    }

    throw new RuntimeError({
      code: remoteError.code,
      message: remoteError.message,
      statusCode: remoteError.statusCode,
    });
  }

  return { kind: "created", remote: parseRemoteDocument(body) };
}

/**
 * Delete a remote content document by its document ID.
 *
 * @param documentId - The ID of the document to delete
 * @param schemaHash - Schema hash to include in the request headers for server-side schema validation
 * @returns `{ kind: "deleted" }` if the deletion succeeded, `{ kind: "already_gone" }` if the document was not found
 * @throws RuntimeError when the server responds with an error; the error's `code`, `message`, and `statusCode` mirror the remote error
 */
async function deleteDocument(
  context: CliCommandContext,
  documentId: string,
  schemaHash: string,
): Promise<{ kind: "deleted" } | { kind: "already_gone" }> {
  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content/${documentId}`,
    {
      method: "DELETE",
      headers: toRequestHeaders(context, schemaHash),
    },
  );

  if (response.ok) {
    return { kind: "deleted" };
  }

  if (response.status === 404) {
    return { kind: "already_gone" };
  }

  const body = (await response.json().catch(() => undefined)) as unknown;
  const remoteError = parseRemoteError(body, response.status);

  throw new RuntimeError({
    code: remoteError.code,
    message: remoteError.message,
    statusCode: remoteError.statusCode,
  });
}

/**
 * Prints a human-readable push plan summarizing changed, new, deleted, and unchanged documents for the current project/environment.
 *
 * @param candidates - Tracked documents that have local changes and are candidates for update on the server.
 * @param newCandidates - Untracked local files discovered under content directories that are candidates for creation.
 * @param deletionCandidates - Tracked manifest entries whose local files are missing and are candidates for deletion on the server.
 * @param summary - Aggregate counts: `trackedCount` is the total number of tracked documents in the manifest; `unchangedCount` is the number of tracked documents with no local changes.
 */
function printPushPlan(
  context: CliCommandContext,
  candidates: PushCandidate[],
  newCandidates: NewFileCandidate[],
  deletionCandidates: DeletionCandidate[],
  summary: {
    trackedCount: number;
    unchangedCount: number;
  },
): void {
  context.stdout.write(
    `Push plan for ${context.project}/${context.environment} (${candidates.length} changed / ${summary.trackedCount} tracked document(s)):\n`,
  );

  if (candidates.length > 0) {
    context.stdout.write("  Changed:\n");
    for (const candidate of candidates) {
      context.stdout.write(
        `    - ${candidate.documentId} -> ${candidate.manifestEntry.path} (${candidate.format})\n`,
      );
    }
  }

  if (newCandidates.length > 0) {
    context.stdout.write("  New (untracked):\n");
    for (const candidate of newCandidates) {
      context.stdout.write(
        `    - ${candidate.path} (${candidate.resolvedType})\n`,
      );
    }
  }

  if (deletionCandidates.length > 0) {
    context.stdout.write("  Deleted (missing locally):\n");
    for (const candidate of deletionCandidates) {
      context.stdout.write(
        `    - ${candidate.documentId} -> ${candidate.path}\n`,
      );
    }
  }

  context.stdout.write(`Unchanged (skipped): ${summary.unchangedCount}\n`);
}

/**
 * Prints a concise per-document validation summary to the CLI output streams.
 *
 * Writes a header line indicating the number of validated documents, then for each
 * `DocumentValidationResult` prints:
 * - a success line to stdout when there are no errors or warnings,
 * - an error summary line to stderr when there are errors (each error printed to stderr),
 * - a warning summary line to stdout when there are warnings (each warning printed to stdout).
 *
 * @param context - CLI context whose stdout and stderr streams will be used for output
 * @param results - Array of validation results containing `path`, `errors`, and `warnings`
 */
function printValidationResults(
  context: CliCommandContext,
  results: DocumentValidationResult[],
): void {
  context.stdout.write(
    `Validating ${results.length} document(s) against local schema...\n`,
  );

  for (const result of results) {
    if (result.errors.length === 0 && result.warnings.length === 0) {
      context.stdout.write(`  v ${result.path}\n`);
      continue;
    }

    if (result.errors.length > 0) {
      context.stderr.write(`  x ${result.path}\n`);
    } else {
      context.stdout.write(`  ~ ${result.path}\n`);
    }

    for (const error of result.errors) {
      context.stderr.write(`    - ${error}\n`);
    }
    for (const warning of result.warnings) {
      context.stdout.write(`    - [warn] ${warning}\n`);
    }
  }
}

/**
 * Prints a formatted summary of push operation outcomes and follow-up guidance for common failure reasons.
 *
 * @param context - CLI context used for writing output
 * @param results - Ordered list of per-document push results to display
 */
function printPushResults(
  context: CliCommandContext,
  results: PushResult[],
): void {
  context.stdout.write("Push results:\n");

  for (const result of results) {
    const idLabel =
      result.nextDocumentId && result.nextDocumentId !== result.documentId
        ? `${result.documentId} -> ${result.nextDocumentId}`
        : result.documentId;

    context.stdout.write(
      `  - [${result.status.toUpperCase()}] ${idLabel} (${result.path}) ${result.message}\n`,
    );
  }

  const staleCount = results.filter(
    (r) => r.reasonCode === "stale_draft_revision",
  ).length;

  if (staleCount > 0) {
    context.stdout.write(
      `\nSome documents were rejected as stale. Run 'cms pull' to get the latest drafts, then re-apply your local changes.\n`,
    );
  }

  const schemaMismatchCount = results.filter(
    (r) => r.reasonCode === "schema_hash_mismatch",
  ).length;

  if (schemaMismatchCount > 0) {
    context.stdout.write(
      `\nSome documents were rejected due to schema mismatch. Run 'cms schema sync' to update the server schema, then retry.\n`,
    );
  }

  const pathConflictCount = results.filter(
    (r) => r.reasonCode === "content_path_conflict",
  ).length;

  if (pathConflictCount > 0) {
    context.stdout.write(
      `\nSome documents were rejected due to path conflicts. Run 'cms pull' to sync with server, then resolve duplicates.\n`,
    );
  }
}

/**
 * Builds a push plan by comparing the scoped manifest to local workspace files and by scanning configured content directories for untracked or missing files.
 *
 * The returned plan groups:
 * - changed candidates: tracked files whose local content differs from the manifest,
 * - new candidates: untracked local files that could be created on the server (type/locale/path resolution may fail and those files are skipped),
 * - deletion candidates: manifest-tracked entries whose local file is missing,
 * and includes counts of tracked and unchanged items.
 *
 * This function may write warnings to `context.stderr` for untracked files that cannot be mapped to a content type.
 *
 * @param context - CLI command context (used for cwd, config, and stderr)
 * @param manifest - The currently loaded scoped manifest to compare against
 * @returns A PushPlan with `changedCandidates`, `newCandidates`, `deletionCandidates`, `trackedCount`, and `unchangedCount`
 */
async function buildPushPlan(
  context: CliCommandContext,
  manifest: ScopedManifest,
): Promise<PushPlan> {
  const changedCandidates: PushCandidate[] = [];
  const deletionCandidates: DeletionCandidate[] = [];
  let trackedCount = 0;
  let unchangedCount = 0;
  const orderedDocumentIds = Object.keys(manifest).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const documentId of orderedDocumentIds) {
    const manifestEntry = manifest[documentId];

    if (!manifestEntry) {
      continue;
    }
    trackedCount += 1;

    const format = parseFileFormat(manifestEntry.path);
    const absolutePath = join(context.cwd, manifestEntry.path);
    const raw = await readFile(absolutePath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (raw === null) {
      deletionCandidates.push({
        documentId,
        path: manifestEntry.path,
        format: manifestEntry.format,
        draftRevision: manifestEntry.draftRevision,
        publishedVersion: manifestEntry.publishedVersion,
      });
      continue;
    }

    const currentHash = hashContent(raw);
    const manifestHash = manifestEntry.hash.trim();
    const isChanged = manifestHash.length === 0 || manifestHash !== currentHash;

    if (!isChanged) {
      unchangedCount += 1;
      continue;
    }

    const parsed = parseMarkdownDocument(raw);

    changedCandidates.push({
      documentId,
      manifestEntry,
      format,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      hash: currentHash,
    });
  }

  const contentDirectories = context.config.contentDirectories ?? [];
  const newCandidates: NewFileCandidate[] = [];

  if (contentDirectories.length > 0) {
    const untrackedFiles = await discoverUntrackedFiles({
      cwd: context.cwd,
      contentDirectories,
      manifest,
    });

    const types = context.config.types ?? [];

    for (const file of untrackedFiles) {
      const format = parseFileFormat(file.path);
      const absolutePath = join(context.cwd, file.path);
      const raw = await readFile(absolutePath, "utf8");
      const currentHash = hashContent(raw);
      const parsed = parseMarkdownDocument(raw);

      try {
        const resolved = resolveCreatePayload({
          path: file.path,
          format,
          types,
        });

        newCandidates.push({
          path: file.path,
          format,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          hash: currentHash,
          resolvedType: resolved.type,
          resolvedLocale: resolved.locale,
          resolvedPath: resolved.path,
        });
      } catch {
        const dir = file.path.split("/").slice(0, -1).join("/");
        context.stderr.write(
          `Warning: skipping "${file.path}" — no content type maps to directory "${dir}".\n` +
            `  Define a type with this directory in mdcms.config.ts, e.g.:\n` +
            `  defineType("myType", { directory: "${dir}", fields: { ... } })\n\n`,
        );
      }
    }
  }

  return {
    changedCandidates,
    newCandidates,
    deletionCandidates,
    trackedCount,
    unchangedCount,
  };
}

/**
 * Execute the prepared push plan against the server and persist manifest changes.
 *
 * Performs three phases in order: update tracked changed documents, create selected new documents, and delete selected documents that are missing locally. After each successful per-document operation the local scoped manifest is updated and flushed atomically to disk. Each operation contributes a `PushResult` entry; failures are counted but processing continues for remaining items.
 *
 * @param manifestPath - Filesystem path to the scoped manifest that will be updated
 * @param manifest - The currently loaded scoped manifest snapshot used as the starting state
 * @param candidates - Tracked document candidates that have local changes to update on the server
 * @param newCandidates - Untracked local file candidates selected for creation on the server
 * @param deletionCandidates - Tracked manifest entries selected for deletion on the server because the local file is missing
 * @param schemaHash - Resolved local schema hash to include with server requests for schema-aware conflict handling
 * @returns An object with `results`, the ordered per-document outcomes, and `failures`, the count of operations that failed
 */
async function applyPush(
  context: CliCommandContext,
  manifestPath: string,
  manifest: ScopedManifest,
  candidates: PushCandidate[],
  newCandidates: NewFileCandidate[],
  deletionCandidates: DeletionCandidate[],
  schemaHash: string,
): Promise<{ results: PushResult[]; failures: number }> {
  const nextManifest: ScopedManifest = { ...manifest };
  const results: PushResult[] = [];
  let failures = 0;
  let manifestDirty = false;

  // Helper: flush manifest after each successful operation (issue #6)
  async function flushManifest(): Promise<void> {
    if (manifestDirty) {
      await writeScopedManifestAtomic(manifestPath, nextManifest);
      manifestDirty = false;
    }
  }

  // Phase 1: Update changed documents
  for (const candidate of candidates) {
    try {
      const updateResult = await updateExistingDocument(
        context,
        candidate,
        schemaHash,
      );

      if (updateResult.kind === "updated") {
        nextManifest[candidate.documentId] = {
          path: candidate.manifestEntry.path,
          format: candidate.format,
          draftRevision: updateResult.remote.draftRevision,
          publishedVersion: updateResult.remote.publishedVersion,
          hash: candidate.hash,
        };
        manifestDirty = true;
        await flushManifest();

        results.push({
          status: "updated",
          documentId: candidate.documentId,
          path: candidate.manifestEntry.path,
          message: `(draft=${updateResult.remote.draftRevision}, published=${updateResult.remote.publishedVersion ?? "-"})`,
        });

        continue;
      }

      if (updateResult.kind === "stale") {
        failures += 1;
        results.push({
          status: "failed",
          documentId: candidate.documentId,
          path: candidate.manifestEntry.path,
          message: `${updateResult.code}: ${updateResult.message}`,
          reasonCode: updateResult.code.toLowerCase(),
        });
        continue;
      }

      if (updateResult.kind === "schema_mismatch") {
        failures += 1;
        results.push({
          status: "failed",
          documentId: candidate.documentId,
          path: candidate.manifestEntry.path,
          message: `${updateResult.code}: ${updateResult.message}`,
          reasonCode: updateResult.code.toLowerCase(),
        });
        continue;
      }

      if (updateResult.kind === "path_conflict") {
        failures += 1;
        results.push({
          status: "failed",
          documentId: candidate.documentId,
          path: candidate.manifestEntry.path,
          message: `${updateResult.code}: ${updateResult.message}`,
          reasonCode: updateResult.code.toLowerCase(),
        });
        continue;
      }

      const createResult = await createDocumentFromLocalFile(
        context,
        candidate,
        schemaHash,
      );

      if (
        createResult.kind === "schema_mismatch" ||
        createResult.kind === "path_conflict"
      ) {
        failures += 1;
        results.push({
          status: "failed",
          documentId: candidate.documentId,
          path: candidate.manifestEntry.path,
          message: `${createResult.code}: ${createResult.message}`,
          reasonCode: createResult.code.toLowerCase(),
        });
        continue;
      }

      const created = createResult.remote;
      delete nextManifest[candidate.documentId];
      nextManifest[created.documentId] = {
        path: candidate.manifestEntry.path,
        format: candidate.format,
        draftRevision: created.draftRevision,
        publishedVersion: created.publishedVersion,
        hash: candidate.hash,
      };
      manifestDirty = true;
      await flushManifest();

      results.push({
        status: "created",
        documentId: candidate.documentId,
        nextDocumentId: created.documentId,
        path: candidate.manifestEntry.path,
        message: `(draft=${created.draftRevision}, published=${created.publishedVersion ?? "-"})`,
      });
    } catch (error) {
      failures += 1;
      const runtimeError =
        error instanceof RuntimeError
          ? error
          : new RuntimeError({
              code: "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unexpected push failure.",
              statusCode: 500,
            });

      results.push({
        status: "failed",
        documentId: candidate.documentId,
        path: candidate.manifestEntry.path,
        message: `${runtimeError.code}: ${runtimeError.message}`,
      });
    }
  }

  // Phase 2: Create new documents
  for (const candidate of newCandidates) {
    try {
      const createResult = await createNewDocument(
        context,
        candidate,
        schemaHash,
      );

      if (
        createResult.kind === "schema_mismatch" ||
        createResult.kind === "path_conflict"
      ) {
        failures += 1;
        results.push({
          status: "failed",
          documentId: "(new)",
          path: candidate.path,
          message: `${createResult.code}: ${createResult.message}`,
          reasonCode: createResult.code.toLowerCase(),
        });
        continue;
      }

      const created = createResult.remote;
      nextManifest[created.documentId] = {
        path: candidate.path,
        format: candidate.format,
        draftRevision: created.draftRevision,
        publishedVersion: created.publishedVersion,
        hash: candidate.hash,
      };
      manifestDirty = true;
      await flushManifest();

      results.push({
        status: "created",
        documentId: created.documentId,
        path: candidate.path,
        message: `(draft=${created.draftRevision}, published=${created.publishedVersion ?? "-"})`,
      });
    } catch (error) {
      failures += 1;
      const runtimeError =
        error instanceof RuntimeError
          ? error
          : new RuntimeError({
              code: "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unexpected create failure.",
              statusCode: 500,
            });

      results.push({
        status: "failed",
        documentId: "(new)",
        path: candidate.path,
        message: `${runtimeError.code}: ${runtimeError.message}`,
      });
    }
  }

  // Phase 3: Delete documents
  for (const candidate of deletionCandidates) {
    try {
      const deleteResult = await deleteDocument(
        context,
        candidate.documentId,
        schemaHash,
      );

      delete nextManifest[candidate.documentId];
      manifestDirty = true;
      await flushManifest();

      results.push({
        status: "deleted",
        documentId: candidate.documentId,
        path: candidate.path,
        message:
          deleteResult.kind === "already_gone"
            ? "(already deleted on server)"
            : "(soft-deleted)",
      });
    } catch (error) {
      failures += 1;
      const runtimeError =
        error instanceof RuntimeError
          ? error
          : new RuntimeError({
              code: "INTERNAL_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unexpected delete failure.",
              statusCode: 500,
            });

      results.push({
        status: "failed",
        documentId: candidate.documentId,
        path: candidate.path,
        message: `${runtimeError.code}: ${runtimeError.message}`,
      });
    }
  }

  // Final flush in case any trailing writes
  await flushManifest();

  return {
    results,
    failures,
  };
}

/**
 * Execute the `mdcms push` CLI command: build and present a push plan, optionally validate frontmatter, interactively (or forcibly) select new/deletion candidates, perform server updates/creates/deletes in phases with incremental manifest updates, and print results.
 *
 * @param context - CLI execution context (arguments, I/O, config, and workspace info)
 * @returns `0` when the push completed without failures; `1` when validation failed or any push operations failed
 * @throws RuntimeError when CLI input is invalid, the local schema state is missing, or the user cancels the push
 */
export async function runPushCommand(
  context: CliCommandContext,
): Promise<number> {
  if (context.args.includes("--help") || context.args.includes("-h")) {
    context.stdout.write(renderPushHelp());
    return 0;
  }

  const options = parsePushOptions(context.args);

  if (options.published) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: 'Flag "--published" is reserved and not supported for push yet.',
      statusCode: 400,
    });
  }

  const schemaState = await readSchemaState({
    cwd: context.cwd,
    project: context.project,
    environment: context.environment,
  });

  if (!schemaState) {
    throw new RuntimeError({
      code: "SCHEMA_STATE_MISSING",
      message:
        `No local schema state found for ${context.project}/${context.environment}.\n` +
        `If you just cloned this repo, run these commands to get started:\n` +
        `  1. mdcms schema sync   (sync schema to server)\n` +
        `  2. mdcms pull          (download content from server)\n\n` +
        `Otherwise, run: mdcms schema sync`,
      statusCode: 400,
    });
  }

  const manifestPath = resolveScopedManifestPath({
    cwd: context.cwd,
    project: context.project,
    environment: context.environment,
  });
  const manifest = await loadScopedManifest(manifestPath);
  const pushPlan = await buildPushPlan(context, manifest);

  const hasAnything =
    pushPlan.trackedCount > 0 || pushPlan.newCandidates.length > 0;

  if (!hasAnything) {
    const contentDirs = context.config.contentDirectories ?? [];
    const types = context.config.types ?? [];

    if (contentDirs.length === 0) {
      context.stderr.write(
        `No content directories configured in mdcms.config.ts.\n` +
          `Add directories to scan, e.g.:\n\n` +
          `  contentDirectories: ["content/posts"]\n\n`,
      );
    } else if (types.length === 0) {
      context.stderr.write(
        `No content types defined in mdcms.config.ts.\n` +
          `Define at least one type that maps to your content directory, e.g.:\n\n` +
          `  const post = defineType("post", {\n` +
          `    directory: "content/posts",\n` +
          `    fields: { title: z.string() },\n` +
          `  });\n\n` +
          `Then pass it to defineConfig: types: [post]\n\n`,
      );
    } else {
      context.stdout.write(
        `No documents found for ${context.project}/${context.environment}.\n`,
      );
    }
    return 0;
  }

  printPushPlan(
    context,
    pushPlan.changedCandidates,
    pushPlan.newCandidates,
    pushPlan.deletionCandidates,
    {
      trackedCount: pushPlan.trackedCount,
      unchangedCount: pushPlan.unchangedCount,
    },
  );

  // Interactive selection for new files
  // Issue #8: in non-interactive mode without --force, skip new/deleted but still push changed
  let selectedNewCandidates: NewFileCandidate[] = [];
  if (pushPlan.newCandidates.length > 0) {
    if (options.force) {
      selectedNewCandidates = pushPlan.newCandidates;
    } else {
      const selectedPaths = await context.multiSelect(
        "Select new files to upload:",
        pushPlan.newCandidates.map((c) => ({
          label: `${c.path} (${c.resolvedType})`,
          value: c.path,
        })),
      );
      selectedNewCandidates = pushPlan.newCandidates.filter((c) =>
        selectedPaths.includes(c.path),
      );

      if (selectedPaths.length === 0 && pushPlan.newCandidates.length > 0) {
        context.stdout.write(
          `Hint: ${pushPlan.newCandidates.length} new file(s) skipped. Use --force to include them in non-interactive mode.\n`,
        );
      }
    }
  }

  // Interactive selection for deletions
  let selectedDeletionCandidates: DeletionCandidate[] = [];
  if (pushPlan.deletionCandidates.length > 0) {
    if (options.force) {
      selectedDeletionCandidates = pushPlan.deletionCandidates;
    } else {
      const selectedIds = await context.multiSelect(
        "Select files to delete from server:",
        pushPlan.deletionCandidates.map((c) => ({
          label: `${c.path} (${c.documentId})`,
          value: c.documentId,
        })),
      );
      selectedDeletionCandidates = pushPlan.deletionCandidates.filter((c) =>
        selectedIds.includes(c.documentId),
      );

      if (selectedIds.length === 0 && pushPlan.deletionCandidates.length > 0) {
        context.stdout.write(
          `Hint: ${pushPlan.deletionCandidates.length} deletion(s) skipped. Use --force to include them in non-interactive mode.\n`,
        );
      }
    }
  }

  if (options.validate) {
    const resolvedSchema = serializeResolvedEnvironmentSchema(
      context.config as ParsedMdcmsConfig,
      context.environment,
    );

    const schemaSyncState = await readSchemaState({
      cwd: context.cwd,
      project: context.project,
      environment: context.environment,
    });

    if (schemaSyncState) {
      const currentPayload = buildSchemaSyncPayload(
        context.config as ParsedMdcmsConfig,
        context.environment,
      );
      if (schemaSyncState.schemaHash !== currentPayload.schemaHash) {
        context.stderr.write(
          "Warning: Local schema differs from last synced schema. Run `cms schema sync` to update the server.\n",
        );
      }
    }

    const changedValidationCandidates = pushPlan.changedCandidates.map(
      (candidate) => {
        const pathWithoutExtension = candidate.manifestEntry.path.replace(
          /\.(md|mdx)$/i,
          "",
        );
        const typeConfig = pickTypeConfigForPath(
          context.config.types ?? [],
          pathWithoutExtension,
        );
        return {
          path: candidate.manifestEntry.path,
          typeName: typeConfig.name,
          frontmatter: candidate.frontmatter,
        };
      },
    );

    const newValidationCandidates = selectedNewCandidates.map((candidate) => ({
      path: candidate.path,
      typeName: candidate.resolvedType,
      frontmatter: candidate.frontmatter,
    }));

    const validationResults = validateCandidates(
      [...changedValidationCandidates, ...newValidationCandidates],
      resolvedSchema,
    );
    printValidationResults(context, validationResults);

    const totalErrors = validationResults.reduce(
      (sum, r) => sum + r.errors.length,
      0,
    );
    const failedDocs = validationResults.filter(
      (r) => r.errors.length > 0,
    ).length;

    if (totalErrors > 0) {
      context.stderr.write(
        `\nValidation failed: ${totalErrors} error(s) in ${failedDocs} document(s).\n`,
      );
      return 1;
    }

    context.stdout.write("Validation passed.\n");
  }

  const hasWork =
    pushPlan.changedCandidates.length > 0 ||
    selectedNewCandidates.length > 0 ||
    selectedDeletionCandidates.length > 0;

  if (!hasWork) {
    context.stdout.write(
      `No changes to push for ${context.project}/${context.environment}.\n`,
    );
    return 0;
  }

  // Issue #8: in non-interactive mode, auto-confirm changed files (already tracked)
  // but still require --force for new/deleted. Only block if nothing to do.
  if (!options.force) {
    const parts: string[] = [];
    if (pushPlan.changedCandidates.length > 0) {
      parts.push(`${pushPlan.changedCandidates.length} changed`);
    }
    if (selectedNewCandidates.length > 0) {
      parts.push(`${selectedNewCandidates.length} new`);
    }
    if (selectedDeletionCandidates.length > 0) {
      parts.push(`${selectedDeletionCandidates.length} to delete`);
    }
    const confirmed = await context.confirm(
      `Push ${parts.join(", ")} document(s) to ${context.project}/${context.environment}?`,
    );

    if (!confirmed) {
      throw new RuntimeError({
        code: "PUSH_CANCELLED",
        message: "Push cancelled by user.",
        statusCode: 400,
      });
    }
  }

  const { results, failures } = await applyPush(
    context,
    manifestPath,
    manifest,
    pushPlan.changedCandidates,
    selectedNewCandidates,
    selectedDeletionCandidates,
    schemaState.schemaHash,
  );
  printPushResults(context, results);

  return failures > 0 ? 1 : 0;
}

export function createPushCommand(): CliCommand {
  return {
    name: "push",
    description: "Upload local markdown files to CMS draft content",
    run: runPushCommand,
  };
}
