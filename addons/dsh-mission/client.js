/**
 * Mission, browser half: the Settings > Mission page. It has the switch, the mode that
 * `/mission on` uses, and a plain description of the three modes. Everything else happens through
 * the `/mission` command in a conversation.
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

    function MissionPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
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
        return () => { alive.current = false; };
      }, [load]);
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

        h('div', { className: 'dsh-ms-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'Open a conversation in a folder (Code, Cowork or Data) and type ', h('code', null, '/mission restricted'), ', ', h('code', null, '/mission ask'), ' or ', h('code', null, '/mission auto'), '. ', h('code', null, '/mission on'), ' uses the mode chosen above; ', h('code', null, '/mission off'), ' lifts it.'),
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
