---
status: live
canonical: true
created: 2026-04-05
last_updated: 2026-04-05
---

# SPEC-012 Studio Review App and Preview Workflow

This is the live canonical document under `docs/`.

## Purpose

The Studio review app is a repo-internal Next.js application that provides
deterministic visual review routes for MDCMS Studio without requiring the full
Docker Compose stack. It exists to make Studio UI changes reviewable on pull
requests and on `main`, while exercising the normal Studio shell against a
review-only bootstrap manifest, runtime asset bundle, and scenario-backed API
subtree.

The review app is not a published package and is not part of the tenant-facing
product surface. It is still a maintained engineering compatibility surface and
must stay aligned with the Studio and backend contracts it consumes.

## Application Boundary

- App root: `apps/studio-review`
- Framework: Next.js
- Deployment model: standalone Vercel project rooted at `apps/studio-review`
- Studio shell: the normal `@mdcms/studio` component
- Review bootstrap source: app-local review API route
- Review runtime assets: generated locally from the review runtime build
- Review data source: scenario-backed mock handlers under an app-local review API
  subtree

The review app must not require the full MDCMS Compose stack to render its
supported review routes.

## Review Surfaces

The review app owns these route families:

| Surface          | Path pattern                                                | Purpose                                                       |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Review UI        | `/review/:scenario/admin` and nested admin paths            | Interactive Studio review routes for a deterministic scenario |
| Review API       | `/review-api/:scenario/api/v1/*`                            | Scenario-backed API responses used only by the review app     |
| Review bootstrap | `/review-api/:scenario/api/v1/studio/bootstrap`             | Review bootstrap manifest for the selected scenario           |
| Review assets    | `/review-api/:scenario/api/v1/studio/assets/:buildId/:file` | Runtime assets referenced by the review bootstrap manifest    |

The review app must preserve scenario-scoped routing so multiple deterministic
states can be reviewed without changing code or environment variables.

## Required Review Behavior

The review app must:

- mount the normal Studio shell instead of a review-only fork of the Studio UI
- generate and serve a real runtime artifact bundle for review deployments
- use deterministic scenario data, stable IDs, and stable timestamps unless a
  scenario is explicitly testing time-dependent UI
- keep review-only bootstrap and asset delivery local to the review app
- keep scenario fixtures and review handlers isolated from production host apps

The review app must not:

- depend on the full production backend stack for normal preview rendering
- introduce production-only conditionals into the Studio package just for review
  mode
- silently ignore upstream contract changes by returning stale or partial mock
  data

## Scenario Requirements

Each review scenario must be deterministic and named for the user capability or
review state it represents. Scenario fixtures must model the same request and
response contracts used by the Studio shell for the review surface being
exercised.

At minimum, the maintained scenario set must cover:

- an editor document flow
- an owner-capability navigation flow
- a viewer or restricted-capability flow
- a schema failure or unavailable-state flow

Additional scenarios may be added for regressions, new Studio surfaces, or
design review needs.

## Contract Synchronization Rule

The review app consumes the same contract families as the Studio shell for:

- Studio bootstrap manifests and runtime asset loading
- capability discovery
- schema reads
- content document reads
- content version history
- review-supported content mutations (create, publish, unpublish, duplicate, delete)

Whenever a change modifies any contract consumed by the review app, the same
change must update the review app so its mocks and preview routes remain in
sync. This applies to changes in:

- request methods or paths
- required route context such as `project`, `environment`, or document identity
- auth mode, auth transport, or required scopes
- success response shape or field semantics
- deterministic error status, error codes, or envelope shape
- bootstrap manifest fields, runtime asset paths, or runtime loading behavior
- Studio expectations about scenario data shape, enum values, or required fields

Required follow-through for such a change:

1. Update the owning spec for the changed contract.
2. Update `apps/studio-review` review handlers, runtime build plumbing, and
   scenario fixtures as needed.
3. Update or add tests covering the affected review route, handler, or runtime
   artifact behavior.
4. Update operator-facing review app documentation when the review workflow or
   scenario set changes.

A contract change is incomplete if it leaves the review app relying on stale
mocks or stale bootstrap/runtime assumptions.

## Deployment And Pull Request Workflow

The review app must be deployed from Git as a standalone Vercel project rooted
at `apps/studio-review`.

The deployment workflow requirements are:

- `main` must remain deployable for the review app project
- pull requests must create review app preview deployments from Git
- the preview deployment must expose the review UI and review API route families
- the review app must be independently deployable without deploying the rest of
  the monorepo as separate Vercel projects

The review app may be protected behind Vercel access controls, but the Git-based
preview deployment flow remains mandatory.

## Verification Expectations

Changes to the review app or to contracts consumed by the review app must verify
the following before merge:

- the review runtime artifact build succeeds
- review app tests for scenarios and runtime artifacts pass
- the review bootstrap route serves a manifest for a representative scenario
- a representative review UI route renders successfully from the deployed build

These checks may run through local commands, CI automation, or deployed preview
verification, but the review app must fail loudly when its fixtures drift from
the contracts it consumes.
