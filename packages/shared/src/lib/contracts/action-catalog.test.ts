import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertActionCatalogItem,
  assertActionCatalogList,
  type ActionCatalogItem,
} from "./action-catalog.js";

const validAction: ActionCatalogItem = {
  id: "content.publish",
  kind: "command",
  method: "POST",
  path: "/api/v1/content/:id/publish",
  permissions: ["content:publish"],
  studio: {
    visible: true,
    label: "Publish",
    form: {
      mode: "auto",
      uiHints: {
        surface: "content.editor.header.actions",
      },
    },
  },
  cli: {
    visible: true,
    alias: "publish",
    inputMode: "json-or-flags",
  },
  requestSchema: {
    type: "object",
    properties: {
      force: { type: "boolean" },
    },
  },
  responseSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
    },
  },
};

test("assertActionCatalogItem accepts valid flattened metadata", () => {
  assert.doesNotThrow(() => assertActionCatalogItem(validAction));
});

test("assertActionCatalogItem rejects invalid metadata shape", () => {
  assert.throws(
    () =>
      assertActionCatalogItem({
        ...validAction,
        permissions: "content:publish",
      }),
    /permissions must be an array of strings/,
  );
});

test("assertActionCatalogItem rejects non-object inline schemas", () => {
  assert.throws(
    () =>
      assertActionCatalogItem({
        ...validAction,
        requestSchema: "not-an-object",
      }),
    /requestSchema must be a JSON object/,
  );
});

test("assertActionCatalogList validates item arrays", () => {
  assert.doesNotThrow(() => assertActionCatalogList([validAction]));
});
