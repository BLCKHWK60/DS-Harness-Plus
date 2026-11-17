/**
 * The live dashboard page (Bench Plus's page, retitled): one card per running monitor, refreshed every
 * second from the state address. It is view only: monitors are started and stopped by bench_monitor.
 * Everything a device sent is put on the page with textContent, never as markup.
 */
import { createHash } from 'node:crypto';

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#fff;--line:#dfe3e8;--text:#1d2329;--muted:#66707c;--accent:#2f7ae5;--warn:#b26a00;--bad:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--panel:#1c1f25;--line:#2b3038;--text:#e6e8ec;--muted:#8f97a4;--accent:#4da3ff;--warn:#ffb454;--bad:#ff6b6b}}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
h1{font-size:17px;margin:0;font-weight:600}
.sub{color:var(--muted);font-size:12px}
main{padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.card h2{font-size:14px;margin:0 0 2px;font-weight:600;word-break:break-word}
.meta{color:var(--muted);font-size:11px;margin-bottom:10px;word-break:break-all}
.vals{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
.val{min-width:84px}
.val b{display:block;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.val span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
canvas{width:100%;height:64px;display:block}
pre{white-space:pre-wrap;word-break:break-word;font-size:11px;color:var(--muted);margin:8px 0 0;max-height:120px;overflow:auto}
.empty{color:var(--muted);padding:24px 0}
.err{color:var(--bad);font-size:11px;margin-top:6px}
.off{color:var(--warn)}
`;

/** The page's script; STATE_URL is put in as a JSON string. Only textContent carries device text. */
const SCRIPT = (stateUrl) => `
"use strict";
const STATE_URL = ${stateUrl};
const root = document.getElementById('root');
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
const fmt = (n) => { if (typeof n !== 'number' || !isFinite(n)) return '—'; const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return n.toFixed(1); };
function line(canvas, points) {
  const ratio = window.devicePixelRatio || 1; const w = canvas.clientWidth * ratio; const h = canvas.clientHeight * ratio;
  canvas.width = w; canvas.height = h; const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
  if (points.length < 2) return;
  const max = Math.max(...points, 1); const min = Math.min(...points, 0); const span = (max - min) || 1;
  c.beginPath();
  points.forEach((p, i) => { const x = (i / (points.length - 1)) * w; const y = h - ((p - min) / span) * (h - 8) - 4; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#4da3ff'; c.lineWidth = 2 * ratio; c.stroke();
}
function message(text, className) { root.replaceChildren(make('div', 'empty' + (className ? ' ' + className : ''), text)); }
function render(state) {
  if (!state || !state.enabled) { message('Bench is switched off in Settings → Bench. Switch it on, then start a monitor with bench_monitor.', 'off'); return; }
  const list = Array.isArray(state.monitors) ? state.monitors : [];
  if (!list.length) { message('No monitors are running. Ask Bench, for example: start a serial monitor on /dev/cu.usbserial-…'); return; }
  const cards = [];
  const charts = [];
  for (const m of list) {
    const card = make('section', 'card');
    card.append(make('h2', '', m.label || m.id || 'monitor'));
    card.append(make('div', 'meta', [m.source, m.target, 'every ' + (Number(m.intervalMs) / 1000) + ' s', m.id].filter(Boolean).join(' · ')));
    const values = m.latest && m.latest.values && typeof m.latest.values === 'object' ? m.latest.values : {};
    const box = make('div', 'vals');
    const keys = Object.keys(values);
    if (!keys.length) box.append(make('div', 'empty', 'waiting…'));
    for (const key of keys) { const v = make('div', 'val'); v.append(make('b', '', fmt(values[key])), make('span', '', key)); box.append(v); }
    card.append(box);
    const canvas = make('canvas');
    card.append(canvas);
    charts.push([canvas, (Array.isArray(m.series) ? m.series : []).map((p) => Number(p && p.v)).filter((v) => isFinite(v))]);
    if (m.lastError) card.append(make('div', 'err', m.lastError));
    if (m.latest && m.latest.text) card.append(make('pre', '', m.latest.text));
    cards.push(card);
  }
  root.replaceChildren(...cards);
  for (const [canvas, points] of charts) line(canvas, points);
}
async function refresh() {
  try {
    const answer = await fetch(STATE_URL, { credentials: 'same-origin', cache: 'no-store' });
    if (!answer.ok) throw new Error(String(answer.status));
    render(await answer.json());
  } catch {
    message('Cannot reach Bench. Is the app open and Bench switched on?', 'err');
  }
}
refresh();
setInterval(refresh, 1000);
`;

/** A value as a JSON string that cannot close the script element it sits in. */
const scriptString = (value) => JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * The dashboard page.
 * @param {string} stateUrl - where the page reads the state (the app's own address, e.g. /dsh-bench/dashboard/state).
 * @returns {string} the HTML.
 */
export function dashboardHtml(stateUrl) {
  const script = SCRIPT(scriptString(stateUrl));
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  // The page's own policy, on top of the one the route sends: only this script runs, and it reads only this app.
  const policy = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<meta http-equiv="Content-Security-Policy" content="${policy}">`
    + `<title>Bench — live devices</title><style>${STYLE}</style></head><body>`
    + '<header><h1>Bench — live devices</h1><span class="sub">running monitors · updates every second · view only (bench_monitor starts and stops them)</span></header>'
    + '<main id="root"><div class="empty">Loading…</div></main>'
    + `<script>${script}</script></body></html>`;
}

/**
 * What the state address answers.
 * @returns {{enabled: boolean, monitors: object[]}} the state.
 */
export function dashboardState(registry, enabled) {
  let on = false;
  try {
    on = Boolean(typeof enabled === 'function' ? enabled() : enabled);
  } catch {
    on = false;
  }
  let monitors = [];
  if (on) {
    try {
      monitors = registry?.state?.() ?? [];
    } catch {
      monitors = [];
    }
  }
  return { enabled: on, monitors };
}
