"use client";

import { Studio, type MdcmsConfig } from "@mdcms/studio";

export function AdminStudioClient({ config }: { config: MdcmsConfig }) {
  return <Studio config={config} basePath="/admin" />;
}
