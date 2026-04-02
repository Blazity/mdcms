import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  readSchemaState,
  resolveSchemaStatePath,
  writeSchemaState,
} from "./schema-state.js";

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-schema-state-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("resolveSchemaStatePath returns .mdcms/schema/<project>.<environment>.json", () => {
  const path = resolveSchemaStatePath({
    cwd: "/home/user/project",
    project: "marketing",
    environment: "staging",
  });
  assert.equal(path, "/home/user/project/.mdcms/schema/marketing.staging.json");
});

test("readSchemaState returns undefined when file does not exist", async () => {
  await withTempDir(async (cwd) => {
    const result = await readSchemaState({
      cwd,
      project: "p",
      environment: "e",
    });
    assert.equal(result, undefined);
  });
});

test("writeSchemaState + readSchemaState round-trip", async () => {
  await withTempDir(async (cwd) => {
    const state = {
      schemaHash: "abc123def456",
      syncedAt: "2026-03-31T12:00:00.000Z",
      serverUrl: "http://localhost:4000",
    };
    await writeSchemaState({ cwd, project: "p", environment: "e" }, state);
    const loaded = await readSchemaState({
      cwd,
      project: "p",
      environment: "e",
    });
    assert.deepEqual(loaded, state);
  });
});

test("writeSchemaState creates directory if missing", async () => {
  await withTempDir(async (cwd) => {
    const state = {
      schemaHash: "hash",
      syncedAt: "2026-03-31T12:00:00.000Z",
      serverUrl: "http://localhost:4000",
    };
    await writeSchemaState({ cwd, project: "p", environment: "e" }, state);
    const raw = await readFile(
      join(cwd, ".mdcms", "schema", "p.e.json"),
      "utf8",
    );
    assert.ok(raw.includes('"schemaHash"'));
  });
});

test("writeSchemaState overwrites existing state", async () => {
  await withTempDir(async (cwd) => {
    const scope = { cwd, project: "p", environment: "e" };
    await writeSchemaState(scope, {
      schemaHash: "old",
      syncedAt: "2026-03-31T12:00:00.000Z",
      serverUrl: "http://localhost:4000",
    });
    await writeSchemaState(scope, {
      schemaHash: "new",
      syncedAt: "2026-03-31T13:00:00.000Z",
      serverUrl: "http://localhost:4000",
    });
    const loaded = await readSchemaState(scope);
    assert.equal(loaded?.schemaHash, "new");
  });
});

test("readSchemaState returns undefined for corrupted file", async () => {
  await withTempDir(async (cwd) => {
    const path = resolveSchemaStatePath({
      cwd,
      project: "p",
      environment: "e",
    });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "NOT JSON", "utf8");
    const result = await readSchemaState({
      cwd,
      project: "p",
      environment: "e",
    });
    assert.equal(result, undefined);
  });
});
