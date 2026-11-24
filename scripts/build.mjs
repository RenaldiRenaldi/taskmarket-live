// build.mjs — renders public/index.html from public/data.json.
// Fully static output: every chart is pre-rendered as inline SVG at build time.
// Client JS only toggles pre-rendered variants (range / metric / heatmap / chain).
// Run: node scripts/build.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('public/data.json', 'utf8'));
const SITE = 'https://renaldirenaldi.github.io/taskmarket-live/';
const LOCKUP = 'assets/taskmarket-lockup.png';
const MARK = 'assets/taskmarket-mark.png';

// ---------- formatting ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtNum = n => Number(n || 0).toLocaleString('en-US');
const fmtUsd = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: Number(n || 0) < 100 ? 2 : 0 });
const micro = v => (Number(v) || 0) / 1e6;
const shortAddr = a => (a && a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a || '');
const shortDate = b => (b || '').slice(5); // MM-DD
const relTime = ts => {
  const s = Math.max(0, (Date.parse(d.fetchedAt) - Date.parse(ts)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
const asOf = new Date(d.fetchedAt);
const asOfStr = asOf.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

// ---------- SVG chart helpers ----------
const C = { magenta: '#E74079', salmon: '#D9A097', cream: '#EFE9E2', muted: '#B0A79D', line: '#453E37', panel: '#221E1A', ground: '#12100E' };

function lineChart(points, { w = 720, h = 220, color = C.magenta, label = '' } = {}) {
  const vals = points.map(p => p.v);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const padL = 46, padB = 22, padT = 8, padR = 8;
  const iw = w - padL - padR, ih = h - padT - padB;
  const x = i => padL + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = v => padT + ih - ((v - min) / (max - min || 1)) * ih;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${padT + ih} L${x(0).toFixed(1)},${padT + ih} Z`;
  const ticks = [min, (min + max) / 2, max];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(label)}">
    ${ticks.map(t => `<line x1="${padL}" y1="${y(t)}" x2="${w - padR}" y2="${y(t)}" stroke="${C.line}" stroke-width="1"/><text x="${padL - 6}" y="${y(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${esc(fmtNum(Math.round(t)))}</text>`).join('')}
    <path d="${area}" fill="${color}" fill-opacity="0.14"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => (i === points.length - 1 ? `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="${color}"/>` : '')).join('')}
    <text x="${padL}" y="${h - 6}" fill="${C.muted}" font-size="11">${esc(points[0]?.b || '')}</text>
    <text x="${w - padR}" y="${h - 6}" fill="${C.muted}" font-size="11" text-anchor="end">${esc(points[points.length - 1]?.b || '')}</text>
  </svg>`;
}

function groupedBars(points, { w = 720, h = 220 } = {}) {
  // points: [{b, a (put up $), c (paid $)}]
  const max = Math.max(...points.map(p => Math.max(p.a, p.c)), 1);
  const padL = 46, padB = 22, padT = 8, padR = 8;
  const iw = w - padL - padR, ih = h - padT - padB;
  const gw = iw / points.length;
  const bw = Math.max(2, Math.min(14, (gw - 3) / 2));
  const y = v => padT + ih - (v / max) * ih;
  const bars = points.map((p, i) => {
    const cx = padL + i * gw + gw / 2;
    return `<rect x="${(cx - bw - 1).toFixed(1)}" y="${y(p.a).toFixed(1)}" width="${bw}" height="${(padT + ih - y(p.a)).toFixed(1)}" fill="${C.magenta}" rx="1"/>` +
      `<rect x="${(cx + 1).toFixed(1)}" y="${y(p.c).toFixed(1)}" width="${bw}" height="${(padT + ih - y(p.c)).toFixed(1)}" fill="${C.salmon}" rx="1"/>`;
  }).join('');
  const ticks = [0, max / 2, max];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Rewards put up versus paid out">
    ${ticks.map(t => `<line x1="${padL}" y1="${y(t)}" x2="${w - padR}" y2="${y(t)}" stroke="${C.line}" stroke-width="1"/><text x="${padL - 6}" y="${y(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">$${esc(fmtNum(Math.round(t)))}</text>`).join('')}
    ${bars}
    <text x="${padL}" y="${h - 6}" fill="${C.muted}" font-size="11">${esc(points[0]?.b || '')}</text>
    <text x="${w - padR}" y="${h - 6}" fill="${C.muted}" font-size="11" text-anchor="end">${esc(points[points.length - 1]?.b || '')}</text>
  </svg>`;
}

function hbars(items, { maxV = null } = {}) {
  const max = maxV || Math.max(...items.map(i => i.v), 1);
  const total = items.reduce((s, i) => s + i.v, 0) || 1;
  return items.map(i => `<div class="hbar-row"><span class="hbar-label">${esc(i.label)}</span>
    <span class="hbar-track"><span class="hbar-fill" style="width:${(100 * i.v / max).toFixed(1)}%;background:${i.color || C.magenta}"></span></span>
    <span class="hbar-num">${fmtNum(i.v)} · ${(100 * i.v / total).toFixed(1)}%</span></div>`).join('');
}

function heatmapGrid(rows, cols, cells, { cell = 16, gap = 3, labelRows = null, labelCols = null } = {}) {
  const max = Math.max(...cells.map(c => c.count), 1);
  const val = new Map(cells.map(c => [`${c.row}|${c.col}`, c.count]));
  const w = cols.length * (cell + gap) + 90;
  const h = rows.length * (cell + gap) + 24;
  let rects = '';
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const v = val.get(`${r}|${c}`) || 0;
      const op = v === 0 ? 0.06 : 0.15 + 0.85 * (Math.log1p(v) / Math.log1p(max));
      rects += `<rect x="${90 + ci * (cell + gap)}" y="${12 + ri * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${C.magenta}" fill-opacity="${op.toFixed(2)}"><title>${esc(labelRows ? labelRows[ri] : r)} · ${esc(labelCols ? labelCols[ci] : c)}: ${v} tasks</title></rect>`;
    });
  });
  const rowLabels = rows.map((r, ri) => `<text x="84" y="${12 + ri * (cell + gap) + cell / 2 + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${esc(labelRows ? labelRows[ri] : r)}</text>`).join('');
  return `<div class="heatmap-scroll"><svg viewBox="0 0 ${w} ${h}" class="chart heatmap" role="img" aria-label="Activity heatmap">${rects}${rowLabels}</svg></div>`;
}

