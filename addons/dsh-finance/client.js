/**
 * Finance, browser half: the drop-downs on the Finance tab's start page (subject, market, focus,
 * period), the same selection in the chat box of a Finance conversation once it has started (a
 * change there is that conversation's own), and the Settings > Finance page. The mode, its
 * instructions and its skills are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-finance',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'finance';
    const DICT = { en: { 'section.title': 'Finance' }, zh: { 'section.title': '财经' } };

    const CSS = `
.dsh-fn-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-fn-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-fn-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-fn-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-fn-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-fn-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-rowtext { flex: 1; min-width: 0; }
.dsh-fn-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-fn-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-fn-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-fn-btn:disabled { opacity: .5; cursor: default; }
.dsh-fn-add { display: flex; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-field {
  flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-fn-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-fn-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-fn-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-fn-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-fn-field[data-small="true"] { flex: none; width: 150px; }
select.dsh-fn-field { cursor: pointer; flex: none; width: auto; max-width: 240px; }
.dsh-fn-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-form .dsh-fn-field { flex: 1 1 200px; }
.dsh-fn-form select.dsh-fn-field, .dsh-fn-form .dsh-fn-field[data-small="true"] { flex: 0 0 auto; }
.dsh-fn-out { margin: 6px 0 0; padding: 8px 10px; border-radius: 10px; font-size: 11px; line-height: 16px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-fn-area { box-sizing: border-box; width: 100%; min-height: 150px; margin-top: 10px; padding: 10px 14px; border: 0; border-radius: 12px; resize: vertical; font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-fn-area:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-side { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.dsh-fn-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }

/* The drop-downs on the start page: only while the Finance tab is selected. */
.dsh-fn-bar { display: none; }
html[data-cws-tab="finance"] .dsh-fn-bar {
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;
}
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) { position: relative; }
/* The buttons below move down by the bar's real height, which changes when the bar wraps. */
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) .cws-chips { margin-top: calc(var(--dsh-fn-bar, 70px) + 36px); }
.dsh-fn-pick {
  box-sizing: border-box; height: 36px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, transparent); cursor: pointer; max-width: 170px;
}
input.dsh-fn-pick { cursor: text; width: 200px; max-width: 200px; }
.dsh-fn-pick:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }

