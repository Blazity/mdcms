import { createHash } from "node:crypto";

import type { SchemaRegistryEntry } from "@mdcms/shared";
import { stableStringifyJson } from "@mdcms/shared";

export type SchemaDiff = {
  added: string[];
  removed: string[];
  modified: string[];
};

export function hashSchemaTypeSnapshot(snapshot: unknown): string {
  return createHash("sha256")
    .update(
      stableStringifyJson(
        snapshot as Parameters<typeof stableStringifyJson>[0],
      ),
    )
    .digest("hex");
}

export function computeSchemaDiff(
  localTypes: Record<string, { schemaHash: string }>,
  serverTypes: ReadonlyArray<Pick<SchemaRegistryEntry, "type" | "schemaHash">>,
): SchemaDiff {
  const serverByName = new Map(serverTypes.map((t) => [t.type, t]));
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [name, local] of Object.entries(localTypes)) {
    const server = serverByName.get(name);
    if (!server) {
      added.push(name);
    } else if (server.schemaHash !== local.schemaHash) {
      modified.push(name);
    }
  }

  for (const server of serverTypes) {
    if (!(server.type in localTypes)) {
      removed.push(server.type);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort(),
  };
}
