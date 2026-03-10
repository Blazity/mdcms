import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import { loadCliConfig } from "./config.js";

async function writeConfigFile(source: string): Promise<{
  cwd: string;
  configPath: string;
}> {
  const scratchRoot = join(process.cwd(), ".tmp");
  await mkdir(scratchRoot, { recursive: true });
  const cwd = await mkdtemp(join(scratchRoot, "mdcms-config-"));
  const configPath = join(cwd, "mdcms.config.ts");
  await writeFile(configPath, source, "utf8");
  return { cwd, configPath };
}

test("loadCliConfig parses helper-based config files into the normalized CLI shape", async () => {
  const { cwd } = await writeConfigFile(`
    import { defineConfig, defineType, reference } from "@mdcms/cli";

    const stringField = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate(value) {
          return typeof value === "string"
            ? { value }
            : { issues: [{ message: "must be a string" }] };
        },
      },
    };

    export default defineConfig({
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      environment: "staging",
      contentDirectories: ["content"],
      locales: {
        default: "en_us",
        supported: ["en-US", "fr"],
        aliases: {
          en: "en_us",
        },
      },
      types: [
        defineType("Author", {
          directory: "content/authors",
          fields: {
            name: stringField,
          },
        }),
        defineType("BlogPost", {
          directory: "content/blog",
          localized: true,
          fields: {
            title: stringField,
            author: reference("Author"),
          },
        }),
      ],
      components: [
        {
          name: "Chart",
          importPath: "@/components/mdx/Chart",
        },
      ],
    });
  `);

  const { config } = await loadCliConfig({ cwd });

  assert.equal(config.project, "marketing-site");
  assert.equal(config.serverUrl, "http://localhost:4000");
  assert.equal(config.environment, "staging");
  assert.deepEqual(config.contentDirectories, ["content"]);
  assert.equal(config.locales?.default, "en-US");
  const authorReference = config.types?.[1]?.referenceFields?.author;
  assert(authorReference);
  assert.equal(authorReference.targetType, "Author");
  assert.equal(config.components?.[0]?.name, "Chart");
});

test("loadCliConfig rejects config files whose contentDirectories do not cover type directories", async () => {
  const { cwd } = await writeConfigFile(`
    export default {
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
      contentDirectories: ["content/pages"],
      types: [
        {
          name: "BlogPost",
          directory: "content/blog",
          fields: {
            title: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate(value) {
                  return typeof value === "string"
                    ? { value }
                    : { issues: [{ message: "must be a string" }] };
                },
              },
            },
          },
        },
      ],
    };
  `);

  await assert.rejects(
    () => loadCliConfig({ cwd }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONFIG" &&
      error.message.includes("contentDirectories"),
  );
});
