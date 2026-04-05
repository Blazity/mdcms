import { resolve } from "node:path";

import { prepareStudioConfig } from "@mdcms/studio/runtime";
import { headers } from "next/headers";

import config from "../../../../../mdcms.config";
import { studioReviewServerUrl } from "../../../../../lib/review-studio-config";
import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioReviewAppRoot } from "../resolve-studio-review-app-root";
import {
  createReviewScenarioServerUrl,
  extractPreparedStudioComponentMetadata,
  resolveReviewRequestOrigin,
} from "../studio-config";

async function resolveCurrentRequestOrigin(): Promise<string> {
  try {
    return resolveReviewRequestOrigin(await headers());
  } catch {
    return studioReviewServerUrl;
  }
}

export default async function AdminReviewPage(props: {
  params: Promise<{ scenario: string; path?: string[] }>;
}) {
  const { scenario } = await props.params;
  const appRoot = resolveStudioReviewAppRoot();
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: appRoot,
    tsconfigPath: resolve(appRoot, "tsconfig.json"),
  });
  const origin = await resolveCurrentRequestOrigin();

  return (
    <AdminStudioClient
      scenario={scenario}
      basePath={`/review/${scenario}/admin`}
      serverUrl={createReviewScenarioServerUrl({ scenario, origin })}
      preparedComponents={extractPreparedStudioComponentMetadata(
        preparedConfig,
      )}
    />
  );
}
