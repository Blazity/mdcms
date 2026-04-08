import type { ParsedMdcmsConfig } from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";
import { buildSchemaSyncPayload } from "@mdcms/shared/server";

import type { CliCommand, CliCommandContext } from "./framework.js";
import { writeSchemaState } from "./schema-state.js";

async function runSchemaSync(context: CliCommandContext): Promise<number> {
  const {
    config,
    serverUrl: rawServerUrl,
    project,
    environment,
    apiKey,
    fetcher,
    stdout,
    stderr,
    cwd,
  } = context;
  const serverUrl = rawServerUrl!;

  const types = config.types ?? [];
  if (types.length === 0) {
    throw new RuntimeError({
      code: "NO_TYPES_DEFINED",
      message:
        `No content types defined in mdcms.config.ts.\n` +
        `Define at least one type before syncing schema, e.g.:\n\n` +
        `  const post = defineType("post", {\n` +
        `    directory: "content/posts",\n` +
        `    fields: { title: z.string() },\n` +
        `  });\n\n` +
        `Then pass it to defineConfig: types: [post]`,
      statusCode: 400,
    });
  }

  const payload = buildSchemaSyncPayload(
    config as ParsedMdcmsConfig,
    environment,
  );

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-mdcms-project": project,
    "x-mdcms-environment": environment,
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetcher(`${serverUrl}/api/v1/schema`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; message?: string; details?: Record<string, unknown> }
      | undefined;

    stderr.write(
      `${body?.code ?? "SCHEMA_SYNC_FAILED"}: ${body?.message ?? `Server responded with ${response.status}`}\n`,
    );

    if (body?.details) {
      stderr.write(`Details: ${JSON.stringify(body.details)}\n`);
    }

    return 1;
  }

  const result = (await response.json().catch(() => undefined)) as
    | {
        data: { schemaHash: string; syncedAt: string; affectedTypes: string[] };
      }
    | undefined;

  if (!result?.data) {
    stderr.write("SCHEMA_SYNC_FAILED: Unexpected response from server.\n");
    return 1;
  }

  await writeSchemaState(
    { cwd, project, environment },
    {
      schemaHash: result.data.schemaHash,
      syncedAt: result.data.syncedAt,
      serverUrl,
    },
  );

  stdout.write(
    `Schema synced (hash: ${result.data.schemaHash.slice(0, 12)})\n`,
  );

  if (result.data.affectedTypes.length > 0) {
    stdout.write(`Affected types: ${result.data.affectedTypes.join(", ")}\n`);
  }

  return 0;
}

export function createSchemaSyncCommand(): CliCommand {
  return {
    name: "schema sync",
    description: "Upload local schema to the server",
    run: runSchemaSync,
  };
}
