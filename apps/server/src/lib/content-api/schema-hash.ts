import { RuntimeError } from "@mdcms/shared";

import type { ContentScope, ContentWriteSchemaSyncLookup } from "./types.js";

export const CONTENT_SCHEMA_HASH_HEADER = "x-mdcms-schema-hash";

function parseSchemaHashHeader(request: Request): string {
  const schemaHash = request.headers.get(CONTENT_SCHEMA_HASH_HEADER)?.trim();

  if (schemaHash && schemaHash.length > 0) {
    return schemaHash;
  }

  throw new RuntimeError({
    code: "SCHEMA_HASH_REQUIRED",
    message: `Header "${CONTENT_SCHEMA_HASH_HEADER}" is required for content write requests.`,
    statusCode: 400,
    details: {
      field: CONTENT_SCHEMA_HASH_HEADER,
    },
  });
}

export async function requireMatchingWriteSchemaHash(
  request: Request,
  scope: ContentScope,
  lookup: ContentWriteSchemaSyncLookup,
): Promise<string> {
  const clientSchemaHash = parseSchemaHashHeader(request);
  const serverSchemaState = await lookup(scope);

  if (!serverSchemaState) {
    throw new RuntimeError({
      code: "SCHEMA_NOT_SYNCED",
      message:
        'Target project/environment has no synced schema. Run "cms schema sync" before writing content.',
      statusCode: 409,
      details: {
        project: scope.project,
        environment: scope.environment,
      },
    });
  }

  if (serverSchemaState.schemaHash === clientSchemaHash) {
    return clientSchemaHash;
  }

  throw new RuntimeError({
    code: "SCHEMA_HASH_MISMATCH",
    message:
      "Client schema hash does not match the server schema hash for the target project/environment.",
    statusCode: 409,
    details: {
      project: scope.project,
      environment: scope.environment,
      clientSchemaHash,
      serverSchemaHash: serverSchemaState.schemaHash,
    },
  });
}
