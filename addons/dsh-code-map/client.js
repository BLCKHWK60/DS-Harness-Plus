/**
 * Browser half of Code map: the Settings → Code map page.
 *
 * Switches and limits are saved through the app's settings channel. Folder numbers
 * come from the fenced `GET dsh-code-map/status` route; Rebuild and Delete go to the
 * fenced `POST dsh-code-map/action` route, which only accepts a folder that already
 * has a map or the app's default folder. The page follows docs/UI-STYLE.md: colours
 * come only from the app's variables, so it follows every colour scheme.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-code-map',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const NS = 'code-map';

    const DICT = {
      en: {
        'section.title': 'Code map',
        'head.title': 'Code map',
        'head.hint':
          'A compact map of your project: its files, the functions and classes in them, and what uses what. The assistant looks things up in the map and reads one function at a time, instead of reading whole files. That uses far fewer tokens on a large project. Nothing is installed and nothing is written into your project.',
        'row.enabled': 'Use the code map',
        'row.enabled.hint': 'Gives the assistant five look-up tools in conversations that have tools (Cowork and Code).',
        'row.hint': 'Tell the assistant about it',
        'row.hint.hint': 'Adds three lines to its instructions in code projects, so it uses the map before reading files.',
        'group.folders': 'Mapped folders',
        'folders.empty': 'No folder is mapped yet. A map is made the first time the assistant uses it in a project.',
        'folder.default': 'Default folder',
        'folder.unmapped': 'Not mapped yet.',
        'folder.numbers': '{files} files · {symbols} functions, classes and other names · {source} of source',
        'folder.saving': 'About {tokens} tokens to read in full. An overview from the map is at most about 1,500 tokens.',
        'folder.disk': 'The map takes {disk} on this Mac · made {when}',
        'folder.partial': 'Only part of this folder is mapped, because a limit below was reached.',
        'folder.building': 'Mapping…',
        'action.rebuild': 'Map again',
        'action.build': 'Map this folder now',
        'action.clear': 'Delete map',
        'group.limits': 'Limits',
        'limit.files': 'Most files in one folder',
        'limit.files.hint': 'A bigger folder is mapped up to this many files. 100 to 50,000.',
        'limit.kb': 'Largest file (KB)',
        'limit.kb.hint': 'Bigger files are skipped. 16 to 4,096.',
        'limit.ignore': 'Also leave out',
        'limit.ignore.hint': 'One pattern per line, written like a line in a .gitignore file, for example docs/ or *.generated.ts. Dependency and build folders, binaries, lock files and anything your .gitignore lists are always left out.',
        'group.skills': 'Reverse-engineer skills',
        'skills.hint': 'Four step-by-step guides the assistant can follow. Type / in the chat box and pick one, or just ask.',
        'skill.reverse-codebase': 'A code base: how it works, written as an architecture document.',
        'skill.reverse-website': 'A website or web app: a specification to rebuild it from.',
        'skill.reverse-api-format': 'An API or file format: documentation from examples.',
        'skill.reverse-app-binary': 'An installed app or program file: what it is made of and what it does. For software you own or may analyse; it does not remove protections.',
        'group.how': 'Good to know',
        'how.1': 'The map lists names, line numbers and connections. It does not hold your code, and it is kept in the app\'s own data folder.',
        'how.2': 'Connections are found by reading the text, not by compiling. They are right for ordinary code and can miss unusual constructs.',
        'how.3': 'Only the folder a conversation works in is mapped. Links to other folders are never followed.',
        'saved': 'Saved',
        'saving': 'Saving…',
        'loading': 'Loading…',
        'unavailable': 'The Code map page could not load its data. Restart the app once after installing.',
        'when.now': 'just now',
        'when.min': '{n} min ago',
        'when.hour': '{n} h ago',
        'when.day': '{n} days ago',
      },
    };

    const CSS = `
.dsh-cm-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-cm-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-cm-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-cm-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cm-row[data-stack="true"] { flex-direction: column; align-items: stretch; gap: 8px; }
.dsh-cm-rowtext { flex: 1; min-width: 0; }
.dsh-cm-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-cm-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-cm-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-cm-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-cm-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-cm-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cm-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-cm-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-cm-num { flex: none; width: 120px; }
textarea.dsh-cm-field { width: 100%; height: auto; min-height: 84px; padding: 9px 14px; line-height: 20px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.dsh-cm-card {
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; padding: 12px 14px; border-radius: 20px;
  border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));
}
.dsh-cm-cardhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-cm-folder { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.dsh-cm-tag { flex: none; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 11px; line-height: 24px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-cm-line { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-line[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-cm-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.dsh-cm-btn {
  height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer;
}
.dsh-cm-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-cm-btn[disabled] { opacity: .5; cursor: default; }
.dsh-cm-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-cm-list { margin: 0; padding: 0; list-style: none; }
.dsh-cm-list li { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-list li b { display: block; font-size: 14px; line-height: 22px; font-weight: 400; color: var(--dsw-alias-label-primary); }
.dsh-cm-status { margin-top: 16px; min-height: 18px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-status[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
`;

    /** @param {number} bytes @returns {string} a short size. */
    function size(bytes) {
      if (!(bytes > 0)) return '0 KB';
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    /** @param {number} n @returns {string} a number with thousands separators. */
    function count(n) {
      return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** Load this add-on's settings through the app's settings channel. */
    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw new Error('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    /** Write settings; on a conflict, reload once and try again. */
    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    /** Read the folder numbers. */
    async function loadStatus() {
      const response = await fetch(new URL('dsh-code-map/status', document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response.json();
    }

    /** Ask the host to map a folder again or delete its map. */
    async function sendAction(action, id) {
      const response = await fetch(new URL('dsh-code-map/action', document.baseURI), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-code-map': '1' },
        body: JSON.stringify({ action, id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `status ${response.status}`);
      return body;
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-cm-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    /** A number field that saves when you leave it or press Enter. */
    function NumberField({ value, min, max, label, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const commit = () => {
        const number = Math.round(Number(draft));
        if (!Number.isFinite(number)) return setDraft(String(value));
        const next = Math.min(max, Math.max(min, number));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', {
        className: 'dsh-cm-field dsh-cm-num',
        type: 'number',
        min,
        max,
        step: 1,
        value: draft,
        'aria-label': label,
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
          }
        },
      });
    }

    function CodeMapPage({ appCtx }) {
      const t = appCtx.locale.bind('codeMap');
      const [settings, setSettings] = useState(null);
      const [status, setStatus] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState('');
      const [ignore, setIgnore] = useState('');

      const refresh = useCallback(async () => {
        try {
          setStatus(await loadStatus());
        } catch {
          setStatus((prev) => prev ?? { error: true });
        }
      }, []);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const loaded = await loadSettings(appCtx);
            if (!alive) return;
            setSettings(loaded);
            setIgnore(typeof loaded.value.extraIgnore === 'string' ? loaded.value.extraIgnore : '');
          } catch {
            if (alive) setNote({ text: t('unavailable'), error: true });
          }
        })();
        refresh();
        return () => {
          alive = false;
        };
      }, [appCtx, refresh]);

      // While a folder is being mapped, look again every two seconds.
      const building = Boolean(status?.folders?.some((row) => row.building));
      useEffect(() => {
        if (!building) return undefined;
        const timer = setInterval(refresh, 2000);
        return () => clearInterval(timer);
      }, [building, refresh]);

      const save = async (field, value) => {
        if (!settings) return;
        setNote({ text: t('saving'), error: false });
        try {
          const next = await mutateSettings(appCtx, [{ op: 'set', path: [field], value }], settings.revision);
          setSettings(next);
          setNote({ text: t('saved'), error: false });
          refresh();
        } catch (error) {
          setNote({ text: String(error?.message ?? error), error: true });
        }
      };

      const act = async (action, id) => {
        setBusy(`${action}:${id}`);
        setNote({ text: '', error: false });
        try {
          setStatus(await sendAction(action, id));
        } catch (error) {
          setNote({ text: String(error?.message ?? error), error: true });
        }
        setBusy('');
      };

      const when = (at) => {
        const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
        if (seconds < 90) return t('when.now');
        if (seconds < 5400) return t('when.min').replace('{n}', String(Math.round(seconds / 60)));
        if (seconds < 129600) return t('when.hour').replace('{n}', String(Math.round(seconds / 3600)));
        return t('when.day').replace('{n}', String(Math.round(seconds / 86400)));
      };

      const value = settings?.value ?? {};
      const enabled = value.enabled !== false;
      const hint = value.promptHint !== false;
      const maxFiles = Number.isFinite(Number(value.maxFiles)) ? Number(value.maxFiles) : 5000;
      const maxKb = Number.isFinite(Number(value.maxFileKb)) ? Number(value.maxFileKb) : 400;
      const folders = status?.folders ?? [];
      const preset = status?.defaultFolder;
      const presetMapped = preset && folders.some((row) => row.id === preset.id);

      const folderCard = (row) =>
        h(
          'div',
          { className: 'dsh-cm-card', key: row.id },
          h(
            'div',
            { className: 'dsh-cm-cardhead' },
            h('span', { className: 'dsh-cm-folder', title: row.folder }, h('bdi', null, row.folder)),
            preset && preset.id === row.id ? h('span', { className: 'dsh-cm-tag' }, t('folder.default')) : null,
          ),
          h(
            'div',
            { className: 'dsh-cm-line' },
            row.building && !row.builtAt
              ? t('folder.building')
              : t('folder.numbers').replace('{files}', count(row.files)).replace('{symbols}', count(row.symbols)).replace('{source}', size(row.bytes)),
          ),
          row.builtAt
            ? h(
                'div',
                { className: 'dsh-cm-line' },
                t('folder.saving').replace('{tokens}', count(row.bytes / 4)),
              )
            : null,
          row.builtAt
            ? h('div', { className: 'dsh-cm-line' }, t('folder.disk').replace('{disk}', size(row.diskBytes)).replace('{when}', row.building ? t('folder.building') : when(row.builtAt)))
            : null,
          row.languages?.length
            ? h('div', { className: 'dsh-cm-line' }, row.languages.slice(0, 6).map(([lang, n]) => `${lang} ${count(n)}`).join(' · '))
            : null,
          row.truncated ? h('div', { className: 'dsh-cm-line', 'data-warn': 'true' }, t('folder.partial')) : null,
          h(
            'div',
            { className: 'dsh-cm-actions' },
            h('button', { type: 'button', className: 'dsh-cm-btn', disabled: busy !== '' || row.building || !enabled, onClick: () => act('rebuild', row.id) }, busy === `rebuild:${row.id}` ? t('folder.building') : t('action.rebuild')),
            h('button', { type: 'button', className: 'dsh-cm-btn', disabled: busy !== '' || row.building, onClick: () => act('clear', row.id) }, t('action.clear')),
          ),
        );

      return h(
        'div',
        { className: 'dsh-cm-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('h2', { className: 'dsh-cm-title' }, t('head.title')),
        h('p', { className: 'dsh-cm-desc' }, t('head.hint')),

        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dsh-cm-rowtext' }, h('div', { className: 'dsh-cm-rowtitle' }, t('row.enabled')), h('div', { className: 'dsh-cm-rowdesc' }, t('row.enabled.hint'))),
          h(Switch, { checked: enabled, label: t('row.enabled'), onChange: (next) => save('enabled', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dsh-cm-rowtext' }, h('div', { className: 'dsh-cm-rowtitle' }, t('row.hint')), h('div', { className: 'dsh-cm-rowdesc' }, t('row.hint.hint'))),
          h(Switch, { checked: hint, label: t('row.hint'), onChange: (next) => save('promptHint', next) }),
        ),

        h('div', { className: 'dsh-cm-group' }, t('group.folders')),
        preset && !presetMapped && !preset.refusal
          ? h(
              'div',
              { className: 'dsh-cm-card' },
              h('div', { className: 'dsh-cm-cardhead' }, h('span', { className: 'dsh-cm-folder', title: preset.folder }, h('bdi', null, preset.folder)), h('span', { className: 'dsh-cm-tag' }, t('folder.default'))),
              h('div', { className: 'dsh-cm-line' }, t('folder.unmapped')),
              h(
                'div',
                { className: 'dsh-cm-actions' },
                h('button', { type: 'button', className: 'dsh-cm-btn', 'data-main': 'true', disabled: busy !== '' || !enabled, onClick: () => act('rebuild', preset.id) }, busy === `rebuild:${preset.id}` ? t('folder.building') : t('action.build')),
              ),
            )
          : null,
        folders.length > 0 ? folders.map(folderCard) : h('div', { className: 'dsh-cm-line' }, status ? t('folders.empty') : t('loading')),

        h('div', { className: 'dsh-cm-group' }, t('group.limits')),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dsh-cm-rowtext' }, h('div', { className: 'dsh-cm-rowtitle' }, t('limit.files')), h('div', { className: 'dsh-cm-rowdesc' }, t('limit.files.hint'))),
          h(NumberField, { value: maxFiles, min: 100, max: 50000, label: t('limit.files'), onCommit: (next) => save('maxFiles', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dsh-cm-rowtext' }, h('div', { className: 'dsh-cm-rowtitle' }, t('limit.kb')), h('div', { className: 'dsh-cm-rowdesc' }, t('limit.kb.hint'))),
          h(NumberField, { value: maxKb, min: 16, max: 4096, label: t('limit.kb'), onCommit: (next) => save('maxFileKb', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row', 'data-stack': 'true' },
          h('div', { className: 'dsh-cm-rowtext' }, h('div', { className: 'dsh-cm-rowtitle' }, t('limit.ignore')), h('div', { className: 'dsh-cm-rowdesc' }, t('limit.ignore.hint'))),
          h('textarea', {
            className: 'dsh-cm-field',
            rows: 3,
            maxLength: 4000,
            spellCheck: false,
            value: ignore,
            'aria-label': t('limit.ignore'),
            onChange: (event) => setIgnore(event.target.value),
            onBlur: () => {
              if (ignore !== (typeof value.extraIgnore === 'string' ? value.extraIgnore : '')) save('extraIgnore', ignore);
            },
          }),
        ),

        h('div', { className: 'dsh-cm-group' }, t('group.skills')),
        h('p', { className: 'dsh-cm-desc', style: { marginTop: 0 } }, t('skills.hint')),
        h(
          'ul',
          { className: 'dsh-cm-list' },
          ['reverse-codebase', 'reverse-website', 'reverse-api-format', 'reverse-app-binary'].map((id) => h('li', { key: id }, h('b', null, `/${id}`), t(`skill.${id}`))),
        ),

        h('div', { className: 'dsh-cm-group' }, t('group.how')),
        h('ul', { className: 'dsh-cm-list' }, ['how.1', 'how.2', 'how.3'].map((key) => h('li', { key }, t(key)))),

        h('div', { className: 'dsh-cm-status', role: 'status', 'aria-live': 'polite', 'data-error': String(note.error) }, note.text),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('codeMap', DICT));
        const t = ctx.locale.bind('codeMap');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'code-map', order: 19, label: () => t('section.title') },
              (props) => h(CodeMapPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
