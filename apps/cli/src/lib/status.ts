import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ApiPaginatedEnvelope,
  ContentDocumentResponse,
  ParsedMdcmsConfig,
} from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";
import { buildSchemaSyncPayload } from "@mdcms/shared/server";

import { readSchemaState } from "./schema-state.js";

import type { CliCommand, CliCommandContext } from "./framework.js";
import {
  loadScopedManifest,
  resolveScopedManifestPath,
  type ScopedManifest,
} from "./manifest.js";
import { hashContent } from "./push.js";

type ContentDocumentPayload = Pick<
  ContentDocumentResponse,
  | "documentId"
  | "type"
  | "locale"
  | "path"
  | "format"
  | "frontmatter"
  | "body"
  | "draftRevision"
  | "publishedVersion"
>;

type DriftCategory =
  | "modified_on_server"
  | "modified_locally"
  | "both_modified"
  | "new_on_server"
  | "deleted_on_server"
  | "moved_renamed"
  | "unchanged";

type DriftEntry = {
  category: DriftCategory;
  documentId: string;
  localPath?: string;
  serverPath?: string;
  manifestRevision?: number;
  serverRevision?: number;
};

/**
 * Render the help text for the `mdcms status` CLI command.
 *
 * @returns The multi-line help string shown when running `mdcms status --help` or `mdcms status -h`
 */
export function renderStatusHelp(): string {
  return [
    "Usage: mdcms status",
    "",
    "Show sync status comparing local content versions against the server.",
    "",
    "Options:",
    "  -h, --help   Show this help text",
    "",
  ].join("\n");
}

/**
 * Builds HTTP request headers for API calls using values from the CLI context.
 *
 * @param context - CLI command context containing project, environment, and optional apiKey
 * @returns A Headers object containing `content-type`, `x-mdcms-project`, `x-mdcms-environment`, and `authorization` if `apiKey` is present
 */
function toRequestHeaders(context: CliCommandContext): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-mdcms-project": context.project,
    "x-mdcms-environment": context.environment,
  });

  if (context.apiKey) {
    headers.set("authorization", `Bearer ${context.apiKey}`);
  }

  return headers;
}

/**
 * Builds a URL-encoded query string for fetching scoped content.
 *
 * @param input.project - The project identifier to include in the scope
 * @param input.environment - The environment name to include in the scope
 * @param input.draft - Whether to include draft documents (`true` → "true", `false` → "false")
 * @param input.limit - Maximum number of items per page
 * @param input.offset - Pagination offset
 * @returns A URL-encoded query string containing `project`, `environment`, `draft`, `limit`, and `offset`
 */
function encodeScopeQuery(input: {
  project: string;
  environment: string;
  draft: boolean;
  limit: number;
  offset: number;
}): string {
  const query = new URLSearchParams();
  query.set("project", input.project);
  query.set("environment", input.environment);
  query.set("draft", input.draft ? "true" : "false");
  query.set("limit", String(input.limit));
  query.set("offset", String(input.offset));
  return query.toString();
}

/**
 * Fetches a single paginated page of content documents from the server for the current project and environment.
 *
 * @param context - CLI context containing server URL, project, environment, and fetcher
 * @param input.draft - If `true`, request draft content; if `false`, request published content
 * @param input.offset - Zero-based index of the first item to return
 * @param input.limit - Maximum number of items to return
 * @returns An object with `data`, an array of content document payloads, and `pagination` containing `hasMore`, `offset`, `limit`, and `total`
 */
