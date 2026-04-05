import type { MdcmsConfig } from "@mdcms/studio";
import { prepareStudioConfig } from "@mdcms/studio/runtime";

import {
  studioReviewEnvironment,
  studioReviewMdxComponents,
  studioReviewProject,
} from "../../../../lib/review-studio-config";

type PreparedStudioConfig = Awaited<ReturnType<typeof prepareStudioConfig>>;
type PreparedStudioComponent = NonNullable<MdcmsConfig["components"]>[number];

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

export function createReviewScenarioServerUrl(scenario: string): string {
  const origin =
    typeof window === "undefined"
      ? "http://127.0.0.1:4273"
      : window.location.origin;

  return new URL(`/review-api/${scenario}`, origin).href;
}

export function createClientStudioConfig(input: {
  scenario: string;
  preparedComponents: PreparedStudioComponentMetadata[];
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
    serverUrl: createReviewScenarioServerUrl(input.scenario),
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
