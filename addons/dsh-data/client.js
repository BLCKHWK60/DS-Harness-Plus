/**
 * Data, browser half: the Settings > Data page, with the switch for the Data tab and the list of
 * saved analyses. The reading and querying are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-data',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'data';
    const DICT = { en: { 'section.title': 'Data' }, zh: { 'section.title': '数据' } };

    const CSS = `
.dsh-dt-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-dt-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-dt-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-dt-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-dt-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-dt-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-dt-rowtext { flex: 1; min-width: 0; }
.dsh-dt-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-dt-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-dt-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-dt-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-dt-btn:disabled { opacity: .5; cursor: default; }
.dsh-dt-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-dt-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-dt-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-dt-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-dt-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-dt-sql { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-data/data', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
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

    function DataPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [open, setOpen] = useState('');
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); }
        } catch (problem) {
          if (alive.current) setError(String(problem?.message ?? problem));
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      // While Python is downloading, look again every few seconds. This sits before the first
      // return: a hook that only runs once the data is there changes the hook order and React
      // takes the whole page down.
      const pyState = data?.python?.state;
      useEffect(() => {
        if (pyState !== 'installing') return undefined;
        const timer = setInterval(() => void load(), 4000);
        return () => clearInterval(timer);
      }, [pyState, load]);

      if (!data) {
        return h('div', { className: 'dsh-dt-page' }, h('style', null, CSS), h('h2', { className: 'dsh-dt-title' }, 'Data'), h('p', { className: 'dsh-dt-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? 'Switched on. The Data tab appears in the sidebar in a moment.' : 'Switched off. The Data tab is taken away in a moment.', error: false });
          setTimeout(() => { if (alive.current) void load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const remove = async (name) => {
        if (!window.confirm(`Remove the saved analysis "${name}"?\n\nYour data files are not touched.`)) return;
        setBusy(true);
        try {
          const next = await call({ action: 'remove', name });
          if (alive.current) { setData(next); setNote({ text: 'Removed.', error: false }); }
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const setupPython = async () => {
        setBusy(true);
        try {
          const next = await call({ action: 'python' });
          if (alive.current) { setData(next); setNote({ text: 'Setting Python up. This takes a minute or two and needs the internet.', error: false }); }
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const py = data.python ?? { state: 'missing', detail: '', packages: [] };
      const pyText = py.state === 'ready' ? `Ready (${py.detail}). Packages: ${(py.packages ?? []).join(', ')}.${(py.missing ?? []).length > 0 ? ` Not available: ${py.missing.join(', ')}.` : ''}`
        : py.state === 'installing' ? `Setting up… ${py.detail}`
          : py.state === 'failed' ? `The set-up did not work: ${py.detail}`
            : 'Not set up yet. It is set up by itself the first time Data is switched on.';
      const analyses = Array.isArray(data.analyses) ? data.analyses : [];
      const when = (at) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

      return h('div', { className: 'dsh-dt-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-dt-title' }, 'Data'),
        h('p', { className: 'dsh-dt-desc' }, 'A tab, beside Chat, Cowork and Code, for analysing the data files in a folder. The assistant looks at what each file holds, runs queries against the real files, and puts the number of the query behind every figure in its answer, so you can see where it came from.'),
        note.text ? h('p', { className: 'dsh-dt-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-dt-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-dt-group' }, 'The tab'),
        h('div', { className: 'dsh-dt-row' },
          h('div', { className: 'dsh-dt-rowtext' },
            h('div', { className: 'dsh-dt-rowtitle' }, 'Show the Data tab'),
            h('div', { className: 'dsh-dt-rowdesc' }, 'On adds the tab, its instructions and its tools. Off takes them away; saved analyses are kept.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-dt-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Data tab', disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dsh-dt-group' }, 'Python for statistics and charts'),
        h('div', { className: 'dsh-dt-row' },
          h('div', { className: 'dsh-dt-rowtext' },
            h('div', { className: 'dsh-dt-rowtitle' }, 'Private Python folder'),
            h('div', { className: 'dsh-dt-rowdesc', 'data-error': String(py.state === 'failed') }, pyText),
            h('div', { className: 'dsh-dt-rowdesc' }, 'Plus keeps its own copy of the analysis packages in the app\'s data folder (about 450 MB, downloaded once). Nothing else on the Mac changes. A program cannot use the internet, can read only the conversation\'s folder, and can write only into its data-output folder.')),
          py.state === 'ready' || py.state === 'installing' ? null : h('button', { type: 'button', className: 'dsh-dt-btn', disabled: busy, onClick: () => void setupPython() }, py.state === 'failed' ? 'Set up again' : 'Set up now')),

        h('div', { className: 'dsh-dt-group' }, 'How to use it'),
        h('ul', { className: 'dsh-dt-list' },
          h('li', null, 'Open the Data tab and pick the folder that holds your files on the start page, as you do in Cowork or Code. The assistant only reads files inside that folder.'),
          h('li', null, `Tables it can query: ${(data.reads?.tables ?? []).join(', ')}. Documents it can read: ${(data.reads?.text ?? []).join(', ')}. PDFs are read with the PDF reader add-on.`),
          h('li', null, 'Ask in plain words. In the answer, a mark like [Q7] after a number is the query that produced it. Open that step in the conversation to see the query itself.'),
          h('li', null, 'Charts are drawn from the data itself and shown under the answer. Ask for one whenever you want to see something: "chart revenue by month".'),
          h('li', null, 'For statistics, cleaning or combining files, the assistant writes and runs a small Python program. New files it makes (cleaned tables, charts) go into a data-output folder inside your folder; your own files are never changed.'),
          h('li', null, 'Search and Deep research are yours to switch on or off in the chat box. With both off, the assistant works from your files alone.'),
          h('li', null, 'Say "save this analysis as …" to keep it. Later, say "run … again" and the assistant reports what moved.'),
          h('li', null, 'An AGENTS.md or CLAUDE.md file in the folder is read by the app, as in every tab. Use it to explain your data: what the columns mean, which rows to leave out.')),

        h('div', { className: 'dsh-dt-group' }, 'Saved analyses'),
        analyses.length === 0 ? h('p', { className: 'dsh-dt-desc' }, 'Nothing is saved yet.') : null,
        analyses.map((analysis) => h('div', { key: analysis.name, className: 'dsh-dt-row' },
          h('div', { className: 'dsh-dt-rowtext' },
            h('div', { className: 'dsh-dt-rowtitle' }, analysis.name),
            h('div', { className: 'dsh-dt-rowdesc' }, `${analysis.steps.length} ${analysis.steps.length === 1 ? 'query' : 'queries'} · last run ${when(analysis.ranAt)} · ${analysis.folder}`),
            h('div', { className: 'dsh-dt-rowdesc' }, analysis.changed.length > 0 ? `Files changed since the last run: ${analysis.changed.join(', ')}. Ask the assistant to run it again.` : 'No file changed since the last run.'),
            open === analysis.name ? analysis.steps.map((step, index) => h('div', { key: index }, h('div', { className: 'dsh-dt-rowdesc', style: { marginTop: 8 } }, `${step.label} · ${step.files.join(', ')}`), h('div', { className: 'dsh-dt-sql' }, step.sql))) : null),
          h('button', { type: 'button', className: 'dsh-dt-btn', onClick: () => setOpen(open === analysis.name ? '' : analysis.name) }, open === analysis.name ? 'Hide queries' : 'Show queries'),
          h('button', { type: 'button', className: 'dsh-dt-btn', disabled: busy, onClick: () => void remove(analysis.name) }, 'Remove'))),

        h('div', { className: 'dsh-dt-group' }, 'Good to know'),
        h('ul', { className: 'dsh-dt-list' },
          h('li', null, 'Your files are never changed. Queries run on a copy held in memory, and only reading is allowed.'),
          h('li', null, 'Everything stays on this Mac, except what the assistant writes into the conversation, which goes to your model like any message. Results are kept small for that reason.'),
          h('li', null, 'A model can still write a wrong query or misread a result. The query numbers are there so you can check.'),
          h('li', null, 'Files up to 200 MB and 2 million rows. A query that runs longer than 90 seconds is stopped.'),
          h('li', null, 'Numbers written with a currency sign or a percent sign are read as text; the assistant is told to convert them.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'data', order: 24, label: () => t('section.title') }, (props) => h(DataPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
