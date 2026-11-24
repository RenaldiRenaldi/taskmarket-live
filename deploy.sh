#!/usr/bin/env bash
# deploy.sh — one-command deploy for the Taskmarket live visualizer.
# Rebuilds data + page, commits, and pushes. The GitHub Action deploys to Pages.
set -euo pipefail
cd "$(dirname "$0")"
node scripts/fetch-data.mjs
node scripts/build.mjs
git add -A
if git diff --cached --quiet; then
  echo "nothing changed — already up to date"
  exit 0
fi
git commit -m "data refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push
echo "pushed — the GitHub Action deploys to Pages"
