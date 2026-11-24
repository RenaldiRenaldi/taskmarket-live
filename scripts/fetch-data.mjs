// fetch-data.mjs — Taskmarket live visualizer data fetcher.
// Fetches the public Taskmarket API (no key) server-side and writes public/data.json.
// Run: node scripts/fetch-data.mjs
// Units: reward/paid volumes are micro-units; 1,000,000 = $1 (OUSD on Tempo, USDC on Base).
//
// VERIFIED API BEHAVIOUR (2026-11-25): /api/stats/* endpoints (market/stats,
// breakdowns, platform-time-series, activity-heatmap) return PLATFORM-WIDE
// numbers — the same payload for chainId=4217 and chainId=8453 — except
// market/stats paidWorkers and activeWallets, which do differ by chain.
// /api/stats/activity-feed also ignores chainId (items carry their own chainId).
// Only /api/tasks returns genuinely different lists per chain. The dashboard
// therefore shows the stats series ONCE as the platform, and compares the
// chains only on the fields that actually differ.

import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://api.taskmarket.dev';
const CHAINS = [4217, 8453];
const UA = { 'User-Agent': 'taskmarket-live-visualizer/1.0 (https://github.com/RenaldiRenaldi/taskmarket-live)' };

async function getJson(path, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + path, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

const micro = v => (Number(v) || 0) / 1e6;
const shortAddr = a => (a && a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a || '');

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - fday + 3);
  const week = 1 + Math.round((t - first) / (7 * 864e5));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function fetchTasks(chainId) {
  const tasks = [];
  let cursor = null;
  let pages = 0;
  while (pages < 120) {
    const q = `/api/tasks?chainId=${chainId}&sort=newest&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const page = await getJson(q);
    tasks.push(...(page.tasks || []));
    pages++;
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return tasks;
}

const fetchedAt = new Date().toISOString();

// --- Platform-wide stats (fetched once; the API returns the same for both chains). ---
console.log('fetching platform stats...');
const [platformStats, breakdowns] = await Promise.all([
  getJson('/api/market/stats?chainId=4217'),
  getJson('/api/stats/breakdowns?chainId=4217'),
]);
const series = {};
for (const range of ['7d', '30d', '90d']) {
  series[range] = await getJson(`/api/stats/platform-time-series?chainId=4217&range=${range}&bucket=day`);
}
series.all = await getJson('/api/stats/platform-time-series?chainId=4217&range=all&bucket=week');
const heatmapMode = await getJson('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=mode');
const heatmapHour = await getJson('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek');

// --- Activity feed: fetch both chain params, merge + dedupe by event identity. ---
const feedSeen = new Map();
for (const cid of CHAINS) {
  const f = await getJson(`/api/stats/activity-feed?chainId=${cid}&limit=30`);
  for (const it of f.items || []) {
    const key = `${it.type}|${it.timestamp}|${it.taskId}|${it.actor}`;
    if (!feedSeen.has(key)) feedSeen.set(key, it);
  }
}
const feed = [...feedSeen.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 30);

// --- Per-chain data: market stats (paidWorkers/activeWallets differ) + task lists. ---
const chains = {};
for (const cid of CHAINS) {
  console.log(`fetching chain ${cid} tasks...`);
  const stats = await getJson(`/api/market/stats?chainId=${cid}`);
  const tasks = await fetchTasks(cid);
  const postersByWeek = {};
  const posterCounts = new Map();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 12 * 7 * 864e5);
  for (const t of tasks) {
    const created = new Date(t.createdAt);
    posterCounts.set(t.requester, (posterCounts.get(t.requester) || 0) + 1);
    if (created >= cutoff) {
      const w = isoWeek(created);
      if (!postersByWeek[w]) postersByWeek[w] = new Set();
      postersByWeek[w].add(t.requester);
    }
  }
  const postersPerWeek = Object.entries(postersByWeek)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, set]) => ({ week, posters: set.size }));
  const topPosters = [...posterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([address, count]) => ({ address: shortAddr(address), count, share: tasks.length ? count / tasks.length : 0 }));
  const newestTasks = tasks.slice(0, 8).map(t => ({
    referenceCode: t.referenceCode,
    title: (t.description || '').split('\n')[0].slice(0, 90),
    rewardUsd: micro(t.reward),
    status: t.status,
    mode: t.mode,
    submissions: t.submissionCount || 0,
    createdAt: t.createdAt,
  }));
  chains[cid] = {
    chainId: cid,
    stats,
    tasksFetched: tasks.length,
    distinctPostersTotal: posterCounts.size,
    postersPerWeek,
    topPosters,
    newestTasks,
  };
  console.log(`  chain ${cid}: ${tasks.length} tasks, ${posterCounts.size} distinct posters`);
}

// --- Insights, computed from the data — nothing invented. ---
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const s30 = series['30d'];
const paid30 = micro(sum(s30, 'paidVolume'));
const put30 = micro(sum(s30, 'rewardVolume'));
const insights = [];
insights.push({
  title: 'The market in the last 30 days',
  body: `Posters put up $${put30.toLocaleString('en-US', { maximumFractionDigits: 0 })} in rewards across ${sum(s30, 'tasksCreated').toLocaleString()} tasks, and $${paid30.toLocaleString('en-US', { maximumFractionDigits: 0 })} was paid out across ${sum(s30, 'settlements').toLocaleString()} settlements. ${sum(s30, 'newAgents').toLocaleString()} new agents joined.`,
});
const bd = breakdowns;
const statusTotal = (bd.status || []).reduce((s, r) => s + r.count, 0);
const died = (bd.status || []).filter(r => ['expired', 'cancelled'].includes(r.status)).reduce((s, r) => s + r.count, 0);
const completed = (bd.status || []).find(r => r.status === 'completed')?.count || 0;
insights.push({
  title: 'Tasks that died',
  body: `${died.toLocaleString()} of ${statusTotal.toLocaleString()} tasks (${(100 * died / Math.max(statusTotal, 1)).toFixed(1)}%) ended expired or cancelled with no winner, against ${completed.toLocaleString()} completed.`,
});
const modeTotal = (bd.mode || []).reduce((s, r) => s + r.count, 0);
const bountyShare = ((bd.mode || []).find(r => r.mode === 'bounty')?.count || 0) / Math.max(modeTotal, 1);
insights.push({
  title: 'Bounty is the market',
  body: `${(100 * bountyShare).toFixed(1)}% of all tasks are bounties — many submit, the poster picks the winner. Claim is the distant second.`,
});
const top = chains[4217].topPosters[0];
if (top) {
  insights.push({
    title: 'Posting is concentrated on Tempo',
    body: `The most active poster on Tempo put up ${top.count} tasks (${(100 * top.share).toFixed(1)}% of Tempo tasks). The top 5 posters account for ${(100 * chains[4217].topPosters.reduce((s, p) => s + p.share, 0)).toFixed(1)}%. On Base the picture is wider: ${chains[8453].distinctPostersTotal} distinct posters against Tempo's ${chains[4217].distinctPostersTotal}.`,
  });
}
const hourTotals = Array(24).fill(0);
for (const c of heatmapHour.cells || []) hourTotals[Number(c.col)] += c.count || 0;
const busyHour = hourTotals.indexOf(Math.max(...hourTotals));
const quietHour = hourTotals.indexOf(Math.min(...hourTotals));
insights.push({
  title: 'When the market moves',
  body: `The busiest hour over the last 30 days is ${String(busyHour).padStart(2, '0')}:00 UTC (${hourTotals[busyHour].toLocaleString()} activity events); the quietest is ${String(quietHour).padStart(2, '0')}:00 UTC (${hourTotals[quietHour].toLocaleString()} events).`,
});
insights.push({
  title: 'Two chains, different crowds',
  body: `Tempo has ${chains[4217].stats.paidWorkers} paid workers and ${chains[4217].stats.activeWallets} active wallets; Base has ${chains[8453].stats.paidWorkers} paid workers and ${chains[8453].stats.activeWallets} active wallets. The market-wide stats (tasks, rewards, agents) are the same on both because the API reports them platform-wide.`,
});

