# MDCMS Spec Catalog

This catalog owns the live product and subsystem specifications for MDCMS. Contracts remain spec-owned in v1; there is no separate contracts catalog.

## Ownership Rules

- Each live behavior or contract has one owning spec under `docs/specs/`.
- If multiple specs mention the same behavior or contract, the owner named in this catalog wins and non-owning mentions are informative only.
- Each owning spec is authoritative for the endpoint contracts it owns.
- Within an owning spec, the endpoint contract table is normative; if surrounding prose in the same spec conflicts with the contract table, the contract table wins.
- ADRs under `docs/adrs/` capture the decision rationale but do not replace the owning spec for normative behavior.
- `SPEC-005` owns the shared HTTP contract template used by all endpoint tables.
- `/Users/karol/Desktop/mdcms/ROADMAP_TASKS.md` remains the execution plan and acceptance-criteria tracker.

## Spec Catalog

| ID       | Title                                                                                                  | Owns                                                                                                 | Legacy Coverage                                               |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| SPEC-001 | [Platform Overview and Scope](./SPEC-001-platform-overview-and-scope.md)                               | Overview, product scope, and MVP/Post-MVP summary                                                    | 1, 22.1, 22.2                                                 |
| SPEC-002 | [System Architecture and Extensibility](./SPEC-002-system-architecture-and-extensibility.md)           | Architecture, module model, action catalog, package structure, and extensibility endpoints           | 2.1-2.4, 2.6-2.16, 3, 6.11, 6.12, 24.8                        |
| SPEC-003 | [Content Storage, Versioning, and Migrations](./SPEC-003-content-storage-versioning-and-migrations.md) | Content storage model, content API, version history, conflict handling, and migrations               | 4, 6.3, 6.4, 14, 19, 20, 24.5                                 |
| SPEC-004 | [Schema System and Sync](./SPEC-004-schema-system-and-sync.md)                                         | Schema definitions, overlays, sync behavior, and schema registry endpoints                           | 5, 6.6, 24.6                                                  |
| SPEC-005 | [Auth, Authorization, and Request Routing](./SPEC-005-auth-authorization-and-request-routing.md)       | Shared HTTP boundary, auth, request routing, authorization scoping, and auth-related endpoints       | 6, 6.1, 6.2, 6.2.1, 6.5, 11, 23.2.3, 23.2.4, 24.1, 24.3, 24.4 |
| SPEC-006 | [Studio Runtime and UI](./SPEC-006-studio-runtime-and-ui.md)                                           | Studio delivery contract, embedding model, UI behavior, project switching, and runtime endpoints     | 2.5, 9, 23.2.6, 24.2                                          |
| SPEC-007 | [Editor, MDX, and Collaboration](./SPEC-007-editor-mdx-and-collaboration.md)                           | Editor engine, MDX component system, and collaboration endpoints/architecture                        | 10, 18, 6.10                                                  |
| SPEC-008 | [CLI and SDK](./SPEC-008-cli-and-sdk.md)                                                               | SDK behavior plus CLI workflows and action runner                                                    | 7, 8                                                          |
| SPEC-009 | [i18n and Environments](./SPEC-009-i18n-and-environments.md)                                           | Localization, project/environment hierarchy, environment model, and environment management endpoints | 12, 13, 23.2.1, 23.2.2, 23.2.5, 6.9, 24.7                     |
| SPEC-010 | [Media, Webhooks, Search, and Integrations](./SPEC-010-media-webhooks-search-and-integrations.md)      | Post-MVP media, webhooks, and search                                                                 | 15, 16, 17, 6.7, 6.8                                          |
| SPEC-011 | [Local Development and Operations](./SPEC-011-local-development-and-operations.md)                     | Docker Compose stack and local developer workflow                                                    | 21                                                            |

## Legacy Migration Map

Every numbered section and subsection from the legacy monolithic spec maps to exactly one live owner in `docs/`.

