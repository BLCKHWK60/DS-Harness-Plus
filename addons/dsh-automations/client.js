/**
 * Automations, browser half: the Automation runs page (how each scheduled run ended, and what
 * waits for you) and the Settings > Alerts page. The watching and the alerting happen in the
 * server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-automations',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'automations';
    const DICT = {
      en: { 'panel.title': 'Automation runs', 'section.title': 'Alerts' },
      zh: { 'panel.title': '自动任务运行记录', 'section.title': '提醒' },
    };

    const CSS = `
.dsh-au-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-au-head { display: flex; align-items: flex-start; gap: 16px; }
.dsh-au-headtext { flex: 1; min-width: 0; }
.dsh-au-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-au-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-au-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-au-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-au-row[data-top="true"] { align-items: flex-start; }
.dsh-au-rowtext { flex: 1; min-width: 0; }
.dsh-au-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-au-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-au-rowdesc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-words {
  margin: 6px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.dsh-au-words[data-open="true"] { display: block; }
.dsh-au-btns { flex: none; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dsh-au-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-au-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-au-btn:disabled { opacity: .5; cursor: default; }
.dsh-au-link { padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); text-decoration: underline; }
.dsh-au-badge {
  flex: none; display: inline-block; min-width: 68px; box-sizing: border-box; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 18px; text-align: center;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-badge[data-state="ok"] { color: var(--dsw-alias-state-success-primary, #2e9e5b); background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #2e9e5b) 12%, transparent); }
.dsh-au-badge[data-state="failed"] { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dsh-au-badge[data-state="stopped"], .dsh-au-badge[data-state="waiting"] { color: var(--dsw-alias-state-warn-primary, #d9822b); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 12%, transparent); }
.dsh-au-badge[data-state="running"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-au-card {
  display: flex; align-items: center; gap: 16px; margin: 0 0 8px; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 20px;
  border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 8%, transparent);
}
.dsh-au-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-au-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-au-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-au-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-au-field {
  flex: none; box-sizing: border-box; width: 240px; max-width: 50%; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-field[data-small="true"] { width: 90px; text-align: right; }
.dsh-au-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-au-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`;

    const STATE_WORDS = { ok: 'Finished', failed: 'Failed', stopped: 'Stopped', cancelled: 'Cancelled', running: 'Running', waiting: 'Needs you' };
    const WAIT_WORDS = { approval: 'wants your approval', question: 'has a question for you', 'plan-review': 'wants its plan reviewed' };
    const TASK_WORDS = { active: 'On', paused: 'Paused', ended: 'Ended' };

    const num = (value) => Number(value || 0).toLocaleString('en-US');

    /** "Today 09:00", "Yesterday 18:30", or the date and time. */
    function when(value) {
      const at = typeof value === 'number' ? value : Date.parse(value);
      if (!Number.isFinite(at)) return '';
      const date = new Date(at);
      const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = Math.round((day(date) - day(new Date())) / 86400000);
      if (diff === 0) return `Today ${time}`;
      if (diff === -1) return `Yesterday ${time}`;
      if (diff === 1) return `Tomorrow ${time}`;
      const sameYear = date.getFullYear() === new Date().getFullYear();
      return `${date.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
    }

    /** "42 s", "3 min", "1 h 5 min". */
    function took(ms) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      if (seconds < 60) return `${seconds} s`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes} min`;
      return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    }

    const runName = (run) => run.tasks.map((task) => task.title).filter(Boolean).join(', ') || 'A scheduled task';

    async function call(body) {
      const response = await fetch(new URL('dsh-automations/data', document.baseURI), {
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

    /** The page's data, read now and every few seconds while the page is shown. */
    function useData(everyMs) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      const load = () => call()
        .then((next) => { if (alive.current) setData(next); })
        .catch((error) => { if (alive.current) setNote({ text: `Could not load: ${error.message}`, error: true }); });
      useEffect(() => {
        alive.current = true;
        load();
        const timer = everyMs ? setInterval(load, everyMs) : null;
        return () => { alive.current = false; if (timer) clearInterval(timer); };
      }, []);
      return { data, setData, note, setNote, alive, load };
    }

    function openPanel(appCtx, id) {
      try {
        appCtx.get('layout').selectPanel(id);
      } catch {
        /* the app has no such page */
      }
    }

    function openConversation(appCtx, sessionId) {
      openPanel(appCtx, null);
      try {
        appCtx.get('uiWorkspace').openSession(sessionId);
      } catch {
        /* it may have been deleted */
      }
    }

    function Badge({ state }) {
      return h('span', { className: 'dsh-au-badge', 'data-state': state }, STATE_WORDS[state] ?? state);
    }

    function RunRow({ run, appCtx, busy, onAgain }) {
      const [open, setOpen] = useState(false);
      const live = run.state === 'running' || run.state === 'waiting';
      const facts = [`Started ${when(run.startedAt)}`];
      if (!live && run.endedAt) facts.push(`took ${took(run.endedAt - run.startedAt)}`);
      if (run.steps) facts.push(`${num(run.steps)} ${run.steps === 1 ? 'step' : 'steps'}`);
      if (run.tokens) facts.push(`${num(run.tokens)} tokens`);
      const again = (run.state === 'failed' || run.state === 'stopped') && run.tasks.length === 1;
      return h('div', { className: 'dsh-au-row', 'data-top': 'true' },
        h(Badge, { state: run.state }),
        h('div', { className: 'dsh-au-rowtext' },
          h('div', { className: 'dsh-au-rowtitle' }, runName(run)),
          h('div', { className: 'dsh-au-rowdesc' }, facts.join(' · ')),
          run.state === 'waiting' ? h('div', { className: 'dsh-au-rowdesc' }, `It ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}.`) : null,
          run.detail ? h('div', { className: 'dsh-au-rowdesc', 'data-error': String(run.state === 'failed') }, run.detail) : null,
          run.text ? h('div', { className: 'dsh-au-words', 'data-open': String(open), onClick: () => setOpen((value) => !value), title: open ? 'Show less' : 'Show more' }, run.text) : null),
        h('div', { className: 'dsh-au-btns' },
          again ? h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: () => onAgain(run.tasks[0].id) }, 'Run again') : null,
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open')));
    }

    function RunsPage({ appCtx }) {
      const { data, setData, note, setNote, alive } = useData(5000);
      const [busy, setBusy] = useState(false);
      const [all, setAll] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Automation runs'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const runNow = async (id) => {
        setBusy(true);
        try {
          const next = await call({ action: 'run', id });
          if (!alive.current) return;
          setData(next);
          setNote({ text: 'Started. It appears under Last runs in a moment.', error: false });
          setTimeout(() => { if (alive.current) setNote((now) => (now.error ? now : { text: '', error: false })); }, 6000);
        } catch (error) {
          if (alive.current) setNote({ text: `Could not start it: ${error.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      const runs = Array.isArray(data.runs) ? data.runs : [];
      const waiting = runs.filter((run) => run.state === 'waiting');
      const lastOf = (taskId) => runs.find((run) => run.tasks.some((task) => task.id === taskId));
      // A task that has ended and has no recorded run has nothing to show here.
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter((task) => task.status !== 'ended' || lastOf(task.id));
      const shown = all ? runs : runs.slice(0, 20);
      const alerts = data.alerts ?? {};
      const where = [alerts.mac ? 'on this Mac' : '', alerts.phone && !alerts.phoneProblem ? 'on your phone' : ''].filter(Boolean).join(' and ');

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('div', { className: 'dsh-au-head' },
          h('div', { className: 'dsh-au-headtext' },
            h('h2', { className: 'dsh-au-title' }, 'Automation runs'),
            h('p', { className: 'dsh-au-desc' }, 'How each run of your scheduled tasks ended. You create and change the tasks themselves on the Automation tasks page.')),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'schedules') }, 'Automation tasks')),
        data.enabled === false ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, 'Recording is switched off in Settings → Alerts, so new runs do not appear here.') : null,
        note.text ? h('p', { className: 'dsh-au-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        waiting.length > 0 ? h('div', { className: 'dsh-au-group' }, `Needs you (${waiting.length})`) : null,
        waiting.map((run) => h('div', { key: run.id, className: 'dsh-au-card', role: 'status' },
          h('div', { className: 'dsh-au-rowtext' }, h('b', null, runName(run)), ` ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}. Started ${when(run.startedAt)}.`),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open'))),

        h('div', { className: 'dsh-au-group' }, 'Your tasks'),
        tasks.length === 0
          ? h('p', { className: 'dsh-au-desc' }, data.scheduler === false ? 'The app\'s scheduler is not running, so there are no tasks to show.' : 'No scheduled tasks yet. Make one on the Automation tasks page, or ask the assistant to "do this every weekday at 9".')
          : tasks.map((task) => {
            const last = lastOf(task.id);
            const lines = [];
            if (task.status === 'active' && task.nextAt) lines.push(`Next run: ${when(task.nextAt)}`);
            else lines.push(TASK_WORDS[task.status] ?? task.status);
            lines.push(last ? `Last run: ${STATE_WORDS[last.state] ?? last.state}, ${when(last.startedAt)}` : task.deliveredAt ? `Last started ${when(task.deliveredAt)}, before runs were recorded` : 'No run recorded yet');
            return h('div', { key: task.id, className: 'dsh-au-row' },
              last ? h(Badge, { state: last.state }) : h('span', { className: 'dsh-au-badge' }, 'No run yet'),
              h('div', { className: 'dsh-au-rowtext' },
                h('div', { className: 'dsh-au-rowtitle' }, task.title || 'Untitled task'),
                h('div', { className: 'dsh-au-rowdesc' }, lines.join(' · '))),
              h('div', { className: 'dsh-au-btns' },
                h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || task.running || task.status === 'ended', onClick: () => runNow(task.id) }, task.running ? 'Running…' : 'Run now')));
          }),

        h('div', { className: 'dsh-au-group' }, 'Last runs'),
        runs.length === 0
          ? h('p', { className: 'dsh-au-desc' }, 'No run recorded yet. Runs appear here from now on; ones from before this add-on was installed are not listed.')
          : shown.map((run) => h(RunRow, { key: run.id, run, appCtx, busy, onAgain: runNow })),
        runs.length > shown.length ? h('p', { className: 'dsh-au-desc' }, h('button', { type: 'button', className: 'dsh-au-link', onClick: () => setAll(true) }, `Show all ${runs.length}`)) : null,

        h('div', { className: 'dsh-au-group' }, 'Good to know'),
        h('ul', { className: 'dsh-au-list' },
          h('li', null, where ? `You are alerted ${where} when a task fails or needs you. Change this in Settings → Alerts.` : 'Alerts are switched off. Switch them on in Settings → Alerts.'),
          h('li', null, 'Tasks run only while the app is running. It keeps running in the menu bar when the window is closed; nothing runs while the Mac sleeps.'),
          h('li', null, '"Stopped" means a limit or a rule ended the run before it finished, for example the Budget guard.'),
          h('li', null, 'The last 200 runs are kept.')));
    }

    /** The same page inside the app's main area, opened from the sidebar. */
    function RunsPanel({ appCtx }) {
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '28px clamp(16px, 4vw, 48px) 40px' } },
        h('div', { style: { maxWidth: 900, margin: '0 auto' } }, h(RunsPage, { appCtx })));
    }

    function RunsIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 6h3M4 12h3M4 18h3' }), h('path', { d: 'M11 6h9M11 12h9M11 18h9' }));
    }

    // ---- Settings > Alerts ---------------------------------------------------------------------

    function Row({ title, hint, children }) {
      return h('div', { className: 'dsh-au-row' },
        h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, title), hint ? h('div', { className: 'dsh-au-rowdesc' }, hint) : null),
        children);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-au-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** A text box saved when you leave it. */
    function TextField({ value, label, placeholder, small, clean, onCommit }) {
      const [draft, setDraft] = useState(value);
      useEffect(() => setDraft(value), [value]);
      const commit = () => {
        const next = clean ? clean(draft) : String(draft).trim();
        if (next !== value) onCommit(next);
        else setDraft(value);
      };
      return h('input', {
        className: 'dsh-au-field', 'data-small': String(small === true), value: draft, placeholder, 'aria-label': label, spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off',
        inputMode: small ? 'numeric' : undefined,
        onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      });
    }

    /** A topic nobody could guess that is still easy to type on a phone. */
    function madeUpTopic() {
      const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      const text = Array.from(bytes, (byte) => letters[byte % letters.length]).join('');
      return `dsh-${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`;
    }

    const SENT_WORDS = (sent) => {
      const parts = [];
      const stop = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
      if (sent.mac) parts.push(sent.mac === 'ok' ? 'This Mac: sent.' : stop(`This Mac: ${sent.mac}`));
      if (sent.phone) parts.push(sent.phone === 'ok' ? 'Phone: sent.' : stop(`Phone: ${sent.phone}`));
      return parts.join(' ') || 'Nothing was sent: both "On this Mac" and "On my phone" are off.';
    };

    function AlertsPage({ appCtx }) {
      const { data, setData, note, setNote, alive } = useData(0);
      const [busy, setBusy] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Alerts'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const alerts = data.alerts ?? {};
      // The page's names for the settings, and the names they are saved under.
      const KEYS = { failed: 'alertFailed', needs: 'alertNeeds', finished: 'alertFinished', others: 'alertOthers' };
      const save = async (values) => {
        try {
          await setSettings(appCtx, Object.fromEntries(Object.entries(values).map(([key, value]) => [KEYS[key] ?? key, value])));
          if (!alive.current) return;
          setData((d) => ({ ...d, ...('enabled' in values ? { enabled: values.enabled } : {}), alerts: { ...d.alerts, ...values } }));
          setNote({ text: 'Saved.', error: false });
          // Read it back, so a problem with the new values shows at once.
          call().then((next) => { if (alive.current) setData(next); }).catch(() => {});
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };
      const test = async () => {
        setBusy(true);
        try {
          const next = await call({ action: 'test' });
          if (!alive.current) return;
          setData(next);
          const sent = next.sent ?? {};
          setNote({ text: SENT_WORDS(sent), error: [sent.mac, sent.phone].some((value) => value && value !== 'ok') });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not send the test: ${error.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-au-title' }, 'Alerts'),
        h('p', { className: 'dsh-au-desc' }, 'A short line when a task fails, needs you or finishes, so you can walk away. The line has the task\'s name and what happened, for example "Morning brief failed". It never has your instruction or the answer in it.'),
        note.text ? h('p', { className: 'dsh-au-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-au-group' }, 'Alert me when'),
        h(Row, { title: 'A task failed or was stopped' }, h(Switch, { on: alerts.failed, label: 'A task failed or was stopped', onChange: (on) => save({ failed: on }) })),
        h(Row, { title: 'A task needs me', hint: 'It waits for your approval, your answer to a question, or your review of its plan.' }, h(Switch, { on: alerts.needs, label: 'A task needs me', onChange: (on) => save({ needs: on }) })),
        h(Row, { title: 'A task finished' }, h(Switch, { on: alerts.finished, label: 'A task finished', onChange: (on) => save({ finished: on }) })),

        h('div', { className: 'dsh-au-group' }, 'For which tasks'),
        h(Row, { title: 'Scheduled tasks', hint: 'Always, when alerts are on. The alert names the task.' }, null),
        h(Row, { title: 'Also conversations I start myself', hint: 'The alert names the project folder, not the conversation.' }, h(Switch, { on: alerts.others, label: 'Also conversations I start myself', onChange: (on) => save({ others: on }) })),
        alerts.others ? h(Row, { title: 'Only when the task has run at least this many minutes', hint: 'So that quick answers you are waiting for at your desk stay quiet. 0 alerts every time.' },
          h(TextField, { value: String(alerts.othersMinutes ?? 2), label: 'Minutes', small: true, clean: (text) => String(Math.max(0, Math.floor(Number(text) || 0))), onCommit: (next) => save({ othersMinutes: Number(next) }) })) : null,

        h('div', { className: 'dsh-au-group' }, 'Where'),
        h(Row, { title: 'On this Mac', hint: alerts.macError ? `Last try failed: ${alerts.macError}` : 'A normal notification. The first time, macOS may ask whether "Script Editor" may show notifications: allow it.' }, h(Switch, { on: alerts.mac, label: 'On this Mac', onChange: (on) => save({ mac: on }) })),
        h(Row, { title: 'On my phone', hint: alerts.phone && (alerts.phoneProblem || alerts.phoneError) ? `Not working: ${alerts.phoneProblem || alerts.phoneError}` : alerts.phone ? 'Through the free ntfy app.' : 'Through the free ntfy app. Set it up below first.' }, h(Switch, { on: alerts.phone, label: 'On my phone', onChange: (on) => save({ phone: on }) })),
        h(Row, { title: 'Topic', hint: 'The name your phone listens to. Anyone who knows it can read your alerts, so it must be hard to guess.' },
          h('div', { className: 'dsh-au-btns' },
            alerts.ntfyTopic ? null : h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => save({ ntfyTopic: madeUpTopic() }) }, 'Make one up'),
            h(TextField, { value: alerts.ntfyTopic ?? '', label: 'Topic', placeholder: 'No topic yet', onCommit: (next) => save({ ntfyTopic: next }) }))),
        h(Row, { title: 'Server', hint: 'Leave this as it is unless you run your own ntfy server.' },
          h(TextField, { value: alerts.ntfyServer ?? '', label: 'Server', placeholder: 'https://ntfy.sh', onCommit: (next) => save({ ntfyServer: next || 'https://ntfy.sh' }) })),
        h(Row, { title: 'Try it', hint: 'Sends one sample alert to every place that is switched on.' },
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: test }, busy ? 'Sending…' : 'Send a test alert')),

        h('div', { className: 'dsh-au-group' }, 'Set up your phone'),
        h('ol', { className: 'dsh-au-list' },
          h('li', null, 'Install the free app "ntfy" from the App Store or Google Play. It needs no account.'),
          h('li', null, 'Here, press "Make one up" next to Topic (or type your own long, odd name).'),
          h('li', null, 'In the app, tap +, type exactly the same topic, and subscribe.'),
          h('li', null, 'Here, switch on "On my phone" and press "Send a test alert". Your phone should show it within a few seconds.')),

        h('div', { className: 'dsh-au-group' }, 'Everything'),
        h(Row, { title: 'Record runs and send alerts', hint: 'Off records no runs on the Automation runs page and sends no alerts.' }, h(Switch, { on: data.enabled !== false, label: 'Record runs and send alerts', onChange: (on) => save({ enabled: on }) })),

        h('div', { className: 'dsh-au-group' }, 'Good to know'),
        h('ul', { className: 'dsh-au-list' },
          h('li', null, 'Phone alerts travel through the ntfy service, which can read them. That is why they carry only a name and what happened.'),
          h('li', null, 'The free service allows 250 alerts a day. This add-on sends at most 10 a minute.'),
          h('li', null, 'Alerts are sent only while the app is running, and the phone alert needs the Mac to be online.'),
          h('li', null, 'You cannot answer from the phone yet. Open the app to approve or reply.'),
          h('li', null, 'The topic is saved with the app\'s other settings on this Mac, as plain text.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'alerts', order: 22, label: () => t('section.title') }, (props) => h(AlertsPage, { ...props, appCtx: ctx }))),
        );
        // A full page with its own sidebar row (the Cowork sidebar lists it under the Cowork tab).
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'automations' }, () => h(RunsPanel, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'automations', order: 21, label: () => t('panel.title') }, RunsIcon)));
      },
    };
  },
});
