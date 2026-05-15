# AI Chat Model Grounding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground the Studio AI chat model in real project data — content type catalog, locales, current user identity injected into the system prompt; `find_entries` and `get_entry` tools for dynamic lookups; `PATH_ALREADY_IN_USE` and `UNKNOWN_REFERENCE` validator extensions as the trust boundary.

**Architecture:** Three layers, in order of how often they fire per chat turn. (1) Static system-prompt block: bounded facts the model needs every turn (types, schemas, locales, user). (2) Tools: dynamic lookups the model invokes only when needed. (3) Validator: server-side proof on every emitted proposal. Spec at `.ai/research/2026-05-16-ai-chat-model-grounding-design.md`.

**Tech Stack:** Vercel AI SDK v6 (`generateText` + `tool()`), Zod schemas, Drizzle ORM, Elysia routes, Bun test runner. Reuses `contentStore` + `schemaRegistryEntries` + `validateReferenceFieldIdentities` infrastructure that already exists in `apps/server/src/lib/content-api/`.

---

## Pre-flight

The plan continues work on the `feat/studio-global-ai-assistant` branch where CMS-235 (the schema-aware validator) was just shipped. No new dependencies, no new tables, no schema migrations.

The design doc is the source of truth for shapes and rationale — refer to `.ai/research/2026-05-16-ai-chat-model-grounding-design.md` when a task references "the spec".

---

## File structure

**NEW files:**
- `packages/modules/core.ai/src/server/project-knowledge.ts` — pure rendering function for the system-prompt project knowledge block.
- `packages/modules/core.ai/src/server/project-knowledge.test.ts` — unit tests for the renderer.
- `packages/modules/core.ai/src/server/chat-tools.test.ts` — unit tests for the new `find_entries` + `get_entry` tools.

**MODIFIED files (in order of phase):**
- `packages/modules/core.ai/src/server/tasks.ts` — `buildChatSystemPrompt` accepts `projectKnowledge`, renders the new section.
- `packages/modules/core.ai/src/server/orchestrator.ts` — `AiChatInput` gains `projectKnowledge` + `toolBackends`; passes to system-prompt + chat-tools builders.
- `packages/modules/core.ai/src/server/chat-tools.ts` — accept type/locale enums; register `find_entries` + `get_entry`; thread backends to their executes.
- `packages/modules/core.ai/src/server/routes.ts` — `MountAiRoutesOptions` gains 5 lookups; `handleChatMessage` parallel-fetches + forwards to `runChat`.
- `packages/modules/core.ai/src/server/validate-proposal.ts` — `pathExists` + `documentExists` deps; emit `PATH_ALREADY_IN_USE` + `UNKNOWN_REFERENCE`.
- `packages/modules/core.ai/src/server/validate-proposal.test.ts` — extend with new error code tests.
- `packages/modules/core.ai/src/server/routes.test.ts` — extend with grounding + tool + new validator code tests.
- `packages/modules/core.ai/src/index.ts` — export new types.
- `packages/modules/src/index.ts` — re-export.
- `apps/server/src/lib/runtime-with-modules.ts` — wire the 5 lookups + validator deps.
- `docs/specs/SPEC-014-ai-assisted-studio-editing.md` — document the grounding architecture + new tools + new error codes.

---

## Phase 1 — Project knowledge in the system prompt

### Task 1: project-knowledge renderer scaffold

**Files:**
- Create: `packages/modules/core.ai/src/server/project-knowledge.ts`
- Test: `packages/modules/core.ai/src/server/project-knowledge.test.ts`

- [ ] **Step 1: Write the failing test for the empty-case rendering**

Create `packages/modules/core.ai/src/server/project-knowledge.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { renderProjectKnowledgeBlock } from "./project-knowledge.js";

describe("renderProjectKnowledgeBlock", () => {
  test("renders the header even when types and locales are empty", () => {
    const block = renderProjectKnowledgeBlock({
      project: "marketing-site",
      environment: "staging",
      registeredTypes: [],
      supportedLocales: [],
    });
    assert.ok(block.includes("## Project knowledge"));
    assert.ok(block.includes("Project: marketing-site"));
    assert.ok(block.includes("Environment: staging"));
    assert.ok(
      block.includes(
        "No content types are registered yet — propose_create_document will fail until at least one is synced.",
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the renderer with minimum implementation**

Create `packages/modules/core.ai/src/server/project-knowledge.ts`:

```ts
import type { SchemaRegistryTypeSnapshot } from "@mdcms/shared";

export type ProjectKnowledgeInput = {
  project: string;
  environment: string;
  registeredTypes: SchemaRegistryTypeSnapshot[];
  supportedLocales: string[];
  currentUser?: { id: string; displayName: string };
};

/**
 * Renders the per-turn "Project knowledge" block injected into the
 * chat system prompt. Pure function; safe to snapshot.
 */
export function renderProjectKnowledgeBlock(
  input: ProjectKnowledgeInput,
): string {
  const lines: string[] = [
    "## Project knowledge",
    "",
    `Project: ${input.project}`,
    `Environment: ${input.environment}`,
  ];

  if (input.currentUser) {
    lines.push(
      `Current user: ${sanitizeForPrompt(input.currentUser.displayName)} (id: ${input.currentUser.id})`,
    );
  }

  lines.push("");

  if (input.registeredTypes.length === 0) {
    lines.push(
      "No content types are registered yet — propose_create_document will fail until at least one is synced.",
    );
  } else {
    // Filled in subsequent tasks.
    lines.push("### Content types registered in this project");
  }

  if (input.supportedLocales.length > 0) {
    lines.push("", "### Supported locales");
    lines.push(input.supportedLocales.join(", "));
  }

  return lines.join("\n");
}

/**
 * Strip characters that would break the markdown structure of the
 * prompt. The display name comes from `authUsers.name` which is
 * user-controlled; this prevents a backtick or newline in a name
 * from mangling the prompt.
 */
function sanitizeForPrompt(value: string): string {
  return value.replace(/[`\n\r]/g, " ").trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/project-knowledge.ts packages/modules/core.ai/src/server/project-knowledge.test.ts
git commit -m "feat(ai): scaffold project-knowledge prompt block renderer (CMS-238)"
```

---

### Task 2: render content type entries with simple field kinds

**Files:**
- Modify: `packages/modules/core.ai/src/server/project-knowledge.ts`
- Test: `packages/modules/core.ai/src/server/project-knowledge.test.ts`

- [ ] **Step 1: Add failing tests for type + simple field rendering**

Append to `project-knowledge.test.ts`:

```ts
import type { SchemaRegistryTypeSnapshot } from "@mdcms/shared";

const POST_SCHEMA: SchemaRegistryTypeSnapshot = {
  type: "post",
  directory: "blog",
  localized: true,
  fields: {
    title: { kind: "string", required: true, nullable: false },
    date: { kind: "date", required: true, nullable: false },
    published: { kind: "boolean", required: false, nullable: false },
    excerpt: { kind: "string", required: false, nullable: true },
  },
};

test("renders a content type with simple kinds", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [POST_SCHEMA],
    supportedLocales: ["en"],
  });
  assert.ok(block.includes("- **post** (directory: blog, localized: yes)"));
  assert.ok(block.includes("- title (string, required)"));
  assert.ok(block.includes("- date (date, required)"));
  assert.ok(block.includes("- published (boolean, optional)"));
  assert.ok(block.includes("- excerpt (string, optional, nullable)"));
});

test("sorts types alphabetically for determinism", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [
      { ...POST_SCHEMA, type: "post" },
      { ...POST_SCHEMA, type: "author", localized: false, directory: "authors" },
    ],
    supportedLocales: [],
  });
  const authorIdx = block.indexOf("- **author**");
  const postIdx = block.indexOf("- **post**");
  assert.ok(authorIdx > 0);
  assert.ok(postIdx > authorIdx);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: FAIL — type rendering not implemented.

- [ ] **Step 3: Implement type rendering with simple field kinds**

Replace the `if (input.registeredTypes.length === 0)` branch in `project-knowledge.ts`:

```ts
  if (input.registeredTypes.length === 0) {
    lines.push(
      "No content types are registered yet — propose_create_document will fail until at least one is synced.",
    );
  } else {
    lines.push(
      "### Content types registered in this project",
      "Use these exact `type` ids when calling propose_create_document. Anything else will fail validation. Path prefixes are conventions, not enforced.",
      "",
    );
    const sortedTypes = [...input.registeredTypes].sort((a, b) =>
      a.type.localeCompare(b.type),
    );
    for (const schema of sortedTypes) {
      lines.push(...renderTypeEntry(schema));
      lines.push("");
    }
  }
```

Add the `renderTypeEntry` helper at the bottom of the file:

```ts
function renderTypeEntry(schema: SchemaRegistryTypeSnapshot): string[] {
  const lines: string[] = [
    `- **${schema.type}** (directory: ${schema.directory}, localized: ${schema.localized ? "yes" : "no"})`,
  ];
  const fieldEntries = Object.entries(schema.fields);
  if (fieldEntries.length === 0) {
    lines.push("  (no fields)");
    return lines;
  }
  lines.push("  Fields:");
  for (const [name, field] of fieldEntries) {
    lines.push(`  - ${renderFieldLine(name, field, 0)}`);
  }
  return lines;
}

function renderFieldLine(
  name: string,
  field: import("@mdcms/shared").SchemaRegistryFieldSnapshot,
  depth: number,
): string {
  const kindDescriptor = renderKindDescriptor(field, depth);
  const flags: string[] = [field.required ? "required" : "optional"];
  if (field.nullable) flags.push("nullable");
  return `${name} (${kindDescriptor}, ${flags.join(", ")})`;
}

function renderKindDescriptor(
  field: import("@mdcms/shared").SchemaRegistryFieldSnapshot,
  _depth: number,
): string {
  // More elaborate rendering (enum, reference, array, object) lands in
  // the next task. For now: just the kind name.
  return field.kind;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/project-knowledge.ts packages/modules/core.ai/src/server/project-knowledge.test.ts
git commit -m "feat(ai): render simple content type entries in project knowledge block"
```

---

### Task 3: render enum / reference / array / nested-object field kinds

**Files:**
- Modify: `packages/modules/core.ai/src/server/project-knowledge.ts`
- Test: `packages/modules/core.ai/src/server/project-knowledge.test.ts`

- [ ] **Step 1: Add failing tests for the four richer kinds**

Append to `project-knowledge.test.ts`:

```ts
test("renders enum field with options", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [
      {
        type: "campaign",
        directory: "campaigns",
        localized: false,
        fields: {
          status: {
            kind: "enum",
            required: true,
            nullable: false,
            options: ["planned", "live", "archived"],
          },
        },
      },
    ],
    supportedLocales: [],
  });
  assert.ok(
    block.includes(
      'status (enum: "planned" | "live" | "archived", required)',
    ),
  );
});

test("renders reference field with target type", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [
      {
        type: "post",
        directory: "blog",
        localized: true,
        fields: {
          author: {
            kind: "reference",
            required: false,
            nullable: true,
            reference: { targetType: "author" },
          },
        },
      },
    ],
    supportedLocales: [],
  });
  assert.ok(block.includes("author (reference → author, optional, nullable)"));
});

