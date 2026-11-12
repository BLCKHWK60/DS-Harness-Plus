/**
 * Budget guard, browser half: the Settings > Budget guard page, and a card under a turn the guard
 * stopped. The counting and the stopping happen in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-budget',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'budget';
    const DICT = { en: { 'section.title': 'Budget guard' }, zh: { 'section.title': '用量护栏' } };

    const CSS = `
.dsh-bg-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-bg-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-bg-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bg-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bg-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-bg-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-bg-rowtext { flex: 1; min-width: 0; }
.dsh-bg-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-bg-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bg-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-bg-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-bg-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-bg-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-bg-field {
  flex: none; box-sizing: border-box; width: 130px; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; text-align: right;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-bg-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-bg-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-bg-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-bg-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-bg-card {
  margin: 8px 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
  border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 8%, transparent);
}
.dsh-bg-card b { font-weight: 500; }
.dsh-bg-cardsub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
`;

    const num = (value) => Number(value || 0).toLocaleString('en-US');

    async function readData() {
      const response = await fetch(new URL('dsh-budget/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      return response.json();
    }

    // One read shared by every card on the page, refreshed at most every few seconds.
    let shared = { at: 0, promise: null };
    function readShared() {
      if (!shared.promise || Date.now() - shared.at > 4000) shared = { at: Date.now(), promise: readData().catch(() => ({ stops: [] })) };
      return shared.promise;
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

    /** A whole number, saved when you leave the box. Empty or 0 means no limit. */
    function NumberField({ value, label, onCommit }) {
      const shown = value > 0 ? String(value) : '';
      const [draft, setDraft] = useState(shown);
      useEffect(() => setDraft(shown), [shown]);
      const commit = () => {
        const next = Math.max(0, Math.floor(Number(String(draft).replace(/[,\s]/g, '')) || 0));
        if (next !== (value || 0)) onCommit(next);
        else setDraft(shown);
      };
      return h('input', {
        className: 'dsh-bg-field', inputMode: 'numeric', value: draft, placeholder: 'No limit', 'aria-label': label,
        onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      });
    }

    function Row({ title, hint, children }) {
      return h('div', { className: 'dsh-bg-row' },
        h('div', { className: 'dsh-bg-rowtext' }, h('div', { className: 'dsh-bg-rowtitle' }, title), hint ? h('div', { className: 'dsh-bg-rowdesc' }, hint) : null),
        children);
    }

    function BudgetPage({ appCtx }) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      const load = () => readData()
        .then((next) => alive.current && setData(next))
        .catch((error) => alive.current && setNote({ text: `Could not load: ${error.message}`, error: true }));
      useEffect(() => {
        alive.current = true;
        load();
        return () => { alive.current = false; };
      }, []);

      if (!data) {
        return h('div', { className: 'dsh-bg-page' }, h('style', null, CSS), h('h2', { className: 'dsh-bg-title' }, 'Budget guard'), h('p', { className: 'dsh-bg-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const limits = data.limits ?? {};
      const big = data.biggest ?? { count: 0 };
      const save = async (values) => {
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, limits: { ...d.limits, ...values } }));
          setNote({ text: 'Saved.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };
      const stops = Array.isArray(data.stops) ? data.stops : [];

      return h('div', { className: 'dsh-bg-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-bg-title' }, 'Budget guard'),
        h('p', { className: 'dsh-bg-desc' }, 'Stops a task that is running away. A task is everything the assistant does after one message of yours, with its helper agents counted in. At a limit the task stops and says why; your next message lets it go on with a fresh allowance.'),
        note.text ? h('p', { className: 'dsh-bg-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-bg-group' }, 'Limits for one task'),
        h(Row, { title: 'Use the budget guard', hint: 'Off counts nothing and stops nothing.' },
          h('button', { type: 'button', role: 'switch', className: 'dsh-bg-switch', 'aria-checked': limits.enabled !== false, 'aria-label': 'Use the budget guard', onClick: () => save({ enabled: limits.enabled === false }) })),
        h(Row, { title: 'Steps', hint: 'One step is one request to a model. A normal task takes a handful to a few dozen.' },
          h(NumberField, { value: limits.maxSteps, label: 'Steps', onCommit: (next) => save({ maxSteps: next }) })),
        h(Row, { title: 'Tokens', hint: 'Everything sent to and received from the model, added up over the task. Long tasks resend the conversation at every step, so this number grows fast.' },
          h(NumberField, { value: limits.maxTokens, label: 'Tokens', onCommit: (next) => save({ maxTokens: next }) })),
        h(Row, { title: 'Minutes', hint: 'How long one task may run. Time it spends waiting for your answer counts too, so leave this empty unless you want it.' },
          h(NumberField, { value: limits.maxMinutes, label: 'Minutes', onCommit: (next) => save({ maxMinutes: next }) })),
        h(Row, { title: 'Same tool call in a row', hint: 'The assistant repeating exactly the same action this many times is treated as a loop and stopped.' },
          h(NumberField, { value: limits.maxRepeats, label: 'Same tool call in a row', onCommit: (next) => save({ maxRepeats: next }) })),

        h('div', { className: 'dsh-bg-group' }, 'Limit for one day'),
        h(Row, { title: 'Tokens per day', hint: `All conversations together. Used today: ${num(data.today)}.` },
          h(NumberField, { value: limits.dayTokens, label: 'Tokens per day', onCommit: (next) => save({ dayTokens: next }) })),

        h('div', { className: 'dsh-bg-group' }, 'What your tasks really use'),
        big.count > 0
          ? h(Row, {
            title: `Biggest task in the last 30 days: ${num(big.steps)} steps, ${num(big.tokens)} tokens, ${num(big.minutes)} min`,
            hint: `From ${num(big.count)} tasks seen since the guard was installed. A common rule is to set a limit at about twice your biggest normal task.`,
          }, big.count >= 5 ? h('button', { type: 'button', className: 'dsh-bg-btn', onClick: () => save({ maxSteps: Math.max(20, big.steps * 2), maxTokens: Math.max(200000, big.tokens * 2) }) }, 'Set to twice that') : null)
          : h('p', { className: 'dsh-bg-desc' }, 'Nothing seen yet. After a few tasks this shows your biggest one, so you can set limits that fit.'),

        h('div', { className: 'dsh-bg-group' }, 'Recent stops'),
        stops.length === 0
          ? h('p', { className: 'dsh-bg-desc' }, 'The guard has not stopped anything.')
          : h('ul', { className: 'dsh-bg-list' }, stops.slice(0, 10).map((stop, i) => h('li', { key: `${stop.at}-${i}` }, `${new Date(stop.at).toLocaleString()}: ${stop.text}`))),

        h('div', { className: 'dsh-bg-group' }, 'Good to know'),
        h('ul', { className: 'dsh-bg-list' },
          h('li', null, 'An empty box means no limit.'),
          h('li', null, 'A stop ends the task where it is. Nothing is undone and the conversation is kept.'),
          h('li', null, 'The limits are checked by the app before every step. The model is never asked to keep to them.'),
          h('li', null, 'It counts tokens, not money. Prices differ per model.')));
    }

    /** Under a turn the guard stopped: why, and what to do. */
    function TurnStop({ sessionId, turn }) {
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const [stop, setStop] = useState(null);
      useEffect(() => {
        if (!sessionId || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
        let alive = true;
        readShared().then((data) => {
          if (alive) setStop((data.stops ?? []).find((s) => s.sessionId === sessionId && s.at >= from - 1000 && s.at <= to + 5000) ?? null);
        });
        return () => { alive = false; };
      }, [sessionId, from, to]);
      if (!stop) return null;
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('div', { className: 'dsh-bg-card', role: 'status' },
          h('div', null, h('b', null, 'Stopped by the budget guard. '), stop.text),
          h('div', { className: 'dsh-bg-cardsub' }, 'Send a message to let it go on with a fresh allowance, or change the limit in Settings → Budget guard.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'budget', order: 20, label: () => t('section.title') }, (props) => h(BudgetPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-budget' }, (props) => h(TurnStop, props))));
      },
    };
  },
});
