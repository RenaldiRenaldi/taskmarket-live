#!/usr/bin/env bash
# refresh-pages.sh — hourly refresh for the Taskmarket live visualizer.
# Fetches the API, rebuilds the page, commits the snapshot to main, and pushes
# the built site to the gh-pages branch (GitHub Pages serves from gh-pages).
# MUST run from a shell with fresh proxy credentials (a live exec shell, or a
# hook-woken agent). A systemd timer cannot do this: the VM's egress proxy
# credentials rotate per shell session and die within hours, so a timer's
# fetch fails. See ~/workspace/AGENTS.md ("PROXY CREDENTIALS ROTATE").
set -euo pipefail
REPO=/home/hatch/workspace/earn/forge/taskmarket-live
cd "$REPO"

node scripts/fetch-data.mjs
node scripts/build.mjs

# 1. Snapshot data + page on main.
git add public/data.json public/index.html
if ! git diff --cached --quiet; then
  git -c user.name="RenaldiRenaldi" -c user.email="renaldi25oktober@gmail.com" commit -qm "data refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin main
fi

# 2. Deploy the built site to gh-pages.
if [ ! -d .gh-pages ]; then
  git fetch origin gh-pages
  git worktree add -b gh-pages .gh-pages origin/gh-pages
fi
cd .gh-pages
git pull --ff-only origin gh-pages || true
rsync -a --delete --exclude .git ../public/ ./
git add -A
if git diff --cached --quiet; then
  echo "gh-pages already current"
  exit 0
fi
git -c user.name="RenaldiRenaldi" -c user.email="renaldi25oktober@gmail.com" commit -qm "data refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin gh-pages
echo "gh-pages updated"
