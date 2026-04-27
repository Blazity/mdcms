# Skills

This directory holds the canonical skill set for this repo. Every supported agent (Claude Code, Codex, Cursor) discovers it via a symlink:

- `.claude/skills` → `../.ai/skills`
- `.agents/skills` → `../.ai/skills`
- `.cursor/skills` → `../.ai/skills`

Skill format is the [Anthropic Agent Skill (`SKILL.md`)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) standard.

## Vendored skills

The skills below are vendored from [obra/superpowers](https://github.com/obra/superpowers) v5.0.7, MIT-licensed (see `LICENSE.superpowers`). Copyright (c) 2025 Jesse Vincent. To bump the version:

```bash
SP_VER=5.x.x
cp -r ~/.claude/plugins/cache/claude-plugins-official/superpowers/$SP_VER/skills/* .ai/skills/
cp ~/.claude/plugins/cache/claude-plugins-official/superpowers/$SP_VER/LICENSE .ai/skills/LICENSE.superpowers
# Update the version above and verify by running a smoke test in a fresh session
```

Vendored skills:

- `brainstorming/`
- `dispatching-parallel-agents/`
- `executing-plans/`
- `finishing-a-development-branch/`
- `receiving-code-review/`
- `requesting-code-review/`
- `subagent-driven-development/`
- `systematic-debugging/`
- `test-driven-development/`
- `using-git-worktrees/`
- `using-superpowers/`
- `verification-before-completion/`
- `writing-plans/`
- `writing-skills/`

## Why a vendored copy

The global `superpowers` plugin is disabled at the project level via `.claude/settings.json` so the vendored copy is the only set of skills active when working in this repo. This makes the agent harness reproducible: clone the repo, you get the same skill set, no "did you install the plugin globally" failure mode.
