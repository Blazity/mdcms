import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import {
  EXTENSIBILITY_API_VERSION,
  assertStudioBootstrapManifest,
  type StudioBootstrapManifest,
  type StudioExecutionMode,
} from "@mdcms/shared";
import postcss from "postcss";

import {
  createDeterministicPlaceholderKeyId,
  createDeterministicPlaceholderSignature,
} from "./runtime-placeholder.js";

type BunBuildResult = {
  success: boolean;
  outputs?: readonly BunBuildOutput[];
  logs?: readonly unknown[];
};

type BunBuildOutput = {
  kind: string;
  path: string;
  text: () => Promise<string>;
};

type BunBuildRuntime = {
  build: (options: {
    entrypoints: string[];
    format: "esm";
    target: "browser";
    splitting: boolean;
    sourcemap: "none";
    minify: boolean;
    write: false;
  }) => Promise<BunBuildResult>;
};

declare const Bun: BunBuildRuntime;

export const STUDIO_RUNTIME_ASSETS_DIRNAME = "assets";
export const STUDIO_RUNTIME_BOOTSTRAP_DIRNAME = "bootstrap";
export const STUDIO_RUNTIME_LATEST_BOOTSTRAP_FILE = "latest.json";
export const STUDIO_RUNTIME_ENTRY_BASENAME = "studio-runtime";
export const STUDIO_RUNTIME_ENTRY_EXTENSION = ".mjs";
export const STUDIO_RUNTIME_STYLESHEET_EXTENSION = ".css";
export const STUDIO_RUNTIME_DEFAULT_ASSETS_BASE_PATH = "/api/v1/studio/assets";
export const STUDIO_RUNTIME_DEFAULT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";

export type BuildStudioRuntimeArtifactsOptions = {
  projectRoot?: string;
  sourceFile?: string;
  outDir?: string;
  assetsBasePath?: string;
  mode?: StudioExecutionMode;
  studioVersion?: string;
  minStudioPackageVersion?: string;
  minHostBridgeVersion?: string;
  expiresAt?: string;
};

export type StudioRuntimeBuildResult = {
  buildId: string;
  entryFile: string;
  entryPath: string;
  cssFile: string;
  cssPath: string;
  entryUrl: string;
  integritySha256: string;
  manifest: StudioBootstrapManifest;
  bootstrapPath: string;
};

function normalizeMode(mode: string | undefined): StudioExecutionMode {
  return "module";
}

