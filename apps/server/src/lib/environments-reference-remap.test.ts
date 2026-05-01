import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  isRuntimeErrorLike,
  type SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

import { remapFrontmatterReferences } from "./environments-reference-remap.js";

const schema: SchemaRegistryTypeSnapshot = {
  type: "BlogPost",
  directory: "blog",
  localized: true,
  fields: {
    title: { kind: "string", required: true, nullable: false },
    author: {
      kind: "string",
      required: true,
      nullable: false,
      reference: { targetType: "Author" },
    },
    related: {
      kind: "array",
      required: false,
      nullable: false,
      item: {
        kind: "string",
        required: false,
        nullable: false,
        reference: { targetType: "BlogPost" },
      },
    },
    block: {
      kind: "object",
      required: false,
      nullable: false,
      fields: {
        cover: {
          kind: "string",
          required: false,
          nullable: false,
          reference: { targetType: "Asset" },
        },
        title: { kind: "string", required: false, nullable: false },
      },
    },
  },
};

const SOURCE_AUTHOR = "11111111-1111-4111-8111-111111111111";
const TARGET_AUTHOR = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const SOURCE_BLOG_A = "22222222-2222-4222-8222-222222222222";
const TARGET_BLOG_A = "22222222-2222-4222-8222-aaaaaaaaaaaa";
const SOURCE_ASSET = "33333333-3333-4333-8333-333333333333";
const TARGET_ASSET = "33333333-3333-4333-8333-aaaaaaaaaaaa";

const baseSourceLookup = (sourceDocumentId: string) => {
  switch (sourceDocumentId) {
    case SOURCE_AUTHOR:
      return { translationGroupId: "g-author", locale: "__mdcms_default__" };
    case SOURCE_BLOG_A:
      return { translationGroupId: "g-blog-a", locale: "en-US" };
    case SOURCE_ASSET:
      return { translationGroupId: "g-asset", locale: "__mdcms_default__" };
    default:
      return undefined;
  }
};

const baseTargetResolver = (key: {
  translationGroupId: string;
  locale: string;
}) => {
  if (
    key.translationGroupId === "g-author" &&
    key.locale === "__mdcms_default__"
  ) {
    return TARGET_AUTHOR;
  }
  if (key.translationGroupId === "g-blog-a" && key.locale === "en-US") {
    return TARGET_BLOG_A;
  }
  if (
    key.translationGroupId === "g-asset" &&
    key.locale === "__mdcms_default__"
  ) {
    return TARGET_ASSET;
  }
  return undefined;
};

test("remapFrontmatterReferences rewrites top-level, array, and nested references", () => {
  const result = remapFrontmatterReferences({
    schema,
    frontmatter: {
      title: "Hello",
      author: SOURCE_AUTHOR,
      related: [SOURCE_BLOG_A],
      block: {
        cover: SOURCE_ASSET,
        title: "Cover",
      },
    },
    sourceLookup: baseSourceLookup,
    targetResolver: baseTargetResolver,
    sourceDocumentId: "src-doc",
  });

  assert.equal(result.remappedReferences, 3);
  assert.deepEqual(result.frontmatter, {
    title: "Hello",
    author: TARGET_AUTHOR,
    related: [TARGET_BLOG_A],
    block: {
      cover: TARGET_ASSET,
      title: "Cover",
    },
  });
});

test("remapFrontmatterReferences does not count unchanged values", () => {
  const result = remapFrontmatterReferences({
    schema,
    frontmatter: {
      title: "No refs",
      author: SOURCE_AUTHOR,
    },
    sourceLookup: baseSourceLookup,
    targetResolver: (key) =>
      key.translationGroupId === "g-author" ? SOURCE_AUTHOR : undefined,
    sourceDocumentId: "src-doc",
  });

  // Same value coming back is still a successful resolve, but the counter
  // only ticks when the value actually changes.
  assert.equal(result.remappedReferences, 0);
  assert.equal(result.frontmatter.author, SOURCE_AUTHOR);
});

