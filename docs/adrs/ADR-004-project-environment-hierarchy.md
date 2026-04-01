---
status: accepted
canonical: true
created: 2026-03-11
last_updated: 2026-03-11
---

# ADR-004 Project and Environment Hierarchy

This is the live canonical document under `docs/`.

## Context

MDCMS needs clear isolation boundaries for content, schemas, permissions, environments, and API keys in self-hosted deployments, while also leaving room for a future hosted model.

## Decision

Use a Project -> Environment hierarchy for the self-hosted product. Keep the data model compatible with a future Organization -> Project -> Environment hierarchy by reserving `organization_id` on projects.

## Rationale

- Project-level isolation keeps content, schema, media, and webhook state independent and avoids cross-project coupling.
- Environment-level routing provides the right unit for draft/publish promotion, schema overlays, and API key allowlists.
- Reserving the organization slot now avoids blocking a future hosted SaaS model without introducing unnecessary MVP complexity.

## Consequences

- Requests remain explicitly routed by project and environment where relevant.
- Permissions may be global or project-scoped, with the most permissive applicable role winning.
- API keys authorize `(project, environment)` tuples but do not replace explicit routing in requests.

## Related Specs

- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- `docs/specs/SPEC-009-i18n-and-environments.md`

## Addendum: Explicit Project Creation via CLI (2026-04-01)

Projects and environments are now created explicitly during `mdcms init` via dedicated API endpoints (`POST /api/v1/projects`, `POST /api/v1/projects/:slug/environments`). The init flow fetches available projects, offers selection or creation, then similarly for environments.

Auto-provisioning via `ensureProjectProvisioned` remains as a fallback for direct API calls that reference a project not yet in the database.
