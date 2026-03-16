import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertHostBridgeV1,
  assertMdcmsModulePackage,
  assertModuleManifest,
  assertModuleManifestCompatibility,
  assertRemoteStudioModule,
  assertStudioBootstrapCompatibility,
  assertStudioBootstrapManifest,
  assertStudioMountContext,
  isModuleManifest,
  isStudioBootstrapManifest,
  type MdcmsModulePackage,
  type ModuleManifest,
  type StudioBootstrapManifest,
} from "./extensibility.js";

const validAction = {
  id: "content.publish",
  kind: "command" as const,
  method: "POST" as const,
  path: "/api/v1/content/publish",
  permissions: ["content:publish"],
};

const validModuleManifest: ModuleManifest = {
  id: "core.content",
  version: "1.0.0",
  apiVersion: "1",
  kind: "core",
  dependsOn: ["core.auth"],
  minCoreVersion: "1.2.0",
  maxCoreVersion: "2.0.0",
};

const validModulePackage: MdcmsModulePackage = {
  manifest: validModuleManifest,
  server: {
    mount: () => {},
    actions: [validAction],
  },
  cli: {
    actionAliases: [{ alias: "publish", actionId: "content.publish" }],
    outputFormatters: [{ actionId: "content.publish", format: () => "ok" }],
    preflightHooks: [{ id: "ensure-auth", run: async () => {} }],
  },
};

const validStudioBootstrapManifest: StudioBootstrapManifest = {
  apiVersion: "1",
  studioVersion: "0.2.0",
  mode: "module",
  entryUrl: "/api/v1/studio/assets/build-1/main.js",
  integritySha256: "sha256-value",
  signature: "signature-value",
  keyId: "key-1",
  buildId: "build-1",
  minStudioPackageVersion: "0.1.0",
  minHostBridgeVersion: "1.0.0",
  expiresAt: "2026-02-24T00:00:00.000Z",
};

const validHostBridge = {
  version: "1" as const,
  resolveComponent: () => null,
  renderMdxPreview: () => () => {},
};

test("assertModuleManifest and assertMdcmsModulePackage accept valid values", () => {
  assert.doesNotThrow(() => assertModuleManifest(validModuleManifest));
  assert.doesNotThrow(() => assertMdcmsModulePackage(validModulePackage));
});

test("assertModuleManifest rejects unknown fields", () => {
  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        unexpected: true,
      }),
    /unknown field\(s\): unexpected/,
  );
});

test("assertMdcmsModulePackage rejects unknown fields", () => {
  assert.throws(
    () =>
      assertMdcmsModulePackage({
        ...validModulePackage,
        extra: true,
      }),
    /unknown field\(s\): extra/,
  );
});

test("assertModuleManifest rejects invalid dependsOn shapes and duplicates", () => {
  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        dependsOn: "core.auth",
      }),
    /dependsOn.*array/,
  );

  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        dependsOn: ["core.auth", "core.auth"],
      }),
    /contains duplicate dependency id/,
  );
});

test("assertModuleManifest rejects blank ids and unsupported apiVersion", () => {
  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        id: "   ",
      }),
    /manifest\.id must be a non-empty string/,
  );

  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        apiVersion: "2",
      }),
    /manifest\.apiVersion must be "1"/,
  );
});

test("assertModuleManifestCompatibility rejects when core version is below minCoreVersion", () => {
  assert.throws(
    () =>
      assertModuleManifestCompatibility(validModuleManifest, {
        coreVersion: "1.1.9",
      }),
    /below manifest\.minCoreVersion/,
  );
});

test("assertModuleManifestCompatibility rejects when core version is above maxCoreVersion", () => {
  assert.throws(
    () =>
      assertModuleManifestCompatibility(validModuleManifest, {
        coreVersion: "2.0.1",
      }),
    /above manifest\.maxCoreVersion/,
  );
});

test("assertModuleManifestCompatibility accepts equal boundary versions", () => {
  const manifest: ModuleManifest = {
    ...validModuleManifest,
    minCoreVersion: "1.5.0",
    maxCoreVersion: "1.5.0",
  };

  assert.doesNotThrow(() =>
    assertModuleManifestCompatibility(manifest, {
      coreVersion: "1.5.0",
    }),
  );
});

