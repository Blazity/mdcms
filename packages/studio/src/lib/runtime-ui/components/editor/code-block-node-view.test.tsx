import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CodeBlockLanguageSelect } from "./code-block-node-view.js";

test("CodeBlockLanguageSelect renders 'Plain text' when language is null", () => {
  const markup = renderToStaticMarkup(
    createElement(CodeBlockLanguageSelect, {
      language: null,
      onChange: () => {},
      disabled: false,
    }),
  );

  assert.match(markup, /data-mdcms-code-block-language-select/);
  assert.match(markup, /Plain text/);
  assert.doesNotMatch(markup, /data-unknown-language/);
});

test("CodeBlockLanguageSelect renders known language label", () => {
  const markup = renderToStaticMarkup(
    createElement(CodeBlockLanguageSelect, {
      language: "typescript",
      onChange: () => {},
      disabled: false,
    }),
  );

  assert.match(markup, /TypeScript/);
  assert.doesNotMatch(markup, /data-unknown-language="true"/);
});

test("CodeBlockLanguageSelect marks unknown language with hint attribute", () => {
  const markup = renderToStaticMarkup(
    createElement(CodeBlockLanguageSelect, {
      language: "brainfuck",
      onChange: () => {},
      disabled: false,
    }),
  );

  assert.match(markup, /brainfuck/);
  assert.match(markup, /data-unknown-language="true"/);
});

test("CodeBlockLanguageSelect forwards disabled state to the trigger", () => {
  const markup = renderToStaticMarkup(
    createElement(CodeBlockLanguageSelect, {
      language: null,
      onChange: () => {},
      disabled: true,
    }),
  );

  assert.match(markup, /data-mdcms-code-block-language-select/);
  assert.match(markup, /disabled/);
});
