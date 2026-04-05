import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>;
};

test("studio review dev script builds runtime artifacts and keeps a runtime watcher running", () => {
  const devScript = packageJson.scripts?.dev ?? "";

  assert.match(devScript, /scripts\/build-review-runtime\.ts/);
  assert.match(devScript, /scripts\/dev-runtime-watch\.ts/);
  assert.match(devScript, /next dev --hostname/);
  assert.doesNotMatch(devScript, /--port/);
});
