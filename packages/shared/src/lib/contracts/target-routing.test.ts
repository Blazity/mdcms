import assert from "node:assert/strict";
import { test } from "bun:test";

import { RuntimeError } from "../runtime/error.js";
import {
  MDCMS_ENVIRONMENT_HEADER,
  MDCMS_PROJECT_HEADER,
  assertRequestTargetRouting,
  resolveRequestTargetRouting,
} from "./target-routing.js";

const PROJECT = "marketing-site";
const ENVIRONMENT = "staging";

test("assertRequestTargetRouting accepts header-only routing", () => {
  const request = new Request("http://localhost/api/v1/content", {
    headers: {
      [MDCMS_PROJECT_HEADER]: PROJECT,
      [MDCMS_ENVIRONMENT_HEADER]: ENVIRONMENT,
    },
  });

  const result = assertRequestTargetRouting(request, "project_environment");

  assert.equal(result.project, PROJECT);
  assert.equal(result.environment, ENVIRONMENT);
  assert.equal(result.source, "headers");
  assert.equal(result.projectSource, "header");
  assert.equal(result.environmentSource, "header");
});

test("assertRequestTargetRouting accepts query-only routing", () => {
  const request = new Request(
    `http://localhost/api/v1/content?project=${PROJECT}&environment=${ENVIRONMENT}`,
  );

  const result = assertRequestTargetRouting(request, "project_environment");

  assert.equal(result.project, PROJECT);
  assert.equal(result.environment, ENVIRONMENT);
  assert.equal(result.source, "query");
  assert.equal(result.projectSource, "query");
  assert.equal(result.environmentSource, "query");
});

test("resolveRequestTargetRouting rejects header/query mismatch", () => {
  const request = new Request(
    `http://localhost/api/v1/content?project=docs-site&environment=${ENVIRONMENT}`,
    {
      headers: {
        [MDCMS_PROJECT_HEADER]: PROJECT,
      },
    },
  );

  assert.throws(
    () => resolveRequestTargetRouting(request),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "TARGET_ROUTING_MISMATCH" &&
      error.statusCode === 400,
  );
});

test('assertRequestTargetRouting rejects missing project for "project" requirement', () => {
  const request = new Request(
    `http://localhost/api/v1/environments?environment=${ENVIRONMENT}`,
  );

  assert.throws(
    () => assertRequestTargetRouting(request, "project"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "MISSING_TARGET_ROUTING" &&
      error.statusCode === 400 &&
      Array.isArray(error.details?.missingFields) &&
      error.details.missingFields.includes("project"),
  );
});

test('assertRequestTargetRouting rejects missing environment for "project_environment" requirement', () => {
  const request = new Request(
    `http://localhost/api/v1/content?project=${PROJECT}`,
  );

  assert.throws(
    () => assertRequestTargetRouting(request, "project_environment"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "MISSING_TARGET_ROUTING" &&
      error.statusCode === 400 &&
      Array.isArray(error.details?.missingFields) &&
      error.details.missingFields.includes("environment"),
  );
});

test("assertRequestTargetRouting accepts non-conflicting mixed-source routing", () => {
  const request = new Request(
    `http://localhost/api/v1/content?environment=${ENVIRONMENT}`,
    {
      headers: {
        [MDCMS_PROJECT_HEADER]: PROJECT,
      },
    },
  );

  const result = assertRequestTargetRouting(request, "project_environment");

  assert.equal(result.project, PROJECT);
  assert.equal(result.environment, ENVIRONMENT);
  assert.equal(result.source, "mixed");
  assert.equal(result.projectSource, "header");
  assert.equal(result.environmentSource, "query");
});
