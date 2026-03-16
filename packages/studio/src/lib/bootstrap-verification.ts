import { createHash } from "node:crypto";

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
} from "./build-runtime.js";

export type StudioRuntimePublicationVerificationInput = {
  manifest: StudioBootstrapManifest;
  runtimeBytes: Uint8Array;
  compatibility: StudioBootstrapCompatibilityOptions;
};

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertStudioRuntimePublication(
  input: StudioRuntimePublicationVerificationInput,
): void {
  assertStudioBootstrapManifest(
    input.manifest,
    "studioRuntimePublication.manifest",
  );
  assertStudioBootstrapCompatibility(input.manifest, input.compatibility);

  const actualIntegrity = sha256Hex(input.runtimeBytes);

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
