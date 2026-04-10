import { RuntimeError } from "@mdcms/shared";

import { deleteReviewEnvironment } from "../../../../../../../review/environments";

function toErrorResponse(error: unknown): Response {
  if (error instanceof RuntimeError) {
    return Response.json(
      {
        status: "error",
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
      },
      {
        status: error.statusCode,
      },
    );
  }

  return Response.json(
    {
      status: "error",
      code: "INTERNAL_ERROR",
      message: "Review environment route failed.",
      statusCode: 500,
      timestamp: new Date().toISOString(),
    },
    {
      status: 500,
    },
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ scenario: string; id: string }> },
) {
  try {
    const { scenario, id } = await context.params;

    return Response.json({
      data: deleteReviewEnvironment(scenario, id),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
