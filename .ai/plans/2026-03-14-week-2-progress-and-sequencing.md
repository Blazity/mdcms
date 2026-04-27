# Week 2 Progress and Recommended Completion Sequence

Date: 2026-03-14
Sources:

- Week 2 plan read from the provided screenshot
- Jira status snapshot from `blazity.atlassian.net`
- Dependency and acceptance criteria references from `ROADMAP_TASKS.md` and the owning specs catalog in `docs/specs/README.md`

## Week 2 Scope From The Screenshot

Week 2 is labeled `Core Features` and includes six streams:

| Stream | Label from screenshot   | Jira tasks                                                                     |
| ------ | ----------------------- | ------------------------------------------------------------------------------ |
| D      | Project/Env/i18n (9d)   | CMS-18, CMS-19, CMS-20                                                         |
| F      | Extensibility (12d)     | CMS-9, CMS-10, CMS-33, CMS-34, CMS-35                                          |
| G      | Content CRUD (22d)      | CMS-21, CMS-22, CMS-23, CMS-24, CMS-25, CMS-26, CMS-27, CMS-28, CMS-29, CMS-32 |
| I      | Authz + API Keys (9.5d) | CMS-42, CMS-43, CMS-44                                                         |
| J      | OIDC + SAML (8d)        | CMS-40, CMS-41                                                                 |
| L      | Editor Core (7.5d)      | CMS-51, CMS-52                                                                 |

Total Week 2 tasks: 25

## Jira Snapshot

Snapshot date: 2026-03-14

Overall status:

| Status      | Count |
| ----------- | ----- |
| Done        | 13    |
| To Do       | 12    |
| In Progress | 0     |
| Total       | 25    |

Overall completion: 52%

### Progress By Stream

| Stream               | Total | Done | Remaining | Progress |
| -------------------- | ----: | ---: | --------: | -------: |
| D - Project/Env/i18n |     3 |    3 |         0 |     100% |
| F - Extensibility    |     5 |    2 |         3 |      40% |
| G - Content CRUD     |    10 |    4 |         6 |      40% |
| I - Authz + API Keys |     3 |    3 |         0 |     100% |
| J - OIDC + SAML      |     2 |    0 |         2 |       0% |
| L - Editor Core      |     2 |    1 |         1 |      50% |

## Completed Tasks

| Task   | Summary                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- |
| CMS-9  | Define shared extensibility contracts in `@mdcms/shared` + Studio runtime contracts             |
| CMS-10 | Introduce unified module topology (server/cli) + Studio runtime artifact topology               |
| CMS-18 | Environments API CRUD + default `production` provisioning                                       |
| CMS-19 | Implement project model and project-scoped data boundaries                                      |
| CMS-20 | Implement locale data model and translation-group operations                                    |
| CMS-21 | Implement content CRUD/list endpoints with filters/sort/pagination                              |
| CMS-22 | Implement draft/publish/unpublish semantics                                                     |
| CMS-23 | Implement soft-delete/trash/restore endpoints and conflict errors                               |
| CMS-24 | Implement version history endpoints + restore (`targetStatus=draft/published`)                  |
| CMS-42 | API key lifecycle (create once reveal, hash at rest, revoke, expiry, labels)                    |
| CMS-43 | API key operation scopes and deny-by-default authorization                                      |
| CMS-44 | RBAC engine (Owner/Admin/Editor/Viewer; global + project + folder prefix; most permissive wins) |
| CMS-51 | Integrate TipTap baseline and markdown parsing/serialization pipeline                           |

## Remaining Tasks

| Stream | Task   | Summary                                                                      | Jira status | Formal dependencies |
| ------ | ------ | ---------------------------------------------------------------------------- | ----------- | ------------------- |
| F      | CMS-33 | Implement server module bootstrap + manifest/dependency/collision validation | To Do       | CMS-10, CMS-13      |
| F      | CMS-34 | Implement action registry + action catalog + Studio bootstrap endpoints      | To Do       | CMS-33, CMS-21      |
| F      | CMS-35 | Contract validation suite for extensibility                                  | To Do       | CMS-34, CMS-6       |
| G      | CMS-25 | Enforce published-default reads and draft-only behavior via `draft=true`     | To Do       | CMS-21, CMS-22      |
| G      | CMS-26 | Implement `resolve=` reference expansion scoped to target environment        | To Do       | CMS-21              |
| G      | CMS-27 | Standardize API response envelope + pagination metadata                      | To Do       | CMS-21, CMS-2       |
| G      | CMS-28 | Enforce reference field identity contract (env-local `document_id`)          | To Do       | CMS-20, CMS-26      |
| G      | CMS-29 | Enforce schema-hash mismatch protections on write paths                      | To Do       | CMS-17, CMS-21      |
| G      | CMS-32 | Full integration suite for lifecycle, routing, uniqueness, and restore paths | To Do       | CMS-21..CMS-27      |
| J      | CMS-40 | OIDC provider support with fixture matrix                                    | To Do       | CMS-36              |
| J      | CMS-41 | SAML beta-flag integration path                                              | To Do       | CMS-40              |
| L      | CMS-52 | Implement MDX-aware markdown tokenizer/renderer integration for editor core  | To Do       | CMS-51              |

