import type {
  ApiPaginatedEnvelope,
  ContentDocumentResponse,
  SchemaRegistryEntry,
} from "@mdcms/shared";

import type { StudioSchemaRouteApi } from "./schema-route-api.js";
import type { StudioContentListApi } from "./content-list-api.js";

const EMPTY_PAGINATED: ApiPaginatedEnvelope<ContentDocumentResponse> = {
  data: [],
  pagination: { total: 0, limit: 1, offset: 0, hasMore: false },
};

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("statusCode" in err)) return false;
  const code = (err as { statusCode: number }).statusCode;
  return code === 401 || code === 403;
}

function catchPermission(
  promise: Promise<ApiPaginatedEnvelope<ContentDocumentResponse>>,
): Promise<ApiPaginatedEnvelope<ContentDocumentResponse>> {
  return promise.catch(
    (err: unknown): ApiPaginatedEnvelope<ContentDocumentResponse> => {
      if (isPermissionError(err)) return EMPTY_PAGINATED;
      throw err;
    },
  );
}

export type ContentTypeStat = {
  type: string;
  directory: string;
  localized: boolean;
  totalCount: number;
  publishedCount: number;
};

export type DashboardData = {
  totalDocuments: number;
  publishedDocuments: number;
  draftDocuments: number;
  contentTypes: ContentTypeStat[];
  totalContentTypes: number;
  recentDocuments: Array<{
    documentId: string;
    path: string;
    type: string;
    updatedAt: string;
    hasUnpublishedChanges: boolean;
    frontmatter: Record<string, unknown>;
  }>;
};

export type DashboardLoadResult =
  | { status: "loaded"; data: DashboardData }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "forbidden" };

export async function loadDashboardData(
  schemaApi: StudioSchemaRouteApi,
  contentApi: StudioContentListApi,
): Promise<DashboardLoadResult> {
  try {
    // Fetch schema and content in parallel. Permission errors (401/403)
    // on individual APIs degrade to empty results so the dashboard still
    // renders whatever data the caller is allowed to see.
    const [schemaTypes, totalResult, publishedResult, recentResult] =
      await Promise.all([
        schemaApi.list().catch((err: unknown): SchemaRegistryEntry[] => {
          if (isPermissionError(err)) return [];
          throw err;
        }),
        catchPermission(contentApi.list({ limit: 1 })),
        catchPermission(contentApi.list({ published: true, limit: 1 })),
        catchPermission(
          contentApi.list({ sort: "updatedAt", order: "desc", limit: 5 }),
        ),
      ]);

    const totalDocuments = totalResult.pagination.total;
    const publishedDocuments = publishedResult.pagination.total;
    const draftDocuments = Math.max(0, totalDocuments - publishedDocuments);
    if (totalDocuments - publishedDocuments < 0) {
      console.warn(
        `Dashboard data inconsistency: published (${publishedDocuments}) exceeds total (${totalDocuments})`,
      );
    }

    // Per-type counts also degrade gracefully — if schema came back empty
    // due to a permission error the loop simply produces no entries.
    const typesToShow = schemaTypes.slice(0, 5);
    const typeStats = await Promise.all(
      typesToShow.map(async (entry: SchemaRegistryEntry) => {
        const [typeTotal, typePublished] = await Promise.all([
          catchPermission(contentApi.list({ type: entry.type, limit: 1 })),
          catchPermission(
            contentApi.list({ type: entry.type, published: true, limit: 1 }),
          ),
        ]);

        const totalCount = typeTotal.pagination.total;
        const publishedCount = Math.min(
          typePublished.pagination.total,
          totalCount,
        );

        return {
          type: entry.type,
          directory: entry.directory,
          localized: entry.localized,
          totalCount,
          publishedCount,
        };
      }),
    );

    if (totalDocuments === 0 && typeStats.length === 0) {
      return { status: "empty" };
    }

    return {
      status: "loaded",
      data: {
        totalDocuments,
        publishedDocuments,
        draftDocuments,
        contentTypes: typeStats,
        totalContentTypes: schemaTypes.length,
        recentDocuments: recentResult.data.map((doc) => ({
          documentId: doc.documentId,
          path: doc.path,
          type: doc.type,
          updatedAt: doc.updatedAt,
          hasUnpublishedChanges: doc.hasUnpublishedChanges,
          frontmatter: doc.frontmatter,
        })),
      },
    };
  } catch (error: unknown) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 401) {
      return { status: "forbidden" };
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load dashboard data.",
    };
  }
}
