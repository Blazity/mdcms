import assert from "node:assert/strict";
import { test } from "bun:test";
import { common, createLowlight } from "lowlight";

import {
  COMMON_CODE_BLOCK_LANGUAGES,
  PLAIN_TEXT_LANGUAGE_VALUE,
  getCodeBlockLanguageLabel,
  resolveCodeBlockLanguageChange,
} from "./code-block-languages.js";

test("every curated language id is registered on lowlight's common set", () => {
  const lowlight = createLowlight(common);
  const missing = COMMON_CODE_BLOCK_LANGUAGES.filter(
    (entry) => !lowlight.registered(entry.id),
  );

  assert.deepEqual(missing, []);
});

test("curated language ids are unique", () => {
  const ids = COMMON_CODE_BLOCK_LANGUAGES.map((entry) => entry.id);
  const unique = new Set(ids);

  assert.equal(unique.size, ids.length);
});

test("curated language aliases are unique across the list", () => {
  const aliases = COMMON_CODE_BLOCK_LANGUAGES.flatMap((entry) => entry.aliases);
  const unique = new Set(aliases);

  assert.equal(unique.size, aliases.length);
});

test("getCodeBlockLanguageLabel resolves id, alias, and unknown values", () => {
  assert.equal(getCodeBlockLanguageLabel("typescript"), "TypeScript");
  assert.equal(getCodeBlockLanguageLabel("ts"), "TypeScript");
  assert.equal(getCodeBlockLanguageLabel("kotlin-unknown"), "kotlin-unknown");
  assert.equal(getCodeBlockLanguageLabel(null), "Plain text");
});

test("resolveCodeBlockLanguageChange maps sentinel and real ids to attribute patches", () => {
  assert.deepEqual(
    resolveCodeBlockLanguageChange(PLAIN_TEXT_LANGUAGE_VALUE),
    { language: null },
  );
  assert.deepEqual(resolveCodeBlockLanguageChange("typescript"), {
    language: "typescript",
  });
});
