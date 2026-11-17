/**
 * Split Plus, browser half (step 1): the Split page. Two to four conversations side by side in one
 * window. Each pane is the app's own conversation view (the same piece the app uses to show a helper's
 * chat in its sidebar), bound to its own conversation, so each keeps its own mode, chat-box controls and
 * permission mode. A new pane opens in the same folder as the pane it is split from; a Recon pane opens
 * in Recon's own room. The tiling is only this page; the rules are in the server half and lib/panes.js.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-split-plus',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'split-plus';
    const DICT = { en: { 'section.title': 'Split Plus', 'page.title': 'Split' }, zh: { 'section.title': 'Split Plus', 'page.title': '分屏' } };
    const STORE_KEY = 'dsh-split-plus.panes.v1';
    const MAX_PANES = 4;

    const CSS = `
.dsh-sp-page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-sp-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); flex: none; }
.dsh-sp-bar .title { font-size: 14px; font-weight: 600; margin-right: 4px; }
.dsh-sp-bar .hint { color: var(--dsw-alias-label-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-grid { flex: 1; min-height: 0; display: grid; gap: 6px; padding: 6px; }
.dsh-sp-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; background: var(--dsw-alias-bg-base); container-type: inline-size; }
.dsh-sp-pane[data-focused="true"] { border-color: var(--dsw-alias-brand-primary); }
.dsh-sp-head { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 6px 0 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); flex: none; min-width: 0; }
.dsh-sp-abbr { flex: none; min-width: 22px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 6px; font-size: 11px; line-height: 20px; font-weight: 600; text-align: center; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dsh-sp-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.dsh-sp-folder { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-sp-state { flex: none; font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 9px; color: var(--dsw-alias-label-secondary); border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-sp-state[data-state="working"] { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-sp-state[data-state="blocked"] { color: var(--dsw-alias-label-primary); border-style: dashed; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-state[data-state="queued"] { color: var(--dsw-alias-label-primary); border-style: dashed; }
.dsh-sp-state[data-state="waiting"] { color: var(--dsw-alias-state-warning-primary, #b26b00); border-color: currentColor; }
.dsh-sp-grow { flex: 1; }
.dsh-sp-icon { flex: none; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 0; }
.dsh-sp-icon:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-sp-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dsh-sp-body > * { flex: 1; min-height: 0; }
@container (max-width: 300px) { .dsh-sp-name, .dsh-sp-folder { display: none; } }
@container (max-width: 200px) { .dsh-sp-state { display: none; } }
.dsh-sp-btn { height: 28px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 9px; cursor: pointer; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-sp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sp-btn:disabled { opacity: .5; cursor: default; }
.dsh-sp-btn[data-main="true"] { color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); border-color: transparent; }
.dsh-sp-pop { position: absolute; z-index: 50; top: 44px; left: 12px; width: 360px; max-width: calc(100% - 24px); box-sizing: border-box; padding: 14px 16px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); box-shadow: 0 8px 28px rgba(0,0,0,.18); display: flex; flex-direction: column; gap: 10px; }
.dsh-sp-pop label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-pop select, .dsh-sp-pop input, .dsh-sp-input { height: 30px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-sp-row { display: flex; gap: 8px; justify-content: flex-end; }
.dsh-sp-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sp-empty { margin: auto; max-width: 460px; padding: 24px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.dsh-sp-empty h2 { margin: 0; font-size: 18px; }
.dsh-sp-send { gap: 8px; }
.dsh-sp-choice { display: flex !important; flex-direction: row !important; align-items: center; gap: 6px; font-size: 13px !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-sp-choice select { flex: 1; min-width: 0; }
.dsh-sp-tray { display: flex; flex-direction: column; gap: 6px; margin: 0 0 6px; }
.dsh-sp-card { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-base)); }
.dsh-sp-cardhead { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; }
.dsh-sp-cardname { min-width: 0; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dsh-sp-cardrow { flex-wrap: wrap; justify-content: flex-end; }
.dsh-sp-preview { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.dsh-sp-float { position: fixed; z-index: 60; display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 13px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
.dsh-sp-files { display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; }
.dsh-sp-fileitem { text-align: left; border: 0; background: transparent; padding: 4px 6px; border-radius: 6px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-fileitem span { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-sp-fileitem:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sp-settings { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-sp-settings .group { margin: 18px 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-sp-settings .item { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-sp-settings .text { flex: 1; min-width: 0; }
.dsh-sp-settings .name { font-weight: 500; }
.dsh-sp-settings .desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-switch { position: relative; width: 36px; height: 20px; flex: none; border: 0; border-radius: 10px; cursor: pointer; background: var(--dsw-alias-border-l2); padding: 0; }
.dsh-sp-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 8px; background: var(--dsw-alias-bg-base); transition: transform .15s; }
.dsh-sp-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-sp-switch[aria-checked="true"]::after { transform: translateX(16px); }
`;

    /** Talk to the server half. */
    async function call(body, query = '') {
      const response = await fetch(new URL(`dsh-split-plus/data${query}`, document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }

    /** Save one of Split Plus's settings, once more after a clash with another save. */
    async function saveSetting(appCtx, path, value) {
      const settings = appCtx.remote.settings;
      const rowOf = async () => {
        const result = await settings.describe();
        return result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
      };
      const row = await rowOf();
      if (!row) throw new Error('Split Plus is not running.');
      let done = await settings.mutate(NS, [{ op: 'set', path: [path], value }], row.revision);
      if (!done.ok && done.error.code === 'settings/conflict') done = await settings.mutate(NS, [{ op: 'set', path: [path], value }], (await rowOf())?.revision);
      if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
    }

    /**
     * The panes of the Split page, owned by this plugin (so they stay while you look at another page)
     * and kept in this window's storage (so a reload brings them back).
     */
    function openPaneStore() {
      const listeners = new Set();
      let state = { panes: [], focus: '' };
      try {
        const saved = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null');
        if (saved && Array.isArray(saved.panes)) {
          state = {
            panes: saved.panes.filter((pane) => pane && typeof pane.id === 'string' && typeof pane.sessionId === 'string').slice(0, MAX_PANES).map((pane) => ({ id: pane.id, sessionId: pane.sessionId })),
            focus: typeof saved.focus === 'string' ? saved.focus : '',
          };
        }
      } catch { /* a damaged saved list starts empty */ }
      const set = (next) => {
        state = next;
        try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage full or off: the panes stay for this window */ }
        for (const listener of listeners) listener();
      };
      return {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => state,
        add(sessionId) {
          if (state.panes.some((pane) => pane.sessionId === sessionId)) { set({ ...state, focus: state.panes.find((pane) => pane.sessionId === sessionId).id }); return; }
          if (state.panes.length >= MAX_PANES) throw new Error(`A Split page holds at most ${MAX_PANES} panes.`);
          const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
          set({ panes: [...state.panes, { id, sessionId }], focus: id });
        },
        remove(id) {
          const panes = state.panes.filter((pane) => pane.id !== id);
          set({ panes, focus: state.focus === id ? (panes[0]?.id ?? '') : state.focus });
        },
        focus(id) { if (state.focus !== id) set({ ...state, focus: id }); },
        /** Put these conversations in the panes, in this order (a pane set coming back). */
        replace(sessionIds) {
          const panes = [...new Set(sessionIds)].slice(0, MAX_PANES).map((sessionId, index) => ({ id: `p${Date.now().toString(36)}${index}`, sessionId }));
          set({ panes, focus: panes[0]?.id ?? '' });
        },
        replaceSession(oldId, newId) {
          set({ ...state, panes: state.panes.map((pane) => (pane.sessionId === oldId ? { ...pane, sessionId: newId } : pane)) });
        },
      };
    }

    /** A snapshot source as a React value. */
    function useSource(source, fallback) {
      const subscribe = useCallback((listener) => (source?.subscribe ? source.subscribe(listener) : () => {}), [source]);
      const read = useCallback(() => (source?.getSnapshot ? source.getSnapshot() : fallback), [source, fallback]);
      return useSyncExternalStore(subscribe, read);
    }

    const EMPTY_LIST = { ids: [], byId: {} };
    const EMPTY_STATUS = new Map();

    function Icon({ d, size = 14 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
    }
    const ICON_SPLIT = 'M4 5h16v14H4zM12 5v14';
    const ICON_CLOSE = 'M6 6l12 12M18 6L6 18';
    const ICON_OPEN = 'M14 4h6v6M20 4l-8 8M18 14v5H5V6h5';
    const ICON_WATCH = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z';
    const ICON_UNWATCH = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM4 4l16 16';

    /** The conversation itself, inside its pane: the app's own view, as the app shows a helper's chat. */
    function FixedChat(props) {
      return props.renderSlot('conversation.session', { view: 'chat' });
    }
    function PaneConversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession((value) => value);
      const conversation = useConversation((value) => value);
      const active = conversation.activeTargets.size > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running;
      const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank';
      const summaryBlank = useSessions((state) => state.byId[sessionId]?.blank);
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true;
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true);
      const phase = settling ? 'settling' : hero ? 'hero' : 'active';
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: { views: FixedChat } });
    }

    /** One pane: its title (mode, folder, state) and its live conversation. */
    function Pane({ appCtx, store, pane, facts, summary, status, localWait, fileWait, focused, onFocus, onClose, SessionProvider, renderSlot }) {
      const [reference, setReference] = useState(null);
      const [error, setError] = useState('');
      useEffect(() => {
        const sessions = appCtx.get('sessions');
        if (!sessions?.retain) { setError('This version of the app cannot show a conversation here.'); return undefined; }
        const controller = new AbortController();
        let held;
        try {
          held = sessions.retain(pane.sessionId, { source: 'splitPlus', signal: controller.signal });
          setReference(held);
          held.ready?.catch?.((problem) => setError(`This conversation could not be opened: ${problem?.message ?? problem}`));
        } catch (problem) {
          setError(`This conversation could not be opened: ${problem?.message ?? problem}`);
        }
        return () => { controller.abort(); try { held?.release(); } catch { /* already released */ } setReference(null); };
      }, [appCtx, pane.sessionId]);
      const state = status?.pendingInteraction ? 'waiting' : fileWait ? 'blocked' : localWait ? 'queued' : (status?.running ?? summary?.running) ? 'working' : summary?.blank ? 'new' : 'done';
      const stateText = { waiting: 'Waiting for you', blocked: fileWait ? (fileWait.kind === 'command' ? `Waiting: the ${fileWait.holder} pane is running a command in ${fileWait.file}` : `Waiting: the ${fileWait.holder} pane is changing ${fileWait.file}`) : '', queued: 'Waiting for the local model', working: 'Working', new: 'New', done: 'Done' }[state];
      const label = facts?.label ?? '…';
      const title = `${label}${facts?.folder ? ` · ${facts.folder}` : ''} · ${stateText}${summary?.displayTitle ? `\n${summary.displayTitle}` : ''}${summary?.cwd ? `\n${summary.cwd}` : ''}`;
      return h('section', { className: 'dsh-sp-pane', 'data-focused': focused ? 'true' : 'false', 'data-split-pane': pane.id, onMouseDownCapture: onFocus, onFocusCapture: onFocus },
        h('div', { className: 'dsh-sp-head', title },
          h('span', { className: 'dsh-sp-abbr', 'aria-label': label }, facts?.abbr ?? '…'),
          h('span', { className: 'dsh-sp-name' }, summary?.displayTitle || label),
          facts?.folder ? h('span', { className: 'dsh-sp-folder' }, `· ${facts.folder}`) : null,
          h('span', { className: 'dsh-sp-grow' }),
          h('span', { className: 'dsh-sp-state', 'data-state': state }, stateText),
          facts?.watching ? h('span', { className: 'dsh-sp-folder', title: 'This pane only reads the other pane and answers you; it cannot change, message or stop it' }, `· watching ${facts.watchingLabel}`) : null,
          facts?.watching ? h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Stop watching (the conversation stays)', 'aria-label': 'Stop watching', onClick: () => void call({ action: 'unwatch', watcher: pane.sessionId }).catch(() => {}) }, h(Icon, { d: ICON_UNWATCH })) : null,
          !facts?.watching && facts && !facts.sealed ? h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Watch this pane from a Chat pane beside it: ask what it is doing, without touching it', 'aria-label': 'Watch this pane', onClick: () => void startWatcher(appCtx, store, pane.sessionId).catch((error) => window.alert(`Split Plus: ${error.message}`)) }, h(Icon, { d: ICON_WATCH })) : null,
          h(FileSend, { appCtx, store, sessionId: pane.sessionId }),
          h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Open this conversation on its own (it stays in the Split page too)', 'aria-label': 'Open on its own', onClick: () => appCtx.get('uiWorkspace')?.openSession?.(pane.sessionId) }, h(Icon, { d: ICON_OPEN })),
          h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Take this pane out of the Split page (the conversation is kept)', 'aria-label': 'Close pane', onClick: onClose }, h(Icon, { d: ICON_CLOSE }))),
        h('div', { className: 'dsh-sp-body' },
          error ? h('p', { className: 'dsh-sp-note', 'data-error': 'true', style: { padding: 12 } }, error)
            : reference ? h(SessionProvider, { session: reference }, renderSlot('splitplus.pane', {})) : null));
    }

    /** The folders the app knows from its conversations (no folder picker: you choose from these or type one). */
    function knownFolders(list) {
      const seen = new Map();
      for (const id of list.ids ?? []) {
        const row = list.byId?.[id];
        if (!row?.cwd || row.parentId || row.origin === 'subagent') continue;
        if (/\/scratch\/[^/]+\/?$/.test(row.cwd) || /dsh-recon/.test(row.cwd)) continue;
        if (!seen.has(row.cwd)) seen.set(row.cwd, row.updatedAt ?? 0);
      }
      return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([cwd]) => cwd).slice(0, 30);
    }

    /** A folder of the owner's (not Scratch, not Recon's room): the folders pane sets are kept for. */
    function realFolder(cwd) {
      const path = String(cwd ?? '');
      if (!path.startsWith('/') || /\/scratch(\/|$)/.test(path) || /\/dsh-recon[^/]*(\/|$)/.test(path)) return '';
      return path;
    }

    /** Pane sets: save these panes under a name, open a named set here, remove one. */
    function PaneSets({ appCtx, store, data, list, from, onClose }) {
      const state = useSyncExternalStore(store.subscribe, store.get);
      const [named, setNamed] = useState(null);
      const [name, setName] = useState('');
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const read = useCallback(() => call(null, '?sets=1').then((value) => setNamed(value.named ?? []), (error) => setNote(error.message)), []);
      useEffect(() => { void read(); }, [read]);
      useEffect(() => {
        const labels = state.panes.map((pane) => data?.panes?.[pane.sessionId]?.label).filter(Boolean);
        if (!name) setName(labels.join(', '));
      }, [state.panes, data]);
      const run = async (work) => {
        setBusy(true);
        setNote('');
        try { await work(); } catch (error) { setNote(error.message); } finally { setBusy(false); }
      };
      const open = (set) => run(async () => {
        // New conversations of these tabs, in the selected pane's folder (a sealed tab only in its room).
        const ids = [];
        for (const pane of set.panes) ids.push(await startConversation(appCtx, data, { mode: pane.mode, choice: from?.cwd ? 'same' : 'scratch', from }));
        store.replace(ids);
        onClose();
      });
      return h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Pane sets' },
        h('strong', null, 'Pane sets'),
        h('p', { className: 'dsh-sp-note' }, 'A pane set keeps tabs and their order (never a permission or a sign-in). Opening one starts new conversations of those tabs in the selected pane\'s folder. The panes open for a folder come back by themselves when you open that folder again.'),
        state.panes.length > 0 ? h('label', null, 'Save these panes as',
          h('div', { className: 'dsh-sp-row' },
            h('input', { className: 'dsh-sp-input', style: { flex: 1 }, value: name, onChange: (event) => setName(event.target.value) }),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy || !name.trim(), onClick: () => void run(async () => { await call({ action: 'saveSet', name, sessionIds: state.panes.map((pane) => pane.sessionId) }); await read(); setNote('Saved.'); }) }, 'Save'))) : null,
        named === null ? h('p', { className: 'dsh-sp-note' }, 'Loading…')
          : named.length === 0 ? h('p', { className: 'dsh-sp-note' }, 'No pane set yet.')
            : h('div', { className: 'dsh-sp-files' }, named.map((set) => h('div', { key: set.name, className: 'dsh-sp-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { className: 'dsh-sp-cardname' }, `${set.name} (${set.panes.map((pane) => data?.modes?.find((row) => row.id === pane.mode)?.label ?? pane.mode).join(', ')})`),
              h('span', { className: 'dsh-sp-row' },
                h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy, onClick: () => void run(async () => { await call({ action: 'dropSet', name: set.name }); await read(); }) }, 'Remove'),
                h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy, onClick: () => void open(set) }, 'Open here'))))),
        note ? h('p', { className: 'dsh-sp-note' }, note) : null,
        h('div', { className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', onClick: onClose }, 'Close')));
    }

    /** The same folder, ignoring a trailing slash and macOS's /private prefix for /tmp. */
    function sameFolder(a, b) {
      const plain = (path) => String(path ?? '').replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '');
      return plain(a) !== '' && plain(a) === plain(b);
    }
    /** The project (the app's workspace) a conversation belongs to, if any. */
    function workspaceOf(appCtx, sessionId) {
      const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items ?? [];
      return items.find((item) => (item.sessionIds ?? []).includes(sessionId));
    }
    /** The project of a folder: the one the app has, or a new one (named, for a scratch place or a room). */
    async function projectFor(appCtx, path, title = '') {
      const workspaces = appCtx.get('workspaces');
      if (!workspaces?.create) throw new Error('This version of the app cannot add a project from here.');
      const found = (workspaces.list?.getSnapshot?.()?.items ?? []).find((item) => sameFolder(item.path, path));
      if (found?.workspaceId) return found.workspaceId;
      const made = await workspaces.create({ path });
      if (title) {
        try { await workspaces.rename(made.workspaceId, title); } catch { /* the folder's own name is fine */ }
      }
      return made.workspaceId;
    }

    /**
     * Start a new conversation in a tab and a place: the same folder as `from`, a scratch thread, or another
     * folder; a sealed tab (Recon) only in its own room. Made in its folder's project, then given its tab.
     * @returns {Promise<string>} the new conversation.
     */
    async function startConversation(appCtx, data, { mode, choice, folder = '', from = null }) {
      const sealed = data.modes?.find((row) => row.id === mode)?.sealed === true;
      const sessions = appCtx.get('sessions');
      if (!sessions?.create) throw new Error('This version of the app cannot start a conversation from here.');
      // Every sealed tab's room (Recon's): its own pane opens there, and no other pane ever does.
      const rooms = {};
      for (const row of (data.modes ?? []).filter((one) => one.sealed)) {
        try {
          const response = await fetch(new URL(`dsh-${row.id}/state`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const place = response.ok ? String((await response.json()).room ?? '') : '';
          if (place) rooms[row.id] = place;
        } catch { /* that tab is off: it has no room to keep others out of */ }
      }
      const placed = (await call({ action: 'place', mode, choice, folder, fromCwd: from?.cwd ?? '', fromSessionId: from?.sessionId ?? '', room: sealed ? (rooms[mode] ?? '') : '', rooms: Object.values(rooms) })).place;
      if (placed.kind === 'refused') throw new Error(placed.why);
      let cwd = placed.cwd;
      let title = '';
      if (placed.kind === 'scratch') {
        const response = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        const answer = response.ok ? await response.json() : {};
        cwd = String(answer.place ?? '');
        title = String(answer.title || 'Scratch');
        if (!cwd) throw new Error('Scratch is not available here (it needs the Cowork sidebar). Pick a folder instead.');
      } else if (sealed) {
        title = `${data.modes.find((row) => row.id === mode)?.label ?? mode} room`;
      }
      // The app lets you type in a new conversation once it belongs to a project, so it is made in the
      // project of its folder: the same project as the pane it is split from, or the folder's own.
      const sameProject = placed.kind === 'cwd' && choice === 'same' && !sealed && from?.sessionId ? workspaceOf(appCtx, from.sessionId) : undefined;
      const workspaceId = sameProject && sameFolder(sameProject.path, cwd) ? sameProject.workspaceId : await projectFor(appCtx, cwd, title);
      const child = await sessions.create({ workspaceId });
      await call({ action: 'claim', sessionId: child, mode });
      return child;
    }

    /**
     * A watcher for a pane: a new Chat conversation (in Scratch) that reads the watched pane's run and
     * answers about it; it starts on the Watcher model from Settings → Split Plus, which its own model
     * menu can change. A sealed pane (Recon) is never watched.
     */
    async function startWatcher(appCtx, store, watched) {
      const data = await call(null, `?sessions=${encodeURIComponent(watched)}`);
      if (data.panes?.[watched]?.sealed) throw new Error('A sealed conversation (Recon) cannot be watched.');
      const child = await startConversation(appCtx, data, { mode: 'chat', choice: 'scratch' });
      await call({ action: 'watch', watcher: child, watched });
      const chosen = String(data.watcherModel ?? '').trim();
      if (chosen.includes('/')) {
        const at = chosen.indexOf('/');
        const remote = appCtx.get('remote.session');
        try {
          const done = await remote?.selectModel?.({ sessionId: child, provider: chosen.slice(0, at), model: chosen.slice(at + 1) });
          if (done && done.ok === false) throw new Error(done.error?.message ?? 'not chosen');
        } catch (error) {
          // The watcher still works on the app's usual model; the pane's model menu can change it.
          console.warn(`split-plus: the watcher model ${chosen} was not chosen (${error?.message ?? error})`);
        }
      }
      try { store.add(child); } catch { appCtx.get('uiWorkspace')?.openSession?.(child); }
      return child;
    }

    /** The Add pane window: a new conversation in a mode and a place, or a conversation you already have. */
    function AddPane({ appCtx, data, list, panes, from, onDone, onCancel }) {
      const [kind, setKind] = useState('new');
      const [mode, setMode] = useState(data.modes?.[0]?.id ?? 'chat');
      const [choice, setChoice] = useState(from ? 'same' : 'scratch');
      const [folder, setFolder] = useState('');
      const [existing, setExisting] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const folders = useMemo(() => knownFolders(list), [list]);
      const recent = useMemo(() => (list.ids ?? []).map((id) => list.byId[id]).filter((row) => row && !row.parentId && row.origin !== 'subagent' && !row.blank && !panes.some((pane) => pane.sessionId === row.id)).slice(0, 40), [list, panes]);
      const sealed = data.modes?.find((row) => row.id === mode)?.sealed === true;
      const go = async () => {
        setBusy(true);
        setError('');
        try {
          if (kind === 'existing') {
            if (!existing) throw new Error('Pick a conversation.');
            onDone(existing);
            return;
          }
          const child = await startConversation(appCtx, data, { mode, choice, folder, from });
          onDone(child);
        } catch (problem) {
          setError(problem?.message ?? String(problem));
        } finally {
          setBusy(false);
        }
      };
      return h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Add a pane' },
        h('label', null, 'What',
          h('select', { value: kind, onChange: (event) => setKind(event.target.value) },
            h('option', { value: 'new' }, 'A new conversation'),
            h('option', { value: 'existing' }, 'A conversation I already have'))),
        kind === 'existing'
          ? h('label', null, 'Conversation',
            h('select', { value: existing, onChange: (event) => setExisting(event.target.value) },
              h('option', { value: '' }, recent.length ? 'Choose…' : 'None to choose from'),
              recent.map((row) => h('option', { key: row.id, value: row.id }, row.displayTitle || row.id))))
          : [
            h('label', { key: 'mode' }, 'Mode',
              h('select', { value: mode, onChange: (event) => setMode(event.target.value) }, (data.modes ?? []).map((row) => h('option', { key: row.id, value: row.id }, row.label)))),
            sealed
              ? h('p', { key: 'room', className: 'dsh-sp-note' }, 'A sealed tab works only in its own room, never in a shared folder.')
              : h('label', { key: 'place' }, 'Folder',
                h('select', { value: choice, onChange: (event) => setChoice(event.target.value) },
                  from ? h('option', { value: 'same' }, `Same folder as the selected pane${from.cwd ? ` (${from.cwd.split('/').pop()})` : ''}`) : null,
                  h('option', { value: 'scratch' }, 'A scratch thread (its own new folder)'),
                  h('option', { value: 'folder' }, 'Another folder…'))),
            !sealed && choice === 'folder'
              ? h('label', { key: 'folder' }, 'Which folder',
                h('input', { list: 'dsh-sp-folders', value: folder, placeholder: '/Users/you/Projects/…', onChange: (event) => setFolder(event.target.value) }),
                h('datalist', { id: 'dsh-sp-folders' }, folders.map((path) => h('option', { key: path, value: path }))))
              : null,
          ],
        error ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, error) : null,
        h('div', { className: 'dsh-sp-row' },
          h('button', { type: 'button', className: 'dsh-sp-btn', onClick: onCancel, disabled: busy }, 'Cancel'),
          h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void go(), disabled: busy }, busy ? 'Opening…' : 'Add pane')));
    }

    /** The Split page. */
    function SplitPage({ appCtx, store, SessionProvider, renderSlot }) {
      const state = useSyncExternalStore(store.subscribe, store.get);
      const list = useSource(appCtx.get('sessions')?.list, EMPTY_LIST);
      const status = useSource(appCtx.get('uiSession')?.sessionStatus, EMPTY_STATUS);
      const [data, setData] = useState(null);
      const [adding, setAdding] = useState(false);
      const [error, setError] = useState('');
      const seeded = useRef(false);

      const [setsOpen, setSetsOpen] = useState(false);
      const [offer, setOffer] = useState(null);
      const selected = appCtx.get('uiWorkspace')?.selection?.getSnapshot?.()?.sessionId ?? '';
      const selectedFolder = realFolder(list.byId?.[selected]?.cwd);
      const paneFolder = useMemo(() => {
        for (const pane of state.panes) {
          const folder = realFolder(list.byId?.[pane.sessionId]?.cwd);
          if (folder) return folder;
        }
        return '';
      }, [state.panes, list]);
      // An empty Split page starts with the panes last open for the folder you were in, else that conversation.
      useEffect(() => {
        if (seeded.current || state.panes.length > 0 || !list.ids?.length) return;
        seeded.current = true;
        void (async () => {
          if (selectedFolder) {
            const saved = await call(null, `?sets=1&folder=${encodeURIComponent(selectedFolder)}`).catch(() => null);
            const ids = (saved?.folder?.panes ?? []).map((pane) => pane.sessionId).filter((id) => list.byId?.[id]);
            if (ids.length > 0) { store.replace(ids); return; }
          }
          if (selected) {
            try { store.add(selected); } catch { /* full */ }
          }
        })();
      }, [appCtx, store, state.panes.length, list, selected, selectedFolder]);
      // The panes open for a folder are kept for it.
      const paneKey = state.panes.map((pane) => pane.sessionId).join(',');
      useEffect(() => {
        if (!paneFolder || data?.enabled !== true) return;
        call({ action: 'saveFolder', folder: paneFolder, sessionIds: state.panes.map((pane) => pane.sessionId) }).catch(() => {});
      }, [paneFolder, paneKey, data?.enabled]);
      // You came from a conversation in another folder that has panes kept: offer to bring them back.
      useEffect(() => {
        let alive = true;
        if (!selectedFolder || selectedFolder === paneFolder) { setOffer(null); return undefined; }
        call(null, `?sets=1&folder=${encodeURIComponent(selectedFolder)}`).then((value) => {
          const ids = (value.folder?.panes ?? []).map((pane) => pane.sessionId).filter((id) => list.byId?.[id]);
          if (alive) setOffer(ids.length > 0 ? { folder: selectedFolder, ids } : null);
        }, () => {});
        return () => { alive = false; };
      }, [selectedFolder, paneFolder]);

      const query = useMemo(() => {
        const ids = state.panes.map((pane) => pane.sessionId);
        const cwds = Object.fromEntries(ids.map((id) => [id, list.byId?.[id]?.cwd ?? '']));
        return `?sessions=${encodeURIComponent(ids.join(','))}&cwds=${encodeURIComponent(JSON.stringify(cwds))}`;
      }, [state.panes, list]);
      useEffect(() => {
        let alive = true;
        const read = () => call(null, query).then((value) => { if (alive) { setData(value); setError(''); } }, (problem) => { if (alive) setError(problem.message); });
        read();
        // A pane's mode can change from its own mode button: read again now and then.
        const timer = setInterval(read, 5000);
        return () => { alive = false; clearInterval(timer); };
      }, [query]);

      if (data && data.enabled !== true) {
        return h('div', { className: 'dsh-sp-page' }, h('style', null, CSS),
          h('div', { className: 'dsh-sp-empty' }, h('h2', null, 'Split Plus is off'), h('p', { className: 'dsh-sp-note' }, 'Switch it on in Settings → Split Plus to put conversations side by side.')));
      }
      const focusedPane = state.panes.find((pane) => pane.id === state.focus) ?? state.panes[0];
      const from = focusedPane ? { sessionId: focusedPane.sessionId, cwd: list.byId?.[focusedPane.sessionId]?.cwd ?? '' } : null;
      const full = state.panes.length >= MAX_PANES;
      return h('div', { className: 'dsh-sp-page' },
        h('style', null, CSS),
        h('div', { className: 'dsh-sp-bar' },
          h('span', { className: 'title' }, 'Split'),
          h('button', { type: 'button', className: 'dsh-sp-btn', disabled: full || !data, title: full ? `At most ${MAX_PANES} panes` : 'Open another conversation beside these', onClick: () => { setAdding(!adding); setSetsOpen(false); } }, '＋ Add pane'),
          h('button', { type: 'button', className: 'dsh-sp-btn', disabled: !data, onClick: () => { setSetsOpen(!setsOpen); setAdding(false); } }, 'Pane sets'),
          offer ? h('button', { type: 'button', className: 'dsh-sp-btn', title: offer.folder, onClick: () => { store.replace(offer.ids); setOffer(null); } }, `Bring back the ${offer.ids.length} pane${offer.ids.length === 1 ? '' : 's'} of ${offer.folder.split('/').pop()}`) : null,
          (data?.danger ?? []).length > 0 ? h('span', { className: 'dsh-sp-state', 'data-danger': 'true', style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'currentColor' }, title: data.danger.map((one) => one.what).join('\n') }, `⚠ Danger zone: ${data.danger.length} rule${data.danger.length === 1 ? '' : 's'} off`) : null,
          h('span', { className: 'hint' }, error ? `Split Plus: ${error}` : state.panes.length ? 'Each pane is a full conversation: its own mode, its own buttons, its own permission mode.' : '')),
        setsOpen && data ? h(PaneSets, { appCtx, store, data, list, from, onClose: () => setSetsOpen(false) }) : null,
        adding && data ? h(AddPane, {
          appCtx, data, list, panes: state.panes, from,
          onCancel: () => setAdding(false),
          onDone: (sessionId) => {
            try { store.add(sessionId); setAdding(false); } catch (problem) { setError(problem.message); }
          },
        }) : null,
        state.panes.length === 0
          ? h('div', { className: 'dsh-sp-empty' },
            h('h2', null, 'Conversations side by side'),
            h('p', { className: 'dsh-sp-note' }, 'Add a pane to start. A pane opened from another one works in the same folder, so Code can work while you research or ask beside it.'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: !data, onClick: () => setAdding(true) }, '＋ Add pane'))
          : h('div', { className: 'dsh-sp-grid', style: { gridTemplateColumns: `repeat(${state.panes.length}, minmax(0, 1fr))` } },
            state.panes.map((pane) => h(Pane, {
              key: pane.id, appCtx, store, pane,
              facts: data?.panes?.[pane.sessionId],
              summary: list.byId?.[pane.sessionId],
              status: status?.get?.(pane.sessionId),
              localWait: (data?.waitingLocal ?? []).includes(pane.sessionId),
              fileWait: data?.waitingFile?.[pane.sessionId] ?? null,
              focused: state.panes.length > 1 && pane.id === focusedPane?.id,
              onFocus: () => store.focus(pane.id),
              onClose: () => store.remove(pane.id),
              SessionProvider, renderSlot,
            }))));
    }

    // ---- Send to (step 3) -------------------------------------------------------------------------

    /**
     * Send a message into a conversation. 'queue' starts it now, or holds it until its running turn ends
     * (the app's own queue, with its own Steer); 'steer' hands it to the running turn at its next step.
     */
    async function promptInto(appCtx, sessionId, text, mode = 'queue') {
      const remote = appCtx.get('remote.session');
      if (!remote?.prompt) throw new Error('This version of the app cannot send a message from here.');
      const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `split-${Date.now()}`, sessionId, mode, content: [{ type: 'text', text }] });
      if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the message was not sent');
    }

    /** Where a floating window opens: near a rectangle, inside the window. */
    function placeNear(rect, width = 380, height = 360) {
      const left = Math.max(8, Math.min((rect?.left ?? 40), window.innerWidth - width - 8));
      const below = (rect?.bottom ?? 40) + 6;
      const top = below + height > window.innerHeight ? Math.max(8, (rect?.top ?? 40) - height - 6) : below;
      return { left, top };
    }

    const KIND_WORDS = { selection: 'the selection', message: 'this answer', error: 'this error', file: 'this file', result: 'this result' };

    /**
     * The Send to window: the open panes by name, a new chat in a tab, or a conversation you already
     * have; "Send" puts a card in its chat box, "Send and start" sends it there at once. Nothing is sent
     * without one of these two clicks (the owner's fixed rule 1).
     */
    function SendMenu({ appCtx, store, fromSessionId, kind, file = '', getText, place, onClose }) {
      const list = useSource(appCtx.get('sessions')?.list, EMPTY_LIST);
      const state = useSyncExternalStore(store.subscribe, store.get);
      const others = state.panes.map((pane) => pane.sessionId).filter((id) => id !== fromSessionId);
      const [data, setData] = useState(null);
      const [target, setTarget] = useState('');
      const [mode, setMode] = useState('');
      const [existing, setExisting] = useState('');
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const [error, setError] = useState(false);
      const key = others.join(',');
      useEffect(() => {
        let alive = true;
        call(null, `?sessions=${encodeURIComponent([fromSessionId, ...others].join(','))}`).then((value) => {
          if (!alive) return;
          setData(value);
          setMode(value.modes?.find((row) => !row.sealed)?.id ?? '');
          const firstPane = others.find((id) => value.panes?.[id] && !value.panes[id].sealed);
          setTarget(firstPane ? `pane:${firstPane}` : 'new');
        }, (problem) => { if (alive) { setNote(problem.message); setError(true); } });
        return () => { alive = false; };
      }, [fromSessionId, key]);
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      const recent = useMemo(() => (list.ids ?? []).map((id) => list.byId[id]).filter((row) => row && row.id !== fromSessionId && !row.parentId && row.origin !== 'subagent' && !row.blank && !/\/dsh-recon[^/]*(\/|$)/.test(row.cwd ?? '')).slice(0, 40), [list, fromSessionId]);
      const sealedFrom = data?.panes?.[fromSessionId]?.sealed === true;
      // Research to Content travels as a research packet (Content's own "bring": the claims with their sources and grades).
      const toPane = target.startsWith('pane:') ? target.slice(5) : '';
      const packetDoor = data?.panes?.[fromSessionId]?.mode === 'research' && Boolean(toPane) && data?.panes?.[toPane]?.mode === 'content';
      const [reports, setReports] = useState(null);
      const [report, setReport] = useState('');
      useEffect(() => {
        if (!packetDoor || reports !== null) return undefined;
        let alive = true;
        fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'reports' }) })
          .then((response) => (response.ok ? response.json() : {})).then((value) => { if (alive) { setReports(value.reports ?? []); setReport(value.reports?.[0]?.name ?? ''); } }, () => { if (alive) setReports([]); });
        return () => { alive = false; };
      }, [packetDoor, reports]);
      const go = async (start) => {
        setBusy(true);
        setNote('');
        setError(false);
        try {
          let to = '';
          if (target.startsWith('pane:')) to = target.slice(5);
          else if (target === 'existing') to = existing;
          else if (target === 'new') {
            if (!mode) throw new Error('Pick a tab.');
            to = await startConversation(appCtx, data, { mode, choice: 'scratch' });
          }
          if (!to) throw new Error('Pick where it goes.');
          if (packetDoor && report) {
            // Content brings the packet in (new dated files, the claims in its ledger with origin "research"),
            // then the Content conversation gets a card saying so.
            const response = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'receive', sessionId: to, report }) });
            const answer = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(answer.error || `Content said no (${response.status})`);
            const title = list.byId?.[fromSessionId]?.displayTitle ?? '';
            const done = await call({ action: 'send', fromSessionId, fromTitle: title, toSessionId: to, kind: 'result', text: `The user sent the Research report ${report} as a research packet. ${answer.received?.text ?? ''}`, file: report, start });
            if (start && done.text) await promptInto(appCtx, to, done.text, 'queue');
            setNote(start ? 'The packet is in Content\'s ledger, and that conversation goes on.' : 'The packet is in Content\'s ledger; a card in that conversation\'s chat box says so.');
            setTimeout(onClose, 1800);
            return;
          }
          const text = await getText();
          const title = list.byId?.[fromSessionId]?.displayTitle ?? '';
          const done = await call({ action: 'send', fromSessionId, fromTitle: title, toSessionId: to, kind, text, file, start });
          if (start && done.text) await promptInto(appCtx, to, done.text, 'queue');
          if (target === 'new' || target === 'existing') {
            // Show where it went: a pane when there is room, else that conversation itself.
            try { store.add(to); } catch { appCtx.get('uiWorkspace')?.openSession?.(to); }
          }
          setNote(start ? 'Sent: that conversation has it and goes on (after its running turn, if one is running).' : 'Sent: the card waits in that conversation\'s chat box until you send it there.');
          setTimeout(onClose, 1600);
        } catch (problem) {
          setNote(problem?.message ?? String(problem));
          setError(true);
        } finally {
          setBusy(false);
        }
      };
      const option = (value, label, extra = null) => h('label', { key: value, className: 'dsh-sp-choice' },
        h('input', { type: 'radio', name: 'dsh-sp-target', checked: target === value, onChange: () => setTarget(value) }),
        h('span', null, label), extra);
      return ReactDOM.createPortal(h('div', { className: 'dsh-sp-pop dsh-sp-send', role: 'dialog', 'aria-label': 'Send to', style: { position: 'fixed', left: place.left, top: place.top } },
        h('style', null, CSS),
        h('div', { className: 'dsh-sp-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
          h('strong', null, `Send ${KIND_WORDS[kind] ?? 'this'} to…`),
          h('button', { type: 'button', className: 'dsh-sp-icon', 'aria-label': 'Close', onClick: onClose }, h(Icon, { d: ICON_CLOSE }))),
        !data && !note ? h('p', { className: 'dsh-sp-note' }, 'Loading…') : null,
        data && sealedFrom ? [
          h('p', { key: 'sealed', className: 'dsh-sp-note' }, 'This conversation is sealed (Recon). Nothing leaves it except through its own Export window, after its run.'),
          h('div', { key: 'door', className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => { window.dispatchEvent(new CustomEvent('dsh-split-plus:recon-export', { detail: { sessionId: fromSessionId } })); onClose(); } }, 'Open Recon\'s Export…')),
        ] : null,
        data && !sealedFrom ? [
          ...others.filter((id) => data.panes?.[id] && !data.panes[id].sealed).map((id) => option(`pane:${id}`, `The ${data.panes[id].label} pane${list.byId?.[id]?.displayTitle ? ` — ${list.byId[id].displayTitle.slice(0, 48)}${list.byId[id].displayTitle.length > 48 ? '…' : ''}` : ''}`)),
          option('new', 'A new chat in', h('select', { value: mode, onChange: (event) => { setMode(event.target.value); setTarget('new'); } }, (data.modes ?? []).filter((row) => !row.sealed).map((row) => h('option', { key: row.id, value: row.id }, row.label)))),
          option('existing', 'A conversation I have', h('select', { value: existing, onChange: (event) => { setExisting(event.target.value); setTarget('existing'); } },
            h('option', { value: '' }, recent.length ? 'Choose…' : 'None'),
            recent.map((row) => h('option', { key: row.id, value: row.id }, (row.displayTitle || row.id).slice(0, 60))))),
          packetDoor ? h('label', { key: 'packet', className: 'dsh-sp-choice' }, h('span', null, 'As a research packet:'),
            h('select', { value: report, onChange: (event) => setReport(event.target.value) },
              h('option', { value: '' }, reports === null ? 'Loading…' : reports.length ? `No: send ${KIND_WORDS[kind] ?? 'it'} as it is` : 'No saved report'),
              (reports ?? []).map((one) => h('option', { key: one.name, value: one.name }, (one.title || one.name).slice(0, 60))))) : null,
          h('p', { key: 'rule', className: 'dsh-sp-note' }, packetDoor && report ? 'Content brings the report in with its claims, sources and grades, marked as from Research; you rule on each claim there.' : 'It goes as material with its source, never as your instruction. Add your own sentence in the receiving chat box.'),
          h('div', { key: 'buttons', className: 'dsh-sp-row' },
            h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy, onClick: () => void go(true), title: 'Send it there and start that conversation at once' }, 'Send and start'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy, onClick: () => void go(false), title: 'Put it in that conversation\'s chat box; you send it from there' }, busy ? 'Sending…' : 'Send')),
        ] : null,
        note ? h('p', { className: 'dsh-sp-note', 'data-error': error ? 'true' : 'false' }, note) : null), document.body);
    }

    const ICON_SEND = 'M4 12l16-8-6 16-3-7-7-1z';

    /** "Send to…" under every answer. */
    function AnswerSend({ appCtx, store, flags, sessionId, messageId }) {
      const on = useSyncExternalStore(flags.subscribe, flags.get);
      const [place, setPlace] = useState(null);
      if (!on || !sessionId || !messageId) return null;
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Send this answer to another pane or chat', 'aria-label': 'Send to', onClick: (event) => setPlace(placeNear(event.currentTarget.getBoundingClientRect())) }, h(Icon, { d: ICON_SEND })),
        place ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: 'message', getText: async () => (await call({ action: 'message', sessionId, messageId })).text, place, onClose: () => setPlace(null) }) : null);
    }

    /**
     * Above each chat box: the tray (cards sent to this conversation, waiting for you), and "Send to…"
     * for text you select in this conversation (also ⌘⇧S / Ctrl+Shift+S).
     */
    function ChatDock({ appCtx, store, flags, sessionId }) {
      const on = useSyncExternalStore(flags.subscribe, flags.get);
      const status = useSource(appCtx.get('uiSession')?.sessionStatus, EMPTY_STATUS);
      const running = status?.get?.(sessionId)?.running === true;
      const [tray, setTray] = useState([]);
      const [sentences, setSentences] = useState({});
      const [problem, setProblem] = useState('');
      const [pick, setPick] = useState(null);
      const [menu, setMenu] = useState(null);
      const [tick, setTick] = useState(0);
      const [beside, setBeside] = useState(null);
      // The starting text, shown whole and editable: nothing a model wrote goes out unseen.
      const [besideDraft, setBesideDraft] = useState('');
      useEffect(() => { setBesideDraft(beside?.text ?? ''); }, [beside?.at]);
      const [hiddenAt, setHiddenAt] = useState(0);
      useEffect(() => {
        if (!on || !sessionId) return undefined;
        let alive = true;
        const read = () => call(null, `?tray=${encodeURIComponent(sessionId)}`).then((value) => {
          if (!alive) return;
          setTray(value.tray ?? []);
          // A Content conversation: its newest "Continue in Research", offered for the pane beside.
          if (value.mode === 'content') {
            fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'continued', sessionId }) })
              .then((response) => (response.ok ? response.json() : {})).then((answer) => { if (alive) setBeside(answer.continued ?? null); }, () => {});
          } else setBeside(null);
        }, () => {});
        read();
        const timer = setInterval(read, 3000);
        return () => { alive = false; clearInterval(timer); };
      }, [on, sessionId, tick]);
      // Text selected inside this conversation (not in its chat box) offers "Send to…".
      useEffect(() => {
        if (!on || !sessionId) return undefined;
        const mine = () => {
          const selection = window.getSelection?.();
          const text = selection?.toString?.().trim() ?? '';
          if (!text || selection.rangeCount === 0) return null;
          const node = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
          const box = node?.closest?.('[data-conversation-session]');
          if (!box || box.getAttribute('data-conversation-session') !== sessionId || node.closest('[data-composer-seat]')) return null;
          const isError = Boolean(node.closest('[data-tool-error], [data-error="true"], [role="alert"]'));
          return { text, kind: isError ? 'error' : 'selection', rect: selection.getRangeAt(0).getBoundingClientRect() };
        };
        const onUp = () => setTimeout(() => { const found = mine(); setPick(found); }, 0);
        const onKey = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 's' || event.key === 'S')) {
            const found = mine();
            if (!found) return;
            event.preventDefault();
            setPick(null);
            setMenu({ ...found, place: placeNear(found.rect) });
          }
        };
        const onChange = () => { if (!window.getSelection?.()?.toString?.().trim()) setPick(null); };
        // Artifacts' "Send to…" on a file this conversation made.
        const onFile = (event) => {
          const detail = event?.detail ?? {};
          if (detail.sessionId !== sessionId || !detail.path) return;
          setMenu({ kind: 'file', file: String(detail.path), place: placeNear({ left: window.innerWidth / 2 - 190, top: 80, bottom: 80 }) });
        };
        window.addEventListener('dsh-split-plus:send-file', onFile);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('keydown', onKey);
        document.addEventListener('selectionchange', onChange);
        return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('keydown', onKey); document.removeEventListener('selectionchange', onChange); window.removeEventListener('dsh-split-plus:send-file', onFile); };
      }, [on, sessionId]);
      if (!on || !sessionId) return null;
      const deliver = async (card, how) => {
        setProblem('');
        try {
          const done = await call({ action: 'deliver', sessionId, id: card.id, sentence: sentences[card.id] ?? '', how });
          await promptInto(appCtx, sessionId, done.text, how === 'handover' ? 'steer' : 'queue');
          setTick((value) => value + 1);
        } catch (error) {
          setProblem(error.message);
        }
      };
      const drop = async (card) => {
        await call({ action: 'drop', sessionId, id: card.id }).catch(() => {});
        setTick((value) => value + 1);
      };
      const when = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const continueBeside = async () => {
        setProblem('');
        try {
          const taken = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'continued', sessionId, taken: true }) }).then((response) => response.json());
          if (!taken?.continued?.text) throw new Error('That starting text is not there any more.');
          const text = besideDraft.trim();
          if (!text) throw new Error('The starting text is empty.');
          const data = await call(null, '?sessions=');
          const child = await startConversation(appCtx, data, { mode: 'research', choice: 'scratch' });
          try { store.add(child); } catch { appCtx.get('uiWorkspace')?.openSession?.(child); }
          await promptInto(appCtx, child, text, 'queue');
          setBeside(null);
        } catch (error) {
          setProblem(error.message);
        }
      };
      return h(React.Fragment, null,
        h('style', null, CSS),
        beside && beside.at !== hiddenAt ? h('div', { className: 'dsh-sp-card' },
          h('div', { className: 'dsh-sp-cardname' }, 'Continue in Research: this conversation\'s model wrote a starting text for a Research conversation. Read it, change it if you like; it goes as your message.'),
          h('textarea', { className: 'dsh-sp-input', 'aria-label': 'Starting text for the Research conversation', rows: 8, style: { width: '100%', minHeight: 120, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }, value: besideDraft, onChange: (event) => setBesideDraft(event.target.value) }),
          h('div', { className: 'dsh-sp-row dsh-sp-cardrow' },
            h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => setHiddenAt(beside.at), title: 'Hide it; you can still paste the text yourself' }, 'Not now'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void continueBeside(), title: 'Start a Research conversation in the pane beside with this text' }, 'Start in Research beside')),
          problem && !tray.length ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, problem) : null) : null,
        tray.length > 0 ? h('div', { className: 'dsh-sp-tray', 'aria-label': 'Sent to this conversation' },
          tray.map((card) => h('div', { key: card.id, className: 'dsh-sp-card' },
            h('div', { className: 'dsh-sp-cardhead' },
              h('span', { className: 'dsh-sp-abbr' }, '↘'),
              h('span', { className: 'dsh-sp-cardname', title: card.from?.title ?? '' }, `${(KIND_WORDS[card.kind] ?? 'material').replace(/^(the|this) /, '').replace(/^./, (c) => c.toUpperCase())} from the ${card.from?.label ?? 'other'} conversation · ${when(card.at)}${card.sources ? ` · ${card.sources} source${card.sources === 1 ? '' : 's'}` : ''}`)),
            h('div', { className: 'dsh-sp-preview' }, card.file ? `${card.file}\n${card.preview}` : card.preview),
            h('div', { className: 'dsh-sp-row dsh-sp-cardrow' },
              h('input', { className: 'dsh-sp-input', style: { flex: '1 1 160px', minWidth: 0 }, placeholder: 'Your sentence (optional)', value: sentences[card.id] ?? '', onChange: (event) => setSentences({ ...sentences, [card.id]: event.target.value }) }),
              h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => void drop(card), title: 'Take it out; nothing is sent' }, 'Remove'),
              running ? h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => void deliver(card, 'handover'), title: 'The running job reads it at its next step, without stopping' }, 'Hand over now') : null,
              h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void deliver(card, 'send'), title: running ? 'Held until the running job ends, then sent' : 'Send it into this conversation' }, running ? 'Send when done' : 'Send')))),
          problem ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, problem) : null) : null,
        pick && !menu ? ReactDOM.createPortal(h('button', { type: 'button', className: 'dsh-sp-float', style: { left: Math.min(pick.rect.right, window.innerWidth - 110), top: Math.max(4, pick.rect.top - 34) }, onMouseDown: (event) => event.preventDefault(), onClick: () => { setMenu({ ...pick, place: placeNear(pick.rect) }); setPick(null); } }, h(Icon, { d: ICON_SEND, size: 12 }), ' Send to…'), document.body) : null,
        menu ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: menu.kind, file: menu.file ?? '', getText: async () => (menu.file ? (await call({ action: 'file', sessionId, path: menu.file })).text : menu.text), place: menu.place, onClose: () => setMenu(null) }) : null);
    }

    /** "Send a file" in a pane's title: the files this pane read or changed. */
    function FileSend({ appCtx, store, sessionId }) {
      const [open, setOpen] = useState(null);
      const [files, setFiles] = useState(null);
      const [menu, setMenu] = useState(null);
      useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        call(null, `?files=${encodeURIComponent(sessionId)}`).then((value) => { if (alive) setFiles(value.files ?? []); }, () => { if (alive) setFiles([]); });
        return () => { alive = false; };
      }, [open, sessionId]);
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Send a file this pane read or changed', 'aria-label': 'Send a file', onClick: (event) => setOpen(open ? null : placeNear(event.currentTarget.getBoundingClientRect(), 360, 300)) }, h(Icon, { d: ICON_SEND })),
        open && !menu ? ReactDOM.createPortal(h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Send a file', style: { position: 'fixed', left: open.left, top: open.top } },
          h('style', null, CSS),
          h('strong', null, 'Send a file'),
          files === null ? h('p', { className: 'dsh-sp-note' }, 'Loading…')
            : files.length === 0 ? h('p', { className: 'dsh-sp-note' }, 'This pane has not read or changed a file yet.')
              : h('div', { className: 'dsh-sp-files' }, files.map((path) => h('button', { key: path, type: 'button', className: 'dsh-sp-fileitem', title: path, onClick: () => setMenu({ path, place: open }) }, path.split('/').pop(), h('span', null, ` ${path}`)))),
          h('div', { className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => setOpen(null) }, 'Close'))), document.body) : null,
        menu ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: 'file', file: menu.path, getText: async () => (await call({ action: 'file', sessionId, path: menu.path })).text, place: menu.place, onClose: () => { setMenu(null); setOpen(null); } }) : null);
    }

    function SplitIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 5h16v14H4zM12 5v14' }));
    }

    /** The Danger zone's switches (the server half's DANGERS), in the order Settings shows them. */
    const DANGER_SWITCHES = [
      ['dangerFileHolds', 'Let panes change the same file at once', 'No waiting for a file another pane is changing, and a change to a file that changed since the pane read it is no longer refused.'],
      ['dangerSealedSends', 'Send out of and into Recon panes', 'Send to works out of and into Recon panes, without Recon\'s Export window. What Recon read can then reach other tabs.'],
      ['dangerWatchSealed', 'Watch Recon panes', 'A watcher may read a Recon pane\'s run. What Recon read then reaches the watcher\'s model.'],
      ['dangerWatcherTools', 'Let watchers use every tool', 'A watcher may change files and run commands like any conversation of its tab, not only read.'],
      ['dangerUnmarked', 'Send without the card', 'Sends go as plain text, without the "material, not instructions" card: the receiving conversation, Bench, Content and Creator Plus read it as your own words.'],
    ];

    /** Settings → Split Plus. */
    function SettingsPage({ appCtx, onChanged }) {
      const [data, setData] = useState(null);
      const [draft, setDraft] = useState({ localAtOnce: '', watcherModel: '' });
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const read = useCallback(() => call().then((value) => { setData(value); setDraft({ localAtOnce: String(value.localAtOnce), watcherModel: value.watcherModel ?? '' }); }, (problem) => setNote(problem.message)), []);
      useEffect(() => { void read(); }, [read]);
      const run = async (work, done) => {
        setBusy(true);
        setNote('');
        try { await work(); setNote(done); await read(); onChanged(); } catch (problem) { setNote(`Not saved: ${problem.message}`); } finally { setBusy(false); }
      };
      if (!data) return h('div', { className: 'dsh-sp-settings' }, h('style', null, CSS), h('p', { className: 'dsh-sp-note' }, note || 'Loading…'));
      return h('div', { className: 'dsh-sp-settings' },
        h('style', null, CSS),
        h('div', { className: 'item' },
          h('div', { className: 'text' }, h('div', { className: 'name' }, 'Split page'), h('div', { className: 'desc' }, 'Two to four conversations side by side in one window, each in any mode with its own buttons and permission mode. A pane opened from another works in the same folder; a Recon pane works only in Recon\'s own room.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-sp-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Split page', disabled: busy, onClick: () => void run(() => saveSetting(appCtx, 'enabled', data.enabled !== true), data.enabled ? 'Switched off.' : 'Switched on: the Split page is in the sidebar.') })),
        data.enabled !== true ? null : [
          h('div', { key: 'g1', className: 'group' }, 'Local models'),
          h('div', { key: 'local', className: 'item' },
            h('div', { className: 'text' }, h('div', { className: 'name' }, 'Panes on a local model at once'), h('div', { className: 'desc' }, 'How many panes may use a model on this Mac or your own server at the same time (1 to 4). A pane over the limit waits and says so. Online models never count.')),
            h('input', { className: 'dsh-sp-input', style: { width: 60 }, type: 'number', min: 1, max: 4, value: draft.localAtOnce, onChange: (event) => setDraft({ ...draft, localAtOnce: event.target.value }) }),
            h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy || Number(draft.localAtOnce) === data.localAtOnce, onClick: () => void run(() => saveSetting(appCtx, 'localAtOnce', Math.max(1, Math.min(4, Math.round(Number(draft.localAtOnce) || 4)))), 'Saved.') }, 'Save')),
          h('div', { key: 'g2', className: 'group' }, 'Watching'),
          h('div', { key: 'watch', className: 'item' },
            h('div', { className: 'text' }, h('div', { className: 'name' }, 'Watcher model'), h('div', { className: 'desc' }, 'The model a watching pane starts with ("provider/model"). It shows first in that pane\'s model menu, and you can change it there for that pane. Empty: the app\'s usual model.')),
            h('input', { className: 'dsh-sp-input', style: { width: 220 }, value: draft.watcherModel, placeholder: 'provider/model', onChange: (event) => setDraft({ ...draft, watcherModel: event.target.value }) }),
            h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy || draft.watcherModel === data.watcherModel, onClick: () => void run(() => saveSetting(appCtx, 'watcherModel', draft.watcherModel.trim()), 'Saved.') }, 'Save')),
        ],
        data.enabled === true ? [
          h('div', { key: 'dz', className: 'group', style: { color: 'var(--dsw-alias-state-error-primary)' } }, '⚠ Danger zone'),
          h('p', { key: 'dznote', className: 'dsh-sp-note' }, 'Each rule below starts on. Switch one off only when you need to: it stays off until you switch it back, the Split page shows it in red, and each change is noted in Split Plus\'s log.'),
          ...DANGER_SWITCHES.map(([key, name, desc]) => {
            const off = (data.danger ?? []).some((one) => one.name === key);
            return h('div', { key, className: 'item' },
              h('div', { className: 'text' }, h('div', { className: 'name' }, name), h('div', { className: 'desc' }, desc)),
              h('button', { type: 'button', role: 'switch', className: 'dsh-sp-switch', 'aria-checked': off, 'aria-label': name, style: off ? { background: 'var(--dsw-alias-state-error-primary)' } : undefined, disabled: busy, onClick: () => void run(() => saveSetting(appCtx, key, !off), off ? 'Back on: the rule holds again.' : 'Switched off. It stays off until you switch it back.') }));
          }),
        ] : null,
        note ? h('p', { className: 'dsh-sp-note' }, note) : null);
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        const store = openPaneStore();
        // Whether Split Plus is on, for the buttons shown in every conversation.
        const flags = (() => {
          let on = false;
          const listeners = new Set();
          return {
            get: () => on,
            set(value) { if (on !== value) { on = value; for (const listener of listeners) listener(); } },
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
          };
        })();
        ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
          { name: 'conversation.chat.assistant-actions', id: 'split-plus-send', order: 25, inject: (sessionId) => ({ sessionId }) },
          (props) => h(AnswerSend, { ...props, appCtx: ctx, store, flags }),
        )), 'split-plus: send an answer');
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
          { name: 'conversation.input.dock', id: 'split-plus-tray', order: 1 },
          (props) => h(ChatDock, { appCtx: ctx, store, flags, sessionId: props?.sessionId ?? props?.session?.id ?? '' }),
        )), 'split-plus: tray and selection');

        // The conversation inside a pane: a slot of the Split page's own, in the scope of that pane's conversation.
        ctx.effect(() => ctx.slots.inject('splitplus.pane', () => ctx.slots.register({ name: 'splitplus.pane' }, PaneConversation)), 'split-plus: pane conversation');

        // The page and its sidebar row, only while Split Plus is on.
        let pageOff = null;
        const sync = async () => {
          let on = false;
          try { on = (await call()).enabled === true; } catch { on = false; }
          flags.set(on);
          if (on && !pageOff) {
            // A reload may have replaced this copy of the plugin while it asked: then it adds nothing.
            try {
              const main = ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
                name: 'main', key: 'split',
                children: { 'splitplus.pane': { kind: 'single', scope: 'session' } },
              }, (props) => h(SplitPage, { ...props, appCtx: ctx, store }))), 'split-plus: page');
              const row = ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'split', order: 21, label: () => t('page.title') }, SplitIcon)), 'split-plus: sidebar row');
              pageOff = () => { row(); main(); };
            } catch (error) {
              if (!/inactive context/.test(String(error?.message ?? error))) throw error;
            }
          } else if (!on && pageOff) {
            pageOff();
            pageOff = null;
          }
        };
        // The server counts only conversations the Split page holds toward the local-model limit: say which, now and then.
        const report = () => {
          if (!pageOff) return;
          call({ action: 'panes', panes: store.get().panes }).catch(() => { /* said again in a moment */ });
        };
        ctx.effect(() => store.subscribe(report), 'split-plus: report panes');
        const heartbeat = setInterval(report, 20_000);
        ctx.effect(() => () => clearInterval(heartbeat), 'split-plus: report panes now and then');
        void sync().then(report).catch(() => { /* this copy of the plugin was replaced while it started */ });
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'split-plus', order: 118, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx, onChanged: () => void sync().then(report).catch(() => {}) }))), 'split-plus: settings');
        ctx.effect(() => () => { pageOff?.(); pageOff = null; });
      },
    };
  },
});
