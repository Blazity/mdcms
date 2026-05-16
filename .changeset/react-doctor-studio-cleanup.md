---
"@mdcms/studio": patch
---

Clean up `react-doctor` warnings in `@mdcms/studio`: score 66 → 84.

Internal-only changes; no behaviour changes to the published surface. Highlights:

- Workspace `tsconfig.base.json` bumped to ES2023 to unblock `Array.prototype.toSorted`.
- Mechanical sweeps: `toSorted` over `[...arr].sort()`, `flatMap` over `map().filter()`, ES2023 length-check shape, hoisted `EMPTY_BREADCRUMBS`, SVG `d` decimals truncated to two places, label `htmlFor`/id associations, redundant `role="navigation"` removed, `Promise.all` for independent awaits, `gap-y` over `space-y` on flex children, action-named button labels.
- React 19: `useContext(X)` migrated to `use(X)` across context modules.
- `proposal-card.tsx`: removed prop-mirroring `useState`/`useEffect` pattern; the reject panel now opens via local override `OR rejecting` prop, eliminating the stale first-render.
- `settings-page.tsx`: API-keys table renders dates through a `formatClientDate` helper and a client-mounted `ApiKeyStatusBadge` to avoid SSR/CSR locale + clock hydration mismatches. `api-key-create-dialog.tsx`: `min` date attr is now set after mount.
- Render-in-render extractions: `ContentCardGrid`/`ContentTypeCard`, `RetryButton`, `SchemaKindChip`/`SchemaConstraintFlags`, `ReadyMdxPropsEditor`/`AutoFormFieldControl`, `RouteContent`, `RowActions` (content/[type]), `TrashRowActions`.
- Login page: SSO state collapsed into a single discriminated-union state to remove the cascading two-`setState` effect.
- `studio-component.tsx` and `mdx-component-node-view.tsx`: documented the two intentional `dangerouslySetInnerHTML` sites inline.
- Added `packages/studio/knip.json` describing the two-tier runtime bundling so knip stops false-flagging `runtime-ui/**` as unused.

API rename inside the package: `renderReadyMdxPropsEditor` → `ReadyMdxPropsEditor` (the prior name was not exported from `src/index.ts`, so consumers outside the package are unaffected).
