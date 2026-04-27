# Week 3 Scope and Recommended Sequencing

Date: 2026-03-20

Sources:

- Week 3 screenshot provided in chat
- `ROADMAP_TASKS.md`
- `docs/specs/README.md`

## Jira Status Note

Live Jira status lookup was not reliable in this session. This report covers:

- the visible Week 3 scope from the screenshot
- roadmap task mapping
- dependency-based sequencing

It does **not** claim current `Done` / `To Do` counts for Week 3.

## Week 3 Screenshot Transcription

Visible text in the Week 3 column:

- `Week 3`
- `Platform (83d)`
- `N - Studio Content (24d)`  
  `CMS-56-67,75,76`
- `O - MDX Components (21d)`  
  `CMS-68-74`
- `P - Studio Runtime (7.5d)`  
  `CMS-60,61,62`
- `T - SDK (3.5d)`  
  `CMS-85`
- `Q - CLI Commands (27d)`  
  `CMS-77-87`

## Important Screenshot Caveats

The Week 3 screenshot is not a clean list of unique tasks.

1. `P - Studio Runtime` duplicates `CMS-60,61,62`, which already sit inside the broader `CMS-56-67` range under `N - Studio Content`.
2. `T - SDK` duplicates `CMS-85`, which already sits inside the broader `CMS-77-87` range under `Q - CLI Commands`.

Because of that, the screenshot appears to mix:

- broad streams (`N`, `O`, `Q`)
- narrower callout substreams (`P`, `T`)

For planning purposes, the unique Week 3 tasks visible in the screenshot are:

- `CMS-56` through `CMS-87`

## Roadmap Override To The Screenshot

Two tasks that appear inside the screenshot ranges are explicitly re-homed by the roadmap and no longer gate MVP:

- `CMS-58`
- `CMS-86`

That matters because the screenshot still visually includes them:

- `CMS-58` falls inside `CMS-56-67`
- `CMS-86` falls inside `CMS-77-87`

For strict MVP sequencing, treat those two as **deferred** unless you intentionally pull them back in.

## Week 3 Unique Task Set

### Studio / Runtime / Content

- `CMS-56` Implement publish flow + version history panel + version diff view
- `CMS-57` Implement schema mismatch banner and write-blocking read-only mode
- `CMS-58` Collaboration idempotency + round-trip fidelity suite per schema type
- `CMS-59` Implement read-only schema browsing view in Studio for non-developer users
- `CMS-60` Build `@mdcms/studio` runtime loader + composition surfaces
- `CMS-61` Execute C1/C2 Studio runtime spikes + decision gate
- `CMS-62` Implement selected Studio runtime mode + hardening regression suite
- `CMS-63` Studio locale switcher + variant creation flow
- `CMS-64` Translation status indicators in content list
- `CMS-65` Studio environment management basics
- `CMS-66` Implement Studio project switcher and project-aware access control
- `CMS-67` Implement environment-specific field badges in editor UI
- `CMS-75` Implement Studio user management UI
- `CMS-76` Implement Studio API key management UI

### MDX Components

- `CMS-68` Implement component registration sync contract
- `CMS-69` Implement TypeScript prop extraction and unsupported prop filtering
- `CMS-70` Implement prop type to form control mapping
- `CMS-71` Implement widget hints override system
- `CMS-72` Implement custom props editor contract and rendering lifecycle
- `CMS-73` Implement children/nested rich text support inside component nodes
- `CMS-74` Implement `MdxComponent` node view insert/edit/serialize/live preview

### CLI / SDK

- `CMS-77` Build CLI framework with profile/auth plumbing
- `CMS-78` Implement `cms init` full wizard flow
- `CMS-79` Implement `cms login` and `cms logout` credential lifecycle
- `CMS-80` Implement `cms pull`
- `CMS-81` Implement strict manifest contract per scope
- `CMS-82` Implement `cms push`
- `CMS-83` Implement `cms push --validate`
- `CMS-84` Implement `cms status`
- `CMS-85` Implement SDK client (`createClient`, `get/list/resolve`) + runtime schema cache invalidation
- `CMS-86` Implement `cms push` Redis invalidation
- `CMS-87` Implement `cms schema sync` CLI command

## Key Dependency Chains Inside Week 3

### Studio Runtime

- `CMS-60 -> CMS-61 -> CMS-62`

### Locale / Translation UI

- `CMS-63 -> CMS-64`

### MDX Components

- `CMS-68 -> CMS-69 -> CMS-70 -> CMS-71 -> CMS-72 -> CMS-73 -> CMS-74`

