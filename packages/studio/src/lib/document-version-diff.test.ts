import assert from "node:assert/strict";

import { test } from "bun:test";

import { diffDocumentVersions } from "./document-version-diff.js";
import type { ContentVersionDocumentResponse } from "@mdcms/shared";

function createVersion(
  version: number,
  overrides: Partial<ContentVersionDocumentResponse> = {},
): ContentVersionDocumentResponse {
  return {
    documentId: "11111111-1111-4111-8111-111111111111",
    translationGroupId: "22222222-2222-4222-8222-222222222222",
    project: "marketing-site",
    environment: "staging",
    version,
    path: `blog/post-${version}`,
    type: "BlogPost",
    locale: "en",
    format: "md",
    publishedAt: `2026-03-0${version}T10:00:00.000Z`,
    publishedBy: `44444444-4444-4444-8444-44444444444${version}`,
    frontmatter: {
      seo: {
        description: `Description ${version}`,
        featured: false,
      },
      title: `Title ${version}`,
    },
    body: `# Title ${version}\nIntro ${version}\nShared line`,
    ...overrides,
  };
}

test("diffDocumentVersions compares any two selected versions", () => {
  const versions = [
    createVersion(1, {
      path: "blog/launch-notes",
      frontmatter: {
        seo: {
          description: "Description 1",
          featured: false,
        },
        title: "Launch Notes",
      },
      body: "# Launch Notes\nIntro 1\nShared line",
    }),
    createVersion(2, {
      path: "blog/launch-notes",
      frontmatter: {
        seo: {
          description: "Description 2",
          featured: false,
        },
        title: "Launch Notes",
      },
      body: "# Launch Notes\nIntro 2\nShared line",
    }),
    createVersion(3, {
      path: "blog/launch-notes-updated",
      frontmatter: {
        seo: {
          description: "Updated description",
          featured: true,
        },
        title: "Launch Notes Updated",
      },
      body: "# Launch Notes Updated\nIntro 3 updated\nShared line\nExtra line",
    }),
  ];

  const diff = diffDocumentVersions(versions[0], versions[2]);

  assert.equal(diff.leftVersion, 1);
  assert.equal(diff.rightVersion, 3);
});

test("diffDocumentVersions surfaces path, frontmatter, and inserted body lines", () => {
  const diff = diffDocumentVersions(
    createVersion(1, {
      path: "blog/launch-notes",
      frontmatter: {
        seo: {
          description: "Old description",
          featured: false,
        },
        title: "Launch Notes",
      },
      body: "Intro 1\nShared line",
    }),
    createVersion(3, {
      path: "blog/launch-notes-updated",
      frontmatter: {
        seo: {
          description: "New description",
          featured: true,
        },
        title: "Launch Notes Updated",
      },
      body: "Intro 1\nInserted line\nShared line",
    }),
  );

  assert.deepEqual(diff.path, {
    before: "blog/launch-notes",
    after: "blog/launch-notes-updated",
    changed: true,
  });

  assert.deepEqual(diff.frontmatter.changes, [
    {
      path: "seo.description",
      before: "Old description",
      after: "New description",
    },
    {
      path: "seo.featured",
      before: false,
      after: true,
    },
    {
      path: "title",
      before: "Launch Notes",
      after: "Launch Notes Updated",
    },
  ]);

  assert.deepEqual(diff.body.lines, [
    {
      leftLineNumber: 1,
      rightLineNumber: 1,
      leftText: "Intro 1",
      rightText: "Intro 1",
      status: "unchanged",
    },
    {
      leftLineNumber: null,
      rightLineNumber: 2,
      leftText: null,
      rightText: "Inserted line",
      status: "added",
    },
    {
      leftLineNumber: 2,
      rightLineNumber: 3,
      leftText: "Shared line",
      rightText: "Shared line",
      status: "unchanged",
    },
  ]);
});

test("diffDocumentVersions emits changed rows for one-to-one substitutions", () => {
  const diff = diffDocumentVersions(
    createVersion(10, {
      body: "Intro\nOriginal line\nOutro",
      frontmatter: {},
    }),
    createVersion(11, {
      body: "Intro\nUpdated line\nOutro",
      frontmatter: {},
    }),
  );

  assert.deepEqual(diff.body.lines, [
    {
      leftLineNumber: 1,
      rightLineNumber: 1,
      leftText: "Intro",
      rightText: "Intro",
      status: "unchanged",
    },
    {
      leftLineNumber: 2,
      rightLineNumber: 2,
      leftText: "Original line",
      rightText: "Updated line",
      status: "changed",
    },
    {
      leftLineNumber: 3,
      rightLineNumber: 3,
      leftText: "Outro",
      rightText: "Outro",
      status: "unchanged",
    },
  ]);
});

test("diffDocumentVersions keeps deterministic ordering for equivalent inputs", () => {
  const left = createVersion(4, {
    path: "blog/deterministic",
    frontmatter: {
      seo: {
        description: "Stable description",
        featured: false,
      },
      title: "Stable title",
    },
    body: "# Stable title\nLine A\nLine B",
  });
  const right = createVersion(5, {
    path: "blog/deterministic-updated",
    frontmatter: {
      seo: {
        description: "Changed description",
        featured: true,
      },
      title: "Stable title updated",
    },
    body: "# Stable title updated\nLine A changed\nLine B\nLine C",
  });

  const first = diffDocumentVersions(left, right);
  const second = diffDocumentVersions(left, right);

  assert.deepEqual(first, second);
});

test("diffDocumentVersions keeps empty bodies empty", () => {
  const diff = diffDocumentVersions(
    createVersion(6, {
      body: "",
      frontmatter: {},
    }),
    createVersion(7, {
      body: "",
      frontmatter: {},
    }),
  );

  assert.equal(diff.body.changed, false);
  assert.deepEqual(diff.body.lines, []);
});

test("diffDocumentVersions normalizes CRLF line endings", () => {
  const diff = diffDocumentVersions(
    createVersion(8, {
      body: "Line 1\r\nLine 2",
      frontmatter: {},
    }),
    createVersion(9, {
      body: "Line 1\nLine 2",
      frontmatter: {},
    }),
  );

  assert.equal(diff.body.changed, false);
  assert.deepEqual(diff.body.lines, [
    {
      leftLineNumber: 1,
      rightLineNumber: 1,
      leftText: "Line 1",
      rightText: "Line 1",
      status: "unchanged",
    },
    {
      leftLineNumber: 2,
      rightLineNumber: 2,
      leftText: "Line 2",
      rightText: "Line 2",
      status: "unchanged",
    },
  ]);
});

test("diffDocumentVersions uses a deterministic fallback for large bodies", () => {
  const leftBody = Array.from({ length: 80 }, (_, index) =>
    index === 39 ? "Middle line" : `Line ${index + 1}`,
  ).join("\n");
  const rightBody = Array.from({ length: 80 }, (_, index) =>
    index === 39 ? "Updated middle line" : `Line ${index + 1}`,
  ).join("\n");

  const left = createVersion(12, {
    body: leftBody,
    frontmatter: {},
  });
  const right = createVersion(13, {
    body: rightBody,
    frontmatter: {},
  });

  const first = diffDocumentVersions(left, right);
  const second = diffDocumentVersions(left, right);

  assert.deepEqual(first, second);
  assert.equal(first.body.lines.length, 80);
  assert.deepEqual(first.body.lines[39], {
    leftLineNumber: 40,
    rightLineNumber: 40,
    leftText: "Middle line",
    rightText: "Updated middle line",
    status: "changed",
  });
});
