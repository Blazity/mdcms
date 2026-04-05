import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "./page";

test("review home page links to scenario-based Studio routes", () => {
  const markup = renderToStaticMarkup(<HomePage />);

  assert.match(markup, /\/review\/editor\/admin/);
  assert.match(markup, /\/review\/owner\/admin/);
  assert.match(markup, /Studio Review/);
});
