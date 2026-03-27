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

test("diffDocumentVersions keeps large insertions and deletions aligned", () => {
  const leftBody = Array.from(
    { length: 80 },
    (_, index) => `Line ${index + 1}`,
  ).join("\n");
  const rightBody = [
    ...Array.from({ length: 9 }, (_, index) => `Line ${index + 1}`),
    "Inserted line 10",
    ...Array.from({ length: 60 }, (_, index) => `Line ${index + 10}`),
    ...Array.from({ length: 10 }, (_, index) => `Line ${index + 71}`),
  ].join("\n");

  const diff = diffDocumentVersions(
    createVersion(14, {
      body: leftBody,
      frontmatter: {},
    }),
    createVersion(15, {
      body: rightBody,
      frontmatter: {},
    }),
  );

  const counts = diff.body.lines.reduce(
    (accumulator, line) => {
      accumulator[line.status] += 1;
      return accumulator;
    },
    {
      unchanged: 0,
      added: 0,
      removed: 0,
      changed: 0,
    } satisfies Record<string, number>,
  );

  assert.equal(counts.added, 1);
  assert.equal(counts.removed, 1);
  assert.equal(counts.changed, 0);
  assert.equal(counts.unchanged, 79);
  assert.deepEqual(diff.body.lines.slice(8, 12), [
    {
      leftLineNumber: 9,
      rightLineNumber: 9,
      leftText: "Line 9",
      rightText: "Line 9",
      status: "unchanged",
    },
    {
      leftLineNumber: null,
      rightLineNumber: 10,
      leftText: null,
      rightText: "Inserted line 10",
      status: "added",
    },
    {
      leftLineNumber: 10,
      rightLineNumber: 11,
      leftText: "Line 10",
      rightText: "Line 10",
      status: "unchanged",
    },
    {
      leftLineNumber: 11,
      rightLineNumber: 12,
      leftText: "Line 11",
      rightText: "Line 11",
      status: "unchanged",
    },
  ]);
  assert.deepEqual(
    diff.body.lines.find((line) => line.leftLineNumber === 69),
    {
      leftLineNumber: 69,
      rightLineNumber: 70,
      leftText: "Line 69",
      rightText: "Line 69",
      status: "unchanged",
    },
  );
  assert.deepEqual(
    diff.body.lines.find((line) => line.leftLineNumber === 70),
    {
      leftLineNumber: 70,
      rightLineNumber: null,
      leftText: "Line 70",
      rightText: null,
      status: "removed",
    },
  );
  assert.deepEqual(
    diff.body.lines.find((line) => line.leftLineNumber === 71),
    {
      leftLineNumber: 71,
      rightLineNumber: 71,
      leftText: "Line 71",
      rightText: "Line 71",
      status: "unchanged",
    },
  );
});

test("diffDocumentVersions trims large shared context before diffing the middle window", () => {
  const shared = ["Shared A", "Shared B", "Shared C"];
  const prefix = Array.from(
    { length: 50 },
    (_, index) => shared[index % shared.length],
  );
  const suffix = Array.from(
    { length: 50 },
    (_, index) => shared[index % shared.length],
  );

  const leftBody = [...prefix, "Shared B", "Shared C", ...suffix].join("\n");
  const rightBody = [...prefix, "Shared C", "Shared X", ...suffix].join("\n");

  const diff = diffDocumentVersions(
    createVersion(16, {
      body: leftBody,
      frontmatter: {},
    }),
    createVersion(17, {
      body: rightBody,
      frontmatter: {},
    }),
  );

  assert.deepEqual(diff.body.lines.slice(49, 54), [
    {
      leftLineNumber: 50,
      rightLineNumber: 50,
      leftText: "Shared B",
      rightText: "Shared B",
      status: "unchanged",
    },
    {
      leftLineNumber: 51,
      rightLineNumber: null,
      leftText: "Shared B",
      rightText: null,
      status: "removed",
    },
    {
      leftLineNumber: 52,
      rightLineNumber: 51,
      leftText: "Shared C",
      rightText: "Shared C",
      status: "unchanged",
    },
    {
      leftLineNumber: null,
      rightLineNumber: 52,
      leftText: null,
      rightText: "Shared X",
      status: "added",
    },
    {
      leftLineNumber: 53,
      rightLineNumber: 53,
      leftText: "Shared A",
      rightText: "Shared A",
      status: "unchanged",
    },
  ]);
});

test("diffDocumentVersions keeps large mixed insertions and deletions aligned", () => {
  const leftBody = Array.from(
    { length: 200 },
    (_, index) => `Line ${index + 1}`,
  ).join("\n");
  const rightBody = [
    ...Array.from({ length: 9 }, (_, index) => `Line ${index + 1}`),
    "Inserted line 10",
    ...Array.from({ length: 160 }, (_, index) => `Line ${index + 10}`),
    ...Array.from({ length: 30 }, (_, index) => `Line ${index + 171}`),
  ].join("\n");

  const diff = diffDocumentVersions(
    createVersion(18, {
      body: leftBody,
      frontmatter: {},
    }),
    createVersion(19, {
      body: rightBody,
      frontmatter: {},
    }),
  );

  const counts = diff.body.lines.reduce(
    (accumulator, line) => {
      accumulator[line.status] += 1;
      return accumulator;
    },
    {
      unchanged: 0,
      added: 0,
      removed: 0,
      changed: 0,
    } satisfies Record<string, number>,
  );

  assert.equal(counts.unchanged, 199);
  assert.equal(counts.added, 1);
  assert.equal(counts.removed, 1);
  assert.equal(counts.changed, 0);
  assert.deepEqual(
    diff.body.lines.find((line) => line.rightLineNumber === 10),
    {
      leftLineNumber: null,
      rightLineNumber: 10,
      leftText: null,
      rightText: "Inserted line 10",
      status: "added",
    },
  );
  assert.deepEqual(
    diff.body.lines.find((line) => line.leftLineNumber === 170),
    {
      leftLineNumber: 170,
      rightLineNumber: null,
      leftText: "Line 170",
      rightText: null,
      status: "removed",
    },
  );
  assert.deepEqual(
    diff.body.lines.find((line) => line.leftLineNumber === 171),
    {
      leftLineNumber: 171,
      rightLineNumber: 171,
      leftText: "Line 171",
      rightText: "Line 171",
      status: "unchanged",
    },
  );
});
