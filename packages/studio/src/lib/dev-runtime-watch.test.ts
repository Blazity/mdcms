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

  assert.match(
    devScript,
    /bun x --bun tsc --build tsconfig\.lib\.json --watch --preserveWatchOutput/,
  );
  assert.match(
    devScript,
    /bun --conditions @mdcms\/source src\/lib\/dev-runtime-watch\.ts/,
  );
  assert.doesNotMatch(devScript, /packages\/studio\//);
});
