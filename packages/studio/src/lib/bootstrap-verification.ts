import {
  RuntimeError,
  assertStudioBootstrapCompatibility,
  assertStudioBootstrapManifest,
  type StudioBootstrapCompatibilityOptions,
  type StudioBootstrapManifest,
} from "@mdcms/shared";

import {
  createDeterministicPlaceholderKeyId,
  createDeterministicPlaceholderSignature,
} from "./runtime-placeholder.js";

export type StudioRuntimePublicationVerificationInput = {
  manifest: StudioBootstrapManifest;
  runtimeBytes: Uint8Array;
  compatibility: StudioBootstrapCompatibilityOptions;
};

async function sha256Hex(value: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new RuntimeError({
      code: "STUDIO_RUNTIME_INTEGRITY_UNAVAILABLE",
      message:
        "Studio runtime integrity verification requires Web Crypto support.",
      statusCode: 500,
    });
  }

  const digestBytes = new Uint8Array(value.byteLength);
  digestBytes.set(value);

  const digest = await globalThis.crypto.subtle.digest("SHA-256", digestBytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function assertStudioRuntimePublication(
  input: StudioRuntimePublicationVerificationInput,
): Promise<void> {
  assertStudioBootstrapManifest(
    input.manifest,
    "studioRuntimePublication.manifest",
  );
  assertStudioBootstrapCompatibility(input.manifest, input.compatibility);

  const actualIntegrity = await sha256Hex(input.runtimeBytes);

  if (actualIntegrity !== input.manifest.integritySha256) {
    throw new RuntimeError({
      code: "STUDIO_RUNTIME_INTEGRITY_MISMATCH",
      message:
        "studioRuntimePublication.manifest.integritySha256 does not match the runtime asset bytes.",
      statusCode: 500,
      details: {
        expectedIntegritySha256: input.manifest.integritySha256,
        actualIntegritySha256: actualIntegrity,
      },
    });
  }

  const expectedSignature = createDeterministicPlaceholderSignature(
    input.manifest.buildId,
  );

  if (input.manifest.signature !== expectedSignature) {
    throw new RuntimeError({
      code: "INVALID_STUDIO_RUNTIME_SIGNATURE",
      message:
        "studioRuntimePublication.manifest.signature does not match the expected placeholder signature for this build.",
      statusCode: 500,
      details: {
        buildId: input.manifest.buildId,
        expectedSignature,
        actualSignature: input.manifest.signature,
      },
    });
  }

  const expectedKeyId = createDeterministicPlaceholderKeyId(
    input.manifest.buildId,
  );

  if (input.manifest.keyId !== expectedKeyId) {
    throw new RuntimeError({
      code: "INVALID_STUDIO_RUNTIME_KEY_ID",
      message:
        "studioRuntimePublication.manifest.keyId does not match the expected placeholder key id for this build.",
      statusCode: 500,
      details: {
        buildId: input.manifest.buildId,
        expectedKeyId,
        actualKeyId: input.manifest.keyId,
      },
    });
  }
}
