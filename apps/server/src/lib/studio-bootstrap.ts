import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import {
  assertStudioBootstrapManifest,
  type StudioBootstrapReadyResponse,
  type StudioBootstrapRejectionReason,
  type StudioBootstrapManifest,
} from "@mdcms/shared";
import {
  STUDIO_RUNTIME_ASSETS_DIRNAME,
  STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
  STUDIO_RUNTIME_LATEST_BOOTSTRAP_FILE,
  buildStudioRuntimeArtifacts,
  type BuildStudioRuntimeArtifactsOptions,
} from "@mdcms/studio/build-runtime";

export const STUDIO_RUNTIME_MVP_MODE = "module" as const;

export type CreateStudioRuntimePublicationOptions =
  BuildStudioRuntimeArtifactsOptions;

export type StudioRuntimeAsset = {
  absolutePath: string;
  contentType: string;
  body: Uint8Array;
};

export type StudioRuntimePublication = {
  buildId: string;
  entryFile: string;
  manifest: StudioBootstrapManifest;
  getAsset: (input: {
    buildId: string;
    assetPath: string;
  }) => Promise<StudioRuntimeAsset | undefined>;
};

export type StudioRuntimePublicationSelection = {
  active: StudioRuntimePublication;
  lastKnownGood?: StudioRuntimePublication;
};

export type StudioRuntimePublicationInput =
  | StudioRuntimePublication
  | StudioRuntimePublicationSelection;

export type StudioBootstrapRetryContext = {
  rejectedBuildId: string;
  rejectionReason: StudioBootstrapRejectionReason;
};

function normalizeAssetPath(assetPath: string): string | undefined {
  const segments = assetPath
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.length === 0) {
    return undefined;
  }

  if (segments.includes("..")) {
    return undefined;
  }

  return segments.join("/");
}

function isPathInsideRoot(rootDir: string, absolutePath: string): boolean {
  const relativePath = relative(rootDir, absolutePath);

  if (relativePath.length === 0) {
    return true;
  }

  if (relativePath.startsWith("..")) {
    return false;
  }

  if (isAbsolute(relativePath)) {
    return false;
  }

  return true;
}

function isPublicationSelection(
  publication: StudioRuntimePublicationInput,
): publication is StudioRuntimePublicationSelection {
  return "active" in publication;
}

function resolveContentType(assetPath: string): string {
  const extension = extname(assetPath).toLowerCase();

  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "text/javascript; charset=utf-8";
  }

  if (extension === ".map" || extension === ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }

  if (extension === ".woff2") {
    return "font/woff2";
  }

  if (extension === ".woff") {
    return "font/woff";
  }

  return "application/octet-stream";
}

function createFileBackedStudioRuntimePublication(input: {
  manifest: StudioBootstrapManifest;
  outDir: string;
}): StudioRuntimePublication {
  const buildRoot = join(
    input.outDir,
    STUDIO_RUNTIME_ASSETS_DIRNAME,
    input.manifest.buildId,
  );
  const entryFile = basename(
    new URL(input.manifest.entryUrl, "http://localhost").pathname,
  );

  return {
    buildId: input.manifest.buildId,
    entryFile,
    manifest: input.manifest,
    getAsset: async ({ buildId, assetPath }) => {
      if (buildId !== input.manifest.buildId) {
        return undefined;
      }

      const normalizedAssetPath = normalizeAssetPath(assetPath);

      if (!normalizedAssetPath) {
        return undefined;
      }

      const absolutePath = resolve(buildRoot, normalizedAssetPath);

      if (!isPathInsideRoot(buildRoot, absolutePath)) {
        return undefined;
      }

      try {
        const metadata = await stat(absolutePath);

        if (!metadata.isFile()) {
          return undefined;
        }

        const body = await readFile(absolutePath);

        return {
          absolutePath,
          contentType: resolveContentType(normalizedAssetPath),
          body,
        };
      } catch {
        return undefined;
      }
    },
  };
}

