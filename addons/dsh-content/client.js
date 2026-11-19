/**
 * Content, browser half: the Settings > Content page, with the switch for the Content tab, how to use
 * it, and what it can and cannot do. The work itself is in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-content',
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

    const NS = 'content';
    const DICT = { en: { 'section.title': 'Content' }, zh: { 'section.title': '内容' } };

    const CSS = `
.dsh-ct-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ct-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ct-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-ct-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ct-switch:disabled { opacity: .5; cursor: default; }
.dsh-ct-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ct-code { font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-ct-input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 6px 8px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: inherit; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; }
`;

    async function call() {
      const response = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
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

    function ContentPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [folderDraft, setFolderDraft] = useState(null);
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

      if (!data) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Content'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dshu-desc', 'data-error': 'false' }, 'Loading…')));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? 'Switched on. The Content tab appears in the sidebar in a moment.' : 'Switched off. The Content tab is taken away in a moment. Files it saved stay where they are.', error: false });
          setTimeout(() => { if (alive.current) void load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const saveFolder = async () => {
        setBusy(true);
        try {
          const value = String(folderDraft ?? '').trim();
          if (value && !value.startsWith('/')) throw new Error('give a full path, starting with /');
          await setSettings(appCtx, { voiceLibrary: value });
          if (!alive.current) return;
          setFolderDraft(null);
          setNote({ text: value ? `The ${library.name ?? 'Voice Library'} is now in ${value}.` : `The ${library.name ?? 'Voice Library'} is back in Content's own folder.`, error: false });
          setTimeout(() => { if (alive.current) void load(); }, 1000);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const library = data.library ?? {};
      const readers = Array.isArray(data.readers) ? data.readers : [];
      const missing = readers.filter((reader) => reader.there === false);

      return h('div', { className: 'dshu-page' },
        h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Content'),
        h('p', { className: 'dshu-desc' }, 'A tab, beside Chat, Cowork and Code, for writing from your material: books and chapters, articles, blog posts, scripts, and outlines for podcasts and videos. It keeps the material and every draft in one folder, and keeps apart what a source says, what you said, and its own wording.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dshu-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dshu-group' }, 'The tab'),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, 'Show the Content tab'),
            h('div', { className: 'dshu-rowdesc' }, 'On adds the tab, its instructions and its tools (they are offered only in Content conversations). Off takes them away. Files it saved stay where they are.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-ct-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Content tab', disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dshu-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, 'Open the Content tab. To work from material you already have, pick the folder that holds it on the start page, as in Cowork. That folder becomes the subject folder. Without a folder, the conversation starts in Scratch and its folder is private to it.'),
          h('li', null, 'The assistant first reports what the folder holds and which files it can read, then asks what to build: the kind of piece, who it is for and how long.'),
          h('li', null, 'Bring in other conversations, from any tab and from Content itself: mention them with @ in your message (three per message; send more in the next one) and say "bring these in". Each is copied, whole, into research/conversations as material. Recon conversations are sealed and are never copied.'),
          h('li', null, 'Drafts are saved in drafts/ with a number: 001, 002, … A new version never replaces an old one, so you can always go back. Your own notes go in notes/, titles and descriptions in publish/.'),
          h('li', null, 'Web, Depth, Long run and the Run button work as in every tab. With Web on, the assistant may look up a source for a missing fact and says what it added. A Long run suits a long piece, such as a whole book, chapter by chapter.')),

        h('div', { className: 'dshu-group' }, 'From material to a final piece'),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, 'Material: a saved Research report ("bring in my heat pump report", or the "Continue in Content" button on a Research report), other conversations, your notes, a Recon export, or what the assistant researches for you. A report is copied as it is, and its numbered sources go into the ledger. When Research wrote its packet beside the report (claims, contradictions, timeline, leads), the packet comes too and its claims are in the ledger at once, with proposed standings.'),
          h('li', null, 'The ledger (ledger.md): every claim, who says it, its sources, the passage it rests on, and how sure it is. Seven standings: Established, Reported, Claimed, Unsubstantiated, Disputed, Own experience, Own view. No claim is dropped for being unproven; it is worded as what it is. The assistant proposes a standing, you rule.'),
          h('li', null, 'Angles and brief (brief.md): three to five angles, you pick; then the brief, which you approve. The outline (outline.md) names the claims behind each point, or marks it as your view, your experience, or a gap.'),
          h('li', null, 'The draft is written by a separate writer model that has no tools at all, from the brief, the outline, the claims and your notes. Each sentence carries the id of its claim, such as [C3], so it can be checked. A separate checker model, and Content\'s own code, then flag every sentence that is stronger than its claim, has a number or quote that is not in the material, rests on nothing, or uses a claim you ruled out.'),
          h('li', null, 'Formats: blog post, article, story, talking outline for video or podcast, full script (only when you ask), and your own. Each is a small card file you can edit in Content\'s formats folder.'),
          h('li', null, 'Final: when you say so, and only when nothing is open. You get the piece in final/, a sources page (Markdown and a web page), a corrections log, and a publish kit in publish/ (titles, description, chapters, show notes, a sign-up offer). Nothing is posted or sent.'),
          h('li', null, 'If a claim\'s standing changes later, the assistant lists every final piece that used it, in any subject, and drafts a correction. The final piece is never changed: a corrected version is saved beside it, and the correction goes into its log.'),
          h('li', null, 'At approval, each web source the piece uses gets the Internet Archive\'s copy of it on the sources page, when one exists (looked up once; never for Recon sources, never with Web off).'),
          h('li', null, 'Ultra Code (the switch beside Effort): three writers draft side by side and a judge picks or merges, and two checkers read the draft. Every one of them still has no tools. Off: one writer and one checker, as always.')),

        h('div', { className: 'dshu-group' }, library.name ?? 'Voice Library'),
        h('p', { className: 'dshu-desc' }, 'Where Content learns your voice, only from what you approved. One folder for all subjects, of plain files you can read and edit. Nothing enters by itself. (Settings → Library is something else: it searches your document folders.)'),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, library.folder || 'Not set'),
            h('div', { className: 'dshu-rowdesc' }, library.problem ? library.problem : `${library.pieces ?? 0} approved piece${library.pieces === 1 ? '' : 's'}, ${library.rules ?? 0} voice rule${library.rules === 1 ? '' : 's'}, ${library.ownWords ?? 0} of your own texts, ${library.pinned ?? 0} pinned fact${library.pinned === 1 ? '' : 's'}, ${library.wording ?? 0} saved passage${library.wording === 1 ? '' : 's'}, ${library.sources ?? 0} marked source${library.sources === 1 ? '' : 's'}, ${library.signals ?? 0} signal${library.signals === 1 ? '' : 's'}. ${library.own ? 'This is Content\'s own folder in the app\'s data.' : 'This is the folder you set.'} To use another, give its full path and press Save; leave it empty for Content's own.`),
            h('input', { className: 'dsh-ct-input', type: 'text', spellCheck: false, placeholder: library.folder || '/Users/you/Documents/Voice Library', value: folderDraft ?? '', 'aria-label': 'Voice Library folder', onChange: (event) => setFolderDraft(event.target.value) })),
          h('button', { type: 'button', className: 'dshu-btn', disabled: busy || folderDraft === null, onClick: () => void saveFolder() }, 'Save')),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, 'When you make a piece final, it goes on the shelf of approved pieces, with how much of it you wrote or changed, and the writer\'s draft goes beside your version under edits/. The assistant then lists what you changed and proposes a few voice rules; each enters only when you say yes to it.'),
          h('li', null, 'The writer gets the two or three approved pieces closest to the one it writes (a piece you changed more counts for more), your voice rules for that format, wording you saved to reuse word for word, and facts you pinned. With nothing approved yet, it writes plainly and says so.'),
          h('li', null, 'Your own words: notes and transcripts of you talking. Written and spoken voice are kept apart. Give a transcript of a recording and name its talking outline: the assistant compares them (what you skipped, moved or expanded), and later outlines follow that.'),
          h('li', null, 'Feedback such as "too formal", or which of two versions you chose, is kept as a signal. Pin a fact, mark a source as trusted or distrusted, save a passage: say so in your own words.')),

        h('div', { className: 'dshu-group' }, 'The subject folder'),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'research/'), ' material that came in: other conversations, copied sources. Only ever added to.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'notes/'), ' your own words: notes, transcripts, answers to the assistant\'s questions.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'drafts/'), ' every draft, numbered.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'publish/'), ' titles, descriptions, show notes.'),
          h('li', null, 'Content also keeps its record in a hidden .content folder, readable copies (ledger.md, brief.md, outline.md, which it rewrites; a file of yours with one of those names is never touched), and final/ (written only when you approve a piece, never replaced: a correction is a new version beside it). Format cards and the where-used index are in Content\'s own folder in the app\'s data. Everything else in the folder is yours, and Content never changes, moves or deletes it.')),

        h('div', { className: 'dshu-group' }, 'Good to know'),
        h('ul', { className: 'dsh-ct-list' },
          missing.length > 0 ? h('li', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `Not running: ${missing.map((reader) => `the ${reader.addOn} add-on (${reader.tool})`).join(' and ')}. Without it the assistant cannot read ${missing.some((reader) => reader.tool === 'pdf_read') ? 'PDFs' : ''}${missing.length === 2 ? ' or ' : ''}${missing.some((reader) => reader.tool === 'data_text') ? 'Word documents and spreadsheets' : ''}. Switch it on under Plugins or its own Settings page.`) : null,
          data.history === false ? h('li', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, 'The app\'s conversation history is not available, so conversations cannot be brought in.') : null,
          h('li', null, 'A Content conversation runs Read Only, as Research and Data do: the app\'s own file and command tools ask you before they change anything. Content\'s own tools save drafts and material without asking, but only into its own parts of the folder. A Long run switches the conversation to Workspace Write while it works, and puts Read Only back when it ends.'),
          h('li', null, 'Content publishes nothing. Posting, sending and uploading are for you.'),
          h('li', null, 'What the assistant reads (your files, other conversations) goes to your model like any message. With Web on, its searches go to the app\'s web search provider.'),
          h('li', null, 'A conversation brought in is a copy taken at that moment: later messages in it are not in the copy. Only your words and the assistant\'s answers are copied, not tool results. A very long conversation keeps its newest part, and the file says how many messages were left out.'),
          h('li', null, 'In a Scratch conversation, the drafts are in that conversation\'s own folder and go when it is deleted for good. Start in a folder of your own to keep them.'),
          h('li', null, 'Your decisions are yours: a ruling, an approval, an override or a new format card only counts with words from your newest message that say that decision ("C3 is reported", "make it final", or a whole short "yes" to the question just asked). A "not" turns them around. The assistant cannot make one up or reuse older words: Content checks them against your messages.'),
          h('li', null, 'Your own experience comes only from your notes or your answers. The assistant asks for it and never invents an event, a date or a feeling.'),
          h('li', null, 'Statements about named people that are not proven (Claimed, Unsubstantiated, Disputed) need your yes, person by person, before a piece is final. For a claim that accuses someone, the assistant looks for their response. Content gives no legal advice.'),
          h('li', null, 'A Recon export arrives as a message marked "[Recon export …]": material, never your words. Its addresses are citations: an onion address is never opened outside Recon, and any other address from it is opened only after you say yes on the app\'s own question. Nothing from it goes into Memory.'),
          h('li', null, 'Content keeps its web at Open web at most: in a Content conversation the assistant is told to stay off forums, boards and channels, and to send a claim that needs them on to Research or Recon.'),
          h('li', null, 'Not built yet: the link to a topic watch (there is no topic watch add-on yet).')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'content', order: 115, label: () => t('section.title') }, (props) => h(ContentPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
