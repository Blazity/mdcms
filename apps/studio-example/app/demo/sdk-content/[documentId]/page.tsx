import Link from "next/link";

import type { ContentDocumentResponse } from "@mdcms/cli";
import { createMdcmsRenderer } from "@mdcms/sdk/react";

import { getPreviewHrefForDocument } from "../../../../lib/preview-routing";
import config from "../../../../mdcms.config";
import { createDemoSdkClient, toDemoRequestFailure } from "../sdk-demo-client";

const contentRenderer = createMdcmsRenderer(config);

type DocumentResult =
  | {
      ok: true;
      document: ContentDocumentResponse;
    }
  | ({
      ok: false;
    } & ReturnType<typeof toDemoRequestFailure>);

type DocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
  searchParams?: Promise<{
    type?: string;
  }>;
};

async function fetchDocument(
  type: string,
  documentId: string,
): Promise<DocumentResult> {
  try {
    const client = createDemoSdkClient();
    const document = await client.get(type, {
      id: documentId,
      draft: true,
    });

    return {
      ok: true,
      document,
    };
  } catch (error) {
    return {
      ok: false,
      ...toDemoRequestFailure(error),
    };
  }
}

export default async function DemoSdkContentDocumentPage({
  params,
  searchParams,
}: DocumentPageProps) {
  const { documentId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const type = resolvedSearchParams?.type?.trim() || "post";
  const result = await fetchDocument(type, documentId);
  const previewHref = result.ok
    ? getPreviewHrefForDocument(result.document)
    : undefined;
  const renderedBody = result.ok
    ? await contentRenderer.render(result.document)
    : null;

  return (
    <main>
      <h1>SDK Content Document</h1>
      <p>
        Data source: <strong>@mdcms/sdk</strong>
      </p>
      <p>
        SDK call:{" "}
        <code>{`createClient(...).get("${type}", { id, draft: true })`}</code>
      </p>
      <p>
        <Link href="/demo/sdk-content">Back to /demo/sdk-content</Link>
        {" | "}
        <Link href={`/demo/content/${documentId}`}>Open raw API detail</Link>
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
          {previewHref ? (
            <p>
              <Link href={previewHref}>Open rendered preview</Link>
            </p>
          ) : null}
          <h3>Rendered body</h3>
          <div>{renderedBody}</div>
          <p>frontmatter (raw JSON):</p>
          <pre>{JSON.stringify(result.document.frontmatter, null, 2)}</pre>
          <p>body (raw):</p>
          <pre>{result.document.body}</pre>
        </section>
      )}
    </main>
  );
}
