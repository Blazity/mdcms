import assert from "node:assert/strict";
import { test } from "node:test";

import type { MdcmsConfig } from "@mdcms/studio";

import {
  createClientStudioConfig,
  extractPreparedStudioComponentMetadata,
} from "./studio-config";

test("extractPreparedStudioComponentMetadata strips non-serializable fields", () => {
  const metadata = extractPreparedStudioComponentMetadata({
    project: "marketing-site",
    environment: "staging",
    serverUrl: "http://localhost:4000",
    components: [
      {
        name: "Chart",
        importPath: "./components/mdx/Chart",
        load: async () => null,
        extractedProps: {
          data: {
            type: "array",
            items: "number",
            required: true,
          },
        },
      },
    ],
  } satisfies MdcmsConfig);

  assert.deepEqual(metadata, [
    {
      name: "Chart",
      extractedProps: {
        data: {
          type: "array",
          items: "number",
          required: true,
        },
      },
    },
  ]);
});

test("createClientStudioConfig merges prepared extracted props onto authored components", () => {
  const config = createClientStudioConfig([
    {
      name: "Chart",
      extractedProps: {
        data: {
          type: "array",
          items: "number",
          required: true,
        },
      },
    },
  ]);

  const chart = config.components?.find(
    (component) => component.name === "Chart",
  );

  assert.equal(typeof chart?.load, "function");
  assert.deepEqual(chart?.extractedProps, {
    data: {
      type: "array",
      items: "number",
      required: true,
    },
  });
});

test("createClientStudioConfig preserves explicit locale metadata", () => {
  const config = createClientStudioConfig([]);

  assert.deepEqual(config.locales, {
    default: "en",
    supported: ["en", "fr"],
  });
});