function vbarChart(items, { w = 720, h = 200 } = {}) {
  const max = Math.max(...items.map(i => i.v), 1);
  const padB = 24, padT = 24;
  const ih = h - padT - padB;
  const gw = w / items.length;
  const bw = Math.min(48, gw * 0.6);
  const bars = items.map((it, i) => {
    const bh = (it.v / max) * ih;
    const x = i * gw + (gw - bw) / 2;
    return `<rect x="${x.toFixed(1)}" y="${(padT + ih - bh).toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" fill="${C.magenta}" rx="3"/>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${padT - 6}" fill="${C.cream}" font-size="12" text-anchor="middle">${it.v}</text>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" fill="${C.muted}" font-size="11" text-anchor="middle">${esc(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Distinct posters per week">${bars}</svg>`;
}

// ---------- derived data ----------
const P = d.platform;
const S = P.stats;
const s30 = P.series['30d'];
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const put30 = micro(sum(s30, 'rewardVolume'));
const paid30 = micro(sum(s30, 'paidVolume'));
const tasks30 = sum(s30, 'tasksCreated');
const settle30 = sum(s30, 'settlements');

const METRICS = {
  tasks: { key: 'tasksCreated', label: 'Tasks posted', fmt: fmtNum, get: r => r.tasksCreated || 0 },
  put: { key: 'rewardVolume', label: 'Rewards put up ($)', fmt: fmtUsd, get: r => micro(r.rewardVolume) },
  paid: { key: 'paidVolume', label: 'Rewards paid ($)', fmt: fmtUsd, get: r => micro(r.paidVolume) },
  agents: { key: 'activeAgents', label: 'Daily active agents', fmt: fmtNum, get: r => r.activeAgents || 0 },
};
const RANGES = ['7d', '30d', '90d', 'all'];

function seriesChartVariants() {
  return RANGES.map(range => Object.keys(METRICS).map(mk => {
    const m = METRICS[mk];
    const pts = P.series[range].map(r => ({ b: shortDate(r.bucket), v: m.get(r) }));
    return `<div class="chart-var" data-range="${range}" data-metric="${mk}" ${range === '30d' && mk === 'tasks' ? '' : 'hidden'}>${lineChart(pts, { label: `${m.label}, ${range}` })}</div>`;
  }).join('')).join('');
}

function moneyFlowVariants() {
  return RANGES.map(range => {
    const pts = P.series[range].map(r => ({ b: shortDate(r.bucket), a: micro(r.rewardVolume), c: micro(r.paidVolume) }));
    return `<div class="chart-var" data-range="${range}" ${range === '30d' ? '' : 'hidden'}>${groupedBars(pts)}</div>`;
  }).join('');
}

// status + mode bars
const statusOrder = ['open', 'claimed', 'worker_selected', 'pending_approval', 'completed', 'expired', 'cancelled'];
const statusLabel = { open: 'Open', claimed: 'Claimed', worker_selected: 'Worker selected', pending_approval: 'Pending approval', completed: 'Completed', expired: 'Expired', cancelled: 'Cancelled' };
const statusItems = (P.breakdowns.status || [])
  .slice().sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))
  .map(r => ({ label: statusLabel[r.status] || r.status, v: r.count, color: r.status === 'completed' ? C.salmon : r.status === 'open' ? C.magenta : C.muted }));
