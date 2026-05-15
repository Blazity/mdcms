/**
 * Mock data for the Studio global assistant.
 *
 * The assistant UI ships ahead of the `/api/v1/ai/chat/messages` endpoint
 * so editors can preview and shape the surface. This module produces a
 * deterministic store of threads, messages, and proposals that exercises
 * every proposal card variant: single edit, insert, create (with and
 * without body), invalid MDX, delete, and batch.
 */

import type {
  AssistantProposal,
  AssistantStore,
  AssistantThread,
} from "./assistant-types.js";

const NOW = "2026-05-07T10:14:00Z";

const PROPOSALS: Record<string, AssistantProposal> = {
  "p-edit-lede": {
    proposalId: "p-edit-lede",
    kind: "replace_selection",
    docPath: "blog/shipping-mdcms-0-4",
    type: "blog",
    locale: "en",
    summary: "Shorten opening paragraph · 58 → 27 words",
    baseDraftRevision: 17,
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "replace_selection",
      selectionId: "lede",
      originalText:
        "Today we're cutting MDCMS 0.4. The headline change is that the terminal is now the source of truth for publishing — every action you take in Studio has a one-line CLI equivalent, and every CLI action emits the exact same audit event Studio would. We've spent the last six weeks making the two surfaces actually agree.",
      replacementText:
        "MDCMS 0.4 ships today. The terminal is now the source of truth for publishing: every Studio action has a one-line CLI equivalent, and both emit the same audit event.",
    },
    diffStats: { added: 27, removed: 58 },
  },
  "p-edit-changelog": {
    proposalId: "p-edit-changelog",
    kind: "insert_block",
    docPath: "changelog/0-4",
    type: "changelog",
    locale: "en",
    summary: "Insert ‘Publishing’ section · 1 paragraph + bullet list",
    baseDraftRevision: 4,
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "insert_block",
      afterSelectionId: "section-cli",
      bodyMdx:
        "## Publishing\n\nThe terminal is the source of truth for publishing in 0.4. Every Studio action now has a one-line CLI equivalent and emits the same audit event.\n\n- Single publish state in Postgres\n- Identical audit envelope from both clients\n- `mdcms publish --dry-run` mirrors the Studio preview",
    },
    diffStats: { added: 6, removed: 0 },
  },
  "p-create-announce": {
    proposalId: "p-create-announce",
    kind: "create_document",
    docPath: "blog/announcements/2026-05",
    type: "blog",
    locale: "en",
    summary: "New post · 3 paragraphs, 2 internal links",
    validation: {
      status: "valid",
      checks: [
        { label: "schema · blog", ok: true },
        { label: "frontmatter required", ok: true },
        { label: "mdx components · 2 used", ok: true },
        { label: "internal links · 2/2 resolved", ok: true },
      ],
    },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "create_document",
      path: "blog/announcements/2026-05",
      format: "mdx",
      frontmatter: {
        title: "MDCMS 0.4 is here",
        description:
          "Terminal-first publishing, real locales, and a faster migrator.",
        publishedAt: "2026-05-07",
        author: "maciej",
        tags: ["release", "announcement"],
      },
      bodyPreview:
        'MDCMS 0.4 is out today. The terminal is now the source of truth for publishing — every Studio action has a one-line CLI equivalent. Read the full post: <Link to="blog/shipping-mdcms-0-4">Shipping 0.4</Link>.\n\nLocales are real now…',
      bodyLines: 14,
    },
  },
  "p-create-empty": {
    proposalId: "p-create-empty",
    kind: "create_document",
    docPath: "blog/drafts/2026-05-untitled",
    type: "blog",
    locale: "en",
    summary: "Create empty draft",
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "create_document",
      path: "blog/drafts/2026-05-untitled",
      format: "mdx",
      frontmatter: {
        title: "(untitled)",
        publishedAt: "2026-05-07",
        author: "maciej",
      },
      bodyPreview: "",
      bodyLines: 0,
    },
  },
  "p-invalid-mdx": {
    proposalId: "p-invalid-mdx",
    kind: "insert_block",
    docPath: "docs/components/callouts",
    type: "doc",
    locale: "en",
    summary: "Insert <NoteBox> example block",
    baseDraftRevision: 9,
    validation: {
      status: "invalid",
      errors: [
        {
          code: "MDX_UNKNOWN_COMPONENT",
          message:
            "<NoteBox> is not in the active component catalog. Did you mean <Callout>?",
          path: "body[3]",
        },
        {
          code: "MDX_MISSING_REQUIRED_PROP",
          message: "<Callout> requires prop `tone`.",
          path: "body[3].props",
        },
      ],
    },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "insert_block",
      afterSelectionId: "intro",
      bodyMdx:
        "<NoteBox>\n  Use callouts sparingly — they break reading flow.\n</NoteBox>",
    },
  },
  "p-delete-archive": {
    proposalId: "p-delete-archive",
    kind: "delete_document",
    docPath: "blog/legacy/2024-12-status",
    type: "blog",
    locale: "en",
    summary: "Delete stale 2024-12 status post · last edited 412 days ago",
    baseDraftRevision: 2,
    validation: {
      status: "valid",
      checks: [
        { label: "no inbound links", ok: true },
        { label: "no published version", ok: true },
        { label: "author confirmed actor", ok: true },
      ],
    },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "delete_document",
      path: "blog/legacy/2024-12-status",
      reason:
        "Superseded by /blog/shipping-mdcms-0-4 — content is no longer accurate.",
    },
  },
  "p-locale-pl-blog": {
    proposalId: "p-locale-pl-blog",
    kind: "create_document",
    docPath: "blog/shipping-mdcms-0-4",
    type: "blog",
    locale: "pl",
    summary: "New pl draft · 14 lines, 2 mdx components",
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "create_document",
      path: "blog/shipping-mdcms-0-4.pl.md",
      format: "md",
      frontmatter: { title: "Wydajemy MDCMS 0.4", locale: "pl" },
      bodyPreview:
        "---\ntitle: Wydajemy MDCMS 0.4\n---\n\nMDCMS 0.4 jest dostępne dziś…",
      bodyLines: 14,
    },
    diffStats: { added: 14, removed: 0 },
  },
  "p-locale-pl-changelog": {
    proposalId: "p-locale-pl-changelog",
    kind: "create_document",
    docPath: "changelog/0-4",
    type: "changelog",
    locale: "pl",
    summary: "New pl draft · 22 lines",
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "create_document",
      path: "changelog/0-4.pl.md",
      format: "md",
      frontmatter: { locale: "pl" },
      bodyPreview: "## 0.4\n\n- Terminal jako źródło prawdy dla publikowania",
      bodyLines: 22,
    },
    diffStats: { added: 22, removed: 0 },
  },
  "p-locale-pl-getting-started": {
    proposalId: "p-locale-pl-getting-started",
    kind: "create_document",
    docPath: "docs/getting-started",
    type: "docs",
    locale: "pl",
    summary: "New pl draft · 38 lines, 4 mdx components",
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "create_document",
      path: "docs/getting-started.pl.md",
      format: "md",
      frontmatter: { title: "Pierwsze kroki", locale: "pl" },
      bodyPreview: "# Pierwsze kroki\n\nMDCMS to nagłówkowy CMS oparty na…",
      bodyLines: 38,
    },
    diffStats: { added: 38, removed: 0 },
  },
  "p-locale-pl-config": {
    proposalId: "p-locale-pl-config",
    kind: "update_frontmatter",
    docPath: "config/locales",
    type: "config",
    locale: "—",
    summary: "Add `pl` to enabled locales",
    validation: { status: "valid" },
    expiresAt: "2026-05-07T10:24:00Z",
    op: {
      op: "update_frontmatter",
      patch: { enabled: ["en", "pl"], default: "en" },
    },
    diffStats: { added: 1, removed: 0 },
  },
};

