import { Studio } from "@mdcms/studio";

import config from "../../../mdcms.config";

type AdminCatchAllPageProps = {
  params: Promise<{
    path?: string[];
  }>;
};

export default async function AdminCatchAllPage({
  params,
}: AdminCatchAllPageProps) {
  const resolvedParams = await params;

  return <Studio config={config} path={resolvedParams.path ?? []} />;
}
