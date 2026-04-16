import type { MdcmsConfig } from "@mdcms/studio";
import { prepareStudioConfig } from "@mdcms/studio/runtime";
import {
  studioExampleEnvironment,
  studioExampleLocales,
  studioExampleMdxComponents,
  studioExampleProject,
  resolveStudioExampleServerUrl,
} from "../../lib/studio-example-studio-config";

type PreparedStudioConfig = Awaited<ReturnType<typeof prepareStudioConfig>>;
type PreparedStudioComponent = NonNullable<MdcmsConfig["components"]>[number];
type PreparedDocumentRouteMetadata = NonNullable<
  MdcmsConfig["_documentRouteMetadata"]
>;

export type PreparedStudioComponentMetadata = Pick<
  PreparedStudioComponent,
  "name" | "extractedProps"
>;

export function extractPreparedStudioComponentMetadata(
  config: PreparedStudioConfig,
): PreparedStudioComponentMetadata[] {
  return (
    config.components?.map((component) => ({
      name: component.name,
      ...(component.extractedProps !== undefined
        ? { extractedProps: component.extractedProps }
        : {}),
    })) ?? []
  );
}

export function createClientStudioConfig(
  preparedComponents: PreparedStudioComponentMetadata[],
  schemaHash?: string,
  documentRouteMetadata?: PreparedDocumentRouteMetadata,
): MdcmsConfig {
  const extractedPropsByName = new Map(
    preparedComponents.map((component) => [
      component.name,
      component.extractedProps,
    ]),
  );
  const clientComponents = [
    ...studioExampleMdxComponents,
  ] as PreparedStudioComponent[];

  return {
    project: studioExampleProject,
    environment: studioExampleEnvironment,
    serverUrl: resolveStudioExampleServerUrl(),
    locales: studioExampleLocales,
    // Pre-computed schema hash from the server component where the full
    // config (with Zod types/environments) is available for derivation.
    ...(schemaHash ? { _schemaHash: schemaHash } : {}),
    ...(documentRouteMetadata
      ? { _documentRouteMetadata: documentRouteMetadata }
      : {}),
    components: clientComponents.map((component) => {
      const extractedProps = extractedPropsByName.get(component.name);

      return extractedProps === undefined
        ? component
        : {
            ...component,
            extractedProps,
          };
    }),
  } as MdcmsConfig;
}
