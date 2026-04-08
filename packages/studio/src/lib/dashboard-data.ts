import type { SchemaRegistryEntry } from "@mdcms/shared";

import type { StudioSchemaRouteApi } from "./schema-route-api.js";
import type { StudioContentListApi } from "./content-list-api.js";
import type { StudioContentOverviewApi } from "./content-overview-api.js";

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
  overviewApi: StudioContentOverviewApi,
): Promise<DashboardLoadResult> {
  try {
    const [schemaTypes, recentResult] = await Promise.all([
      schemaApi.list(),
      contentApi.list({
        draft: true,
        sort: "updatedAt",
        order: "desc",
        limit: 5,
      }),
    ]);

    const typesToShow = schemaTypes.slice(0, 5);
    const overviewCounts =
      typesToShow.length > 0
        ? await overviewApi.get({
            types: typesToShow.map((entry) => entry.type),
          })
        : [];

    let totalDocuments = 0;
    let publishedDocuments = 0;
    let draftDocuments = 0;

    const typeStats: ContentTypeStat[] = typesToShow.map(
      (entry: SchemaRegistryEntry, index: number) => {
        const counts = overviewCounts[index];
        const totalCount = counts?.total ?? 0;
        const publishedCount = counts?.published ?? 0;

        totalDocuments += totalCount;
        publishedDocuments += publishedCount;
        draftDocuments += counts?.drafts ?? 0;

        return {
          type: entry.type,
          directory: entry.directory,
          localized: entry.localized,
          totalCount,
          publishedCount,
        };
      },
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
