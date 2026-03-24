import { createStudioEmbedConfig } from "@mdcms/studio/runtime";

import config from "../../../mdcms.config";
import { AdminStudioClient } from "../admin-studio-client";

export default async function AdminCatchAllPage() {
  return <AdminStudioClient config={createStudioEmbedConfig(config)} />;
}
