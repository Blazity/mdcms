import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement } from "react";
import { isValidElement } from "react";

import AdminCatchAllPage from "./page";
import { AdminStudioClient } from "../admin-studio-client";

test("admin route prepares the full studio config with local MDX components", async () => {
  const element = await AdminCatchAllPage();

  assert.ok(isValidElement(element));
  assert.equal(element.type, AdminStudioClient);

  const props = (
    element as ReactElement<{
      config: {
        components?: Array<{
          name: string;
        }>;
      };
    }>
  ).props;

  assert.ok(Array.isArray(props.config.components));
  assert.deepEqual(
    props.config.components.map((component) => component.name),
    ["Chart", "Callout", "PricingTable"],
  );
});