Cross-phase prerequisite check performed for the remaining tasks:

| External dependency | Status |
| ------------------- | ------ |
| CMS-2               | Done   |
| CMS-6               | Done   |
| CMS-13              | Done   |
| CMS-17              | Done   |
| CMS-36              | Done   |

Conclusion: none of the remaining Week 2 items are currently blocked by the obvious upstream dependencies outside Week 2.

## Recommended Completion Order

### Recommended Single-Thread Sequence

If one team is mainly finishing these serially, this is the cleanest order:

1. CMS-33
2. CMS-34
3. CMS-35
4. CMS-27
5. CMS-25
6. CMS-26
7. CMS-28
8. CMS-29
9. CMS-32
10. CMS-40
11. CMS-41
12. CMS-52

### Why This Order

1. **Finish the extensibility chain first (`CMS-33 -> CMS-34 -> CMS-35`).**
   This is the tightest unfinished dependency chain in Week 2 and it has the highest downstream leverage. `CMS-34` is a platform surface that later Studio and CLI work depends on. Closing this chain early stabilizes module loading, action catalog behavior, and the Studio bootstrap contract before more features stack on top.

2. **Lock the content API contract before adding the remaining behavior (`CMS-27`).**
   `CMS-27` standardizes the envelope and pagination metadata across content APIs. Doing that early reduces rework in tests and client-facing responses while finishing the rest of content core.

3. **Complete the remaining content behavior in dependency order (`CMS-25`, `CMS-26`, `CMS-28`, `CMS-29`).**
   `CMS-25` closes the published-vs-draft read semantics. `CMS-26` must land before `CMS-28`. `CMS-29` is independent once the write path exists and should be completed before the content test gate so mismatch protections are covered in the final behavior set.

4. **Run the integration gate only after the content surface is actually stable (`CMS-32`).**
   Formally, `CMS-32` depends on `CMS-21..CMS-27`. Even so, it is better to schedule it after `CMS-28` and `CMS-29` as well, so the suite reflects the near-final content model and avoids a second round of integration test churn.

5. **Then finish the narrower verticals (`CMS-40 -> CMS-41`, then `CMS-52`).**
   `CMS-40` and `CMS-41` are a self-contained auth chain with no unresolved upstream blockers. `CMS-52` is also isolated because `CMS-51` is already done. These should follow once the broader platform and content contracts are less likely to shift under them.

## Recommended Parallel Execution Plan

If the team can run multiple tracks at once, this is the better delivery plan:

### Track A: Extensibility Foundation

1. CMS-33
2. CMS-34
3. CMS-35

Why:

- Strict dependency chain
- High downstream fan-out into later Studio and CLI work
- Best candidate for concentrated ownership by one engineer/pair

### Track B: Content Core Closure

1. CMS-27
2. CMS-25
3. CMS-26
4. CMS-28
5. CMS-29
6. CMS-32

Why:

- `CMS-27` locks response contracts first
- `CMS-26` is needed before `CMS-28`
- `CMS-32` is the gate and should be last in the track

### Track C: Auth Integrations

1. CMS-40
2. CMS-41

Why:

- Clean two-step dependency chain
- No current cross-track blocker after `CMS-36`
- Can proceed independently while platform/content work continues

### Track D: Editor Completion

1. CMS-52

Why:

- Only depends on `CMS-51`, which is already done
- Narrow surface area
- Safe to run in parallel unless editor contract changes are expected from unresolved platform work

## Suggested Near-Term Milestone

The most useful near-term checkpoint is:

1. `CMS-33`, `CMS-34`, `CMS-35` complete
2. `CMS-27`, `CMS-25`, `CMS-26`, `CMS-28`, `CMS-29` complete
3. `CMS-32` green and gating

That checkpoint would leave Week 2 with:

- Extensibility closed
- Content core closed and regression-gated
- Only the auth integration pair (`CMS-40`, `CMS-41`) and the final editor MDX enhancement (`CMS-52`) still open

## Short Recommendation

If the goal is to reduce future rework, finish the **extensibility chain first**, then close the **remaining content contract and behavior work**, and only after that spend cycles on **OIDC/SAML** and **MDX editor** completion. If the team has parallel capacity, run **OIDC/SAML** and **CMS-52** beside the main platform/content work instead of waiting for them.
