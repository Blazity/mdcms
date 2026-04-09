import { createHash } from "node:crypto";

import type { ParsedMdcmsConfig } from "./config.js";
import {
  type SchemaRegistrySyncPayload,
  serializeResolvedEnvironmentSchema,
  toRawConfigSnapshot,
} from "./schema.js";

export function buildSchemaSyncPayload(
  config: ParsedMdcmsConfig,
  environment: string,
): SchemaRegistrySyncPayload {
  const rawConfigSnapshot = toRawConfigSnapshot(config);
  const resolvedSchema = serializeResolvedEnvironmentSchema(
    config,
    environment,
  );
  const schemaHash = createHash("sha256")
    .update(JSON.stringify({ environment, rawConfigSnapshot, resolvedSchema }))
    .digest("hex");
  return { rawConfigSnapshot, resolvedSchema, schemaHash };
}
