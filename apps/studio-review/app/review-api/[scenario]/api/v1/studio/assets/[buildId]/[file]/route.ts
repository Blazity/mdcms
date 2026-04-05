import { readReviewRuntimeAsset } from "../../../../../../../../../review/runtime-artifacts";

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

function getContentType(fileName: string): string {
  if (fileName.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  return "text/javascript; charset=utf-8";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ buildId: string; file: string }> },
) {
  const { buildId, file } = await context.params;

  try {
    const body = await readReviewRuntimeAsset({
      buildId,
      fileName: file,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": getContentType(file),
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Runtime asset not found.";
    const envelope = createErrorEnvelope(
      "STUDIO_RUNTIME_ASSET_NOT_FOUND",
      message,
      404,
    );

    return Response.json(envelope, {
      status: 404,
    });
  }
}