test("assertModuleManifestCompatibility rejects apiVersion mismatch", () => {
  assert.throws(
    () =>
      assertModuleManifestCompatibility(validModuleManifest, {
        coreVersion: "1.5.0",
        supportedApiVersion: "2",
      }),
    /is not supported/,
  );
});

test("assertModuleManifest rejects inverted minCoreVersion/maxCoreVersion bounds", () => {
  assert.throws(
    () =>
      assertModuleManifest({
        ...validModuleManifest,
        minCoreVersion: "2.0.0",
        maxCoreVersion: "1.0.0",
      }),
    /minCoreVersion must be less than or equal to/,
  );
});

test("assertStudioBootstrapManifest accepts valid payload", () => {
  assert.doesNotThrow(() =>
    assertStudioBootstrapManifest(validStudioBootstrapManifest),
  );
});

test("assertStudioBootstrapManifest rejects unknown and invalid fields", () => {
  assert.throws(
    () =>
      assertStudioBootstrapManifest({
        ...validStudioBootstrapManifest,
        invalidField: true,
      }),
    /unknown field\(s\): invalidField/,
  );

  assert.throws(
    () =>
      assertStudioBootstrapManifest({
        ...validStudioBootstrapManifest,
        minStudioPackageVersion: "0.1.0-beta.1",
      }),
    /strict x\.y\.z version format/,
  );
});

test("assertStudioBootstrapCompatibility rejects when package and bridge are below minimums", () => {
  assert.throws(
    () =>
      assertStudioBootstrapCompatibility(validStudioBootstrapManifest, {
        studioPackageVersion: "0.0.9",
        hostBridgeVersion: "1.0.0",
      }),
    /below manifest\.minStudioPackageVersion/,
  );

  assert.throws(
    () =>
      assertStudioBootstrapCompatibility(validStudioBootstrapManifest, {
        studioPackageVersion: "0.1.0",
        hostBridgeVersion: "0.9.9",
      }),
    /below manifest\.minHostBridgeVersion/,
  );
});

test("assertStudioBootstrapCompatibility accepts exact minimum versions", () => {
  assert.doesNotThrow(() =>
    assertStudioBootstrapCompatibility(validStudioBootstrapManifest, {
      studioPackageVersion: "0.1.0",
      hostBridgeVersion: "1.0.0",
    }),
  );
});

test("assertStudioBootstrapManifest rejects blank signature and invalid mode", () => {
  assert.throws(
    () =>
      assertStudioBootstrapManifest({
        ...validStudioBootstrapManifest,
        signature: "   ",
      }),
    /studioBootstrapManifest\.signature must be a non-empty string/,
  );

  assert.throws(
    () =>
      assertStudioBootstrapManifest({
        ...validStudioBootstrapManifest,
        mode: "worker",
      }),
    /studioBootstrapManifest\.mode .*iframe.*module/,
  );
});

test("runtime contract validators cover positive and negative shapes", () => {
  assert.doesNotThrow(() => assertHostBridgeV1(validHostBridge));

  assert.throws(
    () =>
      assertHostBridgeV1({
        ...validHostBridge,
        version: "2",
      }),
    /version must be "1"/,
  );

  assert.doesNotThrow(() =>
    assertStudioMountContext({
      apiBaseUrl: "http://localhost:4000",
      auth: { mode: "cookie" },
      hostBridge: validHostBridge,
    }),
  );

  assert.throws(
    () =>
      assertStudioMountContext({
        apiBaseUrl: "http://localhost:4000",
        auth: { mode: "token" },
        hostBridge: validHostBridge,
      }),
    /auth\.token must be a non-empty string/,
  );

  assert.doesNotThrow(() =>
    assertRemoteStudioModule({
      mount: () => () => {},
    }),
  );

  assert.throws(
    () =>
      assertRemoteStudioModule({
        mount: "not-a-function",
      }),
    /mount must be a function/,
  );
});

test("isModuleManifest and isStudioBootstrapManifest return booleans without throwing", () => {
  assert.equal(isModuleManifest(validModuleManifest), true);
  assert.equal(isModuleManifest({}), false);

  assert.equal(isStudioBootstrapManifest(validStudioBootstrapManifest), true);
  assert.equal(isStudioBootstrapManifest({}), false);
});