`CMS-74` also depends on `CMS-52`, which is outside Week 3.

### CLI Core

- `CMS-77 -> CMS-78`
- `CMS-77 -> CMS-79`
- `CMS-77 -> CMS-80 -> CMS-81 -> CMS-82 -> CMS-83`
- `CMS-81 -> CMS-84`
- `CMS-77 -> CMS-87`

### SDK

- `CMS-85` is independent of the `CMS-77` CLI chain. It depends on `CMS-17` and `CMS-21`, both outside Week 3.

### Deferred

- `CMS-58` depends on `CMS-52` and `CMS-54`
- `CMS-86` depends on `CMS-82` and `CMS-53`

Both are roadmap-deferred from MVP.

## External Prerequisite Note

Many Week 3 tasks depend on non-Week-3 tasks such as:

- `CMS-48`, `CMS-49`, `CMS-50`
- `CMS-52`
- `CMS-17`, `CMS-18`, `CMS-19`, `CMS-20`, `CMS-24`, `CMS-42`, `CMS-44`

This report does not claim those external prerequisites are complete. It only lays out the Week 3 structure and the internal dependency sequence.

## Recommended Sequencing

Week 3 is too broad for one useful single-file linear order. The practical approach is to run it in dependency-led tracks.

### Recommended Priority Wave 1: Highest Fan-Out Foundations

Start with the items that unlock the largest amount of Week 3 work:

1. `CMS-60` Studio runtime loader + composition surfaces
2. `CMS-68` component registration sync contract
3. `CMS-77` CLI framework with profile/auth plumbing
4. `CMS-85` SDK client

Why:

- `CMS-60` unlocks the entire runtime chain (`61`, `62`)
- `CMS-68` starts the full MDX component chain (`69` through `74`)
- `CMS-77` is the CLI root for `78`, `79`, `80`, and `87`
- `CMS-85` is independent and valuable enough to run immediately in parallel

### Recommended Priority Wave 2: Close The Long Chains

Once Wave 1 foundations are active, continue each chain in order:

#### Runtime chain

1. `CMS-61`
2. `CMS-62`

#### MDX component chain

1. `CMS-69`
2. `CMS-70`
3. `CMS-71`
4. `CMS-72`
5. `CMS-73`
6. `CMS-74`

#### CLI chain

1. `CMS-79`
2. `CMS-80`
3. `CMS-87`
4. `CMS-78`
5. `CMS-81`
6. `CMS-82`
7. `CMS-83`
8. `CMS-84`

Why this CLI ordering:

- `CMS-79`, `CMS-80`, and `CMS-87` sit directly off `CMS-77`
- `CMS-81` cannot start until `CMS-80`
- `CMS-82` cannot start until `CMS-81`
- `CMS-83` and `CMS-84` are tail tasks off the push/manifest path
- `CMS-78` depends only on `CMS-77`, so it can move earlier or later based on resourcing

### Recommended Priority Wave 3: Studio Content and Admin Flows

Run the Studio content/admin tasks as a parallel product track once their external prerequisites are ready:

- `CMS-65` Studio environment management basics
- `CMS-66` Studio project switcher
- `CMS-75` Studio user management UI
- `CMS-76` Studio API key management UI
- `CMS-63` locale switcher
- `CMS-64` translation status indicators
- `CMS-67` environment-specific field badges
- `CMS-57` schema mismatch banner / read-only mode
- `CMS-59` read-only schema browsing
- `CMS-56` publish flow + version history + diff

Suggested order inside this track:

1. `CMS-65`
2. `CMS-66`
3. `CMS-75`
4. `CMS-76`
5. `CMS-63`
6. `CMS-64`
7. `CMS-67`
8. `CMS-57`
9. `CMS-59`
10. `CMS-56`

Why:

- `65`, `66`, `75`, and `76` provide foundational project/environment/admin surfaces
- `63 -> 64` is the only strict internal chain here
- `56`, `57`, and `59` are more specialized experience layers and can safely come after the core Studio navigation/admin surfaces

### Deferred From MVP

Do not put these on the MVP-critical Week 3 path unless you intentionally want deferred work:

- `CMS-58`
- `CMS-86`

## Short Recommendation

If the goal is to reduce rework and unblock the most Week 3 work quickly:

1. Start `CMS-60`, `CMS-68`, `CMS-77`, and `CMS-85`
2. Then finish the runtime, MDX, and CLI chains in dependency order
3. Run the Studio content/admin tasks in parallel as prerequisite readiness allows
4. Keep `CMS-58` and `CMS-86` out of the MVP path because the roadmap explicitly moved them to deferred work
