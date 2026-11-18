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

    /** The groups, in order, and their pages in order. */
    const GROUPS = [
      { label: 'Tabs and modes', pages: ['modes', 'web-sources', 'research', 'finance', 'data', 'scout', 'recon', 'content', 'bench', 'creator-plus', 'split-plus'] },
      { label: 'Models', pages: ['model-tiers', 'sampling-presets', 'model-arena', 'benchmark'] },
      { label: 'Cost and limits', pages: ['budget', 'usage-ledger'] },
      { label: 'Agents and runs', pages: ['mission', 'agent-swarm', 'evolve', 'alerts'] },
      { label: 'Knowledge and files', pages: ['memory', 'library', 'pdf', 'code-map', 'diagram', 'learn', 'artifacts'] },
      { label: 'Look and this Mac', pages: ['color-schemes', 'activity', 'mac'] },
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
    };

    const CSS = `
[data-shortcut-modal="settings"] nav > div::before { content: "App"; display: block; padding: 2px 12px 2px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
[data-shortcut-modal="settings"] nav button:has([data-sp-head]) { position: relative; margin-top: 26px; }
[data-sp-head] { position: absolute; left: 12px; top: -22px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); white-space: nowrap; pointer-events: none; }
@media (max-width: 767px) {
  [data-shortcut-modal="settings"] nav > div::before { display: none; }
  [data-shortcut-modal="settings"] nav button:has([data-sp-head]) { margin-top: 0; }
  [data-sp-head] { display: none; }
}
.dsh-sp-find { position: relative; display: inline-flex; align-items: center; }
.dsh-sp-find input { box-sizing: border-box; width: 260px; height: 28px; padding: 0 30px 0 30px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); outline: none; }
.dsh-sp-find input:focus { border-color: var(--dsw-alias-brand-primary); }
.dsh-sp-find .glass { position: absolute; left: 10px; top: 7px; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.dsh-sp-find .key { position: absolute; right: 10px; top: 6px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.dsh-sp-drop { position: absolute; top: 34px; right: 0; z-index: 60; box-sizing: border-box; width: 420px; max-width: calc(100vw - 40px); max-height: min(60vh, 520px); overflow-y: auto; padding: 6px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); box-shadow: 0 10px 34px rgba(0,0,0,.3); }
.dsh-sp-drop button { display: block; width: 100%; text-align: left; border: 0; border-radius: 10px; padding: 7px 10px; background: transparent; font: inherit; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-sp-drop button[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sp-drop .where { display: block; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-drop .name { display: block; font-size: 13px; line-height: 18px; font-weight: 600; }
.dsh-sp-drop .what { display: block; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-drop .tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; font-size: 10px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dsh-sp-drop .none { padding: 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-drop .note { padding: 8px 10px; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-sp-hit { outline: 2px solid var(--dsw-alias-brand-primary) !important; outline-offset: 4px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent) !important; transition: outline-color .4s ease, background .4s ease; }
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
`;
    let styled = false;
    const addStyle = () => {
      if (styled || typeof document === 'undefined') return;
      styled = true;
      const node = document.createElement('style');
      node.setAttribute('data-dsh-settings-plus', '');
      node.textContent = CSS;
      document.head.appendChild(node);
    };

    const groupOf = (id) => GROUPS.find((group) => group.pages.includes(id));

    /** A Plus page's icon in the left list, and the group heading above the first page of a group. */
    function PageIcon({ appCtx, id, size }) {
      addStyle();
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
      return h(React.Fragment, null,
        h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d })),
        head ? h('span', { 'data-sp-head': head }, head) : null);
    }

    // ---- search -------------------------------------------------------------------------------------

    let indexLoad;
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
      element.classList.add('dsh-sp-hit');
      setTimeout(() => element.classList.remove('dsh-sp-hit'), 2600);
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
        void loadIndex().then((data) => { if (alive) setIndex({ entries: Array.isArray(data.entries) ? data.entries : [], enabled: data.enabled !== false }); });
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
      const usable = useMemo(() => [...pageEntries, ...index.entries.filter((entry) => entry.configOnly || entry.where === 'plugins-panel' || present.has(entry.page))], [index.entries, pages.length]);
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
        if (entry.configOnly) {
          setNote(`"${entry.label}" has no control on any page. Change it in the configuration file: "Open configuration file" at the top right of Settings${entry.field ? `, field ${entry.field}` : ''}.`);
          if (present.has(entry.page)) openPage(appCtx, entry.page, entry.pageLabel);
          return;
        }
        setOpen(false);
        if (openPage(appCtx, entry.page, entry.pageLabel) && entry.kind !== 'page') setTimeout(() => highlight(entry.label), 120);
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
      return h('span', { className: 'dsh-sp-find', ref: box },
        h('svg', { className: 'glass', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l4.5 4.5' })),
        h('input', {
          ref: input, type: 'search', value: query, placeholder: 'Search settings', 'aria-label': 'Search settings', spellCheck: false, autoComplete: 'off',
          role: 'combobox', 'aria-expanded': open && query.trim() !== '', 'aria-controls': 'dsh-sp-results',
          onChange: (event) => { setQuery(event.target.value); setPick(0); setOpen(true); setNote(''); },
          onFocus: () => setOpen(true),
          onKeyDown,
        }),
        query ? null : h('span', { className: 'key', 'aria-hidden': true }, isMac ? '⌘F' : 'Ctrl F'),
        open && query.trim()
          ? h('div', { className: 'dsh-sp-drop', id: 'dsh-sp-results', role: 'listbox', 'aria-label': 'Settings found' },
            results.length === 0 ? h('div', { className: 'none' }, `Nothing found for "${query.trim()}".`) : null,
            results.map((entry, n) => h('button', {
              key: `${entry.page}|${entry.label}|${n}`, type: 'button', role: 'option', 'aria-selected': n === pick,
              onMouseEnter: () => setPick(n), onClick: () => choose(entry),
            },
            h('span', { className: 'where' }, entry.kind === 'page' ? `Page · ${entry.description}` : [entry.pageLabel, entry.heading].filter(Boolean).join(' › ')),
            h('span', { className: 'name' }, entry.label,
              entry.configOnly ? h('span', { className: 'tag' }, 'configuration file only') : null,
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
     * The buttons a mode adds to the chat box (Bench rules, Creator Plus, Finance, Recon's export door), by their slot id.
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
      const [info, setInfo] = useState(null);
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(false);
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
      useEffect(() => {
        let alive = true;
        setInfo(null);
        setNote('');
        fetch(exportUrl(sessionId, level, format, '&info=1'), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => response.json().catch(() => ({ ok: false, reason: 'The export could not be prepared.' })))
          .then((data) => { if (alive) setInfo(data); })
          .catch(() => { if (alive) setInfo({ ok: false, reason: 'The export could not be prepared.' }); });
        return () => { alive = false; };
      }, [sessionId, level, format]);
      const fetchText = async () => {
        const response = await fetch(exportUrl(sessionId, level, format), { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('The export failed.');
        return response.text();
      };
      const download = () => {
        const link = document.createElement('a');
        link.href = String(exportUrl(sessionId, level, format));
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
                h('div', { className: 'dsh-xp-actions' },
                  format === 'pdf'
                    ? h('button', { type: 'button', className: 'main', disabled: busy || blocked || !info, onClick: () => void printPdf(), 'data-xp-go': 'pdf' }, 'Make PDF')
                    : h('button', { type: 'button', className: 'main', disabled: busy || blocked || !info, onClick: download, 'data-xp-go': 'download' }, 'Download'),
                  format === 'pdf' ? null : h('button', { type: 'button', disabled: busy || blocked || !info, onClick: () => void copy(), 'data-xp-go': 'copy' }, 'Copy to clipboard'),
                  h('span', { className: 'dsh-xp-note' }, blocked ? info.reason : info ? `${info.title}${size ? ` · ${size}` : ''}` : 'Preparing…')),
                h('div', { className: 'dsh-xp-note' }, 'Also: the app\'s own complete archive. The log exactly as stored, with its sub-conversations and attachments, as a ZIP.',
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

    return {
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
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'plus-export', order: 870 }, (props) => h(ExportButton, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'plus-mode-gear', order: 880 }, (props) => h(ModeGear, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'plus-settings-search', order: -10 }, (props) => h(SearchField, { ...props, appCtx: ctx }))));
      },
    };
  },
});
