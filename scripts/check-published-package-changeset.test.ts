import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  discoverPublishedPackages,
  evaluateChangesetGate,
  readChangedFiles,
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
  options?: { changesetGate?: Record<string, unknown> },
) {
  const fullRoot = join(rootDir, packageRoot);
  mkdirSync(join(fullRoot, "src"), { recursive: true });
  writeJson(join(fullRoot, "package.json"), packageJson);
  if (options?.changesetGate) {
    writeJson(join(fullRoot, ".changeset-gate.json"), options.changesetGate);
  }
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runGit(rootDir: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}

describe("discoverPublishedPackages", () => {
  test("loads publishable workspaces and excludes private or ignored packages", () => {
    withWorkspace((rootDir) => {
      expect(discoverPublishedPackages(rootDir)).toEqual([
        { name: "@mdcms/cli", root: "apps/cli", unpublishedSources: [] },
        { name: "@mdcms/sdk", root: "packages/sdk", unpublishedSources: [] },
      ]);
    });
  });

  test("reads unpublishedSources from each package's .changeset-gate.json", () => {
    withWorkspace((rootDir) => {
      writePackage(
        rootDir,
        "packages/studio",
        { name: "@mdcms/studio", version: "0.1.0" },
        {
          changesetGate: {
            unpublishedSources: [
              "src/lib/runtime-ui/components",
              "./src/lib/remote-module.ts",
            ],
          },
        },
      );

      expect(discoverPublishedPackages(rootDir)).toEqual([
        { name: "@mdcms/cli", root: "apps/cli", unpublishedSources: [] },
        { name: "@mdcms/sdk", root: "packages/sdk", unpublishedSources: [] },
        {
          name: "@mdcms/studio",
          root: "packages/studio",
          // Paths are normalized so config authors can write either form.
          unpublishedSources: [
            "src/lib/runtime-ui/components",
            "src/lib/remote-module.ts",
          ],
        },
      ]);
    });
  });

  test("fails explicitly when a package's .changeset-gate.json is malformed", () => {
    withWorkspace((rootDir) => {
      writePackage(
        rootDir,
        "packages/studio",
        { name: "@mdcms/studio", version: "0.1.0" },
        {
          changesetGate: {
            unpublishedSources: "src/lib/runtime-ui/components",
          },
        },
      );

      expect(() => discoverPublishedPackages(rootDir)).toThrow(
        /Invalid JSON shape in packages\/studio\/\.changeset-gate\.json/,
      );
    });
  });

  test("fails explicitly when root package.json workspaces are malformed", () => {
    withWorkspace((rootDir) => {
      writeJson(join(rootDir, "package.json"), {
        private: true,
        workspaces: [42],
      });

      expect(() => discoverPublishedPackages(rootDir)).toThrow(
        /Invalid JSON shape in package\.json/,
      );
    });
  });

  test("fails explicitly when changeset ignore config is malformed", () => {
    withWorkspace((rootDir) => {
      writeJson(join(rootDir, ".changeset/config.json"), {
        ignore: "@mdcms/server",
      });

      expect(() => discoverPublishedPackages(rootDir)).toThrow(
        /Invalid JSON shape in \.changeset\/config\.json/,
      );
    });
  });
});

describe("readChangedFiles", () => {
  test("includes deleted files in the diff result", () => {
    withWorkspace((rootDir) => {
      runGit(rootDir, ["init"]);
      runGit(rootDir, ["config", "user.email", "test@example.com"]);
      runGit(rootDir, ["config", "user.name", "Test User"]);

      const sourcePath = join(rootDir, "packages/sdk/src/index.ts");
      writeFileSync(sourcePath, "export const value = 1;\n", "utf8");
      runGit(rootDir, ["add", "."]);
      runGit(rootDir, ["commit", "-m", "initial"]);
      const base = runGit(rootDir, ["rev-parse", "HEAD"]);

      rmSync(sourcePath);
      runGit(rootDir, ["add", "-A"]);
      runGit(rootDir, ["commit", "-m", "delete source"]);

      expect(readChangedFiles(rootDir, base, "HEAD")).toEqual([
        "packages/sdk/src/index.ts",
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

  test("ignores files under a package's declared unpublishedSources", () => {
    withWorkspace((rootDir) => {
      writePackage(
        rootDir,
        "packages/studio",
        { name: "@mdcms/studio", version: "0.1.0" },
        {
          changesetGate: {
            unpublishedSources: ["src/lib/runtime-ui/components"],
          },
        },
      );

      const result = evaluateChangesetGate({
        changedFiles: [
          "packages/studio/src/lib/runtime-ui/components/editor/editor.tsx",
          "packages/studio/src/lib/runtime-ui/components/editor/editor.test.tsx",
        ],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(true);
      expect(result.changedPackages).toEqual([]);
    });
  });

  test("still requires a changeset for sibling published source files", () => {
    // A change inside the unpublished prefix is fine; a change just outside
    // it must still trip the gate so the exclusion stays narrow rather
    // than swallowing edits to genuinely-published code under the same
    // package.
    withWorkspace((rootDir) => {
      writePackage(
        rootDir,
        "packages/studio",
        { name: "@mdcms/studio", version: "0.1.0" },
        {
          changesetGate: {
            unpublishedSources: ["src/lib/runtime-ui/components"],
          },
        },
      );

      const result = evaluateChangesetGate({
        changedFiles: [
          "packages/studio/src/lib/runtime-ui/adapters/next-themes.tsx",
        ],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(false);
      expect(result.changedPackages).toEqual([
        {
          name: "@mdcms/studio",
          root: "packages/studio",
          files: [
            "packages/studio/src/lib/runtime-ui/adapters/next-themes.tsx",
          ],
        },
      ]);
    });
  });

  test("never excludes the published package manifest, even with unpublished overlap", () => {
    // The package.json itself controls exports/version/dependencies, so it
    // must always require a changeset regardless of any path-prefix
    // exclusions configured inside the package.
    withWorkspace((rootDir) => {
      writePackage(
        rootDir,
        "packages/studio",
        { name: "@mdcms/studio", version: "0.1.0" },
        { changesetGate: { unpublishedSources: ["src"] } },
      );

      const result = evaluateChangesetGate({
        changedFiles: ["packages/studio/package.json"],
        packages: discoverPublishedPackages(rootDir),
      });

      expect(result.ok).toBe(false);
      expect(result.changedPackages).toEqual([
        {
          name: "@mdcms/studio",
          root: "packages/studio",
          files: ["packages/studio/package.json"],
        },
      ]);
    });
  });
});
