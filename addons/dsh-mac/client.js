/**
 * Mac bridge, browser half: the Settings > Mac page, where you choose which folders the assistant
 * may search and which of your Shortcuts it may run. The searching and running are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-mac',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'mac';
    const DICT = { en: { 'section.title': 'Mac' }, zh: { 'section.title': 'Mac' } };

    const CSS = `
.dsh-mc-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-mc-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-mc-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-mc-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-mc-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-mc-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-mc-rowtext { flex: 1; min-width: 0; }
.dsh-mc-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-mc-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-mc-side { flex: none; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-mc-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-mc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mc-btn:disabled { opacity: .5; cursor: default; }
.dsh-mc-add { display: flex; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-mc-field {
  flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-mc-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-mc-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-mc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-mc-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-mc-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-mc-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-mac/data', document.baseURI), {
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

    /** Ask macOS for a folder; resolves with its path, or null when cancelled. */
    function chooseFolder(appCtx) {
      const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
      if (desktop && typeof desktop.pick === 'function') return desktop.pick();
      return appCtx.get('uiWorkspace').pickDirectory();
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-mc-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    function MacPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [path, setPath] = useState('');
      const [busy, setBusy] = useState(false);
      const [all, setAll] = useState(false);
      const alive = useRef(true);
      useEffect(() => {
        alive.current = true;
        call()
          .then((next) => { if (alive.current) setData(next); })
          .catch((error) => { if (alive.current) setNote({ text: `Could not load: ${error.message}`, error: true }); });
        return () => { alive.current = false; };
      }, []);

      if (!data) {
        return h('div', { className: 'dsh-mc-page' }, h('style', null, CSS), h('h2', { className: 'dsh-mc-title' }, 'Mac'), h('p', { className: 'dsh-mc-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }

      const save = async (values, done = 'Saved.') => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return true;
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const folders = Array.isArray(data.folders) ? data.folders : [];
      const allowed = Array.isArray(data.shortcuts) ? data.shortcuts : [];
      const trusted = Array.isArray(data.trusted) ? data.trusted : [];
      const everything = Array.isArray(data.all) ? data.all : [];

      const add = async (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return;
        try {
          const checked = await call({ action: 'check', path: text });
          if (folders.includes(checked.path)) {
            setNote({ text: 'That folder is already allowed.', error: true });
            return;
          }
          if (await save({ folders: [...folders, checked.path] }, 'Added. The assistant may now search for files there.')) setPath('');
        } catch (error) {
          if (alive.current) setNote({ text: error.message, error: true });
        }
      };
      const choose = async () => {
        try {
          const picked = await chooseFolder(appCtx);
          if (picked) await add(picked);
        } catch (error) {
          if (alive.current) setNote({ text: `The folder chooser could not be opened (${error.message}). Type the folder's path instead.`, error: true });
        }
      };
      const allow = (name, on) => save(on
        ? { shortcuts: [...allowed, name] }
        : { shortcuts: allowed.filter((other) => other !== name), trusted: trusted.filter((other) => other !== name) });
      const trust = (name, on) => save({ trusted: on ? [...trusted, name] : trusted.filter((other) => other !== name) });

      // Allowed ones first; a Shortcut that was allowed and has since been deleted still shows, so it can be switched off.
      const gone = allowed.filter((name) => !everything.includes(name));
      const rows = [...allowed.filter((name) => everything.includes(name)), ...gone, ...everything.filter((name) => !allowed.includes(name))];
      const shown = all ? rows : rows.slice(0, Math.max(8, allowed.length));

      return h('div', { className: 'dsh-mc-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-mc-title' }, 'Mac'),
        h('p', { className: 'dsh-mc-desc' }, 'Lets the assistant find your files and run your Apple Shortcuts. Nothing is allowed until you allow it here, and nothing is installed: it uses Spotlight and the Shortcuts app that come with your Mac.'),
        note.text ? h('p', { className: 'dsh-mc-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.enabled === false ? h('p', { className: 'dsh-mc-desc', 'data-error': 'true' }, 'The Mac bridge is switched off, so the assistant has none of this.') : null,

        h('div', { className: 'dsh-mc-group' }, 'Finding files'),
        h('p', { className: 'dsh-mc-desc' }, 'The assistant may search for files in these folders, by words in the file or in its name. A search gives it the file\'s place and date, not its contents.'),
        folders.length === 0 ? h('p', { className: 'dsh-mc-desc' }, 'No folder yet, so the assistant cannot search for files.') : null,
        folders.map((folder) => h('div', { key: folder, className: 'dsh-mc-row' },
          h('div', { className: 'dsh-mc-rowtext' }, h('div', { className: 'dsh-mc-rowtitle' }, folder)),
          h('button', { type: 'button', className: 'dsh-mc-btn', disabled: busy, onClick: () => save({ folders: folders.filter((other) => other !== folder) }, 'Removed. The folder itself was not touched.') }, 'Remove'))),
        h('div', { className: 'dsh-mc-add' },
          h('input', {
            className: 'dsh-mc-field', value: path, placeholder: 'A folder, for example ~/Documents', 'aria-label': 'Folder to allow', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off',
            onChange: (event) => setPath(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') void add(path); },
          }),
          h('button', { type: 'button', className: 'dsh-mc-btn', disabled: busy || !path.trim(), onClick: () => add(path) }, 'Add'),
          h('button', { type: 'button', className: 'dsh-mc-btn', disabled: busy, onClick: choose }, 'Choose…')),

        h('div', { className: 'dsh-mc-group' }, 'Shortcuts'),
        h('p', { className: 'dsh-mc-desc' }, 'Shortcuts you made in Apple\'s Shortcuts app. Switch on the ones the assistant may run. It asks you each time, unless you also switch on "Without asking" for that Shortcut.'),
        data.problem ? h('p', { className: 'dsh-mc-desc', 'data-error': 'true' }, `Your Shortcuts could not be listed: ${data.problem}.`) : null,
        !data.problem && rows.length === 0 ? h('p', { className: 'dsh-mc-desc' }, 'You have no Shortcuts yet. Make one in the Shortcuts app and open this page again.') : null,
        shown.map((name) => {
          const on = allowed.includes(name);
          return h('div', { key: name, className: 'dsh-mc-row' },
            h('div', { className: 'dsh-mc-rowtext' },
              h('div', { className: 'dsh-mc-rowtitle' }, name),
              gone.includes(name) ? h('div', { className: 'dsh-mc-rowdesc' }, 'No longer in the Shortcuts app.') : null),
            on ? h('div', { className: 'dsh-mc-side' }, 'Without asking', h(Switch, { on: trusted.includes(name), label: `Run ${name} without asking`, onChange: (value) => trust(name, value) })) : null,
            h('div', { className: 'dsh-mc-side' }, 'May run', h(Switch, { on, label: `The assistant may run ${name}`, onChange: (value) => allow(name, value) })));
        }),
        rows.length > shown.length ? h('p', { className: 'dsh-mc-desc' }, h('button', { type: 'button', className: 'dsh-mc-btn', onClick: () => setAll(true) }, `Show all ${rows.length}`)) : null,

        h('div', { className: 'dsh-mc-group' }, 'Everything'),
        h('div', { className: 'dsh-mc-row' },
          h('div', { className: 'dsh-mc-rowtext' }, h('div', { className: 'dsh-mc-rowtitle' }, 'Use the Mac bridge'), h('div', { className: 'dsh-mc-rowdesc' }, 'Off takes file search and Shortcuts away from the assistant. Your choices above are kept.')),
          h(Switch, { on: data.enabled !== false, label: 'Use the Mac bridge', onChange: (value) => save({ enabled: value }) })),

        h('div', { className: 'dsh-mc-group' }, 'Good to know'),
        h('ul', { className: 'dsh-mc-list' },
          h('li', null, 'A Shortcut can do anything you built it to do. Only switch on "Without asking" for ones that cannot do harm, such as reading something.'),
          h('li', null, 'The assistant sees a Shortcut\'s name, not what is inside it. Give your Shortcuts names that say what they do.'),
          h('li', null, 'Text a Shortcut gives back, and text in files, can contain instructions written by someone else. The assistant is told to treat it as data.'),
          h('li', null, 'File search only finds what Spotlight has indexed. Folders you excluded from Spotlight stay excluded.'),
          h('li', null, 'Mail, Calendar and Reminders are not part of this yet.'),
          h('li', null, 'The assistant can use this in tabs where tools are on (Cowork and Code).')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'mac', order: 22, label: () => t('section.title') }, (props) => h(MacPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
