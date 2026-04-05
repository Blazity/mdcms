import { resolve } from "node:path";

import { prepareStudioConfig } from "@mdcms/studio/runtime";

import config from "../../../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioReviewAppRoot } from "../resolve-studio-review-app-root";
import { extractPreparedStudioComponentMetadata } from "../studio-config";

export default async function AdminReviewPage(props: {
  params: Promise<{ scenario: string; path?: string[] }>;
}) {
  const { scenario } = await props.params;
  const appRoot = resolveStudioReviewAppRoot();
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: appRoot,
    tsconfigPath: resolve(appRoot, "tsconfig.json"),
  });

  return (
    <AdminStudioClient
      scenario={scenario}
      basePath={`/review/${scenario}/admin`}
      preparedComponents={extractPreparedStudioComponentMetadata(
        preparedConfig,
      )}
    />
  );
}
