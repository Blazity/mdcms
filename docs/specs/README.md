# MDCMS Spec Catalog

This catalog owns the live product and subsystem specifications for MDCMS. Contracts remain spec-owned in v1; there is no separate contracts catalog.

## Ownership Rules

- Each live behavior or contract has one owning spec under `docs/specs/`.
- If multiple specs mention the same behavior or contract, the owner named in this catalog wins and non-owning mentions are informative only.
- Each owning spec is authoritative for the endpoint contracts it owns.
- Within an owning spec, the endpoint contract table is normative; if surrounding prose in the same spec conflicts with the contract table, the contract table wins.
- ADRs under `docs/adrs/` capture the decision rationale but do not replace the owning spec for normative behavior.
- `SPEC-005` owns the shared HTTP contract template used by all endpoint tables.
- `ROADMAP_TASKS.md` remains the execution plan and acceptance-criteria tracker.

## Spec Catalog

| ID       | Title                                                                                                  | Owns                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| SPEC-001 | [Platform Overview and Scope](./SPEC-001-platform-overview-and-scope.md)                               | Overview, product scope, and MVP/Post-MVP summary                                                    |
| SPEC-002 | [System Architecture and Extensibility](./SPEC-002-system-architecture-and-extensibility.md)           | Architecture, module model, action catalog, package structure, and extensibility endpoints           |
| SPEC-003 | [Content Storage, Versioning, and Migrations](./SPEC-003-content-storage-versioning-and-migrations.md) | Content storage model, content API, version history, conflict handling, and migrations               |
| SPEC-004 | [Schema System and Sync](./SPEC-004-schema-system-and-sync.md)                                         | Schema definitions, overlays, sync behavior, and schema registry endpoints                           |
| SPEC-005 | [Auth, Authorization, and Request Routing](./SPEC-005-auth-authorization-and-request-routing.md)       | Shared HTTP boundary, auth, request routing, authorization scoping, and auth-related endpoints       |
| SPEC-006 | [Studio Runtime and UI](./SPEC-006-studio-runtime-and-ui.md)                                           | Studio delivery contract, embedding model, UI behavior, project switching, and runtime endpoints     |
| SPEC-007 | [Editor, MDX, and Collaboration](./SPEC-007-editor-mdx-and-collaboration.md)                           | Editor engine, MDX component system, and collaboration endpoints/architecture                        |
| SPEC-008 | [CLI and SDK](./SPEC-008-cli-and-sdk.md)                                                               | SDK behavior plus CLI workflows and action runner                                                    |
| SPEC-009 | [i18n and Environments](./SPEC-009-i18n-and-environments.md)                                           | Localization, project/environment hierarchy, environment model, and environment management endpoints |
| SPEC-010 | [Media, Webhooks, Search, and Integrations](./SPEC-010-media-webhooks-search-and-integrations.md)      | Post-MVP media, webhooks, and search                                                                 |
| SPEC-011 | [Local Development and Operations](./SPEC-011-local-development-and-operations.md)                     | Docker Compose stack and local developer workflow                                                    |

## Legacy Migration Map

Every numbered section and subsection from the legacy monolithic spec maps to exactly one live owner in `docs/`.

