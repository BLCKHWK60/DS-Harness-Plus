/**
 * Skill architect, browser half: Settings → Learned skills. The reading model (private by default), what it
 * would read and why, Learn now, the proposals waiting for your yes, the learned skills with their versions,
 * and the projects that start clean.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-skill-architect',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'skillArchitect';
    const DICT = { en: { 'section.title': 'Learned skills' }, zh: { 'section.title': '学到的技能' } };
    const KIND_LABELS = { skill: 'Skill', fact: 'Fact for Memory', rule: 'Project rule', habit: 'Model habit', lesson: 'Tab lesson', recipe: 'Work loop recipe', version: 'Model version setting' };
    const WHERE = { local: 'on this Mac', network: 'on your own network', cloud: 'on the internet', unknown: 'somewhere unknown (treated as the internet)' };

    const CSS = `
.dsh-sa { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-label-primary); }
.dsh-sa h2 { margin: 0; font-size: 16px; font-weight: 500; }
.dsh-sa h3 { margin: 18px 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-sa p { margin: 2px 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sa p[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sa-card { margin-top: 6px; padding: 8px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l1); font-size: 13px; }
.dsh-sa-card b { font-weight: 500; }
.dsh-sa-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-sa-grow { flex: 1; min-width: 0; }
.dsh-sa-btn { height: 26px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
.dsh-sa-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sa-btn:disabled { opacity: .5; cursor: default; }
.dsh-sa-field { box-sizing: border-box; width: 100%; padding: 6px 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; }
.dsh-sa-text { white-space: pre-wrap; margin: 6px 0; font: 12px/17px ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 180px; overflow: auto; }
.dsh-sa-quote { margin: 4px 0; padding: 4px 8px; border-left: 2px solid var(--dsw-alias-border-l2); white-space: pre-wrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
`;

    async function call(body) {
      const url = new URL('dsh-skill-architect/data', document.baseURI);
      const response = await fetch(url, body ? { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin', cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      return json;
    }
    async function setSettings(ctx, values) {
      const read = async () => (await ctx.remote.settings.describe()).value.namespaces.find((entry) => entry.ns === 'skill-architect');
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate('skill-architect', ops, (await read()).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate('skill-architect', ops, (await read()).revision);
      if (!result.ok) throw new Error(result.error.code);
    }
    /** The app's projects, for the Start clean picker (none when the list is not ready). */
    const projectsOf = (appCtx) => {
      try {
        const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items ?? [];
        return items.filter((item) => typeof item?.path === 'string' && item.path).map((item) => ({ path: item.path, title: String(item.title || item.path.split('/').pop()) }));
      } catch {
        return [];
      }
    };
    const reachText = (reach) => (reach.kind === 'project' ? `project ${reach.folder.split('/').pop()}` : reach.kind === 'tab' ? `tab ${reach.tab}` : 'every tab');

    function SkillCard({ skill, busy, act }) {
      const [open, setOpen] = useState(false);
      const [text, setText] = useState(skill.text);
      useEffect(() => setText(skill.text), [skill.text]);
      return h('div', { className: 'dsh-sa-card' },
        h('div', { className: 'dsh-sa-row' },
          h('div', { className: 'dsh-sa-grow' }, h('b', null, skill.name), skill.deleted ? ' (deleted)' : '', h('p', null, `${skill.description} · ${reachText(skill.reach)} · ${skill.by === 'learned' ? 'learned' : 'added by hand'} · version ${skill.current} · used ${skill.uses} time${skill.uses === 1 ? '' : 's'}`)),
          h('button', { type: 'button', className: 'dsh-sa-btn', onClick: () => setOpen((v) => !v) }, open ? 'Close' : 'Open'),
          skill.deleted ? h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => act({ action: 'putBack', name: skill.name, version: skill.current }) }, 'Put back')
            : h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => { if (window.confirm(`Delete "${skill.name}"? It stops being offered. Its versions stay, so you can put it back.`)) act({ action: 'delete', name: skill.name }); } }, 'Delete')),
        open ? h(React.Fragment, null,
          h('textarea', { className: 'dsh-sa-field', rows: 6, value: text, 'aria-label': `Text of ${skill.name}`, onChange: (event) => setText(event.target.value) }),
          h('div', { className: 'dsh-sa-row' },
            h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy || text === skill.text, onClick: () => act({ action: 'update', name: skill.name, text }) }, 'Save as a new version'),
            h('select', { className: 'dsh-sa-btn', value: '', 'aria-label': 'Put back a version', onChange: (event) => { if (event.target.value) act({ action: 'putBack', name: skill.name, version: Number(event.target.value) }); } },
              h('option', { value: '' }, 'Put back a version…'),
              skill.versions.filter((version) => version.n !== skill.current).reverse().map((version) => h('option', { key: version.n, value: version.n }, `${version.n}: ${new Date(version.at).toLocaleString()} ${version.why}`))))) : null);
    }

    /** A recipe's lines as the owner reads them: its file, name, kind, the words that pick it, its shape, steps and stop. */
    function recipeLines(recipe) {
      if (!recipe) return [];
      return [
        `File: recipes/${recipe.id}.json`,
        `Name: ${recipe.name ?? recipe.id}`,
        `Kind of task: ${recipe.kind ?? '?'}`,
        `Picked for goals with: ${(Array.isArray(recipe.when) ? recipe.when : []).join(', ') || '(no words)'}`,
        ...(Array.isArray(recipe.shape) ? [`Answer shape: ${recipe.shape.join(', ')}`] : []),
        ...(Array.isArray(recipe.steps) ? recipe.steps : []).map((step, index) => `Step ${index + 1} (${step.role ?? 'helper'}): ${step.does ?? ''} Checked by: ${step.check ?? ''}`),
        `Stop when: ${recipe.stop ?? ''}`,
      ];
    }

    /**
     * A proposed recipe change, shown against the recipe it would replace: which file, which version, the
     * words that pick it, and each line that changes (- now, + proposed). Nothing is saved before Accept.
     */
    function RecipeChange({ proposal }) {
      const now = proposal.replaces;
      const next = recipeLines(proposal.recipe);
      const before = recipeLines(now);
      const lines = now
        ? [...before.filter((line) => !next.includes(line)).map((line) => `- ${line}`), ...next.filter((line) => !before.includes(line)).map((line) => `+ ${line}`)]
        : next.map((line) => `+ ${line}`);
      return h('div', null,
        h('p', null, now
          ? `Replaces recipes/${now.id}.json, version ${now.version} ("${now.name}"). Lines starting with - go, lines starting with + come.`
          : `A new recipe file: recipes/${proposal.recipe.id}.json.`),
        h('pre', { className: 'dsh-sa-quote', 'data-recipe-diff': '' }, lines.length > 0 ? lines.join('\n') : '(no change)'));
    }

    function ProposalCard({ proposal, busy, act }) {
      const [name, setName] = useState(proposal.name ?? '');
      const [text, setText] = useState(proposal.text);
      const waiting = proposal.state === 'waiting';
      return h('div', { className: 'dsh-sa-card' },
        h('div', { className: 'dsh-sa-row' },
          h('b', { className: 'dsh-sa-grow' }, `${KIND_LABELS[proposal.kind] ?? proposal.kind}${proposal.name ? `: ${proposal.name}` : ''}`),
          waiting ? h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy || proposal.examRunning === true, onClick: () => act({ action: 'accept', id: proposal.id, edits: { name, text } }) }, 'Accept') : h('span', null, proposal.state),
          waiting ? h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => act({ action: 'reject', id: proposal.id }) }, 'Reject') : null),
        proposal.description ? h('p', null, proposal.description) : null,
        proposal.why ? h('p', null, `Why: ${proposal.why}`) : null,
        proposal.examRunning ? h('p', null, 'Being tried on your own exam (Tuning Plus)…') : null,
        proposal.examProblem ? h('p', null, `The exam could not be taken: ${proposal.examProblem}`) : null,
        proposal.exam ? h('p', null, `Your own exam (Tuning Plus), with ${proposal.exam.model}: ${proposal.exam.ok ? 'not worse' : 'worse'}. ${proposal.exam.why}.`) : null,
        waiting && proposal.kind === 'skill' && !proposal.examRunning && proposal.exam && !proposal.exam.ok ? h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, title: 'Add the skill although it did worse on your own exam', onClick: () => act({ action: 'accept', id: proposal.id, edits: { name, text }, anyway: true }) }, 'Add anyway') : null,
        waiting && proposal.kind === 'skill' ? h('input', { className: 'dsh-sa-field', value: name, 'aria-label': 'Skill name', onChange: (event) => setName(event.target.value) }) : null,
        waiting ? h('textarea', { className: 'dsh-sa-field', rows: 4, value: text, 'aria-label': 'Proposal text', onChange: (event) => setText(event.target.value) }) : h('div', { className: 'dsh-sa-text' }, proposal.text),
        waiting && (proposal.kind === 'habit' || proposal.kind === 'lesson') ? h('p', null, 'Accepting marks it done; add the text yourself on Settings → Self-improve as your own lesson, on the model version it is about.') : null,
        waiting && proposal.kind === 'version' ? h('p', null, 'Accepting marks it done; change the version yourself on Settings → Model Tiers → Model versions.') : null,
        proposal.kind === 'recipe' && proposal.recipe ? h(RecipeChange, { proposal }) : null,
        waiting && proposal.kind === 'recipe' ? h('p', null, 'Accepting saves it in Mission\'s recipes as a new version; the earlier one is kept in recipes/old. Runs with the work loop use it from the next one.') : null,
        (proposal.quotes ?? []).map((quote, index) => h('div', { key: index, className: 'dsh-sa-quote' }, quote)),
        proposal.quotesGone ? h('p', null, 'Its quotes are gone: the conversation was deleted.') : null);
    }

    function Page({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [catalog, setCatalog] = useState(null);
      const [found, setFound] = useState(null);
      const [preview, setPreview] = useState(null);
      const [draft, setDraft] = useState({ name: '', description: '', text: '' });
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) setData(next);
        } catch (error) {
          if (alive.current) setNote({ text: `Could not load: ${error.message}`, error: true });
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (alive.current && result?.ok) setCatalog(result.value);
          } catch { /* the picker then shows only what is set */ }
        })();
        return () => { alive.current = false; };
      }, [load, appCtx]);
      // While a skill is being tried on the owner's exam (Tuning Plus), look again every few seconds.
      const trying = Boolean(data?.proposals?.some((item) => item.examRunning));
      useEffect(() => {
        if (!trying) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 3000);
        return () => clearInterval(timer);
      }, [trying, load]);
      const act = async (body, done = 'Done.') => {
        setBusy(true);
        setNote({ text: '', error: false });
        try {
          const next = await call(body);
          if (!alive.current) return next;
          setData(next);
          setNote({ text: next.said || next.note || done, error: false });
          return next;
        } catch (error) {
          if (alive.current) setNote({ text: error.message, error: true });
          if (alive.current && body?.action === 'accept') void load();
          return undefined;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      if (!data) return h('div', { className: 'dsh-sa' }, h('style', null, CSS), h('h2', null, 'Learned skills'), h('p', { 'data-error': String(note.error) }, note.text || 'Loading…'));
      const models = [];
      // Engines (OpenCode and the like) are whole agents, not models to read with: left out.
      for (const group of (catalog?.groups ?? []).filter((item) => !String(item.id).startsWith('engine-'))) for (const model of group.models ?? []) models.push({ provider: group.id, model: model.id, label: `${group.name ?? group.id} · ${model.name ?? model.id}` });
      const chosen = data.readingModel ? `${data.readingModel.provider}\u0000${data.readingModel.model}` : '';
      const waiting = data.proposals.filter((item) => item.state === 'waiting');
      const decided = data.proposals.filter((item) => item.state !== 'waiting').slice(0, 10);
      return h('div', { className: 'dsh-sa' },
        h('style', null, CSS),
        h('h2', null, 'Learned skills'),
        h('p', null, 'Reads your past conversations where you corrected the assistant, stopped it, gave a thumbs down with a note, or sent feedback, and proposes what to change: a skill, a fact for Memory, a rule for a project. Nothing is installed until you accept it here. Learned skills are plain text; nothing a model writes is ever run.'),
        note.text ? h('p', { 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('h3', null, 'Reading model'),
        h('p', null, data.readingModel ? `${data.readingModel.model}, ${WHERE[data.where] ?? data.where}.` : 'None picked yet.'),
        h('select', { className: 'dsh-sa-field', value: chosen, disabled: busy, 'aria-label': 'Reading model', onChange: (event) => { const [provider, model] = event.target.value.split('\u0000'); void setSettings(appCtx, { readingModel: provider ? JSON.stringify({ provider, model }) : '' }).then(load, (error) => setNote({ text: error.message, error: true })); } },
          h('option', { value: '' }, 'Pick the model that reads…'),
          chosen && !models.some((item) => `${item.provider}\u0000${item.model}` === chosen) ? h('option', { value: chosen }, data.readingModel.model) : null,
          models.map((item) => h('option', { key: `${item.provider}/${item.model}`, value: `${item.provider}\u0000${item.model}` }, item.label))),
        h('label', { className: 'dsh-sa-row' }, h('input', { type: 'checkbox', checked: data.allowInternet, disabled: busy, onChange: (event) => void setSettings(appCtx, { allowInternet: event.target.checked }).then(load) }), ' Allow a reading model on the internet (you still see what would be sent first)'),

        h('h3', null, 'Learn'),
        h('div', { className: 'dsh-sa-row' },
          h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: async () => { const next = await act({ action: 'candidates' }, ''); if (next) setFound(next); } }, 'What it would read'),
          h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy || !data.readingModel, onClick: async () => { const next = await act({ action: 'preview' }, ''); if (next) setPreview(next.preview); } }, 'Show what it would send'),
          h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy || !data.readingModel || data.learning, onClick: () => void act({ action: 'learn', seen: Boolean(preview) }, 'Done: see the proposals below.') }, data.learning ? 'Learning…' : 'Learn now')),
        found ? h('div', { className: 'dsh-sa-card' },
          !found.known ? h('p', { 'data-error': 'true' }, found.reason) : null,
          h('p', null, `${found.candidates.length} conversation${found.candidates.length === 1 ? '' : 's'} with something to learn from; ${found.left.length} left out.`),
          found.candidates.map((item) => h('div', { key: item.id, className: 'dsh-sa-row' },
            h('span', { className: 'dsh-sa-grow' }, `${item.tab || '?'} · ${item.cwd.split('/').pop() || 'no folder'} · ${item.corrections} correction(s), ${item.stops} stop(s), ${item.thumbsDown} thumbs down, ${item.feedback} feedback`),
            h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => void act({ action: 'nolearn', sessionId: item.id, on: true }, 'It will never be read.').then(() => setFound((before) => ({ ...before, candidates: before.candidates.filter((other) => other.id !== item.id) }))) }, 'Never learn from this'))),
          found.left.length > 0 ? h('p', null, `Left out: ${[...new Set(found.left.map((item) => item.why))].join(', ')}.`) : null) : null,
        preview ? h('div', { className: 'dsh-sa-card' }, h('p', null, `This goes to ${preview.model}, ${WHERE[preview.where] ?? preview.where}, from ${preview.conversations} conversation(s):`), h('div', { className: 'dsh-sa-text' }, preview.text || '(nothing to send)')) : null,
        data.nolearn.length > 0 ? h('p', null, `${data.nolearn.length} conversation(s) marked "never learn from this".`) : null,
        h('div', { className: 'dsh-sa-row' },
          h('span', { className: 'dsh-sa-grow' }, 'Learn by itself (only proposes; only while the app is open; only with a model on this Mac or your network)'),
          h('select', { className: 'dsh-sa-btn', value: data.schedule, disabled: busy, 'aria-label': 'Learn by itself', onChange: (event) => void setSettings(appCtx, { schedule: event.target.value }).then(load) },
            h('option', { value: 'off' }, 'Off'), h('option', { value: 'nightly' }, 'Nightly'), h('option', { value: 'weekly' }, 'Weekly'))),
        data.schedule !== 'off' && data.lastRun ? h('p', null, `Last run ${new Date(data.lastRun).toLocaleString()}. ${data.lastNote}${data.missed ? ' Runs were missed while the app was closed; they are not caught up.' : ''}`) : null,

        h('h3', null, `Waiting for your yes (${waiting.length})`),
        waiting.length === 0 ? h('p', null, 'Nothing waits. Learn now, or type /skills learn in a chat.') : waiting.map((proposal) => h(ProposalCard, { key: proposal.id, proposal, busy, act })),
        decided.length > 0 ? h('p', null, `Decided lately: ${decided.map((item) => `${KIND_LABELS[item.kind]} ${item.state}`).join(', ')}.`) : null,

        h('h3', null, `Learned skills (${data.skills.filter((skill) => !skill.deleted).length})`),
        data.skills.map((skill) => h(SkillCard, { key: skill.name, skill, busy, act })),
        h('div', { className: 'dsh-sa-card' },
          h('b', null, 'Add a skill by hand'),
          h('input', { className: 'dsh-sa-field', placeholder: 'name, like check-dates-first', value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) }),
          h('input', { className: 'dsh-sa-field', placeholder: 'When it helps (one line)', value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) }),
          h('textarea', { className: 'dsh-sa-field', rows: 4, placeholder: 'What to do', value: draft.text, onChange: (event) => setDraft({ ...draft, text: event.target.value }) }),
          h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => void act({ action: 'add', ...draft, reach: { kind: 'all' } }, 'Added.').then((next) => { if (next) setDraft({ name: '', description: '', text: '' }); }) }, 'Add')),

        h('h3', null, 'Good to know'),
        h('p', null, 'A learned skill never takes the name of one of your skills, a project\'s, Plus\'s or the app\'s, and never changes them. Recon conversations get none and are never read. A project can start clean: its folder is listed below.'),
        h('div', { className: 'dsh-sa-row' },
          h('select', { className: 'dsh-sa-field', value: '', disabled: busy, 'aria-label': 'A project that starts clean', onChange: (event) => { const folder = event.target.value; if (folder) void act({ action: 'projectOff', folder, on: true }, 'That project starts clean: no learned skills there.'); } },
            h('option', { value: '' }, 'Start clean in a project (no learned skills there)…'),
            projectsOf(appCtx).filter((item) => !data.projectsOff.includes(item.path)).map((item) => h('option', { key: item.path, value: item.path }, item.title)))),
        data.projectsOff.length > 0 ? data.projectsOff.map((folder) => h('div', { key: folder, className: 'dsh-sa-row' }, h('span', { className: 'dsh-sa-grow' }, `Clean: ${folder}`), h('button', { type: 'button', className: 'dsh-sa-btn', disabled: busy, onClick: () => void act({ action: 'projectOff', folder, on: false }) }, 'Learned skills on again'))) : null);
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'skill-architect', order: 420, label: () => t('section.title') }, (props) => h(Page, { ...props, appCtx: ctx }))));
      },
    };
  },
});
