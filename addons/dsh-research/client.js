/**
 * Research, browser half: the Focus dropdown in a Research conversation's chat box (Depth is the
 * Modes add-on's Depth button, the same in every tab), a
 * start-page line that shows problems only, the Settings >
 * Research page, and the live progress of a Deep research run above the message box, with its
 * follow-up questions as buttons once it is done.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-research',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'research';
    const DICT = { en: { 'section.title': 'Research' }, zh: { 'section.title': '研究' } };

    const CSS = `
.dsh-rs-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-rs-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-rs-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rs-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-rs-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-rs-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rs-rowtext { flex: 1; min-width: 0; }
.dsh-rs-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-rs-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rs-btn { flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-rs-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rs-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-rs-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-rs-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-rs-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-rs-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }

/* Start page: only while the Research tab is selected. */
.dsh-rs-bar { display: none; }
html[data-cws-tab="research"] .dsh-rs-bar { position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
html[data-cws-tab="research"] [class*='_composerHero']:has(.dsh-rs-bar) { position: relative; }
html[data-cws-tab="research"] [class*='_composerHero']:has(.dsh-rs-bar) .cws-chips { margin-top: calc(var(--dsh-rs-bar, 90px) + 36px); }
.dsh-rs-seg { display: inline-flex; padding: 2px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-rs-seg button { height: 30px; padding: 0 14px; border: 0; border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); background: transparent; }
.dsh-rs-seg button[aria-pressed="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dsh-rs-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-rs-hint { text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }

/* Depth and Focus in the chat box, like the app's own buttons there. */
.dsh-rs-ctls { display: inline-flex; gap: 6px; align-items: center; }
.dsh-rs-ctl { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; }
.dsh-rs-ctl:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rs-ctl .v { color: var(--dsw-alias-label-primary); }
@media (max-width: 760px) { .dsh-rs-ctl .v { display: none; } }
.dsh-rs-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: 320px; max-width: calc(100vw - 24px); padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-rs-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-rs-pop .opts { display: flex; flex-direction: column; gap: 2px; margin: 8px -6px 0; }
.dsh-rs-pop .opts button { display: block; width: 100%; text-align: left; border: 0; border-radius: 10px; padding: 7px 10px; background: transparent; font: inherit; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-rs-pop .opts button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rs-pop .opts button[aria-current='true'] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent); }
.dsh-rs-pop .opts b { display: block; font-size: 13px; line-height: 18px; font-weight: 600; }
.dsh-rs-pop .opts small { display: block; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dsh-rs-pop .note { margin-top: 8px; color: var(--dsw-alias-label-secondary); }

/* The progress strip above the message box. */
.dsh-rs-dock { margin: 0 0 8px; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, transparent); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rs-dock b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.dsh-rs-steps { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 4px; }
.dsh-rs-step { padding: 0 8px; border-radius: 8px; line-height: 20px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-rs-step[data-now="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.dsh-rs-step[data-done="true"] { color: var(--dsw-alias-label-primary); }
.dsh-rs-q { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-rs-follow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.dsh-rs-follow button { max-width: 100%; text-align: left; padding: 5px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-rs-follow button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rs-x { float: right; border: 0; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; line-height: 14px; }
`;

    /** What Depth cannot change: a run started from a program stops at the app's program time limit. */
    const programNote = (minutes) => (minutes ? `In conversations that run tools through programs (the app's PTC preset), searching stops after about ${minutes} minute${minutes === 1 ? '' : 's'} and the report is written in the time left before the app\'s program limit, so a longer depth may do fewer rounds there.` : '');

    const STEPS = [['planning', 'Plan'], ['searching', 'Search'], ['reviewing', 'Review'], ['writing', 'Write'], ['done', 'Done']];

    async function readData() {
      const response = await fetch(new URL('dsh-research/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      return response.json();
    }
    async function post(body, query = '') {
      const response = await fetch(new URL(`dsh-research/data${query}`, document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }
    async function setIn(ctx, ns, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      const revisionOf = async () => {
        const result = await ctx.remote.settings.describe();
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
        const view = result.value.namespaces.find((entry) => entry.ns === ns);
        if (!view) throw new Error(`${ns} is not running`);
        return view.revision;
      };
      let result = await ctx.remote.settings.mutate(ns, ops, await revisionOf());
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(ns, ops, await revisionOf());
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    const listeners = new Set();
    const tell = () => { for (const listener of listeners) listener(); };
    function useData() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const alive = useRef(true);
      const load = () => readData().then((next) => { if (alive.current) { setData(next); setError(''); } }).catch((problem) => { if (alive.current) setError(problem.message); });
      useEffect(() => {
        alive.current = true;
        load();
        listeners.add(load);
        return () => { alive.current = false; listeners.delete(load); };
      }, []);
      return { data, setData, error, alive, load };
    }

    function Segments({ items, value, label, onPick }) {
      return h('div', { className: 'dsh-rs-seg', role: 'group', 'aria-label': label },
        items.map((item) => h('button', { key: item.id, type: 'button', 'aria-pressed': value === item.id, title: item.hint, onClick: () => onPick(item.id) }, item.label)));
    }

    /** The Research tab's start-page line: shown only when something is wrong (the engine missing, the mode not added). */
    function ResearchBar({ appCtx }) {
      const { data, setData } = useData();
      const [failed, setFailed] = useState('');
      const bar = useRef(null);
      const shown = Boolean(data && data.enabled === true);
      useEffect(() => {
        const node = bar.current;
        if (!node || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-rs-bar', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-rs-bar'); };
      }, [shown]);
      if (!shown) return h('style', null, CSS);
      // Depth and Focus are in the chat box (ResearchControls); here only what needs saying.
      if (!data.problem) return h('style', null, CSS);
      return h('div', { ref: bar, className: 'dsh-rs-bar', role: 'status' },
        h('style', null, CSS),
        h('div', { className: 'dsh-rs-hint', 'data-error': 'true' }, data.problem));
    }

    /** One dropdown in the chat box: a button with its value, and a list with a line on each choice. */
    function DropButton({ label, items, value, busy, note, onPick }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 332)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      const chosen = items.find((item) => item.id === value) ?? items[0];
      return h(React.Fragment, null,
        h('button', { ref: button, type: 'button', className: 'dsh-rs-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, disabled: busy, title: `${label}: ${chosen?.label ?? ''}. ${chosen?.about ?? ''}`, onClick: () => setOpen(!open) },
          h('span', null, label), h('span', { className: 'v' }, `· ${chosen?.label ?? ''}`),
          h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M2 6.5 5 3.5 8 6.5' }))),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-rs-pop', role: 'dialog', 'aria-label': label, style: { left: place.left, bottom: place.bottom } },
                h('style', null, CSS),
                h('div', { className: 'title' }, label),
                h('div', { className: 'opts', role: 'listbox', 'aria-label': label },
                  items.map((item) => h('button', { key: item.id, type: 'button', role: 'option', 'aria-selected': item.id === value, 'aria-current': String(item.id === value), onClick: () => { setOpen(false); onPick(item.id); } },
                    h('b', null, item.label), h('small', null, item.about)))),
                note ? h('div', { className: 'note' }, note) : null),
              document.body,
            )
          : null);
    }

    /** Focus in the chat box of a Research conversation (Depth is the Modes add-on's button there, as in every tab). */
    function ResearchControls({ appCtx, sessionId }) {
      const [view, setView] = useState(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => {
        let alive = true;
        let timer;
        const tick = async () => {
          try {
            const response = await fetch(new URL(`dsh-research/data${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
            if (response.ok && alive) setView(await response.json());
          } catch {
            /* tried again shortly */
          }
          // tick also runs when another control calls tell(): restart the one chain, never start a second.
          clearTimeout(timer);
          if (alive) timer = setTimeout(tick, document.hidden ? 15000 : 4000);
        };
        void tick();
        listeners.add(tick);
        return () => { alive = false; clearTimeout(timer); listeners.delete(tick); };
      }, [sessionId]);
      if (!view || view.enabled !== true || !view.session?.inResearch) return null;
      const pickFocus = async (id) => {
        setBusy(true);
        setView((v) => ({ ...v, focus: id, session: { ...v.session, focus: id } }));
        try {
          // With the conversation in the query the reply says it is a Research one, so the controls stay.
          setView(await post({ action: 'focus', sessionId, focus: id }, `?session=${encodeURIComponent(sessionId)}`));
          tell();
        } catch {
          /* the next refresh shows what is saved */
        } finally {
          setBusy(false);
        }
      };
      return h('span', { className: 'dsh-rs-ctls' },
        h('style', null, CSS),
        h(DropButton, { label: 'Focus', items: view.focuses ?? [], value: view.session.focus ?? view.focus, busy, onPick: (id) => void pickFocus(id) }));
    }

    /** The latest Deep research run of a conversation. */
    function useRun(sessionId) {
      const [run, setRun] = useState(null);
      useEffect(() => {
        if (!sessionId) { setRun(null); return undefined; }
        let alive = true;
        let timer;
        const tick = async () => {
          let next = null;
          try {
            const response = await fetch(new URL(`dsh-deep-research/progress?session=${encodeURIComponent(sessionId)}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
            if (response.ok) next = (await response.json()).run ?? null;
          } catch {
            next = null;
          }
          if (!alive) return;
          setRun(next);
          const busy = next && !['done', 'failed', 'stopped'].includes(next.stage);
          timer = setTimeout(tick, document.hidden ? 15000 : busy ? 2000 : 8000);
        };
        void tick();
        return () => { alive = false; clearTimeout(timer); };
      }, [sessionId]);
      return run;
    }

    const clock = (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    /** Follow-up questions already used or put away, per conversation and run. */
    const dismissed = new Set();

    /** Above the message box: what a research run is doing, and its follow-up questions once done. */
    function ProgressDock({ sessionId, appCtx }) {
      const run = useRun(sessionId);
      const [, bump] = useState(0);
      const [note, setNote] = useState('');
      if (!run) return null;
      const key = `${sessionId}:${run.startedAt}`;
      const busy = !['done', 'failed', 'stopped'].includes(run.stage);
      const recent = Date.now() - (run.endedAt || 0) < 6 * 60 * 60 * 1000;
      if (!busy && (dismissed.has(key) || !recent)) return null;
      if (!busy && run.stage === 'done' && run.followups.length === 0) return null;
      const send = async (text) => {
        try {
          const remote = appCtx.get('remote.session');
          if (!remote?.prompt) throw new Error('this version of the app cannot send from here; copy the question into the message box');
          dismissed.add(key);
          bump((n) => n + 1);
          const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `follow-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text }] });
          if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'refused');
        } catch (problem) {
          dismissed.delete(key);
          setNote(`Could not send: ${problem.message}`);
        }
      };
      const at = STEPS.findIndex(([id]) => id === run.stage);
      const elapsed = (run.endedAt || run.now) - run.startedAt;
      return h('div', { className: 'dsh-rs-dock', role: 'status', 'aria-live': 'polite' },
        h('style', null, CSS),
        busy ? null : h('button', { type: 'button', className: 'dsh-rs-x', 'aria-label': 'Close', title: 'Close', onClick: () => { dismissed.add(key); bump((n) => n + 1); } }, '×'),
        h('div', null,
          h('b', null, busy ? 'Researching' : run.stage === 'done' ? 'Research done' : run.stage === 'stopped' ? 'Research stopped' : 'Research failed'),
          ` · ${run.depth}${run.focus && run.focus !== 'web' ? ` · ${run.focus}` : ''}${run.rounds > 1 && run.round > 0 ? ` · round ${run.round} of ${run.rounds}` : ''} · ${run.searches} searches · ${run.pages} pages read · ${run.sources} sources · ${clock(elapsed)}${busy ? ` of about ${run.minutes} min` : ''}`),
        busy ? h('div', { className: 'dsh-rs-steps' }, STEPS.slice(0, 4).map(([id, label], index) => h('span', { key: id, className: 'dsh-rs-step', 'data-now': String(index === at), 'data-done': String(index < at) }, label))) : null,
        busy && run.queries.length ? h('div', { className: 'dsh-rs-q', title: run.queries.join('\n') }, `Searching: ${run.queries.slice(-2).map((query) => `"${query}"`).join(', ')}`) : null,
        busy && run.hosts.length ? h('div', { className: 'dsh-rs-q', title: run.hosts.join(', ') }, `Reading: ${run.hosts.slice(-4).join(', ')}`) : null,
        busy && run.helpers > 0 ? h('div', null, `${run.helpers} helper${run.helpers === 1 ? '' : 's'} at work`) : null,
        !busy && run.error ? h('div', null, run.error) : null,
        !busy && run.followups.length ? h('div', { className: 'dsh-rs-follow' }, run.followups.map((question) => h('button', { key: question, type: 'button', title: 'Ask this next', onClick: () => void send(question) }, question))) : null,
        note ? h('div', null, note) : null);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-rs-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    function ResearchPage({ appCtx }) {
      const { data, setData, error, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      if (!data) return h('div', { className: 'dsh-rs-page' }, h('style', null, CSS), h('h2', { className: 'dsh-rs-title' }, 'Research'), h('p', { className: 'dsh-rs-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      const save = async (ns, values, done) => {
        try {
          await setIn(appCtx, ns, values);
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          tell();
          setTimeout(load, 1500);
        } catch (problem) {
          setNote({ text: `Could not save: ${problem.message}`, error: true });
        }
      };
      return h('div', { className: 'dsh-rs-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-rs-title' }, 'Research'),
        h('p', { className: 'dsh-rs-desc' }, 'A tab for researching a question in depth. The assistant plans sub-questions, searches and reads many sources with helpers working at once, reviews what is missing and searches again, then writes a report that cites its sources by number. Every citation is checked to be in the source list, and each source is marked "read", "seen only in search results, not read" or "not read, and not seen in search results"; claims are not compared with the pages. You see each stage as it happens, and the report ends with follow-up questions you can ask with one click.'),
        note.text ? h('p', { className: 'dsh-rs-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-rs-desc', 'data-error': 'true' }, data.problem) : null,
        h('div', { className: 'dsh-rs-group' }, 'The tab'),
        h('div', { className: 'dsh-rs-row' },
          h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Show the Research tab'), h('div', { className: 'dsh-rs-rowdesc' }, 'Needs the Deep research add-on. Off takes the tab away; saved reports are kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Research tab', onChange: (on) => void save(NS, { enabled: on }, on ? 'Switched on. The Research tab appears in the sidebar in a moment.' : 'Switched off.') })),
        h('div', { className: 'dsh-rs-group' }, 'Depth and focus'),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Depth'), h('div', { className: 'dsh-rs-rowdesc' }, `The same Depth as in every tab: pick it with the Depth button in the chat box; Settings → Modes sets where new conversations start. For a research run it sets how long the run takes and how many helpers work at once: ${(data.depths ?? []).map((item) => `${item.label}, ${item.about.charAt(0).toLowerCase()}${item.about.slice(1)}`).join(' ')}${data.programMinutes ? ` ${programNote(data.programMinutes)}` : ''}`))),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Focus'), h('div', { className: 'dsh-rs-rowdesc' }, 'Where a run looks first. A conversation keeps the focus it started with.')),
          h(Segments, { items: data.focuses ?? [], value: data.focus, label: 'Focus', onPick: (id) => void save(NS, { focus: id }, 'Focus saved.') })),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Model for the helpers'), h('div', { className: 'dsh-rs-rowdesc' }, (data.helperModels ?? []).find((item) => item.id === data.helperModel)?.hint ?? '')),
          h(Segments, { items: data.helperModels ?? [], value: data.helperModel, label: 'Model for the helpers', onPick: (id) => void save('modes', { researchModel: id }, 'Saved. It also applies to Mission, Agent swarm and the other helper tools, unless a conversation chose otherwise.') })),
        h('div', { className: 'dsh-rs-group' }, 'Saved reports'),
        h('p', { className: 'dsh-rs-desc' }, `Every report from the Research tab is saved as a Markdown file in ${data.folder}.`),
        (data.reports ?? []).length === 0 ? h('p', { className: 'dsh-rs-desc' }, 'No report saved yet.') : h('ul', { className: 'dsh-rs-list' }, data.reports.map((report) => h('li', { key: report.name }, `${report.name} (${report.date})`))),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }), h('button', { type: 'button', className: 'dsh-rs-btn', onClick: () => void post({ action: 'reveal' }).catch((problem) => setNote({ text: problem.message, error: true })) }, 'Show in Finder')),
        h('div', { className: 'dsh-rs-group' }, 'Good to know'),
        h('ul', { className: 'dsh-rs-list' },
          h('li', null, 'The helpers search with your web search provider. In other tabs, the Depth button in the chat box sets how much the assistant searches by itself (with Web on); in-depth research with helpers is here.'),
          h('li', null, 'A Thorough run can start more than 25 helper runs. With a cloud model that costs tokens; with a local one it takes time.'),
          h('li', null, 'Sources are pages from the web. The report marks which ones a helper read and which were seen only in search results. Claims are not compared with the pages, so check the important ones yourself.'),
          h('li', null, 'Research conversations run Read Only: the assistant cannot change your files without asking you first. Leaving Research puts back the access level the conversation had before. Reports and diagrams are still saved.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'research', order: 110, label: () => t('section.title') }, (props) => h(ResearchPage, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'research-bar', order: 42 }, () => h(ResearchBar, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'research-controls', order: -20, label: () => 'Depth and focus' }, (props) => h(ResearchControls, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'research-progress', order: 4 }, (props) => h(ProgressDock, { ...props, appCtx: ctx }))));
      },
    };
  },
});
