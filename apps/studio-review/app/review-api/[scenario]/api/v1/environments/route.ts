import { RuntimeError } from "@mdcms/shared";

import {
  createReviewEnvironment,
  listReviewEnvironments,
} from "../../../../../../review/environments";

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

async function parseCreateEnvironmentRequest(
  request: Request,
): Promise<{ name?: string }> {
  try {
    return (await request.json()) as { name?: string };
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as Error)?.name === "SyntaxError"
    ) {
      throw new RuntimeError({
        code: "INVALID_INPUT",
        message: "Request body must be valid JSON.",
        statusCode: 400,
      });
    }

    throw error;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string }> },
) {
  try {
    const { scenario } = await context.params;

    return Response.json({
      data: listReviewEnvironments(scenario),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ scenario: string }> },
) {
  try {
    const { scenario } = await context.params;
    const payload = await parseCreateEnvironmentRequest(request);

    return Response.json({
      data: createReviewEnvironment(scenario, payload),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
