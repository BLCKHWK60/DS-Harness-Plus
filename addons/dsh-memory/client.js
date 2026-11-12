/**
 * Memory, browser half: the Settings > Memory page, and a small card under an answer when the
 * assistant suggested something to remember. The list itself is kept by the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-memory',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'memory';
    const DICT = { en: { 'section.title': 'Memory' }, zh: { 'section.title': '记忆' } };
    const GROUPS = [
      ['about', 'About me'],
      ['style', 'How I like answers'],
      ['projects', 'Current projects'],
      ['other', 'Other'],
    ];

    const CSS = `
.dsh-mm-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-mm-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-mm-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-mm-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-mm-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-mm-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-mm-rowtext { flex: 1; min-width: 0; }
.dsh-mm-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-mm-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-mm-rowdesc[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-mm-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-mm-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-mm-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-mm-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-mm-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-mm-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-mm-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
input.dsh-mm-field { flex: 1; }
.dsh-mm-add { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0 8px; }
.dsh-mm-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-mm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mm-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-mm-btn:disabled { opacity: .5; cursor: default; }
.dsh-mm-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-mm-card {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 8px 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-primary); border: 0.5px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
}
.dsh-mm-cardtext { flex: 1; min-width: 180px; overflow-wrap: anywhere; }
.dsh-mm-cardtext b { font-weight: 500; }
`;

    const dataUrl = () => new URL('dsh-memory/data', document.baseURI);

    async function call(body) {
      const response = await fetch(dataUrl(), body
        ? { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error ?? `error ${response.status}`));
      return data;
    }

    // One read shared by every card on the page, refreshed at most every few seconds.
    let shared = { at: 0, promise: null };
    function readShared() {
      if (!shared.promise || Date.now() - shared.at > 4000) shared = { at: Date.now(), promise: call().catch(() => ({ suggestions: [] })) };
      return shared.promise;
    }

    async function loadSettings(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function setSetting(ctx, field, value) {
      const ops = [{ op: 'set', path: [field], value }];
      let result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-mm-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Button({ main, children, ...rest }) {
      return h('button', { type: 'button', className: 'dsh-mm-btn', 'data-main': String(Boolean(main)), ...rest }, children);
    }

    function GroupSelect({ value, onChange, label }) {
      return h('select', { className: 'dsh-mm-field', value, 'aria-label': label, onChange: (event) => onChange(event.target.value) },
        GROUPS.map(([id, name]) => h('option', { key: id, value: id }, name)));
    }

    function Entry({ entry, onAct }) {
      const [editing, setEditing] = useState(false);
      const [text, setText] = useState(entry.text);
      const [group, setGroup] = useState(entry.group);
      if (editing) {
        return h('div', { className: 'dsh-mm-row' },
          h('input', { className: 'dsh-mm-field', value: text, maxLength: 300, 'aria-label': 'Entry', onChange: (event) => setText(event.target.value) }),
          h(GroupSelect, { value: group, onChange: setGroup, label: 'Group' }),
          h(Button, { main: true, onClick: () => onAct({ action: 'edit', id: entry.id, text, group }).then((ok) => ok && setEditing(false)) }, 'Save'),
          h(Button, { onClick: () => { setText(entry.text); setGroup(entry.group); setEditing(false); } }, 'Cancel'));
      }
      const saved = new Date(entry.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      return h('div', { className: 'dsh-mm-row' },
        h('div', { className: 'dsh-mm-rowtext' },
          h('div', { className: 'dsh-mm-rowtitle' }, entry.text),
          h('div', { className: 'dsh-mm-rowdesc', 'data-warn': String(entry.stale) }, entry.stale ? `Saved ${saved}. Is this still true?` : `Saved ${saved}`)),
        entry.stale ? h(Button, { onClick: () => onAct({ action: 'keep', id: entry.id }) }, 'Still true') : null,
        h(Button, { onClick: () => setEditing(true) }, 'Edit'),
        h(Button, { onClick: () => onAct({ action: 'remove', id: entry.id }) }, 'Delete'));
    }

    function MemoryPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [draft, setDraft] = useState('');
      const [group, setGroup] = useState('about');
      const alive = useRef(true);

      const load = () => call()
        .then((next) => alive.current && setData(next))
        .catch((error) => alive.current && setNote({ text: `Could not load the memory: ${error.message}`, error: true }));
      useEffect(() => {
        alive.current = true;
        load();
        return () => { alive.current = false; };
      }, []);

      const act = async (body, done) => {
        try {
          const next = await call(body);
          shared = { at: 0, promise: null };
          if (!alive.current) return true;
          setData(next);
          setNote({ text: done ?? 'Saved.', error: false });
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: error.message, error: true });
          return false;
        }
      };
      const flip = async (field, value) => {
        try {
          await setSetting(appCtx, field, value);
          if (alive.current) setData((d) => (d ? { ...d, settings: { ...d.settings, [field]: value } } : d));
          setTimeout(load, 5500);
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };

      if (!data) {
        return h('div', { className: 'dsh-mm-page' }, h('style', null, CSS), h('h2', { className: 'dsh-mm-title' }, 'Memory'), h('p', { className: 'dsh-mm-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const entries = data.entries ?? [];
      const suggestions = data.suggestions ?? [];
      const on = data.settings?.enabled !== false;

      return h('div', { className: 'dsh-mm-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-mm-title' }, 'Memory'),
        h('p', { className: 'dsh-mm-desc' }, 'A short list of lasting things the assistant should know about you. It is given to every new conversation. Nothing is added unless you add it or say yes to a suggestion.'),
        note.text ? h('p', { className: 'dsh-mm-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        suggestions.length > 0 ? h(React.Fragment, null,
          h('div', { className: 'dsh-mm-group' }, `Suggested by the assistant (${suggestions.length})`),
          suggestions.map((s) => h('div', { className: 'dsh-mm-row', key: s.id },
            h('div', { className: 'dsh-mm-rowtext' }, h('div', { className: 'dsh-mm-rowtitle' }, s.text), h('div', { className: 'dsh-mm-rowdesc' }, (GROUPS.find(([id]) => id === s.group) ?? GROUPS[3])[1])),
            h(Button, { main: true, onClick: () => act({ action: 'accept', id: s.id }, 'Remembered.') }, 'Save'),
            h(Button, { onClick: () => act({ action: 'dismiss', id: s.id }, 'Dismissed.') }, 'No')))) : null,

        h('div', { className: 'dsh-mm-group' }, 'Add something'),
        h('div', { className: 'dsh-mm-add' },
          h('input', { className: 'dsh-mm-field', value: draft, maxLength: data.entryMax ?? 300, placeholder: 'For example: I am a student, not a programmer. Explain in plain words.', 'aria-label': 'What to remember',
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && draft.trim()) act({ action: 'add', text: draft, group }, 'Remembered.').then((ok) => ok && setDraft('')); } }),
          h(GroupSelect, { value: group, onChange: setGroup, label: 'Group' }),
          h(Button, { main: true, disabled: !draft.trim(), onClick: () => act({ action: 'add', text: draft, group }, 'Remembered.').then((ok) => ok && setDraft('')) }, 'Remember')),

        GROUPS.map(([id, name]) => {
          const mine = entries.filter((entry) => entry.group === id);
          if (mine.length === 0) return null;
          return h(React.Fragment, { key: id },
            h('div', { className: 'dsh-mm-group' }, name),
            mine.map((entry) => h(Entry, { key: entry.id + entry.text + entry.group, entry, onAct: (body) => act(body) })));
        }),
        entries.length === 0 ? h('p', { className: 'dsh-mm-desc' }, 'Nothing is remembered yet.') : h('p', { className: 'dsh-mm-desc' }, `${data.chars} of ${data.limit} characters used. Memory is kept short on purpose.`),

        h('div', { className: 'dsh-mm-group' }, 'Settings'),
        h('div', { className: 'dsh-mm-row' },
          h('div', { className: 'dsh-mm-rowtext' }, h('div', { className: 'dsh-mm-rowtitle' }, 'Use memory'), h('div', { className: 'dsh-mm-rowdesc' }, 'Off keeps the list but leaves it out of new conversations.')),
          h(Switch, { checked: on, label: 'Use memory', onChange: (next) => flip('enabled', next) })),
        h('div', { className: 'dsh-mm-row' },
          h('div', { className: 'dsh-mm-rowtext' }, h('div', { className: 'dsh-mm-rowtitle' }, 'Let the assistant suggest entries'), h('div', { className: 'dsh-mm-rowdesc' }, 'It can only suggest. You decide each time.')),
          h(Switch, { checked: data.settings?.suggest !== false, label: 'Let the assistant suggest entries', onChange: (next) => flip('suggest', next) })),

        h('div', { className: 'dsh-mm-group' }, 'Good to know'),
        h('ul', { className: 'dsh-mm-list' },
          h('li', null, 'A change applies to conversations you start afterwards, not to ones already open.'),
          h('li', null, 'Good entries stay true for months: who you are, how you like answers, long projects. Deadlines and file locations go out of date; leave those out.'),
          h('li', null, 'Never put passwords or keys here. The list is sent to the model with every new conversation.'),
          h('li', null, 'Entries older than four months are marked "Is this still true?" so the list does not go stale.')));
    }

    /** Under a finished answer: what the assistant suggested remembering in that turn, with Save and No. */
    function TurnSuggestions({ sessionId, turn }) {
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const [items, setItems] = useState([]);
      const [done, setDone] = useState({});
      useEffect(() => {
        if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
        let alive = true;
        readShared().then((data) => {
          if (!alive) return;
          setItems((data.suggestions ?? []).filter((s) => s.sessionId === sessionId && s.at >= from - 1000 && s.at <= to + 5000));
        });
        return () => { alive = false; };
      }, [sessionId, from, to]);
      if (items.length === 0) return null;
      const decide = (id, action) => call({ action, id })
        .then(() => { shared = { at: 0, promise: null }; setDone((d) => ({ ...d, [id]: action === 'accept' ? 'Saved to memory.' : 'Not saved.' })); })
        .catch((error) => setDone((d) => ({ ...d, [id]: error.message })));
      return h(React.Fragment, null,
        h('style', null, CSS),
        items.map((s) => h('div', { className: 'dsh-mm-card', key: s.id },
          h('span', { className: 'dsh-mm-cardtext' }, h('b', null, 'Remember this? '), s.text),
          done[s.id]
            ? h('span', { className: 'dsh-mm-rowdesc', role: 'status' }, done[s.id])
            : h(React.Fragment, null,
              h(Button, { main: true, onClick: () => decide(s.id, 'accept') }, 'Save'),
              h(Button, { onClick: () => decide(s.id, 'dismiss') }, 'No')))));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'memory', order: 21, label: () => t('section.title') }, (props) => h(MemoryPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-memory' }, (props) => h(TurnSuggestions, props))));
      },
    };
  },
});
