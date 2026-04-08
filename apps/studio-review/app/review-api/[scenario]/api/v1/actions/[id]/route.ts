import { getReviewAction } from "../../../../../../../review/actions";

function createErrorEnvelope(
  code: string,
  message: string,
  statusCode: number,
) {
  return {
    status: "error" as const,
    code,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string; id: string }> },
) {
  const { scenario, id } = await context.params;
  const action = getReviewAction(scenario, id);

  if (!action) {
    return Response.json(
      createErrorEnvelope("ACTION_NOT_FOUND", "Review action not found.", 404),
      {
        status: 404,
      },
    );
  }

  return Response.json(action);
}
