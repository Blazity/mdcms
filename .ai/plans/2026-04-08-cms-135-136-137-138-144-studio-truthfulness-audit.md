# Studio MVP Truthfulness Audit

**Tickets**: CMS-135, CMS-136, CMS-137, CMS-138, CMS-144
**Date**: 2026-04-08
**Owning spec**: SPEC-006 Studio Runtime and UI
**Scope**: Audit only -- flag non-compliant items, no code changes

---

## CMS-135: Audit Studio shell truthfulness and shared layout bugs

**Files**: `app-sidebar.tsx`, `page-header.tsx`, `layout.tsx`

### Findings

| #   | Severity | File:Line                 | Issue                                                                                                                                                                          |
| --- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HIGH     | `app-sidebar.tsx:78-82`   | **"Coming Soon" sidebar section** lists Scheduled, Audit Log, SEO Analysis. Roadmap leakage -- SPEC-006 does not define these routes. Sidebar advertises unbuilt capabilities. |
| 2   | HIGH     | `page-header.tsx:248-255` | **"Profile" and "Preferences" user menu items** are non-functional. No onClick, no navigation target, no page exists. Dead affordances implying non-existent features.         |
| 3   | LOW      | `app-sidebar.tsx:61`      | **API nav item uses `Search` icon** but the API page uses `Terminal`. Inconsistent.                                                                                            |
| 4   | LOW      | `app-sidebar.tsx:60`      | **Workflows nav item uses `Sparkles` icon** but the Workflows page uses `GitBranch`. Inconsistent.                                                                             |

### What's correct

- Layout uses real APIs only (capabilities, session, environments) -- no mock-data.ts imports
- User display from real session email with derived initials
- Environment selector from real environment API
- Role-gating of nav items (Schema, Users, Settings) via capabilities
- Theme toggle, sign out, project badge all functional

### Required changes

- [ ] Remove the "Coming Soon" sidebar section entirely (lines 78-82, 164-225)
- [ ] Remove non-functional "Profile" and "Preferences" from user menu (lines 248-255)
- [ ] Align sidebar icons: API -> Terminal, Workflows -> GitBranch

---

## CMS-136: Audit dashboard truthfulness and MVP surface fit

**Files**: `page.tsx` (dashboard), `dashboard-data.ts`

### Findings

| #   | Severity | File:Line | Issue                                                   |
| --- | -------- | --------- | ------------------------------------------------------- |
| --  | NONE     | --        | No issues found. Dashboard is truthful and MVP-aligned. |

### What's correct

- Stat cards (Documents, Published, Drafts) from real API via `loadDashboardData()`
- Content Types widget shows real schema types with truthful published/draft ratios
- Recent Documents widget shows last 5 from real content API with real timestamps
- "New Document" quick action gated by `canCreateContent`
- Forbidden, error, loading states all deterministic
- No live collaboration, activity feed, notification, or presence references
- No mock-data.ts imports

### Required changes

- None. Dashboard is clean.

---

## CMS-137: Audit `/content` overview page layout and truthfulness

**Files**: `pages/content-page.tsx`, `content-overview-state.ts`, `content-overview-api.ts`

### Findings

| #   | Severity | File:Line | Issue                                                           |
| --- | -------- | --------- | --------------------------------------------------------------- |
| --  | NONE     | --        | No issues found. Content overview is truthful and spec-aligned. |

### What's correct

- Schema-type cards keyed by live schema entries from real API
- Per-type metrics (total, published, drafts) from real content overview API
- Localization badges: "Localized" with locale list, "Single locale" -- matches spec
- Deterministic states: loading, forbidden, error, empty, permission-constrained, ready
- Permission-constrained view: cards visible, counts hidden, navigation disabled, clear banner
- `canNavigate` gating properly disables type links when content.read is false
- No mock-data.ts imports

### Required changes

- None. Content overview is clean.

---

## CMS-138: Audit `/content/:type` list page layout and unsupported affordances

**Files**: `app/admin/content/[type]/page.tsx`, `hooks/use-content-type-list.ts`, `create-document-dialog.tsx`

### Findings

| #   | Severity | File:Line | Issue                                                            |
| --- | -------- | --------- | ---------------------------------------------------------------- |
| --  | NONE     | --        | No issues found. Content type list is truthful and spec-aligned. |

### What's correct

- No checkboxes, multi-select, or bulk action toolbar (bulk ops are Post-MVP per spec)
- No live presence or "being edited by" indicators
- Row actions (Edit, Publish, Unpublish, Duplicate, Delete) properly capability-gated per spec
- Server-side search with 300ms debounce, status filter, sort
- Pagination server-side, PAGE_SIZE = 20
- Author initials from `users` sidecar email
- Row action error banner is dismissible
- Deterministic states: loading, forbidden, error, empty, ready with no-results sub-state
- No mock-data.ts imports

