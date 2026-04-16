# @mdcms/cli

## 0.2.0

### Minor Changes

- 7e904c9: Add non-interactive mode to `mdcms init` so CI and AI-agent skills can drive setup end-to-end. New flags: `-y` / `--yes` / `--non-interactive` (fully headless), `--directory` (repeatable), `--directories` (comma-separated), `--default-locale`, `--no-import`, `--no-git-cleanup`, `--no-example-post`. Missing required inputs surface as `INIT_MISSING_INPUT` instead of hanging on a prompt. Values resolve from flag → env var → `mdcms.config.ts` → stored credential, in that order. Existing interactive behavior is unchanged.

### Patch Changes

- dfa8664: handle missing schema state in push with sync flow instead of hard error

## 0.1.5

### Patch Changes

- b295660: Add `--version` / `-V` flag to print the installed CLI version and exit without requiring config, auth, or server connectivity
- d10a004: Make default CLI logs user-friendly and move internal runtime diagnostics behind --verbose mode.
- Updated dependencies [d10a004]
  - @mdcms/shared@0.1.4

## 0.1.4

### Patch Changes

- ba9cce3: Fix localized init imports when locale is declared in frontmatter.

## 0.1.3

### Patch Changes

- 3ad2124: Preserve translation groups when mdcms init imports localized files
