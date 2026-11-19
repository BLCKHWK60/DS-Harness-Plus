/**
 * Settings helper, browser half.
 *   - Groups: the Plus pages are numbered in groups (100 Tabs and modes, 200 Models, ...); the first
 *     page of each group shows a heading above it in the left list, drawn through the per-page icon
 *     seat (`settings.section.icon`). The app's own pages stay first, under "App".
 *   - Icons: every Plus page gets its own icon instead of the same gear.
 *   - Search: a field in the window's header (`settings.action`) that finds any setting by its name,
 *     description or related words, opens its page and highlights it. Cmd-F (Ctrl-F) jumps into it.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-settings-plus',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

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

    /** The groups, in order, and their pages in order (the left list shows them under these headings; saved settings are never renamed). */
    const GROUPS = [
      { label: 'Everyday', pages: ['start-here', 'color-schemes', 'activity', 'alerts', 'notify', 'diagram', 'artifacts'] },
      { label: 'Models and spending', pages: ['model-tiers', 'role-prompts', 'sampling-presets', 'budget', 'usage-ledger', 'model-arena', 'benchmark', 'tuning'] },
      { label: 'Modes and tabs', pages: ['modes', 'cowork-start', 'finance', 'data', 'scout', 'content', 'bench', 'creator-plus', 'split-plus'] },
      { label: 'Agents and code', pages: ['mission', 'agent-swarm', 'code-map', 'code-power'] },
      { label: 'Research and sources', pages: ['web-sources', 'research', 'deep-research', 'library', 'pdf'] },
      { label: 'Privacy and safety', pages: ['tool-access', 'mac', 'recon'] },
      { label: 'Learning', pages: ['memory', 'learn', 'evolve', 'skill-architect'] },
      { label: 'Add-ons and updates', pages: ['about-plus'] },
      { label: 'Advanced', pages: ['more-settings'] },
    ];
    /** Line icons, 24x24, drawn with the current colour. */
    const ICONS = {
      modes: 'M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z',
      // A globe: the Web selector's sources.
      'web-sources': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9',
      research: 'M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM14.5 14.5L20 20M7 10h6M10 7v6',
      finance: 'M4 18l5-6 4 3 7-9M15 6h5v5',
      data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
      scout: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM15.5 8.5l-2 5-5 2 2-5z',
      'tool-access': 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3M12 14.5v2.5',
      recon: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM9.5 12l2 2 3.5-4',
      content: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4M12 20h8',
      bench: 'M8 8h8v8H8zM10 8V4M14 8V4M10 20v-4M14 20v-4M8 10H4M8 14H4M20 10h-4M20 14h-4',
      'creator-plus': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4zM18 3v4M16 5h4',
      'split-plus': 'M3 4h18v16H3zM12 4v16',
      artifacts: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
      'model-tiers': 'M5 18h14M7 14h10M9 10h6M11 6h2',
      'sampling-presets': 'M5 7h9M18 7h1M5 12h3M12 12h7M5 17h11M20 17h-1M16 5v4M10 10v4M18 15v4',
      'model-arena': 'M6 4l5 5M18 4l-5 5M6 20l12-12M18 20L6 8M4 6l2-2M20 6l-2-2',
      benchmark: 'M4 19h16M7 16V10M12 16V6M17 16v-4',
      budget: 'M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3 4 1.1 4 3-1.8 3-4 3-4-1.1-4-3',
      'usage-ledger': 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
      mission: 'M5 21V4h11l-2 4 2 4H5',
      'agent-swarm': 'M12 5a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM6 15a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM18 15a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM11 9l-4 6M13 9l4 6M8 17h8',
      evolve: 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4',
      alerts: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
      memory: 'M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
      library: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.8 1-3.9 14.7-3.8-1',
      pdf: 'M6 3h9l3 3v15H6zM15 3v3h3M9 13h6M9 17h4M9 9h2',
      'code-map': 'M9 8l-4 4 4 4M15 8l4 4-4 4M13 5l-2 14',
      diagram: 'M4 4h6v5H4zM14 15h6v5h-6zM14 4h6v5h-6zM7 9v5h7M17 9v6',
      learn: 'M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5M21 9v6',
      'color-schemes': 'M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-1.4-1-1.7-1-2.7 0-.9.8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01',
      activity: 'M3 12h4l3-7 4 14 3-7h4',
      mac: 'M4 5h16v11H4zM9 20h6M12 16v4',
      'about-plus': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v6M12 7.5v.01',
      'start-here': 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
      'more-settings': 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M14 5v4M8 10v4M16 15v4',
      // Pages that sit inside a merged page (shown on their own only when their partner is missing).
      'deep-research': 'M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM14.5 14.5L20 20M7 10h6',
      'role-prompts': 'M5 6h14M5 11h14M5 16h9',
      'code-power': 'M9 8l-4 4 4 4M15 8l4 4-4 4M13 5l-2 14',
      notify: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
      tuning: 'M5 7h9M18 7h1M5 12h3M12 12h7M5 17h11M20 17h-1M16 5v4M10 10v4M18 15v4',
    };

    const CSS = `
[data-shortcut-modal="settings"] nav > div::before { content: "App"; display: block; padding: 2px 12px 2px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
[data-shortcut-modal="settings"] nav button:has([data-sp-head]) { position: relative; margin-top: 26px; }
[data-sp-head] { position: absolute; left: 12px; top: -22px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); white-space: nowrap; pointer-events: none; }
@media (max-width: 767px) {
  [data-shortcut-modal="settings"] nav > div::before { display: none; }
  [data-shortcut-modal="settings"] nav button:has([data-sp-head]) { margin-top: 0; }
  [data-sp-head] { display: none; }
}
.dsh-sg-find { position: relative; display: inline-flex; align-items: center; }
.dsh-sg-find input { box-sizing: border-box; width: 260px; height: 28px; padding: 0 30px 0 30px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); outline: none; }
.dsh-sg-find input:focus { border-color: var(--dsw-alias-brand-primary); }
.dsh-sg-find .glass { position: absolute; left: 10px; top: 7px; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.dsh-sg-find .key { position: absolute; right: 10px; top: 6px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.dsh-sg-drop { position: absolute; top: 34px; right: 0; z-index: 60; box-sizing: border-box; width: 420px; max-width: calc(100vw - 40px); max-height: min(60vh, 520px); overflow-y: auto; padding: 6px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); box-shadow: 0 10px 34px rgba(0,0,0,.3); }
.dsh-sg-drop button { display: block; width: 100%; text-align: left; border: 0; border-radius: 10px; padding: 7px 10px; background: transparent; font: inherit; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-sg-drop button[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sg-drop .where { display: block; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dsh-sg-drop .name { display: block; font-size: 13px; line-height: 18px; font-weight: 600; }
.dsh-sg-drop .what { display: block; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dsh-sg-drop .tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 10px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dsh-sg-drop .none { padding: 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-sg-drop .note { padding: 8px 10px; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-sg-hit { outline: 2px solid var(--dsw-alias-brand-primary) !important; outline-offset: 4px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent) !important; transition: outline-color .4s ease, background .4s ease; }
.dsh-mg-gear { display: inline-flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-mg-gear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-mg-gear:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-mg-back { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.dsh-mg-pop { display: flex; flex-direction: column; box-sizing: border-box; width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 48px); border-radius: 16px; background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); box-shadow: 0 10px 34px rgba(0,0,0,.3); }
.dsh-mg-head { display: flex; align-items: center; gap: 8px; flex: none; padding: 12px 16px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-mg-head b { font-size: 14px; line-height: 20px; font-weight: 600; }
.dsh-mg-head .grow { flex: 1; }
.dsh-mg-head button { height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.dsh-mg-head button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mg-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px 18px; }
.dsh-mg-body .msg { font-size: 13px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
.dsh-mg-here { margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2); }
.dsh-mg-here:not(:has(button)) { display: none; }
.dsh-mg-here .head { margin: 0 0 8px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-mg-here .dsh-fn-chat { display: inline-flex !important; }
.dsh-mg-here .host { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
html[data-dsh-uniform="true"][data-dsh-gear="on"][data-dsh-extras="on"] [data-slot="conversation.input.left"] :is(.dsh-bn-ctl, .dsh-cp-ctl, .dsh-rc-ctl, .dsh-fn-ctls) { display: none !important; }
body[data-dsh-mg-open] :is(.dsh-bn-pop, .dsh-cp-pop, .dsh-rs-pop, .dsh-fn-pop, .dsh-rc-door) { position: fixed !important; left: 50% !important; top: 50% !important; bottom: auto !important; right: auto !important; transform: translate(-50%, -50%); max-height: calc(100vh - 48px) !important; z-index: 1100 !important; }
.dsh-xp-pop { width: min(560px, calc(100vw - 32px)); }
.dsh-xp-body { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px 16px; overflow: auto; font-size: 13px; line-height: 19px; }
.dsh-xp-body h4 { margin: 0 0 6px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-xp-level { display: flex; align-items: flex-start; gap: 8px; width: 100%; box-sizing: border-box; padding: 8px 10px; margin: 0 0 6px; text-align: left; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsh-xp-level[aria-checked="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.dsh-xp-level b { display: block; font-weight: 600; }
.dsh-xp-level span { display: block; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 17px; }
.dsh-xp-formats { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-xp-formats button, .dsh-xp-actions button { height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.dsh-xp-formats button[aria-checked="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.dsh-xp-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-xp-actions button.main { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); font-weight: 600; }
.dsh-xp-actions button:disabled { opacity: .5; cursor: default; }
.dsh-xp-note { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 17px; }
[data-shortcut-modal="settings"] nav button:has([data-sp-tier])::after { content: ""; flex: none; box-sizing: border-box; width: 8px; height: 8px; margin-left: auto; border-radius: 50%; border: 1.5px solid var(--dsw-alias-label-secondary); }
[data-shortcut-modal="settings"] nav button:has([data-sp-tier="experimental"])::after { border-color: var(--dsw-alias-state-warn-primary); background: var(--dsw-alias-state-warn-primary); }
html[data-dsh-sp-view="simple"] [data-shortcut-modal="settings"] nav button:has([data-sp-page]:not([data-sp-simple])):not([aria-current="true"]) { display: none; }
.dsh-sh-seg { display: inline-flex; align-items: center; padding: 2px; border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-sh-seg button { height: 24px; padding: 0 12px; border: 0; border-radius: 12px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-sh-seg button[aria-checked="true"] { background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); }
.dsh-sh-seg button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-sh-card { box-sizing: border-box; padding: 0 14px; border-radius: 20px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); }
.dsh-sh-fit { flex: none; min-width: 200px; max-width: 100%; }
.dsh-sh-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sh-warn { margin-top: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-warn-primary); }
.dsh-sh-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
@media (max-width: 640px) { .dsh-sh-stack { align-items: flex-start; } }
.dsh-sx-area { height: auto; min-width: 260px; padding: 8px 14px; line-height: 20px; resize: vertical; font-family: inherit; }
.dsh-sx-find { width: 100%; margin-top: 12px; }
.dsh-sh-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-sh-ask { width: min(420px, calc(100vw - 32px)); }
.dsh-sh-asktext { margin: 0 0 14px; font-size: 14px; line-height: 21px; }
.dsh-sr-pop { width: min(640px, calc(100vw - 32px)); }
.dsh-sr-steps { display: flex; flex-direction: column; gap: 10px; }
.dsh-sr-step { display: flex; gap: 12px; padding: 12px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-sr-num { flex: none; width: 24px; height: 24px; border-radius: 12px; text-align: center; font-size: 12px; line-height: 24px; font-weight: 600; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); color: var(--dsw-alias-brand-primary); }
.dsh-sr-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 13px; line-height: 19px; }
.dsh-sr-text b { font-weight: 600; font-size: 14px; }
.dsh-sr-text > span { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-sr-act { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-sr-pick[aria-checked="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.dsh-sr-card { position: fixed; right: 16px; top: 56px; z-index: 900; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; width: 340px; max-width: calc(100vw - 32px); padding: 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 19px; box-shadow: 0 10px 34px color-mix(in srgb, #000 28%, transparent); }
.dsh-sr-card b { font-size: 14px; font-weight: 600; }
.dsh-sr-card > span { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
`;
    let styled = false;
    const addStyle = () => {
      if (styled || typeof document === 'undefined') return;
      styled = true;
      const node = document.createElement('style');
      node.setAttribute('data-dsh-settings-plus', '');
      // The left list's order follows GROUPS, whatever order each add-on gave its page (CSS order: the list is a column).
      let order = 0;
      const rules = GROUPS.flatMap((group) => group.pages.map((id) => `[data-shortcut-modal="settings"] nav button:has([data-sp-page="${id}"]) { order: ${(order += 1)}; }`)).join('\n');
      node.textContent = `${CSS}\n${rules}`;
      document.head.appendChild(node);
    };

    const groupOf = (id) => GROUPS.find((group) => group.pages.includes(id));

    /** A Plus page's icon in the left list, and the group heading above the first page of a group. */
    /** A saved file an add-on could not read was kept aside under a new name: told once, then the list is cleared. */
    async function showDamagedNotice() {
      try {
        const response = await fetch(new URL('dsh-settings-plus/index?notices=1', document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
        const data = response.ok ? await response.json() : {};
        const list = Array.isArray(data.damaged) ? data.damaged : [];
        if (list.length === 0 || document.querySelector('[data-dsh-damaged-notice]')) return;
        const card = document.createElement('div');
        card.setAttribute('data-dsh-damaged-notice', '');
        card.setAttribute('role', 'alert');
        card.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2000;max-width:420px;padding:12px 14px;border-radius:14px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 8px 28px rgba(0,0,0,.28)';
        const text = document.createElement('div');
        const names = list.slice(0, 4).map((one) => String(one.label)).join(', ') + (list.length > 4 ? ` and ${list.length - 4} more` : '');
        text.textContent = `Plus could not read a saved file (${names}). It was damaged, so it was kept aside under a new name next to the original, and Plus started a new one. Nothing was deleted: the old file can still be recovered by hand. You are told this once.`;
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = 'OK';
        ok.style.cssText = 'margin-top:8px;cursor:pointer';
        ok.onclick = () => { card.remove(); void fetch(new URL('dsh-settings-plus/index?notices=told', document.baseURI), { cache: 'no-store', credentials: 'same-origin' }).catch(() => {}); };
        card.appendChild(text);
        card.appendChild(ok);
        document.body.appendChild(card);
      } catch { /* a notice is a nicety */ }
    }

    function PageIcon({ appCtx, id, size }) {
      addStyle();
      const tiers = useTiers();
      const group = groupOf(id);
      let head = '';
      if (group) {
        let present = [];
        try {
          present = appCtx.slots.entriesOfSlot('settings.section').map((entry) => entry.options?.id);
        } catch {
          present = [];
        }
        if (group.pages.find((page) => present.includes(page)) === id) head = group.label;
      }
      const d = ICONS[id] ?? 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z';
      // The label (Beta, Experimental) of the add-on the page belongs to; Core pages carry none. The left list shows it as a small tag.
      const tier = tiers[PAGE_ADDON[id]];
      const tagged = tier && (tier.tier === 'beta' || tier.tier === 'experimental') ? tier : undefined;
      // The full word on hover (a dot in the list never cuts the page's name).
      const mark = useRef(null);
      useEffect(() => {
        const button = mark.current?.closest?.('button');
        if (!button) return undefined;
        if (tagged) button.setAttribute('title', `${tagged.label}: this add-on is ${String(tagged.label).toLowerCase()}`); else button.removeAttribute('title');
        return () => button.removeAttribute('title');
      }, [tagged?.label]);
      return h(React.Fragment, null,
        h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ref: mark, 'data-sp-page': id, 'data-sp-simple': SIMPLE_PAGES.includes(id) ? '' : undefined, 'data-sp-tier': tagged?.tier, 'data-sp-tier-label': tagged?.label }, h('path', { d })),
        head ? h('span', { 'data-sp-head': head }, head) : null);
    }

    // ---- search -------------------------------------------------------------------------------------

    let indexLoad;
    /** Recon is its own download: while it is not installed, its settings are left out of search (`recon` is false then). */
    const visibleEntries = (entries, recon) => (recon === false ? entries.filter((entry) => entry.page !== 'recon' && !String(entry.field ?? '').startsWith('recon.')) : entries);

    const loadIndex = () => {
      if (!indexLoad) {
        indexLoad = fetch(new URL('dsh-settings-plus/index', document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : { entries: [] }))
          .catch(() => ({ entries: [] }));
      }
      return indexLoad;
    };

    /** The switches the chat box reads: the gear, the Export button, and a mode's extras living in the gear's popup. */
    function useFlags() {
      const [flags, setFlags] = useState({ gear: false, exportOn: false, extras: false });
      useEffect(() => {
        let alive = true;
        void loadIndex().then((data) => {
          const on = data.enabled !== false;
          if (alive) setFlags({ gear: on && data.modeGear !== false, exportOn: on && data.exportButton !== false, extras: on && data.modeGear !== false && data.extrasInGear !== false });
        });
        return () => { alive = false; };
      }, []);
      return flags;
    }

    const words = (text) => String(text ?? '').toLowerCase().split(/[\s,./()·:;"'-]+/).filter(Boolean);

    /** Entries that match every word typed, best first. */
    function rank(entries, query) {
      const typed = words(query);
      if (typed.length === 0) return [];
      const q = String(query).trim().toLowerCase();
      const scored = [];
      for (const entry of entries) {
        const label = entry.label.toLowerCase();
        const hay = `${label} ${entry.heading} ${entry.pageLabel} ${entry.description} ${(entry.keywords ?? []).join(' ')} ${entry.field}`.toLowerCase();
        if (!typed.every((word) => hay.includes(word))) continue;
        let score = 0;
        if (label === q) score += 200;
        else if (label.startsWith(q)) score += 120;
        else if (label.includes(q)) score += 70;
        for (const word of typed) {
          if (words(label).includes(word)) score += 15;
          else if (label.includes(word)) score += 8;
          if (entry.pageLabel.toLowerCase().includes(word)) score += 4;
          if ((entry.keywords ?? []).some((key) => key.toLowerCase() === word)) score += 6;
        }
        if (entry.kind === 'page') score += 30;
        if (entry.configOnly) score -= 25;
        scored.push({ entry, score });
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, 14).map((item) => item.entry);
    }

    /** The Settings window's own store: select a page, close the window. */
    function settingsStore(appCtx) {
      try {
        const entry = appCtx.slots.entries('sidebar.settings').find((item) => item.store);
        return entry?.store?.create?.();
      } catch {
        return undefined;
      }
    }

    /** Open a page: through the window's store, else by clicking its row. */
    function openPage(appCtx, id, label) {
      const store = settingsStore(appCtx);
      if (typeof store?.actions?.select === 'function') {
        store.actions.select(id);
        return true;
      }
      const rows = [...document.querySelectorAll('[data-shortcut-modal="settings"] nav button')];
      const row = rows.find((button) => button.textContent.trim().replace(/^[A-Z ]+(?=[A-Z][a-z])/, '') === label) ?? rows.find((button) => button.textContent.includes(label));
      if (row) {
        row.click();
        return true;
      }
      return false;
    }

    /** Find the setting's text on the open page, scroll to it and mark it for a moment. */
    function highlight(label, tries = 0) {
      const root = document.querySelector('[data-shortcut-modal="settings"] [data-slot="settings.section"]')?.parentElement
        ?? document.querySelector('[data-shortcut-modal="settings"]');
      if (!root || !label) return;
      const want = label.trim().toLowerCase();
      let found;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text) continue;
        if (text === want) {
          found = node;
          break;
        }
        if (!found && want.length >= 6 && text.startsWith(want)) found = node;
      }
      if (!found) {
        if (tries < 25) setTimeout(() => highlight(label, tries + 1), 100);
        return;
      }
      let element = found.parentElement;
      // Mark the row the label belongs to when it is a small one, else the label itself.
      const row = element?.closest('label, [role="switch"], .dsh-fn-row, .dsh-sc-row, .dsh-rs-row, [class*="row"], [class*="Row"], [class*="item"], [class*="Item"]');
      if (row && row.getBoundingClientRect().height < 220 && row !== root) element = row;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('dsh-sg-hit');
      setTimeout(() => element.classList.remove('dsh-sg-hit'), 2600);
    }

    /** The search field in the Settings window's header. */
    function SearchField({ appCtx }) {
      addStyle();
      const [index, setIndex] = useState({ entries: [], enabled: true });
      const [query, setQuery] = useState('');
      const [open, setOpen] = useState(false);
      const [pick, setPick] = useState(0);
      const [note, setNote] = useState('');
      const input = useRef(null);
      const box = useRef(null);
      useEffect(() => {
        let alive = true;
        void loadIndex().then((data) => { if (alive) setIndex({ entries: visibleEntries(Array.isArray(data.entries) ? data.entries : [], data.recon), enabled: data.enabled !== false }); });
        // Cmd-F (Ctrl-F) while Settings is open goes to the field.
        const onKey = (event) => {
          if ((event.metaKey || event.ctrlKey) && !event.altKey && String(event.key).toLowerCase() === 'f' && document.querySelector('[data-shortcut-modal="settings"]')) {
            event.preventDefault();
            input.current?.focus();
            input.current?.select();
          }
        };
        const away = (event) => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', away, true);
        return () => { alive = false; document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', away, true); };
      }, []);

      // The pages there are now, by id and label: a result for a page that is not there is left out.
      let pages = [];
      try {
        pages = appCtx.slots.entriesOfSlot('settings.section').map((entry) => ({ id: entry.options?.id, label: typeof entry.options?.label === 'function' ? String(entry.options.label()) : String(entry.options?.label ?? entry.options?.id ?? '') }));
      } catch {
        pages = [];
      }
      const present = new Set(pages.map((page) => page.id));
      const pageEntries = pages.map((page) => ({ page: page.id, pageLabel: page.label, heading: '', label: page.label, description: groupOf(page.id)?.label ?? 'App', keywords: [page.id], kind: 'page', configOnly: false, field: '', where: '' }));
      const usable = useMemo(() => [...pageEntries, ...index.entries.filter((entry) => entry.configOnly || entry.where === 'plugins-panel' || present.has(entry.page) || (entry.host && present.has(entry.host)))], [index.entries, pages.length]);
      const results = useMemo(() => rank(usable, query), [usable, query]);
      if (!index.enabled) return null;

      const choose = (entry) => {
        setNote('');
        if (entry.where === 'plugins-panel') {
          const store = settingsStore(appCtx);
          store?.actions?.close?.();
          try { appCtx.layout.selectPanel('plugins'); } catch { /* no Plugins panel in this app version */ }
          return;
        }
        // A setting of a merged page: the page that shows it now (its own, or the host's with the right tab open).
        const target = present.has(entry.page) || !(entry.host && present.has(entry.host)) ? entry.page : entry.host;
        const wantTab = entry.tab && (entry.host ? target === entry.host : true) ? entry.tab : '';
        // The Simple list hides most pages: a result on one of them switches to Advanced first.
        const reveal = (id) => { if (viewState.value === 'simple' && !SIMPLE_PAGES.includes(id)) void saveView(appCtx, 'advanced'); };
        if (entry.configOnly) {
          // A setting with no control on any page has one on the More settings page (when its add-on is on).
          void (async () => {
            let drawn = false;
            try { drawn = moreRows(await readSettings(appCtx), [entry]).rows.length > 0; } catch { drawn = false; }
            if (drawn) {
              setOpen(false);
              reveal('more-settings');
              if (openPage(appCtx, 'more-settings', 'More settings')) setTimeout(() => jumpTo(entry.field), 150);
              return;
            }
            setNote(`"${entry.label}" has no control on any page. Change it in the configuration file: "Open configuration file" at the top right of Settings${entry.field ? `, field ${entry.field}` : ''}.`);
            if (present.has(target)) openPage(appCtx, target, entry.pageLabel);
          })();
          return;
        }
        setOpen(false);
        reveal(target);
        if (wantTab) dshMerge.openTab(target, wantTab);
        if (openPage(appCtx, target, entry.pageLabel) && entry.kind !== 'page') setTimeout(() => highlight(entry.label), wantTab ? 450 : 120);
      };
      const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setPick((n) => Math.min(n + 1, Math.max(results.length - 1, 0))); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setPick((n) => Math.max(n - 1, 0)); }
        else if (event.key === 'Enter') { event.preventDefault(); if (results[pick]) choose(results[pick]); }
        else if (event.key === 'Escape' && (query || open)) {
          // Clear the field first; a second Escape closes Settings as usual.
          event.preventDefault();
          event.stopPropagation();
          setQuery('');
          setOpen(false);
          setNote('');
        }
      };
      const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');
      return h('span', { className: 'dsh-sg-find', ref: box },
        h('svg', { className: 'glass', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l4.5 4.5' })),
        h('input', {
          ref: input, type: 'search', value: query, placeholder: 'Search settings', 'aria-label': 'Search settings', spellCheck: false, autoComplete: 'off',
          role: 'combobox', 'aria-expanded': open && query.trim() !== '', 'aria-controls': 'dsh-sg-results',
          onChange: (event) => { setQuery(event.target.value); setPick(0); setOpen(true); setNote(''); },
          onFocus: () => setOpen(true),
          onKeyDown,
        }),
        query ? null : h('span', { className: 'key', 'aria-hidden': true }, isMac ? '⌘F' : 'Ctrl F'),
        open && query.trim()
          ? h('div', { className: 'dsh-sg-drop', id: 'dsh-sg-results', role: 'listbox', 'aria-label': 'Settings found' },
            results.length === 0 ? h('div', { className: 'none' }, `Nothing found for "${query.trim()}".`) : null,
            results.map((entry, n) => h('button', {
              key: `${entry.page}|${entry.label}|${n}`, type: 'button', role: 'option', 'aria-selected': n === pick,
              onMouseEnter: () => setPick(n), onClick: () => choose(entry),
            },
            h('span', { className: 'where' }, entry.kind === 'page' ? `Page · ${entry.description}` : [entry.pageLabel, entry.heading].filter(Boolean).join(' › ')),
            h('span', { className: 'name' }, entry.label,
              entry.configOnly ? h('span', { className: 'tag' }, 'More settings') : null,
              entry.where === 'plugins-panel' ? h('span', { className: 'tag' }, 'Plugins page') : null),
            entry.description && entry.kind !== 'page' ? h('span', { className: 'what' }, entry.description) : null)),
            note ? h('div', { className: 'note', role: 'status' }, note) : null)
          : null);
    }

    // ---- the gear beside Send: the current mode's settings in a popup -------------------------------

    /** The mode whose settings page is its own; any other mode (Chat, Cowork, Code, yours) uses Modes. */
    const MODE_PAGES = { data: 'data', recon: 'recon', scout: 'scout', finance: 'finance', content: 'content', bench: 'bench', 'creator-plus': 'creator-plus', research: 'research', automations: 'alerts' };

    const readObject = (value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    };

    /**
     * The mode a conversation is in, from Modes' settings value: the conversation's own choice, else the
     * default (on the start page, the selected tab).
     * @param {object} view - the Modes settings value.
     * @param {string} [sessionId] - the open conversation, if any.
     * @returns {{id: string, label: string}} the mode.
     */
    function modeOf(view, sessionId) {
      const labels = {};
      for (const source of [readObject(view?.extraModes), readObject(view?.modes)]) {
        for (const [id, value] of Object.entries(source)) labels[id] = value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id;
      }
      const ids = Object.keys(labels);
      const chosen = sessionId ? readObject(view?.sessionModes)[sessionId] : undefined;
      const id = [chosen, view?.defaultMode].find((one) => typeof one === 'string' && (ids.includes(one) || one in { chat: 1, cowork: 1, code: 1 })) ?? 'cowork';
      const plain = { chat: 'Chat', cowork: 'Cowork', code: 'Code' };
      return { id, label: labels[id] ?? plain[id] ?? id };
    }

    /**
     * The mode with a given name, as the Modes add-on reports it for a conversation.
     * @param {object} view - the Modes settings value.
     * @param {unknown} label - a mode's name.
     * @returns {{id: string, label: string} | undefined} the mode, or undefined when no mode has that name.
     */
    function modeNamed(view, label) {
      if (typeof label !== 'string' || !label) return undefined;
      for (const source of [readObject(view?.modes), readObject(view?.extraModes)]) {
        for (const [id, value] of Object.entries(source)) {
          const name = value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id;
          if (name === label) return { id, label: name };
        }
      }
      return ['chat', 'cowork', 'code'].map((id) => ({ id, label: { chat: 'Chat', cowork: 'Cowork', code: 'Code' }[id] })).find((one) => one.label === label);
    }

    /**
     * The Settings page that holds a mode's settings.
     * @param {string} modeId - the mode.
     * @param {string[]} present - ids of the pages that exist.
     * @returns {string | undefined} a page id, or undefined when there is none.
     */
    function pageForMode(modeId, present) {
      const own = MODE_PAGES[modeId];
      if (own && present.includes(own)) return own;
      return present.includes('modes') ? 'modes' : undefined;
    }

    /** A broken page must not take the chat box down with it. */
    class PageBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? h('p', { className: 'msg' }, 'This page could not be shown here. Use "Open in Settings".') : this.props.children;
      }
    }

    /** Open the Settings window on a page. */
    if (typeof window !== 'undefined') (window.__dshSettingsPlus = window.__dshSettingsPlus || {}).openPage = (appCtx, id, label) => openSettingsOn(appCtx, id, label);
    function openSettingsOn(appCtx, id, label) {
      const store = settingsStore(appCtx);
      const actions = store?.actions;
      if (typeof actions?.openSection === 'function') {
        actions.openSection(id);
        return true;
      }
      if (typeof actions?.open === 'function') {
        actions.open();
        if (typeof actions.select === 'function') actions.select(id);
        return true;
      }
      return openPage(appCtx, id, label);
    }

    /**
     * The buttons a mode adds to the chat box (Devices rules, Creator Plus, Finance, Recon's export door), by their slot id.
     * Research's Focus is gone: it is the Web selector's ticks now (18 November 2026). Creator Plus's bar is not here
     * either: a choice only that mode has and needs, it is a strip right above the chat box (dsh-creator-plus, 18 November 2026).
     * The same for Finance's selection (dsh-finance, the owner's answer of 18 November 2026). Recon's Export… is here only
     * while the shared Export button is off: with it on, that button opens Recon's own export window.
     */
    const HOSTED = ['bench-rules', 'recon-export'];

    /** A button of another add-on that fails must not take this window down. */
    class Quiet extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    /**
     * The mode's own buttons for this conversation, in one place: each is the add-on's own component,
     * given this conversation, so it works the same here as it did in the chat box. Shows nothing when
     * the mode has none.
     */
    function HostedControls({ appCtx, sessionId, title = 'In this conversation', only, skip = [] }) {
      let entries = [];
      try {
        entries = appCtx.slots.entriesOfSlot('conversation.input.left').filter((entry) => HOSTED.includes(entry.options?.id) && (!only || only.includes(entry.options?.id)) && !skip.includes(entry.options?.id));
      } catch {
        entries = [];
      }
      if (entries.length === 0) return null;
      return h('div', { className: 'dsh-mg-here', 'data-dsh-mg-here': '' },
        h('div', { className: 'head' }, title),
        h('div', { className: 'host' }, entries.map((entry) => h(Quiet, { key: entry.options.id }, h(entry.component, { sessionId })))));
    }

    /** While a window of ours is open, a button of another add-on that opens its own panel opens it in the middle of the screen. */
    function useWindowOpen() {
      useEffect(() => {
        document.body.setAttribute('data-dsh-mg-open', '');
        return () => document.body.removeAttribute('data-dsh-mg-open');
      }, []);
    }

    function ModePopup({ appCtx, mode, page, pageLabel, onClose, sessionId, exportOn = false }) {
      useWindowOpen();
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      let entry;
      try {
        entry = appCtx.slots.entriesOfSlot('settings.section').find((one) => one.options?.id === page);
      } catch {
        entry = undefined;
      }
      const Page = entry?.component;
      const popup = h('div', { className: 'dsh-mg-back', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'dsh-mg-pop', role: 'dialog', 'aria-modal': true, 'aria-label': `${mode.label} settings`, 'data-dsh-mg-pop': page },
          h('div', { className: 'dsh-mg-head' },
            h('b', null, `${mode.label} settings`),
            h('span', { className: 'grow' }),
            // The Web selector's settings, shared by every mode (lists, saved selections, your own other sources).
            h('button', { type: 'button', 'data-dsh-mg-web': '', onClick: () => { onClose(); openSettingsOn(appCtx, 'web-sources', 'Web sources'); } }, 'Web sources…'),
            h('button', { type: 'button', onClick: () => { onClose(); openSettingsOn(appCtx, page, pageLabel); } }, 'Open in Settings'),
            h('button', { type: 'button', onClick: onClose }, 'Close')),
          h('div', { className: 'dsh-mg-body' },
            // Recon's Export… lives behind the shared Export button while that button is on (the owner's answer of 18 November 2026).
            h(HostedControls, { appCtx, sessionId, skip: exportOn ? ['recon-export'] : [] }),
            Page ? h(PageBoundary, null, h(Page, { close: onClose })) : h('p', { className: 'msg' }, 'This mode has no settings page here.'))));
      return ReactDOM.createPortal(popup, document.body);
    }

    /** The small gear beside Send. */
    function ModeGear({ appCtx, sessionId }) {
      addStyle();
      const flags = useFlags();
      const on = flags.gear;
      const [popup, setPopup] = useState(null);
      // The chat box's CSS reads these: a mode's extras leave the box only when the gear that now holds them is there.
      useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-dsh-gear', on ? 'on' : 'off');
        root.setAttribute('data-dsh-extras', flags.extras ? 'on' : 'off');
        return () => {
          root.removeAttribute('data-dsh-gear');
          root.removeAttribute('data-dsh-extras');
        };
      }, [on, flags.extras]);
      const close = useCallback(() => setPopup(null), []);
      if (!on) return null;
      const open = async () => {
        let mode = { id: 'cowork', label: 'Cowork' };
        try {
          const result = await appCtx.remote.settings.describe();
          const view = result.ok ? result.value.namespaces.find((item) => item.ns === 'modes')?.value : undefined;
          mode = modeOf(view, sessionId);
          // The Modes add-on knows best: a conversation with no message yet follows the selected tab, whatever was stored.
          if (sessionId) {
            const said = await fetch(new URL('dsh-modes/tools', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-session': sessionId } }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
            mode = (said?.known === true ? modeNamed(view, said.mode) : undefined) ?? mode;
          }
        } catch {
          /* Modes is not there: the page list below decides what is shown. */
        }
        let pages = [];
        try {
          pages = appCtx.slots.entriesOfSlot('settings.section').map((entry) => ({ id: entry.options?.id, label: typeof entry.options?.label === 'function' ? String(entry.options.label()) : String(entry.options?.label ?? entry.options?.id ?? '') }));
        } catch {
          pages = [];
        }
        const page = pageForMode(mode.id, pages.map((one) => one.id));
        if (!page) return;
        setPopup({ mode, page, pageLabel: pages.find((one) => one.id === page)?.label ?? page });
      };
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-mg-gear', 'data-dsh-mg-gear': '', title: 'Settings for this mode', 'aria-label': 'Settings for this mode', onClick: () => void open() },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 1.9 1.5a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z' }))),
        popup ? h(ModePopup, { appCtx, mode: popup.mode, page: popup.page, pageLabel: popup.pageLabel, onClose: close, sessionId, exportOn: flags.exportOn }) : null);
    }

    // ---- the Export button beside the gear: this conversation as a file -------------------------------

    const EXPORT_LEVELS = [
      ['conversation', 'Conversation only', 'Your messages and the assistant\'s replies.'],
      ['thinking', 'Conversation and thinking', 'The same, with the assistant\'s thinking blocks before each reply.'],
      ['full', 'Full session log', 'Everything the app stored: the model and its settings, the instructions (system prompt), your messages, thinking, every tool call and its result, other log events, and the raw log as stored (JSON). Nothing is left out or hidden; for finding out what went wrong later.'],
    ];
    const EXPORT_FORMATS = [['md', 'Markdown'], ['txt', 'Plain text'], ['html', 'HTML'], ['json', 'JSON'], ['pdf', 'PDF']];

    const exportUrl = (sessionId, level, format, extra = '') => new URL(`dsh-settings-plus/export?session=${encodeURIComponent(sessionId)}&level=${level}&format=${format === 'pdf' ? 'html' : format}${extra}`, document.baseURI);

    function ExportDialog({ appCtx, sessionId, onClose }) {
      const [level, setLevel] = useState('conversation');
      const [format, setFormat] = useState('md');
      // Review H10: keys and passwords are hidden by default in the full log (and can be left in on purpose).
      const [hide, setHide] = useState(false);
      const [info, setInfo] = useState(null);
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(false);
      useWindowOpen();
      // The full session log hides keys and passwords until you untick it; the other levels leave the box as you set it.
      useEffect(() => { setHide(level === 'full'); }, [level]);
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      useEffect(() => {
        let alive = true;
        setInfo(null);
        setNote('');
        fetch(exportUrl(sessionId, level, format, `&hide=${hide ? 1 : 0}&info=1`), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => response.json().catch(() => ({ ok: false, reason: 'The export could not be prepared.' })))
          .then((data) => { if (alive) setInfo(data); })
          .catch(() => { if (alive) setInfo({ ok: false, reason: 'The export could not be prepared.' }); });
        return () => { alive = false; };
      }, [sessionId, level, format, hide]);
      const fetchText = async () => {
        const response = await fetch(exportUrl(sessionId, level, format, `&hide=${hide ? 1 : 0}`), { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('The export failed.');
        return response.text();
      };
      const download = () => {
        const link = document.createElement('a');
        link.href = String(exportUrl(sessionId, level, format, `&hide=${hide ? 1 : 0}`));
        link.setAttribute('download', info?.filename ?? '');
        document.body.appendChild(link);
        link.click();
        link.remove();
        setNote(`Download started: ${info?.filename ?? 'the file'}. It goes to your Downloads folder.`);
      };
      const printPdf = async () => {
        setBusy(true);
        try {
          const html = await fetchText();
          const frame = document.createElement('iframe');
          frame.setAttribute('aria-hidden', 'true');
          frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
          document.body.appendChild(frame);
          frame.srcdoc = html;
          frame.onload = () => {
            try {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            } finally {
              setTimeout(() => frame.remove(), 60000);
            }
          };
          setNote('The print window is open: choose "Save as PDF" there.');
        } catch (problem) {
          setNote(problem.message);
        }
        setBusy(false);
      };
      const copy = async () => {
        setBusy(true);
        try {
          await navigator.clipboard.writeText(await fetchText());
          setNote('Copied to the clipboard.');
        } catch {
          setNote('Could not copy. Use Download instead.');
        }
        setBusy(false);
      };
      const raw = () => {
        const link = document.createElement('a');
        link.href = String(new URL(`api/session.export?sessionId=${encodeURIComponent(sessionId)}&includeDescendants=true`, document.baseURI));
        document.body.appendChild(link);
        link.click();
        link.remove();
        setNote('The complete stored log (with its sub-conversations and attachments) is downloading as a ZIP.');
      };
      const blocked = info && info.ok === false;
      const size = info?.size ? (info.size > 1048576 ? `${(info.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(info.size / 1024))} KB`) : '';
      const dialog = h('div', { className: 'dsh-mg-back', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'dsh-mg-pop dsh-xp-pop', role: 'dialog', 'aria-modal': true, 'aria-label': 'Export this conversation', 'data-dsh-xp': '' },
          h('div', { className: 'dsh-mg-head' },
            h('b', null, 'Export this conversation'),
            h('span', { className: 'grow' }),
            h('button', { type: 'button', onClick: onClose }, 'Close')),
          h('div', { className: 'dsh-xp-body' },
            info?.isolated
              ? h(React.Fragment, null,
                h('div', { className: 'dsh-xp-note' }, info.reason),
                h(HostedControls, { appCtx, sessionId, title: 'This tab\'s own export', only: ['recon-export'] }))
              : h(React.Fragment, null,
                h('div', null,
                  h('h4', null, 'How much'),
                  h('div', { role: 'radiogroup', 'aria-label': 'How much to export' }, EXPORT_LEVELS.map(([id, name, about]) => h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': level === id, className: 'dsh-xp-level', 'data-level': id, onClick: () => setLevel(id) }, h('div', null, h('b', null, name), h('span', null, about)))))),
                h('div', null,
                  h('h4', null, 'File type'),
                  h('div', { className: 'dsh-xp-formats', role: 'radiogroup', 'aria-label': 'File type' }, EXPORT_FORMATS.map(([id, name]) => h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': format === id, 'data-format': id, onClick: () => setFormat(id) }, name))),
                  format === 'pdf' ? h('div', { className: 'dsh-xp-note' }, 'Opens your print window; choose "Save as PDF" there.') : null),
                level === 'full' ? h('div', { className: 'dsh-xp-note', 'data-xp-warning': '' }, 'Careful: the full session log holds everything the app stored. That can include keys, passwords, tokens, private files you opened and text you pasted. Look at it before you share it.') : null,
                h('label', { className: 'dsh-xp-note', style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('input', { type: 'checkbox', checked: hide, onChange: (event) => setHide(event.target.checked), 'data-xp-hide': '' }), 'Hide keys and passwords (also e-mail addresses and your home folder\'s name)'),
                h('div', { className: 'dsh-xp-actions' },
                  format === 'pdf'
                    ? h('button', { type: 'button', className: 'main', disabled: busy || blocked || !info, onClick: () => void printPdf(), 'data-xp-go': 'pdf' }, 'Make PDF')
                    : h('button', { type: 'button', className: 'main', disabled: busy || blocked || !info, onClick: download, 'data-xp-go': 'download' }, 'Download'),
                  format === 'pdf' ? null : h('button', { type: 'button', disabled: busy || blocked || !info, onClick: () => void copy(), 'data-xp-go': 'copy' }, 'Copy to clipboard'),
                  h('span', { className: 'dsh-xp-note' }, blocked ? info.reason : info ? `${info.title}${size ? ` · ${size}` : ''}` : 'Preparing…')),
                h('div', { className: 'dsh-xp-note' }, 'Also: the app\'s own complete archive. The log exactly as stored, with its sub-conversations and attachments, as a ZIP. Nothing is hidden in the ZIP, so it can hold keys and passwords.',
                  ' ', h('button', { type: 'button', style: { height: 24, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }, onClick: raw, 'data-xp-go': 'zip' }, 'Download the ZIP'))),
            note ? h('div', { className: 'dsh-xp-note', role: 'status' }, note) : null)));
      return ReactDOM.createPortal(dialog, document.body);
    }

    /**
     * Recon's own export window, opened by the shared Export button (the owner's answer of 18 November 2026: one Export).
     * Recon's door listens for this event (Split Plus's Send to uses it too); while its window is open it sits in the middle
     * of the screen (data-dsh-mg-open), and this holder goes when that window closes.
     */
    function ReconExportHolder({ sessionId, onClose }) {
      useWindowOpen();
      useEffect(() => {
        window.dispatchEvent(new CustomEvent('dsh-split-plus:recon-export', { detail: { sessionId } }));
        let seen = false;
        const started = Date.now();
        const timer = setInterval(() => {
          const shown = Boolean(document.querySelector('.dsh-rc-door'));
          if (shown) seen = true;
          if ((seen && !shown) || (!seen && Date.now() - started > 3000)) onClose();
        }, 250);
        return () => clearInterval(timer);
      }, [sessionId, onClose]);
      return null;
    }

    /** The Export button beside the gear: the same place in every mode. */
    function ExportButton({ appCtx, sessionId }) {
      addStyle();
      const flags = useFlags();
      const [open, setOpen] = useState(false);
      const close = useCallback(() => setOpen(false), []);
      if (!flags.exportOn || !sessionId) return null;
      // A Recon conversation (its door is in this chat box): Recon's own export window, with its choices (report or
      // notes, where to, folder). Anything else: the shared export window.
      const press = () => setOpen(document.querySelector('[data-slot="conversation.input.left"] .dsh-rc-ctl') ? 'recon' : 'shared');
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-mg-gear', 'data-dsh-export': '', title: 'Export this conversation', 'aria-label': 'Export this conversation', onClick: press },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14' }))),
        open === 'recon' ? h(ReconExportHolder, { sessionId, onClose: close }) : open ? h(ExportDialog, { appCtx, sessionId, onClose: close }) : null);
    }

    // ---- Simple / Advanced view, settings access, and the pure helpers the new pages use ------------------

    /** The pages the Simple view keeps in the left list. Every other Plus page is hidden there (not removed): the page you are on stays shown. */
    const SIMPLE_PAGES = ['start-here', 'about-plus'];

    /** Which add-on folder each Plus page belongs to (for the Core / Beta / Experimental label). */
    const PAGE_ADDON = {
      modes: 'dsh-modes', 'web-sources': 'dsh-modes', 'cowork-start': 'dsh-cowork-shell', research: 'dsh-research', 'deep-research': 'dsh-deep-research', finance: 'dsh-finance', data: 'dsh-data', scout: 'dsh-scout', recon: 'dsh-recon', content: 'dsh-content', bench: 'dsh-bench', 'creator-plus': 'dsh-creator-plus', 'split-plus': 'dsh-split-plus',
      'model-tiers': 'dsh-model-tiers', 'role-prompts': 'dsh-role-prompts', 'sampling-presets': 'dsh-sampling-presets', 'model-arena': 'dsh-model-arena', benchmark: 'dsh-benchmark', tuning: 'dsh-tuning', budget: 'dsh-budget', 'usage-ledger': 'dsh-usage-ledger',
      mission: 'dsh-mission', 'agent-swarm': 'dsh-agent-swarm', evolve: 'dsh-evolve', 'skill-architect': 'dsh-skill-architect', alerts: 'dsh-automations', notify: 'dsh-notify', memory: 'dsh-memory', library: 'dsh-library', pdf: 'dsh-pdf', 'code-map': 'dsh-code-map', 'code-power': 'dsh-code-power', diagram: 'dsh-diagram', learn: 'dsh-learn', artifacts: 'dsh-artifacts',
      'color-schemes': 'dsh-color-schemes', activity: 'dsh-activity', mac: 'dsh-mac', 'tool-access': 'dsh-modes', 'about-plus': 'dsh-settings-plus', 'start-here': 'dsh-settings-plus', 'more-settings': 'dsh-settings-plus',
    };

    const viewState = { value: 'advanced', subs: new Set() };
    /** Set the view in this window at once (the saved choice is written separately). */
    function setViewLocal(value) {
      viewState.value = value === 'simple' ? 'simple' : 'advanced';
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-dsh-sp-view', viewState.value);
      for (const fn of [...viewState.subs]) { try { fn(); } catch { /* a listener must not stop the others */ } }
    }
    function useView() {
      const [value, set] = useState(viewState.value);
      useEffect(() => {
        const fn = () => set(viewState.value);
        viewState.subs.add(fn);
        fn();
        return () => { viewState.subs.delete(fn); };
      }, []);
      return value;
    }

    /** Extra rows another add-on can put on the Start here page (the Tool permissions row later): `window.__dshSettingsPlus.addSimpleRow({ id, order, render })`. */
    const simpleRows = (typeof window !== 'undefined' ? ((window.__dshSettingsPlus = window.__dshSettingsPlus || {}).rows = window.__dshSettingsPlus.rows || new Map()) : new Map());
    const rowListeners = typeof window !== 'undefined' ? (((window.__dshSettingsPlus = window.__dshSettingsPlus || {}).rowListeners = window.__dshSettingsPlus.rowListeners || new Set())) : new Set();
    const rowsChanged = () => { for (const fn of [...rowListeners]) { try { fn(); } catch { /* one page's trouble must not stop the rest */ } } };
    if (typeof window !== 'undefined') {
      (window.__dshSettingsPlus = window.__dshSettingsPlus || {}).addSimpleRow = (spec) => { if (spec && spec.id) { simpleRows.set(spec.id, spec); rowsChanged(); } return () => { if (simpleRows.get(spec.id) === spec) { simpleRows.delete(spec.id); rowsChanged(); } }; };
    }

    /** A saved setting, found by its path in the settings the app reports (`value` is what is in force, `user` is what the person saved). */
    const pathGet = (object, path) => path.reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), object);

    /** The node of one setting in an add-on's schema, or undefined. */
    function schemaNode(view, path) {
      const schema = view?.schema;
      if (!schema?.refs) return undefined;
      let node = schema.refs[schema.uid];
      for (const key of path) {
        const id = node?.dict?.[key];
        node = id === undefined ? undefined : schema.refs[id];
        if (!node) return undefined;
      }
      return node;
    }

    /** How a setting is edited: a switch, number, text, choice, lines (a list of text) or json (anything else, as text). */
    function controlOf(view, node) {
      if (!node || node.type === 'object') return undefined;
      const refs = view.schema.refs;
      const meta = node.meta ?? {};
      if (node.type === 'boolean') return { t: 'boolean' };
      if (node.type === 'number') return { t: 'number', min: typeof meta.min === 'number' ? meta.min : undefined, max: typeof meta.max === 'number' ? meta.max : undefined, step: typeof meta.step === 'number' ? meta.step : undefined };
      if (node.type === 'string') return { t: 'text' };
      if (node.type === 'union' && Array.isArray(node.list) && node.list.length > 0 && node.list.every((id) => refs[id]?.type === 'const')) return { t: 'choice', options: node.list.map((id) => refs[id].value) };
      if (node.type === 'array' && refs[node.inner]?.type === 'string') return { t: 'lines' };
      return { t: 'json' };
    }

    /** A setting that can weaken a safety rule: its name starts with danger, allow, anywhere or trusted (or says unsafe or bypass). */
    const isRisky = (field) => PROGRAM_FIELDS.includes(String(field)) || String(field).split('.').some((part) => /^(danger|allow|anywhere|trusted)/i.test(part) || /(unsafe|bypass|unrestricted)/i.test(part));

    /** Settings that say which program the add-on starts or which address it talks to: a wrong value runs or contacts something else, so they ask first. */
    const PROGRAM_FIELDS = ['recon.torPath', 'recon.wireproxyPath', 'recon.engineHost', 'recon.otherEngine', 'engines.opencodePath', 'context-saver.python', 'sync.gitBin', 'sync.ageBin'];

    /**
     * A second filter, by name, for records an add-on keeps for itself (a choice per conversation, a one-time marker). The search
     * index marks them `internal` too; this catches one that was added without the mark. Resetting such a record by hand can undo
     * a protection (the list of conversations that began in Recon, for example), so the page never offers them.
     */
    const INTERNAL_NAME = /^(session(?!Root|Dir|Folder|Path)[A-Z]|sessions?$|.*(Migrated|Cleared|Moved|Added|Marker|Pending|Seen)$|webMarks|extraModes$)/;
    const isInternalField = (field) => String(field).split('.').slice(1).some((part) => INTERNAL_NAME.test(part)) && !/^settings-plus\.view$/.test(String(field));

    /**
     * The settings that have no control on any page, as rows the "More settings" form can draw.
     * @param {object[]} namespaces - the app's settings (`describe()`).
     * @param {object[]} entries - the search index.
     * @returns {{rows: object[], off: number, skipped: number}} rows (each with its add-on's heading), how many belong to add-ons that are switched off, and how many have no box this page can draw.
     */
    function moreRows(namespaces, entries) {
      const rows = [];
      let off = 0;
      let skipped = 0;
      const seen = new Set();
      for (const entry of entries) {
        if (entry.configOnly !== true || entry.internal === true || !entry.field || entry.where === 'plugins-panel' || seen.has(entry.field) || isInternalField(entry.field)) continue;
        const [ns, ...rest] = entry.field.split('.');
        const view = namespaces.find((one) => one.ns === ns);
        if (!view) { off += 1; continue; }
        const node = schemaNode(view, rest);
        const control = controlOf(view, node);
        if (!control) { skipped += 1; continue; }
        seen.add(entry.field);
        rows.push({ field: entry.field, ns, path: rest, group: entry.pageLabel || ns, label: entry.label, about: entry.description.replace(/\s*(Only in the configuration file|Configuration file only)\.?\s*$/i, '').trim(), control, risky: isRisky(entry.field), view });
      }
      rows.sort((a, b) => a.group.localeCompare(b.group) || 0);
      return { rows, off, skipped };
    }

    /** What a row's text box says, as the value to save, or a plain sentence saying why it cannot be saved. */
    function parseEdit(control, text) {
      if (control.t === 'number') {
        const n = Number(String(text).replace(/[,\s]/g, ''));
        if (String(text).trim() === '' || !Number.isFinite(n)) return { error: 'Type a number.' };
        if (control.min !== undefined && n < control.min) return { error: `The smallest value is ${control.min}.` };
        if (control.max !== undefined && n > control.max) return { error: `The largest value is ${control.max}.` };
        return { value: control.step === 1 ? Math.round(n) : n };
      }
      if (control.t === 'lines') return { value: String(text).split('\n').map((line) => line.trim()).filter(Boolean) };
      if (control.t === 'json') {
        try {
          return { value: JSON.parse(String(text).trim() === '' ? 'null' : text) };
        } catch {
          return { error: 'That is not written correctly, so it was not saved. Check the brackets and quotes.' };
        }
      }
      return { value: String(text) };
    }

    const showValue = (control, value) => (control.t === 'lines' ? (Array.isArray(value) ? value.join('\n') : '') : control.t === 'json' ? (value === undefined ? '' : JSON.stringify(value, null, 1)) : value === undefined || value === null ? '' : String(value));

    const SAME = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    async function readSettings(appCtx) {
      const result = await appCtx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      return result.value.namespaces;
    }

    /** Save changes to one add-on's settings: `ops` are `{op: 'set', path, value}` or `{op: 'unset', path}`. A plain sentence is thrown when it fails. */
    async function writeSettings(appCtx, ns, ops) {
      const revision = async () => {
        const view = (await readSettings(appCtx)).find((one) => one.ns === ns);
        if (!view) throw dshKit.fail('not mounted');
        return view.revision;
      };
      let result = await appCtx.remote.settings.mutate(ns, ops, await revision());
      if (!result.ok && result.error?.code === 'settings/conflict') result = await appCtx.remote.settings.mutate(ns, ops, await revision());
      if (!result.ok) throw dshKit.fail(result.error);
    }

    /** Change the Simple / Advanced choice here and save it. */
    async function saveView(appCtx, value) {
      setViewLocal(value);
      indexLoad = undefined; // the next read of the list sees the saved choice
      try {
        await writeSettings(appCtx, 'settings-plus', [{ op: 'set', path: ['view'], value }]);
      } catch { /* the choice still holds in this window */ }
    }

    /** Close Settings and open the Plugins panel (where add-ons are switched on and off). */
    function openPlugins(appCtx) {
      settingsStore(appCtx)?.actions?.close?.();
      try { appCtx.layout.selectPanel('plugins'); } catch { /* no Plugins panel in this app version */ }
    }

    // A jump from search to one row of the More settings page: the page reads it when it shows rows.
    const jump = { field: '', subs: new Set() };
    const jumpTo = (field) => { jump.field = field; for (const fn of [...jump.subs]) fn(); };

    /** Which add-on label (Core, Beta, Experimental) a page carries, read once. */
    let aboutLoad;
    const loadAbout = () => {
      if (!aboutLoad) {
        aboutLoad = fetch(new URL('dsh-settings-plus/about', document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : { addons: [] }))
          .catch(() => ({ addons: [] }));
      }
      return aboutLoad;
    };
    function useTiers() {
      const [tiers, set] = useState({});
      useEffect(() => {
        let alive = true;
        void loadAbout().then((about) => { if (alive) set(Object.fromEntries((about.addons ?? []).map((one) => [one.folder, { tier: one.tier, label: one.tierLabel }]))); });
        return () => { alive = false; };
      }, []);
      return tiers;
    }

    // ---- small controls in the app's own style (docs/UI-STYLE.md) -------------------------------------

    const Switch = ui.Switch;
    const Btn = ({ children, ...rest }) => h(ui.Button, rest, children);
    /** One row: text on the left (title, then one line of what it does), the control on the right. */
    function Row({ title, desc, warn, children, field, note }) {
      const text = h(React.Fragment, null, desc, warn ? h('div', { className: 'dsh-sh-warn', role: 'note' }, warn) : null, note ? h(NoteLine, { note }) : null);
      return h('div', { 'data-sx-field': field }, h(ui.Row, { title, desc: text }, h(ui.Side, null, children)));
    }
    /** A saved change's result: "Saved." quietly, or a plain sentence with a Details button. */
    function NoteLine({ note }) {
      if (!note) return null;
      return note.error ? h(PlainNote, { error: note.error }) : h(PlainNote, { text: note.text, kind: note.state === 'error' ? 'error' : 'status' });
    }
    function Choice({ value, options, label, onChange, disabled }) {
      return h('select', { className: 'dshu-field dsh-sh-fit', value: String(value), 'aria-label': label, disabled, onChange: (event) => onChange(event.target.value) },
        options.map(([id, name]) => h('option', { key: String(id), value: String(id) }, name)));
    }
    /** A plain yes/no question in the app's style: resolves true or false. Used for settings that can weaken a safety rule. */
    function useConfirm() {
      const [ask, setAsk] = useState(null);
      const confirm = useCallback((text, ok = 'Change it') => new Promise((resolve) => setAsk({ text, ok, resolve })), []);
      const close = (answer) => { ask?.resolve(answer); setAsk(null); };
      const dialog = ask ? ReactDOM.createPortal(h('div', { className: 'dsh-mg-back', onMouseDown: (event) => { if (event.target === event.currentTarget) close(false); } },
        h('div', { className: 'dsh-mg-pop dsh-sh-ask', role: 'alertdialog', 'aria-modal': true, 'aria-label': 'Are you sure?' },
          h('div', { className: 'dsh-mg-body' },
            h('p', { className: 'dsh-sh-asktext' }, ask.text),
            h('div', { className: 'dsh-sh-actions' },
              h(Btn, { onClick: () => close(false), autoFocus: true }, 'Cancel'),
              h(Btn, { main: true, onClick: () => close(true), 'data-sx-confirm': '' }, ask.ok))))), document.body) : null;
      return [confirm, dialog];
    }
    /** "Saved" or a plain problem next to a control, for a moment. */
    function useNote() {
      const [note, set] = useState(null);
      const timer = useRef(0);
      const show = useCallback((text, state = 'ok') => {
        set(text instanceof Error ? { error: text, state: 'error' } : { text, state });
        clearTimeout(timer.current);
        if (state === 'ok') timer.current = setTimeout(() => set(null), 2200);
      }, []);
      useEffect(() => () => clearTimeout(timer.current), []);
      return [note, show];
    }
    /** What a saved change says, in plain words. */
    const plainProblem = (problem) => (problem instanceof Error ? problem : dshKit.fail(problem));

    // ---- the first-run setup card ---------------------------------------------------------------------

    const SPEND_CHOICES = (suggested) => [
      [0, 'No limit'],
      [Math.max(1, Math.round(suggested / 2)), `${(suggested / 2 / 1000000).toLocaleString('en-US')} million tokens a day`],
      [suggested, `${(suggested / 1000000).toLocaleString('en-US')} million tokens a day (suggested)`],
      [suggested * 5, `${(suggested * 5 / 1000000).toLocaleString('en-US')} million tokens a day`],
    ];

    /** The daily spending limit as one choice (No limit is allowed) plus a box for another number. Saved through Budget's own setting. */
    function SpendChoice({ appCtx, suggested, current, onSaved, disabled }) {
      const options = SPEND_CHOICES(suggested);
      const known = options.some(([n]) => n === current);
      const [other, setOther] = useState(false);
      const [draft, setDraft] = useState(known ? '' : String(current || ''));
      const [note, show] = useNote();
      const save = async (value) => {
        try {
          await writeSettings(appCtx, 'budget', [{ op: 'set', path: ['dayTokens'], value }]);
          show('Saved.');
          onSaved?.(value);
        } catch (problem) { show(plainProblem(problem), 'error'); }
      };
      const choose = (raw) => {
        if (raw === 'other') { setOther(true); return; }
        setOther(false);
        void save(Number(raw));
      };
      const commitOther = () => {
        const parsed = parseEdit({ t: 'number', min: 0, step: 1 }, draft);
        if (parsed.error) { show(parsed.error, 'error'); return; }
        void save(parsed.value);
      };
      const showOther = other || !known;
      return h('div', { className: 'dsh-sh-stack' },
        h(Choice, { value: showOther ? 'other' : current, label: 'Daily spending limit', disabled, onChange: choose, options: [...options.map(([n, name]) => [n, name]), ['other', 'Another number…']] }),
        showOther ? h('input', { className: 'dshu-field dsh-sh-fit', inputMode: 'numeric', value: draft, placeholder: 'Tokens a day, for example 3000000', 'aria-label': 'Tokens a day', disabled, onChange: (event) => setDraft(event.target.value), onBlur: commitOther, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); } }) : null,
        note ? h(NoteLine, { note }) : null);
    }

    /** Step 4's sentence, true for a new install and for an existing one (what Tool access does, and what the setting is now). */
    const toolAccessLine = (on) => (on === false
      ? 'Tool access is switched off here, so every tab has exactly the tools it has always had and the AI cannot ask for more. You do not have to do anything. If you want it, switch it on at the top of the Tool access page, then decide tab by tab what is On, what the AI may only ask for, and what is Off.'
      : 'With Tool access on, the AI can see which tools exist and can ask you for one more. A new install starts with accounts and connectors, other Mac apps, and app and plugins on Ask in Cowork and Code, so the AI has to ask you first; every other tool stays as it was. An existing setup keeps the choices it has. You do not have to do anything; the Tool access grid lets you decide tab by tab what is On, Ask or Off.');
    /** The three steps. Nothing here asks for or stores a key: models and keys are added on the app's own Models page. */
    function SetupSteps({ appCtx, onClose }) {
      const view = useView();
      const [data, setData] = useState(null);
      const [namespaces, setNamespaces] = useState([]);
      useEffect(() => {
        let alive = true;
        void loadIndex().then((got) => { if (alive) setData(got); });
        void readSettings(appCtx).then((list) => { if (alive) setNamespaces(list); }).catch(() => {});
        return () => { alive = false; };
      }, []);
      const suggested = data?.setup?.suggested ?? 2000000;
      const budget = namespaces.find((one) => one.ns === 'budget');
      const modesNs = namespaces.find((one) => one.ns === 'modes');
      const toolAccessOn = modesNs ? pathGet(modesNs.value, ['toolAccessOn']) === true : undefined;
      return h('div', { className: 'dsh-sr-steps' },
        h('div', { className: 'dsh-sr-step', 'data-step': '1' },
          h('div', { className: 'dsh-sr-num' }, '1'),
          h('div', { className: 'dsh-sr-text' },
            h('b', null, 'Add a model'),
            h('span', null, 'The assistant needs a model to talk to. Add one on the Models page of Settings: choose a provider and paste your key there. This card never asks for your key and never keeps it.'),
            h('div', { className: 'dsh-sr-act' }, h(Btn, { onClick: () => { onClose?.('models'); openSettingsOn(appCtx, 'models', 'Models'); }, 'data-sr-models': '' }, 'Open Models')))),
        h('div', { className: 'dsh-sr-step', 'data-step': '2' },
          h('div', { className: 'dsh-sr-num' }, '2'),
          h('div', { className: 'dsh-sr-text' },
            h('b', null, 'Choose a daily spending limit'),
            h('span', null, 'The most the assistant may use in one day, all conversations together. When it is reached, it stops until tomorrow. A token is a small piece of a word: a million tokens is roughly 750,000 words, sent and received together.'),
            budget
              ? h('div', { className: 'dsh-sr-act' }, h(SpendChoice, { appCtx, suggested, current: Number(pathGet(budget.value, ['dayTokens']) ?? 0) }))
              : h('span', { className: 'dsh-sh-rowdesc' }, namespaces.length ? 'The Budget add-on is switched off, so there is no limit to set. Switch it on under Plugins to use one.' : 'Loading…'))),
        h('div', { className: 'dsh-sr-step', 'data-step': '3' },
          h('div', { className: 'dsh-sr-num' }, '3'),
          h('div', { className: 'dsh-sr-text' },
            h('b', null, 'How much of Settings to show'),
            h('span', null, 'Keep the safe defaults: Settings shows about ten settings in plain words, and everything else stays as it is. Or show everything: every page of every add-on. You can switch later at the top of Settings.'),
            h('div', { className: 'dsh-sr-act', role: 'radiogroup', 'aria-label': 'How much of Settings to show' },
              h('button', { type: 'button', role: 'radio', 'aria-checked': view === 'simple', className: 'dshu-btn dsh-sr-pick', 'data-sr-view': 'simple', onClick: () => void saveView(appCtx, 'simple') }, 'Keep the safe defaults'),
              h('button', { type: 'button', role: 'radio', 'aria-checked': view === 'advanced', className: 'dshu-btn dsh-sr-pick', 'data-sr-view': 'advanced', onClick: () => void saveView(appCtx, 'advanced') }, 'Show me everything')))),
        h('div', { className: 'dsh-sr-step', 'data-step': '4' },
          h('div', { className: 'dsh-sr-num' }, '4'),
          h('div', { className: 'dsh-sr-text' },
            h('b', null, 'Which tools the AI may use'),
            h('span', null, toolAccessLine(toolAccessOn)),
            h('div', { className: 'dsh-sr-act' }, h(Btn, { onClick: () => { onClose?.('tools'); openSettingsOn(appCtx, 'tool-access', 'Tool access'); }, 'data-sr-tools': '' }, 'Show me the Tool access grid')))));
    }

    /** Forget the "first run" marker: the card is not shown again (it can still be opened from Start here). */
    async function finishSetup(appCtx) {
      indexLoad = undefined;
      try { await writeSettings(appCtx, 'settings-plus', [{ op: 'set', path: ['setupPending'], value: false }]); } catch { /* shown again next start at worst */ }
    }

    function SetupDialog({ appCtx, onClose }) {
      useWindowOpen();
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      return ReactDOM.createPortal(h('div', { className: 'dsh-mg-back', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'dsh-mg-pop dsh-sr-pop', role: 'dialog', 'aria-modal': true, 'aria-label': 'Set up in 2 minutes', 'data-dsh-sr': '' },
          h('div', { className: 'dsh-mg-head' }, h('b', null, 'Set up in 2 minutes'), h('span', { className: 'grow' }), h('button', { type: 'button', onClick: () => onClose() }, 'Close')),
          h('div', { className: 'dsh-mg-body' },
            h('p', { className: 'dsh-sh-rowdesc', style: { margin: '0 0 12px' } }, 'Four short steps. Nothing here blocks the app, and you can run this again from Settings → Start here.'),
            h(SetupSteps, { appCtx, onClose }),
            h('div', { className: 'dsh-sh-actions', style: { marginTop: 14 } }, h(Btn, { main: true, onClick: () => onClose(), 'data-sr-done': '' }, 'Done'))))), document.body);
    }

    /** The small card shown once after a first install: Start (opens the steps) or Not now. It floats; it never covers the chat box or blocks anything. */
    function FirstRunCard({ appCtx, onGone }) {
      const [open, setOpen] = useState(false);
      const finish = useCallback(() => { setOpen(false); void finishSetup(appCtx); onGone(); }, [appCtx, onGone]);
      return h(React.Fragment, null,
        open ? null : h('div', { className: 'dsh-sr-card', role: 'region', 'aria-label': 'Set up in 2 minutes', 'data-dsh-sr-card': '' },
          h('b', null, 'Set up in 2 minutes'),
          h('span', null, 'Add a model, choose a daily spending limit, decide how much of Settings to show, and see which tools the AI may use. You can skip this and come back to it from Settings → Start here.'),
          h('div', { className: 'dsh-sh-actions' },
            h(Btn, { main: true, onClick: () => setOpen(true), 'data-sr-start': '' }, 'Start'),
            h(Btn, { onClick: finish, 'data-sr-skip': '' }, 'Not now'))),
        open ? h(SetupDialog, { appCtx, onClose: (where) => { if (where === 'models' || where === 'tools') setOpen(false); else finish(); } }) : null);
    }

    /** Put the first-run card on the page once, when the install is a fresh one. */
    let firstRunMounted = false;
    function mountFirstRun(appCtx, data) {
      if (firstRunMounted || data?.setupPending !== true || data.enabled === false || typeof document === 'undefined') return () => {};
      firstRunMounted = true;
      const host = document.createElement('div');
      host.setAttribute('data-dsh-first-run', '');
      document.body.appendChild(host);
      let root;
      const gone = () => { try { root?.unmount?.(); } catch { /* already gone */ } host.remove(); firstRunMounted = false; };
      const node = h(PageBoundary, null, h(FirstRunCard, { appCtx, onGone: gone }));
      if (typeof ReactDOM.createRoot === 'function') { root = ReactDOM.createRoot(host); root.render(node); } else { ReactDOM.render(node, host); root = { unmount: () => ReactDOM.unmountComponentAtNode(host) }; }
      return gone;
    }

    // ---- Start here: the Simple list --------------------------------------------------------------------

    const ACCESS_LABELS = [['read-only', 'Read only'], ['workspace-write', 'Workspace write']];

    /** A switch bound to one setting: reads the live value, saves at once, says "Saved". */
    function SettingSwitch({ appCtx, ns, path, fallback, label, disabled, namespaces, reload }) {
      const view = namespaces.find((one) => one.ns === ns);
      const value = view ? pathGet(view.value, path) : undefined;
      const on = (value === undefined ? fallback : value) === true;
      const [note, show] = useNote();
      return h('div', { className: 'dsh-sh-stack' },
        h(Switch, { on, label, disabled: disabled || !view, onChange: async (next) => { try { await writeSettings(appCtx, ns, [{ op: 'set', path, value: next }]); show('Saved.'); reload(); } catch (problem) { show(plainProblem(problem), 'error'); } } }),
        note ? h(NoteLine, { note }) : null);
    }

    /** The name of a colour scheme as the Colours page shows it. An old stored id ("mindshub") is the scheme Harbor. */
    const SCHEME_NAMES = { stock: 'the app\'s own', harbor: 'Harbor', mindshub: 'Harbor', graphite: 'Graphite', forest: 'Forest', custom: 'your own' };
    const schemeLabel = (id) => SCHEME_NAMES[String(id)] ?? String(id).replace(/^./, (c) => c.toUpperCase());

    /** The per-task limits Budget keeps (steps, tokens, repeated calls). The daily limit and the minutes are not among them. */
    const RUNAWAY_KEYS = ['maxSteps', 'maxHelperSteps', 'maxTokens', 'maxRepeats', 'maxLongSteps', 'maxLongTokens'];

    /** Is the "stop a runaway task" protection on: Budget is on and at least one per-task limit is above 0. */
    function runawayOn(view) {
      if (!view) return true;
      if (pathGet(view.value, ['enabled']) === false) return false;
      return ['maxSteps', 'maxTokens', 'maxRepeats'].some((key) => Number(pathGet(view.value, [key]) ?? 1) > 0);
    }

    /** The changes that switch that protection on or off without touching the daily limit (or the minutes limit). */
    function runawayOps(view, next) {
      const ops = [];
      if (next === false) {
        for (const key of RUNAWAY_KEYS) if (Number(pathGet(view?.value, [key]) ?? 1) !== 0) ops.push({ op: 'set', path: [key], value: 0 });
        return ops;
      }
      if (pathGet(view?.user, ['enabled']) === false || pathGet(view?.value, ['enabled']) === false) ops.push({ op: 'unset', path: ['enabled'] });
      for (const key of RUNAWAY_KEYS) if (Number(pathGet(view?.value, [key]) ?? 1) === 0) ops.push({ op: 'unset', path: [key] });
      return ops;
    }

    function RunawaySwitch({ appCtx, namespaces, reload }) {
      const view = namespaces.find((one) => one.ns === 'budget');
      const [note, show] = useNote();
      return h('div', { className: 'dsh-sh-stack' },
        h(Switch, { on: runawayOn(view), label: 'Stop a runaway task', disabled: !view, onChange: async (next) => { try { const ops = runawayOps(view, next); if (ops.length) await writeSettings(appCtx, 'budget', ops); show('Saved.'); reload(); } catch (problem) { show(plainProblem(problem), 'error'); } } }),
        note ? h(NoteLine, { note }) : null);
    }

    function StartPage({ appCtx }) {
      addStyle();
      const view = useView();
      const [namespaces, setNamespaces] = useState([]);
      const [data, setData] = useState(null);
      const [setupOpen, setSetupOpen] = useState(false);
      const [tick, setTick] = useState(0);
      const [, bump] = useState(0);
      const reload = useCallback(() => setTick((n) => n + 1), []);
      // Another add-on may put its row on this page after the page was drawn (Modes' Tool permissions): draw again then.
      useEffect(() => { const again = () => bump((n) => n + 1); rowListeners.add(again); return () => { rowListeners.delete(again); }; }, []);
      useEffect(() => {
        let alive = true;
        void readSettings(appCtx).then((list) => { if (alive) setNamespaces(list); }).catch(() => {});
        void loadIndex().then((got) => { if (alive) setData(got); });
        return () => { alive = false; };
      }, [tick]);
      const [accessNote, showAccess] = useNote();
      const [lookNote, showLook] = useNote();
      const ns = (id) => namespaces.find((one) => one.ns === id);
      const get = (id, path, fallback) => { const v = ns(id) ? pathGet(ns(id).value, path) : undefined; return v === undefined ? fallback : v; };
      const access = get('permission', ['defaultPreset'], 'workspace-write');
      const accessOptions = ACCESS_LABELS.some(([id]) => id === access) ? ACCESS_LABELS : [...ACCESS_LABELS, [access, 'Full access']];
      const suggested = data?.setup?.suggested ?? 2000000;
      const extra = [...simpleRows.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
      const common = { appCtx, namespaces, reload };
      const schemeName = String(get('color-schemes', ['scheme'], 'stock'));
      return h('div', { 'data-dsh-start': '' }, h(ui.Page, { title: 'Start here', desc: view === 'simple' ? 'The settings most people need, in plain words. Switch to Advanced at the top of Settings to see every page.' : 'The settings most people need, in plain words. This is the same list the Simple view shows.' },
        h(ui.Group, null, 'Set up'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'Set up in 2 minutes', desc: 'Add a model, choose a daily spending limit, decide how much of Settings to show, and see which tools the AI may use. Run it again whenever you like.' }, h(Btn, { onClick: () => setSetupOpen(true), 'data-sh-setup': '' }, 'Run setup again'))),
        h(ui.Group, null, 'The basics'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'Which model answers', desc: 'Add a model and its key, and pick the one new conversations use, on the Models page.' }, h(Btn, { onClick: () => openSettingsOn(appCtx, 'models', 'Models') }, 'Open Models')),
          h(Row, { title: 'The web in each tab', desc: 'Each tab decides for itself whether the assistant may search the web. Chat, Cowork and Code are set on the Modes page.' }, h(Btn, { onClick: () => openSettingsOn(appCtx, 'modes', 'Modes') }, 'Open Modes')),
          h(Row, { title: 'What the assistant may change', desc: 'The level new conversations start with. Read only: it can look but not change. Workspace write: it may change files in the project folder. Full access is set on the General page, which asks you first.', note: accessNote, field: 'permission.defaultPreset' },
            h(Choice, { value: access, label: 'Access level for new conversations', disabled: !ns('permission'), options: accessOptions, onChange: async (value) => { try { await writeSettings(appCtx, 'permission', [{ op: 'set', path: ['defaultPreset'], value }]); showAccess('Saved.'); reload(); } catch (problem) { showAccess(plainProblem(problem), 'error'); } } })),
          h(Row, { title: 'Daily spending limit', desc: 'The most the assistant may use in one day. When it is reached, it stops until tomorrow. "No limit" is allowed.', field: 'budget.dayTokens' },
            ns('budget') ? h(SpendChoice, { key: `spend-${tick}`, appCtx, suggested, current: Number(get('budget', ['dayTokens'], 0)), onSaved: reload }) : h('span', { className: 'dsh-sh-rowdesc' }, 'Budget is switched off')),
          h(Row, { title: 'Stop a runaway task', desc: 'Stops a single task that keeps going too long or uses far too much. Recommended on. The daily spending limit above is separate and stays as it is.', field: 'budget.maxSteps' },
            h(RunawaySwitch, { ...common }))),
        h(ui.Group, null, 'Tell me when'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'A task needs me', desc: 'It is waiting for your yes, your answer or your look at its plan.', field: 'automations.alertNeeds' }, h(SettingSwitch, { ...common, ns: 'automations', path: ['alertNeeds'], fallback: true, label: 'Tell me when a task needs me' })),
          h(Row, { title: 'A task failed or was stopped', desc: 'So a long task never fails without you knowing.', field: 'automations.alertFailed' }, h(SettingSwitch, { ...common, ns: 'automations', path: ['alertFailed'], fallback: true, label: 'Tell me when a task failed' })),
          h(Row, { title: 'A task finished', desc: 'A note for every task that ends well. Off at first, because it can be a lot.', field: 'automations.alertFinished' }, h(SettingSwitch, { ...common, ns: 'automations', path: ['alertFinished'], fallback: false, label: 'Tell me when a task finished' })),
          h(Row, { title: 'Show these on this Mac', desc: 'A normal Mac notification. The first time, macOS may ask whether to allow it.', field: 'automations.mac' }, h(SettingSwitch, { ...common, ns: 'automations', path: ['mac'], fallback: true, label: 'Show notifications on this Mac' }))),
        h(ui.Group, null, 'Look and files'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'Light or dark', desc: 'Follow your Mac, or always light or dark.', note: lookNote, field: 'ui-theme.preference' },
            h(Choice, { value: get('ui-theme', ['preference'], 'system'), label: 'Light or dark', disabled: !ns('ui-theme'), options: [['system', 'Follow my Mac'], ['light', 'Light'], ['dark', 'Dark']], onChange: async (value) => { try { await writeSettings(appCtx, 'ui-theme', [{ op: 'set', path: ['preference'], value }]); showLook('Saved.'); reload(); } catch (problem) { showLook(plainProblem(problem), 'error'); } } })),
          h(Row, { title: 'Colour scheme', desc: `The colours of the app. In use now: ${schemeLabel(schemeName)}.`, field: 'color-schemes.scheme' }, h(Btn, { onClick: () => openSettingsOn(appCtx, 'color-schemes', 'Colours') }, 'Open Colours')),
          h(Row, { title: 'Export button', desc: 'A button beside Send that saves the open conversation as a file (Markdown, text, HTML, JSON or PDF).', field: 'settings-plus.exportButton' }, h(SettingSwitch, { ...common, ns: 'settings-plus', path: ['exportButton'], fallback: true, label: 'Show the Export button' }))),
        h(ui.Group, null, 'Add-ons'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'Which add-ons are on', desc: 'Switch add-ons on and off in the Plugins panel. About Plus says which are finished (Core), newer (Beta) or early (Experimental).' },
            h(React.Fragment, null, h(Btn, { onClick: () => openPlugins(appCtx) }, 'Open Plugins'), h(Btn, { onClick: () => openSettingsOn(appCtx, 'about-plus', 'About Plus') }, 'About Plus')))),
        extra.length ? h(ui.Group, null, 'More') : null,
        extra.length ? h('div', { className: 'dsh-sh-card' }, extra.map((spec) => h(Quiet, { key: spec.id }, spec.render({ appCtx })))) : null,
        h(ui.Group, null, 'Everything else'),
        h('div', { className: 'dsh-sh-card' },
          h(Row, { title: 'Show me everything', desc: 'Shows every page of every add-on, and the More settings page for what has no control anywhere else.' },
            h(Switch, { on: view === 'advanced', label: 'Show every setting (Advanced view)', onChange: (next) => void saveView(appCtx, next ? 'advanced' : 'simple'), 'data-sh-advanced': '' }))),
        setupOpen ? h(SetupDialog, { appCtx, onClose: () => { setSetupOpen(false); bump((n) => n + 1); reload(); } }) : null));
    }

    // ---- More settings: the settings that had no control anywhere, drawn from each add-on's own schema ---------

    function MoreRow({ row, appCtx, confirm, onSaved }) {
      const { control, view } = row;
      const current = pathGet(view.value, row.path);
      const base = pathGet(view.base, row.path);
      const saved = pathGet(view.user, row.path) !== undefined;
      const [draft, setDraft] = useState(showValue(control, current));
      const [note, show] = useNote();
      useEffect(() => setDraft(showValue(control, current)), [JSON.stringify(current)]);
      const program = PROGRAM_FIELDS.includes(row.field);
      const warn = program ? 'This decides which program or address the add-on uses. A wrong value can run or contact something else. Change it only if you are sure.' : row.risky ? 'This setting can make the assistant less safe. Change it only if you are sure.' : '';
      const write = async (ops, said) => {
        if (row.risky && !(await confirm(program ? `"${row.label}" decides which program or address is used. Do you want to change it?` : `"${row.label}" can weaken a safety rule. Do you want to change it?`, 'Yes, change it'))) { setDraft(showValue(control, current)); return; }
        try { await writeSettings(appCtx, row.ns, ops); show(said); onSaved(); } catch (problem) { show(plainProblem(problem), 'error'); }
      };
      const commit = () => {
        const parsed = parseEdit(control, draft);
        if (parsed.error) { show(parsed.error, 'error'); return; }
        if (SAME(parsed.value, current)) return;
        void write([{ op: 'set', path: row.path, value: parsed.value }], 'Saved.');
      };
      let editor;
      if (control.t === 'boolean') editor = h(Switch, { on: current === true, label: row.label, onChange: (next) => void write([{ op: 'set', path: row.path, value: next }], 'Saved.') });
      else if (control.t === 'choice') editor = h(Choice, { value: current ?? control.options[0], label: row.label, options: control.options.map((one) => [one, String(one)]), onChange: (value) => void write([{ op: 'set', path: row.path, value }], 'Saved.') });
      else if (control.t === 'lines' || control.t === 'json') editor = h('textarea', { className: 'dshu-field dsh-sh-fit dsh-sx-area', rows: Math.min(8, Math.max(2, draft.split('\n').length)), value: draft, 'aria-label': row.label, placeholder: control.t === 'lines' ? 'One per line' : 'Written as JSON', spellCheck: false, onChange: (event) => setDraft(event.target.value), onBlur: commit });
      else if (control.t === 'text' && (draft.length > 60 || draft.includes('\n') || /^[\[{]/.test(draft.trim()))) editor = h('textarea', { className: 'dshu-field dsh-sh-fit dsh-sx-area', rows: Math.min(8, Math.max(2, Math.ceil(draft.length / 40))), value: draft, 'aria-label': row.label, spellCheck: false, onChange: (event) => setDraft(event.target.value), onBlur: commit });
      else editor = h('input', { className: 'dshu-field dsh-sh-fit', value: draft, 'aria-label': row.label, inputMode: control.t === 'number' ? 'decimal' : undefined, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.target.blur(); } });
      return h(Row, { title: row.label, desc: row.about, warn, field: row.field, note },
        editor,
        h(Btn, { disabled: !saved || SAME(current, base), title: 'Put the value the add-on starts with back', onClick: () => void write([{ op: 'unset', path: row.path }], 'Back to the default.'), 'data-sx-reset': '' }, 'Reset to default'));
    }

    function MorePage({ appCtx }) {
      addStyle();
      const [state, setState] = useState({ loading: true, rows: [], off: 0, skipped: 0, failed: false });
      const [query, setQuery] = useState('');
      const [tick, setTick] = useState(0);
      const [confirm, dialog] = useConfirm();
      useEffect(() => {
        let alive = true;
        Promise.all([readSettings(appCtx), loadIndex()]).then(([namespaces, data]) => {
          if (!alive) return;
          const entries = visibleEntries(Array.isArray(data.entries) ? data.entries : [], data.recon);
          setState({ loading: false, failed: false, ...moreRows(namespaces, entries) });
        }).catch(() => { if (alive) setState({ loading: false, rows: [], off: 0, skipped: 0, failed: true }); });
        return () => { alive = false; };
      }, [tick]);
      // A jump from search: scroll to the row and mark it.
      useEffect(() => {
        const go = () => {
          const field = jump.field;
          if (!field || state.loading) return;
          const node = [...document.querySelectorAll('[data-sx-field]')].find((one) => one.getAttribute('data-sx-field') === field);
          if (!node) return;
          jump.field = '';
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
          node.classList.add('dsh-sg-hit');
          setTimeout(() => node.classList.remove('dsh-sg-hit'), 2600);
        };
        jump.subs.add(go);
        go();
        return () => { jump.subs.delete(go); };
      }, [state.loading, state.rows.length]);
      const typed = words(query);
      const shown = state.rows.filter((row) => typed.every((word) => `${row.label} ${row.about} ${row.group} ${row.field}`.toLowerCase().includes(word)));
      const groups = [];
      for (const row of shown) {
        const last = groups[groups.length - 1];
        if (last && last.name === row.group) last.rows.push(row); else groups.push({ name: row.group, rows: [row] });
      }
      return h('div', { 'data-dsh-more': '' }, h(ui.Page, { title: 'More settings', desc: 'Settings that have no control on any other page. They used to be changed only by editing the configuration file. Grouped by add-on; each one saves at once and can be put back with Reset to default. This list is not complete: records the add-ons keep for themselves are left out on purpose, and some settings can only be changed in the configuration file.' },
        h('input', { className: 'dshu-field dsh-sx-find', type: 'search', value: query, placeholder: 'Find in this list', 'aria-label': 'Find in this list', onChange: (event) => setQuery(event.target.value) }),
        state.loading ? h(ui.Wait, null) : null,
        state.failed ? h(ui.Desc, { error: true }, 'The settings could not be read. Close Settings and open it again.') : null,
        !state.loading && !state.failed && groups.length === 0 ? h(ui.Desc, null, typed.length ? `Nothing here matches "${query.trim()}".` : 'There is nothing to list here for the add-ons that are on. Some settings can still only be changed in the configuration file.') : null,
        groups.map((group) => h(React.Fragment, { key: group.name },
          h(ui.Group, null, group.name),
          h('div', { className: 'dsh-sh-card' }, group.rows.map((row) => h(MoreRow, { key: row.field, row, appCtx, confirm, onSaved: () => setTick((n) => n + 1) }))))),
        !state.loading && !state.failed && state.skipped > 0 ? h(ui.Desc, null, `${state.skipped} more ${state.skipped === 1 ? 'setting has' : 'settings have'} no box on this page and can only be changed in the configuration file.`) : null,
        state.off > 0 ? h(ui.Desc, null, `${state.off} more settings belong to add-ons that are switched off. They show here when the add-on is on.`) : null,
        dialog));
    }

    // ---- the Simple / Advanced switch at the top of Settings -------------------------------------------

    function ViewSwitch({ appCtx }) {
      addStyle();
      const view = useView();
      const [on, setOn] = useState(true);
      useEffect(() => {
        let alive = true;
        void loadIndex().then((data) => { if (alive) setOn(data.enabled !== false); });
        return () => { alive = false; };
      }, []);
      if (!on) return null;
      const pick = (value) => { if (value !== view) void saveView(appCtx, value); };
      return h('span', { className: 'dsh-sh-seg', role: 'radiogroup', 'aria-label': 'Which settings to show', 'data-dsh-view-switch': '' },
        [['simple', 'Simple'], ['advanced', 'Advanced']].map(([id, name]) => h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': view === id, 'data-view': id, title: id === 'simple' ? 'About ten settings, in plain words' : 'Every page of every add-on', onClick: () => pick(id) }, name)));
    }

    // ---- About Plus: which app versions this works with, and which add-ons are finished ------------------------
    const ABOUT_CSS = `
.dsh-ab-page { display: flex; flex-direction: column; gap: 0; color: var(--dsw-alias-label-primary); }
.dsh-ab-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ab-desc { margin: 0 0 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ab-group { margin: 16px 0 6px; font-size: 12px; line-height: 18px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ab-card { box-sizing: border-box; padding: 12px 14px; border-radius: 20px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); font-size: 14px; line-height: 22px; }
.dsh-ab-card p { margin: 0 0 6px; }
.dsh-ab-card p:last-child { margin-bottom: 0; }
.dsh-ab-small { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ab-ok { color: var(--dsw-alias-state-success-primary); }
.dsh-ab-warn { color: var(--dsw-alias-state-warn-primary); }
.dsh-ab-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ab-row:last-child { border-bottom: 0; }
.dsh-ab-rowtext { flex: 1; min-width: 0; }
.dsh-ab-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ab-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ab-chip { flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; border: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dsh-ab-chip[data-tier="beta"], .dsh-ab-chip[data-tier="experimental"] { color: var(--dsw-alias-state-warn-primary); }
`;
    const TIER_ORDER = ['core', 'beta', 'experimental', 'separate'];
    const TIER_HINT = {
      core: 'Finished and tested. On when you install.',
      beta: 'Works, but newer or less tested. Installed switched off; switch it on under Plugins when you want it.',
      experimental: 'Early. Only installed if you chose "Everything", and switched off until you turn it on.',
      separate: 'A separate download.',
    };

    /** The words about the app version: supported or not, in plain words. */
    function rangeSentence(about) {
      if (!about.range) return { text: 'The list of supported app versions is not available.', state: '' };
      const range = `${about.range.min} up to, but not including, ${about.range.below}`;
      if (!about.app) return { text: `Plus is written for DeepSeek Harness ${range}. The version of your app could not be read.`, state: '' };
      if (about.inRange) return { text: `Plus is written for DeepSeek Harness ${range}. Your app is ${about.app}: that is supported.`, state: 'ok' };
      return { text: `Plus is written for DeepSeek Harness ${range}. Your app is ${about.app}: that is outside the range, so some add-ons may not work.`, state: 'warn' };
    }

    function AboutPage() {
      const [about, setAbout] = useState(null);
      const [failed, setFailed] = useState(false);
      useEffect(() => {
        let alive = true;
        fetch(new URL('dsh-settings-plus/about', document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no'))))
          .then((data) => { if (alive) setAbout(data); })
          .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
      }, []);
      const head = [
        h('style', { key: 'css', dangerouslySetInnerHTML: { __html: ABOUT_CSS } }),
        h('h2', { key: 'h', className: 'dsh-ab-title' }, 'About Plus'),
        h('p', { key: 'd', className: 'dsh-ab-desc' }, 'Which version of the app Plus works with, and which add-ons are finished.'),
      ];
      if (failed) return h('div', { className: 'dsh-ab-page' }, ...head, h('p', { className: 'dsh-ab-desc' }, 'This information could not be loaded. Close Settings and open it again.'));
      if (!about) return h('div', { className: 'dsh-ab-page' }, ...head, h('p', { className: 'dsh-ab-desc' }, 'Loading…'));
      const sentence = rangeSentence(about);
      return h('div', { className: 'dsh-ab-page' },
        ...head,
        h('div', { className: 'dsh-ab-group' }, 'Versions'),
        h('div', { className: 'dsh-ab-card' },
          h('p', null, about.plus ? `DeepSeek Harness Plus ${about.plus}` : 'DeepSeek Harness Plus'),
          h('p', { className: sentence.state ? `dsh-ab-${sentence.state}` : '', role: 'status' }, sentence.text),
          h('p', { className: 'dsh-ab-small' }, 'When the app updates: Plus does not change by itself, and your settings and saved data stay where they are. If the new app version is outside this range, some add-ons may stop working or be switched off by the app until you install a Plus made for it. Check the range here before you update the app.')),
        TIER_ORDER.map((tier) => {
          const list = about.addons.filter((one) => one.tier === tier);
          if (list.length === 0) return null;
          return h(React.Fragment, { key: tier },
            h('div', { className: 'dsh-ab-group' }, `${list[0].tierLabel || tier} (${list.length})`),
            h('p', { className: 'dsh-ab-desc' }, TIER_HINT[tier]),
            h('div', { className: 'dsh-ab-card' }, list.map((one) =>
              h('div', { className: 'dsh-ab-row', key: one.folder },
                h('div', { className: 'dsh-ab-rowtext' }, h('div', { className: 'dsh-ab-rowtitle' }, one.name), one.reason ? h('div', { className: 'dsh-ab-rowdesc' }, one.reason) : null),
                h('span', { className: 'dsh-ab-chip', 'data-tier': tier }, one.tierLabel || tier)))));
        }));
    }

    // ---- toolcard:begin ---- Permission card, pure part: what the card says and which choices it shows. No React, no page; the tests run this block on its own.
    // Everything the AI wrote (the reason) passes through `clean` and is only ever given to the page as a text child, never as markup.
    const dshCard = (() => {
      const WAIT_MS = 600000;
      const SAYS = {
        0: 'It only shows you something.',
        1: 'It reads and researches.',
        2: 'It can change things in your workspace or cost money.',
        3: 'It can change or delete files, run programs, reach other models or services.',
        4: 'Only you can switch this on, in Settings.',
      };
      const RECON_SAYS = 'Recon is sealed. It may only ask for a tool that cannot reach outside Recon\u2019s own routes: the Terminal, connectors, coding engines, helpers and anything online can never be requested from Recon. Your answer here counts for this conversation only.';
      const LABEL = { once: 'Allow once', conversation: 'Allow in this conversation', mode: 'Allow in this tab', always: 'Always allow', deny: 'Deny', never: "Don't ask again" };
      const SCOPES = ['once', 'conversation', 'mode', 'always'];
      const ORDER = [...SCOPES, 'deny', 'never'];
      const REASON_SHOWN = 300;

      /** Text made safe to show: no control or direction-changing characters, one line, cut at `max` with an ellipsis. */
      // eslint-disable-next-line no-control-regex
      const clean = (value, max = 200) => {
        const text = String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g, ' ').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
      };

      /** "9:42": whole seconds left, rounded up, never below 0:00. */
      const countdown = (ms) => {
        const seconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      };

      /** Oldest first, one entry per id. */
      const queue = (requests) => {
        const seen = new Set();
        return (Array.isArray(requests) ? requests : [])
          .filter((one) => one && typeof one.id === 'string' && one.id && !seen.has(one.id) && seen.add(one.id))
          .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      };

      /** What one conversation shows now: its oldest request, and how many more wait behind it. */
      const forSession = (requests, sessionId) => {
        const mine = queue(requests).filter((one) => one.sessionId === sessionId);
        return { current: mine[0] ?? null, more: Math.max(0, mine.length - 1) };
      };

      /** "2 more waiting" (nothing for none). */
      const moreText = (count) => (count > 0 ? `${count} more waiting` : '');

      /** Conversations with a request waiting. */
      const waitingIds = (requests) => [...new Set(queue(requests).map((one) => one.sessionId))];

      /**
       * The buttons: only what the service offered and is allowed for this risk, safest wording, in a fixed order.
       * Deny is always there. A long permission is never shown for a high-risk tool, after outside material was read, or in Recon,
       * even if the request offered it.
       */
      const choices = (request) => {
        const offered = new Set((request?.choices ?? []).map((one) => one?.id));
        const longest = SCOPES.indexOf(request?.longest);
        let top = longest >= 0 ? longest : SCOPES.length - 1;
        const tier = Number.isInteger(request?.tier) ? request.tier : 3;
        const outside = Boolean(request?.outsideMaterial) || Boolean(request?.outsideWarning);
        if (tier >= 3 || outside || request?.recon) top = Math.min(top, 1);
        if (tier >= 3 && outside) top = 0;
        return ORDER.filter((id) => {
          if (id === 'deny') return true;
          if (!offered.has(id)) return false;
          const at = SCOPES.indexOf(id);
          return at < 0 || at <= top;
        }).map((id) => ({ id, label: LABEL[id], kind: SCOPES.includes(id) ? 'allow' : id }));
      };

      /** How far the buttons reach, in words: the headline says exactly this, so it never promises less or more than the buttons give. */
      const scopeWords = (request) => {
        const allowed = choices(request).filter((one) => one.kind === 'allow').map((one) => one.id);
        const widest = allowed.length ? SCOPES.indexOf(allowed[allowed.length - 1]) : -1;
        return ['for one use only', 'in this conversation', 'in this conversation or the whole tab', 'in this conversation, the whole tab or always'][widest] ?? 'in this conversation';
      };

      /** What an answer's reply means. Only `{ok: true}` is a success: a refused answer (the request ran out, was cancelled or was answered already) is said out loud. */
      const GONE = 'This request is no longer waiting. Your answer was not used.';
      const answerResult = (status, data) => {
        if (!data || typeof data !== 'object' || status >= 500) return { state: 'error', text: 'Your answer could not be sent. Try again.' };
        if (data.ok === true) return { state: 'sent', text: '' };
        // Only the host's own "no longer waiting" means the request ended; any other refusal (a bad request, Tool access not running) is a failed send.
        if (/no longer waiting/i.test(String(data.reason ?? ''))) return { state: 'gone', text: GONE };
        return { state: 'rejected', text: 'Your answer was not accepted, so nothing was decided. Try again.' };
      };

      /** What a key does on the card: Esc is Deny, nothing else (nothing is bound to Enter; a click outside does nothing). */
      const keyAction = (key) => (key === 'Escape' ? 'deny' : null);

      /**
       * Whether the card may move the keyboard focus to its safest button. Never from a message half written, nor from a control the
       * person chose, nor from the empty chat box of another conversation (another pane): only when nothing is focused, or the empty
       * chat box that sits with this card.
       */
      const mayTakeFocus = ({ inCard, active, draft, editable }) => {
        if (inCard) return false;
        if (!active) return true;
        // A chat box (empty or not) and any other control keep the keyboard: a stray Space or Enter must never answer the card.
        if (draft || editable) return false;
        return active === 'body';
      };

      /** Enter and Space on a card button are ignored for this long after the card moved the focus there by itself (a key typed into the chat box a moment before). */
      const KEY_GRACE_MS = 1200;
      const keyIgnored = (key, sinceFocusMs) => (key === 'Enter' || key === ' ') && sinceFocusMs >= 0 && sinceFocusMs < KEY_GRACE_MS;

      /** Every line of the card, as plain strings. */
      const model = (request, remainingMs) => {
        const plain = clean(request.plain || request.tool, 80) || 'a tool';
        const raw = clean(request.tool, 80);
        const reason = clean(request.reason, REASON_SHOWN);
        const tier = Number.isInteger(request.tier) ? request.tier : 3;
        return {
          id: request.id,
          sessionId: request.sessionId,
          heading: `The AI asks to use: ${plain} ${scopeWords(request)}`,
          rawName: raw && raw !== plain ? raw : '',
          risk: request.recon ? 'Risk: Highest. ' + RECON_SAYS : `Risk: ${clean(request.risk, 20) || 'High'}. ${SAYS[tier] ?? SAYS[3]}`,
          reasonLabel: "The AI's reason, in its own words (not checked):",
          reason,
          noReason: reason ? '' : 'The AI gave no reason.',
          outside: clean(request.outsideWarning, 240),
          recon: clean(request.reconWarning, 240),
          choices: choices(request),
          countdown: `Waiting for your answer: ${countdown(remainingMs)} left. After that it counts as not answered.`,
          remainingMs,
        };
      };

      return { WAIT_MS, KEY_GRACE_MS, keyIgnored, SAYS, LABEL, SCOPES, GONE, clean, countdown, queue, forSession, moreText, waitingIds, choices, scopeWords, answerResult, keyAction, mayTakeFocus, model };
    })();
    // ---- toolcard:end ----

    // ---- Permission card (Tool access): the card the AI's request for a tool is answered on ----
    // One poller for the whole page asks the host (lib/toolcard.js) what waits. Each conversation draws only its own oldest request,
    // above its chat box (in Split view that is inside the asking pane); a conversation that is not on screen keeps its request
    // queued and shows a dot in the sidebar row. Text from the AI goes in only as a plain text child (never as markup).
    const CARD_CSS = `
.dsh-tc-card { box-sizing: border-box; margin: 0 auto 8px; width: 100%; max-width: 790px; padding: 12px 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); display: flex; flex-direction: column; gap: 8px; }
.dsh-tc-card[data-recon="true"] { border-color: var(--dsw-alias-state-error-primary); }
.dsh-tc-title { margin: 0; font-size: 14px; line-height: 22px; font-weight: 500; overflow-wrap: anywhere; }
.dsh-tc-raw { font-weight: 400; color: var(--dsw-alias-label-secondary); }
.dsh-tc-line { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-tc-reason { margin: 0; padding: 6px 10px; border-left: 2px solid var(--dsw-alias-border-l2); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; max-height: 100px; overflow-y: auto; }
.dsh-tc-warn { margin: 0; padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-secondary)) 14%, transparent); }
.dsh-tc-warn[data-kind="recon"] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
.dsh-tc-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.dsh-tc-foot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.dsh-tc-time { font-variant-numeric: tabular-nums; }
.dsh-tc-problem { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
`;
    let cardStyled = false;
    const addCardStyle = () => {
      if (cardStyled || typeof document === 'undefined') return;
      cardStyled = true;
      const style = document.createElement('style');
      style.id = 'dsh-tc-style';
      style.textContent = CARD_CSS;
      (document.head || document.documentElement).appendChild(style);
    };

    const CARD_URL = () => new URL('dsh-settings-plus/tool-card', document.baseURI);
    const cardState = { requests: [], at: 0, ready: false };
    const cardSubs = new Set();
    const cardTell = () => { for (const fn of [...cardSubs]) { try { fn(); } catch { /* one listener's trouble must not stop the rest */ } } };
    const cardSet = (data) => {
      const before = cardState.requests.map((one) => one.id).join('|');
      cardState.requests = Array.isArray(data?.requests) ? dshCard.queue(data.requests) : [];
      cardState.at = Date.now();
      cardState.ready = data?.ready === true;
      if (before !== cardState.requests.map((one) => one.id).join('|')) cardTell();
    };
    /** The page-wide door other add-ons use (the sidebar row dot, the Split pane header dot). */
    const cardDoor = {
      waiting: (sessionId) => dshCard.waitingIds(cardState.requests).includes(sessionId),
      ids: () => dshCard.waitingIds(cardState.requests),
      subscribe: (fn) => { cardSubs.add(fn); return () => cardSubs.delete(fn); },
    };
    if (typeof window !== 'undefined') window.__dshToolCard = cardDoor;

    /** Looks at the host about once a second while something waits (and while the window is open); returns a stopper and a "look now". */
    function startCardPoller() {
      let stopped = false;
      let timer = 0;
      const look = async () => {
        let data = null;
        try {
          const response = await fetch(CARD_URL(), { cache: 'no-store', credentials: 'same-origin' });
          data = response.ok ? await response.json() : null;
        } catch { data = null; }
        if (stopped) return;
        cardSet(data);
        // Tool access off (the host says so): nothing can ask, so look only now and then.
        const wait = document.hidden ? 4000 : data?.ready !== true || data?.off === true ? 15000 : cardState.requests.length > 0 ? 1000 : 2000;
        timer = setTimeout(look, wait);
      };
      timer = setTimeout(look, 1500);
      return { stop: () => { stopped = true; clearTimeout(timer); }, now: () => { clearTimeout(timer); void look(); } };
    }
    let cardPoller = null;

    /** A note kept for a conversation after its request is gone (an answer that came too late): the card never vanishes without saying so. */
    const cardNotes = new Map();
    const cardNote = (sessionId, text) => { cardNotes.set(sessionId, text); cardTell(); setTimeout(() => { if (cardNotes.get(sessionId) === text) { cardNotes.delete(sessionId); cardTell(); } }, 10000); };

    const useCardState = () => {
      const [, bump] = useState(0);
      useEffect(() => cardDoor.subscribe(() => bump((n) => n + 1)), []);
      return cardState;
    };

    function PermissionCard({ sessionId }) {
      const snap = useCardState();
      const { current, more } = dshCard.forSession(snap.requests, sessionId);
      const [busy, setBusy] = useState(false);
      const [problem, setProblem] = useState('');
      const [, tick] = useState(0);
      const cardRef = useRef(null);
      const autoFocusAt = useRef(0);
      const id = current?.id;
      useEffect(() => {
        if (!id) return undefined;
        const timer = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(timer);
      }, [id]);
      useEffect(() => {
        setBusy(false);
        setProblem('');
        if (!id) return;
        // The safest button gets the focus, unless the person has a message half written or has gone to another control: then nothing is taken from them.
        // The app moves focus to the chat box a moment after a conversation opens, so the focus is also set once more shortly after.
        const take = () => {
          const active = document.activeElement;
          const editable = Boolean(active) && (active.isContentEditable || active.tagName === 'TEXTAREA');
          const draft = Boolean(active) && ((active.isContentEditable && active.textContent.trim() !== '') || ((active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && String(active.value ?? '').trim() !== ''));
          if (dshCard.mayTakeFocus({ inCard: Boolean(active && cardRef.current?.contains(active)), active: !active ? null : active === document.body ? 'body' : 'other', draft, editable })) { autoFocusAt.current = Date.now(); cardRef.current?.querySelector('[data-dsh-tc-deny]')?.focus(); }
        };
        take();
        const later = setTimeout(take, 400);
        return () => clearTimeout(later);
      }, [id]);
      if (!current) {
        const note = cardNotes.get(sessionId);
        return note ? h('section', { className: 'dsh-tc-card', role: 'status', 'data-dsh-tool-card-note': sessionId }, h('p', { className: 'dsh-tc-line' }, note), h('div', { className: 'dsh-tc-choices' }, h(ui.Button, { onClick: () => { cardNotes.delete(sessionId); cardTell(); } }, 'Close'))) : null;
      }
      const m = dshCard.model(current, Math.max(0, current.remainingMs - (Date.now() - snap.at)));
      const answer = async (choice) => {
        if (busy) return;
        setBusy(true);
        setProblem('');
        try {
          const response = await fetch(CARD_URL(), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: m.id, choice }) });
          let data = null;
          try { data = await response.json(); } catch { data = null; }
          const result = dshCard.answerResult(response.status, data);
          if (result.state === 'error') throw new Error('no answer');
          // The request leaves the card at once; the next look confirms it. A refused answer (too late) leaves a plain note in its place.
          cardSet({ ready: true, requests: cardState.requests.filter((one) => one.id !== m.id) });
          if (result.state === 'gone') cardNote(m.sessionId, result.text);
          cardPoller?.now();
        } catch {
          setBusy(false);
          setProblem('Your answer could not be sent. Try again.');
        }
      };
      const deny = m.choices.find((one) => one.id === 'deny');
      const never = m.choices.find((one) => one.id === 'never');
      const allows = m.choices.filter((one) => one.kind === 'allow');
      const titleId = `dsh-tc-t-${m.id}`;
      const bodyId = `dsh-tc-b-${m.id}`;
      return h('section', {
        ref: cardRef, className: 'dsh-tc-card', role: 'alertdialog', 'aria-labelledby': titleId, 'aria-describedby': bodyId, 'data-recon': current.recon ? 'true' : 'false', 'data-dsh-tool-card': m.sessionId,
        // Esc is Deny. Nothing is bound to Enter, and a click outside the card does nothing: a button only acts when it is pressed on purpose.
        // Enter or Space right after the card focused a button by itself is dropped (a key typed for the chat box); after that a button does what it says.
        onKeyDown: (event) => {
          if (dshCard.keyIgnored(event.key, autoFocusAt.current ? Date.now() - autoFocusAt.current : -1)) { event.preventDefault(); return; }
          if (dshCard.keyAction(event.key) === 'deny') { event.preventDefault(); event.stopPropagation(); void answer('deny'); }
        },
        onPointerDown: () => { autoFocusAt.current = 0; },
      },
        h('p', { id: titleId, className: 'dsh-tc-title' }, m.heading, m.rawName ? h('span', { className: 'dsh-tc-raw' }, ` (${m.rawName})`) : null),
        h('div', { id: bodyId, style: { display: 'contents' } },
          h('p', { className: 'dsh-tc-line' }, m.risk),
          m.outside ? h('p', { className: 'dsh-tc-warn', role: 'note' }, m.outside) : null,
          m.recon ? h('p', { className: 'dsh-tc-warn', 'data-kind': 'recon', role: 'note' }, m.recon) : null,
          h('p', { className: 'dsh-tc-line' }, m.reasonLabel),
          m.reason ? h('blockquote', { className: 'dsh-tc-reason' }, '“', m.reason, '”') : h('p', { className: 'dsh-tc-line' }, m.noReason)),
        h('div', { className: 'dsh-tc-choices', role: 'group', 'aria-label': 'Your answer' },
          deny ? h(ui.Button, { key: 'deny', 'data-dsh-tc-deny': '', main: true, disabled: busy, onClick: () => void answer('deny') }, deny.label) : null,
          allows.map((one) => h(ui.Button, { key: one.id, disabled: busy, onClick: () => void answer(one.id) }, one.label)),
          never ? h(ui.Button, { key: 'never', disabled: busy, onClick: () => void answer('never') }, never.label) : null),
        problem ? h('p', { className: 'dsh-tc-problem', role: 'alert' }, problem) : null,
        h('div', { className: 'dsh-tc-foot' },
          h('span', { className: 'dsh-tc-line dsh-tc-time' }, m.countdown),
          more > 0 ? h('span', { className: 'dsh-tc-line', 'aria-live': 'polite' }, dshCard.moreText(more)) : null));
    }

    return {
      dshCard,
      toolAccessLine,
      visibleEntries,
      moreRows,
      parseEdit,
      isRisky,
      isInternalField,
      runawayOn,
      schemeLabel,
      runawayOps,
      INTERNAL_NAME,
      PROGRAM_FIELDS,
      schemaNode,
      controlOf,
      SIMPLE_PAGES,
      PAGE_ADDON,
      GROUPS,
      rangeSentence,
      modeOf,
      modeNamed,
      pageForMode,
      inject: ['slots', 'remote', 'remote.settings', 'locale', 'layout'],
      apply(ctx) {
        addStyle();
        for (const group of GROUPS) {
          for (const id of group.pages) {
            ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id }, (props) => h(PageIcon, { ...props, appCtx: ctx, id }))));
          }
        }
        // The permission card: above each chat box (in Split view, inside the asking pane).
        addCardStyle();
        cardPoller = typeof document !== 'undefined' ? startCardPoller() : null;
        ctx.effect(() => () => { cardPoller?.stop(); cardPoller = null; });
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'plus-tool-card', order: -100 }, (props) => h(PermissionCard, props))));
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'plus-export', order: 870 }, (props) => h(ExportButton, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'plus-mode-gear', order: 880 }, (props) => h(ModeGear, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'about-plus', order: 630, label: () => 'About Plus' }, () => h(AboutPage))));
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'start-here', order: 10, label: () => 'Start here' }, () => h(StartPage, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'more-settings', order: 640, label: () => 'More settings' }, () => h(MorePage, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'plus-settings-view', order: -11 }, (props) => h(ViewSwitch, { ...props, appCtx: ctx }))));
        // The saved choice (Simple or Advanced) and, after a first install only, the setup card.
        let leaveFirstRun = () => {};
        let firstRun;
        if (typeof document !== 'undefined') {
          void loadIndex().then((data) => {
            if (data.enabled === false) return;
            setViewLocal(data.view);
            firstRun = setTimeout(() => { leaveFirstRun = mountFirstRun(ctx, data); }, 2500);
          });
        }
        ctx.effect(() => () => { clearTimeout(firstRun); leaveFirstRun(); });
        ctx.effect(() => ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'plus-settings-search', order: -10 }, (props) => h(SearchField, { ...props, appCtx: ctx }))));
        // Review H4: when an add-on found a saved file damaged and kept it aside, say so once, in plain words.
        const timer = setTimeout(() => void showDamagedNotice(), 6000);
        ctx.effect(() => () => clearTimeout(timer));
      },
    };
  },
});
