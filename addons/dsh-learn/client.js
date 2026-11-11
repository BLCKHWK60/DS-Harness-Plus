/**
 * Learning, browser half: the study bar above the chat box and the progress
 * page in Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-learn',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'learn';
    const DICT = { en: { 'section.title': 'Learning' }, zh: { 'section.title': '学习' } };
    const LEVELS = [
      ['gentle', 'Gentle'],
      ['firm', 'Firm'],
      ['strict', 'Strict'],
    ];
    const OUTCOME = { alone: 'solved alone', hints: 'solved with hints', shown: 'answer shown' };
    const SOURCE = { pdf: 'PDF', notes: 'Notes', topic: 'Topic', code: 'Code' };

    const CSS = `
.dsh-ln-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 12px 8px; padding: 6px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.dsh-ln-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; color: var(--dsw-alias-label-primary); }
.dsh-ln-dots { display: inline-flex; gap: 4px; align-items: center; flex: none; }
.dsh-ln-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-ln-dot[data-on="done"] { background: var(--dsw-alias-state-success-primary); }
.dsh-ln-dot[data-on="now"] { background: var(--dsw-alias-brand-primary); }
.dsh-ln-stage { color: var(--dsw-alias-label-primary); font-weight: 500; white-space: nowrap; }
.dsh-ln-space { flex: 1; }
.dsh-ln-note { flex-basis: 100%; color: var(--dsw-alias-state-warn-primary); }
.dsh-ln-btn {
  height: 24px; padding: 0 9px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.dsh-ln-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ln-btn[disabled] { opacity: .45; cursor: default; }
.dsh-ln-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-ln-select { height: 24px; padding: 0 6px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dsh-ln-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ln-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ln-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ln-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ln-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.dsh-ln-stat { padding: 12px 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-ln-statvalue { font-size: 22px; line-height: 28px; }
.dsh-ln-line { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ln-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ln-rowtext { flex: 1; min-width: 0; }
.dsh-ln-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ln-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ln-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ln-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-ln-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ln-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ln-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0; max-width: 260px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-ln-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ln-card { padding: 12px 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.dsh-ln-cardhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-ln-cardtitle { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-ln-tag { flex: none; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 11px; line-height: 22px; white-space: nowrap; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-ln-idea { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-idea > span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }
.dsh-ln-strength { flex: none; letter-spacing: 1px; color: var(--dsw-alias-state-success-primary); }
.dsh-ln-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-list code { font-size: 12px; color: var(--dsw-alias-label-primary); }
@media (max-width: 720px) { .dsh-ln-stats { grid-template-columns: minmax(0, 1fr); } .dsh-ln-row { flex-wrap: wrap; } }
`;

    async function getJson(path, sessionId) {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: sessionId ? { 'x-dsh-session': sessionId } : {} });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response.json();
    }

    async function postAction(body, sessionId) {
      const response = await fetch(new URL('dsh-learn/action', document.baseURI), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-learn': '1', ...(sessionId ? { 'x-dsh-session': sessionId } : {}) },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `status ${response.status}`);
      return data;
    }

    /**
     * Send a chat message for the learner, as if they had typed it and pressed Enter.
     * Uses the chat box's own actions when the app hands them over, otherwise types into the box.
     * @param {object} props - what the app gave the study bar.
     * @param {string} text - the message.
     * @returns {boolean} true when it was sent.
     */
    function send(props, text) {
      try {
        const actions = props.inputActions;
        if (actions?.setDraft && actions?.submit) {
          actions.setDraft(text);
          setTimeout(() => {
            try {
              actions.submit();
            } catch {
              // The learner can still press Enter.
            }
          }, 60);
          return true;
        }
      } catch {
        // Fall through to typing into the box.
      }
      const box = document.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
      if (!box) return false;
      box.focus();
      document.execCommand('insertText', false, text);
      setTimeout(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })), 80);
      return true;
    }

    /** The slim bar above the chat box while a study session is on. */
    function StudyBar(props) {
      const { sessionId } = props;
      const [status, setStatus] = useState(null);
      const [note, setNote] = useState('');
      const alive = useRef(true);
      const load = () =>
        getJson('dsh-learn/status', sessionId)
          .then((data) => alive.current && setStatus(data))
          .catch(() => {});
      const active = Boolean(status?.session || status?.pending);
      useEffect(() => {
        alive.current = true;
        load();
        // While studying, the bar follows the tutor closely; otherwise it only looks now and then for a /learn.
        const timer = setInterval(load, active ? 1500 : 5000);
        const onKey = (event) => {
          if (event.key === 'Enter' && !event.shiftKey) setTimeout(load, 400);
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
          alive.current = false;
          clearInterval(timer);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [sessionId, active]);

      if (!status?.settings?.enabled || !active) return null;
      const act = async (body, message) => {
        setNote('');
        try {
          const next = await postAction(body, sessionId);
          if (!alive.current) return;
          setStatus((now) => ({ ...now, session: next.session, pending: next.pending }));
          if (message && !send(props, message)) setNote(`Type this to the tutor: ${message}`);
        } catch (error) {
          if (alive.current) setNote(error.message);
        }
      };
      const say = (message) => {
        setNote('');
        if (!send(props, message)) setNote(`Type this to the tutor: ${message}`);
        setTimeout(load, 600);
      };
      const levelSelect = (value) =>
        h('select', { className: 'dsh-ln-select', value, 'aria-label': 'Level', title: status.levels?.[value] ?? '', onChange: (event) => act({ action: 'level', value: event.target.value }) }, LEVELS.map(([id, label]) => h('option', { key: id, value: id }, label)));

      if (status.pending) {
        return h(
          'div',
          { className: 'dsh-ln-bar', role: 'region', 'aria-label': 'Study session' },
          h('style', null, CSS),
          h('span', { className: 'dsh-ln-what', title: status.pending.request }, `Ready to study: ${status.pending.request}`),
          h('span', { className: 'dsh-ln-space' }),
          levelSelect(status.pending.level),
          h('button', { type: 'button', className: 'dsh-ln-btn', 'data-main': 'true', onClick: () => say('Let’s start.') }, 'Start'),
          h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => act({ action: 'end' }) }, 'Cancel'),
          note ? h('span', { className: 'dsh-ln-note' }, note) : null,
        );
      }

      const session = status.session;
      const open = session.stage === 'ask' || session.stage === 'work';
      return h(
        'div',
        { className: 'dsh-ln-bar', role: 'region', 'aria-label': 'Study session' },
        h('style', null, CSS),
        h('span', { className: 'dsh-ln-what', title: `${session.title}: ${session.idea}` }, `${session.title} · ${session.idea}`),
        h(
          'span',
          { className: 'dsh-ln-dots', title: `Idea ${session.at + 1} of ${session.total}` },
          Array.from({ length: session.total }, (_, index) => h('span', { key: index, className: 'dsh-ln-dot', 'data-on': index < session.at ? 'done' : index === session.at ? 'now' : '' })),
        ),
        h('span', { className: 'dsh-ln-stage' }, session.label),
        h('span', { className: 'dsh-ln-space' }),
        levelSelect(session.level),
        open
          ? h('button', { type: 'button', className: 'dsh-ln-btn', disabled: !session.canHint.ok, title: session.canHint.ok ? `Hint ${session.hints + 1} of ${session.maxHints}` : session.canHint.why, onClick: () => say(session.level === 'strict' ? 'I’m stuck. Could I have a hint? Ask me where I am stuck if you need to.' : 'Could I have a hint?') }, 'Hint')
          : null,
        open
          ? h('button', { type: 'button', className: 'dsh-ln-btn', disabled: !session.canGiveUp.ok, title: session.canGiveUp.ok ? 'Giving up brings this idea back tomorrow' : session.canGiveUp.why, onClick: () => act({ action: 'giveup' }, 'I give up on this one. Please show me the answer.') }, 'Show answer')
          : null,
        h('button', { type: 'button', className: 'dsh-ln-btn', title: 'What you finished stays saved', onClick: () => act({ action: 'end' }) }, 'End'),
        note ? h('span', { className: 'dsh-ln-note' }, note) : null,
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
      return h('button', { type: 'button', role: 'switch', className: 'dsh-ln-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, children }) {
      return h('div', { className: 'dsh-ln-row' }, h('div', { className: 'dsh-ln-rowtext' }, h('div', { className: 'dsh-ln-rowtitle' }, title), hint ? h('div', { className: 'dsh-ln-rowdesc' }, hint) : null), children);
    }

    const strength = (step) => '●'.repeat(Math.max(0, step + 1)) + '○'.repeat(Math.max(0, 4 - step));

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [view, setView] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [confirming, setConfirming] = useState('');
      const alive = useRef(true);
      const refresh = () =>
        getJson('dsh-learn/overview')
          .then((data) => alive.current && setView(data))
          .catch((error) => alive.current && setNote({ text: `Could not load your progress: ${error.message}`, error: true }));

      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, error: true }));
        refresh();
        return () => {
          alive.current = false;
        };
      }, [appCtx]);

      if (!settings || !view) {
        return h('div', { className: 'dsh-ln-page' }, h('style', null, CSS), h('h2', { className: 'dsh-ln-title' }, 'Learning'), h('p', { className: 'dsh-ln-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const value = settings.value;
      const set = async (field, next) => {
        try {
          const saved = await mutateSettings(appCtx, [{ op: 'set', path: [field], value: next }], settings.revision);
          if (!alive.current) return;
          setSettings(saved);
          setNote({ text: 'Saved.', error: false });
          refresh();
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };
      const remove = async (id) => {
        try {
          const next = await postAction({ action: 'removeTopic', id });
          if (!alive.current) return;
          setView(next);
          setConfirming('');
          setNote({ text: 'Topic removed.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not remove it: ${error.message}`, error: true });
        }
      };
      const stats = view.stats;
      const pct = (n) => (stats.tries > 0 ? `${Math.round((n / stats.tries) * 100)}%` : '–');
      const level = value.level ?? 'firm';

      return h(
        'div',
        { className: 'dsh-ln-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ln-title' }, 'Learning'),
        h('p', { className: 'dsh-ln-desc' }, 'A tutor that makes you do the thinking. It asks before it explains, helps in small steps, gives the answer last, asks you to explain it back, and brings each idea back days later. Trying first is the part that makes it stick.'),
        note.text ? h('p', { className: 'dsh-ln-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-ln-group' }, 'Your progress'),
        h(
          'div',
          { className: 'dsh-ln-stats' },
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, String(view.due.length)), h('span', { className: 'dsh-ln-line' }, view.due.length === 1 ? 'idea due for review' : 'ideas due for review')),
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, stats.tries > 0 ? `${Math.round(((stats.alone + stats.hints) / stats.tries) * 100)}%` : '–'), h('span', { className: 'dsh-ln-line' }, stats.tries > 0 ? `solved without the answer (alone ${pct(stats.alone)}, with hints ${pct(stats.hints)})` : 'solved without the answer')),
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, String(stats.ideas)), h('span', { className: 'dsh-ln-line' }, `idea${stats.ideas === 1 ? '' : 's'} in ${stats.topics} topic${stats.topics === 1 ? '' : 's'}`)),
        ),

        h('div', { className: 'dsh-ln-group' }, 'Due for review'),
        view.due.length === 0
          ? h('p', { className: 'dsh-ln-desc', style: { margin: 0 } }, 'Nothing is due today.')
          : h(
              React.Fragment,
              null,
              view.due.slice(0, 12).map((item, index) => h('div', { className: 'dsh-ln-idea', key: index }, h('span', null, `${item.topic}: ${item.title}`), h('span', null, `due ${item.when}`))),
              view.due.length > 12 ? h('div', { className: 'dsh-ln-line' }, `and ${view.due.length - 12} more`) : null,
              h('p', { className: 'dsh-ln-desc' }, 'Type ', h('code', null, '/learn review'), ' in a conversation to go through them.'),
            ),

        h('div', { className: 'dsh-ln-group' }, 'How to use it'),
        h(
          'ul',
          { className: 'dsh-ln-list' },
          h('li', null, 'In any conversation type ', h('code', null, '/learn'), ' and what you want to learn: a topic ("how compound interest works"), a file ("chapter3.pdf"), or code ("the functions in parser.py").'),
          h('li', null, 'A study bar appears above the chat box. Press Start. The tutor first asks you a question; try it, even with a guess.'),
          h('li', null, 'Hint asks for a small step. Show answer unlocks when the level allows it. End stops; what you finished is saved.'),
          h('li', null, 'Use a strong model as the tutor. A tutor that teaches something wrong is worse than none, and studying from your own PDF or notes is safer than from the model\'s memory.'),
        ),

        h('div', { className: 'dsh-ln-group' }, 'Settings'),
        h(Row, { title: 'Use Learning', hint: 'Off removes the study bar and makes the tutor tools answer that they are switched off.' }, h(Switch, { checked: value.enabled !== false, label: 'Use Learning', onChange: (next) => set('enabled', next) })),
        h(
          Row,
          { title: 'Level for new sessions', hint: view.levels?.[level] ?? '' },
          h('select', { className: 'dsh-ln-field', value: level, 'aria-label': 'Level for new sessions', onChange: (event) => set('level', event.target.value) }, LEVELS.map(([id, label]) => h('option', { key: id, value: id }, label))),
        ),
        h(
          Row,
          { title: 'Ideas per review', hint: 'The most ideas one review session goes through.' },
          h('select', { className: 'dsh-ln-field', value: String(value.reviewSize ?? 10), 'aria-label': 'Ideas per review', onChange: (event) => set('reviewSize', Number(event.target.value)) }, [5, 10, 15, 20].map((n) => h('option', { key: n, value: String(n) }, String(n)))),
        ),

        h('div', { className: 'dsh-ln-group' }, `Topics (${view.topics.length})`),
        view.topics.length === 0 ? h('p', { className: 'dsh-ln-desc', style: { margin: 0 } }, 'Nothing studied yet.') : null,
        view.topics.map((topic) =>
          h(
            'div',
            { className: 'dsh-ln-card', key: topic.id },
            h(
              'div',
              { className: 'dsh-ln-cardhead' },
              h('span', { className: 'dsh-ln-cardtitle' }, topic.title),
              h('span', { className: 'dsh-ln-tag', title: topic.source?.ref || '' }, SOURCE[topic.source?.kind] ?? 'Topic'),
              confirming === topic.id
                ? h(React.Fragment, null, h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => remove(topic.id) }, 'Yes, remove'), h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => setConfirming('') }, 'Keep'))
                : h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => setConfirming(topic.id) }, 'Remove'),
            ),
            topic.ideas.map((idea, index) =>
              h(
                'div',
                { className: 'dsh-ln-idea', key: index },
                h('span', null, idea.title),
                h('span', null, idea.last ? `${OUTCOME[idea.last] ?? idea.last}${idea.when ? ` · back ${idea.when}` : ''}` : 'not finished yet'),
                h('span', { className: 'dsh-ln-strength', title: 'How far out its review has moved' }, strength(idea.step)),
              ),
            ),
          ),
        ),
        h('p', { className: 'dsh-ln-desc' }, 'The record holds the questions and how each try went. It is kept on this Mac and does not hold what you wrote.'),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('learn', DICT));
        const t = ctx.locale.bind('learn');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'learn', order: 24, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx }))),
        );
        // Above the chat box, under the activity indicator.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'learn', order: 8 }, (props) => h(StudyBar, props))));
      },
    };
  },
});
