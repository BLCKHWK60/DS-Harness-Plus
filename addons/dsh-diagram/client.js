/**
 * Diagram builder, browser half: shows a drawn diagram in the chat, where the
 * model drew it, and holds the settings page.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-diagram',
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
    const ui = dshUi.makeParts(React);

    const NS = 'diagram';
    const DICT = { en: { 'section.title': 'Diagrams' }, zh: { 'section.title': '图表' } };

    const CSS = `
.dsh-dg-card { margin: 6px 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; max-width: 100%; }
.dsh-dg-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.dsh-dg-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-dg-warn { color: var(--dsw-alias-state-warn-primary); white-space: nowrap; }
.dsh-dg-pic { display: block; padding: 4px 12px 12px; overflow-x: auto; }
.dsh-dg-pic img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.dsh-dg-pic[data-big="true"] img { max-width: none; }
.dsh-dg-foot { padding: 0 12px 10px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-dg-text { margin: 0; padding: 0 12px 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-dg-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0; width: 220px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-dg-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-dg-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    /** Is the app showing a dark background right now? */
    function isDark() {
      try {
        const color = getComputedStyle(document.body).backgroundColor || '';
        const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0)) return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2] < 128;
      } catch {
        // Fall through to the system setting.
      }
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
    }

    /** All text inside a tool call's data, wherever the app keeps it. */
    function textOf(value, depth = 0) {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object' || depth > 6) return '';
      if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).join('\n');
      return Object.values(value).map((item) => textOf(item, depth + 1)).join('\n');
    }

    /** The picture of one drawing, fetched once and shown as an image (an image cannot run scripts). */
    function Picture({ id }) {
      const [state, setState] = useState({ url: '', failed: false });
      const [big, setBig] = useState(false);
      useEffect(() => {
        let url = '';
        let alive = true;
        fetch(new URL('dsh-diagram/svg', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-diagram': id, 'x-dsh-theme': isDark() ? 'dark' : 'light' } })
          .then((response) => (response.ok ? response.blob() : Promise.reject(new Error('gone'))))
          .then((blob) => {
            if (!alive) return;
            // Shown as an image, so nothing inside it can run. Charts from other add-ons may be PNG or JPEG.
            url = URL.createObjectURL(new Blob([blob], { type: /^image\/(png|jpeg)/.test(blob.type) ? blob.type : 'image/svg+xml' }));
            setState({ url, failed: false });
          })
          .catch(() => alive && setState({ url: '', failed: true }));
        return () => {
          alive = false;
          if (url) URL.revokeObjectURL(url);
        };
      }, [id]);
      if (state.failed) return h('div', { className: 'dsh-dg-foot' }, 'The picture is no longer available here. If it was saved, open the file.');
      if (!state.url) return h('div', { className: 'dsh-dg-foot' }, 'Loading the picture…');
      return h('div', { className: 'dsh-dg-pic', 'data-big': String(big), onClick: () => setBig(!big), title: big ? 'Click to fit' : 'Click for full size' }, h('img', { src: state.url, alt: 'Diagram' }));
    }

    /** The row the chat shows for a `diagram_draw` call. */
    function DiagramRow(props) {
      const text = textOf(props.block ?? props.call ?? props);
      const id = /Diagram id: ([0-9a-f]{12})/.exec(text)?.[1];
      const title = /Drawn: (.+?) \((?:flow|tree|sequence|timeline|chart), \d+ × \d+\)/.exec(text)?.[1];
      const file = /Saved as: (.+)/.exec(text)?.[1]?.trim();
      const problems = Number(/Problems to fix \((\d+)\)/.exec(text)?.[1] ?? 0);
      const refused = /Nothing was drawn\.[\s\S]*?(?=$)/.exec(text)?.[0];
      const waiting = !id && !refused && (props.phase === 'preparing' || props.phase === 'running' || !/switched off|could not be drawn/.test(text));
      return h(
        'div',
        { className: 'dsh-dg-card', 'data-tool': 'diagram_draw' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-dg-head' },
          h('span', { className: 'dsh-dg-name' }, id ? title || 'Diagram' : waiting ? 'Drawing a diagram…' : 'Diagram not drawn'),
          problems > 0 ? h('span', { className: 'dsh-dg-warn', title: 'The model was told what to fix' }, `${problems} thing${problems === 1 ? '' : 's'} to fix`) : null,
          file ? h(ui.CopyButton, { text: file, label: 'Copy file path', title: file }) : null,
        ),
        id ? h(Picture, { id }) : null,
        file ? h('div', { className: 'dsh-dg-foot' }, file) : null,
        !id && !waiting ? h('pre', { className: 'dsh-dg-text' }, (refused ?? text).slice(0, 900)) : null,
      );
    }

    /** Turn -> its drawings, so scrolling back and forth does not ask the server again. */
    const turnCache = new Map();

    /**
     * Under a finished turn: the diagrams drawn in it. The app folds a turn's tool steps away
     * once the turn is done, so without this a diagram would be hidden behind "Completed".
     */
    function TurnDiagrams({ sessionId, turn }) {
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const key = `${sessionId}|${from}|${to}`;
      const [items, setItems] = useState(turnCache.get(key) ?? null);
      useEffect(() => {
        if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
        if (turnCache.has(key)) {
          setItems(turnCache.get(key));
          return undefined;
        }
        let alive = true;
        fetch(new URL('dsh-diagram/list', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-session': sessionId, 'x-dsh-from': String(from), 'x-dsh-to': String(to) } })
          .then((response) => (response.ok ? response.json() : { items: [] }))
          .then((data) => {
            const list = Array.isArray(data.items) ? data.items : [];
            turnCache.set(key, list);
            if (turnCache.size > 400) turnCache.delete(turnCache.keys().next().value);
            if (alive) setItems(list);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [key]);
      if (!items || items.length === 0) return null;
      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        items.map((item) =>
          h(
            'div',
            { className: 'dsh-dg-card', key: item.id },
            h(
              'div',
              { className: 'dsh-dg-head' },
              h('span', { className: 'dsh-dg-name' }, item.title || 'Diagram'),
              item.problems > 0 ? h('span', { className: 'dsh-dg-warn', title: 'The check found something the model did not fix' }, `${item.problems} thing${item.problems === 1 ? '' : 's'} not fixed`) : null,
              item.file ? h(ui.CopyButton, { text: item.file, label: 'Copy file path', title: item.file }) : null,
            ),
            h(Picture, { id: item.id }),
            item.file ? h('div', { className: 'dsh-dg-foot' }, item.file) : null,
          ),
        ),
      );
    }

    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw dshKit.fail('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, children }) {
      return h('div', { className: 'dshu-row' }, h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), hint ? h('div', { className: 'dshu-rowdesc' }, hint) : null), children);
    }

    /** A text field that saves when you leave it or press Enter. */
    function NameField({ value, label, onCommit }) {
      const [draft, setDraft] = useState(value);
      useEffect(() => setDraft(value), [value]);
      const commit = () => {
        const next = draft.trim();
        if (next && next !== value) onCommit(next);
        else setDraft(value);
      };
      return h('input', { className: 'dsh-dg-field', value: draft, 'aria-label': label, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => event.key === 'Enter' && commit() });
    }

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, details: error.details ?? '', error: true }));
        return () => {
          alive.current = false;
        };
      }, [appCtx]);
      if (!settings) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Diagrams'), h('p', { className: 'dshu-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const value = settings.value;
      const set = async (field, next) => {
        try {
          const saved = await mutateSettings(appCtx, [{ op: 'set', path: [field], value: next }], settings.revision);
          if (!alive.current) return;
          setSettings(saved);
          setNote({ text: 'Saved.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      return h(
        'div',
        { className: 'dshu-page' },
        h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Diagrams'),
        h('p', { className: 'dshu-desc' }, 'Lets the model draw accurate diagrams. The model only describes what is in the diagram; the layout, the drawing and a check for overlaps are done for it. The picture appears in the chat where it was drawn. Nothing is installed and nothing leaves this Mac.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        h('div', { className: 'dshu-group' }, 'What it can draw'),
        h(
          'ul',
          { className: 'dsh-dg-list' },
          h('li', null, 'Flowcharts and concept maps: boxes joined by labelled arrows, with groups and decisions.'),
          h('li', null, 'Trees and mind maps: one root that branches out.'),
          h('li', null, 'Sequences: who tells whom what, in order. Timelines: events in order.'),
          h('li', null, 'Charts: bars and lines over names, points and lines over numbers, and plots of formulas such as x^2 - 3.'),
        ),
        h('p', { className: 'dshu-desc' }, 'Ask for one in plain words, for example "Draw a flowchart of how a bill becomes law" or "Plot sin(x) and cos(x) from 0 to 2 pi".'),

        h('div', { className: 'dshu-group' }, 'Settings'),
        h(Row, { title: 'Use the diagram builder', hint: 'Off makes the tool answer that it is switched off.' }, h(Switch, { checked: value.enabled !== false, label: 'Use the diagram builder', onChange: (next) => set('enabled', next) })),
        h(Row, { title: 'Save each diagram as a file', hint: 'As an SVG picture in the conversation\'s folder. Off shows it in the chat only.' }, h(Switch, { checked: value.save !== false, label: 'Save each diagram as a file', onChange: (next) => set('save', next) })),
        h(Row, { title: 'Folder name', hint: 'The folder inside the conversation\'s folder that pictures are saved in.' }, h(NameField, { value: typeof value.folder === 'string' && value.folder ? value.folder : 'diagrams', label: 'Folder name', onCommit: (next) => set('folder', next) })),
        h(
          Row,
          { title: 'Colours of the saved file', hint: 'Automatic follows light or dark mode of whatever shows the file. The picture in the chat always matches the app.' },
          h('select', { className: 'dsh-dg-field', value: value.theme ?? 'auto', 'aria-label': 'Colours of the saved file', onChange: (event) => set('theme', event.target.value) }, h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'light' }, 'Light'), h('option', { value: 'dark' }, 'Dark')),
        ),

        h('div', { className: 'dshu-group' }, 'Good to know'),
        h(
          'ul',
          { className: 'dsh-dg-list' },
          h('li', null, 'A diagram is only as right as what the model put in it. The drawing is exact; the content still needs your eye.'),
          h('li', null, 'If the check finds overlaps or crossings, the model is told and usually draws it again. A small note on the picture says how many things it was told to fix.'),
          h('li', null, 'Click a picture in the chat to see it at full size.'),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('diagram', DICT));
        const t = ctx.locale.bind('diagram');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'diagram', order: 540, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx }))),
        );
        // Under each finished turn: the diagrams drawn in it.
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-diagram' }, (props) => h(TurnDiagrams, props))));
        // The chat's own row for a diagram_draw call: the picture, not a line of text.
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'diagram_draw' }, DiagramRow)));
      },
    };
  },
});
