import { listReviewActions } from "../../../../../../review/actions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string }> },
) {
  const { scenario } = await context.params;
  return Response.json(listReviewActions(scenario));
}
