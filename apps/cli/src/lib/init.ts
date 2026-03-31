import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";

import {
  buildSchemaSyncPayload,
  defineConfig,
  defineType,
  parseMdcmsConfig,
  type MdcmsFieldSchema,
} from "@mdcms/shared";

import type { CredentialStore } from "./credentials.js";
import type { CliCommand, CliCommandContext } from "./framework.js";
import { createLoopbackCallbackListener, openBrowserUrl } from "./login.js";
import {
  resolveScopedManifestPath,
  writeScopedManifestAtomic,
  type ScopedManifest,
  type ScopedManifestEntry,
} from "./manifest.js";
import { hashContent, parseMarkdownDocument } from "./push.js";
import { writeSchemaState } from "./schema-state.js";

import {
  detectLocaleConfig,
  normalizeLocale,
  type LocaleConfig,
} from "./init/detect-locale.js";
import {
  generateConfigSource,
  type GenerateConfigInput,
} from "./init/generate-config.js";
import {
  detectTrackedFiles,
  untrackFiles,
  updateGitignore,
} from "./init/git-cleanup.js";
import { inferSchema, type InferredType } from "./init/infer-schema.js";
import { createReadlinePrompter, type Prompter } from "./init/prompt.js";
import { scanContentFiles, type DiscoveredFile } from "./init/scan.js";

export type InitCommandOptions = {
  prompter?: Prompter;
  fetcher?: typeof fetch;
  skipAuth?: boolean;
  credentialStore?: CredentialStore;
};

function groupFilesByDirectory(
  files: DiscoveredFile[],
): Map<string, DiscoveredFile[]> {
  const groups = new Map<string, DiscoveredFile[]>();

  for (const file of files) {
    const segments = file.relativePath.split("/");
    // Use top-two directory levels: e.g. "content/posts"
    const dirKey =
      segments.length >= 3
        ? `${segments[0]}/${segments[1]}`
        : segments.length === 2
          ? segments[0]!
          : ".";

    if (!groups.has(dirKey)) {
      groups.set(dirKey, []);
    }
    groups.get(dirKey)!.push(file);
  }

  return groups;
}

function stripExtension(relativePath: string): string {
  const ext = extname(relativePath);
  if (ext === ".md" || ext === ".mdx") {
    return relativePath.slice(0, -ext.length);
  }
  return relativePath;
}

function findTypeForFile(
  file: DiscoveredFile,
  inferredTypes: InferredType[],
): InferredType | undefined {
  for (const type of inferredTypes) {
    if (file.relativePath.startsWith(type.directory + "/")) {
      return type;
    }
  }
  return undefined;
}

function buildRawConfig(input: {
  project: string;
  serverUrl: string;
  environment: string;
  contentDirectories: string[];
  types: InferredType[];
  localeConfig: LocaleConfig | null;
}): unknown {
  const zodFields = (
    fields: Record<string, { zodType: string; optional: boolean }>,
  ) => {
    const result: Record<string, MdcmsFieldSchema> = {};
    for (const [name, field] of Object.entries(fields)) {
      let schema: MdcmsFieldSchema;
      if (field.zodType.startsWith("reference(")) {
        // For parseMdcmsConfig, we need Standard Schema-compatible validators
        // Use z.string() as a stand-in for references
        schema = z.string();
      } else if (field.zodType === "z.string()") {
        schema = z.string();
      } else if (field.zodType === "z.number()") {
        schema = z.number();
      } else if (field.zodType === "z.boolean()") {
        schema = z.boolean();
      } else if (field.zodType === "z.array(z.string())") {
        schema = z.array(z.string());
      } else if (field.zodType === "z.array(z.number())") {
        schema = z.array(z.number());
      } else if (field.zodType === "z.array(z.boolean())") {
        schema = z.array(z.boolean());
      } else {
        schema = z.unknown();
      }
      if (field.optional) {
        schema = (schema as z.ZodType).optional();
      }
      result[name] = schema;
    }
    return result;
  };

  const types = input.types.map((t) =>
    defineType(t.name, {
      directory: t.directory,
      localized: t.localized,
      fields: zodFields(t.fields),
    }),
  );

  const config: Record<string, unknown> = {
    project: input.project,
    serverUrl: input.serverUrl,
    environment: input.environment,
    contentDirectories: input.contentDirectories,
    types,
    environments: {
      [input.environment]: {},
    },
  };

  if (input.localeConfig) {
    config.locales = {
      default: input.localeConfig.defaultLocale,
      supported: input.localeConfig.supported,
      ...(Object.keys(input.localeConfig.aliases).length > 0
        ? { aliases: input.localeConfig.aliases }
        : {}),
    };
  }

  return defineConfig(config as Parameters<typeof defineConfig>[0]);
}

