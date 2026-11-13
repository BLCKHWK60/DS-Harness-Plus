/**
 * Diagram builder, browser half: shows a drawn diagram in the chat, where the
 * model drew it, and holds the settings page.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-diagram',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'diagram';
    const DICT = { en: { 'section.title': 'Diagrams' }, zh: { 'section.title': '图表' } };

    const CSS = `
.dsh-dg-card { margin: 6px 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; max-width: 100%; }
.dsh-dg-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.dsh-dg-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-dg-warn { color: var(--dsw-alias-state-warn-primary); white-space: nowrap; }
.dsh-dg-pic { display: block; padding: 4px 12px 12px; overflow-x: auto; }
.dsh-dg-pic img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.dsh-dg-pic[data-big="true"] img { max-width: none; }
.dsh-dg-foot { padding: 0 12px 10px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-dg-btn {
  height: 24px; padding: 0 8px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap;
}
.dsh-dg-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-dg-text { margin: 0; padding: 0 12px 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-dg-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-dg-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-dg-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-dg-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-dg-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-dg-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-dg-rowtext { flex: 1; min-width: 0; }
.dsh-dg-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-dg-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-dg-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-dg-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-dg-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-dg-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-dg-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-dg-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0; width: 220px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-dg-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-dg-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    /** Is the app showing a dark background right now? */
    function isDark() {
      try {
        const color = getComputedStyle(document.body).backgroundColor || '';
        const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0)) return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2] < 128;
      } catch {
        // Fall through to the system setting.
      }
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
    }

    /** All text inside a tool call's data, wherever the app keeps it. */
    function textOf(value, depth = 0) {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object' || depth > 6) return '';
      if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).join('\n');
      return Object.values(value).map((item) => textOf(item, depth + 1)).join('\n');
    }

    /** The picture of one drawing, fetched once and shown as an image (an image cannot run scripts). */
    function Picture({ id }) {
      const [state, setState] = useState({ url: '', failed: false });
      const [big, setBig] = useState(false);
      useEffect(() => {
        let url = '';
        let alive = true;
        fetch(new URL('dsh-diagram/svg', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-diagram': id, 'x-dsh-theme': isDark() ? 'dark' : 'light' } })
          .then((response) => (response.ok ? response.blob() : Promise.reject(new Error('gone'))))
          .then((blob) => {
            if (!alive) return;
            // Shown as an image, so nothing inside it can run. Charts from other add-ons may be PNG or JPEG.
            url = URL.createObjectURL(new Blob([blob], { type: /^image\/(png|jpeg)/.test(blob.type) ? blob.type : 'image/svg+xml' }));
            setState({ url, failed: false });
          })
          .catch(() => alive && setState({ url: '', failed: true }));
        return () => {
          alive = false;
          if (url) URL.revokeObjectURL(url);
        };
      }, [id]);
      if (state.failed) return h('div', { className: 'dsh-dg-foot' }, 'The picture is no longer available here. If it was saved, open the file.');
      if (!state.url) return h('div', { className: 'dsh-dg-foot' }, 'Loading the picture…');
      return h('div', { className: 'dsh-dg-pic', 'data-big': String(big), onClick: () => setBig(!big), title: big ? 'Click to fit' : 'Click for full size' }, h('img', { src: state.url, alt: 'Diagram' }));
    }

    /** The row the chat shows for a `diagram_draw` call. */
    function DiagramRow(props) {
      const text = textOf(props.block ?? props.call ?? props);
      const id = /Diagram id: ([0-9a-f]{12})/.exec(text)?.[1];
      const title = /Drawn: (.+?) \((?:flow|tree|sequence|timeline|chart), \d+ × \d+\)/.exec(text)?.[1];
      const file = /Saved as: (.+)/.exec(text)?.[1]?.trim();
      const problems = Number(/Problems to fix \((\d+)\)/.exec(text)?.[1] ?? 0);
      const refused = /Nothing was drawn\.[\s\S]*?(?=$)/.exec(text)?.[0];
      const waiting = !id && !refused && (props.phase === 'preparing' || props.phase === 'running' || !/switched off|could not be drawn/.test(text));
      return h(
        'div',
        { className: 'dsh-dg-card', 'data-tool': 'diagram_draw' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-dg-head' },
          h('span', { className: 'dsh-dg-name' }, id ? title || 'Diagram' : waiting ? 'Drawing a diagram…' : 'Diagram not drawn'),
          problems > 0 ? h('span', { className: 'dsh-dg-warn', title: 'The model was told what to fix' }, `${problems} thing${problems === 1 ? '' : 's'} to fix`) : null,
          file ? h('button', { type: 'button', className: 'dsh-dg-btn', title: file, onClick: () => navigator.clipboard?.writeText(file).catch(() => {}) }, 'Copy file path') : null,
        ),
        id ? h(Picture, { id }) : null,
        file ? h('div', { className: 'dsh-dg-foot' }, file) : null,
        !id && !waiting ? h('pre', { className: 'dsh-dg-text' }, (refused ?? text).slice(0, 900)) : null,
      );
    }

    /** Turn -> its drawings, so scrolling back and forth does not ask the server again. */
    const turnCache = new Map();

    /**
     * Under a finished turn: the diagrams drawn in it. The app folds a turn's tool steps away
     * once the turn is done, so without this a diagram would be hidden behind "Completed".
     */
    function TurnDiagrams({ sessionId, turn }) {
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const key = `${sessionId}|${from}|${to}`;
      const [items, setItems] = useState(turnCache.get(key) ?? null);
      useEffect(() => {
        if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
        if (turnCache.has(key)) {
          setItems(turnCache.get(key));
          return undefined;
        }
        let alive = true;
        fetch(new URL('dsh-diagram/list', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-session': sessionId, 'x-dsh-from': String(from), 'x-dsh-to': String(to) } })
          .then((response) => (response.ok ? response.json() : { items: [] }))
          .then((data) => {
            const list = Array.isArray(data.items) ? data.items : [];
            turnCache.set(key, list);
            if (turnCache.size > 400) turnCache.delete(turnCache.keys().next().value);
            if (alive) setItems(list);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [key]);
      if (!items || items.length === 0) return null;
      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        items.map((item) =>
          h(
            'div',
            { className: 'dsh-dg-card', key: item.id },
            h(
              'div',
              { className: 'dsh-dg-head' },
              h('span', { className: 'dsh-dg-name' }, item.title || 'Diagram'),
              item.problems > 0 ? h('span', { className: 'dsh-dg-warn', title: 'The check found something the model did not fix' }, `${item.problems} thing${item.problems === 1 ? '' : 's'} not fixed`) : null,
              item.file ? h('button', { type: 'button', className: 'dsh-dg-btn', title: item.file, onClick: () => navigator.clipboard?.writeText(item.file).catch(() => {}) }, 'Copy file path') : null,
            ),
            h(Picture, { id: item.id }),
            item.file ? h('div', { className: 'dsh-dg-foot' }, item.file) : null,
          ),
        ),
      );
    }

    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw new Error('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-dg-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, children }) {
      return h('div', { className: 'dsh-dg-row' }, h('div', { className: 'dsh-dg-rowtext' }, h('div', { className: 'dsh-dg-rowtitle' }, title), hint ? h('div', { className: 'dsh-dg-rowdesc' }, hint) : null), children);
    }

    /** A text field that saves when you leave it or press Enter. */
    function NameField({ value, label, onCommit }) {
      const [draft, setDraft] = useState(value);
      useEffect(() => setDraft(value), [value]);
      const commit = () => {
        const next = draft.trim();
        if (next && next !== value) onCommit(next);
        else setDraft(value);
      };
      return h('input', { className: 'dsh-dg-field', value: draft, 'aria-label': label, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => event.key === 'Enter' && commit() });
    }

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, error: true }));
        return () => {
          alive.current = false;
        };
      }, [appCtx]);
      if (!settings) {
        return h('div', { className: 'dsh-dg-page' }, h('style', null, CSS), h('h2', { className: 'dsh-dg-title' }, 'Diagrams'), h('p', { className: 'dsh-dg-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const value = settings.value;
      const set = async (field, next) => {
        try {
          const saved = await mutateSettings(appCtx, [{ op: 'set', path: [field], value: next }], settings.revision);
          if (!alive.current) return;
          setSettings(saved);
          setNote({ text: 'Saved.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };
      return h(
        'div',
        { className: 'dsh-dg-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-dg-title' }, 'Diagrams'),
        h('p', { className: 'dsh-dg-desc' }, 'Lets the model draw accurate diagrams. The model only describes what is in the diagram; the layout, the drawing and a check for overlaps are done for it. The picture appears in the chat where it was drawn. Nothing is installed and nothing leaves this Mac.'),
        note.text ? h('p', { className: 'dsh-dg-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-dg-group' }, 'What it can draw'),
        h(
          'ul',
          { className: 'dsh-dg-list' },
          h('li', null, 'Flowcharts and concept maps: boxes joined by labelled arrows, with groups and decisions.'),
          h('li', null, 'Trees and mind maps: one root that branches out.'),
          h('li', null, 'Sequences: who tells whom what, in order. Timelines: events in order.'),
          h('li', null, 'Charts: bars and lines over names, points and lines over numbers, and plots of formulas such as x^2 - 3.'),
        ),
        h('p', { className: 'dsh-dg-desc' }, 'Ask for one in plain words, for example "Draw a flowchart of how a bill becomes law" or "Plot sin(x) and cos(x) from 0 to 2 pi".'),

        h('div', { className: 'dsh-dg-group' }, 'Settings'),
        h(Row, { title: 'Use the diagram builder', hint: 'Off makes the tool answer that it is switched off.' }, h(Switch, { checked: value.enabled !== false, label: 'Use the diagram builder', onChange: (next) => set('enabled', next) })),
        h(Row, { title: 'Save each diagram as a file', hint: 'As an SVG picture in the conversation\'s folder. Off shows it in the chat only.' }, h(Switch, { checked: value.save !== false, label: 'Save each diagram as a file', onChange: (next) => set('save', next) })),
        h(Row, { title: 'Folder name', hint: 'The folder inside the conversation\'s folder that pictures are saved in.' }, h(NameField, { value: typeof value.folder === 'string' && value.folder ? value.folder : 'diagrams', label: 'Folder name', onCommit: (next) => set('folder', next) })),
        h(
          Row,
          { title: 'Colours of the saved file', hint: 'Automatic follows light or dark mode of whatever shows the file. The picture in the chat always matches the app.' },
          h('select', { className: 'dsh-dg-field', value: value.theme ?? 'auto', 'aria-label': 'Colours of the saved file', onChange: (event) => set('theme', event.target.value) }, h('option', { value: 'auto' }, 'Automatic'), h('option', { value: 'light' }, 'Light'), h('option', { value: 'dark' }, 'Dark')),
        ),

        h('div', { className: 'dsh-dg-group' }, 'Good to know'),
        h(
          'ul',
          { className: 'dsh-dg-list' },
          h('li', null, 'A diagram is only as right as what the model put in it. The drawing is exact; the content still needs your eye.'),
          h('li', null, 'If the check finds overlaps or crossings, the model is told and usually draws it again. A small note on the picture says how many things it was told to fix.'),
          h('li', null, 'Click a picture in the chat to see it at full size.'),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('diagram', DICT));
        const t = ctx.locale.bind('diagram');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'diagram', order: 23, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx }))),
        );
        // Under each finished turn: the diagrams drawn in it.
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-diagram' }, (props) => h(TurnDiagrams, props))));
        // The chat's own row for a diagram_draw call: the picture, not a line of text.
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'diagram_draw' }, DiagramRow)));
      },
    };
  },
});
