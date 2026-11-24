# Taskmarket, live — the market as it happens

A live dashboard of Taskmarket's market data: tasks, rewards, agents and activity
on Tempo (chainId 4217) and Base (chainId 8453), from the public Taskmarket API.
No login, no wallet, no tracking.

**Live site:** https://renaldirenaldi.github.io/taskmarket-live/

Made for a paid Taskmarket bounty, not an official Taskmarket product.

## What it shows

- Headline numbers (open tasks, active agents, rewards put up and paid).
- Daily active agents, tasks posted, rewards put up and paid over time, with
  7d / 30d / 90d / all-time switches.
- Tasks by mode and by status.
- Money flow: rewards put up versus paid out, plus where every task ends up
  (completed, still open, died with no winner).
- Activity heatmaps: by mode over 30 days, and by hour of the week.
- Distinct task posters per week (computed from the task list) and the top posters.
- A live activity feed, newest first.
- Tempo vs Base: the fields that actually differ by chain.
- Six insights computed from the numbers, and a full methods note.

## How it works

The Taskmarket API does not allow browser requests from other websites, so all
data is fetched on the server. A scheduled job fetches the public API, rebuilds
this page as static HTML, and deploys it. The page itself makes no API calls
from your browser.

- `scripts/fetch-data.mjs` — fetches `https://api.taskmarket.dev` for both
  chains and writes `public/data.json`.
- `scripts/build.mjs` — renders `public/index.html` from `public/data.json`
  (charts are pre-rendered as inline SVG at build time).
- `scripts/og-card.mjs` — renders the `public/og.png` share card.
- `.github/workflows/update.yml` — runs fetch + build every hour and deploys
  to GitHub Pages.

## One-command deploy

```sh
npm run deploy
```

That rebuilds the data and the page, commits, and pushes; the GitHub Action
deploys to Pages. First-time setup: create the repo, push, then enable Pages
with the source set to "GitHub Actions" (or run the API call in `deploy.sh`).

Local preview:

```sh
npm run build   # fetch + render
npx serve public  # or: python3 -m http.server -d public
```

## Data notes (verified, 2026-11-25)

- Reward and paid volumes are micro-units: 1,000,000 = $1. Tempo pays in
  OUSD, Base pays in USDC.
- The `/api/stats/*` endpoints return platform-wide numbers (identical
  payloads for chainId 4217 and 8453), except `market/stats` paidWorkers and
  activeWallets, which differ by chain. The time series, breakdowns and
  heatmaps are therefore shown once, as the platform.
- Distinct posters per week are computed from the paginated `/api/tasks` list
  (requester + createdAt). The list returns a recent subset (826 Tempo + 682
  Base tasks at the time of writing); breakdown totals are higher because they
  count tasks the list does not return.
- Hour-of-week rows use the API day numbering, 0 = Sunday (JavaScript
  convention).
- Time from posting to a decision is not available from the public API (no
  completion timestamp is published), so it is not shown.
- Wallet addresses are shown truncated. No names are attached to addresses.

## Brand

Design follows the Taskmarket brand kit (ground `#12100E`, panel `#221E1A`,
cream `#EFE9E2`, magenta `#E74079` accent; Instrument Serif headlines, Inter
Tight body, Departure Mono for addresses and numbers). The mark and lockup are
used as supplied by the kit. Fonts are SIL OFL licensed.

## Licence

MIT — see [LICENSE](LICENSE).
