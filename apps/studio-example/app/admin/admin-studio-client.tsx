"use client";

import { Studio } from "@mdcms/studio";

import {
  createClientStudioConfig,
  type PreparedStudioComponentMetadata,
} from "./studio-config";
import type { MdcmsConfig } from "@mdcms/studio";

export function AdminStudioClient(props: {
  preparedComponents: PreparedStudioComponentMetadata[];
  schemaHash?: string;
  documentRouteMetadata?: MdcmsConfig["_documentRouteMetadata"];
  requestHost?: string;
}) {
  const config = createClientStudioConfig(
    props.preparedComponents,
    props.schemaHash,
    props.documentRouteMetadata ?? undefined,
    props.requestHost,
  );

  return <Studio config={config} basePath="/admin" />;
}
