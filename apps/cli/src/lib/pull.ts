import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { RuntimeError } from "@mdcms/shared";

import type { CliCommand, CliCommandContext } from "./framework.js";

type PullManifestEntry = {
  path: string;
  format: "md" | "mdx";
  draftRevision: number;
  publishedVersion: number | null;
  hash: string;
};

type PullManifest = Record<string, PullManifestEntry>;

type ContentDocumentPayload = {
  documentId: string;
  type: string;
  locale: string;
  path: string;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  draftRevision: number;
  publishedVersion: number | null;
};

type PullChangeStatus =
  | "Modified"
  | "Locally modified"
  | "New"
  | "Moved/Renamed"
  | "Deleted on server"
  | "Unchanged";

type PullChange = {
  status: PullChangeStatus;
  documentId: string;
  nextPath?: string;
  previousPath?: string;
  format?: "md" | "mdx";
  draftRevision?: number;
  publishedVersion?: number | null;
  nextContent?: string;
  nextHash?: string;
};

type PullOptions = {
  published: boolean;
  force: boolean;
  dryRun: boolean;
};

function parseBooleanFlag(
  args: string[],
  short: string,
  long: string,
): boolean {
  return args.includes(short) || args.includes(long);
}

function parsePullOptions(args: string[]): PullOptions {
  for (const token of args) {
    if (
      token === "--published" ||
      token === "--force" ||
      token === "--dry-run"
    ) {
      continue;
    }

    if (token === "--help" || token === "-h") {
      continue;
    }

    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Unknown pull flag "${token}".`,
      statusCode: 400,
    });
  }

  return {
    published: parseBooleanFlag(args, "", "--published"),
    force: parseBooleanFlag(args, "", "--force"),
    dryRun: parseBooleanFlag(args, "", "--dry-run"),
  };
}

function renderPullHelp(): string {
  return [
    "Usage: mdcms pull [--published] [--force] [--dry-run]",
    "",
    "Options:",
    "  --published   Pull published snapshots instead of draft heads",
    "  --force       Skip overwrite confirmation for locally modified files",
    "  --dry-run     Show plan only (no file writes)",
    "",
  ].join("\n");
}

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
    | {
        code?: string;
        message?: string;
        data?: ContentDocumentPayload[];
        pagination?: {
          hasMore: boolean;
          offset: number;
          limit: number;
          total: number;
        };
      }
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

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function renderYamlScalar(value: unknown): string {
  if (typeof value === "string") {
    return quoteYamlString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return quoteYamlString(String(value));
}

function renderYaml(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          Object.keys(entry).length > 0
        ) {
          return `${pad}-\n${renderYaml(entry, depth + 1)}`;
        }

        return `${pad}- ${renderYamlScalar(entry)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );

    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, entryValue]) => {
        if (
          entryValue &&
          typeof entryValue === "object" &&
          (!Array.isArray(entryValue) || entryValue.length > 0)
        ) {
          return `${pad}${key}:\n${renderYaml(entryValue, depth + 1)}`;
        }

        if (Array.isArray(entryValue) && entryValue.length === 0) {
          return `${pad}${key}: []`;
        }

        return `${pad}${key}: ${renderYamlScalar(entryValue)}`;
      })
      .join("\n");
  }

  return `${pad}${renderYamlScalar(value)}`;
}

