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

test("diffDocumentVersions surfaces path, frontmatter, and body changes", () => {
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
      body: "# Launch Notes\nIntro 1\nShared line",
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
      body: "# Launch Notes Updated\nIntro 3 updated\nShared line\nExtra line",
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
      leftText: "# Launch Notes",
      rightText: "# Launch Notes Updated",
      status: "changed",
    },
    {
      leftLineNumber: 2,
      rightLineNumber: 2,
      leftText: "Intro 1",
      rightText: "Intro 3 updated",
      status: "changed",
    },
    {
      leftLineNumber: 3,
      rightLineNumber: 3,
      leftText: "Shared line",
      rightText: "Shared line",
      status: "unchanged",
    },
    {
      leftLineNumber: null,
      rightLineNumber: 4,
      leftText: null,
      rightText: "Extra line",
      status: "added",
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
