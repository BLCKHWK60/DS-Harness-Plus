/**
 * PDF reader, browser half: the settings page. The reading itself happens in the
 * server half; this page only chooses where PDFs may be read from.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-pdf',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'pdf';
    const DICT = { en: { 'section.title': 'PDF reader' }, zh: { 'section.title': 'PDF 阅读' } };

    const CSS = `
.dsh-pd-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-pd-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-pd-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-pd-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-pd-desc[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-pd-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-pd-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-pd-row[data-stack="true"] { flex-direction: column; align-items: stretch; gap: 10px; }
.dsh-pd-rowtext { flex: 1; min-width: 0; }
.dsh-pd-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-pd-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-pd-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-pd-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-pd-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-pd-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-pd-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-pd-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-pd-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-pd-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
select.dsh-pd-field { max-width: 260px; }
textarea.dsh-pd-field { width: 100%; height: auto; min-height: 72px; padding: 9px 14px; line-height: 20px; resize: vertical; font-family: inherit; }
.dsh-pd-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-pd-list code { font-size: 12px; color: var(--dsw-alias-label-primary); }
`;

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
      return h('button', { type: 'button', role: 'switch', className: 'dsh-pd-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, stack, children }) {
      return h(
        'div',
        { className: 'dsh-pd-row', 'data-stack': String(Boolean(stack)) },
        h('div', { className: 'dsh-pd-rowtext' }, h('div', { className: 'dsh-pd-rowtitle' }, title), hint ? h('div', { className: 'dsh-pd-rowdesc' }, hint) : null),
        children,
      );
    }

    /** One folder per line; saved when you leave the box. */
    function FoldersField({ value, onCommit }) {
      const shown = (value ?? []).join('\n');
      const [draft, setDraft] = useState(shown);
      useEffect(() => setDraft(shown), [shown]);
      const commit = () => {
        const next = draft.split('\n').map((line) => line.trim()).filter(Boolean);
        if (next.join('\n') !== shown) onCommit(next);
      };
      return h('textarea', { className: 'dsh-pd-field', value: draft, rows: 3, placeholder: 'One folder per line, for example ~/Documents/Papers', 'aria-label': 'Folders', onChange: (event) => setDraft(event.target.value), onBlur: commit });
    }

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [status, setStatus] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, error: true }));
        fetch(new URL('dsh-pdf/status', document.baseURI), { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => alive.current && setStatus(data))
          .catch(() => {});
        return () => {
          alive.current = false;
        };
      }, [appCtx]);

      if (!settings) {
        return h('div', { className: 'dsh-pd-page' }, h('style', null, CSS), h('h2', { className: 'dsh-pd-title' }, 'PDF reader'), h('p', { className: 'dsh-pd-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
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
        { className: 'dsh-pd-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-pd-title' }, 'PDF reader'),
        h('p', { className: 'dsh-pd-desc' }, 'Lets the model read PDF files properly: text with page numbers, search, tables kept in columns, pages as pictures, and text recognition for scans. It uses what comes with macOS, so nothing is installed and nothing leaves this Mac.'),
        status && status.mac === false ? h('p', { className: 'dsh-pd-desc', 'data-warn': 'true' }, 'This is not a Mac, so the PDF tools cannot work here.') : null,
        note.text ? h('p', { className: 'dsh-pd-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-pd-group' }, 'How to use it'),
        h(
          'ul',
          { className: 'dsh-pd-list' },
          h('li', null, 'Put a PDF in the conversation\'s folder and ask about it by name, for example "Summarise report.pdf with page numbers".'),
          h('li', null, 'Type ', h('code', null, '/pdf report.pdf'), ' to see its page count, contents list and which pages are scans.'),
          h('li', null, 'The model has five tools: pdf_info, pdf_read, pdf_search, pdf_page_image and pdf_ocr, and a skill named read-pdf that makes it give a page for every claim.'),
        ),

        h('div', { className: 'dsh-pd-group' }, 'Settings'),
        h(Row, { title: 'Use the PDF reader', hint: 'Off makes the tools answer that they are switched off.' }, h(Switch, { checked: value.enabled !== false, label: 'Use the PDF reader', onChange: (next) => set('enabled', next) })),
        h(
          Row,
          { title: 'More folders the model may read PDFs from', hint: 'PDFs in the conversation\'s own folder can always be read. List other folders here, one per line. Sub-folders are included.', stack: true },
          h(FoldersField, { value: Array.isArray(value.folders) ? value.folders : [], onCommit: (next) => set('folders', next) }),
        ),
        h(Row, { title: 'Allow any PDF on this Mac', hint: 'Off (recommended) keeps the model to the folders above. On lets it open a PDF at any path you or a document mention.' }, h(Switch, { checked: value.anywhere === true, label: 'Allow any PDF on this Mac', onChange: (next) => set('anywhere', next) })),
        h(
          Row,
          { title: 'How much text one read returns', hint: 'A long range of pages stops at this size and says where to continue. Smaller suits models with a small context.' },
          h(
            'select',
            { className: 'dsh-pd-field', value: String(value.readChars ?? 30000), 'aria-label': 'How much text one read returns', onChange: (event) => set('readChars', Number(event.target.value)) },
            [[12000, 'Small (about 3,000 tokens)'], [30000, 'Normal (about 7,500 tokens)'], [60000, 'Large (about 15,000 tokens)'], [120000, 'Very large (about 30,000 tokens)']].map(([chars, label]) => h('option', { key: chars, value: String(chars) }, label)),
          ),
        ),

        h('div', { className: 'dsh-pd-group' }, 'Good to know'),
        h(
          'ul',
          { className: 'dsh-pd-list' },
          h('li', null, 'Complex tables and maths formulas can come out wrong as text. For those the model can look at the page as a picture, if it is a model that can see images.'),
          h('li', null, 'The text of a PDF is kept in memory only while the app runs. Page pictures are saved in the app\'s data folder and removed after a day.'),
          h('li', null, 'Password-protected PDFs cannot be read.'),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('pdf', DICT));
        const t = ctx.locale.bind('pdf');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'pdf', order: 22, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