| Legacy Section | Legacy Title                                                           | New Owner                                                                                     |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `1`            | Overview                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `2`            | Architecture                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.1`          | Deployment Topology                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.2`          | Future Considerations                                                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.3`          | Unified Extensibility Contract + Studio Delivery (v1)                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.4`          | Server Surface (Source of Truth)                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.5`          | Studio Runtime Delivery Contract (Approach C)                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `2.6`          | CLI Surface (Action-Based Only)                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.7`          | Composition and Dependency Model (Elysia-Native IoC)                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.8`          | Backend Metadata Contract (Typed Action Registry + `/actions` Catalog) | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.9`          | Runtime Data Flow (Approach C)                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.10`         | Validation, Collision, and Safety Rules                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.11`         | Versioning and Compatibility                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.12`         | CQRS-Lite (Read/Write Separation)                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.13`         | Testing Plan for Extensibility                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.14`         | Acceptance Criteria                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.15`         | Implementation Sequence                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `2.16`         | Assumptions and Defaults                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3`            | Tech Stack                                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3.1`          | Package Structure                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `3.2`          | Unified Module Layout (v1)                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `4`            | Content Model & Storage                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.1`          | Storage Model: Two-Table Hybrid (Mutable Head + Immutable Versions)    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.2`          | Document Lifecycle                                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.3`          | Auto-Save                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.4`          | Soft Delete                                                            | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.5`          | Document Identity                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `4.6`          | Draft / Publish Workflow                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `5`            | Schema System                                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.1`          | Schema Definition (Code-First)                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.2`          | Schema Sync (Explicit Actions → Server)                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.3`          | Schema UI Sync                                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.4`          | Per-Environment Schema Overlays                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.5`          | Schema Sync Behavior Per Environment                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `5.6`          | Reference Field Identity                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `6`            | REST API                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.1`          | Base URL                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.2`          | Authentication                                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.2.1`        | Explicit Target Routing                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.3`          | Content Endpoints                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `6.4`          | Query Parameters (Content Listing)                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `6.5`          | Response Format                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `6.6`          | Schema Endpoints                                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `6.7`          | Media Endpoints                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `6.8`          | Webhook Endpoints                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `6.9`          | Environment Endpoints                                                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `6.10`         | Collaboration Endpoints                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `6.11`         | Extensibility Contract Endpoints                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `6.12`         | Action Catalog Metadata Contract                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
| `7`            | SDK                                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.1`          | Design Goals                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.2`          | Usage                                                                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `7.3`          | Runtime Type Inference                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8`            | CLI                                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.1`          | Commands                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2`          | `cms init` — Interactive Wizard                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2.1`        | Brownfield Locale Detection and Remapping Algorithm                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.2.2`        | Brownfield Verification Scenarios                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.3`          | `cms pull`                                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.3.1`        | Local File Mapping Contract (Strict)                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.4`          | `cms push`                                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.5`          | `cms schema sync`                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.6`          | `cms migrate`                                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.7`          | Authentication                                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `8.8`          | Action Runner and Alias Resolution                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`                               |
| `9`            | Studio UI                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.1`          | Embedding                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.2`          | Routing                                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.3`          | Content Navigation                                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.4`          | Branding                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.5`          | Bulk Operations                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `9.6`          | Extensibility Surfaces (Backend-First + Runtime Bundle)                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `10`           | Editor & Post-MVP Real-Time Collaboration                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.1`         | Editor Engine                                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.1.1`       | Markdown Serialization                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.2`         | Post-MVP Collaboration Architecture                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.2.1`       | Post-MVP Collaboration Authorization Flow                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.3`         | State Management                                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.4`         | Presence Awareness (Post-MVP)                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `10.5`         | Saving                                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `11`           | Authentication & Authorization                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1`         | User Authentication                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1.1`       | Session Security                                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.1.2`       | Collaboration Socket Authentication (Post-MVP)                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2`         | API Authentication                                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2.1`       | API Key Scope Model                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.2.2`       | CLI Browser Login/Logout Handshake (CMS-79)                            | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `11.3`         | Authorization (Role-Based, Per-Folder)                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `12`           | Internationalization (i18n)                                            | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.1`         | Data Model                                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.2`         | Configuration                                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.3`         | Editor UX                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.4`         | SDK Usage                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `12.5`         | CLI Behavior                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13`           | Content Environments                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.1`         | Architecture                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.2`         | Default Environments                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.3`         | Cloning                                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.4`         | Promoting (Cross-Environment Sync)                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `13.5`         | Environment in API / SDK                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `14`           | Version History                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.1`         | How It Works                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.2`         | Viewing History                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.3`         | Restoring a Version                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `14.4`         | Snapshots Only (No Branching)                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `15`           | Media Management (Post-MVP)                                            | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.1`         | Storage                                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.1.1`       | Upload Constraints Config                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.2`         | Planned Upload Flow                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.3`         | Media Metadata                                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `15.4`         | Scope Status                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16`           | Webhooks (Post-MVP)                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.1`         | Purpose                                                                | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.2`         | Configuration                                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.3`         | Events                                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.4`         | Payload Format                                                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.4.1`       | Signing and Verification                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `16.5`         | Delivery                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17`           | Search (Post-MVP)                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.1`         | Deferred Design Target                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.2`         | API Usage (When Implemented)                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `17.3`         | Future                                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-010-media-webhooks-search-and-integrations.md`    |
| `18`           | MDX Component System                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.1`         | Component Registration                                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.2`         | Auto Prop Extraction                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.3`         | Prop Type → Form Control Mapping                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.4`         | Widget Hints (Developer Overrides)                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.5`         | Custom Props Editors                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.6`         | Children / Nested Content                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `18.7`         | Editor Integration (Node Views)                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-007-editor-mdx-and-collaboration.md`              |
| `19`           | Conflict Resolution                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.1`         | CMS ↔ CMS (Post-MVP Collaborative)                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.2`         | CMS ↔ CLI (Draft-Revision Optimistic Concurrency)                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `19.3`         | Pull After Rejection                                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20`           | Content Migrations                                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.1`         | When Migrations Are Needed                                             | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.2`         | Workflow                                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `20.3`         | Migration Tracking                                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `21`           | Docker Compose & Local Development                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-011-local-development-and-operations.md`          |
| `21.1`         | Stack                                                                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-011-local-development-and-operations.md`          |
| `21.2`         | Getting Started (Developer Experience)                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-011-local-development-and-operations.md`          |
| `22`           | MVP vs Post-MVP                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `22.1`         | MVP Features                                                           | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `22.2`         | Post-MVP Features                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-001-platform-overview-and-scope.md`               |
| `23`           | Decisions & Remaining Research                                         | `/Users/karol/Desktop/mdcms/docs/adrs/README.md`                                              |
| `23.1`         | Backend Framework — Research Findings                                  | `/Users/karol/Desktop/mdcms/docs/adrs/ADR-001-backend-framework-bun-elysia.md`                |
| `23.2`         | Multi-Project & Organization System                                    | `/Users/karol/Desktop/mdcms/docs/adrs/ADR-004-project-environment-hierarchy.md`               |
| `23.2.1`       | Hierarchy                                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.2`       | Project Scoping                                                        | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.3`       | Permissions: Project-Scoped and Global                                 | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `23.2.4`       | API Keys: Tuple-Scoped Authorization                                   | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `23.2.5`       | Data Model Impact                                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `23.2.6`       | Studio Implications                                                    | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `23.2.7`       | Research Action Points (Contentful Reference)                          | `/Users/karol/Desktop/mdcms/docs/adrs/ADR-004-project-environment-hierarchy.md`               |
| `24`           | Canonical HTTP Endpoint Contracts                                      | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.1`         | Contract Template (Normative)                                          | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.2`         | Core Runtime and Studio Runtime Endpoints                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-006-studio-runtime-and-ui.md`                     |
| `24.3`         | Authentication, Session, and API Key Endpoints                         | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.4`         | CMS-79 CLI Browser Login Endpoints                                     | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-005-auth-authorization-and-request-routing.md`    |
| `24.5`         | Content API Endpoints                                                  | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` |
| `24.6`         | Schema Registry Endpoints                                              | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-004-schema-system-and-sync.md`                    |
| `24.7`         | Environment Management Endpoints                                       | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-009-i18n-and-environments.md`                     |
| `24.8`         | Module Surface Endpoints                                               | `/Users/karol/Desktop/mdcms/docs/specs/SPEC-002-system-architecture-and-extensibility.md`     |
