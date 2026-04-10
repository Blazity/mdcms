import type { MdcmsConfig } from "@mdcms/studio";
import { prepareStudioConfig } from "@mdcms/studio/runtime";

import {
  studioReviewEnvironment,
  studioReviewMdxComponents,
  studioReviewProject,
  studioReviewServerUrl,
} from "../../../../lib/review-studio-config";

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

type HeaderReader = Pick<Headers, "get">;

function readRequestHeader(
  headers: HeaderReader,
  name: string,
): string | undefined {
  const value = headers.get(name);

  if (value === null) {
    return undefined;
  }

  const firstValue = value.split(",")[0]?.trim();

  return firstValue && firstValue.length > 0 ? firstValue : undefined;
}

export function resolveReviewRequestOrigin(headers: HeaderReader): string {
  const proto = readRequestHeader(headers, "x-forwarded-proto") ?? "http";
  const host =
    readRequestHeader(headers, "x-forwarded-host") ??
    readRequestHeader(headers, "host");

  if (!host) {
    return studioReviewServerUrl;
  }

  return `${proto}://${host}`;
}

export function createReviewScenarioServerUrl(input: {
  scenario: string;
  origin: string;
}): string {
  return new URL(`/review-api/${input.scenario}`, input.origin).href;
}

export function createClientStudioConfig(input: {
  scenario: string;
  serverUrl: string;
  preparedComponents: PreparedStudioComponentMetadata[];
  documentRouteMetadata?: PreparedDocumentRouteMetadata;
}): MdcmsConfig {
  const extractedPropsByName = new Map(
    input.preparedComponents.map((component) => [
      component.name,
      component.extractedProps,
    ]),
  );
  const clientComponents = [
    ...studioReviewMdxComponents,
  ] as PreparedStudioComponent[];

  return {
    project: studioReviewProject,
    environment: studioReviewEnvironment,
    serverUrl: input.serverUrl,
    ...(input.documentRouteMetadata
      ? { _documentRouteMetadata: input.documentRouteMetadata }
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
  };
}
