import Link from "next/link";

import config from "../../../../mdcms.config";

type ContentDocument = {
  documentId: string;
  type: string;
  locale: string;
  path: string;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  draftRevision: number;
  publishedVersion: number | null;
};

type DocumentResult =
  | {
      ok: true;
      document: ContentDocument;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

type DocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

function toRequestHeaders(): Headers {
  const headers = new Headers({
    "x-mdcms-project": config.project,
    "x-mdcms-environment": config.environment,
  });

  const apiKey = process.env.MDCMS_DEMO_API_KEY?.trim();

  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  return headers;
}

function isContentDocument(value: unknown): value is ContentDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.documentId === "string" &&
    typeof row.type === "string" &&
    typeof row.locale === "string" &&
    typeof row.path === "string" &&
    (row.format === "md" || row.format === "mdx") &&
    typeof row.frontmatter === "object" &&
    row.frontmatter !== null &&
    !Array.isArray(row.frontmatter) &&
    typeof row.body === "string" &&
    typeof row.draftRevision === "number" &&
    Number.isInteger(row.draftRevision) &&
    (row.publishedVersion === null ||
      (typeof row.publishedVersion === "number" &&
        Number.isInteger(row.publishedVersion)))
  );
}

async function fetchDocument(documentId: string): Promise<DocumentResult> {
  const url = new URL(`/api/v1/content/${documentId}`, config.serverUrl);
  url.searchParams.set("project", config.project);
  url.searchParams.set("environment", config.environment);
  url.searchParams.set("draft", "true");

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: toRequestHeaders(),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: "REMOTE_ERROR",
      message:
        error instanceof Error
          ? `Failed to reach content API: ${error.message}`
          : "Failed to reach content API.",
    };
  }

  const body = (await response.json().catch(() => undefined)) as
    | {
        code?: unknown;
        message?: unknown;
        data?: unknown;
      }
    | undefined;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: typeof body?.code === "string" ? body.code : "REMOTE_ERROR",
      message:
        typeof body?.message === "string"
          ? body.message
          : `Content request failed (${response.status}).`,
    };
  }

  if (!isContentDocument(body?.data)) {
    return {
      ok: false,
      status: 502,
      code: "REMOTE_ERROR",
      message: 'Content API response is missing a valid "data" payload.',
    };
  }

  return {
    ok: true,
    document: body.data,
  };
}

export default async function DemoContentDocumentPage({
  params,
}: DocumentPageProps) {
  const { documentId } = await params;
  const result = await fetchDocument(documentId);

  return (
    <main>
      <h1>Raw Content Document</h1>
      <p>
        <Link href="/demo/content">Back to /demo/content</Link>
      </p>

      {!result.ok ? (
        <section>
          <h2>Request failed</h2>
          <p>
            {result.code} ({result.status})
          </p>
          <p>{result.message}</p>
        </section>
      ) : (
        <section>
          <h2>{result.document.documentId}</h2>
          <p>
            type=<code>{result.document.type}</code> path=
            <code>{result.document.path}</code> locale=
            <code>{result.document.locale}</code> format=
            <code>{result.document.format}</code>
          </p>
          <p>
            draftRevision=<code>{result.document.draftRevision}</code>{" "}
            publishedVersion=
            <code>{result.document.publishedVersion ?? "-"}</code>
          </p>
          <p>frontmatter (raw JSON):</p>
          <pre>{JSON.stringify(result.document.frontmatter, null, 2)}</pre>
          <p>body (raw):</p>
          <pre>{result.document.body}</pre>
        </section>
      )}
    </main>
  );
}