| Legacy Section | Legacy Title                                                           | New Owner                                                          |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `1`            | Overview                                                               | `docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `2`            | Architecture                                                           | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.1`          | Deployment Topology                                                    | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.2`          | Future Considerations                                                  | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.3`          | Unified Extensibility Contract + Studio Delivery (v1)                  | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.4`          | Server Surface (Source of Truth)                                       | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.5`          | Studio Runtime Delivery Contract (Approach C)                          | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `2.6`          | CLI Surface (Action-Based Only)                                        | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.7`          | Composition and Dependency Model (Elysia-Native IoC)                   | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.8`          | Backend Metadata Contract (Typed Action Registry + `/actions` Catalog) | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.9`          | Runtime Data Flow (Approach C)                                         | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.10`         | Validation, Collision, and Safety Rules                                | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.11`         | Versioning and Compatibility                                           | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.12`         | CQRS-Lite (Read/Write Separation)                                      | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.13`         | Testing Plan for Extensibility                                         | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.14`         | Acceptance Criteria                                                    | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.15`         | Implementation Sequence                                                | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.16`         | Assumptions and Defaults                                               | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3`            | Tech Stack                                                             | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3.1`          | Package Structure                                                      | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3.2`          | Unified Module Layout (v1)                                             | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `4`            | Content Model & Storage                                                | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.1`          | Storage Model: Two-Table Hybrid (Mutable Head + Immutable Versions)    | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.2`          | Document Lifecycle                                                     | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.3`          | Auto-Save                                                              | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.4`          | Soft Delete                                                            | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.5`          | Document Identity                                                      | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.6`          | Draft / Publish Workflow                                               | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `5`            | Schema System                                                          | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.1`          | Schema Definition (Code-First)                                         | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.2`          | Schema Sync (Explicit Actions → Server)                                | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.3`          | Schema UI Sync                                                         | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.4`          | Per-Environment Schema Overlays                                        | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.5`          | Schema Sync Behavior Per Environment                                   | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.6`          | Reference Field Identity                                               | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `6`            | REST API                                                               | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.1`          | Base URL                                                               | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.2`          | Authentication                                                         | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.2.1`        | Explicit Target Routing                                                | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.3`          | Content Endpoints                                                      | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `6.4`          | Query Parameters (Content Listing)                                     | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `6.5`          | Response Format                                                        | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.6`          | Schema Endpoints                                                       | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `6.7`          | Media Endpoints                                                        | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `6.8`          | Webhook Endpoints                                                      | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `6.9`          | Environment Endpoints                                                  | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `6.10`         | Collaboration Endpoints                                                | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `6.11`         | Extensibility Contract Endpoints                                       | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `6.12`         | Action Catalog Metadata Contract                                       | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `7`            | SDK                                                                    | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.1`          | Design Goals                                                           | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.2`          | Usage                                                                  | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.3`          | Runtime Type Inference                                                 | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8`            | CLI                                                                    | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.1`          | Commands                                                               | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2`          | `cms init` — Interactive Wizard                                        | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2.1`        | Brownfield Locale Detection and Remapping Algorithm                    | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2.2`        | Brownfield Verification Scenarios                                      | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.3`          | `cms pull`                                                             | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.3.1`        | Local File Mapping Contract (Strict)                                   | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.4`          | `cms push`                                                             | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.5`          | `cms schema sync`                                                      | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.6`          | `cms migrate`                                                          | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.7`          | Authentication                                                         | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.8`          | Action Runner and Alias Resolution                                     | `docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `9`            | Studio UI                                                              | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.1`          | Embedding                                                              | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.2`          | Routing                                                                | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.3`          | Content Navigation                                                     | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.4`          | Branding                                                               | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.5`          | Bulk Operations                                                        | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.6`          | Extensibility Surfaces (Backend-First + Runtime Bundle)                | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `10`           | Editor & Post-MVP Real-Time Collaboration                              | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.1`         | Editor Engine                                                          | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.1.1`       | Markdown Serialization                                                 | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.2`         | Post-MVP Collaboration Architecture                                    | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.2.1`       | Post-MVP Collaboration Authorization Flow                              | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.3`         | State Management                                                       | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.4`         | Presence Awareness (Post-MVP)                                          | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.5`         | Saving                                                                 | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `11`           | Authentication & Authorization                                         | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1`         | User Authentication                                                    | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1.1`       | Session Security                                                       | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1.2`       | Collaboration Socket Authentication (Post-MVP)                         | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2`         | API Authentication                                                     | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2.1`       | API Key Scope Model                                                    | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2.2`       | CLI Browser Login/Logout Handshake (CMS-79)                            | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.3`         | Authorization (Role-Based, Per-Folder)                                 | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `12`           | Internationalization (i18n)                                            | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.1`         | Data Model                                                             | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.2`         | Configuration                                                          | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.3`         | Editor UX                                                              | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.4`         | SDK Usage                                                              | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.5`         | CLI Behavior                                                           | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13`           | Content Environments                                                   | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.1`         | Architecture                                                           | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.2`         | Default Environments                                                   | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.3`         | Cloning                                                                | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.4`         | Promoting (Cross-Environment Sync)                                     | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.5`         | Environment in API / SDK                                               | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `14`           | Version History                                                        | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.1`         | How It Works                                                           | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.2`         | Viewing History                                                        | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.3`         | Restoring a Version                                                    | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.4`         | Snapshots Only (No Branching)                                          | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `15`           | Media Management (Post-MVP)                                            | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.1`         | Storage                                                                | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.1.1`       | Upload Constraints Config                                              | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.2`         | Planned Upload Flow                                                    | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.3`         | Media Metadata                                                         | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.4`         | Scope Status                                                           | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16`           | Webhooks (Post-MVP)                                                    | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.1`         | Purpose                                                                | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.2`         | Configuration                                                          | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.3`         | Events                                                                 | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.4`         | Payload Format                                                         | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.4.1`       | Signing and Verification                                               | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.5`         | Delivery                                                               | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17`           | Search (Post-MVP)                                                      | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.1`         | Deferred Design Target                                                 | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.2`         | API Usage (When Implemented)                                           | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.3`         | Future                                                                 | `docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `18`           | MDX Component System                                                   | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.1`         | Component Registration                                                 | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.2`         | Auto Prop Extraction                                                   | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.3`         | Prop Type → Form Control Mapping                                       | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.4`         | Widget Hints (Developer Overrides)                                     | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.5`         | Custom Props Editors                                                   | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.6`         | Children / Nested Content                                              | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.7`         | Editor Integration (Node Views)                                        | `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `19`           | Conflict Resolution                                                    | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.1`         | CMS ↔ CMS (Post-MVP Collaborative)                                    | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.2`         | CMS ↔ CLI (Draft-Revision Optimistic Concurrency)                     | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.3`         | Pull After Rejection                                                   | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20`           | Content Migrations                                                     | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.1`         | When Migrations Are Needed                                             | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.2`         | Workflow                                                               | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.3`         | Migration Tracking                                                     | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `21`           | Docker Compose & Local Development                                     | `docs/specs/SPEC-011-local-development-and-operations.md`          |
| `21.1`         | Stack                                                                  | `docs/specs/SPEC-011-local-development-and-operations.md`          |
| `21.2`         | Getting Started (Developer Experience)                                 | `docs/specs/SPEC-011-local-development-and-operations.md`          |
| `22`           | MVP vs Post-MVP                                                        | `docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `22.1`         | MVP Features                                                           | `docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `22.2`         | Post-MVP Features                                                      | `docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `23`           | Decisions & Remaining Research                                         | `docs/adrs/README.md`                                              |
| `23.1`         | Backend Framework — Research Findings                                  | `docs/adrs/ADR-001-backend-framework-bun-elysia.md`                |
| `23.2`         | Multi-Project & Organization System                                    | `docs/adrs/ADR-004-project-environment-hierarchy.md`               |
| `23.2.1`       | Hierarchy                                                              | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.2`       | Project Scoping                                                        | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.3`       | Permissions: Project-Scoped and Global                                 | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `23.2.4`       | API Keys: Tuple-Scoped Authorization                                   | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `23.2.5`       | Data Model Impact                                                      | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.6`       | Studio Implications                                                    | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `23.2.7`       | Research Action Points (Contentful Reference)                          | `docs/adrs/ADR-004-project-environment-hierarchy.md`               |
| `24`           | Canonical HTTP Endpoint Contracts                                      | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.1`         | Contract Template (Normative)                                          | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.2`         | Core Runtime and Studio Runtime Endpoints                              | `docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `24.3`         | Authentication, Session, and API Key Endpoints                         | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.4`         | CMS-79 CLI Browser Login Endpoints                                     | `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.5`         | Content API Endpoints                                                  | `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `24.6`         | Schema Registry Endpoints                                              | `docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `24.7`         | Environment Management Endpoints                                       | `docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `24.8`         | Module Surface Endpoints                                               | `docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
