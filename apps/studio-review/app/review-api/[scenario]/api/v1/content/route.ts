import { listReviewContentDocuments } from "../../../../../../review/content-documents";

export async function GET(
  request: Request,
  context: { params: Promise<{ scenario: string }> },
) {
  const { scenario } = await context.params;
  const url = new URL(request.url);
  const typeFilter = url.searchParams.get("type");
  const publishedFilter = url.searchParams.get("published");
  const sortField = url.searchParams.get("sort");
  const sortOrder = url.searchParams.get("order") ?? "asc";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    100,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  let docs = listReviewContentDocuments(scenario);

  if (typeFilter) {
    docs = docs.filter((d) => d.type === typeFilter);
  }

  if (publishedFilter === "true") {
    docs = docs.filter((d) => d.publishedVersion !== null);
  } else if (publishedFilter === "false") {
    docs = docs.filter((d) => d.publishedVersion === null);
  }

  if (sortField === "updatedAt") {
    docs = [...docs].sort((a, b) => {
      const cmp =
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortOrder === "desc" ? -cmp : cmp;
    });
  }

  const total = docs.length;
  const paged = docs.slice(offset, offset + limit);

  return Response.json({
    data: paged,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
}
