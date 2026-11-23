/**
 * Browser half of Usage ledger: a read-only "Usage" card in Settings.
 * Reads the fenced `GET dsh-usage-ledger/summary` route of the host half (same origin, login
 * cookie). Shows requests and tokens only; the ledger stores no prompt text and this card
 * cannot change or reset anything (use /usage reset confirm for that).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-usage-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;
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
        'section.title': 'Usage',
        'head.title': 'Usage',
        'head.hint': 'Model requests and tokens counted by this app, per day and model. Only numbers are stored: no prompts, no answers. A request is one model call, so a turn with tools counts several.',
        'period.7': '7 days',
        'period.30': '30 days',
        'period.90': '90 days',
        'period.365': 'Year',
        'refresh': 'Refresh',
        'stat.requests': 'Requests',
        'stat.input': 'Input tokens',
        'stat.output': 'Output tokens',
        'stat.cache': 'Cache read',
        'stat.reasoning': 'Reasoning',
        'stat.free': 'Free-model requests',
        'daily.title': 'Requests per day',
        'models.title': 'By model',
        'col.model': 'Model',
        'col.requests': 'Requests',
        'col.input': 'Input',
        'col.output': 'Output',
        'col.cache': 'Cache read',
        'free': 'free',
        'empty': 'No requests recorded in this period yet.',
        'failed': 'Could not read the usage counts. Is the Usage counter add-on switched on?',
        'loading': 'Loading usage…',
        'updated': 'Updated {time}',
      },
    };

    const CSS = `
.dsh-ul-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-ul-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-ul-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-ul-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-ul-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-ul-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ul-btn[disabled] { opacity: .5; cursor: default; }
.dsh-ul-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-ul-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-ul-spacer { flex: 1; }
.dsh-ul-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dsh-ul-stat { padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); }
.dsh-ul-stat b { display: block; font-size: 18px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dsh-ul-stat span { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-ul-card { display: block; }
.dsh-ul-card h3 { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ul-card h3 { margin: 0 0 10px; }
.dsh-ul-chart { display: flex; align-items: flex-end; gap: 2px; height: 84px; }
.dsh-ul-col { flex: 1; min-width: 2px; height: 100%; display: flex; align-items: flex-end; }
.dsh-ul-col i { display: block; width: 100%; min-height: 1px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-secondary); opacity: .35; }
.dsh-ul-col[data-has="true"] i { opacity: .9; background: var(--dsw-alias-brand-primary); }
.dsh-ul-axis { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dsh-ul-table th { text-align: right; font-weight: 600; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 0 0 8px 10px; }
.dsh-ul-table th:first-child, .dsh-ul-table td:first-child { text-align: left; padding-left: 0; }
.dsh-ul-table td { text-align: right; padding: 8px 0 8px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.dsh-ul-model { overflow-wrap: anywhere; }
.dsh-ul-share { display: block; height: 3px; margin-top: 4px; border-radius: 2px; background: var(--dsw-alias-brand-primary); opacity: .55; }
.dsh-ul-free { margin-left: 6px; padding: 0 8px; border: 0.5px solid currentColor; border-radius: 12px; font-size: 11px; color: var(--dsw-alias-state-success-primary); }
.dsh-ul-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
`;

    const PERIODS = [7, 30, 90, 365];
    const REFRESH_MS = 15000;

    /** Compact number: 12.3k, 4.5M. */
    function compact(value) {
      const n = Number(value) || 0;
      if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
      return String(Math.round(n));
    }

    /** Local day key, the same format the host writes. */
    function dayKey(date) {
      const pad = (v) => String(v).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    /** Every day of the period, zero-filled, oldest first. */
    function fillDays(perDay, period) {
      const byDate = new Map(perDay.map((row) => [row.date, row]));
      const out = [];
      const day = new Date();
      day.setDate(day.getDate() - (period - 1));
      for (let i = 0; i < period; i += 1) {
        const key = dayKey(day);
        out.push({ date: key, requests: byDate.get(key)?.requests ?? 0 });
        day.setDate(day.getDate() + 1);
      }
      return out;
    }

    function UsagePage({ appCtx }) {
      const t = appCtx.locale.bind('usageLedger');
      const [period, setPeriod] = useState(30);
      const [state, setState] = useState({ status: 'loading', data: null, at: 0 });

      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-usage-ledger/summary?days=' + period, document.baseURI), { cache: 'no-store' });
          if (!response.ok) throw dshKit.fail(String(response.status));
          const data = await response.json();
          setState({ status: 'ready', data, at: Date.now() });
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
        }
      }, [period]);

      useEffect(() => {
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
        return () => clearInterval(timer);
      }, [load]);

      const data = state.data;
      const days = useMemo(() => (data ? fillDays(data.days ?? [], period) : []), [data, period]);
      const peak = Math.max(1, ...days.map((row) => row.requests));
      const freeRequests = data ? (data.models ?? []).filter((m) => m.free).reduce((sum, m) => sum + m.requests, 0) : 0;
      const top = data && data.models.length > 0 ? data.models[0].requests : 1;

      let body;
      if (state.status === 'loading') body = h('p', { className: 'dsh-ul-note' }, t('loading'));
      else if (state.status === 'error') body = h('p', { className: 'dsh-ul-note', 'data-bad': 'true' }, t('failed'));
      else if (data.totals.requests === 0) body = h('p', { className: 'dsh-ul-note' }, t('empty'));
      else {
        const stats = [
          ['stat.requests', data.totals.requests],
          ['stat.input', data.totals.input],
          ['stat.output', data.totals.output],
          ['stat.cache', data.totals.cacheRead],
          ['stat.reasoning', data.totals.reasoning],
          ['stat.free', freeRequests],
        ];
        body = h(
          React.Fragment,
          null,
          h('div', { className: 'dsh-ul-stats' }, stats.map(([key, value]) => h('div', { key, className: 'dsh-ul-stat' }, h('b', null, compact(value)), h('span', null, t(key))))),
          h(
            'section',
            { className: 'dsh-ul-card' },
            h('h3', null, t('daily.title')),
            h('div', { className: 'dsh-ul-chart', role: 'img', 'aria-label': t('daily.title') }, days.map((row) => h('div', { key: row.date, className: 'dsh-ul-col', 'data-has': String(row.requests > 0), title: row.date + ': ' + row.requests }, h('i', { style: { height: Math.max(row.requests > 0 ? 4 : 1, Math.round((row.requests / peak) * 100)) + '%' } })))),
            h('div', { className: 'dsh-ul-axis' }, h('span', null, days[0]?.date), h('span', null, days[days.length - 1]?.date)),
          ),
          h(
            'section',
            { className: 'dsh-ul-card' },
            h('h3', null, t('models.title')),
            h(
              'table',
              { className: 'dsh-ul-table' },
              h('thead', null, h('tr', null, ['col.model', 'col.requests', 'col.input', 'col.output', 'col.cache'].map((key) => h('th', { key, scope: 'col' }, t(key))))),
              h(
                'tbody',
                null,
                data.models.map((row) =>
                  h(
                    'tr',
                    { key: row.model },
                    h('td', { className: 'dsh-ul-model' }, h('span', null, row.model), row.free ? h('span', { className: 'dsh-ul-free' }, t('free')) : null, h('i', { className: 'dsh-ul-share', style: { width: Math.max(2, Math.round((row.requests / top) * 100)) + '%' } })),
                    h('td', null, compact(row.requests)),
                    h('td', null, compact(row.input)),
                    h('td', null, compact(row.output)),
                    h('td', null, compact(row.cacheRead)),
                  ),
                ),
              ),
            ),
          ),
        );
      }

      return h(
        'div',
        { className: 'dsh-ul-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-ul-head' }, h('h2', null, t('head.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-ul-bar', role: 'group', 'aria-label': t('head.title') },
          PERIODS.map((n) => h('button', { key: n, type: 'button', className: 'dsh-ul-btn', 'aria-pressed': period === n, onClick: () => setPeriod(n) }, t('period.' + n))),
          h('span', { className: 'dsh-ul-spacer' }),
          state.at ? h('span', { className: 'dsh-ul-stamp' }, t('updated').replace('{time}', new Date(state.at).toLocaleTimeString('en-GB'))) : null,
          h('button', { type: 'button', className: 'dsh-ul-btn', onClick: () => void load() }, t('refresh')),
        ),
        body,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('usageLedger', DICT));
        const t = ctx.locale.bind('usageLedger');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'usage-ledger', order: 310, label: () => t('section.title') },
              (props) => h(UsagePage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
