import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { RuntimeError } from "../runtime/error.js";
import {
  IMPLICIT_DEFAULT_LOCALE,
  defineConfig,
  defineType,
  parseMdcmsConfig,
  reference,
} from "./config.js";

const standardStringSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate(value: unknown) {
      if (typeof value === "string") {
        return { value };
      }

      return {
        issues: [{ message: "must be a string" }],
      };
    },
  },
};

test("defineConfig/defineType/reference produce a normalized shared config", () => {
  const author = defineType("Author", {
    directory: "content/authors",
    fields: {
      name: z.string().min(1),
    },
  });
  const blogPost = defineType("BlogPost", {
    directory: "content/blog",
    localized: true,
    fields: {
      title: z.string().min(1),
      author: reference("Author"),
      relatedAuthor: reference("Author").optional(),
      summary: standardStringSchema,
    },
  });
  const config = defineConfig({
    project: "  marketing-site  ",
    serverUrl: " http://localhost:4000 ",
    environment: " staging ",
    contentDirectories: [" ./content/ ", "content/shared/"],
    locales: {
      default: " en_us ",
      supported: [" en-US ", "fr"],
      aliases: {
        EN: "en_us",
        fr_FR: "fr",
      },
    },
    types: [blogPost, author],
    components: [
      {
        name: "Chart",
        importPath: "@/components/mdx/Chart",
        description: "Render a chart",
      },
    ],
  });

  const parsed = parseMdcmsConfig(config);

  assert.equal(parsed.project, "marketing-site");
  assert.equal(parsed.serverUrl, "http://localhost:4000");
  assert.equal(parsed.environment, "staging");
  assert.deepEqual(parsed.contentDirectories, ["content", "content/shared"]);
  assert.deepEqual(parsed.locales, {
    default: "en-US",
    supported: ["en-US", "fr"],
    aliases: {
      en: "en-US",
      "fr-FR": "fr",
    },
    implicit: false,
  });
  assert.equal(parsed.types.length, 2);
  assert.equal(parsed.types[0]?.name, "BlogPost");
  assert.equal(parsed.types[0]?.localized, true);
  assert.equal(parsed.types[0]?.referenceFields.author?.targetType, "Author");
  assert.equal(
    parsed.types[0]?.referenceFields.relatedAuthor?.targetType,
    "Author",
  );
  assert.equal(parsed.types[0]?.fields.summary, standardStringSchema);
  assert.deepEqual(parsed.components, [
    {
      name: "Chart",
      importPath: "@/components/mdx/Chart",
      description: "Render a chart",
    },
  ]);
});

test("parseMdcmsConfig resolves implicit single-locale mode when no type is localized", () => {
  const parsed = parseMdcmsConfig(
    defineConfig({
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      contentDirectories: ["content/pages"],
      types: [
        defineType("Page", {
          directory: "content/pages",
          fields: {
            title: z.string(),
          },
        }),
      ],
    }),
  );

  assert.deepEqual(parsed.locales, {
    default: IMPLICIT_DEFAULT_LOCALE,
    supported: [IMPLICIT_DEFAULT_LOCALE],
    aliases: {},
    implicit: true,
  });
});

test("parseMdcmsConfig rejects non-Standard-Schema field validators", () => {
  assert.throws(
    () =>
      parseMdcmsConfig(
        defineConfig({
          project: "marketing-site",
          serverUrl: "http://localhost:4000",
          contentDirectories: ["content/pages"],
          types: [
            defineType("Page", {
              directory: "content/pages",
              fields: {
                title: "not-a-schema" as never,
              },
            }),
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("types[0].fields.title"),
  );
});

test("parseMdcmsConfig rejects localized types without explicit locales config", () => {
  assert.throws(
    () =>
      parseMdcmsConfig(
        defineConfig({
          project: "marketing-site",
          serverUrl: "http://localhost:4000",
          contentDirectories: ["content/blog"],
          types: [
            defineType("BlogPost", {
              directory: "content/blog",
              localized: true,
              fields: {
                title: z.string(),
              },
            }),
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("locales"),
  );
});

test("parseMdcmsConfig rejects invalid locale tags and reserved token collisions", () => {
  assert.throws(
    () =>
      parseMdcmsConfig(
        defineConfig({
          project: "marketing-site",
          serverUrl: "http://localhost:4000",
          contentDirectories: ["content/blog"],
          locales: {
            default: "en-US",
            supported: ["en-US", "__mdcms_default__"],
            aliases: {
              legacy: "en-US",
            },
          },
          types: [
            defineType("BlogPost", {
              directory: "content/blog",
              localized: true,
              fields: {
                title: z.string(),
              },
            }),
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("__mdcms_default__"),
  );

  assert.throws(
    () =>
      parseMdcmsConfig(
        defineConfig({
          project: "marketing-site",
          serverUrl: "http://localhost:4000",
          contentDirectories: ["content/blog"],
          locales: {
            default: "en-US",
            supported: ["en-US"],
            aliases: {
              "not a locale": "en-US",
            },
          },
          types: [
            defineType("BlogPost", {
              directory: "content/blog",
              localized: true,
              fields: {
                title: z.string(),
              },
            }),
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("aliases"),
  );
});

test("parseMdcmsConfig rejects contentDirectories that do not cover type directories", () => {
  assert.throws(
    () =>
      parseMdcmsConfig(
        defineConfig({
          project: "marketing-site",
          serverUrl: "http://localhost:4000",
          contentDirectories: ["content/pages"],
          types: [
            defineType("BlogPost", {
              directory: "content/blog",
              fields: {
                title: z.string(),
              },
            }),
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("contentDirectories"),
  );
});
