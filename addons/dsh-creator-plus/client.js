/**
 * Creator Plus, browser half: Settings → Creator Plus (the switch, the fixed rules, the result cards with
 * their buttons, what it learned, the settings, saved runs, the self-test) and the bar in the chat box of a
 * Creator Plus conversation (which plugins, what to do, Look only, Logs from, the run in one sentence).
 * The real setup changes only from this page's buttons, which only the user can press.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-creator-plus',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useEffect, useLayoutEffect, useRef, useState } = React;

    const NS = 'creator-plus';
    const DICT = { en: { 'section.title': 'Creator Plus' }, zh: { 'section.title': '创作者增强' } };
    const when = (at) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

    const CSS = `
.dsh-cp-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-cp-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-cp-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-cp-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-cp-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-cp-row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cp-rowtext { flex: 1; min-width: 0; }
.dsh-cp-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-cp-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-wrap; }
.dsh-cp-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.dsh-cp-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-cp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-btn:disabled { opacity: .5; cursor: default; }
.dsh-cp-input, .dsh-cp-area, .dsh-cp-select { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-cp-input { width: 100%; height: 30px; margin-top: 6px; padding: 0 10px; }
.dsh-cp-area { width: 100%; min-height: 60px; margin-top: 6px; padding: 6px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-cp-select { height: 28px; }
.dsh-cp-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-cp-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-cp-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-cp-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-cp-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-cp-tag { display: inline-block; padding: 0 6px; margin-right: 6px; border-radius: 6px; font-size: 11px; line-height: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.dsh-cp-ctl { display: inline-flex; align-items: center; gap: 5px; height: 28px; max-width: 240px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cp-ctl:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: 420px; max-width: calc(100vw - 24px); padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-cp-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-cp-plugins { max-height: 180px; overflow-y: auto; margin-top: 6px; padding: 4px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cp-plugins label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
.dsh-cp-sentence { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
`;

    async function call(body, session = '') {
      const response = await fetch(new URL(`dsh-creator-plus/data${session ? `?session=${encodeURIComponent(session)}` : ''}`, document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }
    async function setEnabled(appCtx, on) {
      const result = await appCtx.remote.settings.describe();
      const row = result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
      if (!row) throw new Error('Creator Plus is not running.');
      let done = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: on }], row.revision);
      if (!done.ok && done.error.code === 'settings/conflict') {
        const again = await appCtx.remote.settings.describe();
        const fresh = again.ok ? again.value.namespaces.find((entry) => entry.ns === NS) : undefined;
        done = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: on }], fresh?.revision);
      }
      if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
    }

    /** The run in one sentence, as the page shows it before the run starts (the server says the same). */
    function sentenceOf(state, runs) {
      const run = runs.find((entry) => entry.id === state.run) ?? runs[0];
      if (!run) return '';
      const short = (name) => name.replace(/^@local\/dsh-/, '');
      const which = state.all ? 'every plugin' : state.selection.length === 0 ? 'a new plugin' : `${state.selection.slice(0, 4).map(short).join(', ')}${state.selection.length > 4 ? ` and ${state.selection.length - 4} more` : ''}`;
      const logs = run.logs ? ` from the logs of ${{ last: 'since the last run', 7: 'the last 7 days', 30: 'the last 30 days', all: 'everything' }[state.logsFrom] ?? 'the last 30 days'}` : '';
      const how = state.lookOnly ? ', looking only (nothing is prepared, not even in the trial copy)' : run.changes ? ', with changes prepared in the trial copy and nothing changed in your setup without your yes' : ', reporting only';
      return `${run.label}: ${which}${logs}${how}.`;
    }

    /** The bar: what to work on, and what to do (only in a Creator Plus conversation). */
    function CreatorBar({ sessionId, appCtx }) {
      const [view, setView] = useState(null);
      const [open, setOpen] = useState(false);
      const [state, setState] = useState(null);
      const [note, setNote] = useState('');
      const [runName, setRunName] = useState('');
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        let alive = true;
        let timer;
        const tick = async () => {
          let mine = false;
          try {
            const data = await call(undefined, sessionId);
            mine = data?.enabled === true && data?.session?.inCreator === true;
            if (alive) setView(data);
          } catch {
            /* tried again shortly */
          }
          // A conversation of another tab asks seldom: it only has to notice when it becomes a Creator Plus one.
          if (alive) timer = setTimeout(tick, document.hidden ? 30000 : mine ? 8000 : 20000);
        };
        if (sessionId) void tick();
        return () => { alive = false; clearTimeout(timer); };
      }, [sessionId]);
      useEffect(() => {
        if (view?.session?.bar && !open) setState(view.session.bar);
      }, [view, open]);
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 432)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!view || view.enabled !== true || !view.session?.inCreator || !state) return null;
      const runs = Array.isArray(view.runs) ? view.runs : [];
      const run = runs.find((entry) => entry.id === state.run) ?? runs[0];
      const plugins = view.map?.plugins ?? [];
      const save = async (next) => {
        setState(next);
        try {
          const data = await call({ action: 'bar', sessionId, state: next }, sessionId);
          setNote(data.note ?? '');
        } catch (problem) {
          setNote(problem.message);
        }
      };
      const start = async () => {
        try {
          const data = await call({ action: 'start', sessionId, state }, sessionId);
          await call({ action: 'bar', sessionId, state }, sessionId);
          const remote = appCtx.get('remote.session');
          if (!remote?.prompt) throw new Error('This version of the app cannot send the run from here: copy the sentence into the chat.');
          const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `creator-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: `Run: ${data.note}` }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'not sent');
          setOpen(false);
        } catch (problem) {
          setNote(problem.message);
        }
      };
      const toggle = (name) => save({ ...state, all: false, selection: state.selection.includes(name) ? state.selection.filter((item) => item !== name) : [...state.selection, name] });
      const reconPicked = state.selection.some((name) => /dsh-recon$/.test(name));
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-cp-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, title: sentenceOf(state, runs), onClick: () => setOpen(!open) }, `Creator Plus · ${run?.label ?? ''}`),
        open ? ReactDOM.createPortal(
          h('div', { ref: panel, className: 'dsh-cp-pop', role: 'dialog', 'aria-label': 'Creator Plus bar', style: { left: place.left, bottom: place.bottom, maxHeight: `calc(100vh - ${place.bottom + 12}px)`, overflowY: 'auto' } },
            h('style', null, CSS),
            h('div', { className: 'title' }, 'What to do'),
            h('select', { className: 'dsh-cp-select', value: state.run, 'aria-label': 'Kind of run', onChange: (event) => void save({ ...state, run: event.target.value }) }, runs.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
            h('div', { className: 'dsh-cp-desc' }, run?.does ?? ''),
            h('div', { className: 'title', style: { marginTop: 10 } }, 'Which plugins'),
            h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 } },
              h('input', { type: 'checkbox', checked: state.all === true, onChange: (event) => void save({ ...state, all: event.target.checked, selection: event.target.checked ? plugins.map((plugin) => plugin.name) : [] }) }), 'All (on purpose)'),
            h('div', { className: 'dsh-cp-plugins' }, plugins.map((plugin) => h('label', { key: plugin.name, title: plugin.locked ? 'Locked: read, explained and checked, never edited' : '' },
              h('input', { type: 'checkbox', checked: state.selection.includes(plugin.name), onChange: () => void toggle(plugin.name) }),
              h('span', null, `${plugin.locked ? '🔒 ' : ''}${plugin.name.replace(/^@local\//, '').replace(/^@deepseek-ai\//, '')}${plugin.enabled ? '' : ' (off)'}`)))),
            reconPicked ? h('div', { className: 'dsh-cp-desc' }, 'Recon: Creator Plus reads only which step failed and why, without the conversation text. Reading the text needs your yes first, names the model that would read it, and is done by a reader with no tools.') : null,
            h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 } },
              h('button', { type: 'button', role: 'switch', className: 'dsh-cp-switch', 'aria-checked': state.lookOnly === true, 'aria-label': 'Look only', onClick: () => void save({ ...state, lookOnly: !state.lookOnly }) }), 'Look only: read and report; prepare no change, not even in the trial copy'),
            run?.logs ? h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } }, 'Logs from',
              h('select', { className: 'dsh-cp-select', value: state.logsFrom, onChange: (event) => void save({ ...state, logsFrom: event.target.value }) },
                [['last', 'since the last run'], ['7', 'the last 7 days'], ['30', 'the last 30 days'], ['all', 'everything']].map(([id, label]) => h('option', { key: id, value: id }, label)))) : null,
            h('div', { className: 'dsh-cp-sentence' }, sentenceOf(state, runs)),
            h('div', { className: 'dsh-cp-btns' },
              h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => void start() }, 'Start this run'),
              h('input', { className: 'dsh-cp-input', style: { width: 150, marginTop: 0 }, placeholder: 'Name to save it', value: runName, onChange: (event) => setRunName(event.target.value) }),
              h('button', { type: 'button', className: 'dsh-cp-btn', disabled: !runName.trim(), onClick: async () => { try { const data = await call({ action: 'saveRun', name: runName, state }, sessionId); setNote(data.note ?? ''); setRunName(''); } catch (problem) { setNote(problem.message); } } }, 'Save run')),
            (view.savedRuns ?? []).length ? h('div', { className: 'dsh-cp-desc', style: { marginTop: 8 } }, 'Saved runs: ', (view.savedRuns ?? []).map((saved) => h('button', { key: saved.name, type: 'button', className: 'dsh-cp-btn', style: { marginRight: 4 }, onClick: () => void save({ ...state, ...saved.state }) }, saved.name))) : null,
            note ? h('div', { className: 'dsh-cp-desc', role: 'status' }, note) : null),
          document.body) : null);
    }

    /** One result card with its buttons. */
    const PRE = { margin: '6px 0 0', padding: '8px 10px', maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', borderRadius: 8, fontSize: 11, background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)' };
    /** The code behind a card, in full: a ready plugin's files, or a change line by line and its new files as Apply writes them. */
    function CodeView({ code }) {
      if (code.kind === 'change') {
        return h('div', null,
          code.cut ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, 'Too long to show in full: it cannot be applied from here.') : null,
          h('div', { className: 'dsh-cp-rowdesc' }, 'The change, line by line (- taken out, + put in):'),
          h('pre', { style: PRE }, code.diff),
          (code.files ?? []).map((file) => h('details', { key: file.path, className: 'dsh-cp-rowdesc' }, h('summary', { style: { cursor: 'pointer' } }, `${file.path}, as Apply writes it`), h('pre', { style: PRE }, file.text))));
      }
      return h('div', null,
        (code.binary ?? []).length ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, `Files that cannot be shown (so it is not installed from here): ${code.binary.join(', ')}`) : null,
        (code.modules ?? []).length ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, `Modules that are not Creator Plus's own (so it is not installed from here): ${code.modules.slice(0, 10).join(', ')}`) : null,
        code.tooLong ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, 'Too much code to show in full: it is not installed from here.') : null,
        h('div', { className: 'dsh-cp-rowdesc' }, `${(code.files ?? []).length} files; its modules are Creator Plus's own.`),
        (code.files ?? []).map((file) => h('details', { key: file.path, className: 'dsh-cp-rowdesc' }, h('summary', { style: { cursor: 'pointer' } }, file.path), h('pre', { style: PRE }, file.text))));
    }

    function Card({ card, busy, act }) {
      const canTry = card.kind === 'change' || card.kind === 'new-plugin';
      const [code, setCode] = useState(null);
      const [problem, setProblem] = useState('');
      const show = async () => {
        if (code) return setCode(null);
        try {
          setCode((await call({ action: 'code', id: card.id })).code);
          setProblem('');
        } catch (error) {
          setProblem(error.message);
        }
        return undefined;
      };
      return h('div', { className: 'dsh-cp-row' },
        h('div', { className: 'dsh-cp-rowtext' },
          h('div', { className: 'dsh-cp-rowtitle' }, h('span', { className: 'dsh-cp-tag' }, card.status), card.title),
          h('div', { className: 'dsh-cp-rowdesc' }, card.text),
          canTry ? h('button', { type: 'button', className: 'dsh-cp-btn', style: { marginTop: 6 }, onClick: () => void show() }, code ? 'Hide' : card.kind === 'change' ? 'Show the change' : 'Show the code') : null,
          problem ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, problem) : null,
          code ? h(CodeView, { code }) : null,
          h('div', { className: 'dsh-cp-rowdesc' }, when(card.at)),
          h('div', { className: 'dsh-cp-btns' },
            canTry && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'try') }, 'Try it in the trial copy') : null,
            canTry && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'apply') }, 'Apply to my setup') : null,
            card.status === 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'undo') }, card.kind === 'new-plugin' ? 'Remove' : 'Undo') : null,
            card.status === 'open' || card.status === 'tried' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'later') }, 'Not now') : null,
            card.status !== 'never' && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'never') }, 'Do not suggest this again') : null)));
    }

    function CreatorPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState({ text: '', error: false });
      const [draft, setDraft] = useState(null);
      const alive = useRef(true);
      const load = async () => {
        try {
          const next = await call();
          if (alive.current) setData(next);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not load: ${problem.message}`, error: true });
        }
      };
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000);
        return () => { alive.current = false; clearInterval(timer); };
      }, []);
      useEffect(() => {
        if (data && data.enabled === true && draft === null) setDraft({ strongModels: data.strongModels, plusFolder: data.plusFolder });
      }, [data, draft]);
      if (!data) return h('div', { className: 'dsh-cp-page' }, h('style', null, CSS), h('h2', { className: 'dsh-cp-title' }, 'Creator Plus'), h('p', { className: 'dsh-cp-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      const run = async (work, done) => {
        setBusy(true);
        try {
          const answer = await work();
          if (alive.current) setNote({ text: answer?.note || done || '', error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const act = (card, what) => run(() => call({ action: 'card', id: card.id, act: what }), what === 'apply' ? 'Applied.' : what === 'try' ? 'Tried in the trial copy.' : 'Done.');
      const openCards = (data.cards ?? []).filter((card) => card.status !== 'never' && card.status !== 'undone');
      // The top of the page: its title, its words, the switch.
      const top = [
        h('style', null, CSS),
        h('h2', { className: 'dsh-cp-title' }, 'Creator Plus'),
        h('p', { className: 'dsh-cp-desc' }, 'A tab that builds and improves plugins so they fit everything you have, tries every change in a trial copy first, and keeps your plugins working after updates. It never changes your real setup by itself: the buttons on this page do, and only you press them.'),
        note.text ? h('p', { className: 'dsh-cp-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-cp-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-cp-group' }, 'The tab'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, 'Show the Creator Plus tab'), h('div', { className: 'dsh-cp-rowdesc' }, 'On adds the tab and its tools. Off takes them away; its folder (backups, cards, what it learned) stays.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-cp-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Creator Plus tab', disabled: busy, onClick: () => void run(() => setEnabled(appCtx, data.enabled !== true), data.enabled ? 'Switched off.' : 'Switched on: the tab appears in a few seconds.') })),
      ];
      // Switched off, the page shows the switch alone (the server gives nothing else).
      if (data.enabled !== true) return h('div', { className: 'dsh-cp-page' }, ...top, h('p', { className: 'dsh-cp-desc' }, 'Switched off: the tab, its tools and its saved runs are off (scheduled saved runs are paused; switch them on again on the Automations page). Switch it on to see the results, what it learned, the settings and the backups.'));
      return h('div', { className: 'dsh-cp-page' },
        ...top,

        h('div', { className: 'dsh-cp-group' }, 'Rules that never bend'),
        h('ul', { className: 'dsh-cp-list' }, (data.rules ?? []).map((rule) => h('li', { key: rule.id }, h('b', null, rule.text), ` ${rule.enforced}`))),

        h('div', { className: 'dsh-cp-group' }, `Results (${openCards.length})`),
        openCards.length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'Nothing yet. Findings, prepared changes, questions and ready plugins from Creator Plus conversations appear here.') : null,
        openCards.slice(0, 60).map((card) => h(Card, { key: card.id, card, busy, act })),

        h('div', { className: 'dsh-cp-group' }, 'What Creator Plus learned'),
        (data.learning ?? []).length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'Nothing yet. It proposes your usual answers, how things are built here and mistakes not to repeat; each is kept only when you press Keep, and can be undone.') : null,
        (data.learning ?? []).filter((item) => item.status !== 'undone').slice(0, 40).map((item) => h('div', { key: item.id, className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, h('span', { className: 'dsh-cp-tag' }, `${item.kind} · ${item.status}`), item.text),
            h('div', { className: 'dsh-cp-rowdesc' }, `Why: ${item.reason} · ${when(item.at)}${item.thirdParty ? ' · from a third-party plugin' : ''}`),
            h('div', { className: 'dsh-cp-btns' },
              item.thirdParty && !item.read ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'read' })) }, 'I read it') : null,
              item.status === 'proposed' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'keep' }), 'Kept.') }, 'Keep') : null,
              h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'undo' }), 'Undone.') }, 'Undo'))))),

        h('div', { className: 'dsh-cp-group' }, 'Settings'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Who may read your session logs'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'To improve your plugins, Creator Plus reads what went wrong in past conversations (masked; Recon only as which step failed). Choose which models may read them.')),
          h('select', { className: 'dsh-cp-select', value: data.logReaders, disabled: busy, onChange: (event) => void run(() => call({ action: 'settings', logReaders: event.target.value }), 'Saved.') }, (data.logReaderChoices ?? []).map((choice) => h('option', { key: choice.id, value: choice.id }, choice.label)))),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Strong models'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'Models you trust to improve on a recipe\'s default steps (they still follow every "must" step and pass every check). One per line, as provider/model.'),
            h('textarea', { className: 'dsh-cp-area', value: draft?.strongModels ?? '', placeholder: '<provider>/<model>', onChange: (event) => setDraft({ ...draft, strongModels: event.target.value }) })),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy || draft?.strongModels === data.strongModels, onClick: () => void run(() => call({ action: 'settings', strongModels: draft.strongModels }), 'Saved.') }, 'Save')),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Plus folder with its tests'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'An installed copy carries no tests. Give the full path of a Plus folder (the download or a copy of the project) and Creator Plus runs each plugin\'s tests after an update and with a change. Empty: tests are not run.'),
            h('input', { className: 'dsh-cp-input', value: draft?.plusFolder ?? '', placeholder: '/Users/you/…/deepseek-harness-plus', onChange: (event) => setDraft({ ...draft, plusFolder: event.target.value }) })),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy || draft?.plusFolder === data.plusFolder, onClick: () => void run(() => call({ action: 'settings', plusFolder: draft.plusFolder }), 'Saved.') }, 'Save')),

        h('div', { className: 'dsh-cp-group' }, 'Saved runs'),
        (data.savedRuns ?? []).length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'None yet. Save a run from the bar in a Creator Plus conversation; saved runs are also offered on the Automations page, to run on a schedule (a scheduled run changes nothing without your yes).') : null,
        (data.savedRuns ?? []).map((saved) => h('div', { key: saved.name, className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, saved.name), h('div', { className: 'dsh-cp-rowdesc' }, saved.sentence)),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'deleteRun', name: saved.name }), 'Deleted.') }, 'Delete'))),

        h('div', { className: 'dsh-cp-group' }, 'Self-test'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, 'The eight tests'), h('div', { className: 'dsh-cp-rowdesc' }, 'Runs the parts code can check by itself in a throwaway folder: Collision, Change, Update, Long run, Scope and part of Improve. Rebuild, Look and the rest of Improve need a model: in a Creator Plus conversation, ask it to run its self-test (creator_selftest) on the model you want scored.')),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'selftest' })) }, 'Run')),

        h('div', { className: 'dsh-cp-group' }, `Backups (${(data.backups ?? []).length})`),
        h('p', { className: 'dsh-cp-desc' }, (data.backups ?? []).length ? `Every change and install keeps the version before it. Newest: ${(data.backups ?? []).slice(0, 5).join(', ')}. Undo on a card puts one back.` : 'None yet. Every change and install keeps the version before it here.'));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'creator-plus', order: 117, label: () => t('section.title') }, (props) => h(CreatorPage, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'creator-plus-bar', order: -16, label: () => 'Creator Plus' }, (props) => h(CreatorBar, { sessionId: props?.sessionId, appCtx: ctx }))));
      },
    };
  },
});
