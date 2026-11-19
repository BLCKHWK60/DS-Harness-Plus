/**
 * Engines, browser half: one page. Its first part says how to use an engine in Code mode and sets
 * when its changes go into the project. Its second part is the comparison: a task goes to dsh and to an outside engine at once, each in
 * its own copy of the project, and the two results stand side by side with their figures.
 * The dsh side is a real Code conversation, which this page starts and the server half follows.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-engines',
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

    const NS = 'engines';
    const DICT = { en: { 'panel.title': 'Engines' }, zh: { 'panel.title': '引擎' } };

    const CSS = `
.dsh-en-form { display: grid; grid-template-columns: 120px 1fr; gap: 10px 12px; align-items: start; margin-top: 14px; }
.dsh-en-form label { padding-top: 6px; color: var(--dsw-alias-label-secondary); }
.dsh-en-input, .dsh-en-area, .dsh-en-select {
  width: 100%; box-sizing: border-box; padding: 6px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-en-area { min-height: 84px; resize: vertical; line-height: 19px; }
.dsh-en-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsh-en-runs { display: flex; gap: 6px; flex-wrap: wrap; }
.dsh-en-run { height: 26px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); background: transparent; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-en-run[aria-pressed="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-en-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
@media (max-width: 760px) { .dsh-en-cols { grid-template-columns: 1fr; } }
.dsh-en-col { min-width: 0; padding: 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-en-colhead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.dsh-en-name { font-size: 15px; font-weight: 600; }
.dsh-en-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-en-status[data-status="finished"] { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dsh-en-status[data-status="failed"] { color: var(--dsw-alias-state-error-primary); }
.dsh-en-figs { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 12px 0 0; font-variant-numeric: tabular-nums; }
.dsh-en-figs dt { color: var(--dsw-alias-label-secondary); }
.dsh-en-figs dd { margin: 0; overflow-wrap: anywhere; }
.dsh-en-figs dd[data-best="true"] { font-weight: 600; }
.dsh-en-sub { margin: 14px 0 4px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-en-pre {
  margin: 0; padding: 8px 10px; max-height: 320px; overflow: auto; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.dsh-en-pre[data-plain="true"] { font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-en-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-engines/state', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    async function setSettings(ctx, values) {
      const read = async () => {
        const result = await ctx.remote.settings.describe();
        if (!result.ok) throw dshKit.fail(result.error);
        const view = result.value.namespaces.find((entry) => entry.ns === NS);
        if (!view) throw dshKit.fail('not mounted');
        return view.revision;
      };
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await read());
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await read());
      if (!result.ok) throw dshKit.fail(result.error);
    }

    const count = (n) => (Number(n) || 0).toLocaleString('en-US');
    const span = (pane, now) => {
      if (!pane.startedAt) return '–';
      const seconds = Math.max(0, Math.round(((pane.endedAt || now) - pane.startedAt) / 1000));
      return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    };
    const STATUS = { waiting: 'Starting…', running: 'Working…', finished: 'Finished', failed: 'Did not finish', stopped: 'Stopped' };

    /** Put a conversation into Code mode before its first turn: the selected tab decides a new conversation's mode. */
    async function chooseCode(appCtx) {
      const read = async () => {
        const result = await appCtx.remote.settings.describe();
        if (!result.ok) throw new Error(result.error.message);
        return result.value.namespaces.find((entry) => entry.ns === 'modes');
      };
      const modes = await read();
      if (!modes || modes.value?.defaultMode === 'code') return;
      const done = await appCtx.remote.settings.mutate('modes', [{ op: 'set', path: ['defaultMode'], value: 'code' }], modes.revision);
      if (!done.ok) throw new Error(done.error.message);
    }

    function Pane({ pane, other, now, appCtx }) {
      const total = pane.input + pane.output;
      const otherTotal = other ? other.input + other.output : 0;
      const done = pane.status === 'finished' && other?.status === 'finished';
      const diff = pane.diff;
      const fig = (label, value, best) => [h('dt', { key: `${label}t` }, label), h('dd', { key: `${label}d`, 'data-best': String(Boolean(best)) }, value)];
      return h('div', { className: 'dsh-en-col' },
        h('div', { className: 'dsh-en-colhead' },
          h('span', { className: 'dsh-en-name' }, pane.label),
          h('span', { className: 'dsh-en-status', 'data-status': pane.status }, STATUS[pane.status] ?? pane.status)),
        pane.error ? h('p', { className: 'dshu-desc', 'data-error': 'true' }, pane.error) : null,
        h('dl', { className: 'dsh-en-figs' },
          fig('Model', pane.model || '–'),
          fig('Tokens', `${count(total)} (in ${count(pane.input)}, out ${count(pane.output)})`, done && total > 0 && total < otherTotal),
          fig('Steps', count(pane.steps), done && pane.steps > 0 && pane.steps < other.steps),
          fig('Tool calls', count(pane.tools)),
          fig('Time', span(pane, now), done && (pane.endedAt - pane.startedAt) < (other.endedAt - other.startedAt)),
          fig('Cost', pane.cost === null || pane.cost === undefined ? 'not reported' : `$${Number(pane.cost).toFixed(4)}`),
          fig('Changed', diff ? (diff.error ? `could not be worked out: ${diff.error}` : `${diff.files} file${diff.files === 1 ? '' : 's'}, +${count(diff.added)} −${count(diff.removed)} lines`) : pane.endedAt ? 'being worked out…' : '–')),
        pane.engine === 'dsh' && pane.sessionId
          ? h('div', { className: 'dsh-en-bar', style: { marginTop: 10 } }, h('button', { type: 'button', className: 'dshu-btn', onClick: () => { try { appCtx.get('layout').selectPanel(null); appCtx.get('uiWorkspace').openSession(pane.sessionId); } catch { /* the conversation is gone */ } } }, 'Open the conversation'))
          : null,
        h('div', { className: 'dsh-en-sub' }, 'Answer'),
        h('pre', { className: 'dsh-en-pre', 'data-plain': 'true' }, pane.text || (pane.endedAt ? '(no answer text)' : '…')),
        h('div', { className: 'dsh-en-sub' }, 'What it changed'),
        h('pre', { className: 'dsh-en-pre' }, diff ? (diff.patch || (diff.error ? '' : 'No file was changed.')) + (diff.cut ? '\n… (the rest is left out; the copy holds everything)' : '') : '…'),
        pane.work ? h('p', { className: 'dshu-desc' }, `Its copy of the project: ${pane.work}`) : null);
    }

    function ComparePage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [project, setProject] = useState('');
      const [task, setTask] = useState('');
      const [model, setModel] = useState('');
      const [picked, setPicked] = useState('');
      const [now, setNow] = useState(Date.now());
      const [names, setNames] = useState('');
      const namesSeen = useRef(false);
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); setNow(Date.now()); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, []);
      const running = data?.running === true;
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, running ? 1500 : 6000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load, running]);

      // The model names field starts with what is saved, once. Before the first return, so the hook order never changes.
      const savedNames = data?.opencodeModels;
      useEffect(() => {
        if (!Array.isArray(savedNames) || namesSeen.current) return;
        namesSeen.current = true;
        setNames(savedNames.join('\n'));
      }, [savedNames]);

      let workspaces = [];
      try {
        const snap = appCtx.get('workspaces')?.list?.getSnapshot?.();
        workspaces = (Array.isArray(snap) ? snap : (snap?.workspaces ?? snap?.items ?? [])).filter((ws) => ws && typeof ws.path === 'string');
      } catch {
        workspaces = [];
      }

      if (!data) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Compare'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dshu-desc', 'data-error': 'false' }, 'Loading…')));
      }
      const engine = (data.engines ?? [])[0];
      const runs = data.runs ?? [];
      const run = runs.find((one) => one.id === picked) ?? runs[0];

      const start = async () => {
        setBusy(true);
        setNote({ text: 'Copying the project…', error: false });
        let made;
        try {
          made = (await call({ action: 'start', project, task, engine: engine?.id, model })).made;
          setPicked(made);
          await load();
        } catch (problem) {
          if (alive.current) { setNote({ text: String(problem?.message ?? problem), error: true }); setBusy(false); }
          return;
        }
        // The dsh side: an ordinary Code conversation in its own copy of the project.
        try {
          const work = (await call()).runs.find((one) => one.id === made)?.panes.find((pane) => pane.engine === 'dsh')?.work;
          if (!work) throw new Error('its copy of the project is missing');
          await chooseCode(appCtx);
          const sessionId = await appCtx.get('sessions').create({ cwd: work });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await call({ action: 'attach', run: made, sessionId });
          const sent = await appCtx.get('remote.session').prompt({ requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: task }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the message was not accepted');
          if (alive.current) setNote({ text: 'Both sides are working.', error: false });
        } catch (problem) {
          const why = `The dsh side could not be started: ${String(problem?.message ?? problem)}`;
          await call({ action: 'dsh-failed', run: made, why }).catch(() => {});
          if (alive.current) setNote({ text: why, error: true });
        } finally {
          if (alive.current) setBusy(false);
          void load();
        }
      };
      const act = async (action) => {
        try {
          await call({ action, run: run.id });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: String(problem?.message ?? problem), error: true });
        }
      };
      const save = async (values, done) => {
        try {
          await setSettings(appCtx, values);
          if (alive.current) setNote({ text: done, error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${String(problem?.message ?? problem)}`, error: true });
        }
      };
      const item = (text) => h('li', null, text);
      const ready = Boolean(engine?.program) && project && task.trim().length >= 3 && !busy && !running;

      return h('div', { className: 'dshu-page' }, h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Engines'),
        h('p', { className: 'dshu-desc' }, `Use an outside coding engine in Code mode instead of dsh, or run one against dsh on the same task. Installed: ${(data.engines ?? []).map((one) => `${one.label}${one.program ? '' : ' (not found)'}`).join(', ')}.`),

        h('div', { className: 'dshu-group' }, 'Use an engine in Code mode'),
        h('ul', { className: 'dsh-en-list' },
          item('In a Code conversation, open the model menu in the chat box and pick the engine, for example "OpenCode (engine)". That conversation is then answered by the engine. Pick one of your own models to go back to dsh.'),
          item('To make an engine the usual choice, pick it as the model of a new Code conversation; dsh starts the next one with the model you used last.'),
          item('The engine works in a copy of your project, inside a lock. /engine shows what waits; /engine apply puts it into your project; /engine discard drops it; /engine undo takes the last one back.'),
          item('The engine gets your message as its task and keeps its own memory of the conversation. It does not get dsh\'s tools, skills, memory or instructions.')),
        h('div', { className: 'dsh-en-form' },
          h('label', { htmlFor: 'dsh-en-when' }, 'Its changes'),
          h('select', { id: 'dsh-en-when', className: 'dsh-en-select', value: data.applyWhen ?? 'review', onChange: (event) => void save({ applyWhen: event.target.value }, 'Saved.') },
            h('option', { value: 'review' }, 'Wait until I type /engine apply'),
            h('option', { value: 'new' }, 'New files at once; changed and deleted files wait'),
            h('option', { value: 'auto' }, 'Everything at once (with /engine undo)')),
          h('label', { htmlFor: 'dsh-en-names' }, 'Models to offer'),
          h('div', null,
            h('textarea', { id: 'dsh-en-names', className: 'dsh-en-area', style: { minHeight: 56 }, value: names, placeholder: 'One per line, as OpenCode names them: provider/model. Its own default is always offered.', spellCheck: false, onChange: (event) => setNames(event.target.value) }),
            h('div', { className: 'dsh-en-bar', style: { marginTop: 6 } }, h('button', { type: 'button', className: 'dshu-btn', onClick: () => void save({ opencodeModels: names.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30) }, 'Saved. The model menu shows them after the app is started again.') }, 'Save the list')))),
        h('p', { className: 'dshu-desc' }, 'While a Mission mode is on in a conversation, it decides instead: Restricted waits for /engine apply, Ask-Auto puts new files in at once, Full Auto puts everything in.'),

        h('div', { className: 'dshu-group' }, 'Compare with dsh'),
        h('p', { className: 'dshu-desc' }, `Give the same coding task to dsh and to ${engine?.label ?? 'another engine'}. Each works in its own copy of the project, so your project is not touched and the two cannot get in each other's way.`),
        engine?.program ? null : h('p', { className: 'dshu-desc', 'data-error': 'true' }, `${engine?.label ?? 'The engine'} is not installed on this Mac, or not where it usually is. Plus does not install it.`),

        h('div', { className: 'dsh-en-form' },
          h('label', { htmlFor: 'dsh-en-project' }, 'Project'),
          h('select', { id: 'dsh-en-project', className: 'dsh-en-select', value: project, onChange: (event) => setProject(event.target.value) },
            h('option', { value: '' }, 'Choose a project…'),
            workspaces.map((ws) => h('option', { key: ws.workspaceId ?? ws.path, value: ws.path }, `${ws.title || ws.path.split('/').pop()}  (${ws.path})`))),
          h('label', { htmlFor: 'dsh-en-task' }, 'Task'),
          h('textarea', { id: 'dsh-en-task', className: 'dsh-en-area', value: task, placeholder: 'What both should do, in the words you would type in Code mode.', onChange: (event) => setTask(event.target.value) }),
          h('label', { htmlFor: 'dsh-en-model' }, `${engine?.label ?? 'Engine'} model`),
          h('input', { id: 'dsh-en-model', className: 'dsh-en-input', type: 'text', value: model, placeholder: 'Empty uses its own default. Otherwise provider/model, as OpenCode names it.', spellCheck: false, autoCapitalize: 'off', onChange: (event) => setModel(event.target.value) }),
          h('span', null),
          h('div', { className: 'dsh-en-bar' },
            h('button', { type: 'button', className: 'dshu-btn', 'data-main': 'true', disabled: !ready, onClick: () => void start() }, running ? 'A comparison is running' : busy ? 'Starting…' : 'Start the comparison'),
            note.text && (note.error || busy || running) ? h('span', { className: 'dshu-desc', 'data-error': String(note.error), style: { margin: 0 } }, note.text) : null)),
        h('p', { className: 'dshu-desc' }, 'dsh uses the model that a new Code conversation starts with. Pick it in the chat box of any Code conversation before you start.'),

        runs.length > 0 ? h('div', { className: 'dshu-group' }, 'Comparisons') : null,
        runs.length > 0 ? h('div', { className: 'dsh-en-runs' }, runs.map((one) => h('button', { key: one.id, type: 'button', className: 'dsh-en-run', 'aria-pressed': String(one.id === run?.id), title: one.task, onClick: () => setPicked(one.id) }, `${new Date(one.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${one.task}`))) : null,
        run ? h('div', null,
          h('p', { className: 'dshu-desc', style: { marginTop: 12 } }, `Task: ${run.task}`),
          h('p', { className: 'dshu-desc' }, `Project: ${run.project}`),
          h('div', { className: 'dsh-en-bar', style: { marginTop: 8 } },
            run.panes.some((pane) => !pane.endedAt) ? h('button', { type: 'button', className: 'dshu-btn', onClick: () => void act('stop') }, 'Stop both') : h('button', { type: 'button', className: 'dshu-btn', onClick: () => void act('remove') }, 'Remove, with its copies')),
          h('div', { className: 'dsh-en-cols' }, run.panes.map((pane, index) => h(Pane, { key: pane.engine, pane, other: run.panes[1 - index], now, appCtx })))) : null,

        h('div', { className: 'dshu-group' }, 'Good to know'),
        h('ul', { className: 'dsh-en-list' },
          item('Nothing is put back into your project. Each side leaves its work in its own copy; the path is shown under each column.'),
          item(`${engine?.label ?? 'The engine'} runs inside a lock: it can change files only in its copy and in its own settings folders, and cannot read the rest of your home folder. It can use the network, which it needs to reach its model.`),
          item(`${engine?.label ?? 'The engine'} does not stop to ask you anything; the lock and the copy are the boundary. dsh works as it does in any Code conversation, with the permission preset a new conversation gets.`),
          item('Tokens are counted as each side reports them: every request\'s input and output, added up. A bold figure is the lower one when both finished.'),
          item('One comparison at a time. The last 20 are kept; removing one deletes its copies.')));
    }

    function ComparePanel({ appCtx }) {
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '28px clamp(16px, 4vw, 48px) 40px' } },
        h('div', { style: { maxWidth: 1180, margin: '0 auto' } }, h(ComparePage, { appCtx })));
    }

    function CompareIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 5h6v14H4zM14 5h6v14h-6z' }));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'compare' }, () => h(ComparePanel, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'compare', order: 23, label: () => t('panel.title') }, CompareIcon)));
      },
    };
  },
});
