import { getReviewScenario } from "../../../../../../../review/scenarios";

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string }> },
) {
  const { scenario } = await context.params;
  const selected = getReviewScenario(scenario);

  return Response.json({
    data: {
      project: selected.document.project,
      environment: selected.document.environment,
      capabilities: selected.capabilities,
    },
  });
}
