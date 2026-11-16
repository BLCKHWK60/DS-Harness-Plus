/**
 * Content, browser half: the Settings > Content page, with the switch for the Content tab, how to use
 * it, and what it can and cannot do. The work itself is in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-content',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'content';
    const DICT = { en: { 'section.title': 'Content' }, zh: { 'section.title': '内容' } };

    const CSS = `
.dsh-ct-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ct-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ct-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ct-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ct-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ct-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ct-rowtext { flex: 1; min-width: 0; }
.dsh-ct-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-ct-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ct-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ct-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ct-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-ct-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ct-switch:disabled { opacity: .5; cursor: default; }
.dsh-ct-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ct-code { font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
`;

    async function call() {
      const response = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
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

    function ContentPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
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

      if (!data) {
        return h('div', { className: 'dsh-ct-page' }, h('style', null, CSS), h('h2', { className: 'dsh-ct-title' }, 'Content'), h('p', { className: 'dsh-ct-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? 'Switched on. The Content tab appears in the sidebar in a moment.' : 'Switched off. The Content tab is taken away in a moment. Files it saved stay where they are.', error: false });
          setTimeout(() => { if (alive.current) void load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const readers = Array.isArray(data.readers) ? data.readers : [];
      const missing = readers.filter((reader) => reader.there === false);

      return h('div', { className: 'dsh-ct-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ct-title' }, 'Content'),
        h('p', { className: 'dsh-ct-desc' }, 'A tab, beside Chat, Cowork and Code, for writing from your material: books and chapters, articles, blog posts, scripts, and outlines for podcasts and videos. It keeps the material and every draft in one folder, and keeps apart what a source says, what you said, and its own wording.'),
        note.text ? h('p', { className: 'dsh-ct-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-ct-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-ct-group' }, 'The tab'),
        h('div', { className: 'dsh-ct-row' },
          h('div', { className: 'dsh-ct-rowtext' },
            h('div', { className: 'dsh-ct-rowtitle' }, 'Show the Content tab'),
            h('div', { className: 'dsh-ct-rowdesc' }, 'On adds the tab, its instructions and its five tools. Off takes them away. Files it saved stay where they are.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-ct-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Content tab', disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dsh-ct-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, 'Open the Content tab. To work from material you already have, pick the folder that holds it on the start page, as in Cowork. That folder becomes the subject folder. Without a folder, the conversation starts in Scratch and its folder is private to it.'),
          h('li', null, 'The assistant first reports what the folder holds and which files it can read, then asks what to build: the kind of piece, who it is for and how long.'),
          h('li', null, 'Bring in other conversations, from any tab and from Content itself: mention them with @ in your message (three per message; send more in the next one) and say "bring these in". Each is copied, whole, into research/conversations as material. Recon conversations are sealed and are never copied.'),
          h('li', null, 'Drafts are saved in drafts/ with a number: 001, 002, … A new version never replaces an old one, so you can always go back. Your own notes go in notes/, titles and descriptions in publish/.'),
          h('li', null, 'Web, Depth, Long run and the Run button work as in every tab. With Web on, the assistant may look up a source for a missing fact and says what it added. A Long run suits a long piece, such as a whole book, chapter by chapter.')),

        h('div', { className: 'dsh-ct-group' }, 'The subject folder'),
        h('ul', { className: 'dsh-ct-list' },
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'research/'), ' material that came in: other conversations, copied sources. Only ever added to.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'notes/'), ' your own words: notes, transcripts, answers to the assistant\'s questions.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'drafts/'), ' every draft, numbered.'),
          h('li', null, h('span', { className: 'dsh-ct-code' }, 'publish/'), ' titles, descriptions, show notes.'),
          h('li', null, 'Everything else in the folder is yours. Content\'s tools write only into the four parts above and never replace a file.')),

        h('div', { className: 'dsh-ct-group' }, 'Good to know'),
        h('ul', { className: 'dsh-ct-list' },
          missing.length > 0 ? h('li', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `Not running: ${missing.map((reader) => `the ${reader.addOn} add-on (${reader.tool})`).join(' and ')}. Without it the assistant cannot read ${missing.some((reader) => reader.tool === 'pdf_read') ? 'PDFs' : ''}${missing.length === 2 ? ' or ' : ''}${missing.some((reader) => reader.tool === 'data_text') ? 'Word documents and spreadsheets' : ''}. Switch it on under Plugins or its own Settings page.`) : null,
          data.history === false ? h('li', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, 'The app\'s conversation history is not available, so conversations cannot be brought in.') : null,
          h('li', null, 'A Content conversation runs Read Only, as Research and Data do: the app\'s own file and command tools ask you before they change anything. Content\'s own tools save drafts and material without asking, but only into its own parts of the folder. A Long run switches the conversation to Workspace Write while it works, and puts Read Only back when it ends.'),
          h('li', null, 'Content publishes nothing. Posting, sending and uploading are for you.'),
          h('li', null, 'What the assistant reads (your files, other conversations) goes to your model like any message. With Web on, its searches go to the app\'s web search provider.'),
          h('li', null, 'A conversation brought in is a copy taken at that moment: later messages in it are not in the copy. Only your words and the assistant\'s answers are copied, not tool results. A very long conversation keeps its newest part, and the file says how many messages were left out.'),
          h('li', null, 'In a Scratch conversation, the drafts are in that conversation\'s own folder and go when it is deleted for good. Start in a folder of your own to keep them.'),
          h('li', null, 'Still to come: the claims ledger, approval of a final piece, the sources page, format cards, and "Continue in Content" from a Research report.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'content', order: 115, label: () => t('section.title') }, (props) => h(ContentPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
