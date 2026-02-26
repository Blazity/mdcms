import type { ContentScope } from "@mdcms/shared";

import type { DrizzleDatabase } from "../db.js";

/**
 * DatabaseExecutor is the shared query-builder interface used by both
 * the root Drizzle db instance and transaction handles.
 */
export type DatabaseExecutor = DrizzleDatabase;

/**
 * ScopedTransaction bundles a validated, frozen content scope with a
 * Drizzle transaction handle for downstream repository operations.
 */
export type ScopedTransaction = {
  readonly scope: ContentScope;
  readonly tx: DatabaseExecutor;
};

/**
 * ScopedTransactionCallback is the user-supplied function executed
 * inside a scoped transaction.
 */
export type ScopedTransactionCallback<T> = (
  stx: ScopedTransaction,
) => Promise<T>;

/**
 * ScopedTransactionOptions configure transaction behavior.
 */
export type ScopedTransactionOptions = {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
};

/**
 * ContentDAL is the data access layer interface for scoped content operations.
 */
export type ContentDAL = {
  withScopedTransaction: <T>(
    scope: ContentScope,
    callback: ScopedTransactionCallback<T>,
    options?: ScopedTransactionOptions,
  ) => Promise<T>;

  scopedQuery: (scope: ContentScope) => ScopedTransaction;
};