const ACTIVE_THREAD: AssistantThread = {
  id: "t-rel04",
  title: "0.4 release post + changelog",
  pinned: true,
  updatedAt: "2026-05-07T10:12:00Z",
  preview: "Tighten the lede, mirror it in the changelog, draft a tweet.",
  docCount: 3,
  contextDocs: [
    { path: "blog/shipping-mdcms-0-4", type: "blog", locale: "en" },
    { path: "changelog/0-4", type: "changelog", locale: "en" },
  ],
  attachedSelection: {
    path: "blog/shipping-mdcms-0-4",
    text: "Today we're cutting MDCMS 0.4. The headline change is that the terminal is now the source of truth for publishing — every action you take in Studio has a one-line CLI equivalent…",
    selectionId: "lede",
  },
  messages: [
    {
      id: "m1",
      role: "user",
      at: "2026-05-07T09:58:00Z",
      text: "Tighten the lede on the 0.4 post — same content, half the words. And mirror the change into the 0.4 changelog entry.",
    },
    {
      id: "m2",
      role: "assistant",
      at: "2026-05-07T09:58:14Z",
      proposals: ["p-edit-lede", "p-edit-changelog"],
    },
    {
      id: "m3",
      role: "user",
      at: "2026-05-07T10:09:00Z",
      text: "Good. Now draft a short announcement post for /blog/announcements/2026-05 in en — three paragraphs, link to both.",
    },
    {
      id: "m4",
      role: "assistant",
      at: "2026-05-07T10:09:22Z",
      proposals: ["p-create-announce"],
    },
  ],
};

