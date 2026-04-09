import { resolve } from "node:path";

import { prepareStudioConfig } from "@mdcms/studio/runtime";
import { resolveStudioDocumentRouteSchemaCapability } from "@mdcms/studio";

import config from "../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioExampleAppRoot } from "../resolve-studio-example-app-root";
import { extractPreparedStudioComponentMetadata } from "../studio-config";

export default async function AdminCatchAllPage() {
  const appRoot = resolveStudioExampleAppRoot();
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: appRoot,
    tsconfigPath: resolve(appRoot, "tsconfig.json"),
  });

  // Pre-compute the schema capability on the server where the full config
  // (with types, environments, Zod fields) is available. The client config
  // cannot derive it because Zod validators aren't serializable to RSC.
  const schemaCapability =
    await resolveStudioDocumentRouteSchemaCapability(config);

  return (
    <AdminStudioClient
      preparedComponents={extractPreparedStudioComponentMetadata(
        preparedConfig,
      )}
      schemaHash={
        schemaCapability.canWrite ? schemaCapability.schemaHash : undefined
      }
    />
  );
}