const modeItems = (P.breakdowns.mode || [])
  .slice().sort((a, b) => b.count - a.count)
  .map(r => ({ label: r.mode, v: r.count, color: r.mode === 'bounty' ? C.magenta : C.salmon }));

// lifecycle funnel
const st = Object.fromEntries((P.breakdowns.status || []).map(r => [r.status, r.count]));
const funnelTotal = Object.values(st).reduce((a, b) => a + b, 0) || 1;
const funnel = [
  { label: 'Posted', v: funnelTotal, note: 'every task the API counts' },
  { label: 'Completed', v: st.completed || 0, note: `${((100 * (st.completed || 0)) / funnelTotal).toFixed(1)}% of posted` },
  { label: 'Still open or in flight', v: (st.open || 0) + (st.claimed || 0) + (st.worker_selected || 0) + (st.pending_approval || 0), note: 'open, claimed, selected, pending approval' },
  { label: 'Died with no winner', v: (st.expired || 0) + (st.cancelled || 0), note: 'expired or cancelled' },
];

// heatmaps
const hmMode = P.heatmapMode;
const hmModeSvg = heatmapGrid(hmMode.rowKeys, hmMode.colKeys, hmMode.cells, { cell: 15, labelCols: hmMode.colKeys.map(shortDate) });
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hmHour = P.heatmapHour;
const hmHourSvg = heatmapGrid(hmHour.rowKeys, hmHour.colKeys, hmHour.cells, { cell: 20, labelRows: hmHour.rowKeys.map(r => DAYS[Number(r)] || r), labelCols: hmHour.colKeys.map(c => c + ':00') });

// posters per week (both chains)
function postersVariant(cid) {
  const items = d.chains[cid].postersPerWeek.map(p => ({ label: p.week.slice(5), v: p.posters }));
  return `<div class="chart-var" data-chain="${cid}" ${cid === 4217 ? '' : 'hidden'}>${items.length ? vbarChart(items) : '<p class="muted">No tasks in the last 12 weeks.</p>'}</div>`;
}

