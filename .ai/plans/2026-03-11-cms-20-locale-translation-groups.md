# CMS-20 Locale Translation Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the server content create endpoint so locale variants can be created in the same translation group using `sourceDocumentId`, with deterministic validation and conflict handling.

**Architecture:** Keep the existing `POST /api/v1/content` route and add an explicit variant-creation mode inside `apps/server/src/lib/content-api.ts`. Reuse the existing documents table and unique translation-locale index, add scoped source-document and schema-registry lookups in the DB-backed store, and cover the new behavior through in-memory and DB-backed content API tests.

**Tech Stack:** Bun, TypeScript, Elysia route handlers, Drizzle ORM, postgres.js, node:test, Nx

---

### Task 1: Add the Variant-Creation Contract to the Route and In-Memory Store

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing tests**

```ts
test("content API creates a locale variant in the same translation group when sourceDocumentId is provided", async () => {
  const handler = createHandler();

  const createSourceResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/hello-world",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "hello-world" },
        body: "english",
      }),
    }),
  );
  const source = (await createSourceResponse.json()) as {
    data: { documentId: string; translationGroupId: string };
  };

  const createVariantResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/hello-world",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "hello-world" },
        body: "french",
        sourceDocumentId: source.data.documentId,
      }),
    }),
  );
  const variant = (await createVariantResponse.json()) as {
    data: { documentId: string; translationGroupId: string; locale: string };
  };

  assert.equal(createVariantResponse.status, 200);
  assert.notEqual(variant.data.documentId, source.data.documentId);
  assert.equal(variant.data.translationGroupId, source.data.translationGroupId);
  assert.equal(variant.data.locale, "fr");
});

test("content API rejects a duplicate locale inside one translation group", async () => {
  const handler = createHandler();

  // Create source document, then create first fr variant.
  // Second fr variant request should fail with TRANSLATION_VARIANT_CONFLICT.
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because `ContentWritePayload` does not accept `sourceDocumentId`
yet and both stores always generate a new `translationGroupId` on create.

**Step 3: Write minimal implementation**

```ts
type ContentWritePayload = {
  path?: string;
  type?: string;
  locale?: string;
  format?: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  createdBy?: string;
  updatedBy?: string;
  sourceDocumentId?: string;
};

function findTranslationLocaleConflict(
  store: Map<string, ContentDocument>,
  input: {
    translationGroupId: string;
    locale: string;
    documentId?: string;
  },
) {
  for (const candidate of store.values()) {
    if (
      candidate.documentId !== input.documentId &&
      candidate.translationGroupId === input.translationGroupId &&
      candidate.locale === input.locale &&
      candidate.isDeleted === false
    ) {
      return candidate;
    }
  }

  return undefined;
}

// In create(...):
const sourceDocumentId = parseOptionalString(
  payload.sourceDocumentId,
  "sourceDocumentId",
);
const source =
  sourceDocumentId !== undefined ? store.get(sourceDocumentId) : undefined;

if (sourceDocumentId && (!source || source.isDeleted)) {
  throw new RuntimeError({
    code: "NOT_FOUND",
    message: "Source document not found.",
    statusCode: 404,
    details: { sourceDocumentId },
  });
}

if (source && source.type !== type) {
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: 'Field "type" must match the source document type.',
    statusCode: 400,
    details: { field: "type", sourceDocumentId },
  });
}

const translationGroupId = source?.translationGroupId ?? randomUUID();
const translationConflict = findTranslationLocaleConflict(store, {
  translationGroupId,
  locale,
});

if (translationConflict) {
  throw new RuntimeError({
    code: "TRANSLATION_VARIANT_CONFLICT",
    message:
      "A non-deleted document for this translation group and locale already exists.",
    statusCode: 409,
    details: {
      sourceDocumentId,
      translationGroupId,
      locale,
      conflictDocumentId: translationConflict.documentId,
    },
  });
}
```

Update the route handler so `sourceDocumentId` passes through unchanged in the
JSON body and the response stays on the existing `ContentDocument` shape.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for the new in-memory variant-creation coverage.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): add content variant creation contract"
```

### Task 2: Add DB-Backed Translation-Group Reuse and Scoped Source Resolution

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing database-backed tests**

```ts
testWithDatabase(
  "content API reuses the source translation group in the database store",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });

    // Create owner session, create source document, then create variant with
    // sourceDocumentId and assert:
    // - 200 response
    // - new documentId
    // - same translationGroupId
  },
);

testWithDatabase(
  "content API rejects sourceDocumentId from another routed scope",
  async () => {
    // Create source in marketing-site/production.
    // Reuse it from docs-site/production and assert 404 NOT_FOUND.
  },
);

testWithDatabase(
  "content API rejects soft-deleted sourceDocumentId values",
  async () => {
    // Create source, soft-delete it, then attempt variant creation and assert
    // 404 NOT_FOUND.
  },
);
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because the DB-backed store still creates a fresh
`translationGroupId` and does not resolve `sourceDocumentId`.

**Step 3: Write minimal implementation**

```ts
async function findTranslationLocaleConflict(
  scopeIds: { projectId: string; environmentId: string },
  input: {
    translationGroupId: string;
    locale: string;
    documentId?: string;
  },
) {
  const conditions = [
    eq(documents.projectId, scopeIds.projectId),
    eq(documents.environmentId, scopeIds.environmentId),
    eq(documents.translationGroupId, input.translationGroupId),
    eq(documents.locale, input.locale),
    eq(documents.isDeleted, false),
  ];

  if (input.documentId) {
    conditions.push(ne(documents.documentId, input.documentId));
  }

  return db.query.documents.findFirst({ where: and(...conditions) });
}

