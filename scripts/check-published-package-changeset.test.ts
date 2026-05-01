import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  discoverPublishedPackages,
  evaluateChangesetGate,
} from "./check-published-package-changeset.js";

function withWorkspace(callback: (rootDir: string) => void) {
  const rootDir = mkdtempSync(join(tmpdir(), "mdcms-changeset-check-"));

  try {
    writeJson(join(rootDir, "package.json"), {
      private: true,
      workspaces: ["apps/*", "packages/*"],
    });
    mkdirSync(join(rootDir, ".changeset"), { recursive: true });
    writeJson(join(rootDir, ".changeset/config.json"), {
      ignore: ["@mdcms/server"],
    });

    writePackage(rootDir, "apps/cli", {
      name: "@mdcms/cli",
      version: "0.1.0",
    });
    writePackage(rootDir, "apps/server", {
      name: "@mdcms/server",
      version: "0.1.0",
      private: true,
    });
    writePackage(rootDir, "packages/sdk", {
      name: "@mdcms/sdk",
      version: "0.1.0",
    });

    callback(rootDir);
  } finally {
    rmSync(rootDir, { force: true, recursive: true });
  }
}

function writePackage(
  rootDir: string,
  packageRoot: string,
  packageJson: Record<string, unknown>,
) {
  const fullRoot = join(rootDir, packageRoot);
  mkdirSync(join(fullRoot, "src"), { recursive: true });
  writeJson(join(fullRoot, "package.json"), packageJson);
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("discoverPublishedPackages", () => {
  test("loads publishable workspaces and excludes private or ignored packages", () => {
    withWorkspace((rootDir) => {
      expect(discoverPublishedPackages(rootDir)).toEqual([
        { name: "@mdcms/cli", root: "apps/cli" },
        { name: "@mdcms/sdk", root: "packages/sdk" },
      ]);
    });
  });
});

describe("evaluateChangesetGate", () => {
  test("requires a changeset for published package source changes", () => {
    withWorkspace((rootDir) => {
      const result = evaluateChangesetGate({
        changedFiles: ["packages/sdk/src/index.ts"],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(false);
      expect(result.changedPackages).toEqual([
        {
          name: "@mdcms/sdk",
          root: "packages/sdk",
          files: ["packages/sdk/src/index.ts"],
        },
      ]);
    });
  });

  test("accepts published package source changes when a changeset is present", () => {
    withWorkspace((rootDir) => {
      const result = evaluateChangesetGate({
        changedFiles: [
          "packages/sdk/src/index.ts",
          ".changeset/fresh-planets.md",
        ],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(true);
    });
  });

  test("ignores private package source changes", () => {
    withWorkspace((rootDir) => {
      const result = evaluateChangesetGate({
        changedFiles: ["apps/server/src/index.ts"],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(true);
    });
  });

  test("ignores non-source files in published packages", () => {
    withWorkspace((rootDir) => {
      const result = evaluateChangesetGate({
        changedFiles: ["packages/sdk/README.md"],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(true);
    });
  });

  test("requires a changeset for published package manifest changes", () => {
    withWorkspace((rootDir) => {
      const result = evaluateChangesetGate({
        changedFiles: ["apps/cli/package.json"],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(false);
      expect(result.changedPackages).toEqual([
        {
          name: "@mdcms/cli",
          root: "apps/cli",
          files: ["apps/cli/package.json"],
        },
      ]);
    });
  });
});
