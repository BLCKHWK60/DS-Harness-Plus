/**
 * Data, browser half: the Settings > Data page, with the switch for the Data tab and the list of
 * saved analyses. The reading and querying are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-data',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;
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
    // ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips); the same block in every page file that uses it.
    // The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
    // All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
    // React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
    const dshUi = (() => {
      const STYLE_ID = 'dsh-ui-style';
      const CSS = `
    .dshu-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
    .dshu-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
    .dshu-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dshu-group { margin: 24px 0 8px; font-size: 12px; line-height: 18px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
    .dshu-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
    .dshu-rowtext { flex: 1; min-width: 0; }
    .dshu-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
    .dshu-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-side { flex: none; display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    @media (max-width: 560px) { .dshu-row { flex-wrap: wrap; } .dshu-side { margin-left: auto; } }
    .dshu-btn { flex: none; height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
    .dshu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-btn:disabled { opacity: .5; cursor: default; }
    .dshu-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dshu-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dshu-field { flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dshu-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dshu-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
    .dshu-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); }
    .dshu-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
    .dshu-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
    .dshu-switch[data-danger="true"][aria-checked="true"] { background: var(--dsw-alias-state-error-primary); }
    .dshu-switch:disabled { opacity: .5; cursor: default; }
    @media (prefers-reduced-motion: no-preference) { .dshu-switch { transition: background .12s ease; } .dshu-switch::after { transition: transform .12s ease; } }
    .dshu-btn:focus-visible, .dshu-switch:focus-visible, .dshu-chip:focus-visible, .dshu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dshu-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 16px 0 0; padding: 16px; border-radius: 20px; border: 0.5px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
    .dshu-empty-title { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
    .dshu-empty-text { margin: 0; overflow-wrap: anywhere; }
    .dshu-empty .dshu-chips { margin-top: 8px; }
    .dshu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .dshu-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dshu-chip:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dshu-wait { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dshu-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Copies text and says so. Resolves true when it worked. */
      const copyText = async (text) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(String(text)); return true; }
        } catch { /* fall through to the old way */ }
        try {
          const area = document.createElement('textarea');
          area.value = String(text);
          area.setAttribute('readonly', '');
          area.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(area);
          area.select();
          const done = document.execCommand('copy');
          area.remove();
          return done === true;
        } catch { return false; }
      };

      const makeParts = (React) => {
        ensureStyle();
        const h = React.createElement;
        /** The page frame: a title, one sentence under it, then the page. */
        const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
          title ? h('h2', { className: 'dshu-title' }, title) : null,
          desc ? h('p', { className: 'dshu-desc' }, desc) : null,
          children);
        const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
        /** A short line in the page's description style; `error` draws it in the error colour. */
        const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
        /** One setting: text on the left, the control(s) on the right. */
        const Row = ({ title, desc, children }) => h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
          children);
        const Side = ({ children }) => h('div', { className: 'dshu-side' }, children);
        /** `danger`: when it is on, the switch is drawn in the error colour (a safety rule that has been turned off). */
        const Switch = ({ on, label, onChange, disabled, danger }) => h('button', {
          type: 'button', role: 'switch', className: 'dshu-switch', 'data-danger': danger ? 'true' : undefined, 'aria-checked': on === true, 'aria-label': label, disabled: disabled === true, onClick: () => onChange(!on),
        });
        const Button = ({ main, danger, children, ...rest }) => h('button', { type: 'button', className: 'dshu-btn', 'data-main': main ? 'true' : undefined, 'data-danger': danger ? 'true' : undefined, ...rest }, children);
        const Field = (props) => h('input', { className: 'dshu-field', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', ...props });
        /** A button that copies `text` and shows "Copied" for a moment (a timer only while it is showing). */
        const CopyButton = ({ text, label = 'Copy', ...rest }) => {
          const [done, setDone] = React.useState(false);
          const timer = React.useRef(0);
          React.useEffect(() => () => clearTimeout(timer.current), []);
          return h(Button, { ...rest, 'aria-live': 'polite', onClick: async () => {
            if (await copyText(typeof text === 'function' ? text() : text)) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1500); }
          } }, done ? 'Copied' : label);
        };
        /** A row of small choices (starter chips). `items` are strings or { label, value }; `onPick(value)`. */
        const Chips = ({ items, onPick, label }) => h('div', { className: 'dshu-chips', role: 'group', 'aria-label': label ?? 'Suggestions' },
          items.map((item) => { const entry = typeof item === 'string' ? { label: item, value: item } : item; return h('button', { key: entry.label, type: 'button', className: 'dshu-chip', onClick: () => onPick(entry.value ?? entry.label) }, entry.label); }));
        /** What a list shows when it has nothing yet: what it is for, then what to do first (optionally as starter chips). */
        const Empty = ({ title, text, chips, onPick, children }) => h('div', { className: 'dshu-empty', role: 'status' },
          title ? h('p', { className: 'dshu-empty-title' }, title) : null,
          text ? h('p', { className: 'dshu-empty-text' }, text) : null,
          chips && chips.length > 0 ? h(Chips, { items: chips, onPick: onPick ?? (() => {}) }) : null,
          children);
        const Wait = ({ children }) => h('p', { className: 'dshu-wait', role: 'status' }, children ?? 'Loading…');
        return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait };
      };
      return { makeParts, ensureStyle, copyText };
    })();
    // ---- dsh-ui:end ----
    dshUi.ensureStyle();
    const PlainNote = dshKit.makeNote(React);
    const { ask: askInPage } = dshKit;

    const NS = 'data';
    const DICT = { en: { 'section.title': 'Data' }, zh: { 'section.title': '数据' } };

    const CSS = `
.dsh-dt-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-dt-sql { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-data/data', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    async function revision(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return view.revision;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok) throw dshKit.fail(result.error);
    }

    function DataPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [open, setOpen] = useState('');
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      // While Python is downloading, look again every few seconds. This sits before the first
      // return: a hook that only runs once the data is there changes the hook order and React
      // takes the whole page down.
      const pyState = data?.python?.state;
      useEffect(() => {
        if (pyState !== 'installing') return undefined;
        const timer = setInterval(() => void load(), 4000);
        return () => clearInterval(timer);
      }, [pyState, load]);

      if (!data) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Data'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dshu-desc', 'data-error': 'false' }, 'Loading…')));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? 'Switched on. The Data tab appears in the sidebar in a moment.' : 'Switched off. The Data tab is taken away in a moment.', error: false });
          setTimeout(() => { if (alive.current) void load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const remove = async (name) => {
        if (!(await askInPage({ text: `Remove the saved analysis "${name}"?\n\nYour data files are not touched.`, ok: 'Remove', danger: true }))) return;
        setBusy(true);
        try {
          const next = await call({ action: 'remove', name });
          if (alive.current) { setData(next); setNote({ text: 'Removed.', error: false }); }
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const setupPython = async () => {
        setBusy(true);
        try {
          const next = await call({ action: 'python' });
          if (alive.current) { setData(next); setNote({ text: 'Setting Python up. This takes a minute or two and needs the internet.', error: false }); }
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const py = data.python ?? { state: 'missing', detail: '', packages: [] };
      const pyText = py.state === 'ready' ? `Ready (${py.detail}). Packages: ${(py.packages ?? []).join(', ')}.${(py.missing ?? []).length > 0 ? ` Not available: ${py.missing.join(', ')}.` : ''}`
        : py.state === 'installing' ? `Setting up… ${py.detail}`
          : py.state === 'failed' ? `The set-up did not work: ${py.detail}`
            : 'Not set up yet. It is set up by itself the first time Data is switched on.';
      const analyses = Array.isArray(data.analyses) ? data.analyses : [];
      const when = (at) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

      return h('div', { className: 'dshu-page' },
        h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Data'),
        h('p', { className: 'dshu-desc' }, 'A tab, beside Chat, Cowork and Code, for analysing the data files in a folder. The assistant looks at what each file holds, runs queries against the real files, and puts the number of the query behind every figure in its answer, so you can see where it came from.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dshu-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dshu-group' }, 'The tab'),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, 'Show the Data tab'),
            h('div', { className: 'dshu-rowdesc' }, 'On adds the tab, its instructions and its tools. Off takes them away; saved analyses are kept.')),
          h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Data tab', disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dshu-group' }, 'Python for statistics and charts'),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, 'Private Python folder'),
            h('div', { className: 'dshu-rowdesc', 'data-error': String(py.state === 'failed') }, pyText),
            h('div', { className: 'dshu-rowdesc' }, 'Plus keeps its own copy of the analysis packages in the app\'s data folder (about 450 MB, downloaded once). Nothing else on the Mac changes. A program cannot use the internet, can read the conversation\'s folder and nothing else in your home folder, and can write only into its data-output folder.')),
          py.state === 'ready' || py.state === 'installing' ? null : h('button', { type: 'button', className: 'dshu-btn', disabled: busy, onClick: () => void setupPython() }, py.state === 'failed' ? 'Set up again' : 'Set up now')),

        h('div', { className: 'dshu-group' }, 'How to use it'),
        h('ul', { className: 'dsh-dt-list' },
          h('li', null, 'Open the Data tab and pick the folder that holds your files on the start page, as you do in Cowork or Code. The assistant works with the files in that folder: its data tools read nothing outside it.'),
          h('li', null, `Tables it can query: ${(data.reads?.tables ?? []).join(', ')}. Documents it can read: ${(data.reads?.text ?? []).join(', ')}. PDFs are read with the PDF reader add-on.`),
          h('li', null, 'Ask in plain words. In the answer, a mark like [Q7] after a number is the query that produced it. Open that step in the conversation to see the query itself.'),
          h('li', null, 'Charts are drawn from the data itself and shown under the answer. In a Data conversation each one is also saved as an SVG file in a data-output folder inside your folder, ready for a report. Ask for one whenever you want to see something: "chart revenue by month". Pie and area charts are drawn with Python.'),
          h('li', null, 'For statistics, cleaning or combining files, the assistant writes and runs a small Python program. New files it makes (cleaned tables, charts) go into the data-output folder; a program cannot write anywhere else.'),
          h('li', null, 'Web is on in a new Data conversation, so the assistant can look up outside facts, such as what a term means, a benchmark or why something moved. Set Web to Off in the chat box to stop searches, pages, and commands that look like they go online (see Good to know).'),
          h('li', null, 'Say "save this analysis as …" to keep it. Later, say "run … again" and the assistant reports what moved.'),
          h('li', null, 'An AGENTS.md or CLAUDE.md file in the folder is read by the app, as in every tab. Use it to explain your data: what the columns mean, which rows to leave out.')),

        h('div', { className: 'dshu-group' }, 'Saved analyses'),
        analyses.length === 0 ? h('p', { className: 'dshu-desc' }, 'Nothing is saved yet.') : null,
        analyses.map((analysis) => h('div', { key: analysis.name, className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, analysis.name),
            h('div', { className: 'dshu-rowdesc' }, `${analysis.steps.length} ${analysis.steps.length === 1 ? 'query' : 'queries'} · last run ${when(analysis.ranAt)} · ${analysis.folder}`),
            h('div', { className: 'dshu-rowdesc' }, analysis.changed.length > 0 ? `Files changed since the last run: ${analysis.changed.join(', ')}. Ask the assistant to run it again.` : 'No file changed since the last run.'),
            open === analysis.name ? analysis.steps.map((step, index) => h('div', { key: index }, h('div', { className: 'dshu-rowdesc', style: { marginTop: 8 } }, `${step.label} · ${step.files.join(', ')}`), h('div', { className: 'dsh-dt-sql' }, step.sql))) : null),
          h('button', { type: 'button', className: 'dshu-btn', onClick: () => setOpen(open === analysis.name ? '' : analysis.name) }, open === analysis.name ? 'Hide queries' : 'Show queries'),
          h('button', { type: 'button', className: 'dshu-btn', disabled: busy, onClick: () => void remove(analysis.name) }, 'Remove'))),

        h('div', { className: 'dshu-group' }, 'Good to know'),
        h('ul', { className: 'dsh-dt-list' },
          h('li', null, 'A conversation that starts in Data, or is moved into it, runs Read Only, so the assistant cannot change your files with the app\'s file and command tools without asking you first. Data conversations started before version 0.57.0 keep their permission. You can change it in the chat box. Moving the conversation to a tab that does not set its own permission, such as Cowork, gives back the one it had before, unless you changed it by hand. Queries run on a copy held in memory, and only reading is allowed.'),
          h('li', null, 'What the assistant reads (profiles, query results, document text) goes to your model like any message. Results are kept small for that reason.'),
          h('li', null, 'With Web on, the words the assistant searches for (also in deep research) go to the app\'s web search provider, and the pages it opens are fetched from the web. Data\'s own tools never send your files anywhere, and its Python programs have no internet. The assistant is told not to put private details from your files (people\'s or customers\' names, account numbers, rows, exact figures) into a search or a web address. That is an instruction, not a check. Read Only does not keep the app\'s command tool off the internet.'),
          h('li', null, 'With Web Off there are no searches, no pages and no deep research, and commands and programs that look like they go online are stopped. That is a check on their text, which catches the usual ways (curl, web addresses, code that fetches), not every way. Your model still gets the conversation, and connectors you added stay on and can still reach the internet.'),
          h('li', null, 'A model can still write a wrong query or misread a result. The query numbers are there so you can check.'),
          h('li', null, 'Files up to 200 MB and 2 million rows. A query that runs longer than 90 seconds is stopped.'),
          h('li', null, 'Numbers written with a currency sign or a percent sign are read as text; the assistant is told to convert them.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'data', order: 112, label: () => t('section.title') }, (props) => h(DataPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
