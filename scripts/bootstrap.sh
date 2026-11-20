#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
project_tools=$(awk '/^\[tools\]$/{f=1;next} /^\[/{f=0} f{print $1}' mise.toml | tr '\n' ' ')
if [ -n "${project_tools// /}" ] && command -v mise >/dev/null 2>&1; then
  if [ -f mise.lock ]; then mise install --locked $project_tools; else mise install $project_tools; fi
fi
if command -v bun >/dev/null 2>&1; then bun install --frozen-lockfile; else mise exec -- bun install --frozen-lockfile; fi
