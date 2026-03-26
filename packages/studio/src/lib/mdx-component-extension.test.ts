import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseMdxJsxAttributes,
  serializeMdxJsxAttributes,
  tokenizeMdxComponentBlock,
} from "./mdx-component-extension.js";

test("tokenizeMdxComponentBlock identifies wrapper component blocks", () => {
  const token = tokenizeMdxComponentBlock(
    ['<Callout type="warning">', "Body", "</Callout>"].join("\n"),
  );

  assert.deepEqual(token, {
    componentName: "Callout",
    isVoid: false,
    props: {
      type: "warning",
    },
    raw: ['<Callout type="warning">', "Body", "</Callout>"].join("\n"),
    content: "Body",
  });
});

test("tokenizeMdxComponentBlock identifies self-closing component blocks", () => {
  const token = tokenizeMdxComponentBlock('<HeroBanner title="Launch" />');

  assert.deepEqual(token, {
    componentName: "HeroBanner",
    isVoid: true,
    props: {
      title: "Launch",
    },
    raw: '<HeroBanner title="Launch" />',
    content: "",
  });
});

test("parseMdxJsxAttributes accepts JSON-serializable JSX attribute values", () => {
  assert.deepEqual(
    parseMdxJsxAttributes(
      'title="Launch" count={3} featured={true} tags={["cms","mdx"]}',
    ),
    {
      title: "Launch",
      count: 3,
      featured: true,
      tags: ["cms", "mdx"],
    },
  );
});

test("serializeMdxJsxAttributes writes JSX-friendly attribute syntax", () => {
  const serialized = serializeMdxJsxAttributes({
    title: "Launch",
    count: 3,
    featured: true,
    tags: ["cms", "mdx"],
  });

  assert.match(serialized, /title="Launch"/);
  assert.match(serialized, /count=\{3\}/);
  assert.match(serialized, /featured=\{true\}/);
  assert.match(serialized, /tags=\{\["cms","mdx"\]\}/);
});