function readLatestStudioRuntimeManifest(
  outDir: string,
): StudioBootstrapManifest | undefined {
  const manifestPath = join(
    outDir,
    STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
    STUDIO_RUNTIME_LATEST_BOOTSTRAP_FILE,
  );

  try {
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as StudioBootstrapManifest;
    assertStudioBootstrapManifest(manifest, "studioRuntimePublication.latest");
    return manifest;
  } catch {
    return undefined;
  }
}

export async function createStudioRuntimePublication(
  options: CreateStudioRuntimePublicationOptions = {},
): Promise<StudioRuntimePublication> {
  const buildResult = await buildStudioRuntimeArtifacts({
    ...options,
    mode: STUDIO_RUNTIME_MVP_MODE,
  });

  const manifest: StudioBootstrapManifest = {
    ...buildResult.manifest,
    mode: STUDIO_RUNTIME_MVP_MODE,
  };
  assertStudioBootstrapManifest(manifest, "studioRuntimePublication.manifest");
  const outDir = resolve(dirname(buildResult.bootstrapPath), "..");

  return createFileBackedStudioRuntimePublication({
    manifest,
    outDir,
  });
}

export async function createRefreshingStudioRuntimePublicationSelection(
  options: CreateStudioRuntimePublicationOptions = {},
): Promise<StudioRuntimePublicationSelection> {
  const initialBuild = await buildStudioRuntimeArtifacts({
    ...options,
    mode: STUDIO_RUNTIME_MVP_MODE,
  });
  const initialManifest: StudioBootstrapManifest = {
    ...initialBuild.manifest,
    mode: STUDIO_RUNTIME_MVP_MODE,
  };
  assertStudioBootstrapManifest(
    initialManifest,
    "studioRuntimePublication.manifest",
  );
  const outDir = resolve(dirname(initialBuild.bootstrapPath), "..");
  let active = createFileBackedStudioRuntimePublication({
    manifest: initialManifest,
    outDir,
  });
  let lastKnownGood: StudioRuntimePublication | undefined;

  const refresh = () => {
    const latestManifest = readLatestStudioRuntimeManifest(outDir);

    if (!latestManifest || latestManifest.buildId === active.buildId) {
      return;
    }

    lastKnownGood = active;
    active = createFileBackedStudioRuntimePublication({
      manifest: latestManifest,
      outDir,
    });
  };

  return {
    get active() {
      refresh();
      return active;
    },
    get lastKnownGood() {
      refresh();
      return lastKnownGood;
    },
  };
}

export function normalizeStudioRuntimePublication(
  publication?: StudioRuntimePublicationInput,
): StudioRuntimePublicationSelection | undefined {
  if (!publication) {
    return undefined;
  }

  if (isPublicationSelection(publication)) {
    return {
      active: publication.active,
      lastKnownGood: publication.lastKnownGood,
    };
  }

  return { active: publication };
}

export function resolveStudioRuntimePublicationByBuildId(
  publication: StudioRuntimePublicationInput | undefined,
  buildId: string,
): StudioRuntimePublication | undefined {
  const selection = normalizeStudioRuntimePublication(publication);

  if (!selection) {
    return undefined;
  }

  if (selection.active.buildId === buildId) {
    return selection.active;
  }

  if (selection.lastKnownGood?.buildId === buildId) {
    return selection.lastKnownGood;
  }

  return undefined;
}

export function selectStudioBootstrapReadyResponse(
  publication: StudioRuntimePublicationInput | undefined,
  recovery?: StudioBootstrapRetryContext,
): StudioBootstrapReadyResponse | undefined {
  const selection = normalizeStudioRuntimePublication(publication);

  if (!selection) {
    return undefined;
  }

  if (
    recovery &&
    selection.active.buildId === recovery.rejectedBuildId &&
    selection.lastKnownGood
  ) {
    return {
      data: {
        status: "ready",
        source: "lastKnownGood",
        manifest: selection.lastKnownGood.manifest,
        recovery,
      },
    };
  }

  if (recovery && selection.active.buildId === recovery.rejectedBuildId) {
    return undefined;
  }

  return {
    data: {
      status: "ready",
      source: "active",
      manifest: selection.active.manifest,
    },
  };
}
