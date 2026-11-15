/**
 * Scout, browser half: the fields on the Scout tab's start page (work, place, pay, work type,
 * markets, files) and the Settings > Scout page (the switch, files, profile, markets, sources).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-scout',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'scout';
    const DICT = { en: { 'section.title': 'Scout' }, zh: { 'section.title': '机会搜索' } };

    const CSS = `
.dsh-sc-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-sc-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-sc-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sc-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sc-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-sc-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-sc-rowtext { flex: 1; min-width: 0; }
.dsh-sc-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-sc-rowtitle a { color: inherit; }
.dsh-sc-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sc-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-sc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sc-btn:disabled { opacity: .5; cursor: default; }
.dsh-sc-field {
  flex: 1 1 180px; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-sc-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
select.dsh-sc-field { cursor: pointer; flex: 0 0 auto; max-width: 220px; }
.dsh-sc-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-sc-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-sc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-sc-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-sc-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-sc-area { box-sizing: border-box; width: 100%; min-height: 160px; margin-top: 10px; padding: 10px 14px; border: 0; border-radius: 12px; resize: vertical; font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-sc-area:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-sc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-sc-side { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 55%; }
.dsh-sc-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-sc-tag { display: inline-block; margin: 2px 4px 0 0; padding: 0 6px; border-radius: 6px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }

/* The fields on the start page: only while the Scout tab is selected. */
.dsh-sc-bar { display: none; }
html[data-cws-tab="scout"] .dsh-sc-bar {
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;
}
html[data-cws-tab="scout"] [class*='_composerHero']:has(.dsh-sc-bar) { position: relative; }
html[data-cws-tab="scout"] [class*='_composerHero']:has(.dsh-sc-bar) .cws-chips { margin-top: calc(var(--dsh-sc-bar, 110px) + 36px); }
.dsh-sc-pick {
  box-sizing: border-box; height: 36px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, transparent); cursor: pointer; max-width: 200px;
}
input.dsh-sc-pick { cursor: text; width: 190px; max-width: 190px; }
.dsh-sc-pick:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-sc-chip { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 6px 0 12px; border-radius: 15px; font-size: 13px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-sc-chip button { width: 20px; height: 20px; border: 0; border-radius: 50%; padding: 0; cursor: pointer; font: inherit; line-height: 20px; color: var(--dsw-alias-label-secondary); background: transparent; }
.dsh-sc-chip button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sc-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sc-hint[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sc-break { flex-basis: 100%; height: 0; }
`;

    const TYPE_LABELS = { any: 'Any work type', employee: 'Employee', freelance: 'Freelance', contract: 'Contract', internship: 'Internship', tender: 'Public tender' };
    const ACCESS_LABELS = { api: 'read through its interface', page: 'single pages may be read', search: 'search engine results only' };

    async function readData() {
      const response = await fetch(new URL('dsh-scout/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      return response.json();
    }

    async function post(body) {
      const response = await fetch(new URL('dsh-scout/data', document.baseURI), {
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

    /** A file from the computer, as base64, for the Scout folder. */
    function readFile(file) {
      return new Promise((done, fail) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => fail(new Error('the file could not be read'));
        reader.readAsDataURL(file);
      });
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

    /** Pick files and put them in the Scout folder. */
    function useUpload(onDone, onError) {
      const input = useRef(null);
      const [busy, setBusy] = useState(false);
      const pick = () => input.current?.click();
      const change = async (event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length === 0) return;
        setBusy(true);
        try {
          let last;
          for (const file of files) {
            if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB`);
            last = await post({ action: 'upload', name: file.name, data: await readFile(file) });
          }
          onDone(last, files.length);
        } catch (problem) {
          onError(problem.message);
        } finally {
          setBusy(false);
        }
      };
      const element = h('input', { ref: input, type: 'file', multiple: true, accept: '.pdf,.txt,.md,.docx,.doc,.rtf,.odt,.html,.htm,.csv,.json', style: { display: 'none' }, onChange: change });
      return { pick, busy, element };
    }

    /** The fields under the message box on the Scout tab's start page. */
    function ScoutBar({ appCtx }) {
      const { data, setData, alive } = useData();
      const [drafts, setDrafts] = useState({});
      const [note, setNote] = useState({ text: '', error: false });
      const bar = useRef(null);
      const shown = Boolean(data && data.enabled === true);
      const upload = useUpload((next, count) => { setData(next); setNote({ text: `${count === 1 ? 'File' : `${count} files`} added to the Scout folder.`, error: false }); tell(); }, (text) => setNote({ text, error: true }));
      useEffect(() => {
        const node = bar.current;
        if (!node || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-sc-bar', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-sc-bar'); };
      }, [shown]);
      if (!shown) return h('style', null, CSS);
      const selection = data.selection ?? {};
      const save = async (values) => {
        setData((d) => ({ ...d, selection: { ...d.selection, ...values } }));
        try {
          await setSettings(appCtx, values);
          if (alive.current) setNote({ text: '', error: false });
          tell();
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        }
      };
      const field = (key, placeholder, label) => h('input', {
        className: 'dsh-sc-pick', value: drafts[key] ?? selection[key] ?? '', placeholder, 'aria-label': label, title: label, spellCheck: false, autoCorrect: 'off',
        onChange: (event) => setDrafts((d) => ({ ...d, [key]: event.target.value })),
        onBlur: () => {
          if (drafts[key] === undefined) return;
          const next = drafts[key].trim();
          setDrafts((d) => { const { [key]: _done, ...rest } = d; return rest; });
          if (next !== (selection[key] ?? '')) void save({ [key]: next });
        },
        onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      });
      const markets = Array.isArray(selection.markets) ? selection.markets : [];
      const others = (data.knownMarkets ?? []).filter((market) => !markets.includes(market));
      const files = Array.isArray(data.files) ? data.files : [];
      const summary = `${markets.length === 0 ? 'No market chosen' : `Searching ${markets.join(', ')}`}. ${files.length === 0 ? 'Add a resume or LinkedIn export (PDF) if you like.' : `${files.length} file${files.length === 1 ? '' : 's'} in the Scout folder.`} Nothing is sent or applied for.`;

      return h('div', { ref: bar, className: 'dsh-sc-bar', role: 'group', 'aria-label': 'What work to look for' },
        h('style', null, CSS),
        field('title', 'Work, e.g. data engineer', 'Job title or kind of work'),
        field('location', 'Where, or remote', 'Location'),
        field('salary', 'Pay, e.g. 90k EUR', 'Pay target'),
        h('select', { className: 'dsh-sc-pick', 'aria-label': 'Work type', title: 'Work type', value: selection.workType ?? 'any', onChange: (event) => void save({ workType: event.target.value }) },
          ['any', ...(data.workTypes ?? [])].map((type) => h('option', { key: type, value: type }, TYPE_LABELS[type] ?? type))),
        h('div', { className: 'dsh-sc-break' }),
        markets.map((market) => h('span', { key: market, className: 'dsh-sc-chip' }, market,
          h('button', { type: 'button', 'aria-label': `Remove ${market}`, title: `Remove ${market}`, onClick: () => void save({ markets: markets.filter((other) => other !== market) }) }, '×'))),
        others.length > 0 ? h('select', { className: 'dsh-sc-pick', 'aria-label': 'Add a market', value: '', onChange: (event) => { if (event.target.value) void save({ markets: [...markets, event.target.value] }); } },
          h('option', { value: '' }, '+ Market'),
          others.map((market) => h('option', { key: market, value: market }, market))) : null,
        h('button', { type: 'button', className: 'dsh-sc-pick', disabled: upload.busy, onClick: upload.pick, title: 'Add a resume, LinkedIn export (PDF) or notes to the Scout folder' }, upload.busy ? 'Adding…' : '+ Files'),
        upload.element,
        h('div', { className: 'dsh-sc-hint', 'data-error': String(note.error) }, note.text || summary));
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-sc-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    const PROFILE_MAX = 6000;
    const PROFILE_HINT = 'For example:\nTitles: data engineer, analytics engineer (senior)\nYears: 9, of which 4 leading a small team\nSkills: Python, SQL, dbt, Airflow, Snowflake, AWS; data modelling; stakeholder work\nIndustries: logistics, retail\nLanguages: English (fluent), German (B2), Spanish (basic)\nPay: currently about 85k EUR; looking for 95k+ or 700 EUR/day freelance\nWants: remote or hybrid, product companies, no on-call';

    function Profile({ text, busy, onSave }) {
      const [draft, setDraft] = useState(text);
      const [seen, setSeen] = useState(text);
      if (text !== seen) {
        if (draft === seen) setDraft(text);
        setSeen(text);
      }
      const dirty = draft.trim() !== text.trim();
      return h('div', null,
        h('textarea', { className: 'dsh-sc-area', value: draft, maxLength: PROFILE_MAX, placeholder: PROFILE_HINT, 'aria-label': 'Your profile', spellCheck: true, onChange: (event) => setDraft(event.target.value) }),
        h('div', { className: 'dsh-sc-foot' },
          h('span', null, `${draft.length} of ${PROFILE_MAX} characters${dirty ? ' · not saved' : ''}`),
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy || !dirty, onClick: () => onSave(draft) }, 'Save profile')));
    }

    /** One source: what it is, how it is reached, its key, on and off. */
    function SourceRow({ source, busy, onToggle, onHide, onRemove, onKey, onForget }) {
      const [key, setKey] = useState('');
      const needsKey = source.access === 'api' && source.key === 'required';
      const reach = needsKey ? (source.keySet ? `key saved${source.keyShown ? ` (${source.keyShown})` : ''}` : 'needs a free key: not used until you add one') : ACCESS_LABELS[source.access] ?? source.access;
      return h('div', { style: { borderBottom: '0.5px solid var(--dsw-alias-border-l1)', padding: '12px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          h('div', { className: 'dsh-sc-rowtext' },
            h('div', { className: 'dsh-sc-rowtitle' }, h('a', { href: source.url, target: '_blank', rel: 'noreferrer noopener' }, source.name)),
            h('div', { className: 'dsh-sc-rowdesc' }, `${source.kind} · ${reach}`),
            h('div', null,
              (source.markets.includes('*') ? ['All markets'] : source.markets).map((market) => h('span', { key: `m-${market}`, className: 'dsh-sc-tag' }, market)),
              source.workTypes.map((type) => h('span', { key: `t-${type}`, className: 'dsh-sc-tag' }, TYPE_LABELS[type] ?? type))),
            source.about ? h('div', { className: 'dsh-sc-rowdesc' }, source.about) : null),
          h('div', { className: 'dsh-sc-side' },
            source.extra ? h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: onRemove }, 'Remove') : h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: onHide }, 'Hide'),
            h(Switch, { on: source.on, label: `Use ${source.name}`, onChange: onToggle }))),
        needsKey ? h('div', { className: 'dsh-sc-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-sc-field', type: 'password', value: key, placeholder: source.keySet ? 'Paste a new key to replace the saved one' : (source.keyHint || 'Paste your key'), 'aria-label': `Key for ${source.name}`, autoComplete: 'off', spellCheck: false, onChange: (event) => setKey(event.target.value) }),
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy || !key.trim(), onClick: async () => { if (await onKey(key.trim())) setKey(''); } }, 'Save key'),
          source.keySet ? h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: onForget }, 'Forget key') : null) : null);
    }

    /** Add a source of your own: a site whose pages may be read, or one found through search engines only. */
    function AddSource({ markets, workTypes, kinds, busy, onAdd }) {
      const empty = { name: '', url: '', markets: '', workTypes: 'employee', kind: 'board', access: 'search', about: '' };
      const [form, setForm] = useState(empty);
      const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
      const add = async () => {
        const source = {
          name: form.name.trim(), url: form.url.trim(), kind: form.kind, access: form.access, about: form.about.trim(),
          markets: form.markets.split(',').map((item) => item.trim()).filter(Boolean),
          workTypes: form.workTypes.split(',').map((item) => item.trim()).filter(Boolean),
        };
        if (await onAdd(source)) setForm(empty);
      };
      return h('div', { className: 'dsh-sc-form' },
        h('input', { className: 'dsh-sc-field', value: form.name, placeholder: 'Name', 'aria-label': 'Name of the source', onChange: set('name') }),
        h('input', { className: 'dsh-sc-field', value: form.url, placeholder: 'Address, https://…', 'aria-label': 'Address of the source', spellCheck: false, autoCapitalize: 'off', onChange: set('url') }),
        h('input', { className: 'dsh-sc-field', list: 'dsh-sc-market-list', value: form.markets, placeholder: `Markets, for example ${markets.slice(0, 2).join(', ') || 'Germany'} (empty: all)`, 'aria-label': 'Markets, separated by commas', onChange: set('markets') }),
        h('datalist', { id: 'dsh-sc-market-list' }, markets.map((market) => h('option', { key: market, value: market }))),
        h('select', { className: 'dsh-sc-field', value: form.workTypes, 'aria-label': 'Work type', onChange: set('workTypes') },
          workTypes.map((type) => h('option', { key: type, value: type }, TYPE_LABELS[type] ?? type)),
          h('option', { value: 'employee,contract' }, 'Employee and contract'),
          h('option', { value: 'freelance,contract' }, 'Freelance and contract')),
        h('select', { className: 'dsh-sc-field', value: form.kind, 'aria-label': 'Kind of source', onChange: set('kind') }, kinds.map((kind) => h('option', { key: kind, value: kind }, kind))),
        h('select', { className: 'dsh-sc-field', value: form.access, 'aria-label': 'How it may be reached', onChange: set('access') },
          h('option', { value: 'search' }, 'Search engine results only'),
          h('option', { value: 'page' }, 'Single pages may be read')),
        h('input', { className: 'dsh-sc-field', value: form.about, placeholder: 'What it is good for, in one line (the assistant reads this)', 'aria-label': 'About the source', onChange: set('about') }),
        h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy || !form.name.trim() || !form.url.trim(), onClick: add }, 'Add'));
    }

    function ScoutPage({ appCtx }) {
      const { data, setData, error, alive, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [market, setMarket] = useState('');
      const [filter, setFilter] = useState('mine');
      const upload = useUpload((next, count) => { setData(next); setNote({ text: `${count === 1 ? 'File' : `${count} files`} added.`, error: false }); tell(); }, (text) => setNote({ text, error: true }));

      if (!data) {
        return h('div', { className: 'dsh-sc-page' }, h('style', null, CSS), h('h2', { className: 'dsh-sc-title' }, 'Scout'), h('p', { className: 'dsh-sc-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const save = async (values, done = 'Saved.') => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setNote({ text: done, error: false });
          tell();
          setTimeout(() => { if (alive.current) load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
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

      const selection = data.selection ?? {};
      const markets = Array.isArray(selection.markets) ? selection.markets : [];
      const sources = Array.isArray(data.sources) ? data.sources : [];
      const visible = sources.filter((source) => !source.hidden && (filter === 'all' || source.markets.includes('*') || source.markets.some((name) => markets.includes(name))));
      const hidden = sources.filter((source) => source.hidden);
      const files = Array.isArray(data.files) ? data.files : [];
      const addMarket = () => {
        const name = market.trim();
        if (!name) return;
        setMarket('');
        if (!markets.some((other) => other.toLowerCase() === name.toLowerCase())) void save({ markets: [...markets, name] }, `${name} added.`);
      };

      return h('div', { className: 'dsh-sc-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-sc-title' }, 'Scout'),
        h('p', { className: 'dsh-sc-desc' }, 'A tab for finding work: jobs, freelance projects, contracts and public tenders. The assistant researches titles, skills and pay in each market first, searches the sources below in each market\'s language, scores what it finds, flags likely ghost jobs and scams, and plans how to approach the best ones. Nothing is sent or applied for: messages are drafts.'),
        note.text ? h('p', { className: 'dsh-sc-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-sc-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-sc-group' }, 'The tab'),
        h('div', { className: 'dsh-sc-row' },
          h('div', { className: 'dsh-sc-rowtext' },
            h('div', { className: 'dsh-sc-rowtitle' }, 'Show the Scout tab'),
            h('div', { className: 'dsh-sc-rowdesc' }, 'On adds the tab, its fields on the start page, its instructions and its tools. Off takes them away; your files, profile and sources are kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Scout tab', onChange: (on) => save({ enabled: on }, on ? 'Switched on. The Scout tab appears in the sidebar in a moment.' : 'Switched off. The Scout tab is taken away in a moment.') })),

        h('div', { className: 'dsh-sc-group' }, 'Your files'),
        h('p', { className: 'dsh-sc-desc' }, `Your resume, a LinkedIn export (PDF) or notes. They stay in this folder on this Mac; Scout reads them with whichever model the conversation uses. PDFs need the PDF reader add-on. Folder: ${data.folder}`),
        files.map((file) => h('div', { key: file.name, className: 'dsh-sc-row' },
          h('div', { className: 'dsh-sc-rowtext' },
            h('div', { className: 'dsh-sc-rowtitle' }, file.name),
            h('div', { className: 'dsh-sc-rowdesc' }, `${Math.max(1, Math.round(file.size / 1024))} KB · ${file.modified}${file.readable ? '' : ' · not a kind Scout reads'}`)))),
        h('div', { className: 'dsh-sc-form' },
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy || upload.busy, onClick: upload.pick }, upload.busy ? 'Adding…' : 'Add files'),
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: () => void act({ action: 'reveal' }) }, 'Show in Finder'),
          upload.element),

        h('div', { className: 'dsh-sc-group' }, 'Your profile'),
        h('p', { className: 'dsh-sc-desc' }, 'A short summary: titles, years, skills, languages, pay, what you want. Write it here, or ask Scout to write it from your files: Scout is told to show you the draft and save it only after you agree, and the old one is kept as profile.md.bak. A Scout conversation reads it when it needs it (scout_profile); the helpers it starts cannot.'),
        h(Profile, { text: typeof data.profile === 'string' ? data.profile : '', busy, onSave: (text) => act({ action: 'profile', text }, 'Profile saved.') }),

        h('div', { className: 'dsh-sc-group' }, 'Markets'),
        h('p', { className: 'dsh-sc-desc' }, 'Where to search. Each market is searched in its own languages. You can also change these on the Scout tab.'),
        markets.map((name) => h('div', { key: name, className: 'dsh-sc-row' },
          h('div', { className: 'dsh-sc-rowtext' }, h('div', { className: 'dsh-sc-rowtitle' }, name)),
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: () => void save({ markets: markets.filter((other) => other !== name) }, `${name} removed.`) }, 'Remove'))),
        h('div', { className: 'dsh-sc-form' },
          h('input', { className: 'dsh-sc-field', list: 'dsh-sc-known', value: market, placeholder: 'A market, for example France', 'aria-label': 'Add a market', onChange: (event) => setMarket(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') addMarket(); } }),
          h('datalist', { id: 'dsh-sc-known' }, (data.knownMarkets ?? []).filter((name) => !markets.includes(name)).map((name) => h('option', { key: name, value: name }))),
          h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy || !market.trim(), onClick: addMarket }, 'Add')),

        h('div', { className: 'dsh-sc-group' }, 'Sources'),
        h('p', { className: 'dsh-sc-desc' }, 'Where Scout looks. Each source says how it may be reached, and Scout holds to it: a source with an interface is searched directly; "single pages may be read" means one page at a time; "search engine results only" means Scout finds its postings through web search and never opens its pages, because its terms do not allow it. Keys are kept in the app\'s secret store.'),
        h('div', { className: 'dsh-sc-form' },
          h('select', { className: 'dsh-sc-field', value: filter, 'aria-label': 'Which sources to show', onChange: (event) => setFilter(event.target.value) },
            h('option', { value: 'mine' }, 'Sources for my markets'),
            h('option', { value: 'all' }, 'All sources'))),
        visible.map((source) => h(SourceRow, {
          key: source.id, source, busy,
          onToggle: (on) => act({ action: 'toggle', id: source.id, on }, on ? `${source.name} switched on.` : `${source.name} switched off.`),
          onHide: () => act({ action: 'hide', id: source.id }, `${source.name} hidden. Put it back below.`),
          onRemove: () => { if (window.confirm(`Remove "${source.name}"?`)) void act({ action: 'remove', id: source.id }, 'Removed.'); },
          onKey: (value) => act({ action: 'key', id: source.id, value }, 'Key saved in the app\'s secret store.').then(Boolean),
          onForget: () => act({ action: 'forget', id: source.id }, 'Key forgotten.'),
        })),
        h('p', { className: 'dsh-sc-desc' }, 'Add a source of your own:'),
        h(AddSource, { markets: data.knownMarkets ?? [], workTypes: data.workTypes ?? [], kinds: data.kinds ?? [], busy, onAdd: (source) => act({ action: 'add', source }, `${source.name} added.`).then(Boolean) }),
        hidden.length > 0 ? h('div', null,
          h('p', { className: 'dsh-sc-desc' }, 'Hidden sources:'),
          hidden.map((source) => h('div', { key: source.id, className: 'dsh-sc-row' },
            h('div', { className: 'dsh-sc-rowtext' }, h('div', { className: 'dsh-sc-rowtitle' }, source.name)),
            h('button', { type: 'button', className: 'dsh-sc-btn', disabled: busy, onClick: () => void act({ action: 'unhide', id: source.id }, `${source.name} is back.`) }, 'Put back')))) : null,

        h('div', { className: 'dsh-sc-group' }, 'Good to know'),
        h('ul', { className: 'dsh-sc-list' },
          h('li', null, 'Scout conversations get only these tools: Scout\'s own nine (sources, search, posting text, titles, demand, pay, your files, your profile, the report), web search and page reading, Deep research (Scout always has the web; there is no Web button in its chat box), the Finance news, filings and figures tools when Finance is on, charts, a step list and questions. No file, shell or program tools. Helpers started by Scout get no access to your files, profile or reports.'),
          h('li', null, 'Search queries carry titles, skills and places, never your name or contact details. Web search goes through your web search provider; the job sources get only the search itself.'),
          h('li', null, 'Every run ends with a report saved as Markdown and a table (CSV) in the reports folder inside your Scout folder.'),
          h('li', null, 'Results depend on what each source lists and on the model. Check a posting on its own page before you act on it.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'scout', order: 113, label: () => t('section.title') }, (props) => h(ScoutPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'scout-bar', order: 41 }, () => h(ScoutBar, { appCtx: ctx }))));
      },
    };
  },
});
