/**
 * Tuning Plus, browser half: Settings > Tuning Plus, with its bar (Model, Goal, Data sets, Method, Budget,
 * Look only, the run in one sentence), the result cards, the data sets, the exam, the shelf, the night shift,
 * and the switches. The work is in the server half; every change here is the owner's own action.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-tuning',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'tuning';
    const DICT = { en: { 'section.title': 'Tuning Plus' }, zh: { 'section.title': '模型调优' } };
    const when = (at) => (at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const pct = (rate) => `${Math.round((Number(rate) || 0) * 100)}%`;

    const CSS = `
.dsh-tp-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-tp-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-tp-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-line; }
.dsh-tp-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-tp-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-tp-row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-tp-rowtext { flex: 1; min-width: 0; }
.dsh-tp-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-tp-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-line; }
.dsh-tp-btn { flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-tp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tp-btn:disabled { opacity: .5; cursor: default; }
.dsh-tp-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); }
.dsh-tp-input { box-sizing: border-box; height: 30px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-tp-input.wide { width: 100%; margin-top: 6px; }
.dsh-tp-select { height: 30px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-tp-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-tp-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-tp-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-tp-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-tp-switch:disabled { opacity: .5; cursor: default; }
.dsh-tp-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding: 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-tp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-tp-sentence { flex-basis: 100%; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-tp-card { margin-top: 8px; padding: 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-tp-card b { font-weight: 500; }
.dsh-tp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.dsh-tp-checks { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; }
.dsh-tp-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-tp-answer { margin-top: 6px; padding: 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-tuning/data', document.baseURI), body
        ? { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }

    function Switch({ on, label, busy, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-tp-switch', 'aria-checked': on === true, 'aria-label': label, disabled: busy, onClick: () => onChange(!on) });
    }
    function Row({ title, desc, children }) {
      return h('div', { className: 'dsh-tp-row' }, h('div', { className: 'dsh-tp-rowtext' }, h('div', { className: 'dsh-tp-rowtitle' }, title), desc ? h('div', { className: 'dsh-tp-rowdesc' }, desc) : null), children);
    }

    /** The run in one sentence, as the server says it (lib/ladder.js runSentence), worked out here for the bar. */
    function sentenceOf(data, bar) {
      const goal = data.goals?.[bar.goal] ?? 'Find what would help most';
      const names = bar.sets.map((id) => data.sets?.[id]?.name ?? id);
      const setText = names.length === 0 ? 'the sets that fit the goal' : names.length === 1 ? `the ${names[0]} set` : `the ${names.slice(0, -1).join(', ')} and ${names.at(-1)} sets`;
      const model = bar.model || 'the model';
      if (bar.lookOnly) return `Look only: report what would help ${model} with "${goal}" and what the exam says today, from ${setText}. Nothing is trained.`;
      const rung = bar.method === 'auto' ? 'the lowest rung that passes the exam' : (data.rungs?.find((step) => String(step.n) === bar.method)?.name ?? '').toLowerCase();
      const minutes = Number(bar.minutes) || 0;
      return `Improve ${model} at "${goal}" with ${rung}, on ${setText}${minutes > 0 ? `, for at most ${minutes >= 60 ? `${Math.round(minutes / 6) / 10} hours` : `${minutes} minutes`}` : ''}, and test it on that set's exam rows before anything is offered to you.`;
    }

    function TuningPage() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [bar, setBar] = useState({ model: '', goal: 'harness', sets: [], method: 'auto', minutes: 120, lookOnly: true });
      const [taste, setTaste] = useState(null);
      const [draft, setDraft] = useState({ python: null, modelName: '', modelPath: '', teacher: '', routes: {} });
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
        return () => { alive.current = false; };
      }, [load]);
      // Look again every 5 seconds while a run goes, every 30 seconds otherwise (and never while hidden).
      const running = Boolean(data?.active);
      useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) void load(); }, running ? 5000 : 30000);
        return () => clearInterval(timer);
      }, [running, load]);

      if (!data) return h('div', { className: 'dsh-tp-page' }, h('style', null, CSS), h('h2', { className: 'dsh-tp-title' }, 'Tuning Plus'), h('p', { className: 'dsh-tp-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));

      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await call(body);
          if (!alive.current) return;
          setData(next);
          if (next.taste) setTaste(next.taste);
          setNote({ text: next.note || done || '', error: false });
        } catch (problem) {
          if (alive.current) setNote({ text: String(problem?.message ?? problem), error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const set = (field, value, done) => act({ action: 'set', field, value }, done ?? 'Saved.');
      const sets = Object.entries(data.sets ?? {});
      const models = data.models ?? [];
      const route = models.find((one) => `${one.provider}/${one.model}` === bar.model || one.model === bar.model);
      const modelNames = [...new Set([...Object.keys(data.modelPaths ?? {}), ...models.map((one) => one.model)])];

      return h('div', { className: 'dsh-tp-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-tp-title' }, 'Tuning Plus'),
        h('p', { className: 'dsh-tp-desc' }, 'Models that learn from your work. Every checked step (tests that passed, a claim you ruled on, a draft you edited and approved, a device that read back) is kept as a training row with its proof. One row in five goes to a private exam made from your own work, which never trains anything. The rest builds named data sets, from which Tuning Plus proposes the cheapest fix first (instructions, then examples, then a tuned prompt) and only then trains an adapter on this Mac. Nothing is used until it beats the exam and you say yes.'),
        note.text ? h('p', { className: 'dsh-tp-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-tp-desc', 'data-error': 'true' }, data.problem) : null,

        h(Row, { title: 'Tuning Plus', desc: data.enabled ? `On. Its folder: ${data.folder}.` : 'Off: nothing is gathered and its tools are not offered in the chat.' },
          h(Switch, { on: data.enabled, label: 'Tuning Plus', busy, onChange: (on) => void set('enabled', on, on ? 'Tuning Plus is on. Switch on the modes it may learn from below.' : 'Tuning Plus is off.') })),

        h('div', { className: 'dsh-tp-group' }, 'What it learns from'),
        h('p', { className: 'dsh-tp-desc' }, 'Each mode starts off. Only checked steps become rows. Recon is never read, nor a conversation that received an export from Recon, a helper of either, or a conversation you marked "never learn from this" on Learned skills. Your own folders are never read. Passwords and keys are masked before a row is stored.'),
        Object.entries(data.modes ?? {}).map(([mode, about]) => h(Row, { key: mode, title: about.split(':')[0], desc: about.split(':').slice(1).join(':').trim() },
          h(Switch, { on: data.harvest?.[mode], label: about.split(':')[0], busy: busy || !data.enabled, onChange: (on) => void set('harvest', { ...data.harvest, [mode]: on }) }))),
        h('div', { className: 'dsh-tp-actions' },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled, onClick: () => void act({ action: 'harvest' }) }, 'Gather now'),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled, onClick: () => void act({ action: 'lessons' }) }, 'Build plugin lessons'),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled || !data.teacher, onClick: () => void act({ action: 'qa' }) }, 'Questions from reference material')),
        data.lastHarvest ? h('p', { className: 'dsh-tp-desc' }, `Last gathered ${when(data.lastHarvest.at)}: ${Object.entries(data.lastHarvest.modes ?? {}).map(([mode, slot]) => `${mode} ${slot.kept} rows, ${slot.exam} to the exam`).join('; ') || 'nothing new'}. ${data.lastHarvest.left?.length ? `${data.lastHarvest.left.length} conversations left out (Recon, exports, helpers, marked).` : ''}`) : null,

        h('div', { className: 'dsh-tp-group' }, 'The bar'),
        h('div', { className: 'dsh-tp-bar' },
          h('label', { className: 'dsh-tp-field' }, 'Model',
            h('select', { className: 'dsh-tp-select', value: bar.model, onChange: (event) => setBar({ ...bar, model: event.target.value }) },
              h('option', { value: '' }, 'Pick a model'),
              modelNames.map((name) => h('option', { key: name, value: name }, name)))),
          h('label', { className: 'dsh-tp-field' }, 'Goal',
            h('select', { className: 'dsh-tp-select', value: bar.goal, onChange: (event) => setBar({ ...bar, goal: event.target.value, sets: [] }) },
              Object.entries(data.goals ?? {}).map(([id, label]) => h('option', { key: id, value: id }, label)))),
          h('label', { className: 'dsh-tp-field' }, 'Method',
            h('select', { className: 'dsh-tp-select', value: bar.method, onChange: (event) => setBar({ ...bar, method: event.target.value }) },
              h('option', { value: 'auto' }, 'Auto: the lowest rung that passes'),
              (data.rungs ?? []).filter((step) => step.n >= 1).map((step) => h('option', { key: step.n, value: String(step.n) }, `${step.n}. ${step.name}`)))),
          h('label', { className: 'dsh-tp-field' }, 'Budget (minutes)',
            h('input', { className: 'dsh-tp-input', type: 'number', min: 5, max: 1440, value: bar.minutes, onChange: (event) => setBar({ ...bar, minutes: event.target.value }), style: { width: 90 } })),
          h('label', { className: 'dsh-tp-field' }, 'Look only',
            h(Switch, { on: bar.lookOnly, label: 'Look only', busy, onChange: (on) => setBar({ ...bar, lookOnly: on }) })),
          h('div', { className: 'dsh-tp-checks', style: { flexBasis: '100%' } }, sets.length === 0 ? h('span', { className: 'dsh-tp-rowdesc' }, 'Data sets appear here once something was gathered.') : sets.map(([id, set]) => h('label', { key: id },
            h('input', { type: 'checkbox', checked: bar.sets.includes(id), onChange: (event) => setBar({ ...bar, sets: event.target.checked ? [...bar.sets, id] : bar.sets.filter((one) => one !== id) }) }),
            ` ${set.name} (${set.mayTrain} of ${set.rows})`))),
          h('div', { className: 'dsh-tp-sentence' }, sentenceOf(data, bar)),
          data.active
            ? h('div', { className: 'dsh-tp-actions' }, h('span', { className: 'dsh-tp-rowdesc' }, `Running: ${data.active.phase}${data.active.progress?.iter ? `, step ${data.active.progress.iter}${data.active.progress.loss ? `, loss ${data.active.progress.loss}` : ''}` : ''}.`), h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'stop' }) }, 'Stop'))
            : h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: busy || !data.enabled || (!bar.lookOnly && !bar.model), onClick: () => void act({ action: 'run', model: bar.model, goal: bar.goal, sets: bar.sets, method: bar.method, minutes: Number(bar.minutes) || 0, lookOnly: bar.lookOnly }) }, bar.lookOnly ? 'Look' : 'Start')),

        h('div', { className: 'dsh-tp-group' }, `Results (${(data.cards ?? []).length})`),
        (data.cards ?? []).length === 0 ? h('p', { className: 'dsh-tp-desc' }, 'Nothing yet. Results of runs and of the night shift come here as cards.') : null,
        (data.cards ?? []).map((card) => h('div', { key: card.id, className: 'dsh-tp-card' },
          h('b', null, card.title), h('div', { className: 'dsh-tp-rowdesc' }, card.text),
          h('div', { className: 'dsh-tp-actions' },
            (card.buttons ?? ['later', 'never']).map((button) => h('button', {
              key: button, type: 'button', className: 'dsh-tp-btn', disabled: busy || (button === 'taste' && !route),
              title: button === 'taste' && !route ? 'Pick the model in use on the bar first' : '',
              onClick: () => void (button === 'taste' ? act({ action: 'taste', entry: card.entry, current: route ? { provider: route.provider, model: route.model } : null }) : act({ action: 'card', card: card.id, do: button }, button === 'promote' ? 'Promoted. Switch it on in the shelf below.' : '')),
            }, { taste: 'Taste test', promote: 'Promote', later: 'Not now', never: 'Do not suggest this again' }[button] ?? button))))),
        taste ? h('div', { className: 'dsh-tp-card' },
          h('b', null, taste.done ? 'Taste test: done' : 'Taste test: which answer is better? (names hidden)'),
          taste.items.map((item) => h('div', { key: item.n, style: { marginTop: 10 } },
            h('div', { className: 'dsh-tp-rowdesc' }, `${item.n}. ${item.request}`),
            h('div', { className: 'dsh-tp-answer' }, `A: ${item.a}`), h('div', { className: 'dsh-tp-answer' }, `B: ${item.b}`),
            item.pick ? h('div', { className: 'dsh-tp-rowdesc' }, `You picked ${item.pick}${item.candidate ? ` (the candidate was ${item.candidate})` : ''}.`)
              : h('div', { className: 'dsh-tp-actions' }, ['a', 'b', 'same'].map((pick) => h('button', { key: pick, type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'pick', round: taste.id, n: item.n, pick }) }, pick === 'same' ? 'The same' : pick.toUpperCase())))))) : null,

        h('div', { className: 'dsh-tp-group' }, `Data sets (${sets.length})`),
        sets.map(([id, set]) => h(Row, { key: id, title: `${set.name}: ${set.rows} rows, ${set.mayTrain} may train`, desc: `${set.about}. ${set.first ? `From ${when(set.first)} to ${when(set.last)}.` : ''}${Object.keys(set.notTrain ?? {}).length ? ` Not trained on: ${Object.entries(set.notTrain).map(([why, count]) => `${count} (${why})`).join('; ')}.` : ''}${set.usedFor?.length ? ` Used for: ${set.usedFor.join('; ')}.` : ''}` },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'export', set: id }) }, 'Write out'))),

        h('div', { className: 'dsh-tp-group' }, 'The exam'),
        h('p', { className: 'dsh-tp-desc' }, `${data.exam?.total ?? 0} rows of your own work${Object.keys(data.exam?.byMode ?? {}).length ? ` (${Object.entries(data.exam.byMode).map(([mode, count]) => `${mode} ${count}`).join(', ')})` : ''}. Chosen by code, one in five; never trained on. Each kind is marked by its own check. ${data.canaries ? 'The general canaries come from the Benchmark add-on.' : 'The Benchmark add-on is off, so the canaries cannot run and nothing can be promoted.'} A candidate is offered only when it is better on its exam by a clear margin and not worse on the canaries; then you decide, also with a taste test.`),

        h('div', { className: 'dsh-tp-group' }, `The shelf (${(data.shelf ?? []).length})`),
        (data.shelf ?? []).length === 0 ? h('p', { className: 'dsh-tp-desc' }, 'Empty. Adapters and tuned prompts that were built come here, with their exam results.') : null,
        (data.shelf ?? []).map((entry) => h('div', { key: entry.id, className: 'dsh-tp-card' },
          h('b', null, `${entry.name} · ${entry.state}${entry.due ? ' · due for a rebuild' : ''}`),
          h('div', { className: 'dsh-tp-rowdesc' }, `Base model ${entry.base?.model}; built ${when(entry.built)} from ${entry.sets.join(', ')} (${entry.rows} rows). ${entry.exam?.after ? `Exam: ${pct(entry.exam.after.rate)} against ${pct(entry.exam.before?.rate)} before.` : entry.exam?.decision ? entry.exam.decision.why : ''} Private: built for you and your harness. Its shelf id, for a team role in Settings → Model Tiers: ${entry.id}. ${entry.serve?.route ? `Served as ${entry.serve.route.provider}/${entry.serve.route.model}.` : entry.serve?.path ? `Ready to serve: ${entry.serve.path}.` : ''}`),
          h('div', { className: 'dsh-tp-actions' },
            ['promoted', 'on', 'off'].includes(entry.state) ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'switch', entry: entry.id, on: entry.state !== 'on' }) }, entry.state === 'on' ? 'Switch off' : 'Switch on') : null,
            entry.exam?.decision?.ok ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'Fold the adapter into a new copy of the base model (the base is never changed); any MLX model server serves it as one more model', onClick: () => void act({ action: 'serve', entry: entry.id, way: 'fused' }) }, 'Make a fused copy') : null,
            entry.exam?.decision?.ok ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'mlx-lm\'s own server with the adapter beside the base model, on this Mac only', onClick: () => void act({ action: entry.serving ? 'stopServing' : 'serve', entry: entry.id, way: 'server' }) }, entry.serving ? 'Stop its server' : 'Serve with mlx-lm') : null),
          entry.exam?.decision?.ok ? h('div', { className: 'dsh-tp-actions' },
            h('input', { className: 'dsh-tp-input', placeholder: 'provider (as in Settings → Models)', value: draft.routes[entry.id]?.provider ?? '', onChange: (event) => setDraft({ ...draft, routes: { ...draft.routes, [entry.id]: { ...draft.routes[entry.id], provider: event.target.value } } }) }),
            h('input', { className: 'dsh-tp-input', placeholder: 'model name there', value: draft.routes[entry.id]?.model ?? '', onChange: (event) => setDraft({ ...draft, routes: { ...draft.routes, [entry.id]: { ...draft.routes[entry.id], model: event.target.value } } }) }),
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !draft.routes[entry.id]?.provider || !draft.routes[entry.id]?.model, onClick: () => void act({ action: 'route', entry: entry.id, ...draft.routes[entry.id] }, 'Saved. A team in Settings → Model Tiers can now name it for a role.') }, 'Save its address')) : null)),

        h('div', { className: 'dsh-tp-group' }, 'Trainer and models on this Mac'),
        h(Row, { title: 'The trainer\'s Python', desc: data.python ? `${data.python}${data.pythonProblem ? ` · ${data.pythonProblem}` : ''}` : 'Not set. Tuning Plus trains with Apple\'s mlx-lm, which you install yourself in a Python of its own (for example "uv venv" then "uv pip install mlx-lm" in a folder you choose), then give its full path here (…/bin/python). Tuning Plus never installs anything and never downloads a model.' },
          h('input', { className: 'dsh-tp-input', placeholder: '/full/path/to/.venv/bin/python', value: draft.python ?? data.python ?? '', onChange: (event) => setDraft({ ...draft, python: event.target.value }) }),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || draft.python === null, onClick: () => void set('python', draft.python ?? '') }, 'Save')),
        h(Row, { title: 'Where each base model\'s files are', desc: Object.entries(data.modelPaths ?? {}).map(([name, path]) => `${name}: ${path}`).join('\n') || 'None yet. Training needs a model\'s MLX folder on this Mac (with config.json); its files are never changed.' },
          h('input', { className: 'dsh-tp-input', placeholder: 'model name', value: draft.modelName, onChange: (event) => setDraft({ ...draft, modelName: event.target.value }), style: { width: 140 } }),
          h('input', { className: 'dsh-tp-input', placeholder: '/full/path/to/model folder', value: draft.modelPath, onChange: (event) => setDraft({ ...draft, modelPath: event.target.value }) }),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !draft.modelName || !draft.modelPath, onClick: () => void set('models', { ...(data.modelPaths ?? {}), [draft.modelName]: draft.modelPath }) }, 'Add')),
        h(Row, { title: 'Teacher model', desc: data.teacher ? `${data.teacher.provider}/${data.teacher.model} (runs ${data.teacherWhere}). It writes questions from reference material; a separate run checks each one. Its questions count as its own writing, so its provider's switch below applies to them.${!data.teacherHere && !data.teacherCloud ? ' It does not count as this Mac: tick below before it may read rows.' : ''}` : 'Not set. Used only for questions from reference material.' },
          h('select', { className: 'dsh-tp-select', value: data.teacher ? `${data.teacher.provider}/${data.teacher.model}` : '', onChange: (event) => { const picked = models.find((one) => `${one.provider}/${one.model}` === event.target.value); void set('teacher', picked ? { provider: picked.provider, model: picked.model } : {}); } },
            h('option', { value: '' }, 'None'), models.map((one) => h('option', { key: `${one.provider}/${one.model}`, value: `${one.provider}/${one.model}` }, `${one.provider}/${one.model}`)))),
        h(Row, { title: 'A teacher on the internet may read rows', desc: 'Off: only a teacher on this Mac reads your rows.' },
          h(Switch, { on: data.teacherCloud, label: 'A teacher on the internet may read rows', busy, onChange: (on) => void set('teacherCloud', on) })),
        h(Row, { title: 'Count my own network\'s machines as this Mac', desc: 'Off: only this Mac itself counts when Tuning Plus decides what may be sent to a model (exam rows, recent requests for a taste test, rows for the teacher); a model elsewhere gets only text that was already sent to it. On: a model at a home address (192.168…, .local) counts as this Mac too. Note: a proxy on your network that forwards to a cloud provider cannot be told apart from a model at home.' },
          h(Switch, { on: data.ownNetworkLocal, label: 'Count my own network\'s machines as this Mac', busy, onChange: (on) => void set('ownNetworkLocal', on) })),

        h('div', { className: 'dsh-tp-group' }, 'May it train?'),
        h('p', { className: 'dsh-tp-desc' }, 'Set by code for each row, from who really wrote its text: never Recon, never a signed-in source (a connector), never a row whose secrets could not all be masked (a web address with a password in it counts as that). A row whose writer nobody can say (a research packet, a Mission step that names no provider) trains only narrow tools, never an adapter that writes open-ended text. Each provider has a switch of its own, because each sets its own terms; read each provider\'s own page. A preference pair also needs the switch of whoever wrote its rejected answer.'),
        (data.providers ?? []).map((one) => h(Row, { key: one.provider, title: `Text written by ${one.provider}`, desc: one.on ? 'May train.' : 'Does not train.' },
          h(Switch, { on: one.on, label: `Text written by ${one.provider}`, busy, onChange: (on) => void set('providers', { ...Object.fromEntries((data.providers ?? []).map((item) => [item.provider, item.on])), [one.provider]: on }) }))),
        h(Row, { title: 'Text written by Anthropic\'s models, for adapters that write open-ended text', desc: 'Starts off: Anthropic\'s terms say its outputs may not train models that compete with its own (general chat and open-ended text models); narrow tools such as judges are allowed. The switch is yours; the planner is not a lawyer.' },
          h(Switch, { on: data.anthropicOpenEnded, label: 'Anthropic text for open-ended adapters', busy, onChange: (on) => void set('anthropicOpenEnded', on) })),

        h('div', { className: 'dsh-tp-group' }, 'The night shift'),
        h(Row, { title: 'Work at night on this Mac', desc: `Only while this Mac is on power and has been unused for ${data.night?.idleMinutes ?? 15} minutes; it stops the moment you use it. It gathers, sorts, finds the weakest spot and proposes the lowest rung; it trains only the sets you allow below, and it never promotes anything: you find cards in the morning.${data.night?.last ? ` Last night: ${data.night.last}.` : ''}` },
          h(Switch, { on: data.night?.on, label: 'Night shift', busy: busy || !data.enabled, onChange: (on) => void set('nightShift', on) })),
        h(Row, { title: 'Sets the night shift may train', desc: (data.night?.train ?? []).map((item) => `${data.sets?.[item.set]?.name ?? item.set} on ${item.model}`).join('; ') || 'None: it trains nothing.' },
          h('select', { className: 'dsh-tp-select', value: '', disabled: busy || !bar.model, title: bar.model ? '' : 'Pick the model on the bar first', onChange: (event) => { if (event.target.value) void set('nightTrain', [...(data.night?.train ?? []).filter((item) => item.set !== event.target.value), { set: event.target.value, model: bar.model }]); } },
            h('option', { value: '' }, 'Allow a set…'), sets.map(([id, set]) => h('option', { key: id, value: id }, set.name))),
          (data.night?.train ?? []).length > 0 ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void set('nightTrain', []) }, 'Allow none') : null),

        h('div', { className: 'dsh-tp-group' }, 'Limits you should know'),
        h('ul', { className: 'dsh-tp-list' },
          h('li', null, 'It is a ratchet, not infinity: each gain is smaller than the last, and a small model has a ceiling data cannot lift.'),
          h('li', null, 'One person\'s use makes few rows. A narrow skill needs hundreds of good rows, so some sets take months; the harness set fills fastest.'),
          h('li', null, 'Training does not teach facts well: facts are looked up (retrieval). "Know a subject" builds retrieval first.'),
          h('li', null, 'What a model is trained on can come back out of it: adapters stay private, and your own folders are never used.'),
          h('li', null, 'Training takes the Mac it runs on. A new base model empties the shelf; the sets stay, and everything is rebuilt from them.'),
          h('li', null, 'Your model server may not load adapters: then Tuning Plus makes a fused copy (a new model folder) or runs mlx-lm\'s own server, and you add it in Settings → Models.'),
          h('li', null, 'An exam can be gamed: exam rows never train, the exam keeps growing, and the taste test asks you.')));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'tuning', order: 141, label: () => t('section.title') }, () => h(TuningPage))));
      },
    };
  },
});
