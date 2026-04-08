import { getReviewContentDocumentRecord } from "../../../../../../../../review/content-documents";

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string; documentId: string }> },
) {
  const { scenario, documentId } = await context.params;
  const selected = getReviewContentDocumentRecord(scenario, documentId);

  if (!selected) {
    const envelope = {
      status: "error" as const,
      code: "NOT_FOUND",
      message: "Review document not found.",
      statusCode: 404,
      timestamp: new Date().toISOString(),
    };

    return Response.json(envelope, {
      status: 404,
    });
  }

  return Response.json({
    data: selected.versions.map((version) => ({
      documentId: version.documentId,
      translationGroupId: version.translationGroupId,
      project: version.project,
      environment: version.environment,
      version: version.version,
      path: version.path,
      type: version.type,
      locale: version.locale,
      format: version.format,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      ...(version.changeSummary
        ? { changeSummary: version.changeSummary }
        : {}),
    })),
    pagination: {
      total: selected.versions.length,
      limit: selected.versions.length,
      offset: 0,
      hasMore: false,
    },
  });
}
