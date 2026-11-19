/**
 * Memory, browser half: the Settings > Memory page, and a small card under an answer when the
 * assistant suggested something to remember. The list itself is kept by the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-memory',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;
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
    const PlainNote = dshKit.makeNote(React);
    dshUi.ensureStyle();

    const NS = 'memory';
    const DICT = { en: { 'section.title': 'Memory' }, zh: { 'section.title': '记忆' } };
    const GROUPS = [
      ['about', 'About me'],
      ['style', 'How I like answers'],
      ['projects', 'Current projects'],
      ['other', 'Other'],
    ];

    const CSS = `
.dsh-mm-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-mm-rowdesc[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-mm-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-mm-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-mm-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
input.dsh-mm-field { flex: 1; }
.dsh-mm-add { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0 8px; }
.dsh-mm-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-mm-card {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 8px 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-primary); border: 0.5px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
}
.dsh-mm-cardtext { flex: 1; min-width: 180px; overflow-wrap: anywhere; }
.dsh-mm-cardtext b { font-weight: 500; }
`;

    const dataUrl = () => new URL('dsh-memory/data', document.baseURI);

    async function call(body) {
      const response = await fetch(dataUrl(), body
        ? { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error ?? `error ${response.status}`));
      return data;
    }

    // One read shared by every card on the page, refreshed at most every few seconds.
    let shared = { at: 0, promise: null };
    function readShared() {
      if (!shared.promise || Date.now() - shared.at > 4000) shared = { at: Date.now(), promise: call().catch(() => ({ suggestions: [] })) };
      return shared.promise;
    }

    async function loadSettings(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function setSetting(ctx, field, value) {
      const ops = [{ op: 'set', path: [field], value }];
      let result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok) throw dshKit.fail(result.error);
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Button({ main, children, ...rest }) {
      return h('button', { type: 'button', className: 'dshu-btn', 'data-main': String(Boolean(main)), ...rest }, children);
    }

    function GroupSelect({ value, onChange, label }) {
      return h('select', { className: 'dsh-mm-field', value, 'aria-label': label, onChange: (event) => onChange(event.target.value) },
        GROUPS.map(([id, name]) => h('option', { key: id, value: id }, name)));
    }

    function Entry({ entry, onAct }) {
      const [editing, setEditing] = useState(false);
      const [text, setText] = useState(entry.text);
      const [group, setGroup] = useState(entry.group);
      if (editing) {
        return h('div', { className: 'dshu-row' },
          h('input', { className: 'dsh-mm-field', value: text, maxLength: 300, 'aria-label': 'Entry', onChange: (event) => setText(event.target.value) }),
          h(GroupSelect, { value: group, onChange: setGroup, label: 'Group' }),
          h(Button, { main: true, onClick: () => onAct({ action: 'edit', id: entry.id, text, group }).then((ok) => ok && setEditing(false)) }, 'Save'),
          h(Button, { onClick: () => { setText(entry.text); setGroup(entry.group); setEditing(false); } }, 'Cancel'));
      }
      const saved = new Date(entry.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      return h('div', { className: 'dshu-row' },
        h('div', { className: 'dshu-rowtext' },
          h('div', { className: 'dshu-rowtitle' }, entry.text),
          h('div', { className: 'dsh-mm-rowdesc', 'data-warn': String(entry.stale) }, entry.stale ? `Saved ${saved}. Is this still true?` : `Saved ${saved}`)),
        entry.stale ? h(Button, { onClick: () => onAct({ action: 'keep', id: entry.id }) }, 'Still true') : null,
        h(Button, { onClick: () => setEditing(true) }, 'Edit'),
        h(Button, { onClick: () => onAct({ action: 'remove', id: entry.id }) }, 'Delete'));
    }

    function MemoryPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [draft, setDraft] = useState('');
      const [group, setGroup] = useState('about');
      const alive = useRef(true);

      const load = () => call()
        .then((next) => alive.current && setData(next))
        .catch((error) => alive.current && setNote({ text: `Could not load the memory: ${error.message}`, details: error.details ?? '', error: true }));
      useEffect(() => {
        alive.current = true;
        load();
        return () => { alive.current = false; };
      }, []);

      const act = async (body, done) => {
        try {
          const next = await call(body);
          shared = { at: 0, promise: null };
          if (!alive.current) return true;
          setData(next);
          setNote({ text: done ?? 'Saved.', error: false });
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: error.message, details: error.details ?? '', error: true });
          return false;
        }
      };
      const flip = async (field, value) => {
        try {
          await setSetting(appCtx, field, value);
          if (alive.current) setData((d) => (d ? { ...d, settings: { ...d.settings, [field]: value } } : d));
          setTimeout(load, 5500);
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };

      if (!data) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Memory'), h('p', { className: 'dshu-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const entries = data.entries ?? [];
      const suggestions = data.suggestions ?? [];
      const on = data.settings?.enabled !== false;

      return h('div', { className: 'dshu-page' },
        h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Memory'),
        h('p', { className: 'dshu-desc' }, 'A short list of lasting things the assistant should know about you. It is given to every new conversation. Nothing is added unless you add it or say yes to a suggestion.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        suggestions.length > 0 ? h(React.Fragment, null,
          h('div', { className: 'dshu-group' }, `Suggested by the assistant (${suggestions.length})`),
          suggestions.map((s) => h('div', { className: 'dshu-row', key: s.id },
            h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, s.text), h('div', { className: 'dsh-mm-rowdesc' }, (GROUPS.find(([id]) => id === s.group) ?? GROUPS[3])[1])),
            h(Button, { main: true, onClick: () => act({ action: 'accept', id: s.id }, 'Remembered.') }, 'Save'),
            h(Button, { onClick: () => act({ action: 'dismiss', id: s.id }, 'Dismissed.') }, 'No')))) : null,

        h('div', { className: 'dshu-group' }, 'Add something'),
        h('div', { className: 'dsh-mm-add' },
          h('input', { className: 'dsh-mm-field', value: draft, maxLength: data.entryMax ?? 300, placeholder: 'For example: I am a student, not a programmer. Explain in plain words.', 'aria-label': 'What to remember',
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && draft.trim()) act({ action: 'add', text: draft, group }, 'Remembered.').then((ok) => ok && setDraft('')); } }),
          h(GroupSelect, { value: group, onChange: setGroup, label: 'Group' }),
          h(Button, { main: true, disabled: !draft.trim(), onClick: () => act({ action: 'add', text: draft, group }, 'Remembered.').then((ok) => ok && setDraft('')) }, 'Remember')),

        GROUPS.map(([id, name]) => {
          const mine = entries.filter((entry) => entry.group === id);
          if (mine.length === 0) return null;
          return h(React.Fragment, { key: id },
            h('div', { className: 'dshu-group' }, name),
            mine.map((entry) => h(Entry, { key: entry.id + entry.text + entry.group, entry, onAct: (body) => act(body) })));
        }),
        entries.length === 0 ? h('p', { className: 'dshu-desc' }, 'Nothing is remembered yet.') : h('p', { className: 'dshu-desc' }, `${data.chars} of ${data.limit} characters used. Memory is kept short on purpose.`),

        h('div', { className: 'dshu-group' }, 'Settings'),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, 'Use memory'), h('div', { className: 'dsh-mm-rowdesc' }, 'Off keeps the list but leaves it out of new conversations.')),
          h(Switch, { checked: on, label: 'Use memory', onChange: (next) => flip('enabled', next) })),
        h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, 'Let the assistant suggest entries'), h('div', { className: 'dsh-mm-rowdesc' }, 'It can only suggest. You decide each time.')),
          h(Switch, { checked: data.settings?.suggest !== false, label: 'Let the assistant suggest entries', onChange: (next) => flip('suggest', next) })),

        h('div', { className: 'dshu-group' }, 'Good to know'),
        h('ul', { className: 'dsh-mm-list' },
          h('li', null, 'A change applies to conversations you start afterwards, not to ones already open.'),
          h('li', null, 'Good entries stay true for months: who you are, how you like answers, long projects. Deadlines and file locations go out of date; leave those out.'),
          h('li', null, 'Never put passwords or keys here. The list is sent to the model with every new conversation.'),
          h('li', null, 'Entries older than four months are marked "Is this still true?" so the list does not go stale.')));
    }

    /** Under a finished answer: what the assistant suggested remembering in that turn, with Save and No. */
    function TurnSuggestions({ sessionId, turn }) {
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const [items, setItems] = useState([]);
      const [done, setDone] = useState({});
      useEffect(() => {
        if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
        let alive = true;
        readShared().then((data) => {
          if (!alive) return;
          setItems((data.suggestions ?? []).filter((s) => s.sessionId === sessionId && s.at >= from - 1000 && s.at <= to + 5000));
        });
        return () => { alive = false; };
      }, [sessionId, from, to]);
      if (items.length === 0) return null;
      const decide = (id, action) => call({ action, id })
        .then(() => { shared = { at: 0, promise: null }; setDone((d) => ({ ...d, [id]: action === 'accept' ? 'Saved to memory.' : 'Not saved.' })); })
        .catch((error) => setDone((d) => ({ ...d, [id]: error.message })));
      return h(React.Fragment, null,
        h('style', null, CSS),
        items.map((s) => h('div', { className: 'dsh-mm-card', key: s.id },
          h('span', { className: 'dsh-mm-cardtext' }, h('b', null, 'Remember this? '), s.text),
          done[s.id]
            ? h('span', { className: 'dsh-mm-rowdesc', role: 'status' }, done[s.id])
            : h(React.Fragment, null,
              h(Button, { main: true, onClick: () => decide(s.id, 'accept') }, 'Save'),
              h(Button, { onClick: () => decide(s.id, 'dismiss') }, 'No')))));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'memory', order: 500, label: () => t('section.title') }, (props) => h(MemoryPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-memory' }, (props) => h(TurnSuggestions, props))));
      },
    };
  },
});
