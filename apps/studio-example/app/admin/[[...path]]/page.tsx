import { resolve } from "node:path";

import { prepareStudioConfig } from "@mdcms/studio/runtime";
import { headers } from "next/headers";

import config from "../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioExampleAppRoot } from "../resolve-studio-example-app-root";
import { extractPreparedStudioComponentMetadata } from "../studio-config";

async function readRequestHost(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    return (
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      undefined
    );
  } catch {
    // Unit tests can invoke this component without a Next request context.
    return undefined;
  }
}

export default async function AdminCatchAllPage() {
  const requestHost = await readRequestHost();
  const appRoot = resolveStudioExampleAppRoot();
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: appRoot,
    tsconfigPath: resolve(appRoot, "tsconfig.json"),
  });

  return (
    <AdminStudioClient
      preparedComponents={extractPreparedStudioComponentMetadata(
        preparedConfig,
      )}
      documentRouteMetadata={
        "_documentRouteMetadata" in preparedConfig
          ? preparedConfig._documentRouteMetadata
          : undefined
      }
      schemaHash={
        "_schemaHash" in preparedConfig
          ? (preparedConfig._schemaHash as string)
          : undefined
      }
      requestHost={requestHost}
    />
  );
}
