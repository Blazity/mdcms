"use client";

import { Studio } from "@mdcms/studio";

import {
  createClientStudioConfig,
  type PreparedStudioComponentMetadata,
} from "./studio-config";

export function AdminStudioClient(props: {
  preparedComponents: PreparedStudioComponentMetadata[];
  schemaHash?: string;
}) {
  const config = createClientStudioConfig(
    props.preparedComponents,
    props.schemaHash,
  );

  return <Studio config={config} basePath="/admin" />;
}
