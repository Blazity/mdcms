import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import type { DrizzleDatabase } from "../db.js";
import { createContentDAL } from "./content-dal.js";

const validScope = {
  projectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  environmentId: "f0e1d2c3-b4a5-6789-0abc-def123456789",
};

function createMockDb(
  transactionImpl?: (
    callback: (tx: unknown) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>,
) {
  const calls: { method: string; args: unknown[] }[] = [];

  const db = {
    transaction:
      transactionImpl ??
      (async (callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = { __mock: "tx" };
        return callback(mockTx);
      }),
    __calls: calls,
  };

  return db as unknown as DrizzleDatabase & { __calls: typeof calls };
}

test("withScopedTransaction rejects invalid scope before calling db.transaction", async () => {
  let transactionCalled = false;
  const db = createMockDb(async () => {
    transactionCalled = true;
    return undefined;
  });
  const dal = createContentDAL({ db });

  await assert.rejects(
    () =>
      dal.withScopedTransaction(
        { projectId: "not-a-uuid", environmentId: "also-bad" } as never,
        async () => "result",
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONTENT_SCOPE" &&
      error.statusCode === 400,
  );

  assert.equal(transactionCalled, false);
});

test("withScopedTransaction propagates callback error as RuntimeError", async () => {
  const db = createMockDb();
  const dal = createContentDAL({ db });

  await assert.rejects(
    () =>
      dal.withScopedTransaction(validScope, async () => {
        throw new RuntimeError({
          code: "SOME_DOMAIN_ERROR",
          message: "domain failure",
          statusCode: 422,
        });
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "SOME_DOMAIN_ERROR",
  );
});

test("withScopedTransaction freezes the scope object", async () => {
  const db = createMockDb();
  const dal = createContentDAL({ db });

  await dal.withScopedTransaction(validScope, async (stx) => {
    assert.ok(Object.isFrozen(stx.scope));
    assert.equal(stx.scope.projectId, validScope.projectId);
    assert.equal(stx.scope.environmentId, validScope.environmentId);
  });
});

test("withScopedTransaction forwards callback return value", async () => {
  const db = createMockDb();
  const dal = createContentDAL({ db });

  const result = await dal.withScopedTransaction(validScope, async () => 42);
  assert.equal(result, 42);
});

test("scopedQuery returns scope and db without transaction", () => {
  let transactionCalled = false;
  const db = createMockDb(async () => {
    transactionCalled = true;
    return undefined;
  });
  const dal = createContentDAL({ db });

  const result = dal.scopedQuery(validScope);

  assert.ok(Object.isFrozen(result.scope));
  assert.equal(result.scope.projectId, validScope.projectId);
  assert.equal(result.scope.environmentId, validScope.environmentId);
  assert.equal(result.tx, db);
  assert.equal(transactionCalled, false);
});

test("scopedQuery rejects invalid scope", () => {
  const db = createMockDb();
  const dal = createContentDAL({ db });

  assert.throws(
    () => dal.scopedQuery({ projectId: "bad" } as never),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONTENT_SCOPE" &&
      error.statusCode === 400,
  );
});
