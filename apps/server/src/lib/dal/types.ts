import type { ContentScope } from "@mdcms/shared";

import type { DrizzleDatabase } from "../db.js";

export type ScopedTransaction = {
  readonly scope: ContentScope;
  readonly tx: DrizzleDatabase;
};

export type ScopedTransactionCallback<T> = (
  stx: ScopedTransaction,
) => Promise<T>;

export type ScopedTransactionOptions = {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
};

export type ContentDAL = {
  withScopedTransaction: <T>(
    scope: ContentScope,
    callback: ScopedTransactionCallback<T>,
    options?: ScopedTransactionOptions,
  ) => Promise<T>;

  scopedQuery: (scope: ContentScope) => ScopedTransaction;
};
