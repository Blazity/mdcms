import assert from "node:assert/strict";

import { test } from "bun:test";

import { createStudioEmbedConfig } from "./studio.js";
import {
  resolveStudioDocumentRouteSchemaCapability,
  type StudioDocumentRouteSchemaCapability,
} from "./document-route-schema.js";
import { defineConfig, defineType, reference } from "@mdcms/shared";

function createAuthoredConfig() {
  return defineConfig({
    project: "marketing-site",
    serverUrl: "http://localhost:4000",
    environment: "staging",
    contentDirectories: ["content"],
    locales: {
      default: "en",
      supported: ["en", "fr"],
      aliases: {
        "fr-ca": "fr",
        "en-us": "en",
      },
    },
    types: [
      defineType("Author", {
        directory: "content/authors",
        fields: {
          name: reference("Author"),
          bio: reference("Author"),
        },
      }),
      defineType("Article", {
        directory: "content/articles",
        fields: {
          body: reference("Article"),
          title: reference("Article"),
        },
      }),
    ],
    environments: {
      production: {},
      staging: {
        extends: "production",
        types: {
          Article: {
            add: {
              summary: reference("Article"),
            },
          },
          Author: {
            modify: {
              bio: reference("Author"),
            },
          },
        },
      },
    },
  });
}

async function readCapability(): Promise<StudioDocumentRouteSchemaCapability> {
  return resolveStudioDocumentRouteSchemaCapability(createAuthoredConfig());
}

test("derived schema hash is deterministic for authored Studio configs", async () => {
  const capability = await readCapability();

  assert.equal(capability.canWrite, true);
  if (!capability.canWrite) {
    throw new Error("Expected a write-capable schema result.");
  }

  const repeatCapability = await readCapability();
  assert.equal(repeatCapability.canWrite, true);
  if (!repeatCapability.canWrite) {
    throw new Error("Expected a write-capable schema result.");
  }

  assert.match(capability.schemaHash, /^[a-f0-9]{64}$/);
  assert.equal(capability.schemaHash, repeatCapability.schemaHash);
});

test("equivalent authored config data yields the same schema hash", async () => {
  const left = await resolveStudioDocumentRouteSchemaCapability(
    defineConfig({
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      environment: "staging",
      contentDirectories: ["content"],
      locales: {
        default: "en",
        supported: ["en", "fr"],
        aliases: {
          "en-us": "en",
          "fr-ca": "fr",
        },
      },
      types: [
        defineType("Article", {
          directory: "content/articles",
          fields: {
            title: reference("Article"),
            body: reference("Article"),
          },
        }),
        defineType("Author", {
          directory: "content/authors",
          fields: {
            bio: reference("Author"),
            name: reference("Author"),
          },
        }),
      ],
      environments: {
        staging: {
          types: {
            Author: {
              modify: {
                bio: reference("Author"),
              },
            },
            Article: {
              add: {
                summary: reference("Article"),
              },
            },
          },
        },
        production: {},
      },
    }),
  );

  const right = await resolveStudioDocumentRouteSchemaCapability(
    createAuthoredConfig(),
  );

  assert.equal(left.canWrite, true);
  assert.equal(right.canWrite, true);
  if (!left.canWrite || !right.canWrite) {
    throw new Error("Expected write-capable schema results.");
  }

  assert.equal(left.schemaHash, right.schemaHash);
});

test("shell-only embed config does not produce a write-capable schema hash", async () => {
  const capability = await resolveStudioDocumentRouteSchemaCapability(
    createStudioEmbedConfig(createAuthoredConfig()),
  );

  assert.equal(capability.canWrite, false);
  assert.equal(capability.reason, "schema-unavailable");
  assert.match(capability.message, /resolved schema/i);
});
