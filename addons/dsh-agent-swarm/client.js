/**
 * Browser half of Agent swarm: a read-only "Swarm" page in Settings with two cards.
 *
 *  - Runs: the model's recent `run_swarm` calls (newest first). Pick one to see every member's
 *    state (waiting, running, done, cut short, failed, skipped, cancelled), its route, its round
 *    (debate), its tokens and time, and the swarm's spend against its budget. A run started inside
 *    a program (PTC) that had to be shortened says so, and how to get a full run. It refreshes every 2 seconds
 *    while a run is going and every 10 seconds otherwise.
 *  - Swarms: the swarms configured in the plugin entry, with their members and caps.
 *
 * It reads the fenced `GET dsh-agent-swarm/state` route (same origin, login cookie). Runs are kept in
 * the host's memory (the last 20) and are gone after a host restart. The route carries no task text,
 * prompts or member answers: those stay in the conversation where the tool result is shown. The page
 * cannot start, stop or change a swarm.
 *
 * Why a page and not a card in the conversation: a plugin outside the dsh repository cannot add
 * events to a session, and the transcript is built from session events. A plugin outside the dsh repository may not add session events, so this lives in Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-agent-swarm',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;
    // ---- dsh-kit:begin ---- shared small helpers; this block is the same in every add-on page file that uses it.
    // The master copy is docs/shared/dsh-kit.js. Change it there, then run `node scripts/sync-kit.mjs` (it copies the block into
    // every client.js that has the two marker lines, and `bash scripts/check.sh` fails when a copy has drifted).
    // Dependency-free: plain DOM for the question box, React is passed in for the error note.
    const dshKit = (() => {
      const STYLE_ID = 'dsh-kit-style';
      const CSS = `
    .dsh-kit-veil { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; background: color-mix(in srgb, #000 32%, transparent); }
    .dsh-kit-box { width: min(420px, 100%); box-sizing: border-box; padding: 16px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font: 14px/22px system-ui, sans-serif; }
    .dsh-kit-title { margin: 0 0 4px; font-size: 14px; line-height: 22px; font-weight: 500; }
    .dsh-kit-text { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 50vh; overflow: auto; }
    .dsh-kit-field { display: block; width: 100%; box-sizing: border-box; height: 36px; margin-top: 10px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dsh-kit-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-label { display: block; margin-top: 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dsh-kit-label + .dsh-kit-field { margin-top: 2px; }
    .dsh-kit-row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .dsh-kit-btn { height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dsh-kit-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dsh-kit-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-note { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dsh-kit-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-more { margin-left: 6px; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dsh-kit-detail { display: block; margin-top: 4px; font: 11px/16px ui-monospace, Menlo, monospace; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; user-select: text; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Turns what a failed call says ("error 404", "settings/conflict: ...") into a plain sentence; the raw text goes to `details`. */
      const plain = (raw) => {
        let message = '';
        if (typeof raw === 'string') message = raw;
        else if (raw && typeof raw === 'object') {
          const source = raw.rpcError ?? (raw.error && typeof raw.error === 'object' ? raw.error : raw);
          message = String(source.message ?? raw.error ?? '');
          if (source.code && !message.includes(String(source.code))) message = `${source.code}: ${message}`;
        }
        const existing = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : '';
        message = message.trim();
        const text = (sentence) => ({ text: sentence, details: existing || (message && message !== sentence ? message : '') });
        const status = /^(?:error|status|http)?\s*(\d{3})\b/i.exec(message)?.[1] ?? /(?:answered|returned)\s+(\d{3})\b/i.exec(message)?.[1] ?? '';
        if (/settings\/conflict/i.test(message)) return text('This setting was changed somewhere else at the same moment. Please try again.');
        if (/not mounted|namespace not mounted|settings unavailable|is switched off|is not running/i.test(message)) return text('This add-on is not running. Switch it on (or restart the app) and try again.');
        if (/failed to fetch|networkerror|load failed|network request failed|econnrefused/i.test(message)) return text('Could not reach the app. Check that it is still running, then try again.');
        if (status === '401' || status === '403') return text('The app did not allow this. Restart the app and try again.');
        if (status === '404') return text('This part of the add-on is not available. It may be switched off, or the app needs a restart after an update.');
        if (status === '408' || status === '504') return text('The app took too long to answer. Try again in a moment.');
        if (status === '409') return text('This changed somewhere else at the same moment. Please try again.');
        if (/^5\d\d$/.test(status)) return text('The add-on ran into a problem. Try again; if it keeps happening, restart the app.');
        if (/^4\d\d$/.test(status)) return text('The app could not use this request. Try again; if it keeps happening, restart the app.');
        // "code/name: message": show the message, keep the code as a detail.
        const coded = /^([a-z][\w-]*(?:\/[\w.-]+)+):\s*(.+)$/is.exec(message);
        if (coded) return { text: coded[2].trim(), details: existing || message };
        // A readable sentence stays as it is.
        if (/^[A-Z"'(].*\s/s.test(message) || /\s/.test(message)) return { text: message, details: existing };
        if (!message) return { text: 'Something went wrong. Try again.', details: existing };
        return text('Something went wrong. Try again; the Details line says what the app reported.');
      };
      /** An Error whose message is the plain sentence and whose `details` keeps the raw text. */
      const fail = (raw) => {
        const found = plain(raw);
        const error = new Error(found.text);
        error.details = found.details;
        return error;
      };

      /**
       * A small question box in the page's own style (window.prompt does nothing in the desktop app, and the native
       * confirm cannot be styled or checked there). Resolves true/false; with `field` the typed text or null; `notice` shows OK only.
       */
      const ask = (options = {}) => new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(options.field ? null : false); return; }
        ensureStyle();
        const before = document.activeElement;
        const veil = document.createElement('div');
        veil.className = 'dsh-kit-veil';
        const box = document.createElement('div');
        box.className = 'dsh-kit-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        const add = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
        if (options.title) { const title = add('p', 'dsh-kit-title', options.title); box.appendChild(title); box.setAttribute('aria-label', options.title); }
        if (options.text) box.appendChild(add('p', 'dsh-kit-text', options.text));
        let input = null;
        if (options.field) {
          if (options.field.label) box.appendChild(add('label', 'dsh-kit-label', options.field.label));
          input = add('input', 'dsh-kit-field');
          input.type = 'text';
          input.value = options.field.value ?? '';
          if (options.field.placeholder) input.placeholder = options.field.placeholder;
          if (options.field.label) input.setAttribute('aria-label', options.field.label);
          box.appendChild(input);
        }
        const row = add('div', 'dsh-kit-row');
        const done = (value) => { document.removeEventListener('keydown', onKey, true); veil.remove(); try { before?.focus?.(); } catch { /* the old control is gone */ } resolve(value); };
        const cancel = options.notice ? null : add('button', 'dsh-kit-btn', options.cancel ?? 'Cancel');
        const ok = add('button', 'dsh-kit-btn', options.ok ?? 'OK');
        ok.type = 'button';
        ok.setAttribute('data-main', 'true');
        if (options.danger) ok.setAttribute('data-danger', 'true');
        const accept = () => done(input ? input.value : true);
        const reject = () => done(input ? null : false);
        function onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (options.notice) accept(); else reject(); }
          else if (event.key === 'Enter' && input && document.activeElement === input) { event.preventDefault(); event.stopPropagation(); accept(); }
          else if (event.key === 'Tab') {
            const stops = [...box.querySelectorAll('input,button')];
            const at = stops.indexOf(document.activeElement);
            if (stops.length > 0) { event.preventDefault(); stops[(at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus(); }
          }
        }
        if (cancel) { cancel.type = 'button'; cancel.addEventListener('click', reject); row.appendChild(cancel); }
        ok.addEventListener('click', accept);
        row.appendChild(ok);
        box.appendChild(row);
        veil.appendChild(box);
        veil.addEventListener('mousedown', (event) => { if (event.target === veil && !options.notice) reject(); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(veil);
        // A question that can destroy something starts on Cancel, so a stray Enter never confirms it.
        (input ?? (options.danger && cancel ? cancel : ok)).focus();
        if (input) input.select();
      });

      /** The note to draw under a form or at the top of a page: a plain sentence and a "Details" button. */
      const makeNote = (React) => function PlainNote({ error, text, details, kind }) {
        ensureStyle();
        const [open, setOpen] = React.useState(false);
        const found = error !== undefined && error !== null && error !== '' ? plain(error) : { text: text ?? '', details: details ?? '' };
        if (!found.text) return null;
        const bad = kind ? kind === 'error' : error !== undefined && error !== null && error !== '';
        return React.createElement('div', { className: 'dsh-kit-note', 'data-error': String(bad), role: bad ? 'alert' : 'status' },
          found.text,
          found.details ? React.createElement('button', { type: 'button', className: 'dsh-kit-more', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null,
          open && found.details ? React.createElement('span', { className: 'dsh-kit-detail' }, found.details) : null);
      };
      return { plain, fail, ask, makeNote };
    })();
    // ---- dsh-kit:end ----

    const DICT = {
      en: {
        'section.title': 'Swarm',
        'head.hint': 'Named swarms of child agents, started by the model through the run_swarm tool. This page shows the recent runs (who is working, who is done, what it cost) and the swarms you configured. It is read-only; the answers themselves appear in the thread.',
        'refresh': 'Refresh',
        'updated': 'Updated {time}',
        'runs.title': 'Recent runs',
        'runs.empty': 'No runs yet. A run appears here when the model calls {tool}. Runs are kept in memory (the last 20) and are cleared when the app restarts.',
        'swarms.title': 'Configured swarms',
        'swarms.empty': 'No swarm is set up yet, so the tool is switched off. Add swarms to the agent-swarm entry in the app\'s settings file (see the add-on\'s README).',
        'status.running': 'running',
        'status.done': 'done',
        'status.stopped': 'stopped',
        'status.cancelled': 'cancelled',
        'status.shortened': 'shortened (PTC)',
        'state.waiting': 'waiting',
        'state.running': 'running',
        'state.done': 'done',
        'state.failed': 'failed',
        'state.skipped': 'skipped',
        'state.cancelled': 'not answered',
        'state.partial': 'cut short',
        'strategy.fanout': 'fan-out',
        'strategy.pipeline': 'pipeline',
        'strategy.debate': 'debate',
        'run.summary': '{strategy} · {done} of {total} members answered · up to {seen} at once (cap {cap})',
        'run.summary.debate': '{strategy} · round {round} of {rounds} · up to {seen} at once (cap {cap})',
        'run.stopped': 'Stopped early: {reason}.',
        'run.cancelled': 'Cancelled or out of time.',
        'run.ptc.cut': 'Shortened to fit PTC: this run was called inside a program, and a program stops when its time limit runs out ({limit}; 10 minutes at most). It had {budget}, so it stopped early. Every answer it had is kept in the thread. For a full run, use the Standard preset, or ask for a higher program time (timeoutMs).',
        'run.ptc.fit': 'Ran inside a program (PTC). Its time was cut to {budget} to fit the program\'s limit ({limit}), and it finished in time.',
        'budget.tokens': 'Tokens',
        'budget.usd': 'Dollars',
        'budget.none': 'no cap',
        'budget.pricing': 'Dollar figures use your pricing map; models not in it count as 0.',
        'col.member': 'Member',
        'col.route': 'Model',
        'col.state': 'State',
        'col.round': 'Round',
        'col.tokens': 'Tokens',
        'col.time': 'Time',
        'rebound': 'note',
        'tokens': '{n} tokens',
        'usd': '${n}',
        'ago': '{time}',
        'cap': 'up to {n} at once',
        'minutes': '{n} min limit',
        'rounds': '{n} rounds',
        'members': '{n} members',
        'role': 'role {role}',
        'tier': 'tier {tier}',
        'route.parent': "the parent's model",
        'down': 'When a model is down: {policy}.',
        'failed': 'Could not read the swarm state. Check that the Agent swarm add-on is switched on on the Plugins page, then click Refresh.',
        'loading': 'Loading swarm…',
        'gone': 'This run is no longer kept.',
      },
    };

    const CSS = `
.dsh-sw-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-sw-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-sw-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-sw-spacer { flex: 1; }
.dsh-sw-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-sw-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-sw-btn[disabled] { opacity: .5; cursor: default; }
.dsh-sw-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-sw-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-sw-card > h3 { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-sw-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sw-list { display: flex; flex-direction: column; }
.dsh-sw-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); cursor: pointer; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); border-radius: 8px; }
.dsh-sw-row:first-child { border-top: 0; }
.dsh-sw-row:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-sw-row[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.dsh-sw-row:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dsh-sw-row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sw-row .d { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-sw-chip { padding: 0 8px; border: 0.5px solid currentColor; border-radius: 12px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dsh-sw-chip[data-k="running"] { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary)); }
.dsh-sw-chip[data-k="done"] { color: var(--dsw-alias-state-success-primary); }
.dsh-sw-chip[data-k="failed"], .dsh-sw-chip[data-k="stopped"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sw-chip[data-k="running"]::before { content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 5px; border-radius: 50%; background: currentColor; vertical-align: 1px; animation: dsh-sw-pulse 1.2s ease-in-out infinite; }
@keyframes dsh-sw-pulse { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .dsh-sw-chip[data-k="running"]::before { animation: none; } }
.dsh-sw-meters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.dsh-sw-meter { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dsh-sw-meter b { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-bartrack { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); overflow: hidden; }
.dsh-sw-barfill { height: 100%; background: var(--dsw-alias-brand-primary); }
.dsh-sw-barfill[data-over="true"] { background: var(--dsw-alias-state-error-primary); }
.dsh-sw-tablewrap { overflow-x: auto; }
.dsh-sw-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dsh-sw-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 4px 14px 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.dsh-sw-table td { padding: 8px 14px 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); vertical-align: top; }
.dsh-sw-table tr:last-child td { border-bottom: 0; }
.dsh-sw-table td.num, .dsh-sw-table th.num { text-align: right; }
.dsh-sw-table .sub { display: block; margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sw-swarm { border-top: 0.5px solid var(--dsw-alias-border-l1); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.dsh-sw-swarm:first-of-type { border-top: 0; padding-top: 0; }
.dsh-sw-swarm header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-sw-swarm header b { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-facts { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-members { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); }
.dsh-sw-members li { display: flex; flex-wrap: wrap; gap: 2px 8px; }
.dsh-sw-members .m { font-weight: 600; }
.dsh-sw-members .w { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
`;

    const POLL_SLOW = 10000;
    const POLL_FAST = 2000;

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw dshKit.fail(String(response.status));
      return response.json();
    };
    const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.split('{' + key + '}').join(String(value)), text);
    const nf = (n) => Number(n).toLocaleString('en-US');
    const money = (n) => (n >= 1 ? n.toFixed(2) : n.toFixed(4));
    const span = (ms) => {
      if (!(ms >= 0)) return '';
      const s = Math.round(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
    };
    const chipKind = (state) => (state === 'failed' || state === 'stopped' ? 'failed' : state === 'running' ? 'running' : state === 'done' ? 'done' : 'plain');
    /** A time span in whole minutes, or seconds below 2 minutes, for the PTC note. */
    const roughly = (ms) => {
      const s = Math.max(0, Math.round(Number(ms) / 1000));
      if (s < 120) return s + ' s';
      return Math.round(s / 60) + ' min';
    };

    function Meter({ label, used, cap, text, none }) {
      const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
      return h(
        'div',
        { className: 'dsh-sw-meter' },
        h('span', null, label),
        h('b', null, text),
        cap > 0
          ? h('div', { className: 'dsh-sw-bartrack', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': cap, 'aria-valuenow': Math.min(used, cap), 'aria-label': label }, h('div', { className: 'dsh-sw-barfill', 'data-over': String(used >= cap), style: { width: ratio * 100 + '%' } }))
          : h('span', null, none),
      );
    }

    function RunDetail({ t, run, now, pricing }) {
      const answered = run.members.filter((m) => m.state === 'done').length;
      const counted = run.members.filter((m) => m.state !== 'skipped').length;
      return h(
        React.Fragment,
        null,
        h(
          'p',
          { className: 'dsh-sw-note', role: 'status' },
          // A debate member answers once per round, so a count of members that answered would mislead mid-run.
          run.strategy === 'debate'
            ? fill(t('run.summary.debate'), { strategy: t('strategy.debate'), round: run.round, rounds: run.rounds, seen: run.maxObservedActive, cap: run.maxActive })
            : fill(t('run.summary'), { strategy: t('strategy.' + run.strategy), done: answered, total: counted, seen: run.maxObservedActive, cap: run.maxActive }),
        ),
        run.stopped ? h('p', { className: 'dsh-sw-note', 'data-bad': 'true' }, fill(t('run.stopped'), { reason: run.stopped })) : run.status === 'cancelled' ? h('p', { className: 'dsh-sw-note' }, t('run.cancelled')) : null,
        // Inside a program (PTC): why the run had less time, and what to do for a full run.
        run.ptc && run.ptc.shortened && run.status !== 'running'
          ? h('p', { className: 'dsh-sw-note', 'data-ptc': run.ptc.cut ? 'cut' : 'fit' }, fill(t(run.ptc.cut ? 'run.ptc.cut' : 'run.ptc.fit'), { limit: roughly(run.ptc.limitMs), budget: roughly(run.ptc.budgetMs) }))
          : null,
        h(
          'div',
          { className: 'dsh-sw-meters' },
          h(Meter, {
            label: t('budget.tokens'),
            used: run.tokens,
            cap: run.budget.tokens,
            text: run.budget.tokens > 0 ? nf(run.tokens) + ' / ' + nf(run.budget.tokens) : nf(run.tokens),
            none: t('budget.none'),
          }),
          h(Meter, {
            label: t('budget.usd'),
            used: run.usd,
            cap: run.budget.usd,
            text: run.budget.usd > 0 ? '$' + money(run.usd) + ' / $' + money(run.budget.usd) : '$' + money(run.usd),
            none: t('budget.none'),
          }),
        ),
        !pricing && run.budget.usd > 0 ? h('p', { className: 'dsh-sw-note' }, t('budget.pricing')) : null,
        h(
          'div',
          { className: 'dsh-sw-tablewrap' },
          h(
            'table',
            { className: 'dsh-sw-table' },
            h('thead', null, h('tr', null, h('th', null, t('col.member')), h('th', null, t('col.route')), h('th', null, t('col.state')), run.strategy === 'debate' ? h('th', { className: 'num' }, t('col.round')) : null, h('th', { className: 'num' }, t('col.tokens')), h('th', { className: 'num' }, t('col.time')))),
            h(
              'tbody',
              null,
              run.members.map((m) =>
                h(
                  'tr',
                  { key: m.id },
                  h('td', null, m.id, m.role ? h('span', { className: 'sub' }, m.role) : null),
                  h('td', null, m.route ?? '—', m.note ? h('span', { className: 'sub' }, m.note) : null),
                  h('td', null, h('span', { className: 'dsh-sw-chip', 'data-k': chipKind(m.state) }, t('state.' + m.state)), m.error ? h('span', { className: 'sub' }, m.error) : null),
                  run.strategy === 'debate' ? h('td', { className: 'num' }, m.round || '—') : null,
                  h('td', { className: 'num' }, m.state === 'skipped' ? '—' : nf(m.tokens)),
                  h('td', { className: 'num' }, m.startedAt ? span((m.endedAt ?? now) - m.startedAt) : '—'),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function Swarms({ t, data }) {
      if (data.swarms.length === 0) return h('p', { className: 'dsh-sw-note' }, t('swarms.empty'));
      return h(
        React.Fragment,
        null,
        data.swarms.map((swarm) =>
          h(
            'div',
            { key: swarm.name, className: 'dsh-sw-swarm' },
            h('header', null, h('b', null, swarm.name), h('span', { className: 'dsh-sw-chip' }, t('strategy.' + swarm.strategy))),
            swarm.description ? h('p', { className: 'dsh-sw-note' }, swarm.description) : null,
            h(
              'div',
              { className: 'dsh-sw-facts' },
              h('span', null, fill(t('members'), { n: swarm.members.length })),
              h('span', null, fill(t('cap'), { n: swarm.maxActive })),
              h('span', null, fill(t('minutes'), { n: swarm.maxMinutes })),
              swarm.strategy === 'debate' ? h('span', null, fill(t('rounds'), { n: swarm.rounds })) : null,
              swarm.budget.tokens > 0 ? h('span', null, fill(t('tokens'), { n: nf(swarm.budget.tokens) })) : null,
              swarm.budget.usd > 0 ? h('span', null, '$' + money(swarm.budget.usd)) : null,
            ),
            h(
              'ul',
              { className: 'dsh-sw-members' },
              swarm.members.map((m) =>
                h(
                  'li',
                  { key: m.id },
                  h('span', { className: 'm' }, m.id),
                  h('span', { className: 'w' }, [m.route ?? (m.role ? fill(t('role'), { role: m.role }) : t('route.parent')), m.tier ? fill(t('tier'), { tier: m.tier }) : '', m.instructions].filter(Boolean).join(' · ')),
                ),
              ),
            ),
          ),
        ),
        h('p', { className: 'dsh-sw-note' }, fill(t('down'), { policy: data.onRouteDown })),
      );
    }

    function SwarmPage({ appCtx }) {
      const t = appCtx.locale.bind('agentSwarm');
      const [state, setState] = useState({ status: 'loading', data: null, at: 0 });
      const [selected, setSelected] = useState('');

      const load = useCallback(async () => {
        try {
          const data = await get('dsh-agent-swarm/state');
          setState({ status: 'ready', data, at: Date.now() });
          setSelected((prev) => (prev && data.runs.some((run) => run.id === prev) ? prev : data.runs[0]?.id ?? ''));
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
        }
      }, []);

      const anyRunning = !!state.data && state.data.runs.some((run) => run.status === 'running');

      useEffect(() => {
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, anyRunning ? POLL_FAST : POLL_SLOW);
        return () => clearInterval(timer);
      }, [load, anyRunning]);

      let body;
      if (state.status === 'loading') body = h('p', { className: 'dsh-sw-note' }, t('loading'));
      else if (state.status === 'error') body = h('p', { className: 'dsh-sw-note', 'data-bad': 'true' }, t('failed'));
      else {
        const data = state.data;
        const run = data.runs.find((item) => item.id === selected);
        body = h(
          React.Fragment,
          null,
          h(
            'section',
            { className: 'dsh-sw-card' },
            h('h3', null, t('runs.title')),
            data.runs.length === 0
              ? h('p', { className: 'dsh-sw-note' }, fill(t('runs.empty'), { tool: data.toolName }))
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'dsh-sw-list' },
                    data.runs.map((item) =>
                      h(
                        'button',
                        { key: item.id, type: 'button', className: 'dsh-sw-row', 'aria-pressed': item.id === selected, onClick: () => setSelected(item.id) },
                        h('span', { className: 't' }, item.swarm),
                        h('span', { className: 'dsh-sw-chip', 'data-k': chipKind(item.status) }, t('status.' + item.status)),
                        h('span', { className: 'd' }, fill(t('tokens'), { n: nf(item.tokens) })),
                        h('span', { className: 'd' }, new Date(item.startedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })),
                      ),
                    ),
                  ),
                  run ? h(RunDetail, { t, run, now: data.at, pricing: data.pricing }) : h('p', { className: 'dsh-sw-note' }, t('gone')),
                ),
          ),
          h('section', { className: 'dsh-sw-card' }, h('h3', null, t('swarms.title')), h(Swarms, { t, data })),
        );
      }

      return h(
        'div',
        { className: 'dsh-sw-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-sw-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-sw-bar' },
          h('span', { className: 'dsh-sw-spacer' }),
          state.at ? h('span', { className: 'dsh-sw-stamp' }, fill(t('updated'), { time: new Date(state.at).toLocaleTimeString('en-GB') })) : null,
          h('button', { type: 'button', className: 'dsh-sw-btn', onClick: () => void load() }, t('refresh')),
        ),
        body,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('agentSwarm', DICT));
        const t = ctx.locale.bind('agentSwarm');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'agent-swarm', order: 410, label: () => t('section.title') },
              (props) => h(SwarmPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
