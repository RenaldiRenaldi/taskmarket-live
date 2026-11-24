#!/usr/bin/env bash
# deploy.sh — one-command deploy for the Taskmarket live visualizer.
# Rebuilds data + page, commits, and pushes (main snapshot + gh-pages site).
# GitHub Pages serves the site from the gh-pages branch.
set -euo pipefail
cd "$(dirname "$0")"
./scripts/refresh-pages.sh
echo "deployed — live at https://renaldirenaldi.github.io/taskmarket-live/"