const sourceDocumentId = parseOptionalString(
  payload.sourceDocumentId,
  "sourceDocumentId",
);
const source = sourceDocumentId
  ? await db.query.documents.findFirst({
      where: and(
        eq(documents.projectId, scopeIds.projectId),
        eq(documents.environmentId, scopeIds.environmentId),
        eq(documents.documentId, sourceDocumentId),
        eq(documents.isDeleted, false),
      ),
    })
  : undefined;

if (sourceDocumentId && !source) {
  throw new RuntimeError({
    code: "NOT_FOUND",
    message: "Source document not found.",
    statusCode: 404,
    details: { sourceDocumentId },
  });
}

const translationGroupId = source?.translationGroupId ?? randomUUID();
```

Catch the unique-index race on
`uniq_documents_active_translation_locale` and map it to
`TRANSLATION_VARIANT_CONFLICT`, while keeping
`uniq_documents_active_path` mapped to `CONTENT_PATH_CONFLICT`.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for the new DB-backed source-resolution and translation-group
reuse cases.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): reuse translation groups for content variants"
```

### Task 3: Enforce Localized-Type and Supported-Locale Rules for Variant Creation

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing database-backed tests**

```ts
testWithDatabase(
  "content API rejects sourceDocumentId for non-localized schema types",
  async () => {
    // Seed schema_registry_entries.localized = false for Author.
    // Create Author source document, then attempt variant creation with
    // sourceDocumentId and assert 400 INVALID_INPUT.
  },
);

testWithDatabase(
  "content API rejects variant locales outside the synced supported locale set",
  async () => {
    // Seed schema_syncs.rawConfigSnapshot.locales.supported = ["en", "fr"] and
    // schema_registry_entries.localized = true for BlogPost.
    // Create source in en, then request locale "de" and assert 400 INVALID_INPUT.
  },
);
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because the DB-backed store does not yet consult schema registry
or synced locale config when `sourceDocumentId` is used.

**Step 3: Write minimal implementation**

```ts
async function readSupportedLocalesForScope(scopeIds: ScopeIds) {
  const syncRow = await db.query.schemaSyncs.findFirst({
    where: and(
      eq(schemaSyncs.projectId, scopeIds.projectId),
      eq(schemaSyncs.environmentId, scopeIds.environmentId),
    ),
  });

  const rawConfigSnapshot = syncRow?.rawConfigSnapshot;
  const locales = isRecord(rawConfigSnapshot)
    ? readSupportedLocales(rawConfigSnapshot as JsonObject)
    : undefined;

  return locales;
}

async function assertVariantLocalePolicy(
  scopeIds: ScopeIds,
  input: { type: string; locale: string; sourceDocumentId: string },
) {
  const schemaEntry = await db.query.schemaRegistryEntries.findFirst({
    where: and(
      eq(schemaRegistryEntries.projectId, scopeIds.projectId),
      eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
      eq(schemaRegistryEntries.schemaType, input.type),
    ),
  });

  if (!schemaEntry || !schemaEntry.localized) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message:
        "Locale variants can only be created for localized schema types.",
      statusCode: 400,
      details: {
        field: "sourceDocumentId",
        sourceDocumentId: input.sourceDocumentId,
      },
    });
  }

  const supportedLocales = await readSupportedLocalesForScope(scopeIds);
  if (!supportedLocales?.has(input.locale)) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Field "locale" must be one of the synced supported locales.`,
      statusCode: 400,
      details: { field: "locale", locale: input.locale },
    });
  }
}
```

Call the helper only in variant-creation mode. Do not broaden CMS-20 into full
schema-aware validation for every generic create/update request.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for non-localized and unsupported-locale variant failures.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): validate locale policy for content variants"
```

### Task 4: Document the Contract and Verify the CMS-20 Slice

**Files:**

- Modify: `apps/server/README.md`
- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Update point-of-use docs**

Add to the Content API section in `apps/server/README.md`:

```md
- `POST /api/v1/content` accepts optional `sourceDocumentId`.
- Omitting `sourceDocumentId` creates a new logical document with a fresh
  `translationGroupId`.
- Providing `sourceDocumentId` creates a locale variant in the same translation
  group and may return `TRANSLATION_VARIANT_CONFLICT` when that locale already
  exists in the group.
```

**Step 2: Run targeted server tests**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS

**Step 3: Run workspace formatting check**

Run: `bun run format:check`
Expected: PASS

**Step 4: Run workspace baseline check**

Run: `bun run check`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/README.md apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): document cms-20 locale variant contract"
```

## Notes

- `docs/plans/` is local-only in this repository. Do not stage or commit the
  design note or this implementation plan.
- No migration files are expected for CMS-20; the necessary columns and unique
  indexes already exist.