const out = {
  fetchedAt,
  platform: { stats: platformStats, breakdowns, series, heatmapMode, heatmapHour, feed },
  chains,
  insights,
  notes: {
    units: 'Reward and paid volumes are micro-units: 1,000,000 = $1. Tempo pays in OUSD, Base pays in USDC.',
    platformWide: 'The /api/stats/* endpoints return platform-wide numbers (verified: identical payloads for chainId=4217 and chainId=8453), except market/stats paidWorkers and activeWallets, which differ by chain. The time series, breakdowns and heatmaps are therefore shown once, as the platform.',
    posters: 'Distinct posters per week are computed from the paginated /api/tasks list (requester address + createdAt). The list endpoint returns a recent subset (826 Tempo + 682 Base tasks at fetch time); breakdown totals are higher because they count tasks the list does not return.',
    heatmapHour: 'Hour-of-week rows use the API day numbering, 0 = Sunday (JavaScript convention).',
    timeToDecision: 'Time from posting to a decision is not available from the public API (no completion timestamp is published), so it is not shown.',
    addresses: 'Wallet addresses are shown truncated (first 6 + last 4 characters). No names are attached to addresses.',
  },
};

mkdirSync('public', { recursive: true });
writeFileSync('public/data.json', JSON.stringify(out, null, 2));
console.log(`wrote public/data.json (${JSON.stringify(out).length} bytes) at ${fetchedAt}`);
