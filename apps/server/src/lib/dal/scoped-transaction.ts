import { assertContentScope, RuntimeError } from "@mdcms/shared";

import type { DrizzleDatabase } from "../db.js";
import type {
  ScopedTransaction,
  ScopedTransactionCallback,
  ScopedTransactionOptions,
} from "./types.js";

export async function withScopedTransaction<T>(
  db: DrizzleDatabase,
  scope: unknown,
  callback: ScopedTransactionCallback<T>,
  options: ScopedTransactionOptions = {},
): Promise<T> {
  assertContentScope(scope);

  const frozenScope = Object.freeze({ ...scope });
  const isolationLevel = options.isolationLevel ?? "read committed";

  try {
    return await db.transaction(
      async (tx) => {
        // PgTransaction shares all query-builder methods with DrizzleDatabase
        // but lacks the $client property. The cast is safe for DAL operations.
        const stx: ScopedTransaction = {
          scope: frozenScope,
          tx: tx as unknown as DrizzleDatabase,
        };
        return callback(stx);
      },
      { isolationLevel },
    );
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("rollback")
    ) {
      throw new RuntimeError({
        code: "TRANSACTION_ROLLED_BACK",
        message: "Transaction was rolled back.",
        statusCode: 409,
        details: { cause: error.message },
      });
    }

    throw new RuntimeError({
      code: "TRANSACTION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unexpected transaction failure.",
      statusCode: 500,
      details: {
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
