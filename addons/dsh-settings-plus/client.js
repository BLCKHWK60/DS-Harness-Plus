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
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    /** The groups, in order, and their pages in order. */
    const GROUPS = [
      { label: 'Tabs and modes', pages: ['modes', 'research', 'finance', 'data', 'scout', 'recon', 'content', 'bench', 'creator-plus'] },
      { label: 'Models', pages: ['model-tiers', 'sampling-presets', 'model-arena', 'benchmark'] },
      { label: 'Cost and limits', pages: ['budget', 'usage-ledger'] },
      { label: 'Agents and runs', pages: ['mission', 'agent-swarm', 'evolve', 'alerts'] },
      { label: 'Knowledge and files', pages: ['memory', 'library', 'pdf', 'code-map', 'diagram', 'learn'] },
      { label: 'Look and this Mac', pages: ['color-schemes', 'activity', 'mac'] },
    ];
    /** Line icons, 24x24, drawn with the current colour. */
    const ICONS = {
      modes: 'M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z',
      research: 'M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM14.5 14.5L20 20M7 10h6M10 7v6',
      finance: 'M4 18l5-6 4 3 7-9M15 6h5v5',
      data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
      scout: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM15.5 8.5l-2 5-5 2 2-5z',
      recon: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM9.5 12l2 2 3.5-4',
      content: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4M12 20h8',
      bench: 'M8 8h8v8H8zM10 8V4M14 8V4M10 20v-4M14 20v-4M8 10H4M8 14H4M20 10h-4M20 14h-4',
      'creator-plus': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4zM18 3v4M16 5h4',
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

    return {
      inject: ['slots', 'remote', 'locale', 'layout'],
      apply(ctx) {
        addStyle();
        for (const group of GROUPS) {
          for (const id of group.pages) {
            ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id }, (props) => h(PageIcon, { ...props, appCtx: ctx, id }))));
          }
        }
        ctx.effect(() => ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'plus-settings-search', order: -10 }, (props) => h(SearchField, { ...props, appCtx: ctx }))));
      },
    };
  },
});
