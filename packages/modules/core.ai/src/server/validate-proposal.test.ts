import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import type { SchemaRegistryTypeSnapshot } from "@mdcms/shared";

import type { AiProposalCandidate } from "./proposal-builder.js";
import {
  createSchemaAwareProposalValidator,
  type SchemaLookup,
} from "./validate-proposal.js";

const BLOG_SCHEMA: SchemaRegistryTypeSnapshot = {
  type: "blog",
  directory: "blog",
  localized: true,
  fields: {
    title: { kind: "string", required: true, nullable: false },
    date: { kind: "date", required: true, nullable: false },
    description: { kind: "string", required: false, nullable: true },
    tags: { kind: "array", required: false, nullable: false },
    published: { kind: "boolean", required: false, nullable: false },
  },
};

const PAGE_SCHEMA: SchemaRegistryTypeSnapshot = {
  type: "page",
  directory: "pages",
  localized: false,
  fields: {
    title: { kind: "string", required: true, nullable: false },
  },
};

const SCHEMA_REGISTRY: Record<string, SchemaRegistryTypeSnapshot> = {
  blog: BLOG_SCHEMA,
  page: PAGE_SCHEMA,
};

const lookup: SchemaLookup = async ({ type }) => SCHEMA_REGISTRY[type];

function createCandidate(
  overrides: Partial<AiProposalCandidate> = {},
): AiProposalCandidate {
  return {
    proposalId: "prop_test",
    kind: "create_document",
    project: "demo",
    environment: "draft",
    type: "blog",
    locale: "en",
    summary: "Test proposal",
    operations: [
      {
        op: "create_document",
        path: "blog/test",
        format: "md",
        frontmatter: {
          title: "Hello",
          date: "2026-05-15",
        },
        body: "Body content",
      },
    ],
    expiresAt: "2026-05-15T00:05:00.000Z",
    provider: {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "chat_tools.v1",
    },
    ...overrides,
  };
}

describe("createSchemaAwareProposalValidator — create_document", () => {
  test("accepts a proposal with all required fields", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(createCandidate());
    assert.equal(result.status, "valid");
  });

  test("flags an unknown content type", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(createCandidate({ type: "podcast" }));
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const codes = result.errors.map((e) => e.code);
      assert.ok(codes.includes("UNKNOWN_CONTENT_TYPE"));
    }
  });

  test("flags missing required frontmatter fields", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/test",
            format: "md",
            frontmatter: {},
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const requiredErrors = result.errors.filter(
        (e) => e.code === "MISSING_REQUIRED_FRONTMATTER",
      );
      // blog schema marks `title` and `date` as required
      assert.equal(requiredErrors.length, 2);
      const fields = requiredErrors.map((e) => e.path);
      assert.ok(fields.includes("frontmatter.title"));
      assert.ok(fields.includes("frontmatter.date"));
    }
  });

  test("flags unknown frontmatter fields", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/test",
            format: "md",
            frontmatter: {
              title: "Hi",
              date: "2026-05-15",
              madeUpField: "oops",
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const unknownErrors = result.errors.filter(
        (e) => e.code === "UNKNOWN_FRONTMATTER_FIELD",
      );
      assert.equal(unknownErrors.length, 1);
      assert.equal(unknownErrors[0]?.path, "frontmatter.madeUpField");
    }
  });

  test("flags wrong runtime types for frontmatter values", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/test",
            format: "md",
            frontmatter: {
              title: 42, // schema expects string
              date: "2026-05-15",
              tags: "not-an-array", // schema expects array
              published: "yes", // schema expects boolean
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const typeErrors = result.errors.filter(
        (e) => e.code === "INVALID_FRONTMATTER_TYPE",
      );
      assert.equal(typeErrors.length, 3);
    }
  });

  test("aggregates multiple errors", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/test",
            format: "md",
            frontmatter: {
              title: 42,
              unknownField: "extra",
              // missing: date
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const codes = result.errors.map((e) => e.code).sort();
      assert.deepEqual(
        codes,
        ["INVALID_FRONTMATTER_TYPE", "MISSING_REQUIRED_FRONTMATTER", "UNKNOWN_FRONTMATTER_FIELD"],
      );
    }
  });

  test("accepts nullable fields with null value", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/test",
            format: "md",
            frontmatter: {
              title: "Hi",
              date: "2026-05-15",
              description: null, // nullable: true
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "valid");
  });
});

describe("createSchemaAwareProposalValidator — update_frontmatter", () => {
  test("accepts a patch with known fields and correct types", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator({
      proposalId: "p1",
      kind: "update_frontmatter",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Update title",
      operations: [
        {
          op: "update_frontmatter",
          patch: { title: "New title", tags: ["a", "b"] },
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "valid");
  });

  test("flags unknown fields in patch", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator({
      proposalId: "p1",
      kind: "update_frontmatter",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Update",
      operations: [
        {
          op: "update_frontmatter",
          patch: { madeUp: "oops" },
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      assert.equal(result.errors[0]?.code, "UNKNOWN_FRONTMATTER_FIELD");
    }
  });

  test("does NOT enforce required fields on patch (update is a partial)", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    // patch only updates description (optional), even though blog requires title+date
    const result = await validator({
      proposalId: "p1",
      kind: "update_frontmatter",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Update description",
      operations: [
        {
          op: "update_frontmatter",
          patch: { description: "Just a description update" },
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "valid");
  });
});

describe("createSchemaAwareProposalValidator — other kinds", () => {
  test("replace_selection is shape-valid (no MDX catalog yet)", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator({
      proposalId: "p1",
      kind: "replace_selection",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Replace",
      operations: [
        {
          op: "replace_selection",
          selectionId: "sel_1",
          originalText: "old",
          replacementText: "new",
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "valid");
  });

  test("insert_block is shape-valid (no MDX catalog yet)", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator({
      proposalId: "p1",
      kind: "insert_block",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Insert",
      operations: [
        {
          op: "insert_block",
          bodyMdx: "<Callout>hi</Callout>",
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "valid");
  });

  test("delete_document is shape-valid (chat-tools handles published-version check)", async () => {
    const validator = createSchemaAwareProposalValidator({ schemaLookup: lookup });
    const result = await validator({
      proposalId: "p1",
      kind: "delete_document",
      project: "demo",
      environment: "draft",
      type: "blog",
      locale: "en",
      summary: "Delete",
      documentId: "doc_1",
      baseDraftRevision: 4,
      operations: [
        {
          op: "delete_document",
          path: "blog/old",
        },
      ],
      expiresAt: "2026-05-15T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "valid");
  });
});

describe("createSchemaAwareProposalValidator — PATH_ALREADY_IN_USE", () => {
  test("flags create_document with a taken path", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: lookup,
      pathExists: async ({ path }) => path === "blog/existing",
    });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/existing",
            format: "md",
            frontmatter: { title: "Hi", date: "2026-05-15" },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const codes = result.errors.map((e) => e.code);
      assert.ok(codes.includes("PATH_ALREADY_IN_USE"));
    }
  });

  test("allows create_document at a fresh path", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: lookup,
      pathExists: async () => false,
    });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/fresh",
            format: "md",
            frontmatter: { title: "Hi", date: "2026-05-15" },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "valid");
  });

  test("skips path check when pathExists is not provided", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: lookup,
    });
    const result = await validator(
      createCandidate({
        operations: [
          {
            op: "create_document",
            path: "blog/anything",
            format: "md",
            frontmatter: { title: "Hi", date: "2026-05-15" },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "valid");
  });
});
