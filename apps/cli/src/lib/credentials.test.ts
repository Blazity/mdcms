import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  createCredentialStore,
  createFileCredentialStore,
  resolveCredentialsFilePath,
} from "./credentials.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "mdcms-cli-credentials-"));

  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("file credential store persists tuple-scoped profile with 0600 permissions", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, ".mdcms", "credentials.json");
    const store = createFileCredentialStore({ filePath });
    const tuple = {
      serverUrl: "http://localhost:4000",
      project: "marketing-site",
      environment: "staging",
    };

    await store.setProfile(tuple, {
      authMode: "api_key",
      apiKey: "mdcms_key_test",
      apiKeyId: "key-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const saved = await store.getProfile(tuple);
    assert.ok(saved);
    assert.equal(saved?.apiKey, "mdcms_key_test");
    assert.equal(saved?.apiKeyId, "key-1");

    const mode = (await stat(filePath)).mode & 0o777;
    assert.equal(mode, 0o600);

    const deleted = await store.deleteProfile(tuple);
    assert.equal(deleted, true);
    const afterDelete = await store.getProfile(tuple);
    assert.equal(afterDelete, undefined);
  });
});

test("credential store fallback file path is used when OS keychain is unavailable", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, ".mdcms", "credentials.json");
    const store = createCredentialStore({
      filePath,
      commandRunner: () => ({
        ok: false,
        stdout: "",
        stderr: "not available",
        code: null,
      }),
    });
    const tuple = {
      serverUrl: "http://localhost:4000",
      project: "marketing-site",
      environment: "staging",
    };

    await store.setProfile(tuple, {
      authMode: "api_key",
      apiKey: "mdcms_key_file_fallback",
      apiKeyId: "key-fallback",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payload = JSON.parse(await readFile(filePath, "utf8")) as {
      profiles: Record<string, { apiKey: string }>;
    };
    const storedApiKeys = Object.values(payload.profiles).map(
      (row) => row.apiKey,
    );
    assert.equal(storedApiKeys.includes("mdcms_key_file_fallback"), true);
  });
});

test("credential store rejects malformed JSON payload", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, ".mdcms", "credentials.json");
    await mkdir(join(dir, ".mdcms"), { recursive: true });
    await writeFile(filePath, "{not-json", "utf8");
    const store = createFileCredentialStore({ filePath });

    await assert.rejects(
      () =>
        store.getProfile({
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
        }),
      /Credential store JSON is malformed/,
    );
  });
});

test("resolveCredentialsFilePath defaults under home directory", () => {
  const path = resolveCredentialsFilePath({
    HOME: "/tmp/mdcms-home",
  } as NodeJS.ProcessEnv);

  assert.equal(path, "/tmp/mdcms-home/.mdcms/credentials.json");
});
