import type {
  ContentDocumentResponse,
  ContentVersionDocumentResponse,
} from "@mdcms/shared";

import { getReviewScenario } from "./scenarios";

export type ReviewContentDocumentRecord = {
  document: ContentDocumentResponse;
  versions: ContentVersionDocumentResponse[];
};

type LegacyContentDocumentSeed = {
  id: string;
  title: string;
  path: string;
  type: string;
  locale: string;
  status: "published" | "draft" | "changed";
};

const project = "marketing-site";
const environment = "staging";
const translationGroupPrefix = "legacy-review-translation";
const createdBy = "44444444-4444-4444-8444-444444444444";
const publishedBy = "33333333-3333-4333-8333-333333333333";

const legacyContentDocumentSeeds: readonly LegacyContentDocumentSeed[] = [
  {
    id: "1",
    title: "Hello World",
    path: "blog/hello-world",
    type: "BlogPost",
    locale: "en-US",
    status: "published",
  },
  {
    id: "2",
    title: "Getting Started Guide",
    path: "blog/getting-started",
    type: "BlogPost",
    locale: "en-US",
    status: "changed",
  },
  {
    id: "3",
    title: "Advanced Techniques",
    path: "blog/advanced-techniques",
    type: "BlogPost",
    locale: "en-US",
    status: "draft",
  },
  {
    id: "4",
    title: "About Us",
    path: "pages/about",
    type: "Page",
    locale: "en-US",
    status: "published",
  },
  {
    id: "5",
    title: "Contact",
    path: "pages/contact",
    type: "Page",
    locale: "en-US",
    status: "published",
  },
  {
    id: "6",
    title: "New Feature Announcement",
    path: "blog/new-feature",
    type: "BlogPost",
    locale: "en-US",
    status: "draft",
  },
  {
    id: "7",
    title: "Product Launch 2024",
    path: "blog/product-launch-2024",
    type: "BlogPost",
    locale: "en-US",
    status: "changed",
  },
  {
    id: "8",
    title: "Privacy Policy",
    path: "pages/privacy",
    type: "Page",
    locale: "en-US",
    status: "published",
  },
] as const;

function createLegacyBody(
  title: string,
  status: LegacyContentDocumentSeed["status"],
) {
  const statusLine =
    status === "published"
      ? "Published review fixture."
      : status === "changed"
        ? "Draft changes pending review."
        : "Draft review fixture.";

  return [`# ${title}`, "", statusLine].join("\n");
}

function createLegacyRecord(
  seed: LegacyContentDocumentSeed,
): ReviewContentDocumentRecord {
  const publishedVersion = seed.status === "draft" ? null : 1;
  const hasUnpublishedChanges = seed.status !== "published";
  const version = seed.status === "published" ? 1 : 2;
  const draftRevision = seed.status === "published" ? 1 : 2;
  const createdAt = "2026-04-01T09:00:00.000Z";
  const updatedAt = hasUnpublishedChanges
    ? "2026-04-05T10:00:00.000Z"
    : "2026-04-04T10:00:00.000Z";
  const translationGroupId = `${translationGroupPrefix}-${seed.id}`;
  const publishedBody = createLegacyBody(seed.title, "published");
  const draftBody = createLegacyBody(seed.title, seed.status);

  const document: ContentDocumentResponse = {
    documentId: seed.id,
    translationGroupId,
    project,
    environment,
    path: seed.path,
    type: seed.type,
    locale: seed.locale,
    format: "md",
    isDeleted: false,
    hasUnpublishedChanges,
    version,
    publishedVersion,
    draftRevision,
    frontmatter: {
      title: seed.title,
    },
    body: draftBody,
    createdBy,
    createdAt,
    updatedAt,
  };

  const versions: ContentVersionDocumentResponse[] = [
    {
      documentId: seed.id,
      translationGroupId,
      project,
      environment,
      version: 1,
      path: seed.path,
      type: seed.type,
      locale: seed.locale,
      format: "md",
      publishedAt: "2026-04-04T10:00:00.000Z",
      publishedBy,
      changeSummary: "Initial review publish",
      frontmatter: {
        title: seed.title,
      },
      body: publishedBody,
    },
  ];

  if (hasUnpublishedChanges) {
    versions.push({
      documentId: seed.id,
      translationGroupId,
      project,
      environment,
      version: 2,
      path: seed.path,
      type: seed.type,
      locale: seed.locale,
      format: "md",
      publishedAt: "2026-04-05T10:00:00.000Z",
      publishedBy,
      changeSummary:
        seed.status === "draft"
          ? "Draft prepared for review"
          : "Updated review fixture",
      frontmatter: {
        title: seed.title,
      },
      body: draftBody,
    });
  }

  return {
    document,
    versions,
  };
}

const legacyContentDocumentRecords = new Map(
  legacyContentDocumentSeeds.map((seed) => [seed.id, createLegacyRecord(seed)]),
);

export function getReviewContentDocumentRecord(
  scenarioId: string,
  documentId: string,
): ReviewContentDocumentRecord | undefined {
  const scenario = getReviewScenario(scenarioId);

  if (scenario.document.documentId === documentId) {
    return {
      document: scenario.document,
      versions: scenario.versions,
    };
  }

  return legacyContentDocumentRecords.get(documentId);
}