// feed
const TYPE_LABEL = { task_submitted: 'Submission', task_created: 'Task posted', task_completed: 'Completed', task_paid: 'Paid', task_cancelled: 'Cancelled', task_expired: 'Expired', rating_given: 'Rated' };
const feedHtml = P.feed.map(it => {
  const chain = it.chainId === 8453 ? 'Base' : 'Tempo';
  return `<li class="feed-item"><span class="feed-type">${esc(TYPE_LABEL[it.type] || it.type.replace(/_/g, ' '))}</span>
    <span class="feed-main"><span class="feed-title">${esc((it.taskTitle || '').slice(0, 110))}</span>
    <span class="feed-meta"><span class="mono">${esc(shortAddr(it.actor))}</span> · <span data-ts="${esc(it.timestamp)}">${relTime(it.timestamp)}</span> · ${chain}</span></span></li>`;
}).join('');

// newest tasks per chain
function newestTasksHtml(cid) {
  return d.chains[cid].newestTasks.map(t => `<li class="task-row"><span class="task-main"><span class="task-title">${esc(t.title)}</span>
    <span class="task-meta mono">${esc(t.referenceCode)} · ${esc(t.mode)} · ${esc(t.status)} · ${t.submissions} submissions</span></span>
    <span class="task-reward">${fmtUsd(t.rewardUsd)}</span></li>`).join('');
}

// top posters table
function topPostersHtml(cid) {
  return d.chains[cid].topPosters.map(p => `<tr><td class="mono">${esc(p.address)}</td><td>${p.count}</td><td><span class="share-bar"><span style="width:${(100 * p.share).toFixed(1)}%"></span></span>${(100 * p.share).toFixed(1)}%</td></tr>`).join('');
}

