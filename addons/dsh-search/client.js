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

    const NS = 'search';
    const DICT = { en: { title: 'Global Search' }, zh: { title: '全局搜索' } };
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
`;

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
      return days <= 0 ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : days < 7 ? `${days}d` : new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    /** Everything the box searches in, read from the app as it is now. */
    async function gather(appCtx) {
      const get = (name) => { try { return appCtx.get(name); } catch { return undefined; } };
      const listed = get('sessions')?.list?.getSnapshot?.() ?? {};
      const byId = listed.byId ?? {};
      let modes = {};
      try {
        const settings = await appCtx.remote.settings.describe();
        modes = settings.ok ? settings.value.namespaces.find((entry) => entry.ns === 'modes')?.value ?? {} : {};
      } catch {
        modes = {};
      }
      const chosen = readObject(modes.sessionModes);
      const own = readObject(modes.modes);
      const tabs = [...(Object.keys(own).length > 0 ? Object.entries(own) : [['chat', { label: 'Chat' }], ['cowork', { label: 'Cowork' }], ['code', { label: 'Code' }]]), ...Object.entries(readObject(modes.extraModes))]
        .map(([id, mode]) => ({ id, label: String(mode?.label ?? id) }));
      const sessions = (listed.ids ?? Object.keys(byId)).map((id) => byId[id]).filter((session) => session && session.origin !== 'subagent' && !session.blank)
        .map((session) => ({ id: session.id ?? session.sessionId, title: String(session.displayTitle ?? session.title ?? '').trim() || 'Untitled', updatedAt: session.updatedAt, tab: chosen[session.id ?? session.sessionId] ?? '' }))
        .filter((session) => session.id);
      const spaces = get('workspaces')?.list?.getSnapshot?.();
      const projects = (Array.isArray(spaces) ? spaces : (spaces?.workspaces ?? spaces?.items ?? [])).filter((ws) => ws && typeof ws.path === 'string')
        .map((ws) => ({ id: ws.workspaceId, title: String(ws.title ?? '').trim() || ws.path.split('/').pop(), path: ws.path }));
      return { sessions, projects, tabs };
    }

    function SearchBox({ appCtx, onClose }) {
      const [query, setQuery] = useState('');
      const [found, setFound] = useState({ groups: [], projects: [], total: 0 });
      const [state, setState] = useState({ busy: false, note: '' });
      const [at, setAt] = useState(0);
      const input = useRef(null);
      const run = useRef(0);
      const base = useRef(null);
      useEffect(() => { input.current?.focus(); }, []);
      const search = useCallback(async (text) => {
        const mine = ++run.current;
        const words = wordsOf(text);
        if (words.length === 0) { setFound({ groups: [], projects: [], total: 0 }); setState({ busy: false, note: '' }); return; }
        setState({ busy: true, note: '' });
        try {
          base.current = base.current ?? await gather(appCtx);
          const query0 = text;
          const post = async (withText) => {
            const response = await fetch(new URL('dsh-search/match', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: query0, text: withText, ...base.current }) });
            if (!response.ok) throw new Error(`error ${response.status}`);
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
      const row = (entry, title, sub, right) => {
        index += 1;
        const mine = index;
        return h('button', { key: `${entry.kind}:${entry.item.id}`, type: 'button', className: 'dsh-gs-item', 'data-on': String(mine === at), onMouseEnter: () => setAt(mine), onClick: () => open(entry) },
          h('div', { className: 'dsh-gs-line' }, h('span', { className: 'dsh-gs-name' }, bold(title, words)), right ? h('span', { className: 'dsh-gs-when' }, right) : null),
          sub ? h('div', { className: 'dsh-gs-snip' }, bold(sub, words)) : null);
      };
      return h('div', { className: 'dsh-gs-back', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('style', null, CSS),
        h('div', { className: 'dsh-gs-box', role: 'dialog', 'aria-label': 'Global Search' },
          h('input', { ref: input, className: 'dsh-gs-input', type: 'text', value: query, placeholder: 'Search every conversation and project…', spellCheck: false, autoComplete: 'off', onChange: (event) => setQuery(event.target.value), onKeyDown: onKey }),
          h('div', { className: 'dsh-gs-list' },
            words.length === 0 ? h('div', { className: 'dsh-gs-empty' }, 'Type to search the titles and the text of your conversations, in every tab, and your projects.')
              : found.total === 0 ? h('div', { className: 'dsh-gs-empty' }, state.busy ? 'Searching…' : 'Nothing found.')
                : [
                  ...found.groups.map((group) => h(React.Fragment, { key: group.tab }, h('div', { className: 'dsh-gs-head' }, group.label), group.items.map((item) => row({ kind: 'chat', item }, item.title, item.snippet, when(item.updatedAt))))),
                  found.projects.length > 0 ? h(React.Fragment, { key: '__projects' }, h('div', { className: 'dsh-gs-head' }, 'Projects (starts a new conversation there)'), found.projects.map((item) => row({ kind: 'project', item }, item.title, item.path, ''))) : null,
                ]),
          h('div', { className: 'dsh-gs-foot' }, h('span', null, state.note || (state.busy ? 'Searching the text of messages…' : words.length > 0 ? `${found.total} found` : '')), h('span', null, '↑ ↓ to move · Enter to open · Esc to close'))));
    }

    function Overlay({ appCtx }) {
      const [open, setOpen] = useState(false);
      const shortcut = useRef(true);
      useEffect(() => {
        fetch(new URL('dsh-search/match', document.baseURI), { cache: 'no-store', credentials: 'same-origin' }).then((response) => response.json()).then((data) => { shortcut.current = data?.shortcut !== false; window.__dshGlobalSearchKey = shortcut.current; }).catch(() => {});
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
      return open ? h(SearchBox, { appCtx, onClose: () => setOpen(false) }) : null;
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
