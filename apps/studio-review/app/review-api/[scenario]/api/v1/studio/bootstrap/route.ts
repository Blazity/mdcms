import {
  readReviewRuntimeBootstrapManifest,
  scopeReviewRuntimeManifestToScenario,
} from "../../../../../../../review/runtime-artifacts";

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

  try {
    const manifest = scopeReviewRuntimeManifestToScenario(
      await readReviewRuntimeBootstrapManifest(),
      scenario,
    );

    return Response.json({
      data: {
        status: "ready",
        source: "active",
        manifest,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Review runtime is unavailable.";
    const envelope = createErrorEnvelope(
      "STUDIO_RUNTIME_UNAVAILABLE",
      message,
      500,
    );

    return Response.json(envelope, {
      status: 500,
    });
  }
}
