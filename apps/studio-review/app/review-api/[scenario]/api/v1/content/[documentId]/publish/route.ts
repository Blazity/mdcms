import { getReviewContentDocumentRecord } from "../../../../../../../../review/content-documents";

export async function POST(
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
    data: {
      ...selected.document,
      hasUnpublishedChanges: false,
      version: selected.document.version + 1,
      publishedVersion: selected.document.version + 1,
      updatedAt: "2026-04-05T13:00:00.000Z",
    },
  });
}
