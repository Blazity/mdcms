import { prepareStudioConfig } from "@mdcms/studio/runtime";

import config from "../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";

export default async function AdminCatchAllPage() {
  const preparedConfig = await prepareStudioConfig(config, {
    cwd: process.cwd(),
  });

  return <AdminStudioClient config={preparedConfig} />;
}
