import assert from "node:assert/strict";
import { test } from "node:test";

import { detectLocaleConfig, normalizeLocale } from "./detect-locale.js";
import type { InferredType } from "./infer-schema.js";
import type { DiscoveredFile, LocaleHint } from "./scan.js";

function makeFile(
  relativePath: string,
  localeHint: LocaleHint | null,
): DiscoveredFile {
  return {
    relativePath,
    format: "md",
    frontmatter: {},
    frontmatterKeys: [],
    localeHint,
  };
}

function makeType(name: string, directory: string): InferredType {
  return {
    name,
    directory,
    localized: false,
    fields: {},
    fileCount: 0,
  };
}

test("normalizeLocale: canonical BCP 47 casing", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocale("en-us"), "en-US");
  assert.equal(normalizeLocale("en_US"), "en-US");
  assert.equal(normalizeLocale("en_us"), "en-US");
  assert.equal(normalizeLocale("fr-FR"), "fr-FR");
  assert.equal(normalizeLocale("zh-hans"), "zh-Hans");
});

test("normalizeLocale: returns null for invalid tags", () => {
  assert.equal(normalizeLocale(""), null);
  assert.equal(normalizeLocale("x"), null);
  assert.equal(normalizeLocale("toolong"), null);
  assert.equal(normalizeLocale("123"), null);
});

test("returns null when no locale evidence found", () => {
  const files = [
    makeFile("content/posts/a.md", null),
    makeFile("content/posts/b.md", null),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types);
  assert.equal(result, null);
});

test("detects single locale — non-localized", () => {
  const files = [
    makeFile("content/posts/a.md", {
      source: "frontmatter",
      rawValue: "en",
    }),
    makeFile("content/posts/b.md", {
      source: "frontmatter",
      rawValue: "en",
    }),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types);
  assert.equal(result, null);
});

test("detects multi-locale from suffix — marks type localized", () => {
  const files = [
    makeFile("content/posts/hello.en.md", {
      source: "suffix",
      rawValue: "en",
    }),
    makeFile("content/posts/hello.fr.md", {
      source: "suffix",
      rawValue: "fr",
    }),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types)!;
  assert.ok(result);
  assert.equal(result.defaultLocale, "en");
  assert.deepEqual(result.supported.sort(), ["en", "fr"]);
  assert.equal(types[0]!.localized, true);
});

test("detects multi-locale from folder segments", () => {
  const files = [
    makeFile("content/pages/en/about.md", {
      source: "folder",
      rawValue: "en",
    }),
    makeFile("content/pages/fr/about.md", {
      source: "folder",
      rawValue: "fr",
    }),
  ];
  const types = [makeType("page", "content/pages")];

  const result = detectLocaleConfig(files, types)!;
  assert.ok(result);
  assert.deepEqual(result.supported.sort(), ["en", "fr"]);
  assert.equal(types[0]!.localized, true);
});

test("normalizes non-canonical tags and populates aliases", () => {
  const files = [
    makeFile("content/posts/a.en_us.md", {
      source: "suffix",
      rawValue: "en_us",
    }),
    makeFile("content/posts/a.fr.md", {
      source: "suffix",
      rawValue: "fr",
    }),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types)!;
  assert.ok(result);
  assert.ok(result.supported.includes("en-US"));
  assert.equal(result.aliases["en_us"], "en-US");
});

test("default locale is the most frequent", () => {
  const files = [
    makeFile("content/posts/a.en.md", { source: "suffix", rawValue: "en" }),
    makeFile("content/posts/b.en.md", { source: "suffix", rawValue: "en" }),
    makeFile("content/posts/c.en.md", { source: "suffix", rawValue: "en" }),
    makeFile("content/posts/a.fr.md", { source: "suffix", rawValue: "fr" }),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types)!;
  assert.equal(result.defaultLocale, "en");
});

test("rejects __mdcms_default__ as locale tag", () => {
  const files = [
    makeFile("content/posts/a.md", {
      source: "frontmatter",
      rawValue: "__mdcms_default__",
    }),
    makeFile("content/posts/b.md", {
      source: "frontmatter",
      rawValue: "en",
    }),
  ];
  const types = [makeType("post", "content/posts")];

  const result = detectLocaleConfig(files, types);
  // Should ignore the reserved token, only en detected = single locale = null
  assert.equal(result, null);
});

test("mixed localized and non-localized types", () => {
  const files = [
    makeFile("content/posts/a.en.md", { source: "suffix", rawValue: "en" }),
    makeFile("content/posts/a.fr.md", { source: "suffix", rawValue: "fr" }),
    makeFile("content/authors/jane.md", null),
  ];
  const types = [
    makeType("post", "content/posts"),
    makeType("author", "content/authors"),
  ];

  const result = detectLocaleConfig(files, types)!;
  assert.ok(result);
  assert.equal(types[0]!.localized, true);
  assert.equal(types[1]!.localized, false);
});
