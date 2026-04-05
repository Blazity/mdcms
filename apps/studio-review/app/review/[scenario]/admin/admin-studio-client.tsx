"use client";

import { Studio } from "@mdcms/studio";

import {
  createClientStudioConfig,
  type PreparedStudioComponentMetadata,
} from "./studio-config";

export function AdminStudioClient(props: {
  scenario: string;
  basePath: string;
  preparedComponents: PreparedStudioComponentMetadata[];
}) {
  const config = createClientStudioConfig({
    scenario: props.scenario,
    preparedComponents: props.preparedComponents,
  });

  return (
    <Studio
      config={config}
      basePath={props.basePath}
      auth={{ mode: "token", token: "mdcms_review_token" }}
    />
  );
}
