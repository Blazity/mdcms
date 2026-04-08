import { createHash } from "node:crypto";

import type { ParsedMdcmsConfig } from "./config.js";
import {
  type SchemaRegistrySyncPayload,
  serializeResolvedEnvironmentSchema,
  toRawConfigSnapshot,
} from "./schema.js";

/**
 * Builds a SchemaRegistrySyncPayload containing a raw config snapshot, the resolved schema for a specific environment, and a SHA-256 hash of those values.
 *
 * @param config - Parsed mdcms configuration used to produce the raw config snapshot and resolved schema
 * @param environment - Target environment name used when resolving the schema
 * @returns The payload with `rawConfigSnapshot`, `resolvedSchema`, and `schemaHash` (hex-encoded SHA-256 of `{ environment, rawConfigSnapshot, resolvedSchema }`)
 */
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
