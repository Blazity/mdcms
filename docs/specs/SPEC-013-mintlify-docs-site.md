# SPEC-013: Mintlify Documentation Site

## Overview

A comprehensive Mintlify-powered documentation site for MDCMS, living as a standalone app at `apps/docs` in the monorepo, with the MDCMS design system applied.

## Design System Mapping

Mintlify `docs.json` is configured to match the MDCMS design tokens:

- **Theme**: Maple (modern, clean — aligns with "airy brutalism" aesthetic)
- **Colors**: primary `#2F49E5` (Blue 500), light `#4D65FF` (link blue), dark `#1C1B1B`
- **Background**: light `#FCF9F8` (offwhite), dark `#1C1B1B`
- **Fonts**: Space Grotesk 700 (headings), Inter 400 (body)
- **Icons**: Lucide
- **Appearance**: system default (light/dark toggle)

## Information Architecture

### Tab 1: Guide

User-facing documentation — how to use MDCMS.

**Group: Introduction**

- `index.mdx` — Welcome page with feature cards, quickstart paths, hero section
- `guide/concepts.mdx` — Key concepts (projects, environments, content types, documents, draft/publish, localization, references, API keys, RBAC)

**Group: Studio**

- `guide/studio/dashboard.mdx` — Dashboard overview with stats, quick actions
- `guide/studio/content-editor.mdx` — Creating/editing content, frontmatter panel, body editor, MDX component insertion
- `guide/studio/publishing.mdx` — Draft/publish workflow, version snapshots, change summaries
- `guide/studio/version-history.mdx` — Version browsing, diff viewer, restoring versions
- `guide/studio/localization.mdx` — Locale switcher, translation groups, independent variants
- `guide/studio/settings.mdx` — API keys, webhooks, media, users, role management

**Group: CLI**

- `guide/cli/installation.mdx` — Install methods, prerequisites, shell completion
- `guide/cli/commands.mdx` — All commands (login, logout, push, pull) with examples
- `guide/cli/configuration.mdx` — `mdcms.config.ts`, manifest file, defineConfig/defineType
- `guide/cli/ci-cd.mdx` — GitHub Actions, GitLab CI, environment variable patterns, automation recipes

**Group: Schema**

- `guide/schema/defining-types.mdx` — defineType syntax, type options (directory, localized, fields)
- `guide/schema/field-types.mdx` — Primitives and complex types with examples for each
- `guide/schema/modifiers-and-validation.mdx` — Optional, nullable, default, Zod validation chains
- `guide/schema/references.mdx` — Cross-type references, resolve behavior, error handling
- `guide/schema/environment-overlays.mdx` — add, modify, omit, extends operations per environment
- `guide/schema/mdx-components.mdx` — Component registration, props editor metadata, usage in editor

### Tab 2: Architecture

Technical deep-dives for contributors and evaluators.

**Group: System Design**

- `architecture/overview.mdx` — High-level system architecture with Mermaid diagram
- `architecture/technology-stack.mdx` — Technology choices with rationale (why Bun, why Elysia, why Drizzle, etc.)
- `architecture/module-system.mdx` — Compile-time module loading, core vs custom modules, module API
- `architecture/multi-tenancy.mdx` — Project/environment isolation, API key restrictions, data boundaries

**Group: Data Layer**

- `architecture/data-model.mdx` — ER diagram, core tables, relationships
- `architecture/content-lifecycle.mdx` — Create > Edit > Publish > Version flow with Mermaid diagram
- `architecture/localization-model.mdx` — Translation groups, locale independence, query patterns
- `architecture/migrations.mdx` — Drizzle migration strategy, schema evolution, zero-downtime patterns

**Group: API Layer**

- `architecture/request-flow.mdx` — 8-step middleware chain walkthrough with code snippets
- `architecture/auth.mdx` — Authentication (API key, session, CLI loopback OAuth flow) and authorization (RBAC, capabilities)
- `architecture/scopes-and-permissions.mdx` — Operation scopes, role-capability matrix, enforcement points

### Tab 3: API Reference

Developer reference for integrating with MDCMS.

