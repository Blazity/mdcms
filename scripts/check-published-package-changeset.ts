#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

export interface PublishedPackage {
  name: string;
  root: string;
  // Path prefixes (relative to the package root, e.g. `src/lib/runtime-ui`)
  // that ship inside the package's `dist/` but are not reachable through
  // any of its published `exports`. Edits to these paths don't affect what
  // npm consumers can import, so they don't require a changeset. Sourced
  // from the package's own `mdcms.changesetGate.unpublishedSources`.
  unpublishedSources: string[];
}

export interface ChangedPackage {
  name: string;
  root: string;
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

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    private: z.boolean().optional(),
    workspaces: z
      .union([
        z.array(z.string()),
        z.object({ packages: z.array(z.string()) }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();

const changesetGateConfigSchema = z
  .object({
    unpublishedSources: z.array(z.string()).optional(),
  })
  .passthrough();

const changesetConfigSchema = z
  .object({
    ignore: z.array(z.string()).optional(),
  })
  .passthrough();

type PackageJson = z.infer<typeof packageJsonSchema>;
type ChangesetConfig = z.infer<typeof changesetConfigSchema>;
type ChangesetGateConfig = z.infer<typeof changesetGateConfigSchema>;

const CHANGESET_GATE_CONFIG_FILENAME = ".changeset-gate.json";

interface CliOptions {
  base: string;
  head: string;
}

export function discoverPublishedPackages(rootDir: string): PublishedPackage[] {
  const rootPackage = readPackageJson(
    join(rootDir, "package.json"),
    "package.json",
  );
  const ignoredPackages = readIgnoredPackages(rootDir);

  return readWorkspacePatterns(rootPackage)
    .flatMap((pattern) => expandWorkspacePattern(rootDir, pattern))
    .flatMap((packageRoot) => {
      const packageJsonPath = join(rootDir, packageRoot, "package.json");

      if (!existsSync(packageJsonPath)) {
        return [];
      }

      const packageJson = readPackageJson(
        packageJsonPath,
        `${packageRoot}/package.json`,
      );

      if (
        typeof packageJson.name !== "string" ||
        packageJson.private === true ||
        ignoredPackages.has(packageJson.name)
      ) {
        return [];
      }

      const unpublishedSources = readUnpublishedSources(rootDir, packageRoot);

      return [
        {
          name: packageJson.name,
          root: packageRoot,
          unpublishedSources,
        },
      ];
    })
    .sort((left, right) => left.root.localeCompare(right.root));
}

function readUnpublishedSources(
  rootDir: string,
  packageRoot: string,
): string[] {
  const configPath = join(rootDir, packageRoot, CHANGESET_GATE_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return [];
  }

  const config = readChangesetGateConfig(
    configPath,
    `${packageRoot}/${CHANGESET_GATE_CONFIG_FILENAME}`,
  );

  return (config.unpublishedSources ?? []).map(normalizePath);
}

export function evaluateChangesetGate(input: GateInput): GateResult {
  const changedFiles = input.changedFiles.map(normalizePath).filter(Boolean);
  const changedPackages = input.packages
    .map((publishedPackage) => ({
      name: publishedPackage.name,
      root: publishedPackage.root,
      files: changedFiles.filter((file) =>
        isPublishedSourceChange(
          file,
          publishedPackage.root,
          publishedPackage.unpublishedSources,
        ),
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
    return packageJson.workspaces;
  }

  if (packageJson.workspaces) {
    return packageJson.workspaces.packages;
  }

  return [];
}

function readIgnoredPackages(rootDir: string): Set<string> {
  const configPath = join(rootDir, ".changeset/config.json");

  if (!existsSync(configPath)) {
    return new Set();
  }

  const config = readChangesetConfig(configPath, ".changeset/config.json");

  return new Set(config.ignore ?? []);
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

function isPublishedSourceChange(
  file: string,
  packageRoot: string,
  unpublishedSources: string[],
): boolean {
  if (file === `${packageRoot}/package.json`) {
    return true;
  }

  if (!file.startsWith(`${packageRoot}/src/`)) {
    return false;
  }

  const relative = file.slice(packageRoot.length + 1);

  for (const exclusion of unpublishedSources) {
    if (relative === exclusion || relative.startsWith(`${exclusion}/`)) {
      return false;
    }
  }

  return true;
}

function isChangesetFile(file: string): boolean {
  return (
    file.startsWith(".changeset/") &&
    file.endsWith(".md") &&
    basename(file) !== "README.md"
  );
}

function readPackageJson(path: string, label: string): PackageJson {
  return readValidatedJson(path, label, packageJsonSchema);
}

function readChangesetConfig(path: string, label: string): ChangesetConfig {
  return readValidatedJson(path, label, changesetConfigSchema);
}

function readChangesetGateConfig(
  path: string,
  label: string,
): ChangesetGateConfig {
  return readValidatedJson(path, label, changesetGateConfigSchema);
}

function readValidatedJson<T>(
  path: string,
  label: string,
  schema: z.ZodType<T>,
): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const issuePath = issue.path.join(".") || "(root)";

        return `${issuePath}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid JSON shape in ${label}: ${issues}`);
  }

  return parsed.data;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.?\//, "");
}

export function readChangedFiles(
  rootDir: string,
  base: string,
  head: string,
): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...${head}`, "--"],
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
    "If the changed paths are runtime-only and never reach npm consumers,",
    "list them under `unpublishedSources` in the package's",
    `${CHANGESET_GATE_CONFIG_FILENAME} (sibling to package.json) instead of`,
    "cutting a release.",
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