/* The selection in the chat box of a Finance conversation: one pill, a part for each field. */
/* Kept at its own width, like Research's controls: a squeezed pill cannot be read or clicked. */
.dsh-fn-chat { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.dsh-fn-ctls {
  display: inline-flex; align-items: center; flex: none; box-sizing: border-box; height: 28px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px;
  overflow: hidden; font-size: 13px; color: var(--dsw-alias-label-secondary);
}
.dsh-fn-ctls[data-error="true"] { border-color: var(--dsw-alias-state-error-primary); }
.dsh-fn-seg {
  display: inline-flex; align-items: center; gap: 4px; flex: none; box-sizing: border-box; height: 100%; margin: 0; padding: 0 8px; border: 0;
  border-left: 1px solid var(--dsw-alias-border-l1); border-radius: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.dsh-fn-seg:first-child { border-left: 0; padding-left: 10px; }
.dsh-fn-seg:last-child { padding-right: 10px; }
.dsh-fn-seg:disabled { opacity: .5; cursor: default; }
.dsh-fn-seg:focus-visible { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
@media (hover: hover) { button.dsh-fn-seg:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.dsh-fn-seg .v { min-width: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); }
.dsh-fn-seg svg { flex: none; }
input.dsh-fn-seg { width: 9em; max-width: 140px; cursor: text; color: var(--dsw-alias-label-primary); }
input.dsh-fn-seg::placeholder { color: var(--dsw-alias-label-secondary); }
/* The chat box's row has room for the pill only in a wide window: all five parts from 1600 pixels,
   the subject and the market from 1280, and none below that (the start page has the selection),
   so the app's own buttons in the row never overlap. */
@media (max-width: 1599px) { .dsh-fn-seg[data-field="kind"], .dsh-fn-seg[data-field="focus"], .dsh-fn-seg[data-field="period"] { display: none; } input.dsh-fn-seg { padding-left: 10px; } .dsh-fn-seg[data-field="market"] { padding-right: 10px; } .dsh-fn-seg .v { max-width: 96px; } input.dsh-fn-seg { width: 7em; } }
@media (max-width: 1279px) { .dsh-fn-chat { display: none; } }
input.dsh-fn-seg:focus { outline: none; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
@container (max-width: 820px) { .dsh-fn-seg .v { max-width: 64px; } input.dsh-fn-seg { width: 6em; } }
.dsh-fn-err { flex: none; font-size: 12px; color: var(--dsw-alias-state-error-primary); white-space: nowrap; }
.dsh-fn-pop {
  position: fixed; z-index: 1000; box-sizing: border-box; width: 300px; max-width: calc(100vw - 24px); max-height: min(420px, 60vh); overflow: auto; padding: 12px 14px;
  border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)));
  color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent);
}
.dsh-fn-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-fn-pop .opts { display: flex; flex-direction: column; gap: 2px; margin: 8px -6px 0; }
.dsh-fn-pop .opts button { display: block; width: 100%; text-align: left; border: 0; border-radius: 10px; padding: 6px 10px; background: transparent; font: inherit; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-fn-pop .opts button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-fn-pop .opts button[aria-current='true'] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent); }
.dsh-fn-pop .opts b { display: block; font-size: 13px; line-height: 18px; font-weight: 500; }
.dsh-fn-pop .opts small { display: block; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-pop .note { margin-top: 8px; color: var(--dsw-alias-label-secondary); }
`;

    const SUBJECT_HINTS = {
      company: 'Company, for example NVIDIA',
      sector: 'Sector, for example chip makers',
      economy: 'Economy, for example Japan',
      market: 'Anything to add (optional)',
    };

    async function readData() {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      return response.json();
    }

    async function post(body) {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body),
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

    // The bar and the page show the same settings; a change in one reaches the other.
    const listeners = new Set();
    const tell = () => { for (const listener of listeners) listener(); };

    function useData() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const alive = useRef(true);
      const load = () => readData()
        .then((next) => { if (alive.current) { setData(next); setError(''); } })
        .catch((problem) => { if (alive.current) setError(problem.message); });
      useEffect(() => {
        alive.current = true;
        load();
        listeners.add(load);
        return () => { alive.current = false; listeners.delete(load); };
      }, []);
      return { data, setData, error, alive, load };
    }

    /** The drop-downs under the message box on the Finance tab's start page. */
    function FinanceBar({ appCtx }) {
      const { data, setData, alive } = useData();
      const [draft, setDraft] = useState(null);
      const [failed, setFailed] = useState('');
      const bar = useRef(null);
      const shown = Boolean(data && data.enabled === true);
      useEffect(() => {
        const node = bar.current;
        if (!node || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-fn-bar', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-fn-bar'); };
      }, [shown]);
      if (!shown) return h('style', null, CSS);
      const selection = data.selection ?? {};
      const save = async (values) => {
        setData((d) => ({ ...d, selection: { ...d.selection, ...values } }));
        try {
          await setSettings(appCtx, values);
          if (alive.current) setFailed('');
          tell();
        } catch (problem) {
          if (alive.current) setFailed(`Could not save the selection: ${problem.message}`);
        }
      };
      const subject = draft ?? selection.subject ?? '';
      const commitSubject = () => {
        if (draft === null) return;
        const next = draft.trim();
        setDraft(null);
        if (next !== (selection.subject ?? '')) void save({ subject: next });
      };
      const select = (label, value, options, onChange) => h('select', { className: 'dsh-fn-pick', 'aria-label': label, title: label, value, onChange: (event) => onChange(event.target.value) },
        options.map((option) => h('option', { key: option.id, value: option.id }, option.label)));
      const markets = (data.markets ?? []).includes(selection.market) ? data.markets : [...(data.markets ?? []), selection.market];
      const summary = selection.kind === 'market'
        ? `The whole market, ${selection.market}`
        : selection.subject ? `${selection.subject}, ${selection.market}` : `No ${selection.kind} chosen yet: name it here or in your message`;

      return h('div', { ref: bar, className: 'dsh-fn-bar', role: 'group', 'aria-label': 'What to research' },
        h('style', null, CSS),
        select('Kind of subject', selection.kind, data.kinds ?? [], (kind) => save({ kind })),
        h('input', {
          className: 'dsh-fn-pick', list: 'dsh-fn-watchlist', value: subject, placeholder: SUBJECT_HINTS[selection.kind] ?? 'Subject', 'aria-label': 'Subject', spellCheck: false, autoCorrect: 'off',
          onChange: (event) => setDraft(event.target.value), onBlur: commitSubject, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
        }),
        h('datalist', { id: 'dsh-fn-watchlist' }, (data.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
        select('Market', selection.market, markets.map((market) => ({ id: market, label: market })), (market) => save({ market })),
        select('Focus', selection.focus, data.focuses ?? [], (focus) => save({ focus })),
        select('Period', selection.period, data.periods ?? [], (period) => save({ period })),
        h('div', { className: 'dsh-fn-hint', 'data-error': String(Boolean(failed)) }, failed || (data.adviser === true ? `${summary}. Adviser on.` : `${summary}. Research, not advice.`)));
    }

    /** What the subject box in the chat box shows while it is empty. */
    const SUBJECT_SHORT = { company: 'Company', sector: 'Sector', economy: 'Economy', market: 'Anything to add', brief: 'Subject' };
    const CHAT_NOTE = 'For this conversation only, from the assistant\'s next step. The drop-downs on the start page set where new conversations start.';

    /** One field of the chat box's selection: its value, and a list of the choices when pressed. */
    function ChatDrop({ label, items, value, busy, field, onPick }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 312)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => {
          if (event.key !== 'Escape') return;
          // Closing the list is not a press towards stopping the turn.
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        };
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      const chosen = items.find((item) => item.id === value);
      const shown = chosen?.label ?? value ?? '';
      return h(React.Fragment, null,
        h('button', {
          ref: button, type: 'button', className: 'dsh-fn-seg', 'data-field': field ?? '', 'aria-haspopup': 'dialog', 'aria-expanded': open, disabled: busy,
          'aria-label': `${label}: ${shown}`, title: `${label}: ${shown}`, onClick: () => setOpen(!open),
        },
        h('span', { className: 'v' }, shown),
        h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M2 6.5 5 3.5 8 6.5' }))),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-fn-pop', role: 'dialog', 'aria-label': label, style: { left: place.left, bottom: place.bottom } },
                h('style', null, CSS),
                h('div', { className: 'title' }, label),
                h('div', { className: 'opts', role: 'listbox', 'aria-label': label },
                  items.map((item) => h('button', {
                    key: item.id, type: 'button', role: 'option', 'aria-selected': item.id === value, 'aria-current': String(item.id === value),
                    onClick: () => { setOpen(false); if (item.id !== value) onPick(item.id); },
                  }, h('b', null, item.label), item.about ? h('small', null, item.about) : null))),
                h('div', { className: 'note' }, CHAT_NOTE)),
              document.body,
            )
          : null);
    }

    /**
     * The selection of a Finance conversation in its chat box: kind, subject, market, focus and
     * period. Shown once the conversation has started; before that the start page's drop-downs are
     * the selection. A change is saved as this conversation's own selection and shown at once.
     */
    function FinanceControls({ sessionId }) {
      const [view, setView] = useState(null);
      const [busy, setBusy] = useState(false);
      const [draft, setDraft] = useState(null);
      const [failed, setFailed] = useState('');
      const alive = useRef(true);
      const pending = useRef(0);
      const refresh = useRef(() => {});
      // Escape leaves the subject box without saving what was typed.
      const dropDraft = useRef(false);
      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);
      useEffect(() => {
        let current = true;
        let timer;
        setView(null);
        setDraft(null);
        setFailed('');
        const tick = async () => {
          // Asked less often while Finance is switched off or not answering; the Finance page's
          // switch calls tell(), which asks at once.
          let wait = 15000;
          try {
            if (sessionId) {
              const response = await fetch(new URL(`dsh-finance/data?session=${encodeURIComponent(sessionId)}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
              if (response.ok) {
                const next = await response.json();
                wait = next?.enabled === true ? 4000 : 30000;
                // While a change is being saved, an older answer must not undo what it shows.
                if (current && pending.current === 0) setView(next);
              }
            }
          } catch {
            /* tried again shortly */
          }
          // tick also runs when another control calls tell(): restart the one chain, never start a second.
          clearTimeout(timer);
          if (current) timer = setTimeout(tick, document.hidden ? Math.max(wait, 15000) : wait);
        };
        refresh.current = tick;
        void tick();
        listeners.add(tick);
        return () => { current = false; clearTimeout(timer); listeners.delete(tick); };
      }, [sessionId]);
      if (!sessionId || !view || view.enabled !== true || view.session?.shown !== true || view.session.id !== sessionId) return null;
      const selection = view.session.selection ?? {};
      const pick = async (values) => {
        pending.current += 1;
        setBusy(true);
        setView((v) => ({ ...v, session: { ...v.session, selection: { ...v.session.selection, ...values } } }));
        try {
          const next = await post({ action: 'pin', sessionId, values });
          if (!alive.current) return;
          if (next?.session?.id === sessionId) setView(next);
          setFailed('');
          tell();
        } catch (problem) {
          if (!alive.current) return;
          setFailed(problem.message);
          // The re-read shows what is saved; the mark goes after a while.
          void refresh.current();
          setTimeout(() => { if (alive.current) setFailed((now) => (now === problem.message ? '' : now)); }, 8000);
        } finally {
          pending.current -= 1;
          if (alive.current) setBusy(false);
        }
      };
      const subject = draft ?? selection.subject ?? '';
      const commitSubject = () => {
        const dropped = dropDraft.current;
        dropDraft.current = false;
        if (draft === null || dropped) return;
        const next = draft.trim();
        setDraft(null);
        if (next !== (selection.subject ?? '')) void pick({ subject: next });
      };
      const listId = `dsh-fn-chat-list-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}`;
      const kinds = [...(view.kinds ?? []), ...(selection.kind === 'brief' ? [{ id: 'brief', label: 'Scheduled brief' }] : [])];
      const markets = ((view.markets ?? []).includes(selection.market) ? view.markets : [...(view.markets ?? []), selection.market]).map((market) => ({ id: market, label: market }));
      const field = (label, items, value, key) => h(ChatDrop, { label, items, value, busy, field: key, onPick: (id) => void pick({ [key]: id }) });
      return h('span', { className: 'dsh-fn-chat' },
        h('style', null, CSS),
        h('span', { className: 'dsh-fn-ctls', role: 'group', 'aria-label': 'What this Finance conversation is about', 'data-error': String(Boolean(failed)) },
          field('Kind of subject', kinds, selection.kind, 'kind'),
          h('input', {
            className: 'dsh-fn-seg', list: listId, value: subject, placeholder: SUBJECT_SHORT[selection.kind] ?? 'Subject', disabled: busy,
            'aria-label': 'Subject', title: subject ? `Subject: ${subject}. ${CHAT_NOTE}` : `Subject: none yet. ${CHAT_NOTE}`, spellCheck: false, autoCorrect: 'off', maxLength: 80,
            onChange: (event) => setDraft(event.target.value), onBlur: commitSubject,
            onKeyDown: (event) => {
              // Neither key reaches the chat box: Enter does not send, Escape does not count towards stopping a turn.
              if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dropDraft.current = true; setDraft(null); event.target.blur(); }
            },
          }),
          h('datalist', { id: listId }, (view.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
          field('Market', markets, selection.market, 'market'),
          field('Focus', view.focuses ?? [], selection.focus, 'focus'),
          field('Period', view.periods ?? [], selection.period, 'period')),
        failed ? h('span', { className: 'dsh-fn-err', role: 'status', title: failed }, 'Not saved') : null);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-fn-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** A list of names with an add box: the watchlist, and your own markets. */
    function NameList({ items, placeholder, label, empty, busy, onChange }) {
      const [text, setText] = useState('');
      const add = () => {
        const name = text.trim();
        if (!name) return;
        setText('');
        if (!items.some((other) => other.toLowerCase() === name.toLowerCase())) onChange([...items, name]);
      };
      return h(React.Fragment, null,
        items.length === 0 ? h('p', { className: 'dsh-fn-desc' }, empty) : null,
        items.map((name) => h('div', { key: name, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' }, h('div', { className: 'dsh-fn-rowtitle' }, name)),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => onChange(items.filter((other) => other !== name)) }, 'Remove'))),
        h('div', { className: 'dsh-fn-add' },
          h('input', { className: 'dsh-fn-field', value: text, placeholder, 'aria-label': label, spellCheck: false, onChange: (event) => setText(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') add(); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !text.trim(), onClick: add }, 'Add')));
    }

    const KEY_PLACES = [
      { id: 'query', label: 'Key goes in the address' },
      { id: 'header', label: 'Key goes in a header' },
      { id: 'bearer', label: 'Key is a bearer token' },
      { id: 'none', label: 'No key needed' },
    ];

    /** One data source: its key, a try-out, on and off, remove. */
    function SourceRow({ source, busy, onKey, onForget, onToggle, onRemove, onTry }) {
      const [key, setKey] = useState('');
      const [path, setPath] = useState('');
      const [out, setOut] = useState('');
      const api = source.kind === 'api';
      const needsKey = api && source.keyIn !== 'none';
      const status = !api ? 'A connector: its tools are already available to the assistant. This note tells it what they are good for.'
        : !needsKey ? source.baseUrl
          : source.keySet ? `${source.baseUrl} · key saved${source.keyShown ? ` (${source.keyShown})` : ''}` : `${source.baseUrl} · no key yet, so the assistant cannot use it`;
      return h('div', { style: { borderBottom: '0.5px solid var(--dsw-alias-border-l1)', padding: '14px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, source.name),
            h('div', { className: 'dsh-fn-rowdesc' }, status),
            source.about ? h('div', { className: 'dsh-fn-rowdesc' }, source.about) : null),
          h('div', { className: 'dsh-fn-side' },
            h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onRemove }, 'Remove'),
            h(Switch, { on: source.on, label: `Use ${source.name}`, onChange: onToggle }))),
        needsKey ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', type: 'password', value: key, placeholder: source.keySet ? 'Paste a new key to replace the saved one' : 'Paste your key', 'aria-label': `Key for ${source.name}`, autoComplete: 'off', spellCheck: false, onChange: (event) => setKey(event.target.value) }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !key.trim(), onClick: async () => { if (await onKey(key.trim())) setKey(''); } }, 'Save key'),
          source.keySet ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onForget }, 'Forget key') : null) : null,
        api && (!needsKey || source.keySet) ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', value: path, placeholder: 'A path to try, for example quote?symbol=AAPL', 'aria-label': `Path to try on ${source.name}`, spellCheck: false, onChange: (event) => setPath(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && path.trim()) void onTry(path.trim()).then(setOut); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !path.trim(), onClick: () => void onTry(path.trim()).then(setOut) }, 'Try')) : null,
        out ? h('div', { className: 'dsh-fn-out' }, out) : null);
    }

    /** Add a source: a known service, any other web service, or a note about a connector. */
    function AddSource({ presets, taken, busy, onAdd }) {
      const [kind, setKind] = useState('');
      const [form, setForm] = useState({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' });
      const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
      const free = presets.filter((preset) => !taken.includes(preset.id));
      const field = (key, placeholder, small) => h('input', { className: 'dsh-fn-field', 'data-small': String(small === true), value: form[key], placeholder, 'aria-label': placeholder, spellCheck: false, autoCapitalize: 'off', onChange: set(key) });
      const add = async () => {
        const preset = presets.find((item) => item.id === kind);
        const source = preset ? { ...preset, kind: 'api', on: true }
          : kind === 'connector' ? { kind: 'connector', name: form.name.trim(), about: form.about.trim(), on: true }
            : { kind: 'api', name: form.name.trim(), baseUrl: form.baseUrl.trim(), keyIn: form.keyIn, keyName: form.keyName.trim(), about: form.about.trim(), docs: form.docs.trim(), on: true };
        if (await onAdd(source)) { setKind(''); setForm({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' }); }
      };
      const custom = kind === 'other';
      const ready = kind && (presets.some((item) => item.id === kind) || (form.name.trim() && (kind === 'connector' || form.baseUrl.trim())));
      return h('div', { className: 'dsh-fn-form' },
        h('select', { className: 'dsh-fn-field', value: kind, 'aria-label': 'Kind of source to add', onChange: (event) => setKind(event.target.value) },
          h('option', { value: '' }, 'Add a source…'),
          free.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name)),
          h('option', { value: 'other' }, 'Another web service'),
          h('option', { value: 'connector' }, 'A connector I added')),
        custom || kind === 'connector' ? field('name', kind === 'connector' ? 'The connector\'s name' : 'Name') : null,
        custom ? field('baseUrl', 'Address, for example https://api.example.com/v1') : null,
        custom ? h('select', { className: 'dsh-fn-field', value: form.keyIn, 'aria-label': 'Where the key goes', onChange: set('keyIn') }, KEY_PLACES.map((place) => h('option', { key: place.id, value: place.id }, place.label))) : null,
        custom && (form.keyIn === 'query' || form.keyIn === 'header') ? field('keyName', form.keyIn === 'query' ? 'The key\'s name, for example apikey' : 'The header\'s name, for example X-API-Key', true) : null,
        custom || kind === 'connector' ? field('about', 'What it is good for, in one line (the assistant reads this)') : null,
        custom ? field('docs', 'Address of its documentation (optional)') : null,
        kind ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !ready, onClick: add }, 'Add') : null);
    }

    /** Schedule a brief: what about, how often, at what hour. */
    function AddBrief({ watchlist, rhythms, busy, onAdd }) {
      const [subject, setSubject] = useState('');
      const [rhythm, setRhythm] = useState('weekdays');
      const [hour, setHour] = useState('8');
      return h('div', { className: 'dsh-fn-form' },
        h('input', { className: 'dsh-fn-field', list: 'dsh-fn-brief-list', value: subject, placeholder: 'What about, for example NVIDIA', 'aria-label': 'Subject of the brief', spellCheck: false, onChange: (event) => setSubject(event.target.value) }),
        h('datalist', { id: 'dsh-fn-brief-list' }, watchlist.map((name) => h('option', { key: name, value: name }))),
        h('select', { className: 'dsh-fn-field', value: rhythm, 'aria-label': 'How often', onChange: (event) => setRhythm(event.target.value) }, rhythms.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
        h('select', { className: 'dsh-fn-field', value: hour, 'aria-label': 'At what hour', onChange: (event) => setHour(event.target.value) }, Array.from({ length: 24 }, (_, value) => h('option', { key: value, value: String(value) }, `at ${String(value).padStart(2, '0')}:00`))),
        h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !subject.trim(), onClick: async () => { if (await onAdd(subject.trim(), rhythm, Number(hour))) setSubject(''); } }, 'Schedule'));
    }

    const PROFILE_MAX = 8000;
    const PROFILE_HINT = 'For example:\nGoals: retire at 60; a house deposit in 4 years.\nTime frame: most money 15+ years; the deposit 4 years.\nRisk: can sit through a 30% fall on the long-term part; none on the deposit.\nHoldings: 60% world index fund, 15% NVDA, 10% cash…\nLimits: no tobacco; no single share above 10%.\nTax and accounts: …';

    /** The profile the adviser reads. The user writes it; the assistant may add dated lines. */
    function Profile({ text, busy, onSave }) {
      const [draft, setDraft] = useState(text);
      const [seen, setSeen] = useState(text);
      // A line the assistant added shows up, unless the user is in the middle of typing.
      if (text !== seen) {
        if (draft === seen) setDraft(text);
        setSeen(text);
      }
      const dirty = draft.trim() !== text.trim();
      return h('div', null,
        h('textarea', { className: 'dsh-fn-area', value: draft, maxLength: PROFILE_MAX, placeholder: PROFILE_HINT, 'aria-label': 'Your profile', spellCheck: true, onChange: (event) => setDraft(event.target.value) }),
        h('div', { className: 'dsh-fn-foot' },
          h('span', null, `${draft.length} of ${PROFILE_MAX} characters${dirty ? ' · not saved' : ''}`),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !dirty, onClick: () => onSave(draft) }, 'Save profile')));
    }

    function FinancePage({ appCtx }) {
      const { data, setData, error, alive, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-fn-page' }, h('style', null, CSS), h('h2', { className: 'dsh-fn-title' }, 'Finance'), h('p', { className: 'dsh-fn-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const save = async (values, done = 'Saved.') => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          tell();
          // The tab is added or removed a moment later; read back whether that worked.
          setTimeout(() => { if (alive.current) load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      const sources = Array.isArray(data.sources) ? data.sources : [];
      // What is saved: the description only. Whether a key is saved is the server's to say.
      const stored = (list) => list.map(({ keySet, keyShown, ...source }) => source);
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await post(body);
          if (!alive.current) return undefined;
          setData(next);
          if (done) setNote({ text: done, error: false });
          tell();
          return next;
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, error: true });
          return undefined;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const saveSources = async (list, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { sources: JSON.stringify(stored(list)) });
          if (!alive.current) return false;
          setNote({ text: done, error: false });
          await load();
          tell();
          return true;
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const addSource = async (source) => {
        const id = String(source.id ?? source.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        if (!id) { setNote({ text: 'Give the source a name.', error: true }); return false; }
        if (sources.some((other) => other.id === id)) { setNote({ text: 'There is already a source with that name.', error: true }); return false; }
        if (source.kind === 'api') {
          try {
            await post({ action: 'check', baseUrl: source.baseUrl });
          } catch (problem) {
            setNote({ text: problem.message, error: true });
            return false;
          }
        }
        return saveSources([...sources, { ...source, id }], source.kind === 'api' && source.keyIn !== 'none' ? 'Added. Now paste its key.' : 'Added.');
      };
      const removeSource = async (source) => {
        if (!window.confirm(`Remove "${source.name}" from Finance?${source.keySet ? '\n\nIts saved key is forgotten too.' : ''}`)) return;
        if (await saveSources(sources.filter((other) => other.id !== source.id), 'Removed.') && source.kind === 'api') await act({ action: 'forget', id: source.id });
      };
      const trySource = async (source, typed) => {
        const [path, search = ''] = typed.split('?');
        const next = await act({ action: 'test', id: source.id, path, query: Object.fromEntries(new URLSearchParams(search)) });
        return next?.tested ?? '';
      };
      const briefs = Array.isArray(data.briefs) ? data.briefs : [];
      const ownTasks = Array.isArray(data.ownTasks) ? data.ownTasks : [];
      // Marks of tasks that no longer exist are dropped whenever the list is saved.
      const markTask = async (task, on) => {
        const next = ownTasks.map((other) => (other.id === task.id ? { ...other, finance: on } : other));
        await saveMarks(next, task, on);
        if (alive.current) setData((d) => ({ ...d, ownTasks: next }));
      };
      const saveMarks = (next, task, on) => save({ financeTasks: next.filter((other) => other.finance).map((other) => other.id) }, on ? `"${task.title}" will run in Finance from its next run.` : `"${task.title}" will run in Cowork again from its next run.`);

      return h('div', { className: 'dsh-fn-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-fn-title' }, 'Finance'),
        h('p', { className: 'dsh-fn-desc' }, `A fourth tab, beside Chat, Cowork and Code, for researching companies, markets and economies. The assistant puts the reported figures next to what the news says and what people are saying, looks ahead, and gives both sides. ${data.adviser === true ? 'The adviser is on: it ends with a recommendation.' : 'It is research, not advice.'}`),
        note.text ? h('p', { className: 'dsh-fn-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-fn-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-fn-group' }, 'The tab'),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Show the Finance tab'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'On adds the tab, its drop-downs, its instructions and its skills. Off takes all of them away; your watchlist is kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Finance tab', onChange: (on) => save({ enabled: on }, on ? 'Switched on. The Finance tab appears in the sidebar in a moment.' : 'Switched off. The Finance tab is taken away in a moment.') })),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Selection in the chat box'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'Once a Finance conversation has started, its chat box shows what it is about: kind, subject, market, focus and period. Change them there for that conversation only; it applies from the assistant\'s next step, even in a reply that is still running. The drop-downs on the start page set where new conversations start.'))),

        h('div', { className: 'dsh-fn-group' }, 'Adviser'),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Act as my financial adviser'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'On: the assistant researches as an adviser would, ends with a clear call (buy, add, hold, trim, sell, avoid or wait) fitted to your profile, and adds no disclaimer. Off: research only, and it does not say buy, sell or hold. Applies from your next message.')),
          h(Switch, { on: data.adviser === true, label: 'Act as my financial adviser', onChange: (on) => save({ adviser: on }, on ? 'Adviser on. It applies from your next message in a Finance conversation.' : 'Adviser off. Finance is research only again.') })),
        data.adviser === true ? h('div', null,
          h('p', { className: 'dsh-fn-desc' }, 'Your profile: what an adviser needs to know about you. It is read in every Finance conversation. You can write it here, and the assistant adds a dated line when you tell it something lasting. It is kept in one file on this Mac and is sent to your model with each Finance message. Leave out account numbers.'),
          h(Profile, { text: typeof data.profile === 'string' ? data.profile : '', busy, onSave: (text) => act({ action: 'profile', text }, 'Profile saved.') })) : null,

        h('div', { className: 'dsh-fn-group' }, 'Watchlist'),
        h('p', { className: 'dsh-fn-desc' }, 'Companies, sectors or economies you follow. They are offered when you type in the subject box on the Finance tab.'),
        h(NameList, { items: data.watchlist ?? [], placeholder: 'A name, for example NVIDIA', label: 'Add to the watchlist', empty: 'Nothing on the watchlist yet.', busy, onChange: (watchlist) => save({ watchlist }) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own markets'),
        h('p', { className: 'dsh-fn-desc' }, `The Market drop-down offers: ${(data.markets ?? []).filter((market) => !(data.moreMarkets ?? []).includes(market)).join(', ')}. Add others here.`),
        h(NameList, { items: data.moreMarkets ?? [], placeholder: 'A market, for example Mexico', label: 'Add a market', empty: 'No market of your own yet.', busy, onChange: (moreMarkets) => save({ moreMarkets }) }),

        h('div', { className: 'dsh-fn-group' }, 'Data sources'),
        h('p', { className: 'dsh-fn-desc' }, 'Built in, with no key: reported company figures and filings from the US securities regulator, yearly economy readings from the World Bank, daily share prices from Yahoo Finance, news from GDELT, and social posts from Hacker News, Mastodon and Lemmy. Add your own below, for estimates, forecasts, news with sentiment or anything else a data service offers. The assistant can only read from a source, never send or change anything, and only at that source\'s own address.'),
        sources.map((source) => h(SourceRow, {
          key: source.id, source, busy,
          onKey: (value) => act({ action: 'key', id: source.id, value }, 'Key saved in the app\'s secret store.').then(Boolean),
          onForget: () => act({ action: 'forget', id: source.id }, 'Key forgotten.'),
          onToggle: (on) => saveSources(sources.map((other) => (other.id === source.id ? { ...other, on } : other)), on ? 'Switched on.' : 'Switched off.'),
          onRemove: () => removeSource(source),
          onTry: (typed) => trySource(source, typed),
        })),
        h(AddSource, { presets: data.presets ?? [], taken: sources.map((source) => source.id), busy, onAdd: addSource }),

        h('div', { className: 'dsh-fn-group' }, 'Scheduled briefs'),
        h('p', { className: 'dsh-fn-desc' }, 'A short update on something you follow, written by itself on a schedule: what changed, what to watch next, with sources. It runs as a task in the app\'s own scheduler, in a new conversation each time. The conversation appears under the Finance tab, and the run shows on the Automation runs page.'),
        briefs.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'No brief is scheduled.') : null,
        briefs.map((brief) => h('div', { key: brief.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, brief.subject),
            h('div', { className: 'dsh-fn-rowdesc' }, brief.status === 'paused' ? 'Paused in Automation tasks' : brief.nextAt ? `Next: ${new Date(brief.nextAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '')),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => { if (window.confirm(`Stop the brief on "${brief.subject}"?`)) void act({ action: 'unbrief', id: brief.id }, 'Brief removed.'); } }, 'Remove'))),
        h(AddBrief, { watchlist: data.watchlist ?? [], rhythms: data.rhythms ?? [], busy, onAdd: (subject, rhythm, hour) => act({ action: 'brief', subject, rhythm, hour }, 'Scheduled. You can change or pause it on the Automation tasks page.').then(Boolean) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own scheduled tasks'),
        h('p', { className: 'dsh-fn-desc' }, 'Tasks you made yourself on the Automation tasks page start in Cowork. Switch one on here and its conversations open in Finance instead: they appear under the Finance tab and the assistant follows the Finance method.'),
        ownTasks.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'You have no scheduled tasks of your own.') : null,
        ownTasks.map((task) => h('div', { key: task.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, task.title),
            h('div', { className: 'dsh-fn-rowdesc' }, `${task.finance ? 'Runs in Finance' : 'Runs in Cowork'}${task.status === 'paused' ? ' · paused' : ''}`)),
          h(Switch, { on: task.finance, label: `Run "${task.title}" in Finance`, onChange: (on) => markTask(task, on) }))),

        h('div', { className: 'dsh-fn-group' }, 'What the assistant is given'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, `A method: figures only from sources it fetched, each with its date; facts, claims, opinions and its own reading kept apart; always a look ahead; always both sides; what it could not find; ${data.adviser === true ? 'then a clear recommendation, with no disclaimer' : 'no buy or sell advice'}.`),
          h('li', null, 'Your selection from the drop-downs, as it was when the conversation started, or as you changed it since in that conversation\'s chat box.'),
          h('li', null, 'Six data tools that need no key or account: a company\'s reported figures and its filings, from the US securities regulator (US-listed companies and many foreign ones); yearly readings for economies from the World Bank; share prices from Yahoo Finance; news from GDELT; and posts from Hacker News, Mastodon and Lemmy.'),
          h('li', null, `${(data.skills ?? []).length} skills, one for each common task: ${(data.skills ?? []).map((skill) => skill.name.replace(/^finance-/, '').replace(/-/g, ' ')).join(', ')}.`)),

        h('div', { className: 'dsh-fn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, data.adviser === true
            ? 'The adviser is on, so the assistant recommends and adds no disclaimer. It is still an AI model working from what it could fetch: it is not a licensed financial adviser and it can be wrong. Decisions are yours.'
            : 'It is research, not advice. The assistant is not a licensed financial adviser, and it is told not to say buy, sell or hold. Decisions are yours. The Adviser switch above changes this.'),
          h('li', null, 'Its own data covers reported company figures, yearly economy readings, daily share prices, news and social posts. It has no estimates and no forecasts: those, and the figures of companies that do not file in the United States, come from what the assistant finds with web search and Deep research, which can be delayed or misread. Each figure should come with its source and date so you can check it.'),
          h('li', null, 'When the assistant uses the data tools, what it looks up is sent to that tool\'s public service: the company or country to the US regulator or the World Bank, share symbols to Yahoo Finance, news search words to GDELT, and social search words or a hashtag to Hacker News (through Algolia), mastodon.social and lemmy.world. No account, no key and nothing about you is sent.'),
          h('li', null, 'With Tools off in a conversation (the Tools button in the chat box), the assistant has no data tools and cannot check a figure. It may still give figures from memory, but it is told to mark each one as from memory and possibly out of date, to say which period it is for when it knows, and never to give it a source or an "as of" date.'),
          h('li', null, 'What people say online is a signal, not a fact, and can be manipulated.'),
          h('li', null, 'Charts come from the Diagram builder, and your own reports can be searched if they are in the Library.'),
          h('li', null, 'A key you paste is kept in the app\'s own secret store on this Mac, not in a settings file. It is sent only to that service, and it is removed from anything the assistant is shown.'),
          h('li', null, 'A scheduled brief runs only while the app is running. It uses your models and counts against the Budget guard like any task.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'finance', order: 111, label: () => t('section.title') }, (props) => h(FinancePage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'finance-bar', order: 40 }, () => h(FinanceBar, { appCtx: ctx }))));
        // After the mode and Web controls of the Modes add-on (orders -22 and -21).
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'finance-selection', order: -19, label: () => 'Finance selection' }, (props) => h(FinanceControls, { ...props, appCtx: ctx }))));
      },
    };
  },
});