**Group: Getting Started**

- `api-reference/overview.mdx` — Base URL, required headers, response envelope, pagination
- `api-reference/authentication.mdx` — Auth methods, obtaining API keys, session management
- `api-reference/errors.mdx` — Error codes, response format, resolve errors

**Group: Content API**

- `api-reference/content/list.mdx` — GET /content with full param docs, examples, filters
- `api-reference/content/get.mdx` — GET /content/{id}
- `api-reference/content/create.mdx` — POST /content
- `api-reference/content/update.mdx` — PUT /content/{id}
- `api-reference/content/publish.mdx` — POST /content/{id}/publish
- `api-reference/content/versions.mdx` — GET /content/{id}/versions, GET /content/{id}/versions/{v}
- `api-reference/content/delete.mdx` — DELETE /content/{id}
- `api-reference/content/overview-stats.mdx` — GET /content/overview

**Group: Schema API**

- `api-reference/schema/list.mdx` — GET /schema
- `api-reference/schema/get.mdx` — GET /schema/{type}
- `api-reference/schema/sync.mdx` — PUT /schema (CLI sync flow)

**Group: Media API**

- `api-reference/media/upload.mdx` — POST /media
- `api-reference/media/delete.mdx` — DELETE /media/{id}

**Group: Webhooks API**

- `api-reference/webhooks/list.mdx` — GET /webhooks
- `api-reference/webhooks/create.mdx` — POST /webhooks
- `api-reference/webhooks/update.mdx` — PUT /webhooks/{id}
- `api-reference/webhooks/delete.mdx` — DELETE /webhooks/{id}

**Group: SDK**

- `api-reference/sdk/installation.mdx` — Install, peer deps
- `api-reference/sdk/client-setup.mdx` — createClient, configuration options
- `api-reference/sdk/querying.mdx` — get, list, filtering, sorting, pagination
- `api-reference/sdk/error-handling.mdx` — MdcmsApiError, MdcmsClientError, retry patterns
- `api-reference/sdk/nextjs.mdx` — Dynamic routes, generateStaticParams, ISR, revalidation

### Tab 4: Development

Contributor guide for working on MDCMS itself.

**Group: Getting Started**

- `development/prerequisites.mdx` — Bun, Docker, Node.js, OS-specific notes
- `development/local-setup.mdx` — Clone, install, Docker Compose, manual setup, service endpoints
- `development/environment-variables.mdx` — All env vars with descriptions, required vs optional

**Group: Monorepo**

- `development/packages/overview.mdx` — Workspace layout, dependency graph
- `development/packages/server.mdx` — Elysia server architecture, adding endpoints, testing
- `development/packages/cli.mdx` — CLI architecture, adding commands
- `development/packages/studio.mdx` — Studio package, host integration, UI components
- `development/packages/sdk.mdx` — SDK architecture, adding methods
- `development/packages/shared.mdx` — Shared contracts, types, utilities
- `development/packages/modules.mdx` — Module system, creating custom modules

**Group: Contributing**

- `development/workflow.mdx` — Branch naming, commit conventions, PR process
- `development/code-conventions.mdx` — TypeScript strict, formatting, naming rules
- `development/testing.mdx` — Unit tests, integration tests, CI gates, coverage
- `development/database-migrations.mdx` — Drizzle migration workflow, schema changes

### Tab 5: Changelog

- `changelog.mdx` — Release notes placeholder

## Total: ~50 pages

## Content Depth Strategy

### Guides

- Step-by-step walkthroughs using `<Steps>` component
- Tips/warnings using `<Note>`, `<Warning>`, `<Tip>` callouts inline
- "Common Issues" `<AccordionGroup>` at bottom of procedural pages
- Real configuration examples, not abstract placeholders

### API Reference

- `<ParamField>` for every parameter on every endpoint
- Full request/response JSON in `<CodeGroup>` (cURL + SDK)
- Error cases documented per endpoint
- Pagination examples for list endpoints

### Architecture

- Mermaid diagrams for data flow, entity relationships, request pipeline
- Code snippets from the actual codebase where relevant
- Decision rationale ("Why X over Y") in callouts