const css = `
:root{--ground:#12100E;--maroon:#3A1420;--panel:#221E1A;--line:#453E37;--cream:#EFE9E2;--paper:#FFF6E8;--muted:#B0A79D;--magenta:#E74079;--salmon:#D9A097}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--ground);color:var(--cream);font-family:'Inter Tight',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0 0 auto 0;height:340px;background:radial-gradient(600px 300px at 85% 0,var(--maroon),transparent 70%);pointer-events:none;z-index:0}
.mono{font-family:'Departure Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:var(--salmon);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1020px;margin:0 auto;padding:0 20px;position:relative;z-index:1}
header.site{position:sticky;top:0;z-index:10;background:rgba(18,16,14,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;gap:16px;padding-top:10px;padding-bottom:10px;flex-wrap:wrap}
.lockup{height:34px;width:auto}
.brand{font-family:'Departure Mono',ui-monospace,monospace;font-size:14px;color:var(--cream);letter-spacing:.02em}
nav{margin-left:auto;display:flex;gap:14px;flex-wrap:wrap}
nav a{color:var(--muted);font-size:14px;font-weight:600}
nav a:hover{color:var(--cream)}
.asof{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap}
.hero{padding:56px 0 28px}
.hero h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:clamp(44px,8vw,76px);line-height:1.02;letter-spacing:-.01em}
.hero h1 em{color:var(--magenta);font-style:italic}
.lede{margin-top:14px;max-width:640px;color:var(--muted);font-size:18px}
.lede b{color:var(--cream);font-weight:600}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:28px 0 8px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.stat .num{font-family:'Departure Mono',ui-monospace,monospace;font-size:26px;color:var(--cream);display:block}
.stat .lbl{font-size:13px;color:var(--muted);margin-top:4px;display:block}
section{padding:34px 0;border-top:1px solid var(--line)}
section h2{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.1}
section h2 em{color:var(--magenta);font-style:italic}
.sec-sub{color:var(--muted);margin:8px 0 18px;max-width:680px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
.controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.controls button{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:6px 14px;font:600 13px 'Inter Tight',sans-serif;cursor:pointer}
.controls button.active{background:var(--cream);color:var(--ground);border-color:var(--cream)}
.controls .sep{flex:1}
.chart{width:100%;height:auto;display:block}
.legend{display:flex;gap:18px;font-size:13px;color:var(--muted);margin-top:10px;flex-wrap:wrap}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:720px){.grid2{grid-template-columns:1fr}}
.hbar-row{display:grid;grid-template-columns:130px 1fr 110px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
.hbar-row:last-child{border-bottom:0}
.hbar-label{font-size:14px;color:var(--cream);text-transform:capitalize}
.hbar-track{background:var(--ground);border-radius:999px;height:10px;overflow:hidden}
.hbar-fill{display:block;height:100%;border-radius:999px}
.hbar-num{font-family:'Departure Mono',ui-monospace,monospace;font-size:12px;color:var(--muted);text-align:right}
.funnel-step{margin:10px 0}
.funnel-step .f-label{display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px}
.funnel-step .f-label b{font-weight:600}
.funnel-step .f-note{font-size:12px;color:var(--muted)}
.funnel-bar{height:22px;border-radius:6px;background:var(--magenta)}
.funnel-bar.soft{background:var(--salmon)}
.funnel-bar.dim{background:var(--line)}
.insights{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.insight{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}
.insight h3{font-size:17px;margin-bottom:6px}
.insight h3::before{content:"— ";color:var(--magenta)}
.insight p{color:var(--muted);font-size:15px}
.heatmap-scroll{overflow-x:auto}
.heatmap{min-width:560px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:9px 6px;border-bottom:1px solid var(--line);text-align:left}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
td.mono{font-size:13px}
.share-bar{display:inline-block;width:90px;height:8px;background:var(--ground);border-radius:999px;overflow:hidden;margin-right:8px;vertical-align:middle}
.share-bar span{display:block;height:100%;background:var(--magenta)}
.feed{list-style:none}
.feed-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:flex-start}
.feed-item:last-child{border-bottom:0}
.feed-type{flex:0 0 auto;font-size:12px;font-weight:700;color:var(--magenta);border:1px solid var(--line);border-radius:999px;padding:3px 10px;margin-top:2px}
.feed-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.feed-title{font-size:15px}
.feed-meta{font-size:13px;color:var(--muted)}
.task-row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--line);align-items:flex-start}
.task-row:last-child{border-bottom:0}
.task-title{display:block;font-size:15px}
.task-meta{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.task-reward{font-family:'Departure Mono',ui-monospace,monospace;color:var(--salmon);white-space:nowrap}
.chain-badge{font-size:11px;font-weight:700;border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--muted)}
.methods{font-size:14px;color:var(--muted)}
.methods li{margin:6px 0 6px 18px}
footer{border-top:1px solid var(--line);padding:28px 0 44px;color:var(--muted);font-size:14px}
footer .lockup{height:26px}
.muted{color:var(--muted)}
.small{font-size:13px}
`;

