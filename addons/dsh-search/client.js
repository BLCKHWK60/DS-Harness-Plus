/**
 * Global Search, browser half: the box that opens over the app with Cmd-K (Ctrl-K), or when the
 * sidebar's search button is pressed (the window event `dsh-search:open`).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-search',
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

    const NS = 'search';
    const DICT = { en: { title: 'Global search' } };
    const CSS = `
.dsh-gs-back { position: fixed; inset: 0; z-index: 400; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: color-mix(in srgb, #000 42%, transparent); }
.dsh-gs-box { width: min(680px, calc(100vw - 32px)); max-height: 70vh; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); border: 0.5px solid var(--dsw-alias-border-l2); box-shadow: 0 18px 60px rgba(0,0,0,.35); }
.dsh-gs-input { height: 48px; padding: 0 16px; border: 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); outline: 0; font: inherit; font-size: 16px; color: inherit; background: transparent; }
.dsh-gs-list { overflow-y: auto; padding: 6px 6px 8px; }
.dsh-gs-head { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-gs-item { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; text-align: left; cursor: pointer; font: inherit; color: inherit; background: transparent; }
.dsh-gs-item[data-on="true"] { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)); }
.dsh-gs-line { display: flex; align-items: baseline; gap: 8px; }
.dsh-gs-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.dsh-gs-when { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-gs-snip { margin-top: 2px; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.dsh-gs-item mark { color: inherit; font-weight: 600; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent); border-radius: 3px; }
.dsh-gs-foot { padding: 8px 14px; border-top: 0.5px solid var(--dsw-alias-border-l1); font-size: 11px; color: var(--dsw-alias-label-secondary); display: flex; justify-content: space-between; gap: 12px; }
.dsh-gs-empty { padding: 22px 14px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.dsh-gs-tag { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; border-radius: 6px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-gs-more { padding: 4px 10px 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
`;
    /**
     * Item 4A, stage 7 (decision 28): Plus is English only, so the page always asks the server for English, also when the
     * app is set to Chinese. The `lang` field stays in the request so an older server half keeps working.
     */
    const pageLang = () => 'en';
    /** Item 4A, stage 6b (7.3, Revision 2 G8): the words of the space grouping. */
    const SPACE_WORDS = { start: 'Type to search the titles and the text of your threads, in every space, and your projects.', none: 'Nothing found in any space.', more: 'and {n} more: type more of the name' };

    const readObject = (text) => {
      try {
        const value = JSON.parse(String(text ?? '') || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    };
    const wordsOf = (query) => String(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
    /** A text with the query's words in bold. */
    const bold = (text, words) => {
      const value = String(text ?? '');
      const flat = value.toLowerCase();
      const spans = [];
      for (const word of words) for (let at = flat.indexOf(word); at >= 0; at = flat.indexOf(word, at + word.length)) spans.push([at, at + word.length]);
      spans.sort((a, b) => a[0] - b[0]);
      const out = [];
      let done = 0;
      for (const [from, to] of spans) {
        if (to <= done) continue;
        const start = Math.max(from, done);
        if (start > done) out.push(value.slice(done, start));
        out.push(h('mark', { key: out.length }, value.slice(start, to)));
        done = to;
      }
      if (done < value.length) out.push(value.slice(done));
      return out;
    };
    const when = (at) => {
      const time = Number(at) || Date.parse(at) || 0;
      if (!time) return '';
      const days = Math.floor((Date.now() - time) / 86_400_000);
      return days <= 0 ? new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : days < 7 ? `${days}d` : new Date(time).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    };

    /**
     * The tabs in the owner's own order (the Cowork sidebar's `tabOrder`): those it names first, in
     * that order; others follow as usual; names of tabs not here are skipped. The same rule as
     * `orderTabs` in the Cowork sidebar's client.js.
     */
    function orderTabs(tabs, order) {
      const seen = new Set();
      for (const id of Array.isArray(order) ? order : []) {
        if (typeof id === 'string' && /^[A-Za-z0-9][\w-]{0,127}$/.test(id) && seen.size < 50) seen.add(id);
      }
      if (seen.size === 0) return tabs;
      const rank = new Map([...seen].map((id, i) => [id, i]));
      const named = tabs.filter((tab) => rank.has(tab.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
      return [...named, ...tabs.filter((tab) => !rank.has(tab.id))];
    }

    /** Everything the box searches in, read from the app as it is now. */
    async function gather(appCtx) {
      const get = (name) => { try { return appCtx.get(name); } catch { return undefined; } };
      const listed = get('sessions')?.list?.getSnapshot?.() ?? {};
      const byId = listed.byId ?? {};
      let modes = {};
      let tabOrder = [];
      let spaceOrder = [];
      try {
        const settings = await appCtx.remote.settings.describe();
        modes = settings.ok ? settings.value.namespaces.find((entry) => entry.ns === 'modes')?.value ?? {} : {};
        // The Cowork sidebar's own tab order, so results are grouped in the order the tabs show.
        const shell = settings.ok ? settings.value.namespaces.find((entry) => entry.ns === 'cowork-shell')?.value : undefined;
        tabOrder = shell?.tabOrder ?? [];
        // Item 4A, stage 6b: and its space order, so space headings come in the order the space buttons show.
        spaceOrder = Array.isArray(shell?.spaceOrder) ? shell.spaceOrder : [];
      } catch {
        modes = {};
      }
      const chosen = readObject(modes.sessionModes);
      const own = readObject(modes.modes);
      const tabs = orderTabs([...(Object.keys(own).length > 0 ? Object.entries(own) : [['chat', { label: 'Chat' }], ['cowork', { label: 'Cowork' }], ['code', { label: 'Code' }]]), ...Object.entries(readObject(modes.extraModes))]
        .map(([id, mode]) => ({ id, label: String(mode?.label ?? id) })), tabOrder);
      const sessions = (listed.ids ?? Object.keys(byId)).map((id) => byId[id]).filter((session) => session && session.origin !== 'subagent' && !session.blank)
        // Item 4A, stage 6a: the folder goes along, so the server hides a thread in Recon's room (belt).
        .map((session) => ({ id: session.id ?? session.sessionId, title: String(session.displayTitle ?? session.title ?? '').trim() || 'Untitled', updatedAt: session.updatedAt, tab: chosen[session.id ?? session.sessionId] ?? '', ...(typeof session.cwd === 'string' && session.cwd ? { cwd: session.cwd } : {}) }))
        .filter((session) => session.id);
      const spaces = get('workspaces')?.list?.getSnapshot?.();
      const projects = (Array.isArray(spaces) ? spaces : (spaces?.workspaces ?? spaces?.items ?? [])).filter((ws) => ws && typeof ws.path === 'string')
        .map((ws) => ({ id: ws.workspaceId, title: String(ws.title ?? '').trim() || ws.path.split('/').pop(), path: ws.path }));
      return { sessions, projects, tabs, tabOrder: Array.isArray(tabOrder) ? tabOrder : [], spaceOrder, lang: pageLang() };
    }

    /** How long one read of the thread list serves the box's searches (s7c lab: it was kept for as long as the box was open). */
    const BASE_FRESH_MS = 3000;
    function SearchBox({ appCtx, onClose, bySpace = false }) {
      const [query, setQuery] = useState('');
      const [found, setFound] = useState({ groups: [], projects: [], total: 0 });
      const [state, setState] = useState({ busy: false, note: '' });
      const [at, setAt] = useState(0);
      const input = useRef(null);
      const run = useRef(0);
      const base = useRef(null);
      // s7c lab: the thread list is read again when older than BASE_FRESH_MS, so threads made while the box stays open are found.
      const baseAt = useRef(0);
      useEffect(() => { input.current?.focus(); }, []);
      const search = useCallback(async (text) => {
        const mine = ++run.current;
        const words = wordsOf(text);
        if (words.length === 0) { setFound({ groups: [], projects: [], total: 0 }); setState({ busy: false, note: '' }); return; }
        setState({ busy: true, note: '' });
        try {
          if (!base.current || Date.now() - baseAt.current > BASE_FRESH_MS) {
            base.current = await gather(appCtx);
            baseAt.current = Date.now();
          }
          const query0 = text;
          const post = async (withText) => {
            const response = await fetch(new URL('dsh-search/match', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: query0, text: withText, ...base.current }) });
            if (!response.ok) throw dshKit.fail(`error ${response.status}`);
            return response.json();
          };
          // Titles first, at once; then the text of the messages, which takes a moment.
          const quick = await post(false);
          if (mine !== run.current) return;
          setFound(quick);
          setAt(0);
          if (query0.trim().length < 2) { setState({ busy: false, note: '' }); return; }
          const full = await post(true);
          if (mine !== run.current) return;
          setFound(full);
          setState({ busy: false, note: full.note || (full.more ? 'There are more matches than shown; add a word to narrow it down.' : '') });
        } catch (error) {
          if (mine === run.current) setState({ busy: false, note: `Search did not work: ${String(error?.message ?? error)}` });
        }
      }, [appCtx]);
      useEffect(() => {
        const timer = setTimeout(() => void search(query), 220);
        return () => clearTimeout(timer);
      }, [query, search]);

      const flat = [...found.groups.flatMap((group) => group.items.map((item) => ({ kind: 'chat', item }))), ...found.projects.map((item) => ({ kind: 'project', item }))];
      const open = (entry) => {
        if (!entry) return;
        try {
          appCtx.get('layout').selectPanel(null);
          if (entry.kind === 'chat') appCtx.get('uiWorkspace').openSession(entry.item.id);
          else appCtx.get('uiWorkspace').startSession(entry.item.id);
        } catch {
          /* the conversation or project is gone */
        }
        onClose();
      };
      const onKey = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); setAt((n) => Math.min(flat.length - 1, n + 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setAt((n) => Math.max(0, n - 1)); }
        else if (event.key === 'Enter') { event.preventDefault(); open(flat[at]); }
      };
      const words = wordsOf(query);
      let index = -1;
      const row = (entry, title, sub, right, tag = '') => {
        index += 1;
        const mine = index;
        return h('button', { key: `${entry.kind}:${entry.item.id}`, type: 'button', className: 'dsh-gs-item', 'data-on': String(mine === at), onMouseEnter: () => setAt(mine), onClick: () => open(entry) },
          h('div', { className: 'dsh-gs-line' }, h('span', { className: 'dsh-gs-name' }, bold(title, words)), tag ? h('span', { className: 'dsh-gs-tag' }, tag) : null, right ? h('span', { className: 'dsh-gs-when' }, right) : null),
          sub ? h('div', { className: 'dsh-gs-snip' }, bold(sub, words)) : null);
      };
      // Item 4A, stage 6b: grouped by space (the server says so), the first line and "nothing found" say "space".
      const spaced = found.bySpace === true || (found.groups.length === 0 && bySpace);
      const words6b = SPACE_WORDS;
      return h('div', { className: 'dsh-gs-back', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('style', null, CSS),
        h('div', { className: 'dsh-gs-box', role: 'dialog', 'aria-label': DICT.en.title },
          h('input', { ref: input, className: 'dsh-gs-input', type: 'text', value: query, placeholder: 'Search every thread and project…', spellCheck: false, autoComplete: 'off', onChange: (event) => setQuery(event.target.value), onKeyDown: onKey }),
          h('div', { className: 'dsh-gs-list' },
            words.length === 0 ? h('div', { className: 'dsh-gs-empty' }, spaced ? words6b.start : 'Type to search the titles and the text of your threads, in every mode, and your projects.')
              : found.total === 0 ? h('div', { className: 'dsh-gs-empty' }, state.busy ? 'Searching…' : spaced ? words6b.none : 'Nothing found.')
                : [
                  // Only the rows of `groups` are drawn: the ids in `hitIds` never are (Revision 2 L7).
                  ...found.groups.map((group) => h(React.Fragment, { key: group.tab }, h('div', { className: 'dsh-gs-head' }, group.label),
                    group.items.map((item) => row({ kind: 'chat', item }, item.title, item.snippet, when(item.updatedAt), typeof item.tag === 'string' ? item.tag : '')),
                    Number(group.more) > 0 ? h('div', { className: 'dsh-gs-more' }, words6b.more.replace('{n}', String(group.more))) : null)),
                  found.projects.length > 0 ? h(React.Fragment, { key: '__projects' }, h('div', { className: 'dsh-gs-head' }, 'Projects (starts a new thread there)'), found.projects.map((item) => row({ kind: 'project', item }, item.title, item.path, ''))) : null,
                ]),
          h('div', { className: 'dsh-gs-foot' }, h('span', null, state.note || (state.busy ? 'Searching the text of messages…' : words.length > 0 ? `${found.total} found` : '')), h('span', null, '↑ ↓ to move · Enter to open · Esc to close'))));
    }

    function Overlay({ appCtx }) {
      const [open, setOpen] = useState(false);
      const [bySpace, setBySpace] = useState(false);
      const shortcut = useRef(true);
      useEffect(() => {
        fetch(new URL('dsh-search/match', document.baseURI), { cache: 'no-store', credentials: 'same-origin' }).then((response) => response.json()).then((data) => { shortcut.current = data?.shortcut !== false; window.__dshGlobalSearchKey = shortcut.current; setBySpace(data?.bySpace === true); }).catch(() => {});
        const onKey = (event) => {
          // Plain Cmd-K, where the key reaches the page (the browser version). In the desktop app the
          // app takes the key first and runs its own command, which is pointed here (see `apply`).
          if (!shortcut.current || String(event.key).toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen((now) => !now);
        };
        const onAsk = () => setOpen(true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('dsh-search:open', onAsk);
        // Other add-ons show a search button only while this one is there.
        window.__dshGlobalSearch = true;
        window.dispatchEvent(new Event('dsh-search:ready'));
        return () => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('dsh-search:open', onAsk);
          window.__dshGlobalSearch = false;
          window.dispatchEvent(new Event('dsh-search:ready'));
        };
      }, []);
      return open ? h(SearchBox, { appCtx, bySpace, onClose: () => setOpen(false) }) : null;
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        // In the desktop app, Cmd-K never reaches the page: the app itself takes it for "search
        // sessions", which focuses the search field of the app's own sidebar. With the Cowork
        // sidebar that field is not there, so the shortcut did nothing. Its action is pointed at
        // Global Search instead, and put back when this add-on stops.
        ctx.effect(() => {
          let undo;
          let tries = 0;
          const take = () => {
            if (undo) return true;
            let command;
            try {
              const service = ctx.get('shortcuts');
              command = (service?.registry?.commands ?? service?.commands)?.get?.('session.search');
            } catch {
              command = undefined;
            }
            if (!command || typeof command.resolve !== 'function') return false;
            const original = command.resolve;
            command.resolve = (context) => (window.__dshGlobalSearchKey === false ? original(context) : { status: 'handled', run: () => window.dispatchEvent(new Event('dsh-search:open')) });
            undo = () => { command.resolve = original; };
            return true;
          };
          // The app registers its shortcut a moment after this add-on starts.
          const timer = setInterval(() => { tries += 1; if (take() || tries > 40) clearInterval(timer); }, 500);
          take();
          return () => { clearInterval(timer); undo?.(); };
        });
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'global-search', order: 80 }, () => h(Overlay, { appCtx: ctx }))));
      },
    };
  },
});
