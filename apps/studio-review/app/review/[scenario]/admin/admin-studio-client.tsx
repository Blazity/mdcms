"use client";

import { Studio, type MdcmsConfig } from "@mdcms/studio";

import {
  createClientStudioConfig,
  type PreparedStudioComponentMetadata,
} from "./studio-config";

export function AdminStudioClient(props: {
  scenario: string;
  basePath: string;
  serverUrl: string;
  preparedComponents: PreparedStudioComponentMetadata[];
  documentRouteMetadata?: MdcmsConfig["_documentRouteMetadata"];
}) {
  const config = createClientStudioConfig({
    scenario: props.scenario,
    serverUrl: props.serverUrl,
    preparedComponents: props.preparedComponents,
    documentRouteMetadata: props.documentRouteMetadata ?? undefined,
  });

  return (
    <Studio
      config={config}
      basePath={props.basePath}
      auth={{ mode: "token", token: "mdcms_review_token" }}
    />
  );
}
