/**
 * Finance, browser half: the drop-downs on the Finance tab's start page (subject, market, focus,
 * period) and the Settings > Finance page. The mode, its instructions and its skills are in the
 * server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-finance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'finance';
    const DICT = { en: { 'section.title': 'Finance' }, zh: { 'section.title': '财经' } };

    const CSS = `
.dsh-fn-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-fn-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-fn-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-fn-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-fn-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-fn-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-rowtext { flex: 1; min-width: 0; }
.dsh-fn-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-fn-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-fn-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-fn-btn:disabled { opacity: .5; cursor: default; }
.dsh-fn-add { display: flex; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-field {
  flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-fn-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-fn-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-fn-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-fn-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-fn-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }

/* The drop-downs on the start page: only while the Finance tab is selected. */
.dsh-fn-bar { display: none; }
html[data-cws-tab="finance"] .dsh-fn-bar {
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;
}
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) { position: relative; }
/* The buttons below move down by the bar's real height, which changes when the bar wraps. */
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) .cws-chips { margin-top: calc(var(--dsh-fn-bar, 70px) + 36px); }
.dsh-fn-pick {
  box-sizing: border-box; height: 36px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, transparent); cursor: pointer; max-width: 170px;
}
input.dsh-fn-pick { cursor: text; width: 200px; max-width: 200px; }
.dsh-fn-pick:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
`;

    const SUBJECT_HINTS = {
      company: 'Company, for example NVIDIA',
      sector: 'Sector, for example chip makers',
      economy: 'Economy, for example Japan',
      market: 'Anything to add (optional)',
    };

    async function readData() {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      return response.json();
    }

    async function revision(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return view.revision;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    // The bar and the page show the same settings; a change in one reaches the other.
    const listeners = new Set();
    const tell = () => { for (const listener of listeners) listener(); };

    function useData() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const alive = useRef(true);
      const load = () => readData()
        .then((next) => { if (alive.current) { setData(next); setError(''); } })
        .catch((problem) => { if (alive.current) setError(problem.message); });
      useEffect(() => {
        alive.current = true;
        load();
        listeners.add(load);
        return () => { alive.current = false; listeners.delete(load); };
      }, []);
      return { data, setData, error, alive, load };
    }

    /** The drop-downs under the message box on the Finance tab's start page. */
    function FinanceBar({ appCtx }) {
      const { data, setData, alive } = useData();
      const [draft, setDraft] = useState(null);
      const [failed, setFailed] = useState('');
      const bar = useRef(null);
      const shown = Boolean(data && data.enabled === true);
      useEffect(() => {
        const node = bar.current;
        if (!node || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-fn-bar', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-fn-bar'); };
      }, [shown]);
      if (!shown) return h('style', null, CSS);
      const selection = data.selection ?? {};
      const save = async (values) => {
        setData((d) => ({ ...d, selection: { ...d.selection, ...values } }));
        try {
          await setSettings(appCtx, values);
          if (alive.current) setFailed('');
          tell();
        } catch (problem) {
          if (alive.current) setFailed(`Could not save the selection: ${problem.message}`);
        }
      };
      const subject = draft ?? selection.subject ?? '';
      const commitSubject = () => {
        if (draft === null) return;
        const next = draft.trim();
        setDraft(null);
        if (next !== (selection.subject ?? '')) void save({ subject: next });
      };
      const select = (label, value, options, onChange) => h('select', { className: 'dsh-fn-pick', 'aria-label': label, title: label, value, onChange: (event) => onChange(event.target.value) },
        options.map((option) => h('option', { key: option.id, value: option.id }, option.label)));
      const markets = (data.markets ?? []).includes(selection.market) ? data.markets : [...(data.markets ?? []), selection.market];
      const summary = selection.kind === 'market'
        ? `The whole market, ${selection.market}`
        : selection.subject ? `${selection.subject}, ${selection.market}` : `No ${selection.kind} chosen yet: name it here or in your message`;

      return h('div', { ref: bar, className: 'dsh-fn-bar', role: 'group', 'aria-label': 'What to research' },
        h('style', null, CSS),
        select('Kind of subject', selection.kind, data.kinds ?? [], (kind) => save({ kind })),
        h('input', {
          className: 'dsh-fn-pick', list: 'dsh-fn-watchlist', value: subject, placeholder: SUBJECT_HINTS[selection.kind] ?? 'Subject', 'aria-label': 'Subject', spellCheck: false, autoCorrect: 'off',
          onChange: (event) => setDraft(event.target.value), onBlur: commitSubject, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
        }),
        h('datalist', { id: 'dsh-fn-watchlist' }, (data.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
        select('Market', selection.market, markets.map((market) => ({ id: market, label: market })), (market) => save({ market })),
        select('Focus', selection.focus, data.focuses ?? [], (focus) => save({ focus })),
        select('Period', selection.period, data.periods ?? [], (period) => save({ period })),
        h('div', { className: 'dsh-fn-hint', 'data-error': String(Boolean(failed)) }, failed || `${summary}. Research, not advice.`));
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-fn-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** A list of names with an add box: the watchlist, and your own markets. */
    function NameList({ items, placeholder, label, empty, busy, onChange }) {
      const [text, setText] = useState('');
      const add = () => {
        const name = text.trim();
        if (!name) return;
        setText('');
        if (!items.some((other) => other.toLowerCase() === name.toLowerCase())) onChange([...items, name]);
      };
      return h(React.Fragment, null,
        items.length === 0 ? h('p', { className: 'dsh-fn-desc' }, empty) : null,
        items.map((name) => h('div', { key: name, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' }, h('div', { className: 'dsh-fn-rowtitle' }, name)),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => onChange(items.filter((other) => other !== name)) }, 'Remove'))),
        h('div', { className: 'dsh-fn-add' },
          h('input', { className: 'dsh-fn-field', value: text, placeholder, 'aria-label': label, spellCheck: false, onChange: (event) => setText(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') add(); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !text.trim(), onClick: add }, 'Add')));
    }

    function FinancePage({ appCtx }) {
      const { data, setData, error, alive, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-fn-page' }, h('style', null, CSS), h('h2', { className: 'dsh-fn-title' }, 'Finance'), h('p', { className: 'dsh-fn-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const save = async (values, done = 'Saved.') => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          tell();
          // The tab is added or removed a moment later; read back whether that worked.
          setTimeout(() => { if (alive.current) load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      return h('div', { className: 'dsh-fn-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-fn-title' }, 'Finance'),
        h('p', { className: 'dsh-fn-desc' }, 'A fourth tab, beside Chat, Cowork and Code, for researching companies, markets and economies. The assistant puts the reported figures next to what the news says and what people are saying, looks ahead, and gives both sides. It is research, not advice.'),
        note.text ? h('p', { className: 'dsh-fn-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-fn-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-fn-group' }, 'The tab'),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Show the Finance tab'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'On adds the tab, its drop-downs, its instructions and its skills. Off takes all of them away; your watchlist is kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Finance tab', onChange: (on) => save({ enabled: on }, on ? 'Switched on. The Finance tab appears in the sidebar in a moment.' : 'Switched off. The Finance tab is taken away in a moment.') })),

        h('div', { className: 'dsh-fn-group' }, 'Watchlist'),
        h('p', { className: 'dsh-fn-desc' }, 'Companies, sectors or economies you follow. They are offered when you type in the subject box on the Finance tab.'),
        h(NameList, { items: data.watchlist ?? [], placeholder: 'A name, for example NVIDIA', label: 'Add to the watchlist', empty: 'Nothing on the watchlist yet.', busy, onChange: (watchlist) => save({ watchlist }) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own markets'),
        h('p', { className: 'dsh-fn-desc' }, `The Market drop-down offers: ${(data.markets ?? []).filter((market) => !(data.moreMarkets ?? []).includes(market)).join(', ')}. Add others here.`),
        h(NameList, { items: data.moreMarkets ?? [], placeholder: 'A market, for example Mexico', label: 'Add a market', empty: 'No market of your own yet.', busy, onChange: (moreMarkets) => save({ moreMarkets }) }),

        h('div', { className: 'dsh-fn-group' }, 'What the assistant is given'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, 'A method: figures only from sources it fetched, each with its date; facts, claims, opinions and its own reading kept apart; always a look ahead; always both sides; what it could not find; no buy or sell advice.'),
          h('li', null, 'Your selection from the drop-downs, as it was when the conversation started.'),
          h('li', null, `${(data.skills ?? []).length} skills, one for each common task: ${(data.skills ?? []).map((skill) => skill.name.replace(/^finance-/, '').replace(/-/g, ' ')).join(', ')}.`)),

        h('div', { className: 'dsh-fn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, 'It is research, not advice. The assistant is not a licensed financial adviser, and it is told not to say buy, sell or hold. Decisions are yours.'),
          h('li', null, 'It has no data feed of its own yet. Figures come from what the assistant finds with web search and Deep research, so they can be delayed, and it can misread a source. Each figure should come with its source and date so you can check it.'),
          h('li', null, 'What people say online is a signal, not a fact, and can be manipulated.'),
          h('li', null, 'Charts come from the Diagram builder, and your own reports can be searched if they are in the Library.'),
          h('li', null, 'A better data source, such as a connector or a paid service, can be added later without changing the tab.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'finance', order: 23, label: () => t('section.title') }, (props) => h(FinancePage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'finance-bar', order: 40 }, () => h(FinanceBar, { appCtx: ctx }))));
      },
    };
  },
});
