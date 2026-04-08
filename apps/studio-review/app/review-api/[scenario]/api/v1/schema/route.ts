import { getReviewScenario } from "../../../../../../review/scenarios";

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
  context: { params: Promise<{ scenario: string }> },
) {
  const { scenario } = await context.params;
  const selected = getReviewScenario(scenario);

  if (selected.schema.mode === "error") {
    const envelope = createErrorEnvelope(
      "SCHEMA_ROUTE_REQUEST_FAILED",
      "Schema registry is unavailable for this review scenario.",
      503,
    );

    return Response.json(envelope, {
      status: 503,
    });
  }

  return Response.json({
    data: selected.schema.entries,
  });
}
