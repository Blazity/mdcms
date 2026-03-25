import assert from "node:assert/strict";
import { test } from "node:test";

import { createMdxAutoFormFields } from "./auto-form.js";

test("createMdxAutoFormFields maps extracted props to default controls in order", () => {
  assert.deepEqual(
    createMdxAutoFormFields({
      title: { type: "string", required: true },
      website: { type: "string", required: false, format: "url" },
      count: { type: "number", required: true },
      published: { type: "boolean", required: false },
      kind: { type: "enum", required: true, values: ["bar", "line"] },
      tags: { type: "array", required: false, items: "string" },
      data: { type: "array", required: true, items: "number" },
      publishedAt: { type: "date", required: false },
      children: { type: "rich-text", required: true },
      options: { type: "json", required: false },
    }),
    [
      { name: "title", control: "text", required: true },
      { name: "website", control: "url", required: false },
      { name: "count", control: "number", required: true },
      { name: "published", control: "boolean", required: false },
      {
        name: "kind",
        control: "select",
        required: true,
        options: ["bar", "line"],
      },
      { name: "tags", control: "string-list", required: false },
      { name: "data", control: "number-list", required: true },
      { name: "publishedAt", control: "date", required: false },
      { name: "children", control: "rich-text", required: true },
    ],
  );
});

test("createMdxAutoFormFields returns an empty list for missing or json-only props", () => {
  assert.deepEqual(createMdxAutoFormFields(undefined), []);
  assert.deepEqual(createMdxAutoFormFields({}), []);
  assert.deepEqual(
    createMdxAutoFormFields({
      options: { type: "json", required: false },
    }),
    [],
  );
});