### Development

- Copy-pasteable commands throughout
- Platform-specific `<Tabs>` (macOS / Linux)
- Troubleshooting `<Accordion>` sections
- Service endpoint tables

## Component Usage Plan

| Component                 | Usage                                                    |
| ------------------------- | -------------------------------------------------------- |
| `<Steps>`                 | All procedural guides (setup, publishing, CLI workflows) |
| `<CodeGroup>`             | Multi-format examples (cURL/SDK, bun/npm, macOS/Linux)   |
| `<Tabs>`                  | Platform alternatives, install methods                   |
| `<Accordion>`             | FAQ, troubleshooting, edge cases                         |
| `<Card>`                  | Landing page navigation, feature highlights              |
| `<Note/Warning/Tip/Info>` | Inline callouts throughout                               |
| `<ParamField>`            | Every API parameter                                      |
| Mermaid                   | Architecture diagrams, data flow, ER diagrams            |
| Tables                    | Technology stacks, permission matrices, env vars         |
| `<Frame>`                 | Screenshot/diagram containers                            |

## Git Strategy

- `docs` branch created from main, pushed to remote
- Feature branch in worktree for implementation
- PR from feature branch → docs branch
- Nothing touches main

## Files & Directories

```
apps/docs/
├── docs.json
├── favicon.svg
├── .mintignore
├── logo/
│   ├── light.svg
│   └── dark.svg
├── images/
├── index.mdx
├── guide/
│   ├── concepts.mdx
│   ├── studio/
│   │   ├── dashboard.mdx
│   │   ├── content-editor.mdx
│   │   ├── publishing.mdx
│   │   ├── version-history.mdx
│   │   ├── localization.mdx
│   │   └── settings.mdx
│   ├── cli/
│   │   ├── installation.mdx
│   │   ├── commands.mdx
│   │   ├── configuration.mdx
│   │   └── ci-cd.mdx
│   └── schema/
│       ├── defining-types.mdx
│       ├── field-types.mdx
│       ├── modifiers-and-validation.mdx
│       ├── references.mdx
│       ├── environment-overlays.mdx
│       └── mdx-components.mdx
├── architecture/
│   ├── overview.mdx
│   ├── technology-stack.mdx
│   ├── module-system.mdx
│   ├── multi-tenancy.mdx
│   ├── data-model.mdx
│   ├── content-lifecycle.mdx
│   ├── localization-model.mdx
│   ├── migrations.mdx
│   ├── request-flow.mdx
│   ├── auth.mdx
│   └── scopes-and-permissions.mdx
├── api-reference/
│   ├── overview.mdx
│   ├── authentication.mdx
│   ├── errors.mdx
│   ├── content/
│   │   ├── list.mdx
│   │   ├── get.mdx
│   │   ├── create.mdx
│   │   ├── update.mdx
│   │   ├── publish.mdx
│   │   ├── versions.mdx
│   │   ├── delete.mdx
│   │   └── overview-stats.mdx
│   ├── schema/
│   │   ├── list.mdx
│   │   ├── get.mdx
│   │   └── sync.mdx
│   ├── media/
│   │   ├── upload.mdx
│   │   └── delete.mdx
│   ├── webhooks/
│   │   ├── list.mdx
│   │   ├── create.mdx
│   │   ├── update.mdx
│   │   └── delete.mdx
│   └── sdk/
│       ├── installation.mdx
│       ├── client-setup.mdx
│       ├── querying.mdx
│       ├── error-handling.mdx
│       └── nextjs.mdx
├── development/
│   ├── prerequisites.mdx
│   ├── local-setup.mdx
│   ├── environment-variables.mdx
│   ├── packages/
│   │   ├── overview.mdx
│   │   ├── server.mdx
│   │   ├── cli.mdx
│   │   ├── studio.mdx
│   │   ├── sdk.mdx
│   │   ├── shared.mdx
│   │   └── modules.mdx
│   ├── workflow.mdx
│   ├── code-conventions.mdx
│   ├── testing.mdx
│   └── database-migrations.mdx
└── changelog.mdx
```
