import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "./page";

test("home page links to both raw and SDK demo content routes", () => {
  const markup = renderToStaticMarkup(<HomePage />);

  assert.match(markup, /\/demo\/content/);
  assert.match(markup, /\/demo\/sdk-content/);
  assert.match(markup, /Raw Content API/i);
  assert.match(markup, /SDK Client/i);
});