function normalizeAssetsBasePath(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return STUDIO_RUNTIME_DEFAULT_ASSETS_BASE_PATH;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomicUtf8File(
  path: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

export function createStudioRuntimeEntryUrl(input: {
  assetsBasePath: string;
  buildId: string;
  entryFile: string;
}): string {
  const normalizedBasePath = normalizeAssetsBasePath(input.assetsBasePath);
  return `${normalizedBasePath}/${input.buildId}/${input.entryFile}`;
}

function createRuntimeEntryFileName(buildId: string): string {
  return `${STUDIO_RUNTIME_ENTRY_BASENAME}.${buildId}${STUDIO_RUNTIME_ENTRY_EXTENSION}`;
}

function createRuntimeStylesheetFileName(buildId: string): string {
  return `${STUDIO_RUNTIME_ENTRY_BASENAME}.${buildId}${STUDIO_RUNTIME_STYLESHEET_EXTENSION}`;
}

function resolveDefaultStudioProjectRoot(): string {
  // Keep this lazy so importing `@mdcms/studio` in a host app does not
  // evaluate build-only path resolution during module initialization.
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function formatBuildErrorDetails(logs: readonly unknown[] | undefined): string {
  if (!logs || logs.length === 0) {
    return "Unknown build error.";
  }

  return logs
    .map((log, index) => {
      if (typeof log === "string") {
        return log;
      }

      if (
        typeof log === "object" &&
        log !== null &&
        "message" in log &&
        typeof (log as { message: unknown }).message === "string"
      ) {
        return (log as { message: string }).message;
      }

      return `log[${index}]`;
    })
    .join("; ");
}

async function bundleRuntimeEntry(input: {
  sourceFile: string;
}): Promise<string> {
  const buildResult = await Bun.build({
    entrypoints: [input.sourceFile],
    format: "esm",
    target: "browser",
    splitting: false,
    sourcemap: "none",
    minify: false,
    write: false,
  });

  if (!buildResult.success) {
    throw new Error(
      `Studio runtime bundle failed for ${input.sourceFile}: ${formatBuildErrorDetails(buildResult.logs)}`,
    );
  }

  const entryOutput =
    buildResult.outputs?.find((output) => output.kind === "entry-point") ??
    buildResult.outputs?.[0];

  if (!entryOutput) {
    throw new Error(
      `Studio runtime bundle did not produce output for ${input.sourceFile}.`,
    );
  }

  return await entryOutput.text();
}

async function compileRuntimeStylesheet(input: {
  projectRoot: string;
}): Promise<string> {
  const stylesheetSourcePath = join(
    input.projectRoot,
    "src/lib/runtime-ui/styles.css",
  );
  const stylesheetSource = await readFile(stylesheetSourcePath, "utf8");
  const result = await postcss([tailwindcss()]).process(stylesheetSource, {
    from: stylesheetSourcePath,
  });

  return result.css;
}

export async function buildStudioRuntimeArtifacts(
  options: BuildStudioRuntimeArtifactsOptions = {},
): Promise<StudioRuntimeBuildResult> {
  const projectRoot = options.projectRoot ?? resolveDefaultStudioProjectRoot();
  const sourceFile = resolve(
    options.sourceFile ?? join(projectRoot, "src/lib/remote-module.ts"),
  );
  const outDir = options.outDir ?? join(projectRoot, "dist");
  const assetsBasePath = normalizeAssetsBasePath(
    options.assetsBasePath ?? STUDIO_RUNTIME_DEFAULT_ASSETS_BASE_PATH,
  );
  const mode = normalizeMode(options.mode ?? process.env.STUDIO_RUNTIME_MODE);
  const studioVersion =
    options.studioVersion ?? (process.env.APP_VERSION?.trim() || "0.0.0");

  const bundledEntry = await bundleRuntimeEntry({
    sourceFile,
  });
  const entryBytes = new TextEncoder().encode(bundledEntry);
  const integritySha256 = sha256Hex(entryBytes);
  const buildId = integritySha256.slice(0, 16);
  const entryFile = createRuntimeEntryFileName(buildId);

  const entryPath = join(
    outDir,
    STUDIO_RUNTIME_ASSETS_DIRNAME,
    buildId,
    entryFile,
  );
  await mkdir(dirname(entryPath), { recursive: true });
  await writeFile(entryPath, bundledEntry, "utf8");

  const cssFile = createRuntimeStylesheetFileName(buildId);
  const cssPath = join(outDir, STUDIO_RUNTIME_ASSETS_DIRNAME, buildId, cssFile);
  const compiledStylesheet = await compileRuntimeStylesheet({
    projectRoot,
  });
  await writeFile(cssPath, compiledStylesheet, "utf8");

  const entryUrl = createStudioRuntimeEntryUrl({
    assetsBasePath,
    buildId,
    entryFile,
  });

  const manifest: StudioBootstrapManifest = {
    apiVersion: EXTENSIBILITY_API_VERSION,
    studioVersion,
    mode,
    entryUrl,
    integritySha256,
    signature: createDeterministicPlaceholderSignature(buildId),
    keyId: createDeterministicPlaceholderKeyId(buildId),
    buildId,
    minStudioPackageVersion: options.minStudioPackageVersion ?? "0.0.1",
    minHostBridgeVersion: options.minHostBridgeVersion ?? "1.0.0",
    expiresAt: options.expiresAt ?? STUDIO_RUNTIME_DEFAULT_EXPIRES_AT,
  };

  assertStudioBootstrapManifest(manifest, "studioRuntime.manifest");

  const bootstrapPath = join(
    outDir,
    STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
    `${buildId}.json`,
  );
  const latestBootstrapPath = join(
    outDir,
    STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
    STUDIO_RUNTIME_LATEST_BOOTSTRAP_FILE,
  );
  await mkdir(dirname(bootstrapPath), { recursive: true });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(bootstrapPath, manifestJson, "utf8");
  await writeAtomicUtf8File(latestBootstrapPath, manifestJson);

  return {
    buildId,
    entryFile,
    entryPath,
    cssFile,
    cssPath,
    entryUrl,
    integritySha256,
    manifest,
    bootstrapPath,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];

  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

if (isMainModule()) {
  buildStudioRuntimeArtifacts()
    .then((result) => {
      console.info(
        `[studio-runtime] built ${result.entryFile} (${result.buildId}) -> ${result.bootstrapPath}`,
      );
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(`[studio-runtime] build failed: ${message}`);
      process.exitCode = 1;
    });
}
