import { Studio } from "@mdcms/studio";
import { createStudioEmbedConfig } from "@mdcms/studio/runtime";

import config from "../../../mdcms.config";

export default function AdminCatchAllPage() {
  return <Studio config={createStudioEmbedConfig(config)} basePath="/admin" />;
}
