import Link from "next/link";

import config from "../../../mdcms.config";

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

type ContentListResult =
  | {
      ok: true;
      documents: ContentDocument[];
      total: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
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

async function fetchContentList(): Promise<ContentListResult> {
  const url = new URL("/api/v1/content", config.serverUrl);
  url.searchParams.set("project", config.project);
  url.searchParams.set("environment", config.environment);
  url.searchParams.set("draft", "true");
  url.searchParams.set("limit", "50");
  url.searchParams.set("offset", "0");

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
        pagination?: {
          total?: unknown;
        };
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

  const rows = Array.isArray(body?.data)
    ? body.data.filter((entry) => isContentDocument(entry))
    : [];
  const total =
    typeof body?.pagination?.total === "number"
      ? body.pagination.total
      : rows.length;

  if (!Array.isArray(body?.data)) {
    return {
      ok: false,
      status: 502,
      code: "REMOTE_ERROR",
      message: 'Content API response is missing "data" array.',
    };
  }

  return {
    ok: true,
    documents: rows,
    total,
  };
}

export default async function DemoContentPage() {
  const result = await fetchContentList();

  return (
    <main>
      <h1>Raw Content API Demo</h1>
      <p>
        Scope: <strong>{config.project}</strong> /{" "}
        <strong>{config.environment}</strong> (draft mode)
      </p>
      <p>
        API source: <code>{config.serverUrl}/api/v1/content</code>
      </p>
      <p>
        Auth: set <code>MDCMS_DEMO_API_KEY</code> in your environment for
        non-session requests.
      </p>

      {!result.ok ? (
        <section>
          <h2>Request failed</h2>
          <p>
            {result.code} ({result.status})
          </p>
          <p>{result.message}</p>
        </section>
      ) : result.documents.length === 0 ? (
        <section>
          <h2>No documents</h2>
          <p>The target scope has no content documents yet.</p>
        </section>
      ) : (
        <section>
          <h2>Documents ({result.total})</h2>
          <ul>
            {result.documents.map((document) => (
              <li key={document.documentId}>
                <h3>
                  <Link href={`/demo/content/${document.documentId}`}>
                    {document.documentId}
                  </Link>
                </h3>
                <p>
                  type=<code>{document.type}</code> path=
                  <code>{document.path}</code> locale=
                  <code>{document.locale}</code> format=
                  <code>{document.format}</code>
                </p>
                <p>
                  draftRevision=<code>{document.draftRevision}</code>{" "}
                  publishedVersion=
                  <code>{document.publishedVersion ?? "-"}</code>
                </p>
                <p>frontmatter (raw JSON):</p>
                <pre>{JSON.stringify(document.frontmatter, null, 2)}</pre>
                <p>body (raw):</p>
                <pre>{document.body}</pre>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