function renderMarkdownDocument(input: {
  frontmatter: Record<string, unknown>;
  body: string;
}): string {
  const hasFrontmatter = Object.keys(input.frontmatter).length > 0;
  const normalizedBody = input.body.endsWith("\n")
    ? input.body
    : `${input.body}\n`;

  if (!hasFrontmatter) {
    return normalizedBody;
  }

  return `---\n${renderYaml(input.frontmatter)}\n---\n\n${normalizedBody}`;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

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

async function loadManifest(path: string): Promise<PullManifest> {
  if (!existsSync(path)) {
    return {};
  }

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest at "${path}" must be an object.`,
      statusCode: 400,
    });
  }

  return parsed as PullManifest;
}

async function saveManifest(
  path: string,
  manifest: PullManifest,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readHash(path: string): Promise<string | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }

  const content = await readFile(path, "utf8");
  return hashContent(content);
}

function formatRevision(change: PullChange): string {
  const draftRevision =
    typeof change.draftRevision === "number" ? change.draftRevision : "-";
  const publishedVersion =
    typeof change.publishedVersion === "number" ? change.publishedVersion : "-";
  return `draft=${draftRevision}, published=${publishedVersion}`;
}

function groupChanges(
  changes: PullChange[],
): Map<PullChangeStatus, PullChange[]> {
  const groups = new Map<PullChangeStatus, PullChange[]>();

  for (const change of changes) {
    const rows = groups.get(change.status) ?? [];
    rows.push(change);
    groups.set(change.status, rows);
  }

  return groups;
}

function printPlan(context: CliCommandContext, changes: PullChange[]): void {
  const orderedStatuses: PullChangeStatus[] = [
    "Modified",
    "Locally modified",
    "New",
    "Moved/Renamed",
    "Deleted on server",
    "Unchanged",
  ];
  const groups = groupChanges(changes);

  context.stdout.write("Pull plan:\n");
  for (const status of orderedStatuses) {
    const rows = groups.get(status) ?? [];
    context.stdout.write(`\n${status} (${rows.length})\n`);

    for (const change of rows) {
      if (status === "Moved/Renamed") {
        context.stdout.write(
          `  - ${change.previousPath} -> ${change.nextPath} (${formatRevision(change)})\n`,
        );
        continue;
      }

      if (status === "Deleted on server") {
        context.stdout.write(
          `  - ${change.previousPath} (${formatRevision(change)})\n`,
        );
        continue;
      }

      context.stdout.write(
        `  - ${change.nextPath ?? change.previousPath} (${formatRevision(change)})\n`,
      );
    }
  }
}

async function writeContentFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function applyPullChanges(input: {
  context: CliCommandContext;
  changes: PullChange[];
  manifestPath: string;
  manifest: PullManifest;
}): Promise<void> {
  for (const change of input.changes) {
    if (change.status === "Unchanged") {
      continue;
    }

    if (change.status === "Deleted on server") {
      if (change.previousPath) {
        await rm(join(input.context.cwd, change.previousPath), { force: true });
      }

      delete input.manifest[change.documentId];
      continue;
    }

    if (change.status === "Moved/Renamed" && change.previousPath) {
      await rm(join(input.context.cwd, change.previousPath), { force: true });
    }

    if (
      !change.nextPath ||
      !change.nextContent ||
      !change.nextHash ||
      !change.format
    ) {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Pull planner generated invalid apply payload.",
        statusCode: 500,
      });
    }

    await writeContentFile(
      join(input.context.cwd, change.nextPath),
      change.nextContent,
    );
    input.manifest[change.documentId] = {
      path: change.nextPath,
      format: change.format,
      draftRevision: change.draftRevision ?? 0,
      publishedVersion:
        typeof change.publishedVersion === "number"
          ? change.publishedVersion
          : null,
      hash: change.nextHash,
    };
  }

  await saveManifest(input.manifestPath, input.manifest);
}

async function computePullChanges(input: {
  context: CliCommandContext;
  remoteDocuments: ContentDocumentPayload[];
  manifest: PullManifest;
}): Promise<PullChange[]> {
  const changes: PullChange[] = [];
  const seenDocumentIds = new Set<string>();

  for (const document of input.remoteDocuments) {
    seenDocumentIds.add(document.documentId);
    const nextPath = resolveLocalPathForDocument(input.context, document);
    const nextContent = renderMarkdownDocument({
      frontmatter: document.frontmatter,
      body: document.body,
    });
    const nextHash = hashContent(nextContent);
    const manifestEntry = input.manifest[document.documentId];

    if (!manifestEntry) {
      changes.push({
        status: "New",
        documentId: document.documentId,
        nextPath,
        format: document.format,
        draftRevision: document.draftRevision,
        publishedVersion: document.publishedVersion,
        nextContent,
        nextHash,
      });
      continue;
    }

    const manifestPath = manifestEntry.path;
    const localHash = await readHash(join(input.context.cwd, manifestPath));
    const pathChanged =
      manifestPath !== nextPath || manifestEntry.format !== document.format;

    if (pathChanged) {
      changes.push({
        status: "Moved/Renamed",
        documentId: document.documentId,
        previousPath: manifestPath,
        nextPath,
        format: document.format,
        draftRevision: document.draftRevision,
        publishedVersion: document.publishedVersion,
        nextContent,
        nextHash,
      });
      continue;
    }

    if (localHash && localHash !== manifestEntry.hash) {
      changes.push({
        status: "Locally modified",
        documentId: document.documentId,
        nextPath,
        format: document.format,
        draftRevision: document.draftRevision,
        publishedVersion: document.publishedVersion,
        nextContent,
        nextHash,
      });
      continue;
    }

    const remoteChanged =
      nextHash !== manifestEntry.hash ||
      document.draftRevision !== manifestEntry.draftRevision ||
      document.publishedVersion !== manifestEntry.publishedVersion;

    if (remoteChanged || !localHash) {
      changes.push({
        status: "Modified",
        documentId: document.documentId,
        nextPath,
        format: document.format,
        draftRevision: document.draftRevision,
        publishedVersion: document.publishedVersion,
        nextContent,
        nextHash,
      });
      continue;
    }

    changes.push({
      status: "Unchanged",
      documentId: document.documentId,
      nextPath,
      format: document.format,
      draftRevision: document.draftRevision,
      publishedVersion: document.publishedVersion,
      nextContent,
      nextHash,
    });
  }

  for (const [documentId, manifestEntry] of Object.entries(input.manifest)) {
    if (seenDocumentIds.has(documentId)) {
      continue;
    }

    changes.push({
      status: "Deleted on server",
      documentId,
      previousPath: manifestEntry.path,
      format: manifestEntry.format,
      draftRevision: manifestEntry.draftRevision,
      publishedVersion: manifestEntry.publishedVersion,
    });
  }

  return changes;
}

export async function runPullCommand(
  context: CliCommandContext,
): Promise<number> {
  if (context.args.includes("--help") || context.args.includes("-h")) {
    context.stdout.write(renderPullHelp());
    return 0;
  }

  const options = parsePullOptions(context.args);
  const remoteDocuments = await fetchAllContent(context, {
    draft: !options.published,
  });
  const manifestPath = join(
    context.cwd,
    ".mdcms",
    "manifests",
    `${context.project}.${context.environment}.json`,
  );
  const manifest = await loadManifest(manifestPath);
  const changes = await computePullChanges({
    context,
    remoteDocuments,
    manifest,
  });

  printPlan(context, changes);

  if (options.dryRun) {
    context.stdout.write("\nDry run complete. No files changed.\n");
    return 0;
  }

  const hasLocallyModified = changes.some(
    (change) => change.status === "Locally modified",
  );

  if (hasLocallyModified && !options.force) {
    const confirmed = await context.confirm(
      "Locally modified files will be overwritten. Continue?",
    );

    if (!confirmed) {
      context.stderr.write("Pull cancelled by user.\n");
      return 1;
    }
  }

  await applyPullChanges({
    context,
    changes,
    manifestPath,
    manifest,
  });

  context.stdout.write("\nPull complete.\n");
  return 0;
}

export function createPullCommand(): CliCommand {
  return {
    name: "pull",
    description: "Pull content from MDCMS into local files.",
    run: runPullCommand,
  };
}