async function fetchContentPage(
  context: CliCommandContext,
  input: {
    draft: boolean;
    offset: number;
    limit: number;
  },
): Promise<{
  data: ContentDocumentPayload[];
  pagination: {
    hasMore: boolean;
    offset: number;
    limit: number;
    total: number;
  };
}> {
  const query = encodeScopeQuery({
    project: context.project,
    environment: context.environment,
    draft: input.draft,
    limit: input.limit,
    offset: input.offset,
  });
  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content?${query}`,
    {
      method: "GET",
      headers: toRequestHeaders(context),
    },
  );

  const body = (await response.json().catch(() => undefined)) as
    | ({
        code?: string;
        message?: string;
      } & Partial<ApiPaginatedEnvelope<ContentDocumentPayload>>)
    | undefined;

  if (!response.ok) {
    throw new RuntimeError({
      code: body?.code ?? "REMOTE_ERROR",
      message: body?.message ?? `Content request failed (${response.status}).`,
      statusCode: response.status,
    });
  }

  if (!body?.data || !body.pagination) {
    throw new RuntimeError({
      code: "REMOTE_ERROR",
      message: "Content API response is missing data/pagination payload.",
      statusCode: 502,
    });
  }

  return {
    data: body.data,
    pagination: body.pagination,
  };
}

/**
 * Fetches all content documents from the server for the specified draft scope.
 *
 * @param input - Options for the fetch operation; `draft` determines whether to request draft documents (`true`) or published documents (`false`)
 * @returns The aggregated list of content document payloads retrieved across all paginated server responses
 */
async function fetchAllContent(
  context: CliCommandContext,
  input: { draft: boolean },
): Promise<ContentDocumentPayload[]> {
  const rows: ContentDocumentPayload[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const page = await fetchContentPage(context, {
      draft: input.draft,
      offset,
      limit,
    });
    rows.push(...page.data);

    if (!page.pagination.hasMore) {
      break;
    }

    offset = page.pagination.offset + page.pagination.limit;
  }

  return rows;
}

/**
 * Compute the expected local filesystem path for a server content document using the configured type mapping.
 *
 * Resolves the document's path and format into a local filename, applying locale-based filename suffix when the
 * content type is configured as localized.
 *
 * @param document - Server document payload; uses `type`, `path`, `format`, and `locale` to construct the path.
 * @returns The relative local path (no leading slashes) including file extension, and `<locale>` inserted before the
 * extension for localized types (e.g. `path/to/file.en.md`).
 * @throws RuntimeError with code `TYPE_MAPPING_MISSING` if the document's type has no mapping in the CLI config.
 * @throws RuntimeError with code `INVALID_REMOTE_DOCUMENT` if a localized type is expected but the document's `locale`
 * is empty.
 */
function resolveLocalPathForDocument(
  context: CliCommandContext,
  document: ContentDocumentPayload,
): string {
  const typeConfig = context.config.types?.find(
    (entry) => entry.name === document.type,
  );

  if (!typeConfig) {
    throw new RuntimeError({
      code: "TYPE_MAPPING_MISSING",
      message: `Missing type mapping in config for content type "${document.type}".`,
      statusCode: 400,
      details: {
        type: document.type,
      },
    });
  }

  const basePath = document.path.replace(/^\/+/, "");
  const extension = document.format;

  if (typeConfig.localized) {
    const locale = document.locale.trim();

    if (!locale) {
      throw new RuntimeError({
        code: "INVALID_REMOTE_DOCUMENT",
        message: `Remote document "${document.documentId}" is missing locale for localized type "${document.type}".`,
        statusCode: 400,
      });
    }

    return `${basePath}.${locale}.${extension}`;
  }

  return `${basePath}.${extension}`;
}

/**
 * Compute the content hash for the file at the given absolute filesystem path.
 *
 * @param absolutePath - Absolute filesystem path of the file to read
 * @returns The content hash string, or `undefined` if the file does not exist
 * @throws Propagates filesystem errors other than "file not found" (ENOENT)
 */
async function readLocalFileHash(
  absolutePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(absolutePath, "utf8");
    return hashContent(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Computes content drift between local manifest state and server documents.
 *
 * Compares each server document to the provided scoped manifest and local files,
 * producing one DriftEntry per observed difference (or unchanged item). Entries
 * classify documents into categories such as `unchanged`, `modified_locally`,
 * `modified_on_server`, `both_modified`, `new_on_server`, `deleted_on_server`,
 * and `moved_renamed`.
 *
 * @param input.context - CLI command context (used to resolve local paths and CWD)
 * @param input.serverDocuments - Server-side content documents to compare
 * @param input.manifest - Scoped manifest mapping document IDs to local manifest entries
 * @returns An array of DriftEntry objects describing the synchronization status for each document
 */
async function computeDriftAsync(input: {
  context: CliCommandContext;
  serverDocuments: ContentDocumentPayload[];
  manifest: ScopedManifest;
}): Promise<DriftEntry[]> {
  const entries: DriftEntry[] = [];
  const seenDocumentIds = new Set<string>();

  for (const serverDoc of input.serverDocuments) {
    seenDocumentIds.add(serverDoc.documentId);
    const serverLocalPath = resolveLocalPathForDocument(
      input.context,
      serverDoc,
    );
    const manifestEntry = input.manifest[serverDoc.documentId];

    if (!manifestEntry) {
      entries.push({
        category: "new_on_server",
        documentId: serverDoc.documentId,
        serverPath: serverLocalPath,
        serverRevision: serverDoc.draftRevision,
      });
      continue;
    }

    const manifestPath = manifestEntry.path;

    const pathChanged = manifestPath !== serverLocalPath;

    if (pathChanged) {
      entries.push({
        category: "moved_renamed",
        documentId: serverDoc.documentId,
        localPath: manifestPath,
        serverPath: serverLocalPath,
        manifestRevision: manifestEntry.draftRevision,
        serverRevision: serverDoc.draftRevision,
      });
      continue;
    }

    const localFileHash = await readLocalFileHash(
      join(input.context.cwd, manifestPath),
    );
    const localModified =
      localFileHash !== undefined && localFileHash !== manifestEntry.hash;

    const serverModified =
      serverDoc.draftRevision !== manifestEntry.draftRevision;

    if (localModified && serverModified) {
      entries.push({
        category: "both_modified",
        documentId: serverDoc.documentId,
        localPath: manifestPath,
        manifestRevision: manifestEntry.draftRevision,
        serverRevision: serverDoc.draftRevision,
      });
    } else if (serverModified) {
      entries.push({
        category: "modified_on_server",
        documentId: serverDoc.documentId,
        localPath: manifestPath,
        manifestRevision: manifestEntry.draftRevision,
        serverRevision: serverDoc.draftRevision,
      });
    } else if (localModified) {
      entries.push({
        category: "modified_locally",
        documentId: serverDoc.documentId,
        localPath: manifestPath,
        manifestRevision: manifestEntry.draftRevision,
      });
    } else {
      entries.push({
        category: "unchanged",
        documentId: serverDoc.documentId,
        localPath: manifestPath,
      });
    }
  }

  for (const [documentId, manifestEntry] of Object.entries(input.manifest)) {
    if (seenDocumentIds.has(documentId)) {
      continue;
    }

    entries.push({
      category: "deleted_on_server",
      documentId,
      localPath: manifestEntry.path,
      manifestRevision: manifestEntry.draftRevision,
    });
  }

  return entries;
}

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  modified_on_server: "Modified on server",
  modified_locally: "Modified locally",
  both_modified: "Both modified",
  new_on_server: "New on server",
  deleted_on_server: "Deleted on server",
  moved_renamed: "Moved/Renamed",
  unchanged: "Unchanged",
};

const DISPLAY_ORDER: DriftCategory[] = [
  "modified_on_server",
  "modified_locally",
  "both_modified",
  "new_on_server",
  "deleted_on_server",
  "moved_renamed",
  "unchanged",
];

/**
 * Group drift entries by their `DriftCategory`.
 *
 * @param entries - The list of drift entries to group
 * @returns A Map where each key is a `DriftCategory` and each value is an array of `DriftEntry` items in that category
 */
function groupByCategory(
  entries: DriftEntry[],
): Map<DriftCategory, DriftEntry[]> {
  const groups = new Map<DriftCategory, DriftEntry[]>();

  for (const entry of entries) {
    const rows = groups.get(entry.category) ?? [];
    rows.push(entry);
    groups.set(entry.category, rows);
  }

  return groups;
}

/**
 * Format a single-line human-readable detail for a drift entry.
 *
 * Chooses a display label in the order `localPath`, `serverPath`, then `documentId`, and appends revision or path-change details appropriate to the entry's category.
 *
 * @param entry - The drift entry to format
 * @returns A single-line string (prefixed with four spaces) describing the entry and any relevant revision or path information
 */
function formatEntryDetail(entry: DriftEntry): string {
  const path = entry.localPath ?? entry.serverPath ?? entry.documentId;

  switch (entry.category) {
    case "modified_on_server":
      return `    ${path}${padRevisionInfo(`(local: r${entry.manifestRevision}, server: r${entry.serverRevision})`)}`;
    case "modified_locally":
      return `    ${path}${padRevisionInfo(`(local file differs from r${entry.manifestRevision})`)}`;
    case "both_modified":
      return `    ${path}${padRevisionInfo(`(local: r${entry.manifestRevision}, server: r${entry.serverRevision})`)}`;
    case "new_on_server":
      return `    ${path}${padRevisionInfo(`(server: r${entry.serverRevision})`)}`;
    case "deleted_on_server":
      return `    ${path}`;
    case "moved_renamed":
      return `    ${entry.localPath} -> ${entry.serverPath}`;
    default:
      return `    ${path}`;
  }
}

/**
 * Indents a revision/detail string for aligned display in the report output.
 *
 * @param info - The revision or detail text to indent
 * @returns The input string prefixed with seven spaces
 */
function padRevisionInfo(info: string): string {
  return `       ${info}`;
}

/**
 * Render a grouped content drift report to the CLI's stdout.
 *
 * Groups the provided drift entries by category, prints a "Content" header,
 * and for each non-empty category (in DISPLAY_ORDER) writes a count and
 * per-entry details to `context.stdout`. The `unchanged` category is shown
 * as a single summary line with a file count.
 *
 * @param context - The CLI command context providing the `stdout` stream used for output
 * @param entries - Array of drift entries to include in the report
 */
function renderDriftReport(
  context: CliCommandContext,
  entries: DriftEntry[],
): void {
  const groups = groupByCategory(entries);

  context.stdout.write("\nContent:\n");

  for (const category of DISPLAY_ORDER) {
    const rows = groups.get(category) ?? [];

    if (rows.length === 0) {
      continue;
    }

    if (category === "unchanged") {
      context.stdout.write(`\n  Unchanged: ${rows.length} files\n`);
      continue;
    }

    const label = CATEGORY_LABELS[category];
    context.stdout.write(`\n  ${label} (${rows.length}):\n`);

    for (const entry of rows) {
      context.stdout.write(`${formatEntryDetail(entry)}\n`);
    }
  }
}

type SchemaDriftStatus = "in_sync" | "drifted" | "no_state";

/**
 * Determines whether the local schema has diverged from the last saved schema state.
 *
 * @param context - CLI context (provides `cwd`, `project`, `environment`, and `config`) used to locate saved state and compute the current schema hash
 * @returns `{ status: 'in_sync', syncedAt }` if the current schema hash matches the saved state; `{ status: 'drifted' }` if the hashes differ; `{ status: 'no_state' }` if no saved state exists or the current hash cannot be computed
 */
async function detectSchemaDrift(
  context: CliCommandContext,
): Promise<{ status: SchemaDriftStatus; syncedAt?: string }> {
  const state = await readSchemaState({
    cwd: context.cwd,
    project: context.project,
    environment: context.environment,
  });

  if (!state) {
    return { status: "no_state" };
  }

  let currentHash: string;
  try {
    currentHash = buildSchemaSyncPayload(
      context.config as ParsedMdcmsConfig,
      context.environment,
    ).schemaHash;
  } catch {
    return { status: "no_state" };
  }

  if (currentHash === state.schemaHash) {
    return { status: "in_sync", syncedAt: state.syncedAt };
  }

  return { status: "drifted" };
}

/**
 * Writes a human-readable schema synchronization report to the CLI output.
 *
 * @param context - CLI execution context whose stdout is used for printing the report
 * @param result - Schema drift check result; `status` is one of:
 *   - `"in_sync"`: schema matches the last synced state (optionally provides `syncedAt`)
 *   - `"drifted"`: local schema differs from the last synced state
 *   - `"no_state"`: no previously synced schema state was found
 */
function renderSchemaReport(
  context: CliCommandContext,
  result: { status: SchemaDriftStatus; syncedAt?: string },
): void {
  context.stdout.write("\nSchema:\n");

  switch (result.status) {
    case "in_sync":
      context.stdout.write(`  In sync (synced ${result.syncedAt})\n`);
      break;
    case "drifted":
      context.stdout.write(
        "  Local schema differs from last sync. Run `cms schema sync`.\n",
      );
      break;
    case "no_state":
      context.stdout.write(
        "  No synced schema found.\n" +
          "  If you just cloned this repo, run: cms schema sync && cms pull\n",
      );
      break;
  }
}

/**
 * Execute the `status` CLI command: fetch remote draft content, compare with local manifest/files and schema, and print a drift report.
 *
 * @param context - CLI execution context (provides server, project, environment, working directory, args, and IO streams); used to fetch remote content, load the scoped manifest, read local files, and write reports to stdout.
 * @returns `0` when neither content nor schema drift is detected, `1` if any content or schema drift is found.
 */
export async function runStatusCommand(
  context: CliCommandContext,
): Promise<number> {
  if (context.args.includes("--help") || context.args.includes("-h")) {
    context.stdout.write(renderStatusHelp());
    return 0;
  }

  context.stdout.write(
    `Fetching content from ${context.serverUrl} (${context.environment})...\n`,
  );
  context.stdout.write(`Project: ${context.project}\n`);

  const serverDocuments = await fetchAllContent(context, { draft: true });

  const manifestPath = resolveScopedManifestPath({
    cwd: context.cwd,
    project: context.project,
    environment: context.environment,
  });
  const manifest = await loadScopedManifest(manifestPath);

  const driftEntries = await computeDriftAsync({
    context,
    serverDocuments,
    manifest,
  });

  renderDriftReport(context, driftEntries);

  const schemaDrift = await detectSchemaDrift(context);
  renderSchemaReport(context, schemaDrift);

  const hasContentDrift = driftEntries.some(
    (entry) => entry.category !== "unchanged",
  );
  const hasSchemaDrift = schemaDrift.status !== "in_sync";

  return hasContentDrift || hasSchemaDrift ? 1 : 0;
}

/**
 * Create the CLI status command descriptor used to register the `status` command.
 *
 * @returns A `CliCommand` object with name `"status"`, a brief description, and the `run` handler.
 */
export function createStatusCommand(): CliCommand {
  return {
    name: "status",
    description: "Show sync status (local vs server versions)",
    run: runStatusCommand,
  };
}