### Required changes

- None. Content type list is clean.

---

## CMS-144: Audit deferred placeholder pages (media, workflows, api)

**Files**: `media-page.tsx`, `workflows-page.tsx`, `api-page.tsx`, `coming-soon.tsx`

### Findings

| #   | Severity | File:Line                     | Issue                                                                                                                                                                                                                                                                                |
| --- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HIGH     | `media-page.tsx:17-37`        | **Elaborate ghosted mock UI** -- 12 mock media items, 4 mock folders with counts, search bar, upload button, folder sidebar. Implies a nearly-built media library. Should be an intentional placeholder, not a blurred product preview.                                              |
| 2   | HIGH     | `media-page.tsx:73-77`        | **Copy overclaims**: "Browse, search, tag, and organize all your media files" and "Reuse assets across documents with a powerful media management system." Claims capabilities that don't exist.                                                                                     |
| 3   | HIGH     | `workflows-page.tsx:24-30`    | **Feature list overclaims**: "Multi-step approval workflows", "Role-based review assignments", "Scheduled content publishing", "Webhook triggers and notifications", "Audit trail and compliance tracking." Ticket explicitly says these must not be claimed.                        |
| 4   | HIGH     | `api-page.tsx:24-30`          | **Feature list overclaims**: "Interactive GraphQL and REST explorer", "Auto-generated query builder", "Response previews with syntax highlighting", "Code generation for popular frameworks", "API key management and testing." Claims GraphQL, code generation, API key management. |
| 5   | HIGH     | `coming-soon.tsx:36-46`       | **`<ComingSoon>` component renders "Planned features:" list** with bullets. Roadmap leakage by design. The component exists to advertise future features.                                                                                                                            |
| 6   | MEDIUM   | `media-page.tsx` (whole file) | **Inconsistent treatment** -- Media page does NOT use `<ComingSoon>` component. Has its own custom layout while workflows and api use ComingSoon. Ticket requires consistent visual treatment.                                                                                       |
| 7   | MEDIUM   | `coming-soon.tsx:48`          | **"Notify Me When Available" button** -- Disabled but implies a notification/subscription system that doesn't exist.                                                                                                                                                                 |
| 8   | MEDIUM   | `media-page.tsx:143-153`      | **"Contribute on GitHub" link** points to bare `https://github.com`, not the actual repo. Dead/misleading link.                                                                                                                                                                      |
| 9   | LOW      | `workflows-page.tsx:14-16`    | **Page description overclaims**: "Automate content review and publishing processes."                                                                                                                                                                                                 |
| 10  | LOW      | `api-page.tsx:14-16`          | **Page description overclaims**: "Explore and test your content API endpoints."                                                                                                                                                                                                      |

### Required changes

- [ ] Remove all mock media items, folders, ghosted UI from media page
- [ ] Normalize media page to use `<ComingSoon>` component or equivalent consistent pattern
- [ ] Rework `<ComingSoon>` component: remove "Planned features:" section and "Notify Me" button
- [ ] Replace all overclaiming descriptions and feature lists with neutral MVP-safe copy
- [ ] Remove dead GitHub link from media page

---

## Cross-cutting observations

1. **mock-data.ts is NOT imported by any of the five audited surfaces.** Only consumed by out-of-scope pages (Users, Settings, Environments, Editor sidebar).

2. **CMS-136, CMS-137, CMS-138 are clean.** Their dependency tasks (CMS-130, CMS-131, CMS-132) delivered real integrations that replaced mock behavior. No changes needed.

3. **CMS-135 has 2 high-severity issues** in the shell: Coming Soon section and dead user menu items.

4. **CMS-144 has the most findings** -- all three deferred pages overclaim. Media page is worst with its elaborate blurred mockup. The `<ComingSoon>` component itself needs rework.

## Summary by ticket

| Ticket  | Status     | High | Medium | Low | Action needed                                         |
| ------- | ---------- | ---- | ------ | --- | ----------------------------------------------------- |
| CMS-135 | Needs work | 2    | 0      | 2   | Remove Coming Soon section + dead menu items          |
| CMS-136 | Clean      | 0    | 0      | 0   | None                                                  |
| CMS-137 | Clean      | 0    | 0      | 0   | None                                                  |
| CMS-138 | Clean      | 0    | 0      | 0   | None                                                  |
| CMS-144 | Needs work | 5    | 3      | 2   | Rework all 3 placeholder pages + ComingSoon component |
