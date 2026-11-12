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
.dsh-fn-field[data-small="true"] { flex: none; width: 150px; }
select.dsh-fn-field { cursor: pointer; flex: none; width: auto; max-width: 240px; }
.dsh-fn-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-form .dsh-fn-field { flex: 1 1 200px; }
.dsh-fn-form select.dsh-fn-field, .dsh-fn-form .dsh-fn-field[data-small="true"] { flex: 0 0 auto; }
.dsh-fn-out { margin: 6px 0 0; padding: 8px 10px; border-radius: 10px; font-size: 11px; line-height: 16px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-fn-side { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
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

    async function post(body) {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
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

    const KEY_PLACES = [
      { id: 'query', label: 'Key goes in the address' },
      { id: 'header', label: 'Key goes in a header' },
      { id: 'bearer', label: 'Key is a bearer token' },
      { id: 'none', label: 'No key needed' },
    ];

    /** One data source: its key, a try-out, on and off, remove. */
    function SourceRow({ source, busy, onKey, onForget, onToggle, onRemove, onTry }) {
      const [key, setKey] = useState('');
      const [path, setPath] = useState('');
      const [out, setOut] = useState('');
      const api = source.kind === 'api';
      const needsKey = api && source.keyIn !== 'none';
      const status = !api ? 'A connector: its tools are already available to the assistant. This note tells it what they are good for.'
        : !needsKey ? source.baseUrl
          : source.keySet ? `${source.baseUrl} · key saved${source.keyShown ? ` (${source.keyShown})` : ''}` : `${source.baseUrl} · no key yet, so the assistant cannot use it`;
      return h('div', { style: { borderBottom: '0.5px solid var(--dsw-alias-border-l1)', padding: '14px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, source.name),
            h('div', { className: 'dsh-fn-rowdesc' }, status),
            source.about ? h('div', { className: 'dsh-fn-rowdesc' }, source.about) : null),
          h('div', { className: 'dsh-fn-side' },
            h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onRemove }, 'Remove'),
            h(Switch, { on: source.on, label: `Use ${source.name}`, onChange: onToggle }))),
        needsKey ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', type: 'password', value: key, placeholder: source.keySet ? 'Paste a new key to replace the saved one' : 'Paste your key', 'aria-label': `Key for ${source.name}`, autoComplete: 'off', spellCheck: false, onChange: (event) => setKey(event.target.value) }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !key.trim(), onClick: async () => { if (await onKey(key.trim())) setKey(''); } }, 'Save key'),
          source.keySet ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onForget }, 'Forget key') : null) : null,
        api && (!needsKey || source.keySet) ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', value: path, placeholder: 'A path to try, for example quote?symbol=AAPL', 'aria-label': `Path to try on ${source.name}`, spellCheck: false, onChange: (event) => setPath(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && path.trim()) void onTry(path.trim()).then(setOut); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !path.trim(), onClick: () => void onTry(path.trim()).then(setOut) }, 'Try')) : null,
        out ? h('div', { className: 'dsh-fn-out' }, out) : null);
    }

    /** Add a source: a known service, any other web service, or a note about a connector. */
    function AddSource({ presets, taken, busy, onAdd }) {
      const [kind, setKind] = useState('');
      const [form, setForm] = useState({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' });
      const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
      const free = presets.filter((preset) => !taken.includes(preset.id));
      const field = (key, placeholder, small) => h('input', { className: 'dsh-fn-field', 'data-small': String(small === true), value: form[key], placeholder, 'aria-label': placeholder, spellCheck: false, autoCapitalize: 'off', onChange: set(key) });
      const add = async () => {
        const preset = presets.find((item) => item.id === kind);
        const source = preset ? { ...preset, kind: 'api', on: true }
          : kind === 'connector' ? { kind: 'connector', name: form.name.trim(), about: form.about.trim(), on: true }
            : { kind: 'api', name: form.name.trim(), baseUrl: form.baseUrl.trim(), keyIn: form.keyIn, keyName: form.keyName.trim(), about: form.about.trim(), docs: form.docs.trim(), on: true };
        if (await onAdd(source)) { setKind(''); setForm({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' }); }
      };
      const custom = kind === 'other';
      const ready = kind && (presets.some((item) => item.id === kind) || (form.name.trim() && (kind === 'connector' || form.baseUrl.trim())));
      return h('div', { className: 'dsh-fn-form' },
        h('select', { className: 'dsh-fn-field', value: kind, 'aria-label': 'Kind of source to add', onChange: (event) => setKind(event.target.value) },
          h('option', { value: '' }, 'Add a source…'),
          free.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name)),
          h('option', { value: 'other' }, 'Another web service'),
          h('option', { value: 'connector' }, 'A connector I added')),
        custom || kind === 'connector' ? field('name', kind === 'connector' ? 'The connector\'s name' : 'Name') : null,
        custom ? field('baseUrl', 'Address, for example https://api.example.com/v1') : null,
        custom ? h('select', { className: 'dsh-fn-field', value: form.keyIn, 'aria-label': 'Where the key goes', onChange: set('keyIn') }, KEY_PLACES.map((place) => h('option', { key: place.id, value: place.id }, place.label))) : null,
        custom && (form.keyIn === 'query' || form.keyIn === 'header') ? field('keyName', form.keyIn === 'query' ? 'The key\'s name, for example apikey' : 'The header\'s name, for example X-API-Key', true) : null,
        custom || kind === 'connector' ? field('about', 'What it is good for, in one line (the assistant reads this)') : null,
        custom ? field('docs', 'Address of its documentation (optional)') : null,
        kind ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !ready, onClick: add }, 'Add') : null);
    }

    /** Schedule a brief: what about, how often, at what hour. */
    function AddBrief({ watchlist, rhythms, busy, onAdd }) {
      const [subject, setSubject] = useState('');
      const [rhythm, setRhythm] = useState('weekdays');
      const [hour, setHour] = useState('8');
      return h('div', { className: 'dsh-fn-form' },
        h('input', { className: 'dsh-fn-field', list: 'dsh-fn-brief-list', value: subject, placeholder: 'What about, for example NVIDIA', 'aria-label': 'Subject of the brief', spellCheck: false, onChange: (event) => setSubject(event.target.value) }),
        h('datalist', { id: 'dsh-fn-brief-list' }, watchlist.map((name) => h('option', { key: name, value: name }))),
        h('select', { className: 'dsh-fn-field', value: rhythm, 'aria-label': 'How often', onChange: (event) => setRhythm(event.target.value) }, rhythms.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
        h('select', { className: 'dsh-fn-field', value: hour, 'aria-label': 'At what hour', onChange: (event) => setHour(event.target.value) }, Array.from({ length: 24 }, (_, value) => h('option', { key: value, value: String(value) }, `at ${String(value).padStart(2, '0')}:00`))),
        h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !subject.trim(), onClick: async () => { if (await onAdd(subject.trim(), rhythm, Number(hour))) setSubject(''); } }, 'Schedule'));
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

      const sources = Array.isArray(data.sources) ? data.sources : [];
      // What is saved: the description only. Whether a key is saved is the server's to say.
      const stored = (list) => list.map(({ keySet, keyShown, ...source }) => source);
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await post(body);
          if (!alive.current) return undefined;
          setData(next);
          if (done) setNote({ text: done, error: false });
          tell();
          return next;
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, error: true });
          return undefined;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const saveSources = async (list, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { sources: JSON.stringify(stored(list)) });
          if (!alive.current) return false;
          setNote({ text: done, error: false });
          await load();
          tell();
          return true;
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const addSource = async (source) => {
        const id = String(source.id ?? source.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        if (!id) { setNote({ text: 'Give the source a name.', error: true }); return false; }
        if (sources.some((other) => other.id === id)) { setNote({ text: 'There is already a source with that name.', error: true }); return false; }
        if (source.kind === 'api') {
          try {
            await post({ action: 'check', baseUrl: source.baseUrl });
          } catch (problem) {
            setNote({ text: problem.message, error: true });
            return false;
          }
        }
        return saveSources([...sources, { ...source, id }], source.kind === 'api' && source.keyIn !== 'none' ? 'Added. Now paste its key.' : 'Added.');
      };
      const removeSource = async (source) => {
        if (!window.confirm(`Remove "${source.name}" from Finance?${source.keySet ? '\n\nIts saved key is forgotten too.' : ''}`)) return;
        if (await saveSources(sources.filter((other) => other.id !== source.id), 'Removed.') && source.kind === 'api') await act({ action: 'forget', id: source.id });
      };
      const trySource = async (source, typed) => {
        const [path, search = ''] = typed.split('?');
        const next = await act({ action: 'test', id: source.id, path, query: Object.fromEntries(new URLSearchParams(search)) });
        return next?.tested ?? '';
      };
      const briefs = Array.isArray(data.briefs) ? data.briefs : [];
      const ownTasks = Array.isArray(data.ownTasks) ? data.ownTasks : [];
      // Marks of tasks that no longer exist are dropped whenever the list is saved.
      const markTask = async (task, on) => {
        const next = ownTasks.map((other) => (other.id === task.id ? { ...other, finance: on } : other));
        await saveMarks(next, task, on);
        if (alive.current) setData((d) => ({ ...d, ownTasks: next }));
      };
      const saveMarks = (next, task, on) => save({ financeTasks: next.filter((other) => other.finance).map((other) => other.id) }, on ? `"${task.title}" will run in Finance from its next run.` : `"${task.title}" will run in Cowork again from its next run.`);

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

        h('div', { className: 'dsh-fn-group' }, 'Data sources'),
        h('p', { className: 'dsh-fn-desc' }, 'Built in, with no key: reported company figures and filings from the US securities regulator, and yearly economy readings from the World Bank. Add your own below, for share prices, estimates, news with sentiment or anything else a data service offers. The assistant can only read from a source, never send or change anything, and only at that source\'s own address.'),
        sources.map((source) => h(SourceRow, {
          key: source.id, source, busy,
          onKey: (value) => act({ action: 'key', id: source.id, value }, 'Key saved in the app\'s secret store.').then(Boolean),
          onForget: () => act({ action: 'forget', id: source.id }, 'Key forgotten.'),
          onToggle: (on) => saveSources(sources.map((other) => (other.id === source.id ? { ...other, on } : other)), on ? 'Switched on.' : 'Switched off.'),
          onRemove: () => removeSource(source),
          onTry: (typed) => trySource(source, typed),
        })),
        h(AddSource, { presets: data.presets ?? [], taken: sources.map((source) => source.id), busy, onAdd: addSource }),

        h('div', { className: 'dsh-fn-group' }, 'Scheduled briefs'),
        h('p', { className: 'dsh-fn-desc' }, 'A short update on something you follow, written by itself on a schedule: what changed, what to watch next, with sources. It runs as a task in the app\'s own scheduler, in a new conversation each time. The conversation appears under the Finance tab, and the run shows on the Automation runs page.'),
        briefs.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'No brief is scheduled.') : null,
        briefs.map((brief) => h('div', { key: brief.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, brief.subject),
            h('div', { className: 'dsh-fn-rowdesc' }, brief.status === 'paused' ? 'Paused in Automation tasks' : brief.nextAt ? `Next: ${new Date(brief.nextAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '')),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => { if (window.confirm(`Stop the brief on "${brief.subject}"?`)) void act({ action: 'unbrief', id: brief.id }, 'Brief removed.'); } }, 'Remove'))),
        h(AddBrief, { watchlist: data.watchlist ?? [], rhythms: data.rhythms ?? [], busy, onAdd: (subject, rhythm, hour) => act({ action: 'brief', subject, rhythm, hour }, 'Scheduled. You can change or pause it on the Automation tasks page.').then(Boolean) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own scheduled tasks'),
        h('p', { className: 'dsh-fn-desc' }, 'Tasks you made yourself on the Automation tasks page start in Cowork. Switch one on here and its conversations open in Finance instead: they appear under the Finance tab and the assistant follows the Finance method.'),
        ownTasks.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'You have no scheduled tasks of your own.') : null,
        ownTasks.map((task) => h('div', { key: task.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, task.title),
            h('div', { className: 'dsh-fn-rowdesc' }, `${task.finance ? 'Runs in Finance' : 'Runs in Cowork'}${task.status === 'paused' ? ' · paused' : ''}`)),
          h(Switch, { on: task.finance, label: `Run "${task.title}" in Finance`, onChange: (on) => markTask(task, on) }))),

        h('div', { className: 'dsh-fn-group' }, 'What the assistant is given'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, 'A method: figures only from sources it fetched, each with its date; facts, claims, opinions and its own reading kept apart; always a look ahead; always both sides; what it could not find; no buy or sell advice.'),
          h('li', null, 'Your selection from the drop-downs, as it was when the conversation started.'),
          h('li', null, 'Three data tools that need no key or account: a company\'s reported figures and its filings, from the US securities regulator (US-listed companies and many foreign ones), and yearly readings for economies from the World Bank.'),
          h('li', null, `${(data.skills ?? []).length} skills, one for each common task: ${(data.skills ?? []).map((skill) => skill.name.replace(/^finance-/, '').replace(/-/g, ' ')).join(', ')}.`)),

        h('div', { className: 'dsh-fn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, 'It is research, not advice. The assistant is not a licensed financial adviser, and it is told not to say buy, sell or hold. Decisions are yours.'),
          h('li', null, 'Its own data covers reported company figures and yearly economy readings. It has no share prices, no estimates and no forecasts: those, and anything about companies that do not file in the United States, come from what the assistant finds with web search and Deep research, which can be delayed or misread. Each figure should come with its source and date so you can check it.'),
          h('li', null, 'When the assistant uses the data tools, the company or country you asked about is sent to the regulator\'s or the World Bank\'s public service. Nothing else is sent, and no account is involved.'),
          h('li', null, 'What people say online is a signal, not a fact, and can be manipulated.'),
          h('li', null, 'Charts come from the Diagram builder, and your own reports can be searched if they are in the Library.'),
          h('li', null, 'A key you paste is kept in the app\'s own secret store on this Mac, not in a settings file. It is sent only to that service, and it is removed from anything the assistant is shown.'),
          h('li', null, 'A scheduled brief runs only while the app is running. It uses your models and counts against the Budget guard like any task.')));
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
