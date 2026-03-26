"use client";

import { Studio } from "@mdcms/studio";

import {
  createClientStudioConfig,
  type PreparedStudioComponentMetadata,
} from "./studio-config";

export function AdminStudioClient(props: {
  preparedComponents: PreparedStudioComponentMetadata[];
}) {
  const config = createClientStudioConfig(props.preparedComponents);

  return <Studio config={config} basePath="/admin" />;
}
