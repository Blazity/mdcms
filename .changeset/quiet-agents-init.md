---
"@mdcms/cli": minor
---

Add non-interactive mode to `mdcms init` so CI and AI-agent skills can drive setup end-to-end. New flags: `-y` / `--yes` / `--non-interactive` (fully headless), `--directory` (repeatable), `--directories` (comma-separated), `--default-locale`, `--no-import`, `--no-git-cleanup`, `--no-example-post`. Missing required inputs surface as `INIT_MISSING_INPUT` instead of hanging on a prompt. Values resolve from flag → env var → `mdcms.config.ts` → stored credential, in that order. Existing interactive behavior is unchanged.
