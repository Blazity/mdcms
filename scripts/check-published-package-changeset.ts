#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export interface PublishedPackage {
  name: string;
  root: string;
}

export interface ChangedPackage extends PublishedPackage {
  files: string[];
}

export interface GateInput {
  changedFiles: string[];
  packages: PublishedPackage[];
}

export interface GateResult {
  ok: boolean;
  changedPackages: ChangedPackage[];
  hasChangeset: boolean;
}

interface PackageJson {
  name?: unknown;
  private?: unknown;
  workspaces?: unknown;
}

interface ChangesetConfig {
  ignore?: unknown;
}

interface CliOptions {
  base: string;
  head: string;
}

export function discoverPublishedPackages(rootDir: string): PublishedPackage[] {
  const rootPackage = readJson<PackageJson>(join(rootDir, "package.json"));
  const ignoredPackages = readIgnoredPackages(rootDir);

  return readWorkspacePatterns(rootPackage)
    .flatMap((pattern) => expandWorkspacePattern(rootDir, pattern))
    .flatMap((packageRoot) => {
      const packageJsonPath = join(rootDir, packageRoot, "package.json");

      if (!existsSync(packageJsonPath)) {
        return [];
      }

      const packageJson = readJson<PackageJson>(packageJsonPath);

      if (
        typeof packageJson.name !== "string" ||
        packageJson.private === true ||
        ignoredPackages.has(packageJson.name)
      ) {
        return [];
      }

      return [{ name: packageJson.name, root: packageRoot }];
    })
    .sort((left, right) => left.root.localeCompare(right.root));
}

export function evaluateChangesetGate(input: GateInput): GateResult {
  const changedFiles = input.changedFiles.map(normalizePath).filter(Boolean);
  const changedPackages = input.packages
    .map((publishedPackage) => ({
      ...publishedPackage,
      files: changedFiles.filter((file) =>
        isPublishedSourceChange(file, publishedPackage.root),
      ),
    }))
    .filter((publishedPackage) => publishedPackage.files.length > 0);
  const hasChangeset = changedFiles.some(isChangesetFile);

  return {
    ok: changedPackages.length === 0 || hasChangeset,
    changedPackages,
    hasChangeset,
  };
}

function readWorkspacePatterns(packageJson: PackageJson): string[] {
  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces.filter(
      (workspace): workspace is string => typeof workspace === "string",
    );
  }

  if (
    packageJson.workspaces &&
    typeof packageJson.workspaces === "object" &&
    "packages" in packageJson.workspaces
  ) {
    const packages = packageJson.workspaces.packages;

    if (Array.isArray(packages)) {
      return packages.filter(
        (workspace): workspace is string => typeof workspace === "string",
      );
    }
  }

  return [];
}

function readIgnoredPackages(rootDir: string): Set<string> {
  const configPath = join(rootDir, ".changeset/config.json");

  if (!existsSync(configPath)) {
    return new Set();
  }

  const config = readJson<ChangesetConfig>(configPath);

  if (!Array.isArray(config.ignore)) {
    return new Set();
  }

  return new Set(
    config.ignore.filter(
      (packageName): packageName is string => typeof packageName === "string",
    ),
  );
}

function expandWorkspacePattern(rootDir: string, pattern: string): string[] {
  const normalizedPattern = normalizePath(pattern);
  const starIndex = normalizedPattern.indexOf("*");

  if (starIndex === -1) {
    return packageRootExists(rootDir, normalizedPattern)
      ? [normalizedPattern]
      : [];
  }

  const prefix = normalizedPattern.slice(0, starIndex);
  const suffix = normalizedPattern.slice(starIndex + 1);
  const directory = join(rootDir, prefix);

  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePath(`${prefix}${entry.name}${suffix}`))
    .filter((packageRoot) => packageRootExists(rootDir, packageRoot));
}

function packageRootExists(rootDir: string, packageRoot: string): boolean {
  return existsSync(join(rootDir, packageRoot, "package.json"));
}

function isPublishedSourceChange(file: string, packageRoot: string): boolean {
  return (
    file === `${packageRoot}/package.json` ||
    file.startsWith(`${packageRoot}/src/`)
  );
}

function isChangesetFile(file: string): boolean {
  return (
    file.startsWith(".changeset/") &&
    file.endsWith(".md") &&
    basename(file) !== "README.md"
  );
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.?\//, "");
}

function readChangedFiles(
  rootDir: string,
  base: string,
  head: string,
): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`, "--"],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Unable to read changed files from git diff: ${result.stderr.trim()}`,
    );
  }

  return result.stdout.split("\n").filter(Boolean);
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    base: process.env.CHANGESET_CHECK_BASE ?? "origin/main",
    head: process.env.CHANGESET_CHECK_HEAD ?? "HEAD",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--base" && value) {
      options.base = value;
      index += 1;
    } else if (arg === "--head" && value) {
      options.head = value;
      index += 1;
    }
  }

  return options;
}

function formatFailure(changedPackages: ChangedPackage[]): string {
  const details = changedPackages
    .map((publishedPackage) => {
      const files = publishedPackage.files
        .map((file) => `    - ${file}`)
        .join("\n");

      return `  - ${publishedPackage.name}\n${files}`;
    })
    .join("\n");

  return [
    "Published package source changed without a changeset.",
    "",
    "Changed published packages:",
    details,
    "",
    "Add a changeset with `bun run changeset` before merging this PR.",
  ].join("\n");
}

function run() {
  const rootDir = process.cwd();
  const options = parseOptions(process.argv.slice(2));
  const packages = discoverPublishedPackages(rootDir);
  const changedFiles = readChangedFiles(rootDir, options.base, options.head);
  const result = evaluateChangesetGate({ changedFiles, packages });

  if (!result.ok) {
    console.error(formatFailure(result.changedPackages));
    process.exit(1);
  }

  if (result.changedPackages.length === 0) {
    console.log("No published package source changes found.");
  } else {
    console.log("Published package source changes include a changeset.");
  }
}

if (import.meta.main) {
  run();
}
