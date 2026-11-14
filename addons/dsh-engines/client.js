/**
 * Engines, browser half: one page. Its first part says how to use an engine in Code mode and sets
 * when its changes go into the project. Its second part is the comparison: a task goes to dsh and to an outside engine at once, each in
 * its own copy of the project, and the two results stand side by side with their figures.
 * The dsh side is a real Code conversation, which this page starts and the server half follows.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-engines',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'engines';
    const DICT = { en: { 'panel.title': 'Engines' }, zh: { 'panel.title': '引擎' } };

    const CSS = `
.dsh-cp-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-cp-title { margin: 0; font-size: 18px; line-height: 26px; font-weight: 600; }
.dsh-cp-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-cp-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-cp-group { margin: 22px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-cp-form { display: grid; grid-template-columns: 120px 1fr; gap: 10px 12px; align-items: start; margin-top: 14px; }
.dsh-cp-form label { padding-top: 6px; color: var(--dsw-alias-label-secondary); }
.dsh-cp-input, .dsh-cp-area, .dsh-cp-select {
  width: 100%; box-sizing: border-box; padding: 6px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-cp-area { min-height: 84px; resize: vertical; line-height: 19px; }
.dsh-cp-btn {
  height: 30px; padding: 0 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-cp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-btn:disabled { opacity: .5; cursor: default; }
.dsh-cp-btn[data-main="true"] { color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); border-color: transparent; }
.dsh-cp-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsh-cp-runs { display: flex; gap: 6px; flex-wrap: wrap; }
.dsh-cp-run { height: 26px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); background: transparent; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-cp-run[aria-pressed="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-cp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
@media (max-width: 760px) { .dsh-cp-cols { grid-template-columns: 1fr; } }
.dsh-cp-col { min-width: 0; padding: 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-cp-colhead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.dsh-cp-name { font-size: 15px; font-weight: 600; }
.dsh-cp-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-cp-status[data-status="finished"] { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dsh-cp-status[data-status="failed"] { color: var(--dsw-alias-state-error-primary); }
.dsh-cp-figs { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 12px 0 0; font-variant-numeric: tabular-nums; }
.dsh-cp-figs dt { color: var(--dsw-alias-label-secondary); }
.dsh-cp-figs dd { margin: 0; overflow-wrap: anywhere; }
.dsh-cp-figs dd[data-best="true"] { font-weight: 600; }
.dsh-cp-sub { margin: 14px 0 4px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-cp-pre {
  margin: 0; padding: 8px 10px; max-height: 320px; overflow: auto; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.dsh-cp-pre[data-plain="true"] { font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-cp-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-engines/state', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }

    async function setSettings(ctx, values) {
      const read = async () => {
        const result = await ctx.remote.settings.describe();
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
        const view = result.value.namespaces.find((entry) => entry.ns === NS);
        if (!view) throw new Error('not mounted');
        return view.revision;
      };
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await read());
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await read());
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    const count = (n) => (Number(n) || 0).toLocaleString('en-US');
    const span = (pane, now) => {
      if (!pane.startedAt) return '–';
      const seconds = Math.max(0, Math.round(((pane.endedAt || now) - pane.startedAt) / 1000));
      return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    };
    const STATUS = { waiting: 'Starting…', running: 'Working…', finished: 'Finished', failed: 'Did not finish', stopped: 'Stopped' };

    /** Put a conversation into Code mode before its first turn: the selected tab decides a new conversation's mode. */
    async function chooseCode(appCtx) {
      const read = async () => {
        const result = await appCtx.remote.settings.describe();
        if (!result.ok) throw new Error(result.error.message);
        return result.value.namespaces.find((entry) => entry.ns === 'modes');
      };
      const modes = await read();
      if (!modes || modes.value?.defaultMode === 'code') return;
      const done = await appCtx.remote.settings.mutate('modes', [{ op: 'set', path: ['defaultMode'], value: 'code' }], modes.revision);
      if (!done.ok) throw new Error(done.error.message);
    }

    function Pane({ pane, other, now, appCtx }) {
      const total = pane.input + pane.output;
      const otherTotal = other ? other.input + other.output : 0;
      const done = pane.status === 'finished' && other?.status === 'finished';
      const diff = pane.diff;
      const fig = (label, value, best) => [h('dt', { key: `${label}t` }, label), h('dd', { key: `${label}d`, 'data-best': String(Boolean(best)) }, value)];
      return h('div', { className: 'dsh-cp-col' },
        h('div', { className: 'dsh-cp-colhead' },
          h('span', { className: 'dsh-cp-name' }, pane.label),
          h('span', { className: 'dsh-cp-status', 'data-status': pane.status }, STATUS[pane.status] ?? pane.status)),
        pane.error ? h('p', { className: 'dsh-cp-desc', 'data-error': 'true' }, pane.error) : null,
        h('dl', { className: 'dsh-cp-figs' },
          fig('Model', pane.model || '–'),
          fig('Tokens', `${count(total)} (in ${count(pane.input)}, out ${count(pane.output)})`, done && total > 0 && total < otherTotal),
          fig('Steps', count(pane.steps), done && pane.steps > 0 && pane.steps < other.steps),
          fig('Tool calls', count(pane.tools)),
          fig('Time', span(pane, now), done && (pane.endedAt - pane.startedAt) < (other.endedAt - other.startedAt)),
          fig('Cost', pane.cost === null || pane.cost === undefined ? 'not reported' : `$${Number(pane.cost).toFixed(4)}`),
          fig('Changed', diff ? (diff.error ? `could not be worked out: ${diff.error}` : `${diff.files} file${diff.files === 1 ? '' : 's'}, +${count(diff.added)} −${count(diff.removed)} lines`) : pane.endedAt ? 'being worked out…' : '–')),
        pane.engine === 'dsh' && pane.sessionId
          ? h('div', { className: 'dsh-cp-bar', style: { marginTop: 10 } }, h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => { try { appCtx.get('layout').selectPanel(null); appCtx.get('uiWorkspace').openSession(pane.sessionId); } catch { /* the conversation is gone */ } } }, 'Open the conversation'))
          : null,
        h('div', { className: 'dsh-cp-sub' }, 'Answer'),
        h('pre', { className: 'dsh-cp-pre', 'data-plain': 'true' }, pane.text || (pane.endedAt ? '(no answer text)' : '…')),
        h('div', { className: 'dsh-cp-sub' }, 'What it changed'),
        h('pre', { className: 'dsh-cp-pre' }, diff ? (diff.patch || (diff.error ? '' : 'No file was changed.')) + (diff.cut ? '\n… (the rest is left out; the copy holds everything)' : '') : '…'),
        pane.work ? h('p', { className: 'dsh-cp-desc' }, `Its copy of the project: ${pane.work}`) : null);
    }

    function ComparePage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [project, setProject] = useState('');
      const [task, setTask] = useState('');
      const [model, setModel] = useState('');
      const [picked, setPicked] = useState('');
      const [now, setNow] = useState(Date.now());
      const [names, setNames] = useState('');
      const namesSeen = useRef(false);
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); setNow(Date.now()); }
        } catch (problem) {
          if (alive.current) setError(String(problem?.message ?? problem));
        }
      }, []);
      const running = data?.running === true;
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, running ? 1500 : 6000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load, running]);

      // The model names field starts with what is saved, once. Before the first return, so the hook order never changes.
      const savedNames = data?.opencodeModels;
      useEffect(() => {
        if (!Array.isArray(savedNames) || namesSeen.current) return;
        namesSeen.current = true;
        setNames(savedNames.join('\n'));
      }, [savedNames]);

      let workspaces = [];
      try {
        const snap = appCtx.get('workspaces')?.list?.getSnapshot?.();
        workspaces = (Array.isArray(snap) ? snap : (snap?.workspaces ?? snap?.items ?? [])).filter((ws) => ws && typeof ws.path === 'string');
      } catch {
        workspaces = [];
      }

      if (!data) {
        return h('div', { className: 'dsh-cp-page' }, h('style', null, CSS), h('h2', { className: 'dsh-cp-title' }, 'Compare'), h('p', { className: 'dsh-cp-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const engine = (data.engines ?? [])[0];
      const runs = data.runs ?? [];
      const run = runs.find((one) => one.id === picked) ?? runs[0];

      const start = async () => {
        setBusy(true);
        setNote({ text: 'Copying the project…', error: false });
        let made;
        try {
          made = (await call({ action: 'start', project, task, engine: engine?.id, model })).made;
          setPicked(made);
          await load();
        } catch (problem) {
          if (alive.current) { setNote({ text: String(problem?.message ?? problem), error: true }); setBusy(false); }
          return;
        }
        // The dsh side: an ordinary Code conversation in its own copy of the project.
        try {
          const work = (await call()).runs.find((one) => one.id === made)?.panes.find((pane) => pane.engine === 'dsh')?.work;
          if (!work) throw new Error('its copy of the project is missing');
          await chooseCode(appCtx);
          const sessionId = await appCtx.get('sessions').create({ cwd: work });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await call({ action: 'attach', run: made, sessionId });
          const sent = await appCtx.get('remote.session').prompt({ requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: task }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the message was not accepted');
          if (alive.current) setNote({ text: 'Both sides are working.', error: false });
        } catch (problem) {
          const why = `The dsh side could not be started: ${String(problem?.message ?? problem)}`;
          await call({ action: 'dsh-failed', run: made, why }).catch(() => {});
          if (alive.current) setNote({ text: why, error: true });
        } finally {
          if (alive.current) setBusy(false);
          void load();
        }
      };
      const act = async (action) => {
        try {
          await call({ action, run: run.id });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: String(problem?.message ?? problem), error: true });
        }
      };
      const save = async (values, done) => {
        try {
          await setSettings(appCtx, values);
          if (alive.current) setNote({ text: done, error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${String(problem?.message ?? problem)}`, error: true });
        }
      };
      const item = (text) => h('li', null, text);
      const ready = Boolean(engine?.program) && project && task.trim().length >= 3 && !busy && !running;

      return h('div', { className: 'dsh-cp-page' }, h('style', null, CSS),
        h('h2', { className: 'dsh-cp-title' }, 'Engines'),
        h('p', { className: 'dsh-cp-desc' }, `Use an outside coding engine in Code mode instead of dsh, or run one against dsh on the same task. Installed: ${(data.engines ?? []).map((one) => `${one.label}${one.program ? '' : ' (not found)'}`).join(', ')}.`),

        h('div', { className: 'dsh-cp-group' }, 'Use an engine in Code mode'),
        h('ul', { className: 'dsh-cp-list' },
          item('In a Code conversation, open the model menu in the chat box and pick the engine, for example "OpenCode (engine)". That conversation is then answered by the engine. Pick one of your own models to go back to dsh.'),
          item('To make an engine the usual choice, pick it as the model of a new Code conversation; dsh starts the next one with the model you used last.'),
          item('The engine works in a copy of your project, inside a lock. /engine shows what waits; /engine apply puts it into your project; /engine discard drops it; /engine undo takes the last one back.'),
          item('The engine gets your message as its task and keeps its own memory of the conversation. It does not get dsh\'s tools, skills, memory or instructions.')),
        h('div', { className: 'dsh-cp-form' },
          h('label', { htmlFor: 'dsh-cp-when' }, 'Its changes'),
          h('select', { id: 'dsh-cp-when', className: 'dsh-cp-select', value: data.applyWhen ?? 'review', onChange: (event) => void save({ applyWhen: event.target.value }, 'Saved.') },
            h('option', { value: 'review' }, 'Wait until I type /engine apply'),
            h('option', { value: 'new' }, 'New files at once; changed and deleted files wait'),
            h('option', { value: 'auto' }, 'Everything at once (with /engine undo)')),
          h('label', { htmlFor: 'dsh-cp-names' }, 'Models to offer'),
          h('div', null,
            h('textarea', { id: 'dsh-cp-names', className: 'dsh-cp-area', style: { minHeight: 56 }, value: names, placeholder: 'One per line, as OpenCode names them: provider/model. Its own default is always offered.', spellCheck: false, onChange: (event) => setNames(event.target.value) }),
            h('div', { className: 'dsh-cp-bar', style: { marginTop: 6 } }, h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => void save({ opencodeModels: names.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30) }, 'Saved. The model menu shows them after the app is started again.') }, 'Save the list')))),
        h('p', { className: 'dsh-cp-desc' }, 'While a Mission mode is on in a conversation, it decides instead: Restricted waits for /engine apply, Ask-Auto puts new files in at once, Full Auto puts everything in.'),

        h('div', { className: 'dsh-cp-group' }, 'Compare with dsh'),
        h('p', { className: 'dsh-cp-desc' }, `Give the same coding task to dsh and to ${engine?.label ?? 'another engine'}. Each works in its own copy of the project, so your project is not touched and the two cannot get in each other's way.`),
        engine?.program ? null : h('p', { className: 'dsh-cp-desc', 'data-error': 'true' }, `${engine?.label ?? 'The engine'} is not installed on this Mac, or not where it usually is. Plus does not install it.`),

        h('div', { className: 'dsh-cp-form' },
          h('label', { htmlFor: 'dsh-cp-project' }, 'Project'),
          h('select', { id: 'dsh-cp-project', className: 'dsh-cp-select', value: project, onChange: (event) => setProject(event.target.value) },
            h('option', { value: '' }, 'Choose a project…'),
            workspaces.map((ws) => h('option', { key: ws.workspaceId ?? ws.path, value: ws.path }, `${ws.title || ws.path.split('/').pop()}  (${ws.path})`))),
          h('label', { htmlFor: 'dsh-cp-task' }, 'Task'),
          h('textarea', { id: 'dsh-cp-task', className: 'dsh-cp-area', value: task, placeholder: 'What both should do, in the words you would type in Code mode.', onChange: (event) => setTask(event.target.value) }),
          h('label', { htmlFor: 'dsh-cp-model' }, `${engine?.label ?? 'Engine'} model`),
          h('input', { id: 'dsh-cp-model', className: 'dsh-cp-input', type: 'text', value: model, placeholder: 'Empty uses its own default. Otherwise provider/model, as OpenCode names it.', spellCheck: false, autoCapitalize: 'off', onChange: (event) => setModel(event.target.value) }),
          h('span', null),
          h('div', { className: 'dsh-cp-bar' },
            h('button', { type: 'button', className: 'dsh-cp-btn', 'data-main': 'true', disabled: !ready, onClick: () => void start() }, running ? 'A comparison is running' : busy ? 'Starting…' : 'Start the comparison'),
            note.text && (note.error || busy || running) ? h('span', { className: 'dsh-cp-desc', 'data-error': String(note.error), style: { margin: 0 } }, note.text) : null)),
        h('p', { className: 'dsh-cp-desc' }, 'dsh uses the model that a new Code conversation starts with. Pick it in the chat box of any Code conversation before you start.'),

        runs.length > 0 ? h('div', { className: 'dsh-cp-group' }, 'Comparisons') : null,
        runs.length > 0 ? h('div', { className: 'dsh-cp-runs' }, runs.map((one) => h('button', { key: one.id, type: 'button', className: 'dsh-cp-run', 'aria-pressed': String(one.id === run?.id), title: one.task, onClick: () => setPicked(one.id) }, `${new Date(one.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${one.task}`))) : null,
        run ? h('div', null,
          h('p', { className: 'dsh-cp-desc', style: { marginTop: 12 } }, `Task: ${run.task}`),
          h('p', { className: 'dsh-cp-desc' }, `Project: ${run.project}`),
          h('div', { className: 'dsh-cp-bar', style: { marginTop: 8 } },
            run.panes.some((pane) => !pane.endedAt) ? h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => void act('stop') }, 'Stop both') : h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => void act('remove') }, 'Remove, with its copies')),
          h('div', { className: 'dsh-cp-cols' }, run.panes.map((pane, index) => h(Pane, { key: pane.engine, pane, other: run.panes[1 - index], now, appCtx })))) : null,

        h('div', { className: 'dsh-cp-group' }, 'Good to know'),
        h('ul', { className: 'dsh-cp-list' },
          item('Nothing is put back into your project. Each side leaves its work in its own copy; the path is shown under each column.'),
          item(`${engine?.label ?? 'The engine'} runs inside a lock: it can change files only in its copy and in its own settings folders, and cannot read the rest of your home folder. It can use the network, which it needs to reach its model.`),
          item(`${engine?.label ?? 'The engine'} does not stop to ask you anything; the lock and the copy are the boundary. dsh works as it does in any Code conversation, with the permission preset a new conversation gets.`),
          item('Tokens are counted as each side reports them: every request\'s input and output, added up. A bold figure is the lower one when both finished.'),
          item('One comparison at a time. The last 20 are kept; removing one deletes its copies.')));
    }

    function ComparePanel({ appCtx }) {
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '28px clamp(16px, 4vw, 48px) 40px' } },
        h('div', { style: { maxWidth: 1180, margin: '0 auto' } }, h(ComparePage, { appCtx })));
    }

    function CompareIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 5h6v14H4zM14 5h6v14h-6z' }));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'compare' }, () => h(ComparePanel, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'compare', order: 23, label: () => t('panel.title') }, CompareIcon)));
      },
    };
  },
});
