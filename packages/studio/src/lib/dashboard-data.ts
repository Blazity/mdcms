import type { SchemaRegistryEntry } from "@mdcms/shared";

import type { StudioSchemaRouteApi } from "./schema-route-api.js";
import type { StudioContentListApi } from "./content-list-api.js";

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
  | { status: "error"; message: string }
  | { status: "forbidden" };

export async function loadDashboardData(
  schemaApi: StudioSchemaRouteApi,
  contentApi: StudioContentListApi,
): Promise<DashboardLoadResult> {
  try {
    const [schemaTypes, totalResult, publishedResult, recentResult] =
      await Promise.all([
        schemaApi.list(),
        contentApi.list({ draft: true, limit: 1 }),
        contentApi.list({ published: true, limit: 1 }),
        contentApi.list({ draft: true, sort: "updatedAt", order: "desc", limit: 5 }),
      ]);

    const totalDocuments = totalResult.pagination.total;
    const publishedDocuments = publishedResult.pagination.total;
    const draftDocuments = Math.max(0, totalDocuments - publishedDocuments);

    const typesToShow = schemaTypes.slice(0, 5);
    const typeStats = await Promise.all(
      typesToShow.map(async (entry: SchemaRegistryEntry) => {
        const [typeTotal, typePublished] = await Promise.all([
          contentApi.list({ draft: true, type: entry.type, limit: 1 }),
          contentApi.list({ type: entry.type, published: true, limit: 1 }),
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

    if (statusCode === 401 || statusCode === 403) {
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
