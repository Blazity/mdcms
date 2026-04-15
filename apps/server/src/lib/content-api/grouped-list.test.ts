import assert from "node:assert/strict";

import { test } from "bun:test";

import { groupDocumentsByTranslationGroup } from "./grouped-list.js";
import type { ContentDocument } from "./types.js";

function createDocument(
  overrides: Partial<ContentDocument> & {
    documentId: string;
    locale: string;
    path: string;
  },
): ContentDocument {
  return {
    documentId: overrides.documentId,
    translationGroupId: overrides.translationGroupId ?? "tg-1",
    project: overrides.project ?? "marketing-site",
    environment: overrides.environment ?? "production",
    path: overrides.path,
    type: overrides.type ?? "Campaign",
    locale: overrides.locale,
    format: overrides.format ?? "mdx",
    isDeleted: overrides.isDeleted ?? false,
    hasUnpublishedChanges: overrides.hasUnpublishedChanges ?? false,
    version: overrides.version ?? 1,
    publishedVersion: overrides.publishedVersion ?? 1,
    draftRevision: overrides.draftRevision ?? 1,
    frontmatter: overrides.frontmatter ?? {},
    body: overrides.body ?? "",
    createdBy: overrides.createdBy ?? "user-1",
    createdAt: overrides.createdAt ?? "2026-03-01T00:00:00.000Z",
    updatedBy: overrides.updatedBy ?? "user-1",
    updatedAt: overrides.updatedAt ?? "2026-03-20T00:00:00.000Z",
    ...(overrides.localesPresent
      ? { localesPresent: overrides.localesPresent }
      : {}),
    ...(overrides.publishedLocales
      ? { publishedLocales: overrides.publishedLocales }
      : {}),
  };
}

test("groupDocumentsByTranslationGroup chooses the representative from matched rows only", () => {
  const englishVariant = createDocument({
    documentId: "doc-en",
    locale: "en",
    path: "content/campaigns/launch",
    frontmatter: { title: "Spring launch" },
  });
  const frenchVariant = createDocument({
    documentId: "doc-fr",
    locale: "fr",
    path: "content/campaigns/launch",
    frontmatter: { title: "Lancement de printemps" },
  });

  const grouped = groupDocumentsByTranslationGroup({
    matchedRows: [frenchVariant],
    allRows: [englishVariant, frenchVariant],
    sort: "path",
    order: "asc",
    defaultLocale: "en",
    supportedLocales: ["en", "fr"],
  });

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.documentId, "doc-fr");
  assert.equal(grouped[0]?.locale, "fr");
  assert.equal(grouped[0]?.frontmatter.title, "Lancement de printemps");
  assert.deepEqual(grouped[0]?.localesPresent, ["en", "fr"]);
});
