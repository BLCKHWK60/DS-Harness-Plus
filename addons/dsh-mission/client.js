/**
 * Mission, browser half: the Settings > Mission page. It has the switch, the mode that
 * `/mission on` uses, the models for the three roles of a run (for every project, and per
 * project), and a run's limits. Everything else happens through the `/mission` command.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-mission',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'mission';
    const DICT = { en: { 'section.title': 'Mission' }, zh: { 'section.title': '任务' } };
    const MODES = [
      { id: 'restricted', label: 'Restricted', text: 'Nothing outside the conversation\'s folder is read or changed, and you are never asked for it. Inside, the assistant creates new files freely and asks you once per existing file before changing it.' },
      { id: 'ask', label: 'Ask-Auto', text: 'The same inside the folder. When it needs to read or change something outside, it has to ask you first.' },
      { id: 'auto', label: 'Full Auto', text: 'Inside the folder it works without asking. For anything outside the folder it must still ask you.' },
    ];

    const ROLES = [
      { id: 'plan', label: 'Planner', text: 'Reads the project and writes the checklist. Also takes over an item that two tries did not finish.' },
      { id: 'implement', label: 'Workers', text: 'Do the checklist items, one at a time.' },
      { id: 'review', label: 'Reviewer', text: 'Reads the changes against the goal at the end.' },
    ];
    const LIMITS = [
      { id: 'maxItems', label: 'Checklist items', text: 'Most items a plan may have.', fallback: 12, min: 1, max: 30 },
      { id: 'maxTries', label: 'Tries per item', text: 'The last try goes to the planner\'s model.', fallback: 3, min: 1, max: 8 },
      { id: 'maxReviews', label: 'Review passes', text: '0 leaves the review out.', fallback: 2, min: 0, max: 5 },
      { id: 'maxSteps', label: 'Steps in all', text: 'A run stops and reports when it gets here.', fallback: 60, min: 5, max: 300 },
      { id: 'waitMinutes', label: 'Minutes to wait for your yes', text: 'After this an item that needs your approval is set aside and the run carries on. 0 waits without end.', fallback: 3, min: 0, max: 60 },
    ];
    const parse = (value) => {
      try {
        const read = typeof value === 'string' ? JSON.parse(value || '{}') : value;
        return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
      } catch {
        return {};
      }
    };
    /** Only whole choices are kept, so an emptied row leaves nothing behind. */
    const tidyRoles = (roles) => Object.fromEntries(ROLES.map((role) => [role.id, roles?.[role.id]]).filter(([, pick]) => pick && pick.provider && pick.model));

    const CSS = `
.dsh-ms-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ms-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ms-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ms-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ms-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-rowtext { flex: 1; min-width: 0; }
.dsh-ms-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ms-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ms-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ms-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-ms-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ms-radio { flex: none; width: 18px; height: 18px; margin-top: 2px; padding: 0; border-radius: 50%; cursor: pointer; background: transparent; border: 1.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-ms-radio[aria-checked="true"] { border: 5px solid var(--dsw-alias-brand-primary); }
.dsh-ms-radio:focus-visible, .dsh-ms-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-field {
  flex: none; box-sizing: border-box; height: 32px; max-width: 260px; padding: 0 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
input.dsh-ms-field { width: 76px; cursor: text; text-align: right; }
.dsh-ms-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ms-row[data-center="true"] { align-items: center; }
.dsh-ms-card { margin-top: 12px; padding: 4px 14px 2px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-card .dsh-ms-row:last-child { border-bottom: 0; }
.dsh-ms-cardhead { display: flex; align-items: center; gap: 12px; padding: 10px 0 2px; }
.dsh-ms-cardhead b { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.dsh-ms-cardhead span { display: block; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 9px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-ms-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ms-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-list code { font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); }
`;

    async function read(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('The Mission add-on is not running.');
      return view;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    /** Pick a model from the app's own list; the first entry stands for "not chosen here". */
    function ModelSelect({ catalog, pick, none, label, disabled, onPick }) {
      const groups = catalog?.groups ?? [];
      const value = pick?.provider && pick?.model ? `${pick.provider}\u0000${pick.model}` : '';
      const known = groups.some((group) => group.id === pick?.provider && group.models.some((item) => item.id === pick?.model));
      return h('select', {
        className: 'dsh-ms-field', value, 'aria-label': label, disabled,
        onChange: (event) => {
          const [provider, model] = event.target.value.split('\u0000');
          onPick(provider && model ? { provider, model } : undefined);
        },
      },
      h('option', { value: '' }, none),
      value && !known ? h('option', { value }, `${pick.model} (not available now)`) : null,
      groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, item.name)))));
    }

    /** A number that is saved when the field is left, kept inside its range. */
    function NumberField({ value, min, max, label, disabled, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      const [seen, setSeen] = useState(value);
      if (value !== seen) {
        setSeen(value);
        setDraft(String(value));
      }
      const commit = () => {
        const number = Math.round(Number(draft));
        if (!Number.isFinite(number)) { setDraft(String(value)); return; }
        const next = Math.min(max, Math.max(min, number));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', { className: 'dsh-ms-field', type: 'number', inputMode: 'numeric', min, max, value: draft, 'aria-label': label, disabled, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); } });
    }

    function MissionPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [catalog, setCatalog] = useState(null);
      const [folders, setFolders] = useState([]);
      // A project that was added but has no model picked yet; it is not saved until it has one.
      const [drafts, setDrafts] = useState([]);
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const view = await read(appCtx);
          if (alive.current) { setData(view.value ?? {}); setError(''); }
        } catch (problem) {
          if (alive.current) setError(String(problem?.message ?? problem));
        }
      }, [appCtx]);
      useEffect(() => {
        alive.current = true;
        void load();
        // The models and the projects the app knows, for the pickers.
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (alive.current && result?.ok) setCatalog(result.value);
          } catch {
            /* the pickers then show only what is already chosen */
          }
          try {
            const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items;
            if (alive.current && Array.isArray(items)) setFolders(items.filter((item) => typeof item?.path === 'string' && item.path).map((item) => ({ path: item.path, title: String(item.title || item.path.split('/').pop()) })));
          } catch {
            /* no list: projects already saved still show */
          }
        })();
        return () => { alive.current = false; };
      }, [load, appCtx]);
      const save = useCallback(async (values, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((before) => ({ ...before, ...values }));
          setNote({ text: done, error: false });
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [appCtx]);

      const roles = parse(data?.roles);
      const projects = parse(data?.projects);
      const shownProjects = [...new Set([...Object.keys(projects), ...drafts])];
      const titleOf = (folder) => folders.find((item) => item.path === folder)?.title ?? folder.split('/').pop();
      const setRole = (role, pick) => void save({ roles: JSON.stringify(tidyRoles({ ...roles, [role]: pick })) }, 'Saved. It applies from the next run.');
      const setProjectRole = (folder, role, pick) => {
        const own = tidyRoles({ ...projects[folder], [role]: pick });
        const next = { ...projects };
        if (Object.keys(own).length > 0) next[folder] = own;
        else delete next[folder];
        // An emptied project stays on the page until it is removed, so the pickers do not vanish under the cursor.
        if (Object.keys(own).length === 0 && !drafts.includes(folder)) setDrafts((list) => [...list, folder]);
        void save({ projects: JSON.stringify(next) }, 'Saved. It applies from the next run in that project.');
      };
      const removeProject = (folder) => {
        setDrafts((list) => list.filter((item) => item !== folder));
        if (!projects[folder]) return;
        const { [folder]: _gone, ...rest } = projects;
        void save({ projects: JSON.stringify(rest) }, 'Removed. That project follows the choices above again.');
      };
      const free = folders.filter((item) => !shownProjects.includes(item.path));

      const loaded = Boolean(data);
      const enabled = loaded && data.enabled !== false;
      const chosen = loaded && MODES.some((mode) => mode.id === data.defaultMode) ? data.defaultMode : 'restricted';

      return h('div', { className: 'dsh-ms-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ms-title' }, 'Mission'),
        h('p', { className: 'dsh-ms-desc' }, 'Keeps the assistant inside a conversation\'s folder, in one of three permission modes, and takes checkpoints of the folder that you can go back to. You switch it on per conversation by typing /mission in the chat box.'),
        !loaded ? h('p', { className: 'dsh-ms-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…') : null,
        note.text ? h('p', { className: 'dsh-ms-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        loaded ? h('div', { className: 'dsh-ms-row' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, 'Mission'),
            h('div', { className: 'dsh-ms-rowdesc' }, 'Off takes the /mission command away and lifts every mode that is on. Checkpoints already taken stay in their folders.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': enabled, 'aria-label': 'Mission', disabled: busy, onClick: () => void save({ enabled: !enabled }, enabled ? 'Switched off.' : 'Switched on.') })) : null,

        h('div', { className: 'dsh-ms-group' }, 'The mode /mission on uses'),
        MODES.map((mode) => h('div', { key: mode.id, className: 'dsh-ms-row' },
          h('button', { type: 'button', role: 'radio', className: 'dsh-ms-radio', 'aria-checked': chosen === mode.id, 'aria-label': mode.label, disabled: busy || !loaded, onClick: () => void save({ defaultMode: mode.id }, `/mission on now switches on ${mode.label}.`) }),
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, mode.label),
            h('div', { className: 'dsh-ms-rowdesc' }, mode.text)))),

        h('div', { className: 'dsh-ms-group' }, 'Models for a run'),
        h('p', { className: 'dsh-ms-desc' }, 'A run (/mission followed by a goal) uses three roles. By default all three run on the conversation\'s own model, so only one model has to be loaded. The choices below apply only in a conversation whose models chip (in the chat box) is set to "Different models". Then: pick a model for a role here, or leave it to Model Tiers, which uses the plan, implement or review model of the conversation\'s tier.'),
        ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, role.label),
            h('div', { className: 'dsh-ms-rowdesc' }, role.text)),
          h(ModelSelect, { catalog, pick: roles[role.id], none: 'Follow Model Tiers', label: `Model for the ${role.label.toLowerCase()}`, disabled: busy || !loaded, onPick: (pick) => setRole(role.id, pick) }))),

        h('div', { className: 'dsh-ms-group' }, 'Per project'),
        h('p', { className: 'dsh-ms-desc' }, 'A project can have its own models. What is picked here wins over the choices above, for runs in that project\'s folder only.'),
        shownProjects.map((folder) => h('div', { key: folder, className: 'dsh-ms-card' },
          h('div', { className: 'dsh-ms-cardhead' },
            h('b', null, titleOf(folder), h('span', null, folder)),
            h('button', { type: 'button', className: 'dsh-ms-btn', disabled: busy, onClick: () => removeProject(folder) }, 'Remove')),
          ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
            h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, role.label)),
            h(ModelSelect, { catalog, pick: projects[folder]?.[role.id], none: 'As above', label: `${role.label} for ${titleOf(folder)}`, disabled: busy, onPick: (pick) => setProjectRole(folder, role.id, pick) }))))),
        loaded ? h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowdesc' }, free.length > 0 ? 'Add a project to give it models of its own.' : folders.length === 0 ? 'The app lists no project folders yet. Open a conversation in a folder first.' : 'Every project the app knows is listed above.')),
          free.length > 0 ? h('select', { className: 'dsh-ms-field', value: '', 'aria-label': 'Add a project', disabled: busy, onChange: (event) => { const folder = event.target.value; if (folder) setDrafts((list) => [...list, folder]); } },
            h('option', { value: '' }, 'Add a project…'),
            free.map((item) => h('option', { key: item.path, value: item.path }, item.title))) : null) : null,

        h('div', { className: 'dsh-ms-group' }, 'How far a run may go'),
        LIMITS.map((limit) => h('div', { key: limit.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, limit.label),
            h('div', { className: 'dsh-ms-rowdesc' }, limit.text)),
          h(NumberField, { value: Number.isFinite(Number(data?.[limit.id])) ? Number(data[limit.id]) : limit.fallback, min: limit.min, max: limit.max, label: limit.label, disabled: busy || !loaded, onCommit: (number) => void save({ [limit.id]: number }, 'Saved. It applies from the next run.') }))),

        h('div', { className: 'dsh-ms-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'Open a conversation in a folder (Code, Cowork or Data) and type ', h('code', null, '/mission restricted'), ', ', h('code', null, '/mission ask'), ' or ', h('code', null, '/mission auto'), '. ', h('code', null, '/mission on'), ' uses the mode chosen above; ', h('code', null, '/mission off'), ' lifts it.'),
          h('li', null, 'To have several models work on a goal, type ', h('code', null, '/mission'), ' followed by the goal, for example ', h('code', null, '/mission make every test pass and add a --json option'), '. A mode named first applies to the run: ', h('code', null, '/mission auto …'), '. The run plans, works through a checklist, proves each item with a real command where it can, has the result reviewed, and ends with a report.'),
          h('li', null, h('code', null, '/mission stop'), ' pauses a run, ', h('code', null, '/mission resume'), ' carries on (also with items that waited for your yes), ', h('code', null, '/mission end'), ' closes it with a report, ', h('code', null, '/mission report'), ' shows how it stands.'),
          h('li', null, 'A question from the assistant appears as the app\'s approval card. A yes to a file holds for that file for the rest of the conversation.'),
          h('li', null, h('code', null, '/mission checkpoints'), ' lists the checkpoints. ', h('code', null, '/mission back 12'), ' puts the folder back as it was at checkpoint 12. Going back is itself kept as a checkpoint, so it can be undone.'),
          h('li', null, h('code', null, '/mission'), ' alone shows the mode that is on and the commands.')),

        h('div', { className: 'dsh-ms-group' }, 'Good to know'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'While a mode is on, the conversation uses the app\'s Workspace Write permission. The app\'s own sandbox then stops any change outside the folder, whatever a command tries.'),
          h('li', null, 'A checkpoint is taken at the start of every turn and before every terminal command. In Restricted and Ask-Auto, if a command changes or deletes an existing file you have not approved, that file is put back at once and the assistant has to ask.'),
          h('li', null, 'Checkpoints live in a hidden folder named .dsh-mission inside the conversation\'s folder. They need git, which comes with Apple\'s command line tools. Your project\'s own git history is not touched.'),
          h('li', null, 'Files your project ignores (in .gitignore), and node_modules, are not part of a checkpoint: they are neither protected nor put back.'),
          h('li', null, 'Reading outside the folder is checked from the text of a command. A script could still read a file elsewhere on the Mac without naming it; it cannot change one.'),
          h('li', null, 'In a run, "PASSED" means a command was really run and passed. "REVIEWED" means no command could prove the item and the reviewer model judged it done. Nothing counts as done on a worker\'s word alone.'),
          h('li', null, 'A run works on one item at a time, so two models never change the same files at once. Each run keeps its log and every model\'s answer in .dsh-mission/runs inside the folder.'),
          h('li', null, 'While a run is on, the conversation\'s own model only keeps the run moving. Pause the run to work with it yourself.'),
          h('li', null, 'Changes you make yourself in an editor are never undone by Mission, but a later "go back" returns the folder to the checkpoint, including your changes since then.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'mission', order: 25, label: () => t('section.title') }, (props) => h(MissionPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