test("remapFrontmatterReferences fails atomically when source unknown", () => {
  let thrown: unknown;
  try {
    remapFrontmatterReferences({
      schema,
      frontmatter: {
        author: "00000000-0000-4000-8000-000000000000",
      },
      sourceLookup: () => undefined,
      targetResolver: () => "anything",
      sourceDocumentId: "src-doc",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(isRuntimeErrorLike(thrown));
  const error = thrown as {
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
  };
  assert.equal(error.code, "REFERENCE_REMAP_FAILED");
  assert.equal(error.statusCode, 409);
  assert.equal(error.details?.reason, "unknown_source");
});

test("remapFrontmatterReferences fails atomically when target match missing", () => {
  let thrown: unknown;
  try {
    remapFrontmatterReferences({
      schema,
      frontmatter: {
        author: SOURCE_AUTHOR,
      },
      sourceLookup: baseSourceLookup,
      // Target has no row for `(g-author, __mdcms_default__)`.
      targetResolver: () => undefined,
      sourceDocumentId: "src-doc",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(isRuntimeErrorLike(thrown));
  const error = thrown as {
    details?: Record<string, unknown>;
  };
  assert.equal(error.details?.reason, "no_target_match");
  assert.equal(error.details?.translationGroupId, "g-author");
});

test("remapFrontmatterReferences ignores null/undefined values without erroring", () => {
  const result = remapFrontmatterReferences({
    schema,
    frontmatter: {
      title: "x",
      author: null,
      related: undefined,
      block: { cover: null },
    } as unknown as Record<string, unknown>,
    sourceLookup: baseSourceLookup,
    targetResolver: baseTargetResolver,
    sourceDocumentId: "src-doc",
  });

  assert.equal(result.remappedReferences, 0);
  assert.equal(result.frontmatter.author, null);
});

test("remapFrontmatterReferences passes through frontmatter when schema undefined", () => {
  const result = remapFrontmatterReferences({
    schema: undefined,
    frontmatter: { author: SOURCE_AUTHOR },
    sourceLookup: baseSourceLookup,
    targetResolver: baseTargetResolver,
    sourceDocumentId: "src-doc",
  });
  assert.equal(result.remappedReferences, 0);
  assert.equal(result.frontmatter.author, SOURCE_AUTHOR);
});

test("remapFrontmatterReferences throws when an object reference container is wrong shape", () => {
  let thrown: unknown;
  try {
    remapFrontmatterReferences({
      schema,
      frontmatter: {
        // schema declares `block` as an object containing a reference
        // (`block.cover`); supplying an array breaks the shape contract.
        block: [SOURCE_ASSET],
      } as unknown as Record<string, unknown>,
      sourceLookup: baseSourceLookup,
      targetResolver: baseTargetResolver,
      sourceDocumentId: "src-doc",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(isRuntimeErrorLike(thrown));
  const error = thrown as { code: string; details?: Record<string, unknown> };
  assert.equal(error.code, "REFERENCE_REMAP_FAILED");
  assert.equal(error.details?.reason, "container_shape_mismatch");
  assert.equal(error.details?.expectedKind, "object");
});

test("remapFrontmatterReferences throws when an array reference container is wrong shape", () => {
  let thrown: unknown;
  try {
    remapFrontmatterReferences({
      schema,
      frontmatter: {
        // `related` is declared as an array of references — passing an
        // object should fail fast rather than silently keep unremapped ids.
        related: { 0: SOURCE_BLOG_A },
      } as unknown as Record<string, unknown>,
      sourceLookup: baseSourceLookup,
      targetResolver: baseTargetResolver,
      sourceDocumentId: "src-doc",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(isRuntimeErrorLike(thrown));
  const error = thrown as { code: string; details?: Record<string, unknown> };
  assert.equal(error.code, "REFERENCE_REMAP_FAILED");
  assert.equal(error.details?.reason, "container_shape_mismatch");
  assert.equal(error.details?.expectedKind, "array");
});
