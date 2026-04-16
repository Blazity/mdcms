# @mdcms/studio

## 0.1.5

### Patch Changes

- e77088f: Add a System/Light/Dark theme picker in the admin header, default the Studio theme to System so it follows the OS preference, and theme the bootstrap loading shell (`Loading Studio`) so it resolves from `localStorage` + `prefers-color-scheme` instead of always rendering light. `StudioShellFrame` gains an optional `shellTheme` prop (defaulted to `"light"`, non-breaking).

## 0.1.4

### Patch Changes

- c800ac8: Visual refresh for Studio runtime bundle loading screen
- 38932fc: Clarify wrapper MDX component editing in Studio and align bundled examples with the current Callout prop contract.
- a1bae03: Preserve the missing-token Studio error state and add follow-up token auth coverage.
- Updated dependencies [d10a004]
  - @mdcms/shared@0.1.4

## 0.1.3

### Patch Changes

- 0143cf5: Group localized Studio content lists by translation group.
- Updated dependencies [0143cf5]
  - @mdcms/shared@0.1.3
