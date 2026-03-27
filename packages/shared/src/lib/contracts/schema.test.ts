import assert from "node:assert/strict";
import { test } from "bun:test";

import { z } from "zod";

import {
  defineConfig,
  defineType,
  parseMdcmsConfig,
  reference,
} from "./config.js";
import { RuntimeError } from "../runtime/error.js";
import {
  assertSchemaRegistryEntry,
  assertSchemaRegistrySyncPayload,
  serializeResolvedEnvironmentSchema,
  type SchemaRegistryEntry,
} from "./schema.js";

function expectInvalidInput(fn: () => unknown, path: string, message?: RegExp) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof RuntimeError);
    assert.equal(error.code, "INVALID_INPUT");
    assert.equal(error.statusCode, 400);
    assert.equal(error.details?.path, path);

    if (message) {
      assert.match(error.message, message);
    }

    return true;
  });
}

test("assertSchemaRegistryEntry accepts a valid type-centric registry entry", () => {
  const entry: SchemaRegistryEntry = {
    type: "Post",
    directory: "content/posts",
    localized: false,
    schemaHash: "abc123",
    syncedAt: "2026-03-11T12:00:00.000Z",
    resolvedSchema: {
      type: "Post",
      directory: "content/posts",
      localized: false,
      fields: {
        title: {
          kind: "string",
          required: true,
          nullable: false,
        },
      },
    },
  };

  assert.doesNotThrow(() => assertSchemaRegistryEntry(entry));
});

test("assertSchemaRegistryEntry rejects contradictory entry metadata", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistryEntry({
        type: "Post",
        directory: "content/posts",
        localized: true,
        schemaHash: "abc123",
        syncedAt: "2026-03-11T12:00:00.000Z",
        resolvedSchema: {
          type: "Post",
          directory: "content/posts",
          localized: false,
          fields: {
            title: {
              kind: "string",
              required: true,
              nullable: false,
            },
          },
        },
      }),
    "entry.resolvedSchema.localized",
  );
});

test("assertSchemaRegistrySyncPayload rejects malformed resolved schema maps with INVALID_INPUT details", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {},
        resolvedSchema: [],
        schemaHash: "hash",
      }),
    "payload.resolvedSchema",
  );
});

test("assertSchemaRegistrySyncPayload rejects obsolete extractedComponents input", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {},
        resolvedSchema: {},
        schemaHash: "hash",
        extractedComponents: [],
      } as never),
    "payload.extractedComponents",
  );
});

test("assertSchemaRegistrySyncPayload rejects impossible field snapshot shapes", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {},
        resolvedSchema: {
          Post: {
            type: "Post",
            directory: "content/posts",
            localized: false,
            fields: {
              tags: {
                kind: "array",
                required: true,
                nullable: false,
              },
            },
          },
        },
        schemaHash: "hash",
      }),
    "payload.resolvedSchema.Post.fields.tags.item",
  );
});

test("assertSchemaRegistrySyncPayload rejects resolved schema key/type mismatches", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {},
        resolvedSchema: {
          Post: {
            type: "Author",
            directory: "content/posts",
            localized: false,
            fields: {},
          },
        },
        schemaHash: "hash",
      }),
    "payload.resolvedSchema.Post.type",
  );
});

test("assertSchemaRegistrySyncPayload rejects unserializable JSON-ish payload members", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {
          invalid: () => "nope",
        },
        resolvedSchema: {
          Post: {
            type: "Post",
            directory: "content/posts",
            localized: false,
            fields: {},
          },
        },
        schemaHash: "hash",
      }),
    "payload.rawConfigSnapshot.invalid",
  );
});

test("serializeResolvedEnvironmentSchema produces stable descriptive snapshots for supported fields", () => {
  const post = defineType("Post", {
    directory: "content/posts",
    fields: {
      title: z.string().min(1),
      author: reference("Author"),
      metadata: z.object({
        nestedAuthor: reference("Author"),
        reviewers: z.array(reference("Author")),
      }),
      tags: z.array(z.string()).default([]),
      featured: z.boolean().env("staging"),
    },
  });

  const parsed = parseMdcmsConfig(
    defineConfig({
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      contentDirectories: ["content"],
      types: [post],
      environments: {
        production: {},
        staging: {},
      },
    }),
  );

  assert.deepEqual(serializeResolvedEnvironmentSchema(parsed, "production"), {
    Post: {
      type: "Post",
      directory: "content/posts",
      localized: false,
      fields: {
        author: {
          kind: "string",
          required: true,
          nullable: false,
          reference: {
            targetType: "Author",
          },
        },
        metadata: {
          kind: "object",
          required: true,
          nullable: false,
          fields: {
            nestedAuthor: {
              kind: "string",
              required: true,
              nullable: false,
              reference: {
                targetType: "Author",
              },
            },
            reviewers: {
              kind: "array",
              required: true,
              nullable: false,
              item: {
                kind: "string",
                required: true,
                nullable: false,
                reference: {
                  targetType: "Author",
                },
              },
            },
          },
        },
        tags: {
          kind: "array",
          required: false,
          nullable: false,
          default: [],
          item: {
            kind: "string",
            required: true,
            nullable: false,
          },
        },
        title: {
          kind: "string",
          required: true,
          nullable: false,
          checks: [
            {
              kind: "min_length",
              minimum: 1,
            },
          ],
        },
      },
    },
  });

  assert.deepEqual(
    serializeResolvedEnvironmentSchema(parsed, "staging").Post?.fields.featured,
    {
      kind: "boolean",
      required: true,
      nullable: false,
    },
  );
});

test("serializeResolvedEnvironmentSchema rejects unsupported executable validator features", () => {
  const parsed = parseMdcmsConfig(
    defineConfig({
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      contentDirectories: ["content"],
      types: [
        defineType("Post", {
          directory: "content/posts",
          fields: {
            title: z.string().refine((value) => value.length > 0),
          },
        }),
      ],
      environments: {
        staging: {},
      },
    }),
  );

  expectInvalidInput(
    () => serializeResolvedEnvironmentSchema(parsed, "staging"),
    "resolvedEnvironments.staging.types.Post.fields.title.checks[0]",
    /unsupported executable validator feature/i,
  );
});
