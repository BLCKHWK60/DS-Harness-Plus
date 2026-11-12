/**
 * Library, browser half: the Settings > Library page, where you add the folders the assistant
 * may search. The reading, the index and the search are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-library',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'library';
    const DICT = { en: { 'section.title': 'Library' }, zh: { 'section.title': '资料库' } };

    const CSS = `
.dsh-lb-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-lb-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-lb-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-lb-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-lb-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-lb-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-lb-rowtext { flex: 1; min-width: 0; }
.dsh-lb-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-lb-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-lb-rowdesc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-lb-btns { flex: none; display: flex; gap: 8px; align-items: center; }
.dsh-lb-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-lb-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-lb-btn:disabled { opacity: .5; cursor: default; }
.dsh-lb-add { display: flex; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-lb-field {
  flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-lb-field[data-small="true"] { flex: none; width: 90px; text-align: right; }
.dsh-lb-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-lb-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-lb-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-lb-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-lb-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-lb-hit { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-lb-hitname { font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.dsh-lb-hittext {
  margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden;
}
.dsh-lb-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
`;

    const num = (value) => Number(value || 0).toLocaleString('en-US');
    const plural = (count, one, many) => `${num(count)} ${count === 1 ? one : many}`;

    function when(at) {
      if (!at) return '';
      const date = new Date(at);
      const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = Math.round((day(date) - day(new Date())) / 86400000);
      if (diff === 0) return `today ${time}`;
      if (diff === -1) return `yesterday ${time}`;
      return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
    }

    async function call(body) {
      const response = await fetch(new URL('dsh-library/data', document.baseURI), {
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

    function folderLine(folder) {
      if (folder.missing) return { text: 'This folder was not found. If it is on an external drive, connect the drive and press Check now.', error: true };
      const parts = [plural(folder.ok, 'document', 'documents')];
      const bad = folder.empty + folder.failed;
      if (bad > 0) parts.push(`${num(bad)} could not be searched`);
      if (folder.at) parts.push(`last read ${when(folder.at)}`);
      if (folder.full) parts.push('only the first 20,000 documents were taken');
      return { text: parts.join(' · '), error: false };
    }

    function LibraryPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [path, setPath] = useState('');
      const [busy, setBusy] = useState(false);
      const [query, setQuery] = useState('');
      const [found, setFound] = useState(null);
      const alive = useRef(true);
      const scanning = useRef(false);

      const load = () => call()
        .then((next) => { if (alive.current) { scanning.current = next.status?.scanning === true; setData(next); } })
        .catch((error) => { if (alive.current) setNote({ text: `Could not load: ${error.message}`, error: true }); });
      useEffect(() => {
        alive.current = true;
        load();
        // Often while documents are being read, seldom otherwise.
        let ticks = 0;
        const timer = setInterval(() => { ticks += 1; if (scanning.current || ticks % 5 === 0) load(); }, 3000);
        return () => { alive.current = false; clearInterval(timer); };
      }, []);

      if (!data) {
        return h('div', { className: 'dsh-lb-page' }, h('style', null, CSS), h('h2', { className: 'dsh-lb-title' }, 'Library'), h('p', { className: 'dsh-lb-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }

      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await call(body);
          if (!alive.current) return undefined;
          scanning.current = next.status?.scanning === true;
          setData(next);
          setNote({ text: done, error: false });
          return next;
        } catch (error) {
          if (alive.current) setNote({ text: error.message, error: true });
          return undefined;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const add = async (folderPath) => {
        const text = String(folderPath ?? '').trim();
        if (!text) return;
        if (await act({ action: 'add', path: text }, 'Added. Its documents are being read now.')) setPath('');
      };
      const choose = async () => {
        try {
          const picked = await chooseFolder(appCtx);
          if (picked) await add(picked);
        } catch (error) {
          if (alive.current) setNote({ text: `The folder chooser could not be opened (${error.message}). Type the folder's path instead.`, error: true });
        }
      };
      const remove = (folder) => {
        if (!window.confirm(`Take "${folder.path}" out of the Library?\n\nThe folder and its files are not touched. Only the index of it is removed.`)) return;
        void act({ action: 'remove', path: folder.path }, 'Removed from the Library. The folder itself was not touched.');
      };
      const search = async () => {
        if (!query.trim()) return;
        const next = await act({ action: 'search', query }, '');
        if (next && alive.current) setFound(next.found ?? { hits: [], loose: false });
      };
      const save = async (values) => {
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, ...values }));
          setNote({ text: 'Saved.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };

      const status = data.status ?? {};
      const folders = Array.isArray(data.folders) ? data.folders : [];
      const problems = Array.isArray(data.problems) ? data.problems : [];
      const total = folders.reduce((sum, folder) => sum + folder.ok, 0);

      return h('div', { className: 'dsh-lb-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-lb-title' }, 'Library'),
        h('p', { className: 'dsh-lb-desc' }, 'Folders of your own documents that the assistant may search: readings, papers, notes, slides. It quotes them with the file and the page, so you can check. The documents are read on this Mac and nothing is sent anywhere to do it.'),
        note.text ? h('p', { className: 'dsh-lb-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.enabled === false ? h('p', { className: 'dsh-lb-desc', 'data-error': 'true' }, 'The Library is switched off, so the assistant cannot search it.') : null,

        h('div', { className: 'dsh-lb-group' }, 'Folders'),
        folders.length === 0 ? h('p', { className: 'dsh-lb-desc' }, 'No folder yet. Add one below, for example a course folder or your notes.') : null,
        folders.map((folder) => {
          const line = folderLine(folder);
          return h('div', { key: folder.path, className: 'dsh-lb-row' },
            h('div', { className: 'dsh-lb-rowtext' },
              h('div', { className: 'dsh-lb-rowtitle' }, folder.path),
              h('div', { className: 'dsh-lb-rowdesc', 'data-error': String(line.error) }, line.text)),
            h('button', { type: 'button', className: 'dsh-lb-btn', disabled: busy, onClick: () => remove(folder) }, 'Remove'));
        }),
        h('div', { className: 'dsh-lb-add' },
          h('input', {
            className: 'dsh-lb-field', value: path, placeholder: 'A folder, for example ~/Documents/Economics', 'aria-label': 'Folder to add', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off',
            onChange: (event) => setPath(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') void add(path); },
          }),
          h('button', { type: 'button', className: 'dsh-lb-btn', disabled: busy || !path.trim(), onClick: () => add(path) }, 'Add'),
          h('button', { type: 'button', className: 'dsh-lb-btn', disabled: busy, onClick: choose }, 'Choose…')),
        h('div', { className: 'dsh-lb-row' },
          h('div', { className: 'dsh-lb-rowtext' },
            h('div', { className: 'dsh-lb-rowtitle' }, status.scanning ? `Reading documents: ${num(status.done)} of ${num(status.total)}` : `${plural(total, 'document', 'documents')} ready to search`),
            h('div', { className: 'dsh-lb-rowdesc' }, status.scanning ? (status.current || 'Looking through the folders…') : status.lastAt ? `Folders last checked ${when(status.lastAt)}. New and changed files are picked up by themselves.` : 'Folders have not been checked yet.')),
          h('button', { type: 'button', className: 'dsh-lb-btn', disabled: busy || status.scanning || folders.length === 0, onClick: () => act({ action: 'scan' }, 'Checking the folders now.') }, 'Check now')),

        h('div', { className: 'dsh-lb-group' }, 'Try a search'),
        h('div', { className: 'dsh-lb-add' },
          h('input', {
            className: 'dsh-lb-field', value: query, placeholder: 'A few words, as the assistant would search', 'aria-label': 'Search the Library',
            onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') void search(); },
          }),
          h('button', { type: 'button', className: 'dsh-lb-btn', disabled: busy || !query.trim(), onClick: search }, 'Search')),
        found ? (found.hits.length === 0
          ? h('p', { className: 'dsh-lb-desc' }, 'Nothing matches those words.')
          : h('div', null,
            found.loose ? h('p', { className: 'dsh-lb-desc' }, 'No passage has all of those words together. These have some of them:') : null,
            found.hits.map((hit, index) => h('div', { key: `${hit.path}-${hit.position}-${index}`, className: 'dsh-lb-hit' },
              h('div', { className: 'dsh-lb-hitname', title: hit.path }, `${hit.name}, ${hit.where}`),
              h('div', { className: 'dsh-lb-hittext' }, hit.text))))) : null,

        problems.length > 0 ? h('div', { className: 'dsh-lb-group' }, 'Could not be searched') : null,
        problems.length > 0 ? h('ul', { className: 'dsh-lb-list' }, problems.slice(0, 12).map((problem) => h('li', { key: problem.path }, `${problem.path}: ${problem.state === 'empty' ? 'no words found, probably a scan' : problem.note}`))) : null,
        problems.length > 12 ? h('p', { className: 'dsh-lb-desc' }, `…and ${problems.length - 12} more.`) : null,

        h('div', { className: 'dsh-lb-group' }, 'Settings'),
        h('div', { className: 'dsh-lb-row' },
          h('div', { className: 'dsh-lb-rowtext' }, h('div', { className: 'dsh-lb-rowtitle' }, 'Use the Library'), h('div', { className: 'dsh-lb-rowdesc' }, 'Off takes the search away from the assistant and stops the reading. What was read is kept.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-lb-switch', 'aria-checked': data.enabled !== false, 'aria-label': 'Use the Library', onClick: () => save({ enabled: data.enabled === false }) })),

        h('div', { className: 'dsh-lb-group' }, 'Good to know'),
        h('ul', { className: 'dsh-lb-list' },
          h('li', null, 'It reads plain text, Markdown, PDF, Word (.docx, .doc), RTF, OpenDocument, web pages saved as files, and PowerPoint (.pptx).'),
          h('li', null, 'A scanned PDF with no text layer has no words to search. Ask the assistant to read such a file with the PDF reader, which can recognise the text.'),
          h('li', null, 'Search goes by words, not meaning. "Cars" finds "car", but not "automobile" unless the assistant tries that word too, which it is told to do.'),
          h('li', null, 'The index is a file in the app\'s data folder and holds the text of your documents. Text reaches a model only as the passages a search returns.'),
          h('li', null, 'The assistant can use the Library in tabs where tools are on (Cowork and Code).')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'library', order: 21, label: () => t('section.title') }, (props) => h(LibraryPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
