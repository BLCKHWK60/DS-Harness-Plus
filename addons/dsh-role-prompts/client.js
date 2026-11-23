/**
 * Browser half of Role prompts: the page for "Instructions for every thread". It edits the
 * saved sections through the settings channel (the `sections` field is volatile in the host half), and
 * shows itself as a tab of the Model Tiers page; without Model Tiers it has its own Settings page.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-role-prompts',
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

    const NS = 'role-prompts';
    const DEFAULT_ORDER = 60;
    const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
    const PlainNote = dshKit.makeNote(React);
    /** What the five starter tiers are called when you have not renamed them. */
    const STARTER_NAMES = { haiku: 'Fast', sonnet: 'Balanced', opus: 'Deep', fable: 'Creative', code: 'Code review' };

    const DICT = {
      en: {
        'section.title': 'Instructions for every thread',
        'head.hint': 'Your own instructions, added to the start of every thread, in the order you choose. Nothing is added until you write something. Changes to the text apply at once; a new instruction, or a changed position, applies from the next thread.',
        loading: 'Loading…',
        empty: 'No instructions yet. Add one, for example how you want plans or code to be written.',
        add: 'Add instructions',
        'add.title': 'Name these instructions',
        'add.label': 'Name (letters, numbers, spaces)',
        'add.bad': 'Use letters, numbers, spaces, dashes or underscores, up to 40 characters, and a name not used yet.',
        remove: 'Remove',
        'remove.title': 'Remove these instructions?',
        'remove.text': 'They are deleted when you save. Discard to bring them back.',
        on: 'On',
        text: 'Instructions',
        'text.placeholder': 'Write the instructions in your own words.',
        position: 'Position',
        'position.hint': 'Lower comes earlier. Default 60.',
        only: 'Only for these tiers',
        'only.hint': 'Leave all unticked to use them in every thread.',
        save: 'Save',
        discard: 'Discard changes',
        saved: 'Saved',
        dirty: 'Not saved yet',
        failed: 'Could not read these settings. Is the Role prompts add-on switched on?',
        'save.failed': 'Could not save',
      },
    };

    const CSS = `
.dsh-rpr-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-rpr-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-rpr-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-rpr-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-rpr-cardhead { display: flex; align-items: center; gap: 10px; }
.dsh-rpr-cardhead b { font-size: 14px; line-height: 22px; font-weight: 500; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dsh-rpr-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-rpr-field > span { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rpr-in, .dsh-rpr-area { box-sizing: border-box; width: 100%; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; }
.dsh-rpr-in { height: 36px; padding: 0 14px; }
.dsh-rpr-in.narrow { width: 120px; }
.dsh-rpr-area { padding: 10px 14px; min-height: 96px; line-height: 20px; resize: vertical; }
.dsh-rpr-in:focus-visible, .dsh-rpr-area:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-rpr-hint { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rpr-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-rpr-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-rpr-btn[disabled] { opacity: .5; cursor: default; }
.dsh-rpr-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-rpr-btn.primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-rpr-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-rpr-spacer { flex: 1; }
.dsh-rpr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-rpr-chip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; background: transparent; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-rpr-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-rpr-switch { position: relative; flex: none; width: 36px; height: 20px; padding: 0; border: 0; border-radius: 10px; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); cursor: pointer; }
.dsh-rpr-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 8px; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-bg-base)); transition: left .15s ease; }
.dsh-rpr-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-rpr-switch[aria-checked="true"]::after { left: 18px; background: var(--dsw-alias-bg-base); }
.dsh-rpr-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .dsh-rpr-switch::after { transition: none; } }
`;

    const obj = (value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value === 'string' && value.trim()) {
        try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed; } catch { /* fall through */ }
      }
      return {};
    };

    /** The saved sections as editable rows (unknown fields are kept so a save never drops them). */
    function toRows(value) {
      return Object.entries(obj(value)).map(([name, one]) => ({
        name,
        enabled: one?.enabled !== false,
        order: Number.isFinite(Number(one?.order)) ? Number(one.order) : DEFAULT_ORDER,
        tiers: Array.isArray(one?.appliesToTiers) ? one.appliesToTiers.map(String) : [],
        text: typeof one?.text === 'string' ? one.text : '',
        extra: one && typeof one === 'object' ? one : {},
      }));
    }

    /** Rows back to the saved shape. */
    function fromRows(rows) {
      const out = {};
      for (const row of rows) out[row.name] = { ...row.extra, enabled: row.enabled, order: row.order, appliesToTiers: row.tiers, text: row.text };
      return out;
    }

    /** The tier names that exist, from the Model Tiers settings (starter tiers and your own). */
    function tierChoices(namespaces) {
      const entry = namespaces.find((item) => item.ns === 'model-tiers');
      if (!entry) return [];
      const value = entry.value ?? {};
      const out = [];
      for (const [id, one] of Object.entries(obj(value.tiers))) out.push({ id, label: String(one?.label || STARTER_NAMES[id] || id) });
      let custom = [];
      try { const parsed = typeof value.customTiers === 'string' ? JSON.parse(value.customTiers) : value.customTiers; custom = Array.isArray(parsed) ? parsed : []; } catch { custom = []; }
      for (const one of custom) if (one && typeof one.id === 'string') out.push({ id: one.id, label: String(one.name || one.id) });
      return out;
    }

    async function loadAll(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw dshKit.fail('not mounted');
      return { value: entry.value ?? {}, revision: entry.revision, tiers: tierChoices(result.value.namespaces) };
    }

    function RolePromptsPage({ appCtx, embedded }) {
      const t = appCtx.locale.bind('rolePrompts');
      const [status, setStatus] = useState('loading');
      const [revision, setRevision] = useState(0);
      const [rows, setRows] = useState([]);
      const [tiers, setTiers] = useState([]);
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);

      const refresh = useCallback(async () => {
        try {
          const data = await loadAll(appCtx);
          setRevision(data.revision);
          setTiers(data.tiers);
          setRows(toRows(data.value.sections));
          setDirty(false);
          setStatus('ready');
        } catch (error) {
          setMessage({ error });
          setStatus('error');
        }
      }, [appCtx]);
      useEffect(() => { void refresh(); }, [refresh]);

      const change = (fn) => { setRows(fn); setDirty(true); setMessage(null); };
      const patch = (name, next) => change((list) => list.map((row) => (row.name === name ? { ...row, ...next } : row)));

      const add = async () => {
        const name = await dshKit.ask({ title: t('add.title'), field: { label: t('add.label'), value: '' }, ok: t('add') });
        if (name === null || name === false) return;
        const clean = String(name).trim();
        if (!NAME_RE.test(clean) || rows.some((row) => row.name === clean)) {
          await dshKit.ask({ title: t('add.title'), text: t('add.bad'), notice: true });
          return;
        }
        change((list) => [...list, { name: clean, enabled: true, order: DEFAULT_ORDER, tiers: [], text: '', extra: {} }]);
      };
      const remove = async (name) => {
        const yes = await dshKit.ask({ title: t('remove.title'), text: t('remove.text'), ok: t('remove'), danger: true });
        if (yes === true) change((list) => list.filter((row) => row.name !== name));
      };

      const save = async () => {
        if (busy || !dirty) return;
        setBusy(true);
        setMessage(null);
        try {
          // A section needs some text (the host refuses an empty one).
          const keep = rows.filter((row) => row.text.trim());
          const ops = [{ op: 'set', path: ['sections'], value: fromRows(keep) }];
          let result = await appCtx.remote.settings.mutate(NS, ops, revision);
          if (!result.ok && result.error?.code === 'settings/conflict') {
            const fresh = await loadAll(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setRevision(result.value.revision);
          setRows(toRows(result.value.value?.sections));
          setDirty(false);
          setMessage({ text: t('saved') });
        } catch (error) {
          setMessage({ error });
        } finally {
          setBusy(false);
        }
      };

      const style = h('style', { dangerouslySetInnerHTML: { __html: CSS } });
      if (status === 'loading') return h('div', { className: 'dsh-rpr-hint' }, style, t('loading'));
      if (status === 'error') return h('div', { className: 'dsh-rpr-page' }, style, h('p', { className: 'dsh-rpr-hint' }, t('failed')), message?.error ? h(PlainNote, { error: message.error }) : null);

      return h(
        'div',
        { className: 'dsh-rpr-page' },
        style,
        h('div', { className: 'dsh-rpr-head' }, embedded ? null : h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        rows.length === 0 ? h('p', { className: 'dsh-rpr-hint' }, t('empty')) : null,
        rows.map((row) =>
          h(
            'div',
            { className: 'dsh-rpr-card', key: row.name },
            h(
              'div',
              { className: 'dsh-rpr-cardhead' },
              h('b', null, row.name),
              h('span', { className: 'dsh-rpr-hint' }, t('on')),
              h('button', { type: 'button', role: 'switch', 'aria-checked': String(row.enabled), 'aria-label': `${t('on')}: ${row.name}`, className: 'dsh-rpr-switch', onClick: () => patch(row.name, { enabled: !row.enabled }) }),
              h('button', { type: 'button', className: 'dsh-rpr-btn', onClick: () => void remove(row.name) }, t('remove')),
            ),
            h('label', { className: 'dsh-rpr-field' }, h('span', null, t('text')), h('textarea', { className: 'dsh-rpr-area', rows: 5, maxLength: 20000, value: row.text, placeholder: t('text.placeholder'), 'aria-label': `${t('text')}: ${row.name}`, onChange: (event) => patch(row.name, { text: event.target.value }) })),
            h('label', { className: 'dsh-rpr-field' }, h('span', null, `${t('position')} (${t('position.hint')})`), h('input', { className: 'dsh-rpr-in narrow', type: 'number', step: 1, value: row.order, 'aria-label': `${t('position')}: ${row.name}`, onChange: (event) => patch(row.name, { order: Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : DEFAULT_ORDER }) })),
            tiers.length > 0
              ? h(
                  'div',
                  { className: 'dsh-rpr-field' },
                  h('span', null, `${t('only')}. ${t('only.hint')}`),
                  h(
                    'div',
                    { className: 'dsh-rpr-chips' },
                    // A tier named in the saved settings that no longer exists stays visible, so a save never drops it.
                    [...tiers, ...row.tiers.filter((id) => !tiers.some((one) => one.id === id)).map((id) => ({ id, label: id }))].map((tier) =>
                      h('button', { key: tier.id, type: 'button', className: 'dsh-rpr-chip', 'aria-pressed': String(row.tiers.includes(tier.id)), onClick: () => patch(row.name, { tiers: row.tiers.includes(tier.id) ? row.tiers.filter((id) => id !== tier.id) : [...row.tiers, tier.id] }) }, tier.label),
                    ),
                  ),
                )
              : null,
          ),
        ),
        h(
          'div',
          { className: 'dsh-rpr-bar' },
          h('button', { type: 'button', className: 'dsh-rpr-btn', onClick: () => void add() }, t('add')),
          h('span', { className: 'dsh-rpr-spacer' }),
          message?.error ? h(PlainNote, { error: message.error }) : message?.text ? h('span', { className: 'dsh-rpr-hint', role: 'status' }, message.text) : dirty ? h('span', { className: 'dsh-rpr-hint' }, t('dirty')) : null,
          h('button', { type: 'button', className: 'dsh-rpr-btn', disabled: !dirty || busy, onClick: () => void refresh() }, t('discard')),
          h('button', { type: 'button', className: 'dsh-rpr-btn primary', disabled: !dirty || busy, onClick: () => void save() }, t('save')),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('rolePrompts', DICT));
        const t = ctx.locale.bind('rolePrompts');
        // Shown as a tab of the Model Tiers page; its own page appears only without Model Tiers.
        ctx.effect(() => dshMerge.part('model-tiers', 'role-prompts', { label: () => t('section.title'), order: 200, render: (props) => h(RolePromptsPage, { ...props, appCtx: ctx, embedded: true }) }));
        ctx.effect(() =>
          dshMerge.ownPageUnlessHosted('model-tiers', () =>
            ctx.effect(() =>
              ctx.slots.inject('settings.section', () =>
                ctx.slots.register(
                  { name: 'settings.section', id: 'role-prompts', order: 211, label: () => t('section.title') },
                  (props) => h(RolePromptsPage, { ...props, appCtx: ctx }),
                ),
              ),
            ),
          ),
        );
      },
    };
  },
});
