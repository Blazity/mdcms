import {
  Studio,
  loadStudioDocumentShell,
  type StudioDocumentShell,
} from "@mdcms/studio";

import config from "../../../mdcms.config";

type AdminCatchAllPageProps = {
  params: Promise<{
    path?: string[];
  }>;
  searchParams: Promise<{
    locale?: string | string[];
  }>;
};

export default async function AdminCatchAllPage({
  params,
  searchParams,
}: AdminCatchAllPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const routePath = resolvedParams.path ?? [];
  let documentShell: StudioDocumentShell | undefined;

  if (
    routePath[0] === "content" &&
    typeof routePath[1] === "string" &&
    typeof routePath[2] === "string"
  ) {
    const localeParam = resolvedSearchParams.locale;
    const locale =
      typeof localeParam === "string"
        ? localeParam
        : Array.isArray(localeParam)
          ? localeParam[0]
          : undefined;

    documentShell = await loadStudioDocumentShell(
      config,
      {
        type: routePath[1],
        documentId: routePath[2],
        locale,
      },
      { fetcher: fetch },
    );
  }

  return (
    <Studio config={config} path={routePath} documentShell={documentShell} />
  );
}