const OTHER_THREADS: AssistantThread[] = [
  {
    id: "t-locale",
    title: "Locale rollout — pl + de",
    updatedAt: "2026-05-06T17:40:00Z",
    docCount: 8,
    preview: "Seed Polish drafts from English; surface untranslated headings.",
    contextDocs: [],
    messages: [
      {
        id: "lm1",
        role: "user",
        at: "2026-05-06T17:38:00Z",
        text: "Seed Polish drafts from the four most-trafficked English posts.",
      },
      {
        id: "lm2",
        role: "assistant",
        at: "2026-05-06T17:40:00Z",
        proposals: [
          "p-locale-pl-blog",
          "p-locale-pl-changelog",
          "p-locale-pl-getting-started",
          "p-locale-pl-config",
        ],
      },
    ],
  },
  {
    id: "t-cleanup",
    title: "Archive 2024 changelogs",
    updatedAt: "2026-05-02T14:21:00Z",
    docCount: 6,
    preview: "Move six stale posts to /archive and unpublish.",
    contextDocs: [],
    messages: [
      {
        id: "cm1",
        role: "user",
        at: "2026-05-02T14:18:00Z",
        text: "The /blog/legacy/2024-12-status post is out of date and unlinked. Can you delete it?",
      },
      {
        id: "cm2",
        role: "assistant",
        at: "2026-05-02T14:21:00Z",
        proposals: ["p-delete-archive"],
      },
    ],
  },
  {
    id: "t-mdx",
    title: "Callouts component review",
    updatedAt: "2026-05-01T11:00:00Z",
    docCount: 1,
    preview: "Tried <NoteBox>; the model doesn't know about it yet.",
    contextDocs: [],
    messages: [
      {
        id: "im1",
        role: "user",
        at: "2026-05-01T10:58:00Z",
        text: "Add a NoteBox example block at the top of the callouts component doc.",
      },
      {
        id: "im2",
        role: "assistant",
        at: "2026-05-01T11:00:00Z",
        proposals: ["p-invalid-mdx"],
      },
    ],
  },
  {
    id: "t-empty",
    title: "Untitled draft",
    updatedAt: "2026-04-30T08:12:00Z",
    docCount: 1,
    preview: "Just spin up a placeholder so I can capture notes later.",
    contextDocs: [],
    messages: [
      {
        id: "em1",
        role: "user",
        at: "2026-04-30T08:10:00Z",
        text: "Make me an empty blog draft I can fill in later.",
      },
      {
        id: "em2",
        role: "assistant",
        at: "2026-04-30T08:12:00Z",
        proposals: ["p-create-empty"],
      },
    ],
  },
];

export function buildAssistantMockStore(): AssistantStore {
  return {
    now: NOW,
    activeThreadId: ACTIVE_THREAD.id,
    threads: [ACTIVE_THREAD, ...OTHER_THREADS],
    proposals: { ...PROPOSALS },
    wireProposals: {},
  };
}
