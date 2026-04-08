import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";

import {
  defineConfig,
  defineType,
  parseMdcmsConfig,
  type MdcmsFieldSchema,
} from "@mdcms/shared";
import { buildSchemaSyncPayload } from "@mdcms/shared/server";

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
import { createInquirerPrompter, type Prompter } from "./init/prompt.js";
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
      if (context.args.includes("--help") || context.args.includes("-h")) {
        context.stdout.write(
          [
            "Usage: mdcms init",
            "",
            "Interactive wizard to set up MDCMS in an existing project.",
            "",
            "Steps: server URL, login, project creation,",
            "directory scan, schema inference, config generation,",
            "schema sync, content import, and git cleanup.",
            "",
            "Options:",
            "  -h, --help   Show this help text",
            "",
          ].join("\n"),
        );
        return 0;
      }

      const prompter = options?.prompter ?? createInquirerPrompter();
      const fetcher = options?.fetcher ?? context.fetcher;
      const { cwd, stdout, stderr } = context;

      const existingConfigPath = join(cwd, "mdcms.config.ts");
      if (existsSync(existingConfigPath)) {
        const overwrite = await prompter.confirm(
          "mdcms.config.ts already exists. Re-running init will overwrite it. Continue?",
        );
        if (!overwrite) {
          stdout.write("Init cancelled. Existing config preserved.\n");
          return 0;
        }
      }

      prompter.intro("mdcms init");

      // ── Step 1: Server URL ──────────────────────────────────────────
      const serverUrl = await prompter.text(
        "Server URL",
        "http://localhost:4000",
      );

      {
        const s = prompter.spinner();
        s.start("Checking server...");
        try {
          const pingResponse = await fetcher(`${serverUrl}/healthz`);
          if (!pingResponse.ok) {
            s.stop(`Server responded with ${pingResponse.status}`);
            return 1;
          }
          s.stop("Server reachable");
        } catch {
          s.stop("Could not reach server");
          return 1;
        }
      }

      // ── Step 2: Login ──────────────────────────────────────────────
      let apiKey: string;
      if (options?.skipAuth) {
        apiKey = "skip-auth-key";
      } else {
        const listener = await createLoopbackCallbackListener();
        const oauthState = `state_${randomBytes(18).toString("base64url")}_${Date.now()}`;
        try {
          const s = prompter.spinner();
          s.start("Opening browser for login...");
          const startResponse = await fetcher(
            `${serverUrl}/api/v1/auth/cli/login/start`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                redirectUri: listener.redirectUri,
                state: oauthState,
                scopes: [
                  "projects:write",
                  "schema:write",
                  "content:read",
                  "content:read:draft",
                  "content:write",
                ],
              }),
            },
          );

          if (!startResponse.ok) {
            const errBody = await startResponse.text().catch(() => "");
            s.stop(
              `Failed to start authentication flow: ${startResponse.status} ${errBody}`,
            );
            return 1;
          }

          const startBody = (await startResponse.json()) as {
            data: { authorizeUrl: string; challengeId: string };
          };
          const opened = await openBrowserUrl(startBody.data.authorizeUrl);
          if (!opened) {
            s.stop("Could not open browser");
            stdout.write(
              `Open this URL in your browser:\n${startBody.data.authorizeUrl}\n`,
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
            s.stop("Failed to exchange authentication code");
            return 1;
          }

          const exchangeBody = (await exchangeResponse.json()) as {
            data: { id: string; key: string };
          };
          apiKey = exchangeBody.data.key;
          s.stop("Logged in");
        } finally {
          await listener.close();
        }
      }

      // ── Step 3: Create Project ────────────────────────────────────────
      const authHeaders: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      };

      const projectName = await prompter.text("Project name");
      const s3 = prompter.spinner();
      s3.start("Creating project...");
      const createResponse = await fetcher(`${serverUrl}/api/v1/projects`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: projectName }),
      });
      if (!createResponse.ok) {
        const errBody = (await createResponse.json().catch(() => undefined)) as
          | { code?: string; message?: string }
          | undefined;
        if (createResponse.status === 409) {
          s3.stop(`Project "${projectName}" already exists`);
        } else {
          s3.stop(
            errBody?.message ?? `Failed to create project (${createResponse.status})`,
          );
        }
        return 1;
      }
      const created = (await createResponse.json()) as {
        data: {
          slug: string;
          environments: { id: string; name: string }[];
        };
      };
      const project = created.data.slug;
      const existingEnvs = created.data.environments ?? [];
      s3.stop(`Project "${project}" created`);

      // ── Step 4: Create Environment ─────────────────────────────────
      const envName = await prompter.text("Environment name", "production");
      const alreadyExists = existingEnvs.some((e) => e.name === envName);

      if (alreadyExists) {
        stdout.write(`Environment "${envName}" already exists\n`);
      } else {
        const s4 = prompter.spinner();
        s4.start("Creating environment...");
        const createEnvResponse = await fetcher(
          `${serverUrl}/api/v1/projects/${project}/environments`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ name: envName }),
          },
        );
        if (!createEnvResponse.ok) {
          s4.stop("Failed to create environment");
          return 1;
        }
        s4.stop(`Environment "${envName}" created`);
      }
      const environment = envName;

      // Store credentials after project/env selection
      if (options?.credentialStore && apiKey !== "skip-auth-key") {
        const nowIso = new Date().toISOString();
        await options.credentialStore.setProfile(
          { serverUrl, project, environment },
          {
            authMode: "api_key",
            apiKey,
            apiKeyId: "cli-init",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        );
      }

      // ── Step 5-6: Scan + Select Directories ─────────────────────────
      const allFiles = await scanContentFiles(cwd);
      const dirGroups = groupFilesByDirectory(allFiles);

      let selectedDirectories: string[] = [];

      // Drop root-level files — "." is not a valid content directory
      dirGroups.delete(".");

      let scaffoldedType: InferredType | null = null;

      if (dirGroups.size === 0) {
        stdout.write("No content files found.\n");

        const dirName = await prompter.text(
          "Content directory (e.g. content/posts)",
          "content/posts",
        );
        selectedDirectories = [dirName];

        const lastSegment = dirName.split("/").pop() ?? dirName;
        const typeName = lastSegment.endsWith("s")
          ? lastSegment.slice(0, -1)
          : lastSegment;

        scaffoldedType = {
          name: typeName,
          directory: dirName,
          localized: false,
          fields: {
            title: { zodType: "z.string()", optional: false, samples: 0 },
            slug: { zodType: "z.string()", optional: true, samples: 0 },
          },
          fileCount: 0,
        };

        stdout.write(
          `Will create type "${typeName}" for directory "${dirName}" with fields: title, slug\n`,
        );

        // Create example post
        const examplePath = join(cwd, dirName, "example.md");
        await mkdir(join(cwd, dirName), { recursive: true });
        await writeFile(
          examplePath,
          [
            "---",
            "title: Example Post",
            "slug: example",
            "---",
            "",
            "This is an example post created by `mdcms init`.",
            "",
          ].join("\n"),
          "utf-8",
        );
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

      if (scaffoldedType && inferredTypes.length === 0) {
        inferredTypes.push(scaffoldedType);
      }
      const localeConfig = await detectLocaleConfig(
        allFiles,
        inferredTypes,
        prompter,
      );

      if (localeConfig) {
        const confirmDefault = await prompter.confirm(
          `Use "${localeConfig.defaultLocale}" as the default locale?`,
        );
        if (!confirmDefault) {
          const choices = localeConfig.supported.map((l) => ({
            label: l,
            value: l,
          }));
          localeConfig.defaultLocale = await prompter.select(
            "Select default locale",
            choices,
          );
        }
      }

      if (inferredTypes.length > 0 && !scaffoldedType) {
        stdout.write("Inferred content types:\n");
        for (const type of inferredTypes) {
          const fieldNames = Object.keys(type.fields);
          stdout.write(
            `  ${type.name} (${type.fileCount} file${type.fileCount !== 1 ? "s" : ""}, fields: ${fieldNames.join(", ") || "none"})\n`,
          );
        }

        await prompter.confirm("Confirm inferred types?");
      }

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

      let schemaHash: string | undefined;

      if (inferredTypes.length === 0) {
        stdout.write(
          `Skipping schema sync — no content types to sync.\n` +
            `Add types to mdcms.config.ts and run: mdcms schema sync\n`,
        );
      } else {
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

        schemaHash = schemaResult.data.schemaHash;

        await writeSchemaState(
          { cwd, project, environment },
          {
            schemaHash,
            syncedAt: schemaResult.data.syncedAt,
            serverUrl,
          },
        );

        stdout.write(`Schema synced (hash: ${schemaHash.slice(0, 12)})\n`);
      }

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

            // For localized types with folder locale, strip the locale folder segment
            if (type?.localized && file.localeHint?.source === "folder") {
              const rawLocale = file.localeHint.rawValue;
              const normalized = normalizeLocale(rawLocale);
              const segments = path.split("/");
              const filtered = segments.filter(
                (s) => s !== rawLocale && s !== normalized,
              );
              path = filtered.join("/");
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
              "x-mdcms-schema-hash": schemaHash!,
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
            stdout.write(`Untracked ${removed.length} file(s):\n`);
            for (const file of removed) {
              stdout.write(`  rm '${file}'\n`);
            }
            stdout.write(
              `\nRun \`git commit -m "chore: untrack mdcms managed content"\` to save these changes.\n`,
            );
          }
        }
      }

      if (scaffoldedType) {
        stdout.write(
          `\nExample post created at ${selectedDirectories[0]}/example.md\n` +
            `Run 'mdcms push' to upload it to the server.\n`,
        );
      }

      prompter.outro("Initialization complete!");
      return 0;
    },
  };
}
