import { createHash } from "node:crypto";

import type { ParsedMdcmsConfig } from "./config.js";
import {
  buildSchemaRegistrySyncPayloadBase,
  serializeSchemaRegistrySyncHashInput,
  type SchemaRegistrySyncPayload,
} from "./schema.js";

export function buildSchemaSyncPayload(
  config: ParsedMdcmsConfig,
  environment: string,
): SchemaRegistrySyncPayload {
  const payloadBase = buildSchemaRegistrySyncPayloadBase(config, environment);
  const schemaHash = createHash("sha256")
    .update(
      serializeSchemaRegistrySyncHashInput({
        environment,
        ...payloadBase,
      }),
    )
    .digest("hex");

  return {
    ...payloadBase,
    schemaHash,
  };
}
