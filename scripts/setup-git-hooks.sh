#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

CURRENT_HOOKS_PATH="$(git -C "$ROOT_DIR" config --local --get core.hooksPath || true)"

if [[ "$CURRENT_HOOKS_PATH" == ".githooks" ]]; then
  exit 0
fi

git -C "$ROOT_DIR" config --local core.hooksPath .githooks
echo "Configured Git hooks path to .githooks"
