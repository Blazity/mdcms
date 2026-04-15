export type ReviewScenario = {
  id: string;
  title: string;
  capabilities: {
    schema: { read: boolean; write: boolean };
    content: {
      read: boolean;
      readDraft: boolean;
      write: boolean;
      publish: boolean;
      unpublish: boolean;
      delete: boolean;
    };
    users: { manage: boolean };
    settings: { manage: boolean };
  };
  schema: {
    mode: "ready" | "error";
    entries: Array<{
      type: string;
      directory: string;
      localized: boolean;
      schemaHash: string;
      syncedAt: string;
      resolvedSchema: {
        type: string;
        directory: string;
        localized: boolean;
        fields: Record<
          string,
          {
            kind: string;
            required: boolean;
            nullable: boolean;
          }
        >;
      };
    }>;
  };
  document: {
    documentId: string;
    translationGroupId: string;
    project: string;
    environment: string;
    type: string;
    locale: string;
    path: string;
    format: "md";
    isDeleted: boolean;
    hasUnpublishedChanges: boolean;
    version: number;
    publishedVersion: number;
    draftRevision: number;
    frontmatter: Record<string, unknown>;
    body: string;
    createdBy: string;
    createdAt: string;
    updatedBy: string;
    updatedAt: string;
  };
  versions: Array<{
    documentId: string;
    translationGroupId: string;
    project: string;
    environment: string;
    version: number;
    path: string;
    type: string;
    locale: string;
    format: "md";
    publishedAt: string;
    publishedBy: string;
    changeSummary?: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }>;
};

const project = "marketing-site";
const environment = "staging";
const documentId = "11111111-1111-4111-8111-111111111111";
const translationGroupId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const createdBy = "44444444-4444-4444-8444-444444444444";
const syncedAt = "2026-04-05T12:00:00.000Z";

function createSchemaEntries() {
  return [
    {
      type: "post",
      directory: "content/posts",
      localized: false,
      schemaHash: "schema-hash-post",
      syncedAt,
      resolvedSchema: {
        type: "post",
        directory: "content/posts",
        localized: false,
        fields: {
          featured: {
            kind: "boolean",
            required: true,
            nullable: false,
          },
          title: {
            kind: "string",
            required: true,
            nullable: false,
          },
          slug: {
            kind: "string",
            required: true,
            nullable: false,
          },
        },
      },
    },
    {
      type: "author",
      directory: "content/authors",
      localized: false,
      schemaHash: "schema-hash-author",
      syncedAt,
      resolvedSchema: {
        type: "author",
        directory: "content/authors",
        localized: false,
        fields: {
          name: {
            kind: "string",
            required: true,
            nullable: false,
          },
        },
      },
    },
  ] as const;
}

function createDraftDocument(overrides?: Partial<ReviewScenario["document"]>) {
  return {
    documentId,
    translationGroupId,
    project,
    environment,
    type: "post",
    locale: "en",
    path: "content/posts/hello-world",
    format: "md" as const,
    isDeleted: false,
    hasUnpublishedChanges: true,
    version: 5,
    publishedVersion: 4,
    draftRevision: 12,
    frontmatter: {
      title: "Hello World",
    },
    body: [
      "# Hello World",
      "",
      '<Callout tone="info">Preview scenario</Callout>',
      "",
      '<Chart type="bar" color="#0f766e" data={[12, 18, 9]} />',
    ].join("\n"),
    createdBy,
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedBy: createdBy,
    updatedAt: "2026-04-05T10:00:00.000Z",
    ...overrides,
  };
}

function createVersions(): ReviewScenario["versions"] {
  return [
    {
      documentId,
      translationGroupId,
      project,
      environment,
      version: 4,
      path: "content/posts/hello-world",
      type: "post",
      locale: "en",
      format: "md",
      publishedAt: "2026-04-04T10:00:00.000Z",
      publishedBy: actorId,
      changeSummary: "Initial publish",
      frontmatter: {
        title: "Hello World",
      },
      body: "# Hello World\n\nInitial publish body.",
    },
    {
      documentId,
      translationGroupId,
      project,
      environment,
      version: 5,
      path: "content/posts/hello-world",
      type: "post",
      locale: "en",
      format: "md",
      publishedAt: "2026-04-05T10:00:00.000Z",
      publishedBy: actorId,
      changeSummary: "Added review preview components",
      frontmatter: {
        title: "Hello World",
      },
      body: [
        "# Hello World",
        "",
        '<Callout tone="info">Preview scenario</Callout>',
      ].join("\n"),
    },
  ];
}

const scenarios: Record<string, ReviewScenario> = {
  owner: {
    id: "owner",
    title: "Owner Navigation Review",
    capabilities: {
      schema: { read: true, write: true },
      content: {
        read: true,
        readDraft: true,
        write: true,
        publish: true,
        unpublish: true,
        delete: true,
      },
      users: { manage: true },
      settings: { manage: true },
    },
    schema: {
      mode: "ready",
      entries: [...createSchemaEntries()],
    },
    document: createDraftDocument(),
    versions: createVersions(),
  },
  editor: {
    id: "editor",
    title: "Editor Document Review",
    capabilities: {
      schema: { read: true, write: false },
      content: {
        read: true,
        readDraft: true,
        write: true,
        publish: true,
        unpublish: false,
        delete: false,
      },
      users: { manage: false },
      settings: { manage: false },
    },
    schema: {
      mode: "ready",
      entries: [...createSchemaEntries()],
    },
    document: createDraftDocument(),
    versions: createVersions(),
  },
  viewer: {
    id: "viewer",
    title: "Viewer Access Review",
    capabilities: {
      schema: { read: false, write: false },
      content: {
        read: true,
        readDraft: false,
        write: false,
        publish: false,
        unpublish: false,
        delete: false,
      },
      users: { manage: false },
      settings: { manage: false },
    },
    schema: {
      mode: "ready",
      entries: [...createSchemaEntries()],
    },
    document: createDraftDocument({
      hasUnpublishedChanges: false,
      publishedVersion: 5,
      draftRevision: 5,
      body: "# Hello World\n\nViewer read-only scenario.",
    }),
    versions: createVersions(),
  },
  "schema-error": {
    id: "schema-error",
    title: "Schema Error Review",
    capabilities: {
      schema: { read: true, write: false },
      content: {
        read: true,
        readDraft: true,
        write: false,
        publish: false,
        unpublish: false,
        delete: false,
      },
      users: { manage: false },
      settings: { manage: false },
    },
    schema: {
      mode: "error",
      entries: [],
    },
    document: createDraftDocument(),
    versions: createVersions(),
  },
};

export function getReviewScenario(id: string): ReviewScenario {
  return scenarios[id] ?? scenarios.editor;
}

export function listReviewScenarios(): ReviewScenario[] {
  return Object.values(scenarios);
}
