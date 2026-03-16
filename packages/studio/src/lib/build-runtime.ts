import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  EXTENSIBILITY_API_VERSION,
  assertStudioBootstrapManifest,
  type StudioBootstrapManifest,
  type StudioExecutionMode,
} from "@mdcms/shared";

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
export const STUDIO_RUNTIME_ENTRY_BASENAME = "studio-runtime";
export const STUDIO_RUNTIME_ENTRY_EXTENSION = ".mjs";
export const STUDIO_RUNTIME_DEFAULT_ASSETS_BASE_PATH = "/api/v1/studio/assets";
export const STUDIO_RUNTIME_DEFAULT_EXPIRES_AT = "2099-01-01T00:00:00.000Z";
const DEFAULT_STUDIO_PROJECT_ROOT = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

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
  entryUrl: string;
  integritySha256: string;
  manifest: StudioBootstrapManifest;
  bootstrapPath: string;
};

function normalizeMode(mode: string | undefined): StudioExecutionMode {
  if (mode === "iframe" || mode === "module") {
    return mode;
  }

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

export function createStudioRuntimeEntryUrl(input: {
  assetsBasePath: string;
  buildId: string;
  entryFile: string;
}): string {
  const normalizedBasePath = normalizeAssetsBasePath(input.assetsBasePath);
  return `${normalizedBasePath}/${input.buildId}/${input.entryFile}`;
}

export function createDeterministicPlaceholderSignature(
  buildId: string,
): string {
  return `placeholder-signature-${sha256Hex(`signature:${buildId}`)}`;
}

export function createDeterministicPlaceholderKeyId(buildId: string): string {
  return `placeholder-key-${buildId}`;
}

function createRuntimeEntryFileName(buildId: string): string {
  return `${STUDIO_RUNTIME_ENTRY_BASENAME}.${buildId}${STUDIO_RUNTIME_ENTRY_EXTENSION}`;
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

export async function buildStudioRuntimeArtifacts(
  options: BuildStudioRuntimeArtifactsOptions = {},
): Promise<StudioRuntimeBuildResult> {
  const projectRoot = options.projectRoot ?? DEFAULT_STUDIO_PROJECT_ROOT;
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
  await mkdir(dirname(bootstrapPath), { recursive: true });
  await writeFile(
    bootstrapPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return {
    buildId,
    entryFile,
    entryPath,
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
