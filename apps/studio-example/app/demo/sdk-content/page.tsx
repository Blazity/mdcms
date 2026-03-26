import Link from "next/link";

import type { ContentDocumentResponse } from "@mdcms/cli";

import config from "../../../mdcms.config";
import { createDemoSdkClient, toDemoRequestFailure } from "./sdk-demo-client";

type ContentListResult =
  | {
      ok: true;
      documents: ContentDocumentResponse[];
      total: number;
    }
  | ({
      ok: false;
    } & ReturnType<typeof toDemoRequestFailure>);

async function fetchSdkContentList(): Promise<ContentListResult> {
  try {
    const client = createDemoSdkClient();
    const result = await client.list("post", {
      draft: true,
      limit: 50,
      offset: 0,
    });

    return {
      ok: true,
      documents: result.data,
      total: result.pagination.total,
    };
  } catch (error) {
    return {
      ok: false,
      ...toDemoRequestFailure(error),
    };
  }
}

export default async function DemoSdkContentPage() {
  const result = await fetchSdkContentList();

  return (
    <main>
      <h1>SDK Content Demo</h1>
      <p>
        Scope: <strong>{config.project}</strong> /{" "}
        <strong>{config.environment}</strong> (draft mode)
      </p>
      <p>
        Data source: <strong>@mdcms/sdk</strong>
      </p>
      <p>
        SDK call:{" "}
        <code>
          {
            'createClient(...).list("post", { draft: true, limit: 50, offset: 0 })'
          }
        </code>
      </p>
      <p>
        Compare with: <Link href="/demo/content">Raw Content API demo</Link>
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
          <p>
            The SDK demo did not find any <code>post</code> documents.
          </p>
        </section>
      ) : (
        <section>
          <h2>Documents ({result.total})</h2>
          <ul>
            {result.documents.map((document) => (
              <li key={document.documentId}>
                <h3>
                  <Link
                    href={`/demo/sdk-content/${document.documentId}?type=${encodeURIComponent(document.type)}`}
                  >
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
                <p>
                  Also inspect raw API output:{" "}
                  <Link href={`/demo/content/${document.documentId}`}>
                    /demo/content/{document.documentId}
                  </Link>
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
