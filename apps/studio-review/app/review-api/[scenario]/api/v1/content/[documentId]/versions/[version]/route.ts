import { getReviewScenario } from "../../../../../../../../../review/scenarios";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ scenario: string; documentId: string; version: string }>;
  },
) {
  const { scenario, documentId, version } = await context.params;
  const selected = getReviewScenario(scenario);

  if (selected.document.documentId !== documentId) {
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

  const versionNumber = Number.parseInt(version, 10);
  const match = selected.versions.find(
    (entry) => entry.version === versionNumber,
  );

  if (!match) {
    const envelope = {
      status: "error" as const,
      code: "NOT_FOUND",
      message: "Review document version not found.",
      statusCode: 404,
      timestamp: new Date().toISOString(),
    };

    return Response.json(envelope, {
      status: 404,
    });
  }

  return Response.json({
    data: match,
  });
}
