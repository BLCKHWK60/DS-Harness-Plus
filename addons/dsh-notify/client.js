/**
 * Notify, browser half: the settings for "run a command when a turn ends or the app waits for you".
 * With Automations (Alerts) installed this is a group on the Alerts page; on its own it is the
 * Settings > Notify page. The commands run in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-notify',
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
    dshUi.ensureStyle();
/* dsh-merge:begin */
/* Shared by the add-ons whose settings pages are merged (host page shows partner parts). Keep every copy identical. */
const dshMerge = (() => {
  const reg = (window.__dshMerge = window.__dshMerge || { hosts: {}, parts: {}, want: {}, subs: new Set() });
  const tell = () => { for (const fn of [...reg.subs]) { try { fn(); } catch {} } };
  const api = {
    /** A host page announces itself; the returned function withdraws it. */
    host(hostId) {
      reg.hosts[hostId] = (reg.hosts[hostId] || 0) + 1;
      tell();
      let done = false;
      return () => { if (done) return; done = true; reg.hosts[hostId] -= 1; if (!reg.hosts[hostId]) delete reg.hosts[hostId]; tell(); };
    },
    hasHost: (hostId) => Boolean(reg.hosts[hostId]),
    /** A partner offers a part ({label: () => string, order, render: (props) => element}) to a host page. */
    part(hostId, partId, spec) {
      const list = (reg.parts[hostId] = reg.parts[hostId] || {});
      list[partId] = spec;
      tell();
      return () => { if (list[partId] === spec) { delete list[partId]; tell(); } };
    },
    parts: (hostId) => Object.entries(reg.parts[hostId] || {}).map(([id, spec]) => ({ id, ...spec })).sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    subscribe(fn) { reg.subs.add(fn); return () => reg.subs.delete(fn); },
    /** Settings search asks a host page to show one tab ('main' or a part id). */
    openTab(hostId, tabId) { reg.want[hostId] = tabId; tell(); },
    /** React hook: the host's current tab ('main' first), and a setter. Re-renders when parts or hosts change. */
    useTab(React, hostId, first = 'main') {
      const [tab, setTab] = React.useState(first);
      const [, bump] = React.useState(0);
      React.useEffect(() => api.subscribe(() => {
        const wanted = reg.want[hostId];
        if (wanted) { delete reg.want[hostId]; setTab(wanted); }
        bump((n) => n + 1);
      }), []);
      React.useEffect(() => { const wanted = reg.want[hostId]; if (wanted) { delete reg.want[hostId]; setTab(wanted); } }, []);
      const ids = ['main', ...api.parts(hostId).map((p) => p.id)];
      return [ids.includes(tab) ? tab : 'main', setTab];
    },
    /** A partner shows its own page only while no host page shows it. `register()` registers the page and returns its remover. */
    ownPageUnlessHosted(hostId, register) {
      let off;
      const sync = () => {
        const need = !api.hasHost(hostId);
        if (need && !off) off = register();
        else if (!need && off) { off(); off = undefined; }
      };
      sync();
      const unsub = api.subscribe(sync);
      return () => { unsub(); if (off) { off(); off = undefined; } };
    },
  };
  return api;
})();
/* dsh-merge:end */

    const NS = 'notify';
    const DICT = {
      en: { 'section.title': 'Notify' },
      zh: { 'section.title': '通知命令' },
    };
    const PlainNote = dshKit.makeNote(React);

    const CSS = `
.dsh-nt-warn { margin: 10px 0 0; padding: 8px 12px; border-radius: 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, transparent) 8%, transparent); }
.dsh-nt-card { margin: 12px 0 0; padding: 16px; border-radius: 20px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; }
.dsh-nt-cardhead { display: flex; align-items: center; gap: 10px; }
.dsh-nt-cardtitle { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-nt-cardtitle small { margin-left: 8px; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.dsh-nt-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-nt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.dsh-nt-field, .dsh-nt-text { box-sizing: border-box; width: 100%; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-nt-field { height: 36px; padding: 0 14px; }
.dsh-nt-text { padding: 8px 14px; font: 13px/20px ui-monospace, Menlo, monospace; resize: vertical; min-height: 84px; }
.dsh-nt-field:focus, .dsh-nt-text:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-nt-small { width: 90px; text-align: right; flex: none; }
.dsh-nt-btns { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-nt-btn { height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-nt-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-nt-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-nt-btn[data-danger="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-nt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-nt-chip { height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dsh-nt-chip[aria-pressed="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.dsh-nt-more { align-self: flex-start; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); text-decoration: underline; }
.dsh-nt-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    const REASONS = [['completed', 'Finished'], ['error', 'Stopped with an error'], ['aborted', 'Cancelled'], ['blocked', 'Blocked'], ['interrupted', 'Interrupted']];
    const TRIGGERS = { turnEnd: 'When a turn ends', approval: 'When the app waits for my approval' };
    /** A starting command for a macOS banner; the message comes from the environment, so nothing typed can run as code. */
    const MAC_COMMAND = ['osascript', '-e', 'display notification (system attribute "DSH_NOTIFY_MESSAGE") with title "DeepSeek Harness"'];

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
      if (!result.ok && result.error?.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    /** Why a rule cannot be saved, in plain words; '' when it can. */
    function problemWith(rule) {
      if (!Array.isArray(rule.command) || !rule.command.length || !String(rule.command[0]).trim()) return 'Write the program to run on the first line.';
      if (rule.on === 'turnEnd' && !(rule.reasons ?? []).length) return 'Choose at least one way a turn can end.';
      return '';
    }
    const toLines = (command) => (Array.isArray(command) ? command.map(String).join('\n') : '');
    const fromLines = (text) => String(text).split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line.trim().length > 0);

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }
    function Row({ title, hint, children }) {
      return h('div', { className: 'dshu-row' }, h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), hint ? h('div', { className: 'dshu-rowdesc' }, hint) : null), children);
    }
    /** A number box saved when you leave it. */
    function NumberBox({ value, label, min, max, onCommit, className }) {
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const commit = () => {
        const n = Math.min(max, Math.max(min, Math.floor(Number(draft))));
        if (!Number.isFinite(n)) { setDraft(String(value)); return; }
        setDraft(String(n));
        if (n !== value) onCommit(n);
      };
      return h('input', { className: className ?? 'dsh-nt-field dsh-nt-small', inputMode: 'numeric', value: draft, 'aria-label': label, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); } });
    }

    /** One rule: what starts it and the command it runs. `onChange(next)` saves; `onRemove()` deletes it. */
    function RuleCard({ rule, onChange, onRemove, error }) {
      const [lines, setLines] = useState(toLines(rule.command));
      const [more, setMore] = useState(false);
      useEffect(() => setLines(toLines(rule.command)), [rule.command]);
      const reasons = rule.reasons ?? ['completed', 'error'];
      const toggle = (key) => onChange({ ...rule, reasons: reasons.includes(key) ? reasons.filter((r) => r !== key) : [...reasons, key] });
      return h('div', { className: 'dsh-nt-card' },
        h('div', { className: 'dsh-nt-cardhead' },
          h('div', { className: 'dsh-nt-cardtitle' }, TRIGGERS[rule.on] ?? rule.on),
          h('button', { type: 'button', className: 'dsh-nt-btn', 'data-danger': 'true', onClick: onRemove }, 'Remove')),
        rule.on === 'turnEnd' ? h('div', { className: 'dsh-nt-label' }, 'Run it when the turn ended like this',
          h('div', { className: 'dsh-nt-chips' }, REASONS.map(([key, text]) => h('button', { key, type: 'button', className: 'dsh-nt-chip', 'aria-pressed': reasons.includes(key), onClick: () => toggle(key) }, text)))) : null,
        h('label', { className: 'dsh-nt-label' }, 'Command: one part per line, the program first',
          h('textarea', { className: 'dsh-nt-text', rows: 4, spellCheck: false, value: lines, 'aria-label': 'Command, one part per line', placeholder: 'program\nfirst part\nsecond part',
            onChange: (event) => setLines(event.target.value),
            onBlur: () => { const next = fromLines(lines); if (JSON.stringify(next) !== JSON.stringify(rule.command)) onChange({ ...rule, command: next }); } })),
        h('div', { className: 'dsh-nt-btns' },
          h('button', { type: 'button', className: 'dsh-nt-btn', onClick: () => { setLines(MAC_COMMAND.join('\n')); onChange({ ...rule, command: [...MAC_COMMAND] }); } }, 'Fill in a Mac notification'),
          h('span', { className: 'dshu-desc' }, 'The text of the alert reaches the command as DSH_NOTIFY_MESSAGE.')),
        error ? h(PlainNote, { text: error, kind: 'error' }) : null,
        h('button', { type: 'button', className: 'dsh-nt-more', 'aria-expanded': more, onClick: () => setMore(!more) }, more ? 'Fewer options' : 'More options'),
        more ? h('div', { className: 'dsh-nt-grid' },
          rule.on === 'turnEnd' ? h('div', { className: 'dsh-nt-label' }, 'Only when the turn took at least (seconds)', h(NumberBox, { value: Number(rule.minSeconds) || 0, min: 0, max: 86400, label: 'Seconds', onCommit: (n) => onChange({ ...rule, minSeconds: n }) })) : null,
          h('div', { className: 'dsh-nt-label' }, 'At least this many seconds between two runs', h(NumberBox, { value: Number(rule.minIntervalSeconds ?? 5), min: 0, max: 86400, label: 'Seconds between runs', onCommit: (n) => onChange({ ...rule, minIntervalSeconds: n }) })),
          h('div', { className: 'dsh-nt-label' }, 'Stop the command after (milliseconds)', h(NumberBox, { value: Number(rule.timeoutMs) || 5000, min: 500, max: 60000, label: 'Milliseconds', onCommit: (n) => onChange({ ...rule, timeoutMs: n }) })),
          h('div', { className: 'dsh-nt-label' }, 'Also for helper agents', h(Switch, { on: rule.topLevelOnly === false, label: 'Also for helper agents', onChange: (on) => onChange({ ...rule, topLevelOnly: !on }) }))) : null);
    }

    /** The content: used inside the Alerts page and on the Notify page. */
    function NotifyPanel({ appCtx, hosted }) {
      const [state, setState] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [rowError, setRowError] = useState({});
      const alive = useRef(true);
      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx).then((next) => { if (alive.current) setState(next); }).catch((error) => { if (alive.current) setNote({ text: error.message, details: error.details ?? '', error: true }); });
        return () => { alive.current = false; };
      }, []);
      if (!state) return h('div', { className: 'dshu-page' }, h('style', null, CSS), note.text ? h(PlainNote, { text: note.text, kind: 'error' }) : h('p', { className: 'dshu-desc' }, 'Loading…'));
      const rules = Array.isArray(state.value.rules) ? state.value.rules : [];
      const save = async (field, value) => {
        try {
          const next = await mutateSettings(appCtx, [{ op: 'set', path: [field], value }], state.revision);
          if (!alive.current) return;
          setState(next);
          setNote({ text: 'Saved.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: error.message, details: error.details ?? '', error: true });
        }
      };
      const saveRules = (next, index) => {
        const bad = index == null ? '' : problemWith(next[index]);
        setRowError(index == null ? {} : { [index]: bad });
        if (bad) return; // not saved until the rule can run
        save('rules', next);
      };
      const nameFor = (on) => {
        const base = on === 'approval' ? 'approval' : 'turn-end';
        let id = base;
        for (let n = 2; rules.some((rule) => rule.id === id); n += 1) id = `${base}-${n}`;
        return id;
      };
      const add = (on) => saveRules([...rules, { id: nameFor(on), on, reasons: ['completed', 'error'], minSeconds: 0, topLevelOnly: true, minIntervalSeconds: 5, timeoutMs: 5000, command: [...MAC_COMMAND] }]);
      const remove = async (index) => {
        const ok = await dshDialog({ title: 'Remove this rule?', text: 'The command is no longer run for it. You can add it again later.', ok: 'Remove', danger: true });
        if (ok) saveRules(rules.filter((_, i) => i !== index));
      };
      return h('div', { className: 'dshu-page' },
        h('style', null, CSS),
        hosted ? null : h('h2', { className: 'dshu-title' }, 'Notify'),
        h('p', { className: 'dshu-desc' }, 'Run your own program when a turn ends or when the app waits for your approval, for example to show a banner or play a sound. Nothing is set up until you add a rule.'),
        h('div', { className: 'dsh-nt-warn', role: 'note' }, 'A rule runs a program on this Mac, with your permissions. Only use programs you trust. The text it gets never has your instructions or the answer in it.'),
        note.text ? h('div', { style: { marginTop: 8 } }, h(PlainNote, { text: note.text, kind: note.error ? 'error' : 'status' })) : null,
        h(Row, { title: 'Run commands', hint: 'Off keeps your rules but runs none of them.' }, h(Switch, { on: state.value.enabled !== false, label: 'Run commands', onChange: (on) => save('enabled', on) })),
        h(Row, { title: 'Most runs per minute', hint: 'All rules together. Stops a flood if something goes wrong.' }, h(NumberBox, { value: Number(state.value.maxPerMinute) || 20, min: 1, max: 600, label: 'Most runs per minute', onCommit: (n) => save('maxPerMinute', n) })),
        rules.length ? null : h('p', { className: 'dshu-desc', style: { marginTop: 12 } }, 'No rules yet.'),
        rules.map((rule, index) => h(RuleCard, { key: `${rule.id}-${index}`, rule, error: rowError[index], onChange: (next) => saveRules(rules.map((one, i) => (i === index ? next : one)), index), onRemove: () => remove(index) })),
        h('div', { className: 'dsh-nt-btns', style: { marginTop: 12 } },
          h('button', { type: 'button', className: 'dsh-nt-btn', 'data-main': 'true', onClick: () => add('turnEnd') }, 'Add: when a turn ends'),
          h('button', { type: 'button', className: 'dsh-nt-btn', 'data-main': 'true', onClick: () => add('approval') }, 'Add: when the app waits for my approval')),
        h('ul', { className: 'dsh-nt-list' },
          h('li', null, 'The alert text is short and fixed, for example "Finished in <folder>". Your prompt and the answer are never in it.'),
          h('li', null, 'Changes apply at once. A command that fails or runs too long is stopped and noted in the log; it never holds up your work.'),
          h('li', null, 'Type /notify test in a conversation to try your rules with a sample alert.')));
    }

    const dshDialog = (options) => dshKit.ask(options);

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        // A part for the Alerts page; the same panel is this add-on's own page when Alerts is not installed.
        ctx.effect(() => dshMerge.part('alerts', 'notify', { label: () => 'When a turn ends or the app waits for you', order: 200, render: (props) => h(NotifyPanel, { ...props, appCtx: ctx, hosted: true }) }));
        ctx.effect(() => dshMerge.ownPageUnlessHosted('alerts', () => ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'notify', order: 431, label: () => t('section.title') }, (props) => h(NotifyPanel, { ...props, appCtx: ctx }))),
        )));
      },
    };
  },
});
