import { getReviewScenario } from "../../../../../../../review/scenarios";

function notFoundResponse() {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string; documentId: string }> },
) {
  const { scenario, documentId } = await context.params;
  const selected = getReviewScenario(scenario);

  if (selected.document.documentId !== documentId) {
    return notFoundResponse();
  }

  return Response.json({
    data: selected.document,
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ scenario: string; documentId: string }> },
) {
  const { scenario, documentId } = await context.params;
  const selected = getReviewScenario(scenario);

  if (selected.document.documentId !== documentId) {
    return notFoundResponse();
  }

  const payload = (await request.json()) as {
    body?: string;
    frontmatter?: Record<string, unknown>;
  };

  return Response.json({
    data: {
      ...selected.document,
      body: payload.body ?? selected.document.body,
      frontmatter: payload.frontmatter ?? selected.document.frontmatter,
      updatedAt: "2026-04-05T12:30:00.000Z",
      hasUnpublishedChanges: true,
      draftRevision: selected.document.draftRevision + 1,
    },
  });
}