export function createInitCommand(options?: InitCommandOptions): CliCommand {
  return {
    name: "init",
    description: "Initialize a new mdcms project with interactive wizard",
    requiresConfig: false,
    requiresTarget: false,
    run: async (context: CliCommandContext): Promise<number> => {
      const prompter = options?.prompter ?? createReadlinePrompter();
      const fetcher = options?.fetcher ?? context.fetcher;
      const { cwd, stdout, stderr } = context;

      // ── Step 1: Server URL ──────────────────────────────────────────
      const serverUrl = await prompter.text(
        "Server URL",
        "http://localhost:4000",
      );

      try {
        const pingResponse = await fetcher(`${serverUrl}/healthz`);
        if (!pingResponse.ok) {
          stderr.write(
            `Server at ${serverUrl} responded with ${pingResponse.status}.\n`,
          );
          return 1;
        }
      } catch {
        stderr.write(`Could not reach server at ${serverUrl}.\n`);
        return 1;
      }

      // ── Step 2: Project + Environment + Auth ────────────────────────
      const project = await prompter.text("Project name");
      const environment = await prompter.select("Environment", [
        { label: "production", value: "production" },
        { label: "staging", value: "staging" },
        { label: "development", value: "development" },
      ]);

      let apiKey: string;
      if (options?.skipAuth) {
        apiKey = "skip-auth-key";
      } else {
        // OAuth loopback flow
        const listener = await createLoopbackCallbackListener();
        const oauthState = `state_${randomBytes(18).toString("base64url")}_${Date.now()}`;
        try {
          const startResponse = await fetcher(
            `${serverUrl}/api/v1/auth/cli/login/start`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                project,
                environment,
                redirectUri: listener.redirectUri,
                state: oauthState,
                scopes: [
                  "schema:read",
                  "schema:write",
                  "content:read",
                  "content:write",
                ],
              }),
            },
          );

          if (!startResponse.ok) {
            stderr.write("Failed to start authentication flow.\n");
            return 1;
          }

          const startBody = (await startResponse.json()) as {
            data: { authorizeUrl: string; challengeId: string };
          };
          const opened = await openBrowserUrl(startBody.data.authorizeUrl);
          if (!opened) {
            stdout.write(
              `Open this URL in your browser:\n${startBody.data.authorizeUrl}\n`,
            );
          } else {
            stdout.write(
              "Browser login started. Complete authentication in your browser...\n",
            );
          }

          const callback = await listener.waitForCallback();

          const exchangeResponse = await fetcher(
            `${serverUrl}/api/v1/auth/cli/login/exchange`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                challengeId: startBody.data.challengeId,
                state: oauthState,
                code: callback.code,
              }),
            },
          );

          if (!exchangeResponse.ok) {
            stderr.write("Failed to exchange authentication code.\n");
            return 1;
          }

          const exchangeBody = (await exchangeResponse.json()) as {
            data: { id: string; key: string };
          };
          apiKey = exchangeBody.data.key;

          if (options?.credentialStore) {
            const nowIso = new Date().toISOString();
            await options.credentialStore.setProfile(
              { serverUrl, project, environment },
              {
                authMode: "api_key",
                apiKey: exchangeBody.data.key,
                apiKeyId: exchangeBody.data.id,
                createdAt: nowIso,
                updatedAt: nowIso,
              },
            );
          }

          stdout.write(
            `Logged in as ${project}/${environment}. Credentials stored.\n`,
          );
        } finally {
          await listener.close();
        }
      }

      // ── Step 3-4: Scan + Select Directories ─────────────────────────
      const allFiles = await scanContentFiles(cwd);
      const dirGroups = groupFilesByDirectory(allFiles);

      let selectedDirectories: string[] = [];

      // Drop root-level files — "." is not a valid content directory
      dirGroups.delete(".");

      if (dirGroups.size === 0) {
        stdout.write("No content files found.\n");
      } else {
        const choices = [...dirGroups.entries()].map(([dir, files]) => ({
          label: `${dir} (${files.length} file${files.length !== 1 ? "s" : ""})`,
          value: dir,
        }));

        selectedDirectories = await prompter.multiSelect(
          "Select content directories to manage",
          choices,
        );
      }

      // ── Step 5-6: Infer Schema + Detect Locales ─────────────────────
      const inferredTypes = inferSchema(allFiles, selectedDirectories);
      const localeConfig = detectLocaleConfig(allFiles, inferredTypes);

      if (inferredTypes.length > 0) {
        stdout.write("Inferred content types:\n");
        for (const type of inferredTypes) {
          const fieldNames = Object.keys(type.fields);
          stdout.write(
            `  ${type.name} (${type.fileCount} file${type.fileCount !== 1 ? "s" : ""}, fields: ${fieldNames.join(", ") || "none"})\n`,
          );
        }
      }

      await prompter.confirm("Confirm inferred types?");

      // ── Step 7: Generate Config + Sync Schema ───────────────────────
      const configInput: GenerateConfigInput = {
        project,
        serverUrl,
        environment,
        contentDirectories: selectedDirectories,
        types: inferredTypes,
        localeConfig,
      };

      const configSource = generateConfigSource(configInput);
      const configPath = join(cwd, "mdcms.config.ts");
      await writeFile(configPath, configSource, "utf-8");
      stdout.write(`Config written to mdcms.config.ts\n`);

      // Build a config object programmatically (NOT import from file)
      const rawConfig = buildRawConfig({
        project,
        serverUrl,
        environment,
        contentDirectories: selectedDirectories,
        types: inferredTypes,
        localeConfig,
      });

      const parsedConfig = parseMdcmsConfig(rawConfig);
      const schemaSyncPayload = buildSchemaSyncPayload(
        parsedConfig,
        environment,
      );

      const schemaHeaders: Record<string, string> = {
        "content-type": "application/json",
        "x-mdcms-project": project,
        "x-mdcms-environment": environment,
        authorization: `Bearer ${apiKey}`,
      };

      const schemaResponse = await fetcher(`${serverUrl}/api/v1/schema`, {
        method: "PUT",
        headers: schemaHeaders,
        body: JSON.stringify(schemaSyncPayload),
      });

      if (!schemaResponse.ok) {
        const errorBody = (await schemaResponse
          .json()
          .catch(() => undefined)) as
          | { code?: string; message?: string }
          | undefined;
        stderr.write(
          `${errorBody?.code ?? "SCHEMA_SYNC_FAILED"}: ${errorBody?.message ?? `Server responded with ${schemaResponse.status}`}\n`,
        );
        return 1;
      }

      const schemaResult = (await schemaResponse.json()) as {
        data: {
          schemaHash: string;
          syncedAt: string;
          affectedTypes: string[];
        };
      };

      await writeSchemaState(
        { cwd, project, environment },
        {
          schemaHash: schemaResult.data.schemaHash,
          syncedAt: schemaResult.data.syncedAt,
          serverUrl,
        },
      );

      stdout.write(
        `Schema synced (hash: ${schemaResult.data.schemaHash.slice(0, 12)})\n`,
      );

      // ── Step 8: Initial Import ──────────────────────────────────────
      const filesToImport = allFiles.filter((file) =>
        selectedDirectories.some((dir) =>
          file.relativePath.startsWith(dir + "/"),
        ),
      );

      if (filesToImport.length > 0) {
        const shouldImport = await prompter.confirm(
          `Import ${filesToImport.length} file${filesToImport.length !== 1 ? "s" : ""} to server?`,
        );

        if (shouldImport) {
          const manifest: ScopedManifest = {};
          let successCount = 0;
          let failCount = 0;

          for (const file of filesToImport) {
            const fullPath = join(cwd, file.relativePath);
            let rawContent: string;
            try {
              rawContent = await readFile(fullPath, "utf-8");
            } catch {
              stderr.write(`Failed to read ${file.relativePath}\n`);
              failCount++;
              continue;
            }

            const { frontmatter, body } = parseMarkdownDocument(rawContent);
            const type = findTypeForFile(file, inferredTypes);
            const typeName = type?.name ?? "unknown";
            let path = stripExtension(file.relativePath);

            // For localized types with suffix locale, strip the locale from the path
            if (type?.localized && file.localeHint?.source === "suffix") {
              const lastDot = path.lastIndexOf(".");
              if (lastDot > 0) {
                path = path.slice(0, lastDot);
              }
            }

            // Determine locale: normalize raw hint, or use default for localized types
            let locale: string;
            if (file.localeHint) {
              locale =
                normalizeLocale(file.localeHint.rawValue) ??
                file.localeHint.rawValue;
            } else if (type?.localized && localeConfig) {
              locale = localeConfig.defaultLocale;
              stderr.write(
                `Warning: ${file.relativePath} has no locale marker — importing as "${locale}" (default locale).\n`,
              );
            } else {
              locale = localeConfig?.defaultLocale ?? "en";
            }
            const hash = hashContent(rawContent);

            const contentHeaders: Record<string, string> = {
              "content-type": "application/json",
              "x-mdcms-project": project,
              "x-mdcms-environment": environment,
              "x-mdcms-schema-hash": schemaResult.data.schemaHash,
              authorization: `Bearer ${apiKey}`,
            };

            try {
              const contentResponse = await fetcher(
                `${serverUrl}/api/v1/content`,
                {
                  method: "POST",
                  headers: contentHeaders,
                  body: JSON.stringify({
                    path,
                    type: typeName,
                    locale,
                    format: file.format,
                    frontmatter,
                    body,
                  }),
                },
              );

              let contentResult: {
                data: {
                  documentId: string;
                  draftRevision: number;
                  publishedVersion: number | null;
                };
              };

              if (!contentResponse.ok) {
                const errBody = (await contentResponse
                  .json()
                  .catch(() => undefined)) as
                  | {
                      message?: string;
                      code?: string;
                      details?: { conflictDocumentId?: string };
                    }
                  | undefined;

                if (
                  contentResponse.status === 409 &&
                  errBody?.details?.conflictDocumentId
                ) {
                  const updateResponse = await fetcher(
                    `${serverUrl}/api/v1/content/${errBody.details.conflictDocumentId}`,
                    {
                      method: "PUT",
                      headers: contentHeaders,
                      body: JSON.stringify({
                        format: file.format,
                        frontmatter,
                        body,
                      }),
                    },
                  );

                  if (!updateResponse.ok) {
                    const updateErr = (await updateResponse
                      .json()
                      .catch(() => undefined)) as
                      | {
                          message?: string;
                        }
                      | undefined;
                    stderr.write(
                      `Failed to import ${file.relativePath}: ${updateErr?.message ?? updateResponse.status}\n`,
                    );
                    failCount++;
                    continue;
                  }

                  contentResult =
                    (await updateResponse.json()) as typeof contentResult;
                } else {
                  stderr.write(
                    `Failed to import ${file.relativePath}: ${errBody?.message ?? contentResponse.status}\n`,
                  );
                  failCount++;
                  continue;
                }
              } else {
                contentResult =
                  (await contentResponse.json()) as typeof contentResult;
              }

              const entry: ScopedManifestEntry = {
                path: file.relativePath,
                format: file.format,
                draftRevision: contentResult.data.draftRevision,
                publishedVersion: contentResult.data.publishedVersion,
                hash,
              };

              manifest[contentResult.data.documentId] = entry;
              successCount++;
              stdout.write(
                `Imported ${file.relativePath} -> ${contentResult.data.documentId}\n`,
              );
            } catch (error) {
              stderr.write(
                `Failed to import ${file.relativePath}: ${error instanceof Error ? error.message : "unknown error"}\n`,
              );
              failCount++;
            }
          }

          if (Object.keys(manifest).length > 0) {
            const manifestPath = resolveScopedManifestPath({
              cwd,
              project,
              environment,
            });
            await writeScopedManifestAtomic(manifestPath, manifest);
          }

          stdout.write(
            `Import complete: ${successCount} succeeded, ${failCount} failed.\n`,
          );
        }
      }

      // ── Step 9: Git Cleanup ─────────────────────────────────────────
      if (selectedDirectories.length > 0) {
        await updateGitignore(cwd, selectedDirectories);

        const tracked = await detectTrackedFiles(cwd, selectedDirectories);

        if (tracked.length > 0) {
          const shouldUntrack = await prompter.confirm(
            `Found ${tracked.length} tracked file${tracked.length !== 1 ? "s" : ""} in managed directories. Untrack them?`,
          );

          if (shouldUntrack) {
            const removed = await untrackFiles(cwd, selectedDirectories);
            stdout.write(`Untracked ${removed.length} file(s).\n`);
          }
        }
      }

      stdout.write("Initialization complete.\n");
      return 0;
    },
  };
}