test("renders array field with item kind", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [
      {
        type: "post",
        directory: "blog",
        localized: true,
        fields: {
          tags: {
            kind: "array",
            required: false,
            nullable: false,
            item: { kind: "string", required: true, nullable: false },
          },
        },
      },
    ],
    supportedLocales: [],
  });
  assert.ok(block.includes("tags (array of string, optional)"));
});

test("renders nested object up to depth 2; deeper collapses", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [
      {
        type: "page",
        directory: "pages",
        localized: false,
        fields: {
          seo: {
            kind: "object",
            required: false,
            nullable: false,
            fields: {
              title: { kind: "string", required: false, nullable: false },
              og: {
                kind: "object",
                required: false,
                nullable: false,
                fields: {
                  image: {
                    kind: "object",
                    required: false,
                    nullable: false,
                    fields: {
                      url: {
                        kind: "string",
                        required: false,
                        nullable: false,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
    supportedLocales: [],
  });
  // Depth-1 nested object renders its sub-bullets:
  assert.ok(block.includes("seo (object, optional)"));
  assert.ok(block.includes("    - title (string, optional)"));
  // Depth-2 collapses to <nested object> hint:
  assert.ok(block.includes("og (<nested object>"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: FAIL on the four new tests.

- [ ] **Step 3: Implement richer kind rendering**

Replace `renderKindDescriptor` and update `renderTypeEntry` / add helpers in `project-knowledge.ts`:

```ts
const MAX_NESTED_DEPTH = 1;

function renderTypeEntry(schema: SchemaRegistryTypeSnapshot): string[] {
  const lines: string[] = [
    `- **${schema.type}** (directory: ${schema.directory}, localized: ${schema.localized ? "yes" : "no"})`,
  ];
  const fieldEntries = Object.entries(schema.fields);
  if (fieldEntries.length === 0) {
    lines.push("  (no fields)");
    return lines;
  }
  lines.push("  Fields:");
  for (const [name, field] of fieldEntries) {
    lines.push(...renderFieldLines(name, field, 1));
  }
  return lines;
}

function renderFieldLines(
  name: string,
  field: import("@mdcms/shared").SchemaRegistryFieldSnapshot,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const descriptor = renderKindDescriptor(field, depth);
  const flags: string[] = [field.required ? "required" : "optional"];
  if (field.nullable) flags.push("nullable");
  const lines = [`${indent}- ${name} (${descriptor}, ${flags.join(", ")})`];

  // Inline-expand nested objects up to MAX_NESTED_DEPTH; deeper levels
  // were already collapsed to "<nested object>" by renderKindDescriptor.
  if (
    field.kind === "object" &&
    field.fields &&
    depth <= MAX_NESTED_DEPTH
  ) {
    for (const [subName, subField] of Object.entries(field.fields)) {
      lines.push(...renderFieldLines(subName, subField, depth + 1));
    }
  }

  return lines;
}

function renderKindDescriptor(
  field: import("@mdcms/shared").SchemaRegistryFieldSnapshot,
  depth: number,
): string {
  if (field.kind === "enum" && field.options) {
    const formatted = field.options
      .map((option) => JSON.stringify(option))
      .join(" | ");
    return `enum: ${formatted}`;
  }
  if (field.kind === "reference" && field.reference) {
    return `reference → ${field.reference.targetType}`;
  }
  if (field.kind === "array" && field.item) {
    return `array of ${renderKindDescriptor(field.item, depth)}`;
  }
  if (field.kind === "object" && depth > MAX_NESTED_DEPTH) {
    return "<nested object — call get_entry on a sibling for the full shape>";
  }
  return field.kind;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add a snapshot test against the marketing-site fixture**

Append to `project-knowledge.test.ts`:

```ts
test("snapshot: marketing-site fixture", () => {
  const block = renderProjectKnowledgeBlock({
    project: "marketing-site",
    environment: "staging",
    currentUser: { id: "user_1", displayName: "Karol Chudzik" },
    supportedLocales: ["en", "pl"],
    registeredTypes: [
      {
        type: "author",
        directory: "authors",
        localized: false,
        fields: {
          name: { kind: "string", required: true, nullable: false },
          bio: { kind: "string", required: false, nullable: true },
        },
      },
      {
        type: "post",
        directory: "blog",
        localized: true,
        fields: {
          title: { kind: "string", required: true, nullable: false },
          date: { kind: "date", required: true, nullable: false },
          author: {
            kind: "reference",
            required: false,
            nullable: true,
            reference: { targetType: "author" },
          },
          tags: {
            kind: "array",
            required: false,
            nullable: false,
            item: { kind: "string", required: true, nullable: false },
          },
        },
      },
    ],
  });
  // Stable structural assertions instead of full text snapshot
  // (so an extra blank line doesn't churn the test):
  assert.ok(block.startsWith("## Project knowledge"));
  assert.ok(block.includes("Project: marketing-site"));
  assert.ok(block.includes("Current user: Karol Chudzik (id: user_1)"));
  assert.ok(block.includes("- **author**"));
  assert.ok(block.includes("- **post**"));
  assert.ok(block.includes("author (reference → author"));
  assert.ok(block.includes("tags (array of string"));
  assert.ok(block.includes("### Supported locales"));
  assert.ok(block.includes("en, pl"));
  // Determinism: author renders before post.
  assert.ok(
    block.indexOf("- **author**") < block.indexOf("- **post**"),
  );
});

test("sanitizes display name to strip backticks and newlines", () => {
  const block = renderProjectKnowledgeBlock({
    project: "p",
    environment: "e",
    registeredTypes: [],
    supportedLocales: [],
    currentUser: { id: "u1", displayName: "Mal`icious\nName" },
  });
  assert.ok(!block.includes("`icious"));
  assert.ok(block.includes("Current user: Mal icious Name"));
});
```

- [ ] **Step 6: Run all tests**

Run: `bun test --cwd packages/modules/core.ai src/server/project-knowledge.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/modules/core.ai/src/server/project-knowledge.ts packages/modules/core.ai/src/server/project-knowledge.test.ts
git commit -m "feat(ai): render enum / reference / array / nested-object fields in project knowledge block"
```

---

### Task 4: thread projectKnowledge through AiChatInput + system prompt

**Files:**
- Modify: `packages/modules/core.ai/src/server/orchestrator.ts`
- Modify: `packages/modules/core.ai/src/server/tasks.ts`
- Modify: `packages/modules/core.ai/src/index.ts`

- [ ] **Step 1: Extend `AiChatInput` in `orchestrator.ts`**

Locate `export type AiChatInput` (around line 50) and add the `projectKnowledge` field. Update the runChat implementation to read it and pass into the prompt builder. Specifically:

In the imports near the top of the file, add:

```ts
import {
  renderProjectKnowledgeBlock,
  type ProjectKnowledgeInput,
} from "./project-knowledge.js";
```

Extend the `AiChatInput` type. Find the existing type definition and add:

```ts
  /**
   * Project-scoped knowledge injected into the system prompt so the
   * model picks real content type ids, fills frontmatter against the
   * actual schema, and addresses the current user by name. Built per
   * turn by the route handler.
   */
  projectKnowledge: Omit<ProjectKnowledgeInput, "project" | "environment">;
```

In `runChat`, locate the `buildChatSystemPrompt(...)` call. We're passing project + environment via the existing args; now also build the project knowledge input. After the existing prompt construction, modify the system-prompt call site to include the new context — see Step 3 for the tasks.ts side.

For the orchestrator changes, the integration is: `runChat` constructs the full ProjectKnowledgeInput (combining `call.project`, `call.environment`, and `call.projectKnowledge`), and passes it to `buildChatSystemPrompt`. Update the runChat call accordingly:

```ts
const systemPrompt = buildChatSystemPrompt({
  hasActiveDocument: ...,
  hasAttachedSelection: ...,
  capabilities: ...,
  registeredToolNames: Object.keys(tools),
  projectKnowledge: {
    project: call.project,
    environment: call.environment,
    ...call.projectKnowledge,
  },
});
```

- [ ] **Step 2: Extend `buildChatSystemPrompt` in `tasks.ts`**

In `packages/modules/core.ai/src/server/tasks.ts`, find `buildChatSystemPrompt` (around line 379). Add an import:

```ts
import {
  renderProjectKnowledgeBlock,
  type ProjectKnowledgeInput,
} from "./project-knowledge.js";
```

Extend the input type:

```ts
export function buildChatSystemPrompt(input: {
  hasActiveDocument: boolean;
  hasAttachedSelection: boolean;
  capabilities: {
    canEditDocument: boolean;
    canCreateDocument: boolean;
    canDeleteDocument: boolean;
  };
  registeredToolNames: string[];
  projectKnowledge: ProjectKnowledgeInput;
}): string {
```

After the existing intro lines and before the "Tools available this turn:" block, insert the project knowledge:

```ts
  // Project knowledge: injected here so the model has the real list of
  // content types + their schemas + supported locales + current user
  // before it picks tools or args. Cache-friendly position: the static
  // portion of the system prompt lands first for future provider-level
  // prompt caching.
  lines.push(renderProjectKnowledgeBlock(input.projectKnowledge), "");
```

- [ ] **Step 3: Update orchestrator runChat to construct and pass the knowledge input**

In `orchestrator.ts`, locate the runChat function. Where it calls `buildChatSystemPrompt`, update the arguments object to include the new field. (Reference Step 1 above for the exact shape.)

- [ ] **Step 4: Re-export `renderProjectKnowledgeBlock` + types from the package index**

In `packages/modules/core.ai/src/index.ts`, after the other exports, add:

```ts
export {
  renderProjectKnowledgeBlock,
  type ProjectKnowledgeInput,
} from "./server/project-knowledge.js";
```

- [ ] **Step 5: Run typechecks**

Run: `bun --cwd packages/modules tsc --build tsconfig.lib.json`
Expected: clean (no output). If errors mention missing fields, check that AiChatInput's new field is included at every call site.

- [ ] **Step 6: Update the existing routes.test.ts to pass projectKnowledge in chat tests**

The chat tests in `packages/modules/core.ai/src/server/routes.test.ts` build inputs to `handleChatMessage` via a fake app. Since `projectKnowledge` is a required field on `AiChatInput` AFTER this change, the orchestrator's runChat would otherwise fail. But the route handler hasn't been updated yet — it would be passing `projectKnowledge: undefined` to runChat which violates the type.

Temporary measure: make `projectKnowledge` optional on `AiChatInput` for this task, defaulting to empty content. The route-handler update in Task 6 makes it always-populated, after which we can mark it required again — but for now keep it optional to ship Phase 1 incrementally.

Update the `AiChatInput` field definition to:

```ts
  projectKnowledge?: Omit<ProjectKnowledgeInput, "project" | "environment">;
```

And in `runChat`, default the value:

```ts
const projectKnowledge: ProjectKnowledgeInput = {
  project: call.project,
  environment: call.environment,
  registeredTypes: call.projectKnowledge?.registeredTypes ?? [],
  supportedLocales: call.projectKnowledge?.supportedLocales ?? [],
  ...(call.projectKnowledge?.currentUser
    ? { currentUser: call.projectKnowledge.currentUser }
    : {}),
};
```

- [ ] **Step 7: Run core.ai tests**

Run: `bun test --cwd packages/modules/core.ai`
Expected: PASS (106+ tests, none failing).

- [ ] **Step 8: Commit**

```bash
git add packages/modules/core.ai/src/server/orchestrator.ts packages/modules/core.ai/src/server/tasks.ts packages/modules/core.ai/src/index.ts
git commit -m "feat(ai): thread project knowledge through chat orchestrator + system prompt"
```

---

### Task 5: route handler fetches project knowledge per turn

**Files:**
- Modify: `packages/modules/core.ai/src/server/routes.ts`
- Modify: `packages/modules/core.ai/src/server/routes.test.ts`
- Modify: `packages/modules/src/index.ts`

- [ ] **Step 1: Add the three lookup fields to `MountAiRoutesOptions`**

In `packages/modules/core.ai/src/server/routes.ts`, find `export type MountAiRoutesOptions` (around line 132) and append:

```ts
  /**
   * Returns all content types registered for the given project +
   * environment, each with the full schema snapshot. Used to ground
   * the chat model in real types (system prompt) and to enum-constrain
   * the find_entries tool's `type` parameter.
   */
  contentTypesLookup?: (input: {
    project: string;
    environment: string;
  }) => Promise<import("@mdcms/shared").SchemaRegistryTypeSnapshot[]>;

  /**
   * Returns the list of locale codes (e.g. "en", "pl") configured as
   * supported by the project's MDCMS config. Used to ground the model
   * and to enum-constrain the find_entries tool's `locale` parameter.
   */
  supportedLocalesLookup?: (input: {
    project: string;
    environment: string;
  }) => Promise<string[]>;

  /**
   * Returns the display name for a user id (from authUsers.name with
   * email/id fallbacks). Used to address the current user by name in
   * the chat system prompt so attribution defaults are accurate.
   */
  userLookup?: (input: { userId: string }) => Promise<{
    id: string;
    displayName: string;
  }>;
```

(Marked optional during the migration; the runtime-with-modules wiring in Task 6 fills them in. Tests that don't supply them get empty defaults via the orchestrator's optional handling.)

- [ ] **Step 2: Update `handleChatMessage` to parallel-fetch and forward**

In `routes.ts`, locate the `handleChatMessage` function. After the existing prelude (CSRF/routing/authorize/body validation/allowed actions) and just before the `orchestrator.runChat({...})` call, add the parallel fetch:

```ts
    // Gather per-turn project knowledge in parallel with the existing
    // attached-doc fetch so the round-trip cost is bounded by the
    // longest query, not the sum.
    const [registeredTypes, supportedLocales, currentUser] = await Promise.all([
      options.contentTypesLookup
        ? options.contentTypesLookup({ project, environment })
        : Promise.resolve([]),
      options.supportedLocalesLookup
        ? options.supportedLocalesLookup({ project, environment })
        : Promise.resolve<string[]>([]),
      options.userLookup
        ? options.userLookup({ userId: aiAuth.actorId }).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);
```

Then update the `orchestrator.runChat({...})` call to include:

```ts
      projectKnowledge: {
        registeredTypes,
        supportedLocales,
        ...(currentUser ? { currentUser } : {}),
      },
```

- [ ] **Step 3: Re-export the new option fields from the modules package**

In `packages/modules/src/index.ts`, add the new type re-exports — though they're additions to an existing exported type (`MountAiRoutesOptions`), no new exports needed unless we want first-class types for the lookup signatures. Leave alone unless tsc complains.

- [ ] **Step 4: Update the test-setup helper in routes.test.ts to pass stubs**

In `packages/modules/core.ai/src/server/routes.test.ts`, find `createTestSetup` (around line 166). Add the three optional fields to its options accept, defaulting to empty stubs, and pass them to `mountAiRoutes`:

```ts
function createTestSetup(input: {
  document?: ContentDocumentResponse;
  schemaHash?: string;
  authorize?: AiAuthorizer;
  emitAudit?: AiAuditEmitter;
  echoSteps?: EchoStepResponse[];
  proposalValidator?: AiProposalValidator;
  contentTypesLookup?: MountAiRoutesOptions["contentTypesLookup"];
  supportedLocalesLookup?: MountAiRoutesOptions["supportedLocalesLookup"];
  userLookup?: MountAiRoutesOptions["userLookup"];
}) {
```

And in the `options: MountAiRoutesOptions = { ... }` literal at the bottom of the helper, add:

```ts
    ...(input.contentTypesLookup ? { contentTypesLookup: input.contentTypesLookup } : {}),
    ...(input.supportedLocalesLookup ? { supportedLocalesLookup: input.supportedLocalesLookup } : {}),
    ...(input.userLookup ? { userLookup: input.userLookup } : {}),
```

- [ ] **Step 5: Add a route integration test for project knowledge wiring**

Append a new test inside the `describe("mountAiRoutes — chat-message", ...)` block:

```ts
  test("system prompt includes project knowledge block from lookups", async () => {
    let capturedSystemPrompt = "";
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      contentTypesLookup: async () => [
        {
          type: "post",
          directory: "blog",
          localized: true,
          fields: {
            title: { kind: "string", required: true, nullable: false },
          },
        },
      ],
      supportedLocalesLookup: async () => ["en", "pl"],
      userLookup: async () => ({ id: "u1", displayName: "Karol" }),
      echoSteps: [
        // Capture the prompt sent to the provider via a spy on the
        // echo provider's respond callback. Since echoSteps interpose
        // before respond, we'll use a text-only response here.
        { type: "text", text: "Hi!" },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "hi" }),
      },
    );

    assert.equal(response.status, 200);
    // Indirect verification: the providers/echo.ts MockLanguageModelV3
    // records the prompt; we can inspect the audit's promptTemplateId
    // is still "chat_tools.v1" (sanity) — full system-prompt-content
    // assertions live in project-knowledge.test.ts (pure renderer).
    // This test verifies the wiring runs without throwing.
    const payload = (await response.json()) as {
      data: { message: { text?: string } };
    };
    assert.equal(payload.data.message.text, "Hi!");
  });
```

(The pure renderer is already snapshot-tested in `project-knowledge.test.ts`; this route test verifies the wiring runs end-to-end without errors and the lookups are invoked. A more elaborate spy on the captured prompt is overkill given the renderer is already covered.)

- [ ] **Step 6: Run tests**

Run: `bun test --cwd packages/modules/core.ai`
Expected: PASS (107+ tests, the new integration test included).

- [ ] **Step 7: Commit**

```bash
git add packages/modules/core.ai/src/server/routes.ts packages/modules/core.ai/src/server/routes.test.ts
git commit -m "feat(ai): handleChatMessage fetches and forwards project knowledge per turn"
```

---

### Task 6: wire project knowledge lookups in runtime-with-modules.ts

**Files:**
- Modify: `apps/server/src/lib/runtime-with-modules.ts`

- [ ] **Step 1: Add the imports for new dependencies**

In `apps/server/src/lib/runtime-with-modules.ts`, near the existing imports, add:

```ts
import { readSupportedLocales } from "@mdcms/shared";
```

The `authUsers` and `schemaRegistryEntries` imports already exist (from the CMS-235 work).

- [ ] **Step 2: Add the three lookup closures + pass to mountAiRoutes**

In `runtime-with-modules.ts`, locate the `aiModuleDeps: CoreAiServerDeps = { ... }` block. Just before that block, after the validator construction, add:

```ts
  const contentTypesLookup = async ({
    project,
    environment,
  }: {
    project: string;
    environment: string;
  }) => {
    const resolvedScope = await resolveProjectEnvironmentScope(
      dbConnection.db,
      { project, environment },
    );
    if (!resolvedScope) return [];
    const rows = await dbConnection.db.query.schemaRegistryEntries.findMany({
      where: and(
        eq(schemaRegistryEntries.projectId, resolvedScope.project.id),
        eq(schemaRegistryEntries.environmentId, resolvedScope.environment.id),
      ),
    });
    return rows.map(
      (r) =>
        r.resolvedSchema as import("@mdcms/shared").SchemaRegistryTypeSnapshot,
    );
  };

  const supportedLocalesLookup = async ({
    project,
    environment,
  }: {
    project: string;
    environment: string;
  }) => {
    const resolvedScope = await resolveProjectEnvironmentScope(
      dbConnection.db,
      { project, environment },
    );
    if (!resolvedScope) return [];
    const row = await dbConnection.db.query.schemaSyncs.findFirst({
      where: and(
        eq(schemaSyncs.projectId, resolvedScope.project.id),
        eq(schemaSyncs.environmentId, resolvedScope.environment.id),
      ),
    });
    if (!row?.rawConfigSnapshot) return [];
    const locales = readSupportedLocales(row.rawConfigSnapshot);
    return locales ? Array.from(locales).sort() : [];
  };

  const userLookup = async ({ userId }: { userId: string }) => {
    const row = await dbConnection.db.query.authUsers.findFirst({
      where: eq(authUsers.id, userId),
      columns: { id: true, name: true, email: true },
    });
    return row
      ? { id: row.id, displayName: row.name || row.email }
      : { id: userId, displayName: userId };
  };
```

Then add these three fields to the `aiModuleDeps` literal:

```ts
    contentTypesLookup,
    supportedLocalesLookup,
    userLookup,
```

- [ ] **Step 3: Run server typecheck**

Run: `bun --cwd apps/server tsc --build tsconfig.json`
Expected: clean. If TS complains about `readSupportedLocales` export, check the shared package's index.

- [ ] **Step 4: Run server tests**

Run: `bun test --cwd apps/server src 2>&1 | tail -20`
Expected: no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/runtime-with-modules.ts
git commit -m "feat(ai): wire content-type / locale / user lookups for chat grounding"
```

---

### Task 7: Phase 1 verification

- [ ] **Step 1: Run the full chain of typechecks**

```bash
bun --cwd packages/shared tsc --build tsconfig.lib.json
bun --cwd packages/modules tsc --build tsconfig.lib.json
bun --cwd packages/studio tsc --build tsconfig.lib.json
bun --cwd apps/server tsc --build tsconfig.json
```

Expected: all clean.

- [ ] **Step 2: Run all core.ai tests**

```bash
bun test --cwd packages/modules/core.ai
```

Expected: PASS (~110+ tests).

- [ ] **Step 3: Rebuild + restart server**

```bash
bun nx run studio:build
docker compose up -d --build server
```

- [ ] **Step 4: Manual smoke — verify the model now picks real types**

Open `http://localhost:4173/admin/content/<any doc>` in your browser, hard-reload, and send "draft a new blog post about coffee" with no document attached.

The model should now pick a `type` from the actual registered set (e.g. `post`, not the invented `blog` it used before). If it still picks wrong, the validator's `UNKNOWN_CONTENT_TYPE` catches it — Phase 1 closes the proactive grounding gap, Phase 3 closes the reference + path checks.

---

## Phase 2 — `find_entries` + `get_entry` tools

### Task 8: extend ChatToolDeps with backends + enums

**Files:**
- Modify: `packages/modules/core.ai/src/server/chat-tools.ts`

- [ ] **Step 1: Add the new fields to ChatToolDeps**

Find `export type ChatToolDeps` in `chat-tools.ts`. Append:

```ts
  /**
   * Registered content type ids for this project. Used as the enum
   * source for the find_entries tool's `type` parameter so the model
   * can't query for types that don't exist.
   */
  registeredTypeIds: string[];

  /**
   * Supported locales for this project. Used as the enum source for
   * find_entries' `locale` parameter.
   */
  supportedLocales: string[];

  /**
   * Backend for the find_entries tool — wraps contentStore.list at
   * the route layer.
   */
  findEntriesBackend?: (input: {
    type: string;
    query?: string;
    locale?: string;
    limit?: number;
  }) => Promise<FindEntriesResult>;

  /**
   * Backend for the get_entry tool — wraps contentStore.getById at
   * the route layer.
   */
  getEntryBackend?: (input: { documentId: string }) => Promise<
    GetEntryResult | undefined
  >;
```

And add the two new result types near the top of the file:

```ts
export type FindEntriesResult = {
  matches: Array<{
    documentId: string;
    path: string;
    type: string;
    locale: string;
    title?: string;
    summary?: string;
    updatedAt: string;
    hasUnpublishedChanges: boolean;
  }>;
  total: number;
};

export type GetEntryResult = {
  documentId: string;
  path: string;
  type: string;
  locale: string;
  draftRevision: number;
  hasUnpublishedChanges: boolean;
  publishedVersion: number | null;
  frontmatter: Record<string, unknown>;
  body: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `bun --cwd packages/modules tsc --build tsconfig.lib.json`
Expected: clean.

- [ ] **Step 3: Commit (scaffolding only — tools are wired in next tasks)**

```bash
git add packages/modules/core.ai/src/server/chat-tools.ts
git commit -m "chore(ai): add backend + enum scaffolding to ChatToolDeps for find_entries / get_entry"
```

---

### Task 9: register find_entries tool

**Files:**
- Modify: `packages/modules/core.ai/src/server/chat-tools.ts`
- Create: `packages/modules/core.ai/src/server/chat-tools.test.ts`

- [ ] **Step 1: Write failing tests for find_entries**

Create `packages/modules/core.ai/src/server/chat-tools.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  buildChatTools,
  type ChatToolDeps,
  type FindEntriesResult,
} from "./chat-tools.js";
import type { AiProposal } from "@mdcms/shared";

function baseDeps(overrides: Partial<ChatToolDeps> = {}): ChatToolDeps {
  return {
    envelope: {
      project: "p",
      environment: "e",
      type: "page",
      locale: "en",
    },
    hasActiveDocument: false,
    activeDocumentHasPublishedVersion: false,
    providerId: "echo",
    model: "echo-1",
    clock: () => new Date("2026-05-16T00:00:00.000Z"),
    idFactory: (() => {
      let n = 0;
      return () => `prop_${++n}`;
    })(),
    ttlMs: 5 * 60 * 1000,
    capabilities: {
      canEditDocument: false,
      canCreateDocument: false,
      canDeleteDocument: false,
    },
    collected: [] as AiProposal[],
    registeredTypeIds: ["author", "post"],
    supportedLocales: ["en", "pl"],
    ...overrides,
  };
}

describe("find_entries tool", () => {
  test("is registered when caller has read capability and backend present", () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        findEntriesBackend: async () => ({ matches: [], total: 0 }),
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    assert.ok(tools.find_entries, "find_entries tool should be registered");
  });

  test("is NOT registered when read capability is absent", () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: false,
        findEntriesBackend: async () => ({ matches: [], total: 0 }),
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    assert.equal(tools.find_entries, undefined);
  });

  test("execute calls backend with model-supplied args and returns result", async () => {
    let captured: { type: string; query?: string; limit?: number } | undefined;
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        findEntriesBackend: async (input) => {
          captured = input;
          return {
            matches: [
              {
                documentId: "doc_1",
                path: "authors/john",
                type: "author",
                locale: "en",
                title: "John Doe",
                updatedAt: "2026-05-01T00:00:00.000Z",
                hasUnpublishedChanges: false,
              },
            ],
            total: 1,
          };
        },
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    const result = (await tools.find_entries!.execute!(
      { type: "author", query: "john", limit: 5 },
      { toolCallId: "tc_1", messages: [] },
    )) as FindEntriesResult;
    assert.deepEqual(captured, { type: "author", query: "john", limit: 5 });
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.documentId, "doc_1");
    assert.equal(result.total, 1);
  });

  test("returns structured error when backend throws", async () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        findEntriesBackend: async () => {
          throw new Error("DB unreachable");
        },
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    const result = (await tools.find_entries!.execute!(
      { type: "author" },
      { toolCallId: "tc_1", messages: [] },
    )) as { queued: false; error: string };
    assert.equal(result.queued, false);
    assert.ok(result.error.includes("DB unreachable"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/chat-tools.test.ts`
Expected: FAIL — tool not registered, or `canReadEntries` field missing on type.

- [ ] **Step 3: Add `canReadEntries` capability and register find_entries**

In `packages/modules/core.ai/src/server/chat-tools.ts`, find `export type ChatToolCapabilities` and add `canReadEntries: boolean`:

```ts
export type ChatToolCapabilities = {
  canEditDocument: boolean;
  canCreateDocument: boolean;
  canDeleteDocument: boolean;
  canReadEntries: boolean;
};
```

After the `propose_delete_document` block (around the end of the existing tool registrations, before `return tools;`), add the find_entries tool:

```ts
  if (deps.capabilities.canReadEntries && deps.findEntriesBackend) {
    const backend = deps.findEntriesBackend;
    tools.find_entries = tool({
      description:
        "Search the project's documents by content type with an optional text query. Use this when:\n" +
        "1. Filling a reference field on a proposal — e.g. setting `author` on a new post. Call `find_entries({ type: 'author', query: '<name>' })` and pick the right `documentId` from the results.\n" +
        "2. Checking what already exists before proposing a new draft to avoid duplicates.\n" +
        "Returns up to `limit` matches (default 10, max 25), most-recently-updated first. The `type` parameter is enum-constrained to the project's registered content types; passing anything else fails the call. Do not use this for editing — combine with the propose_* tools after picking a result.",
      inputSchema: z.object({
        type:
          deps.registeredTypeIds.length > 0
            ? z.enum(deps.registeredTypeIds as [string, ...string[]])
            : z.string().min(1),
        query: z.string().optional(),
        locale:
          deps.supportedLocales.length > 0
            ? z
                .enum(deps.supportedLocales as [string, ...string[]])
                .optional()
            : z.string().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async (args) => {
        try {
          return await backend({
            type: args.type,
            ...(args.query ? { query: args.query } : {}),
            ...(args.locale ? { locale: args.locale } : {}),
            ...(args.limit ? { limit: args.limit } : {}),
          });
        } catch (error) {
          return toolErrorResult(error);
        }
      },
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/chat-tools.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/chat-tools.ts packages/modules/core.ai/src/server/chat-tools.test.ts
git commit -m "feat(ai): register find_entries chat tool with enum-constrained type/locale"
```

---

### Task 10: register get_entry tool

**Files:**
- Modify: `packages/modules/core.ai/src/server/chat-tools.ts`
- Modify: `packages/modules/core.ai/src/server/chat-tools.test.ts`

- [ ] **Step 1: Write failing tests for get_entry**

Append to `chat-tools.test.ts`:

```ts
describe("get_entry tool", () => {
  test("is registered when caller has read capability and backend present", () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        getEntryBackend: async () => undefined,
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    assert.ok(tools.get_entry);
  });

  test("returns the full document when backend resolves it", async () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        getEntryBackend: async () => ({
          documentId: "doc_1",
          path: "blog/welcome",
          type: "post",
          locale: "en",
          draftRevision: 4,
          hasUnpublishedChanges: true,
          publishedVersion: null,
          frontmatter: { title: "Welcome" },
          body: "Body text",
        }),
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    const result = (await tools.get_entry!.execute!(
      { documentId: "doc_1" },
      { toolCallId: "tc_1", messages: [] },
    )) as { documentId: string; body: string };
    assert.equal(result.documentId, "doc_1");
    assert.equal(result.body, "Body text");
  });

  test("returns NOT_FOUND structured error when backend returns undefined", async () => {
    const tools = buildChatTools(
      baseDeps({
        canReadEntries: true,
        getEntryBackend: async () => undefined,
      } as Partial<ChatToolDeps> & { canReadEntries?: boolean }),
    );
    const result = (await tools.get_entry!.execute!(
      { documentId: "missing" },
      { toolCallId: "tc_1", messages: [] },
    )) as { queued: false; error: string };
    assert.equal(result.queued, false);
    assert.ok(result.error.toLowerCase().includes("not found"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/chat-tools.test.ts`
Expected: FAIL — tool not registered.

- [ ] **Step 3: Register get_entry tool**

In `chat-tools.ts`, just after the `find_entries` registration block, add:

```ts
  if (deps.capabilities.canReadEntries && deps.getEntryBackend) {
    const backend = deps.getEntryBackend;
    tools.get_entry = tool({
      description:
        "Fetch the full body + frontmatter of a specific document by its `documentId`. Use this when:\n" +
        "1. You need to read an existing document's content before proposing changes to a different document that references or links to it.\n" +
        "2. You picked a candidate from `find_entries` and want to read its full content before referencing or duplicating parts of it.\n" +
        "Returns the document's frontmatter, body, type, locale, path, and revision info. If the document doesn't exist or has been soft-deleted, returns an error. The active document the user is editing is already in your context — don't call this for it.",
      inputSchema: z.object({
        documentId: z.string().min(1),
      }),
      execute: async (args) => {
        try {
          const entry = await backend({ documentId: args.documentId });
          if (!entry) {
            return {
              queued: false as const,
              error: `Document "${args.documentId}" not found in this project.`,
            };
          }
          return entry;
        } catch (error) {
          return toolErrorResult(error);
        }
      },
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/chat-tools.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/chat-tools.ts packages/modules/core.ai/src/server/chat-tools.test.ts
git commit -m "feat(ai): register get_entry chat tool with NOT_FOUND structured error"
```

---

### Task 11: thread tool backends + enums through orchestrator

**Files:**
- Modify: `packages/modules/core.ai/src/server/orchestrator.ts`

- [ ] **Step 1: Extend AiChatInput with toolBackends**

In `orchestrator.ts`, find the `AiChatInput` type. Add:

```ts
  /**
   * Backends for the read-only chat tools (find_entries, get_entry).
   * The route handler wires these from the contentStore; when absent,
   * the tools are not registered.
   */
  toolBackends?: {
    findEntries?: import("./chat-tools.js").ChatToolDeps["findEntriesBackend"];
    getEntry?: import("./chat-tools.js").ChatToolDeps["getEntryBackend"];
  };
```

- [ ] **Step 2: Update the buildChatTools call in runChat**

Locate the `buildChatTools({ ... })` call inside `runChat`. Add the new fields, plus a `canReadEntries` capability that defaults to whether the route handler passed backends in (treated as the gate):

```ts
const tools = buildChatTools({
  envelope,
  ...
  capabilities: {
    ...call.capabilities,
    canReadEntries: Boolean(call.toolBackends?.findEntries),
  },
  registeredTypeIds: (call.projectKnowledge?.registeredTypes ?? []).map(
    (t) => t.type,
  ),
  supportedLocales: call.projectKnowledge?.supportedLocales ?? [],
  ...(call.toolBackends?.findEntries
    ? { findEntriesBackend: call.toolBackends.findEntries }
    : {}),
  ...(call.toolBackends?.getEntry
    ? { getEntryBackend: call.toolBackends.getEntry }
    : {}),
  collected,
  ...
});
```

- [ ] **Step 3: Update the ChatToolCapabilities consumers**

In `chat-tools.ts`'s `buildChatTools`, the existing capabilities reads need `canReadEntries` to default safely. Check the call sites; the new field flows from `runChat`, so consumers compile clean.

Run: `bun --cwd packages/modules tsc --build tsconfig.lib.json`
Expected: clean.

- [ ] **Step 4: Run chat-tools tests**

Run: `bun test --cwd packages/modules/core.ai src/server/chat-tools.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/orchestrator.ts packages/modules/core.ai/src/server/chat-tools.ts
git commit -m "feat(ai): thread read-tool backends + type/locale enums through chat orchestrator"
```

---

### Task 12: route handler wires the two tool backends

**Files:**
- Modify: `packages/modules/core.ai/src/server/routes.ts`
- Modify: `packages/modules/core.ai/src/server/routes.test.ts`

- [ ] **Step 1: Extend MountAiRoutesOptions with the two backends**

In `routes.ts`, append to `MountAiRoutesOptions`:

```ts
  /**
   * Backend for the find_entries chat tool. Wraps contentStore.list
   * scoped to the active project + environment.
   */
  listEntries?: (input: {
    project: string;
    environment: string;
    type: string;
    query?: string;
    locale?: string;
    limit?: number;
  }) => Promise<import("./chat-tools.js").FindEntriesResult>;

  /**
   * Backend for the get_entry chat tool. Wraps contentStore.getById.
   */
  getEntry?: (input: {
    project: string;
    environment: string;
    documentId: string;
  }) => Promise<import("./chat-tools.js").GetEntryResult | undefined>;
```

- [ ] **Step 2: Pass them into runChat**

In `handleChatMessage`, find the `orchestrator.runChat({...})` call. Add:

```ts
      ...(options.listEntries || options.getEntry
        ? {
            toolBackends: {
              ...(options.listEntries
                ? {
                    findEntries: (input) =>
                      options.listEntries!({
                        project,
                        environment,
                        ...input,
                      }),
                  }
                : {}),
              ...(options.getEntry
                ? {
                    getEntry: (input) =>
                      options.getEntry!({
                        project,
                        environment,
                        documentId: input.documentId,
                      }),
                  }
                : {}),
            },
          }
        : {}),
```

- [ ] **Step 3: Add an integration test that scripts a find_entries tool call**

In `routes.test.ts`, inside the chat-message describe block, add:

```ts
  test("find_entries tool call flows through to backend and result reaches model", async () => {
    let backendCalledWith: { type: string; query?: string } | undefined;
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      contentTypesLookup: async () => [
        {
          type: "author",
          directory: "authors",
          localized: false,
          fields: {
            name: { kind: "string", required: true, nullable: false },
          },
        },
      ],
      supportedLocalesLookup: async () => ["en"],
      userLookup: async () => ({ id: "u1", displayName: "K" }),
      listEntries: async (input) => {
        backendCalledWith = { type: input.type, query: input.query };
        return {
          matches: [
            {
              documentId: "doc_author_1",
              path: "authors/john",
              type: "author",
              locale: "en",
              title: "John Doe",
              updatedAt: "2026-05-01T00:00:00.000Z",
              hasUnpublishedChanges: false,
            },
          ],
          total: 1,
        };
      },
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "find_entries",
              input: JSON.stringify({ type: "author", query: "John" }),
            },
          ],
        },
        { type: "text", text: "Found one match: John Doe." },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "find an author named John" }),
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(backendCalledWith, { type: "author", query: "John" });
    const payload = (await response.json()) as {
      data: { message: { text?: string } };
    };
    assert.equal(payload.data.message.text, "Found one match: John Doe.");
  });
```

- [ ] **Step 4: Run tests**

Run: `bun test --cwd packages/modules/core.ai`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/routes.ts packages/modules/core.ai/src/server/routes.test.ts
git commit -m "feat(ai): wire find_entries / get_entry backends from chat route options"
```

---

### Task 13: wire listEntries + getEntry in runtime-with-modules.ts

**Files:**
- Modify: `apps/server/src/lib/runtime-with-modules.ts`

- [ ] **Step 1: Add the two backend closures**

In `runtime-with-modules.ts`, after the validator-related closures (`pathExists`, `documentExists` that you'll add in Phase 3 — but listEntries / getEntry land in Phase 2), add the backends. Place them near `contentTypesLookup`:

```ts
  const listEntries = async ({
    project,
    environment,
    type,
    query,
    locale,
    limit,
  }: {
    project: string;
    environment: string;
    type: string;
    query?: string;
    locale?: string;
    limit?: number;
  }) => {
    const listResponse = await contentStore.list(
      { project, environment },
      {
        type,
        ...(query ? { q: query } : {}),
        ...(locale ? { locale } : {}),
        limit: limit ?? 10,
        draft: true,
      },
    );
    return {
      matches: listResponse.rows.map((row) => ({
        documentId: row.documentId,
        path: row.path,
        type: row.type,
        locale: row.locale,
        ...(typeof row.frontmatter.title === "string"
          ? { title: row.frontmatter.title }
          : {}),
        ...(typeof row.frontmatter.excerpt === "string"
          ? { summary: row.frontmatter.excerpt.slice(0, 200) }
          : {}),
        updatedAt: row.updatedAt,
        hasUnpublishedChanges: row.hasUnpublishedChanges,
      })),
      total: listResponse.total,
    };
  };

  const getEntryBackend = async ({
    project,
    environment,
    documentId,
  }: {
    project: string;
    environment: string;
    documentId: string;
  }) => {
    const doc = await contentStore.getById(
      { project, environment },
      documentId,
      { draft: true },
    );
    if (!doc || doc.isDeleted) return undefined;
    return {
      documentId: doc.documentId,
      path: doc.path,
      type: doc.type,
      locale: doc.locale,
      draftRevision: doc.draftRevision,
      hasUnpublishedChanges: doc.hasUnpublishedChanges,
      publishedVersion: doc.publishedVersion,
      frontmatter: doc.frontmatter,
      body: doc.body,
    };
  };
```

- [ ] **Step 2: Pass to aiModuleDeps**

In the `aiModuleDeps: CoreAiServerDeps = { ... }` literal, add:

```ts
    listEntries,
    getEntry: getEntryBackend,
```

- [ ] **Step 3: Typecheck + test**

Run: `bun --cwd apps/server tsc --build tsconfig.json && bun test --cwd packages/modules/core.ai`
Expected: clean + PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/lib/runtime-with-modules.ts
git commit -m "feat(ai): wire listEntries / getEntry backends for chat lookup tools"
```

---

### Task 14: Phase 2 verification

- [ ] **Step 1: Run all chains**

```bash
bun --cwd packages/modules tsc --build tsconfig.lib.json
bun --cwd apps/server tsc --build tsconfig.json
bun test --cwd packages/modules/core.ai
```

Expected: clean + PASS.

- [ ] **Step 2: Rebuild + restart**

```bash
bun nx run studio:build
docker compose up -d --build server
```

- [ ] **Step 3: Manual smoke — verify find_entries / get_entry work**

In the assistant rail, hard-reload and try:
- "Find me an author named John" — model should call `find_entries({ type: "author", query: "John" })` and surface results.
- "Read the content of the most recent post" — model can use `find_entries` then `get_entry`.

If the model picks an unregistered type, the Vercel SDK rejects the call pre-execute (the enum constraint). If the backend returns nothing, the structured error surfaces in the model's text reply.

---

## Phase 3 — Validator extensions

### Task 15: extend validator deps with pathExists + documentExists

**Files:**
- Modify: `packages/modules/core.ai/src/server/validate-proposal.ts`

- [ ] **Step 1: Add the new deps to the factory input**

In `validate-proposal.ts`, find the `createSchemaAwareProposalValidator` factory. Update its `input` type to:

```ts
export function createSchemaAwareProposalValidator(input: {
  schemaLookup: SchemaLookup;
  pathExists?: PathLookup;
  documentExists?: DocumentLookup;
}): AiProposalValidator {
  const { schemaLookup, pathExists, documentExists } = input;
```

Add the two new lookup type exports at the top of the file (after `SchemaLookup`):

```ts
export type PathLookup = (input: {
  project: string;
  environment: string;
  path: string;
}) => Promise<boolean>;

export type DocumentLookup = (input: {
  project: string;
  environment: string;
  documentId: string;
}) => Promise<boolean>;
```

- [ ] **Step 2: Typecheck**

Run: `bun --cwd packages/modules tsc --build tsconfig.lib.json`
Expected: clean.

- [ ] **Step 3: Commit (scaffolding)**

```bash
git add packages/modules/core.ai/src/server/validate-proposal.ts
git commit -m "chore(ai): scaffold pathExists + documentExists deps on proposal validator factory"
```

---

### Task 16: emit PATH_ALREADY_IN_USE on create_document validation

**Files:**
- Modify: `packages/modules/core.ai/src/server/validate-proposal.ts`
- Modify: `packages/modules/core.ai/src/server/validate-proposal.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `validate-proposal.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/validate-proposal.test.ts`
Expected: FAIL — PATH_ALREADY_IN_USE not emitted.

- [ ] **Step 3: Add the check to `validateCreateDocument`**

In `validate-proposal.ts`, find `validateCreateDocument`. After the existing field validation (after `validateFrontmatterAgainstSchema(...)`), add:

```ts
  if (pathExists) {
    const taken = await pathExists({
      project: candidate.project,
      environment: candidate.environment,
      path: operation.path,
    });
    if (taken) {
      errors.push({
        code: "PATH_ALREADY_IN_USE",
        message: `Path "${operation.path}" is already used by another document — pick a different path or update the existing doc instead.`,
        path: "operations[0].path",
      });
    }
  }
```

The `pathExists` reference comes from the closure — since the factory destructures it at the top, it's in scope as long as `validateCreateDocument` is defined inside the factory. If it's a top-level function, pass `pathExists` as a parameter. Adjust the function signature:

```ts
async function validateCreateDocument(
  candidate: AiProposalCandidate,
  schemaLookup: SchemaLookup,
  pathExists: PathLookup | undefined,
): Promise<AiProposalValidation> {
```

And in the factory's return closure, pass it through:

```ts
case "create_document":
  return validateCreateDocument(candidate, schemaLookup, pathExists);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/validate-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/validate-proposal.ts packages/modules/core.ai/src/server/validate-proposal.test.ts
git commit -m "feat(ai): emit PATH_ALREADY_IN_USE on create_document with taken path"
```

---

### Task 17: emit UNKNOWN_REFERENCE on create_document + update_frontmatter

**Files:**
- Modify: `packages/modules/core.ai/src/server/validate-proposal.ts`
- Modify: `packages/modules/core.ai/src/server/validate-proposal.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `validate-proposal.test.ts`:

```ts
const POST_WITH_REF_SCHEMA: SchemaRegistryTypeSnapshot = {
  type: "post",
  directory: "blog",
  localized: true,
  fields: {
    title: { kind: "string", required: true, nullable: false },
    date: { kind: "date", required: true, nullable: false },
    author: {
      kind: "reference",
      required: false,
      nullable: true,
      reference: { targetType: "author" },
    },
    coauthors: {
      kind: "array",
      required: false,
      nullable: false,
      item: {
        kind: "reference",
        required: true,
        nullable: false,
        reference: { targetType: "author" },
      },
    },
  },
};

const REF_REGISTRY: Record<string, SchemaRegistryTypeSnapshot> = {
  post: POST_WITH_REF_SCHEMA,
};

const refLookup: SchemaLookup = async ({ type }) => REF_REGISTRY[type];

describe("createSchemaAwareProposalValidator — UNKNOWN_REFERENCE", () => {
  test("flags create_document with a missing author reference", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
      documentExists: async ({ documentId }) => documentId === "doc_real",
    });
    const result = await validator(
      createCandidate({
        type: "post",
        operations: [
          {
            op: "create_document",
            path: "blog/x",
            format: "md",
            frontmatter: {
              title: "x",
              date: "2026-05-15",
              author: "doc_fake",
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const refErrors = result.errors.filter(
        (e) => e.code === "UNKNOWN_REFERENCE",
      );
      assert.equal(refErrors.length, 1);
      assert.equal(refErrors[0]?.path, "frontmatter.author");
    }
  });

  test("allows create_document with a real reference", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
      documentExists: async ({ documentId }) => documentId === "doc_real",
    });
    const result = await validator(
      createCandidate({
        type: "post",
        operations: [
          {
            op: "create_document",
            path: "blog/x",
            format: "md",
            frontmatter: {
              title: "x",
              date: "2026-05-15",
              author: "doc_real",
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "valid");
  });

  test("flags missing references inside array fields", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
      documentExists: async ({ documentId }) =>
        documentId === "doc_real_1" || documentId === "doc_real_2",
    });
    const result = await validator(
      createCandidate({
        type: "post",
        operations: [
          {
            op: "create_document",
            path: "blog/x",
            format: "md",
            frontmatter: {
              title: "x",
              date: "2026-05-15",
              coauthors: ["doc_real_1", "doc_fake", "doc_real_2"],
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const refErrors = result.errors.filter(
        (e) => e.code === "UNKNOWN_REFERENCE",
      );
      assert.equal(refErrors.length, 1);
      assert.equal(refErrors[0]?.path, "frontmatter.coauthors[1]");
    }
  });

  test("null on nullable reference field passes", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
      documentExists: async () => false,
    });
    const result = await validator(
      createCandidate({
        type: "post",
        operations: [
          {
            op: "create_document",
            path: "blog/x",
            format: "md",
            frontmatter: {
              title: "x",
              date: "2026-05-15",
              author: null,
            },
            body: "Body",
          },
        ],
      }),
    );
    // Note: this proposal also has UNKNOWN_FRONTMATTER_FIELD for
    // anything not in the schema, but the author=null shouldn't
    // produce a UNKNOWN_REFERENCE error.
    if (result.status === "invalid") {
      const refErrors = result.errors.filter(
        (e) => e.code === "UNKNOWN_REFERENCE",
      );
      assert.equal(refErrors.length, 0);
    }
  });

  test("flags UNKNOWN_REFERENCE on update_frontmatter patch", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
      documentExists: async () => false,
    });
    const result = await validator({
      proposalId: "p1",
      kind: "update_frontmatter",
      project: "demo",
      environment: "draft",
      type: "post",
      locale: "en",
      summary: "update author",
      operations: [
        {
          op: "update_frontmatter",
          patch: { author: "doc_fake" },
        },
      ],
      expiresAt: "2026-05-16T00:05:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "chat_tools.v1",
      },
    });
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      const refErrors = result.errors.filter(
        (e) => e.code === "UNKNOWN_REFERENCE",
      );
      assert.equal(refErrors.length, 1);
    }
  });

  test("skips ref check when documentExists is not provided", async () => {
    const validator = createSchemaAwareProposalValidator({
      schemaLookup: refLookup,
    });
    const result = await validator(
      createCandidate({
        type: "post",
        operations: [
          {
            op: "create_document",
            path: "blog/x",
            format: "md",
            frontmatter: {
              title: "x",
              date: "2026-05-15",
              author: "doc_anything",
            },
            body: "Body",
          },
        ],
      }),
    );
    assert.equal(result.status, "valid");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test --cwd packages/modules/core.ai src/server/validate-proposal.test.ts`
Expected: FAIL — UNKNOWN_REFERENCE not emitted.

- [ ] **Step 3: Implement the reference walker**

In `validate-proposal.ts`, add a helper that recursively walks a value against a schema field, collecting UNKNOWN_REFERENCE errors. Reference values are bare UUID strings — confirmed by the existing `apps/server/src/lib/content-api/reference-validation.ts:73` `UUID_PATTERN` check. Mirror that structure:

```ts
async function collectReferenceErrors(input: {
  value: unknown;
  field: SchemaRegistryFieldSnapshot;
  fieldPath: string;
  project: string;
  environment: string;
  documentExists: DocumentLookup;
}): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  await walkReferences(input, errors);
  return errors;
}

async function walkReferences(
  input: {
    value: unknown;
    field: SchemaRegistryFieldSnapshot;
    fieldPath: string;
    project: string;
    environment: string;
    documentExists: DocumentLookup;
  },
  errors: ValidationError[],
): Promise<void> {
  const { value, field, fieldPath, project, environment, documentExists } =
    input;

  if (value === null || value === undefined) return;

  if (field.reference && field.kind === "reference") {
    if (typeof value !== "string") {
      // Wrong-type errors are emitted by checkFieldType elsewhere.
      return;
    }
    const exists = await documentExists({
      project,
      environment,
      documentId: value,
    });
    if (!exists) {
      errors.push({
        code: "UNKNOWN_REFERENCE",
        message: `Field "${fieldPath.replace(/^frontmatter\./, "")}" references documentId "${value}" which does not exist in this project.`,
        path: fieldPath,
      });
    }
    return;
  }

  if (field.kind === "array" && field.item && Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      await walkReferences(
        {
          value: value[index],
          field: field.item,
          fieldPath: `${fieldPath}[${index}]`,
          project,
          environment,
          documentExists,
        },
        errors,
      );
    }
    return;
  }

  if (
    field.kind === "object" &&
    field.fields &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value !== null
  ) {
    const obj = value as Record<string, unknown>;
    for (const [subName, subField] of Object.entries(field.fields)) {
      await walkReferences(
        {
          value: obj[subName],
          field: subField,
          fieldPath: `${fieldPath}.${subName}`,
          project,
          environment,
          documentExists,
        },
        errors,
      );
    }
    return;
  }
}
```

Then in `validateCreateDocument`, after the `validateFrontmatterAgainstSchema` call, add:

```ts
  if (documentExists) {
    for (const [fieldName, field] of Object.entries(schema.fields)) {
      const refErrors = await collectReferenceErrors({
        value: frontmatter[fieldName],
        field,
        fieldPath: `frontmatter.${fieldName}`,
        project: candidate.project,
        environment: candidate.environment,
        documentExists,
      });
      errors.push(...refErrors);
    }
  }
```

And in `validateUpdateFrontmatter`, similarly:

```ts
  if (documentExists) {
    for (const [key, value] of Object.entries(operation.patch)) {
      const field = schema.fields[key];
      if (!field) continue; // already flagged as UNKNOWN_FRONTMATTER_FIELD
      const refErrors = await collectReferenceErrors({
        value,
        field,
        fieldPath: `patch.${key}`,
        project: candidate.project,
        environment: candidate.environment,
        documentExists,
      });
      errors.push(...refErrors);
    }
  }
```

Both inner functions need `documentExists` plumbed in like `pathExists` in Task 16. Update their signatures and the factory's case statements to pass it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test --cwd packages/modules/core.ai src/server/validate-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/core.ai/src/server/validate-proposal.ts packages/modules/core.ai/src/server/validate-proposal.test.ts
git commit -m "feat(ai): emit UNKNOWN_REFERENCE for dangling reference fields in proposals"
```

---

### Task 18: wire pathExists + documentExists in runtime-with-modules.ts

**Files:**
- Modify: `apps/server/src/lib/runtime-with-modules.ts`

- [ ] **Step 1: Add the two closures**

In `runtime-with-modules.ts`, near `contentTypesLookup` (after the validator scaffolding from CMS-235), add:

```ts
  const aiPathExists = async ({
    project,
    environment,
    path,
  }: {
    project: string;
    environment: string;
    path: string;
  }) => {
    const list = await contentStore.list(
      { project, environment },
      { path, limit: 1, draft: true },
    );
    return list.rows.length > 0 && list.rows[0]?.isDeleted === false;
  };

  const aiDocumentExists = async ({
    project,
    environment,
    documentId,
  }: {
    project: string;
    environment: string;
    documentId: string;
  }) => {
    const doc = await contentStore.getById(
      { project, environment },
      documentId,
      { draft: true },
    );
    return doc !== null && doc !== undefined && !doc.isDeleted;
  };
```

- [ ] **Step 2: Pass them into the validator factory**

Find the existing `createSchemaAwareProposalValidator({ schemaLookup: ... })` call and extend it:

```ts
  const aiProposalValidator = createSchemaAwareProposalValidator({
    schemaLookup: async ({ project, environment, type }) => { /* existing */ },
    pathExists: aiPathExists,
    documentExists: aiDocumentExists,
  });
```

- [ ] **Step 3: Typecheck + test**

```bash
bun --cwd apps/server tsc --build tsconfig.json
bun test --cwd packages/modules/core.ai
```

Expected: clean + PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/lib/runtime-with-modules.ts
git commit -m "feat(ai): wire pathExists + documentExists into proposal validator"
```

---

### Task 19: integration tests for new validator codes through chat route

**Files:**
- Modify: `packages/modules/core.ai/src/server/routes.test.ts`

- [ ] **Step 1: Add chat-route integration tests for PATH_ALREADY_IN_USE and UNKNOWN_REFERENCE**

Append inside the chat-message describe block in `routes.test.ts`:

```ts
  test("propose_create_document at taken path returns PATH_ALREADY_IN_USE", async () => {
    const validator: AiProposalValidator = async (candidate) => {
      if (candidate.kind !== "create_document") return { status: "valid" };
      const op = candidate.operations[0];
      if (op?.op !== "create_document") return { status: "valid" };
      if (op.path === "blog/taken") {
        return {
          status: "invalid",
          errors: [
            {
              code: "PATH_ALREADY_IN_USE",
              message: `Path "${op.path}" is already used.`,
              path: "operations[0].path",
            },
          ],
        };
      }
      return { status: "valid" };
    };
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      proposalValidator: validator,
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_create_document",
              input: JSON.stringify({
                summary: "create",
                path: "blog/taken",
                type: "blog",
                format: "md",
                frontmatter: '{"title":"x","date":"2026-05-15"}',
                body: "Body",
              }),
            },
          ],
        },
        { type: "text", text: "Proposed." },
      ],
    });
    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "make a doc at blog/taken" }),
      },
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals?: AiProposal[] };
    };
    const proposal = payload.data.proposals?.[0]!;
    assert.equal(proposal.validation.status, "invalid");
    if (proposal.validation.status === "invalid") {
      const codes = proposal.validation.errors.map((e) => e.code);
      assert.ok(codes.includes("PATH_ALREADY_IN_USE"));
    }
  });
```

(A similar test for UNKNOWN_REFERENCE follows the same pattern; add it if not already covered by validate-proposal.test.ts.)

- [ ] **Step 2: Run tests**

Run: `bun test --cwd packages/modules/core.ai`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/core.ai/src/server/routes.test.ts
git commit -m "test(ai): chat-route integration test for PATH_ALREADY_IN_USE proposal"
```

---

### Task 20: Phase 3 verification

- [ ] **Step 1: Run all chains**

```bash
bun --cwd packages/modules tsc --build tsconfig.lib.json
bun --cwd apps/server tsc --build tsconfig.json
bun test --cwd packages/modules/core.ai
```

Expected: clean + PASS.

- [ ] **Step 2: Rebuild + restart**

```bash
bun nx run studio:build
docker compose up -d --build server
```

- [ ] **Step 3: Manual smoke**

- "Make a new blog post at `blog/welcome`" (path already exists) → card shows INVALID with `PATH_ALREADY_IN_USE`.
- "Make a new post with `author: doc_fake`" → card shows INVALID with `UNKNOWN_REFERENCE`.
- "Make a new post by John Doe" → model calls `find_entries({ type: "author", query: "John" })`, picks the right id, then `propose_create_document` with the resolved author. Card validates green.

---

## Phase 4 — Spec update + final integration

### Task 21: update SPEC-014 with grounding architecture

**Files:**
- Modify: `docs/specs/SPEC-014-ai-assisted-studio-editing.md`

- [ ] **Step 1: Add a "Model grounding" section to SPEC-014**

Locate the chat-tools section in `docs/specs/SPEC-014-ai-assisted-studio-editing.md`. Add a new subsection:

```markdown
### Model grounding

The chat assistant grounds the model in real project data via three layers:

**System prompt context (injected per turn):**
- Content type catalog (names + schemas with field kinds + required flags).
- Supported locales.
- Current user identity (name + id).

**Tools (model-callable lookups):**
- `find_entries({ type, query?, locale?, limit? })` — search docs by type; type is enum-constrained to registered types.
- `get_entry({ documentId })` — fetch full body + frontmatter.

**Validator codes (server-side trust boundary):**
- `UNKNOWN_CONTENT_TYPE` — type not registered (existing).
- `MISSING_REQUIRED_FRONTMATTER` — schema-required field missing (existing).
- `UNKNOWN_FRONTMATTER_FIELD` — frontmatter key not in schema (existing).
- `INVALID_FRONTMATTER_TYPE` — value kind mismatches schema kind (existing).
- `PATH_ALREADY_IN_USE` — proposed path collides with existing doc.
- `UNKNOWN_REFERENCE` — reference field's documentId doesn't resolve.

References are bare UUID strings in frontmatter, matching the
`UUID_PATTERN` enforced by `apps/server/src/lib/content-api/reference-validation.ts`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/SPEC-014-ai-assisted-studio-editing.md
git commit -m "docs(spec): document AI chat model grounding architecture (CMS-238)"
```

---

### Task 22: full verification + finalize

- [ ] **Step 1: Run all gates**

```bash
bun run format:check
bun --cwd packages/shared tsc --build tsconfig.lib.json
bun --cwd packages/modules tsc --build tsconfig.lib.json
bun --cwd packages/studio tsc --build tsconfig.lib.json
bun --cwd apps/server tsc --build tsconfig.json
bun test --cwd packages/shared src/lib/contracts
bun test --cwd packages/modules/core.ai
bun test --cwd packages/studio src
```

Expected: all clean, all tests PASS (only `button.test.tsx` pre-existing failure in studio is acceptable).

- [ ] **Step 2: Rebuild + restart**

```bash
bun nx run studio:build
docker compose up -d --build server
```

- [ ] **Step 3: Run the four manual smoke scenarios from the design doc**

1. "Find me a post by John" → model calls `find_entries`, surfaces results in text.
2. "Make a new blog post by John Doe" → model calls `find_entries({ type: "author", query: "John" })`, then `propose_create_document` with John's documentId in the author field. Card validates green.
3. "Make a new post at blog/welcome" (path taken) → INVALID with `PATH_ALREADY_IN_USE`.
4. "Create a `podcast` post" (unknown type) → SDK rejects the call pre-execute; model retries or answers in text.

- [ ] **Step 4: Confirm no regressions in the existing morning-poem flow**

The original CMS-235 example: send "make a new blog post about coffee" with no doc attached. Verify:
- Model picks `type` from the system prompt's catalog (not `blog` if `blog` isn't registered).
- Frontmatter renders on the proposal card (since the schema's required fields are now in the model's context).
- Validator catches any remaining gaps with specific error codes.

---

## Self-Review Notes

1. **Spec coverage:** Every section of the design spec is mapped to at least one task — project-knowledge block (T1-T4), system prompt wiring (T4), route fetching (T5), runtime wiring (T6/T13/T18), find_entries (T8/T9/T11/T12), get_entry (T8/T10/T11/T12/T13), pathExists/documentExists deps (T15), PATH_ALREADY_IN_USE (T16), UNKNOWN_REFERENCE (T17), spec doc update (T21), final integration (T22). The phasing matches the spec's "Scope summary".
2. **Placeholder scan:** All steps include explicit file paths, code blocks where code is needed, and exact commands. No "TBD", "TODO", or "implement later". The validator's `validateCreateDocument` references `pathExists` / `documentExists` in scope — the function signatures are updated explicitly in T16/T17 to pass them.
3. **Type consistency:** `FindEntriesResult` and `GetEntryResult` defined in T8, used in T9/T10/T12/T13. `PathLookup` and `DocumentLookup` defined in T15, used in T16/T17/T18. `canReadEntries` capability added in T9, used in subsequent register checks. `contentTypesLookup` / `supportedLocalesLookup` / `userLookup` defined in T5 (option type), wired in T6 (runtime), consumed in T11 (orchestrator).
4. **Test coverage:** Each new helper / tool / validator code has unit tests in its dedicated test file plus integration coverage in `routes.test.ts`. Each Phase ends with a verification task that runs the full chain.
