import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThemeProvider } from "../../adapters/next-themes.js";
import { ThemePickerMenu } from "./page-header.js";

function renderPicker(): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { attribute: "class", defaultTheme: "system", enableSystem: true },
      createElement(ThemePickerMenu),
    ),
  );
}

test("ThemePickerMenu exposes a trigger with a theme label", () => {
  const markup = renderPicker();

  assert.match(markup, /data-testid="mdcms-theme-picker-trigger"/);
  assert.match(markup, /aria-label="Theme"/);
  assert.match(markup, /Theme<\/span>/);
});
