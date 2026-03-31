import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { ContentDocumentResponse } from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";
import { parse as parseYaml } from "yaml";

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
  dryRun: boolean;
  force: boolean;
  published: boolean;
};

type PushCandidate = {
  documentId: string;
  manifestEntry: ScopedManifestEntry;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
};

type PushPlan = {
  changedCandidates: PushCandidate[];
  trackedCount: number;
  unchangedCount: number;
};

type PushResult = {
  status: "updated" | "created" | "failed";
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

function parsePushOptions(args: string[]): PushOptions {
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
      message: `Unknown push flag "${token}".`,
      statusCode: 400,
    });
  }

  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    published: args.includes("--published"),
  };
}

function renderPushHelp(): string {
  return [
    "Usage: mdcms push [--force] [--dry-run] [--published]",
    "",
    "Upload changed local markdown files to CMS as draft content.",
    "Each document is sent with its base draftRevision from the local manifest.",
    "If the server draft has been modified since your last pull, that document",
    "is rejected (stale) while the remaining documents continue normally.",
    "",
    "Options:",
    "  --force       Skip confirmation prompt before applying push",
    "  --dry-run     Show push plan only (no API writes)",
    "  --published   Reserved for future behavior (unsupported in demo mode)",
    "",
  ].join("\n");
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

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseFileFormat(path: string): "md" | "mdx" {
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

function parseMarkdownDocument(content: string): {
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

function normalizeDirectory(directory: string | undefined): string {
  if (!directory) {
    return "";
  }

  return directory.replace(/^\/+/, "").replace(/\/+$/, "");
}

function pickTypeConfigForPath(
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

function resolveCreatePayload(input: {
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

async function updateExistingDocument(
  context: CliCommandContext,
  candidate: PushCandidate,
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
> {
  const response = await context.fetcher(
    `${context.serverUrl}/api/v1/content/${candidate.documentId}`,
    {
      method: "PUT",
      headers: toRequestHeaders(context),
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

  if (
    response.status === 409 &&
    remoteError.code === "STALE_DRAFT_REVISION"
  ) {
    return {
      kind: "stale",
      code: remoteError.code,
      message: remoteError.message,
    };
  }

  throw new RuntimeError({
    code: remoteError.code,
    message: remoteError.message,
    statusCode: remoteError.statusCode,
  });
}

async function createDocumentFromLocalFile(
  context: CliCommandContext,
  candidate: PushCandidate,
): Promise<ContentDocumentPayload> {
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
      headers: toRequestHeaders(context),
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
    throw new RuntimeError({
      code: remoteError.code,
      message: remoteError.message,
      statusCode: remoteError.statusCode,
    });
  }

  return parseRemoteDocument(body);
}

function printPushPlan(
  context: CliCommandContext,
  candidates: PushCandidate[],
  summary: {
    trackedCount: number;
    unchangedCount: number;
  },
): void {
  context.stdout.write(
    `Push plan for ${context.project}/${context.environment} (${candidates.length} changed / ${summary.trackedCount} tracked document(s)):\n`,
  );

  for (const candidate of candidates) {
    context.stdout.write(
      `  - ${candidate.documentId} -> ${candidate.manifestEntry.path} (${candidate.format})\n`,
    );
  }

  context.stdout.write(`Unchanged (skipped): ${summary.unchangedCount}\n`);
}

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
}

async function buildPushPlan(
  context: CliCommandContext,
  manifest: ScopedManifest,
): Promise<PushPlan> {
  const changedCandidates: PushCandidate[] = [];
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
        throw new RuntimeError({
          code: "LOCAL_FILE_MISSING",
          message: `Manifest-tracked file is missing: "${manifestEntry.path}".`,
          statusCode: 400,
          details: {
            documentId,
            path: manifestEntry.path,
          },
        });
      }

      throw error;
    });

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

  return {
    changedCandidates,
    trackedCount,
    unchangedCount,
  };
}

async function applyPush(
  context: CliCommandContext,
  manifestPath: string,
  manifest: ScopedManifest,
  candidates: PushCandidate[],
): Promise<{ results: PushResult[]; failures: number }> {
  const nextManifest: ScopedManifest = { ...manifest };
  const results: PushResult[] = [];
  let failures = 0;

  for (const candidate of candidates) {
    try {
      const updateResult = await updateExistingDocument(context, candidate);

      if (updateResult.kind === "updated") {
        nextManifest[candidate.documentId] = {
          path: candidate.manifestEntry.path,
          format: candidate.format,
          draftRevision: updateResult.remote.draftRevision,
          publishedVersion: updateResult.remote.publishedVersion,
          hash: candidate.hash,
        };

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

      const created = await createDocumentFromLocalFile(context, candidate);
      delete nextManifest[candidate.documentId];
      nextManifest[created.documentId] = {
        path: candidate.manifestEntry.path,
        format: candidate.format,
        draftRevision: created.draftRevision,
        publishedVersion: created.publishedVersion,
        hash: candidate.hash,
      };

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

  await writeScopedManifestAtomic(manifestPath, nextManifest);

  return {
    results,
    failures,
  };
}

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

  const manifestPath = resolveScopedManifestPath({
    cwd: context.cwd,
    project: context.project,
    environment: context.environment,
  });
  const manifest = await loadScopedManifest(manifestPath);
  const pushPlan = await buildPushPlan(context, manifest);

  if (pushPlan.trackedCount === 0) {
    context.stdout.write(
      `No manifest-tracked documents found for ${context.project}/${context.environment}.\n`,
    );
    return 0;
  }

  printPushPlan(context, pushPlan.changedCandidates, {
    trackedCount: pushPlan.trackedCount,
    unchangedCount: pushPlan.unchangedCount,
  });

  if (options.dryRun) {
    return 0;
  }

  if (pushPlan.changedCandidates.length === 0) {
    context.stdout.write(
      `No changed manifest-tracked documents to push for ${context.project}/${context.environment}.\n`,
    );
    return 0;
  }

  if (!options.force) {
    const confirmed = await context.confirm(
      `Push ${pushPlan.changedCandidates.length} changed document(s) to ${context.project}/${context.environment}?`,
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
