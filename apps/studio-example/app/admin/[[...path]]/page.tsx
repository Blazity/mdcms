import { resolve } from "node:path";

import { prepareStudioConfig } from "@mdcms/studio/runtime";

import config from "../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";

export default async function AdminCatchAllPage() {
  const appRoot = resolve(process.cwd(), "apps/studio-example");
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: appRoot,
    tsconfigPath: resolve(appRoot, "tsconfig.json"),
  });

  return <AdminStudioClient config={preparedConfig} />;
}