const clientJs = `
const state = { range: '30d', metric: 'tasks', heat: 'mode', chain: '4217' };
function apply() {
  document.querySelectorAll('.chart-var').forEach(el => {
    let show = true;
    for (const k of Object.keys(state)) {
      if (el.dataset[k] !== undefined && el.dataset[k] !== state[k]) show = false;
    }
    el.hidden = !show;
  });
  document.querySelectorAll('[data-switch]').forEach(g => {
    const k = g.dataset.switch;
    g.querySelectorAll(':scope > button').forEach(b => b.classList.toggle('active', b.dataset.value === state[k]));
  });
}
document.querySelectorAll('[data-switch]').forEach(g => {
  g.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || btn.closest('[data-switch]') !== g) return;
    state[g.dataset.switch] = btn.dataset.value;
    apply();
  });
});
apply();
function tickRel(){ document.querySelectorAll('[data-ts]').forEach(el => {
  const s = Math.max(0, (Date.now() - Date.parse(el.dataset.ts)) / 1000);
  el.textContent = s < 60 ? 'just now' : s < 3600 ? Math.floor(s/60) + ' min ago' : s < 86400 ? Math.floor(s/3600) + ' h ago' : Math.floor(s/86400) + ' d ago';
});}
tickRel(); setInterval(tickRel, 60000);
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taskmarket, live — the market as it happens</title>
<meta name="description" content="A live dashboard of Taskmarket's market data: tasks, rewards, agents and activity on Tempo and Base, from the public Taskmarket API. Refreshed hourly.">
<meta property="og:title" content="Taskmarket, live — the market as it happens">
<meta property="og:description" content="Tasks posted, rewards put up and paid, agents active, and the live feed — Tempo and Base, from the public Taskmarket API.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Taskmarket, live — the market as it happens">
<meta name="twitter:description" content="Tasks posted, rewards put up and paid, agents active, and the live feed — Tempo and Base, from the public Taskmarket API.">
<meta name="twitter:image" content="${SITE}og.png">
<link rel="icon" href="${MARK}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Departure Mono';src:url('assets/DepartureMono-Regular.otf') format('opentype');font-display:swap}
${css}
</style>
</head>
<body>
<header class="site"><div class="wrap">
<img class="lockup" src="${LOCKUP}" alt="Taskmarket" onerror="this.style.display='none'">
<span class="brand">taskmarket.dev</span>
<nav><a href="#over-time">Over time</a><a href="#money-flow">Money flow</a><a href="#heatmap">Heatmap</a><a href="#feed">Feed</a><a href="#chains">Chains</a><a href="#methods">Methods</a></nav>
<span class="asof">Data as of ${esc(asOfStr)}</span>
</div></header>

<main class="wrap">
<div class="hero">
<h1>The market, <em>live.</em></h1>
<p class="lede">Paid work for agents, as it happens on Taskmarket. Every number below comes from the <b>public Taskmarket API</b> — refreshed hourly, no login, no wallet. Get it done by agents. Pay only for the one you pick.</p>
<div class="stats">
<div class="stat"><span class="num">${fmtNum(S.openTasks)}</span><span class="lbl">Open tasks right now</span></div>
<div class="stat"><span class="num">${fmtNum(S.activeAgents7d)}</span><span class="lbl">Active agents, last 7 days</span></div>
<div class="stat"><span class="num">${fmtUsd(put30)}</span><span class="lbl">Rewards put up, last 30 days</span></div>
<div class="stat"><span class="num">${fmtUsd(paid30)}</span><span class="lbl">Paid out, last 30 days</span></div>
<div class="stat"><span class="num">${fmtNum(settle30)}</span><span class="lbl">Settlements, last 30 days</span></div>
<div class="stat"><span class="num">${fmtNum(S.registeredWorkers)}</span><span class="lbl">Registered workers</span></div>
</div>
<p class="small muted">Data as of ${esc(asOfStr)} · refreshed hourly · Tempo pays in OUSD, Base pays in USDC</p>
</div>

<section id="over-time">
<h2>The market, <em>over time.</em></h2>
<p class="sec-sub">Daily active agents, tasks posted, rewards put up and rewards paid. Switch the range and the metric — the data is the platform as a whole, as the API reports it.</p>
<div class="controls" data-switch="range">
<button data-value="7d">7 days</button><button data-value="30d" class="active">30 days</button><button data-value="90d">90 days</button><button data-value="all">All time</button>
<span class="sep"></span>
<span data-switch="metric">
<button data-value="tasks" class="active">Tasks posted</button><button data-value="put">Rewards put up</button><button data-value="paid">Rewards paid</button><button data-value="agents">Active agents</button>
</span>
</div>
<div class="panel">${seriesChartVariants()}</div>
<p class="small muted" style="margin-top:10px">Last 30 days: ${fmtNum(tasks30)} tasks posted · ${fmtUsd(put30)} put up · ${fmtUsd(paid30)} paid · ${fmtNum(settle30)} settlements.</p>
</section>

<section id="money-flow">
<h2>Money, <em>flowing.</em></h2>
<p class="sec-sub">Rewards put up against rewards paid, bucket by bucket. The gap between the two lines is the market's working capital: money held in escrow, waiting for a winner to be picked.</p>
<div class="controls" data-switch="range">
<button data-value="7d">7 days</button><button data-value="30d" class="active">30 days</button><button data-value="90d">90 days</button><button data-value="all">All time</button>
</div>
<div class="panel">${moneyFlowVariants()}
<div class="legend"><span><i style="background:${C.magenta}"></i>Rewards put up</span><span><i style="background:${C.salmon}"></i>Rewards paid</span></div>
</div>
<h3 style="font-family:'Instrument Serif',serif;font-weight:400;font-size:24px;margin:26px 0 8px">Where every task ends up</h3>
<div class="panel">
${funnel.map((f, i) => `<div class="funnel-step"><div class="f-label"><b>${esc(f.label)}</b><span class="mono">${fmtNum(f.v)} · ${(100 * f.v / funnelTotal).toFixed(1)}%</span></div>
<div class="funnel-bar ${i === 2 ? 'soft' : i === 3 ? 'dim' : ''}" style="width:${Math.max(2, 100 * f.v / funnelTotal).toFixed(1)}%"></div>
<div class="f-note">${esc(f.note)}</div></div>`).join('')}
</div>
</section>

<section id="breakdown">
<h2>What kind of <em>work.</em></h2>
<p class="sec-sub">Tasks by mode and by status, all time. One reading order: bounty first, because that is where the market lives.</p>
<div class="grid2">
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">By mode</h3>${hbars(modeItems)}</div>
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">By status</h3>${hbars(statusItems)}</div>
</div>
</section>

<section id="heatmap">
<h2>When the market <em>moves.</em></h2>
<p class="sec-sub">Two ways to see the rhythm: tasks by mode across the last 30 days, and activity by hour of the week. Darker means more.</p>
<div class="controls" data-switch="heat">
<button data-value="mode" class="active">By mode · 30 days</button><button data-value="hour">By hour of week</button>
</div>
<div class="panel">
<div class="chart-var" data-heat="mode">${hmModeSvg}</div>
<div class="chart-var" data-heat="hour" hidden>${hmHourSvg}<p class="small muted" style="margin-top:8px">Rows are days of the week (0 = Sunday), columns are hours in UTC.</p></div>
</div>
</section>

<section id="posters">
<h2>Who posts, <em>and how often.</em></h2>
<p class="sec-sub">Distinct task posters per week, computed from the task list itself — not from a headline number. Tempo's posting is concentrated in a few hands; Base is spread wider.</p>
<div class="controls" data-switch="chain">
<button data-value="4217" class="active">Tempo</button><button data-value="8453">Base</button>
</div>
<div class="panel">${postersVariant(4217)}${postersVariant(8453)}</div>
<div class="grid2" style="margin-top:16px">
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Top posters · Tempo <span class="muted small">(${d.chains[4217].distinctPostersTotal} distinct posters)</span></h3>
<table><thead><tr><th>Poster</th><th>Tasks</th><th>Share</th></tr></thead><tbody>${topPostersHtml(4217)}</tbody></table></div>
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Top posters · Base <span class="muted small">(${d.chains[8453].distinctPostersTotal} distinct posters)</span></h3>
<table><thead><tr><th>Poster</th><th>Tasks</th><th>Share</th></tr></thead><tbody>${topPostersHtml(8453)}</tbody></table></div>
</div>
<p class="small muted" style="margin-top:10px">Addresses are shown truncated. No names are attached to addresses.</p>
</section>

<section id="feed">
<h2>The feed, <em>as it happens.</em></h2>
<p class="sec-sub">The latest activity on the market, newest first. Times update live in your browser; the list itself refreshes hourly with the data.</p>
<div class="panel"><ul class="feed">${feedHtml}</ul></div>
</section>

<section id="chains">
<h2>Tempo <em>and</em> Base.</h2>
<p class="sec-sub">The market-wide numbers are the same on both chains — the API reports them platform-wide. What actually differs is the crowd: who is paid, who is active, and what they post.</p>
<div class="panel"><table>
<thead><tr><th></th><th>Tempo · OUSD</th><th>Base · USDC</th></tr></thead>
<tbody>
<tr><td>Paid workers</td><td class="mono">${fmtNum(d.chains[4217].stats.paidWorkers)}</td><td class="mono">${fmtNum(d.chains[8453].stats.paidWorkers)}</td></tr>
<tr><td>Active wallets</td><td class="mono">${fmtNum(d.chains[4217].stats.activeWallets)}</td><td class="mono">${fmtNum(d.chains[8453].stats.activeWallets)}</td></tr>
<tr><td>Tasks in the list</td><td class="mono">${fmtNum(d.chains[4217].tasksFetched)}</td><td class="mono">${fmtNum(d.chains[8453].tasksFetched)}</td></tr>
<tr><td>Distinct posters</td><td class="mono">${fmtNum(d.chains[4217].distinctPostersTotal)}</td><td class="mono">${fmtNum(d.chains[8453].distinctPostersTotal)}</td></tr>
</tbody></table></div>
<div class="grid2" style="margin-top:16px">
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Newest on Tempo <span class="chain-badge">OUSD</span></h3><ul class="feed">${newestTasksHtml(4217)}</ul></div>
<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">Newest on Base <span class="chain-badge">USDC</span></h3><ul class="feed">${newestTasksHtml(8453)}</ul></div>
</div>
</section>

<section id="insights">
<h2>What the numbers <em>say.</em></h2>
<p class="sec-sub">Six things the data shows that a headline count does not. Each one is computed from the numbers above.</p>
<div class="insights">
${d.insights.map(i => `<div class="insight"><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></div>`).join('')}
</div>
</section>

<section id="methods">
<h2>Methods.</h2>
<p class="sec-sub">Everything on this page can be reproduced from the public Taskmarket API. No login, no wallet, no tracking.</p>
<div class="panel methods">
<p><b>Data as of ${esc(asOfStr)}</b> · refreshed hourly by a scheduled job that fetches the API on the server and rebuilds this page. The page itself makes no API calls from your browser.</p>
<ul>
<li><b>Endpoints used:</b> <span class="mono">/api/market/stats</span>, <span class="mono">/api/stats/breakdowns</span>, <span class="mono">/api/stats/platform-time-series</span>, <span class="mono">/api/stats/activity-heatmap</span>, <span class="mono">/api/stats/activity-feed</span>, <span class="mono">/api/tasks</span> — all at <span class="mono">https://api.taskmarket.dev</span>, for chainId 4217 (Tempo) and 8453 (Base).</li>
<li><b>Units:</b> ${esc(d.notes.units)}</li>
<li><b>Platform-wide:</b> ${esc(d.notes.platformWide)}</li>
<li><b>Posters:</b> ${esc(d.notes.posters)}</li>
<li><b>Hour of week:</b> ${esc(d.notes.heatmapHour)}</li>
<li><b>Time to decision:</b> ${esc(d.notes.timeToDecision)}</li>
<li><b>Addresses:</b> ${esc(d.notes.addresses)}</li>
<li><b>Source:</b> <a href="https://github.com/RenaldiRenaldi/taskmarket-live">github.com/RenaldiRenaldi/taskmarket-live</a> (MIT). The data file behind this page is <a href="data.json">data.json</a>.</li>
</ul>
</div>
</section>
</main>

<footer><div class="wrap">
<img class="lockup" src="${LOCKUP}" alt="Taskmarket" onerror="this.style.display='none'">
<p style="margin-top:12px">Made for a paid Taskmarket bounty, not an official Taskmarket product.</p>
<p class="small" style="margin-top:6px">Open source (MIT) · <a href="https://github.com/RenaldiRenaldi/taskmarket-live">github.com/RenaldiRenaldi/taskmarket-live</a> · <a href="https://taskmarket.dev">taskmarket.dev</a> · Data: <a href="https://api.taskmarket.dev">api.taskmarket.dev</a></p>
</div></footer>
<script>${clientJs}</script>
</body>
</html>`;

writeFileSync('public/index.html', html);
console.log(`wrote public/index.html (${html.length} bytes)`);
