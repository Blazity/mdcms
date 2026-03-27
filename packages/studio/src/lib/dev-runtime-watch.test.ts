import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>;
};

test("studio dev script runs both TypeScript watch and runtime artifact watch", () => {
  const devScript = packageJson.scripts?.dev ?? "";

  assert.match(devScript, /tsc --build .*--watch/);
  assert.match(devScript, /dev-runtime-watch\.ts/);
});
