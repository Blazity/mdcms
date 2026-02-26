import { assertContentScope, type ContentScope } from "@mdcms/shared";

import type { DrizzleDatabase } from "../db.js";
import { withScopedTransaction } from "./scoped-transaction.js";
import type {
  ContentDAL,
  ScopedTransaction,
  ScopedTransactionCallback,
  ScopedTransactionOptions,
} from "./types.js";

export type CreateContentDALOptions = {
  db: DrizzleDatabase;
};

/**
 * createContentDAL builds a ContentDAL instance backed by the given
 * Drizzle database connection. Downstream tasks extend this with
 * entity-specific repository methods.
 */
export function createContentDAL(options: CreateContentDALOptions): ContentDAL {
  const { db } = options;

  return {
    withScopedTransaction<T>(
      scope: ContentScope,
      callback: ScopedTransactionCallback<T>,
      txOptions?: ScopedTransactionOptions,
    ): Promise<T> {
      return withScopedTransaction(db, scope, callback, txOptions);
    },

    scopedQuery(scope: ContentScope): ScopedTransaction {
      assertContentScope(scope);

      const frozenScope = Object.freeze({ ...scope });
      return { scope: frozenScope, tx: db };
    },
  };
}
