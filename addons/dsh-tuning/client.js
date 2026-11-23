/**
 * Tuner Plus, browser half: Settings > Tuner Plus, with its bar (Model, Goal, Data sets, Method, Budget,
 * Look only, the run in one sentence), the result cards, the data sets, the exam, the shelf, the night shift,
 * and the switches. The work is in the server half; every change here is the owner's own action.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-tuning',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;
    // ---- dsh-kit:begin ---- shared small helpers; this block is the same in every add-on page file that uses it.
    // The master copy is docs/shared/dsh-kit.js. Change it there, then run `node scripts/sync-kit.mjs` (it copies the block into
    // every client.js that has the two marker lines, and `bash scripts/check.sh` fails when a copy has drifted).
    // Dependency-free: plain DOM for the question box, React is passed in for the error note.
    const dshKit = (() => {
      const STYLE_ID = 'dsh-kit-style';
      const CSS = `
    .dsh-kit-veil { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; background: color-mix(in srgb, #000 32%, transparent); }
    .dsh-kit-box { width: min(420px, 100%); box-sizing: border-box; padding: 16px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font: 14px/22px system-ui, sans-serif; }
    .dsh-kit-title { margin: 0 0 4px; font-size: 14px; line-height: 22px; font-weight: 500; }
    .dsh-kit-text { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 50vh; overflow: auto; }
    .dsh-kit-field { display: block; width: 100%; box-sizing: border-box; height: 36px; margin-top: 10px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dsh-kit-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-label { display: block; margin-top: 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dsh-kit-label + .dsh-kit-field { margin-top: 2px; }
    .dsh-kit-row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .dsh-kit-btn { height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dsh-kit-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dsh-kit-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-note { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dsh-kit-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-more { margin-left: 6px; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dsh-kit-detail { display: block; margin-top: 4px; font: 11px/16px ui-monospace, Menlo, monospace; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; user-select: text; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Turns what a failed call says ("error 404", "settings/conflict: ...") into a plain sentence; the raw text goes to `details`. */
      const plain = (raw) => {
        let message = '';
        if (typeof raw === 'string') message = raw;
        else if (raw && typeof raw === 'object') {
          const source = raw.rpcError ?? (raw.error && typeof raw.error === 'object' ? raw.error : raw);
          message = String(source.message ?? raw.error ?? '');
          if (source.code && !message.includes(String(source.code))) message = `${source.code}: ${message}`;
        }
        const existing = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : '';
        message = message.trim();
        const text = (sentence) => ({ text: sentence, details: existing || (message && message !== sentence ? message : '') });
        const status = /^(?:error|status|http)?\s*(\d{3})\b/i.exec(message)?.[1] ?? /(?:answered|returned)\s+(\d{3})\b/i.exec(message)?.[1] ?? '';
        if (/settings\/conflict/i.test(message)) return text('This setting was changed somewhere else at the same moment. Please try again.');
        if (/not mounted|namespace not mounted|settings unavailable|is switched off|is not running/i.test(message)) return text('This add-on is not running. Switch it on (or restart the app) and try again.');
        if (/failed to fetch|networkerror|load failed|network request failed|econnrefused/i.test(message)) return text('Could not reach the app. Check that it is still running, then try again.');
        if (status === '401' || status === '403') return text('The app did not allow this. Restart the app and try again.');
        if (status === '404') return text('This part of the add-on is not available. It may be switched off, or the app needs a restart after an update.');
        if (status === '408' || status === '504') return text('The app took too long to answer. Try again in a moment.');
        if (status === '409') return text('This changed somewhere else at the same moment. Please try again.');
        if (/^5\d\d$/.test(status)) return text('The add-on ran into a problem. Try again; if it keeps happening, restart the app.');
        if (/^4\d\d$/.test(status)) return text('The app could not use this request. Try again; if it keeps happening, restart the app.');
        // "code/name: message": show the message, keep the code as a detail.
        const coded = /^([a-z][\w-]*(?:\/[\w.-]+)+):\s*(.+)$/is.exec(message);
        if (coded) return { text: coded[2].trim(), details: existing || message };
        // A readable sentence stays as it is.
        if (/^[A-Z"'(].*\s/s.test(message) || /\s/.test(message)) return { text: message, details: existing };
        if (!message) return { text: 'Something went wrong. Try again.', details: existing };
        return text('Something went wrong. Try again; the Details line says what the app reported.');
      };
      /** An Error whose message is the plain sentence and whose `details` keeps the raw text. */
      const fail = (raw) => {
        const found = plain(raw);
        const error = new Error(found.text);
        error.details = found.details;
        return error;
      };

      /**
       * A small question box in the page's own style (window.prompt does nothing in the desktop app, and the native
       * confirm cannot be styled or checked there). Resolves true/false; with `field` the typed text or null; `notice` shows OK only.
       */
      const ask = (options = {}) => new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(options.field ? null : false); return; }
        ensureStyle();
        const before = document.activeElement;
        const veil = document.createElement('div');
        veil.className = 'dsh-kit-veil';
        const box = document.createElement('div');
        box.className = 'dsh-kit-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        const add = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
        if (options.title) { const title = add('p', 'dsh-kit-title', options.title); box.appendChild(title); box.setAttribute('aria-label', options.title); }
        if (options.text) box.appendChild(add('p', 'dsh-kit-text', options.text));
        let input = null;
        if (options.field) {
          if (options.field.label) box.appendChild(add('label', 'dsh-kit-label', options.field.label));
          input = add('input', 'dsh-kit-field');
          input.type = 'text';
          input.value = options.field.value ?? '';
          if (options.field.placeholder) input.placeholder = options.field.placeholder;
          if (options.field.label) input.setAttribute('aria-label', options.field.label);
          box.appendChild(input);
        }
        const row = add('div', 'dsh-kit-row');
        const done = (value) => { document.removeEventListener('keydown', onKey, true); veil.remove(); try { before?.focus?.(); } catch { /* the old control is gone */ } resolve(value); };
        const cancel = options.notice ? null : add('button', 'dsh-kit-btn', options.cancel ?? 'Cancel');
        const ok = add('button', 'dsh-kit-btn', options.ok ?? 'OK');
        ok.type = 'button';
        ok.setAttribute('data-main', 'true');
        if (options.danger) ok.setAttribute('data-danger', 'true');
        const accept = () => done(input ? input.value : true);
        const reject = () => done(input ? null : false);
        function onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (options.notice) accept(); else reject(); }
          else if (event.key === 'Enter' && input && document.activeElement === input) { event.preventDefault(); event.stopPropagation(); accept(); }
          else if (event.key === 'Tab') {
            const stops = [...box.querySelectorAll('input,button')];
            const at = stops.indexOf(document.activeElement);
            if (stops.length > 0) { event.preventDefault(); stops[(at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus(); }
          }
        }
        if (cancel) { cancel.type = 'button'; cancel.addEventListener('click', reject); row.appendChild(cancel); }
        ok.addEventListener('click', accept);
        row.appendChild(ok);
        box.appendChild(row);
        veil.appendChild(box);
        veil.addEventListener('mousedown', (event) => { if (event.target === veil && !options.notice) reject(); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(veil);
        // A question that can destroy something starts on Cancel, so a stray Enter never confirms it.
        (input ?? (options.danger && cancel ? cancel : ok)).focus();
        if (input) input.select();
      });

      /** The note to draw under a form or at the top of a page: a plain sentence and a "Details" button. */
      const makeNote = (React) => function PlainNote({ error, text, details, kind }) {
        ensureStyle();
        const [open, setOpen] = React.useState(false);
        const found = error !== undefined && error !== null && error !== '' ? plain(error) : { text: text ?? '', details: details ?? '' };
        if (!found.text) return null;
        const bad = kind ? kind === 'error' : error !== undefined && error !== null && error !== '';
        return React.createElement('div', { className: 'dsh-kit-note', 'data-error': String(bad), role: bad ? 'alert' : 'status' },
          found.text,
          found.details ? React.createElement('button', { type: 'button', className: 'dsh-kit-more', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null,
          open && found.details ? React.createElement('span', { className: 'dsh-kit-detail' }, found.details) : null);
      };
      return { plain, fail, ask, makeNote };
    })();
    // ---- dsh-kit:end ----
    const PlainNote = dshKit.makeNote(React);

    const NS = 'tuning';
    const DICT = { en: { 'section.title': 'Tuner Plus' } };
    const when = (at) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const pct = (rate) => `${Math.round((Number(rate) || 0) * 100)}%`;

    const CSS = `
.dsh-tp-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-tp-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-tp-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-line; }
.dsh-tp-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-tp-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-tp-row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-tp-rowtext { flex: 1; min-width: 0; }
.dsh-tp-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-tp-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-line; }
.dsh-tp-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-tp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tp-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-tp-btn:disabled { opacity: .5; cursor: default; }
.dsh-tp-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); }
.dsh-tp-input { box-sizing: border-box; height: 30px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-tp-input.wide { width: 100%; margin-top: 6px; }
.dsh-tp-select { height: 30px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-tp-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-tp-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-tp-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-tp-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-tp-switch:disabled { opacity: .5; cursor: default; }
.dsh-tp-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding: 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-tp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-tp-sentence { flex-basis: 100%; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-tp-card { margin-top: 8px; padding: 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-tp-card b { font-weight: 500; }
.dsh-tp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.dsh-tp-checks { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; }
.dsh-tp-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-tp-skill { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-tp-skill input { margin-top: 4px; }
.dsh-tp-mark { display: inline-block; margin-left: 8px; padding: 0 6px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 6px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-tp-mark[data-mark="unsorted"] { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.dsh-tp-textarea { box-sizing: border-box; width: 100%; min-height: 120px; margin-top: 6px; padding: 8px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); background: transparent; resize: vertical; }
.dsh-tp-answer { margin-top: 6px; padding: 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-tuning/data', document.baseURI), body
        ? { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    function Switch({ on, label, busy, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-tp-switch', 'aria-checked': on === true, 'aria-label': label, disabled: busy, onClick: () => onChange(!on) });
    }
    /**
     * The skills part: its switch, a count for each mark, every skill the app can see with its mark, and
     * sorting by hand (several at a time) for the ones nobody can place.
     */
    function SkillsSection({ skills, busy, act, set, enabled }) {
      const [picked, setPicked] = useState([]);
      const [opened, setOpened] = useState([]);
      const [filter, setFilter] = useState('all');
      const [form, setForm] = useState(null);
      const on = skills?.on === true;
      const rows = Array.isArray(skills?.rows) ? skills.rows : [];
      const marks = skills?.marks ?? {};
      const unsorted = rows.filter((row) => row.mark === 'unsorted');
      const shared = (row) => (row.hiddenIn ?? []).length > 0 || row.hides > 0;
      const shown = rows.filter((row) => filter === 'all' || (filter === 'shared' ? shared(row) : row.mark === filter));
      const ordered = [...shown.filter((row) => row.mark === 'unsorted'), ...shown.filter((row) => row.mark !== 'unsorted')];
      const last = (path) => String(path ?? '').split('/').filter(Boolean).slice(-3).join('/');
      const sharedLine = (row) => [
        row.hides > 0 ? `The model gets this one; it hides ${row.hides} other skill${row.hides === 1 ? '' : 's'} of the same name.` : '',
        ...(row.hiddenIn ?? []).map((one) => `Hidden behind the ${one.byName} in ${last(one.byPlace)} in the project ${String(one.project ?? '').split('/').pop() || 'folder'}: the model never gets this one there.`),
      ].filter(Boolean).join('\n');
      const toggle = (key) => setPicked((now) => (now.includes(key) ? now.filter((one) => one !== key) : [...now, key]));
      const sortAs = (mark) => { void act({ action: 'skillsSort', keys: picked, mark }, 'Sorted.').then((ok) => { if (ok) setPicked([]); }); };
      const projects = Array.isArray(skills?.projects) ? skills.projects : [];
      const drafts = Array.isArray(skills?.drafts) ? skills.drafts : [];
      const openForm = () => setForm({ name: '', description: '', text: '', scope: projects.length > 0 ? 'project' : 'everywhere', project: projects[0]?.path ?? '' });
      const chosen = form && form.scope === 'project' ? projects.find((one) => one.path === form.project) : undefined;
      const saveDraft = () => { void act({ action: 'skillDraft', name: form.name, description: form.description, text: form.text, scope: form.scope, project: form.project }).then((ok) => { if (ok) setForm(null); }); };
      const ladder = Array.isArray(skills?.ladder) ? skills.ladder : [];
      const newSkill = !on ? null : form === null
        ? h('div', null,
          h('div', { className: 'dsh-tp-actions' },
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: openForm }, 'New skill…'),
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'From what was gathered: jobs done several times with a checked result, points you corrected more than once, jobs a stronger run finished, tools that failed first, add-ons with lessons and no skill. Each comes as a card.', onClick: () => void act({ action: 'skillIdeas' }) }, 'Look for skill ideas')),
          ladder.length > 0 ? h('p', { className: 'dsh-tp-desc' }, `Where a skill sits among Tuner Plus's homes: ${ladder.map((step) => (typeof step.n === 'number' ? `${step.n} ${step.name}` : step.name)).join(' · ')}. A rule that always applies belongs in instructions; know-how for one kind of job, needed only sometimes, in a skill. You can also ask for a skill in a thread.`) : null)
        : h('div', { className: 'dsh-tp-card' },
          h('b', null, 'New skill'),
          h('p', { className: 'dsh-tp-desc' }, 'It is kept as a draft in Tuner Plus\'s folder, where the app does not load it, until it goes live. It is marked Mine: you wrote it.'),
          h('input', { className: 'dsh-tp-input wide', placeholder: 'name, like write-changelogs', value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }) }),
          h('input', { className: 'dsh-tp-input wide', placeholder: 'When it helps, in one line (the model chooses by this)', value: form.description, onChange: (event) => setForm({ ...form, description: event.target.value }) }),
          h('textarea', { className: 'dsh-tp-textarea', placeholder: 'What to do', value: form.text, onChange: (event) => setForm({ ...form, text: event.target.value }) }),
          h('div', { className: 'dsh-tp-actions' },
            h('label', { className: 'dsh-tp-field' }, 'Where it goes',
              h('select', { className: 'dsh-tp-select', value: form.scope === 'project' ? form.project : '', onChange: (event) => setForm({ ...form, scope: event.target.value ? 'project' : 'everywhere', project: event.target.value }) },
                projects.map((one) => h('option', { key: one.path, value: one.path }, `This project: ${one.name}`)),
                h('option', { value: '' }, 'Everywhere (your ~/.dsh/skills)')))),
          chosen?.git ? h('p', { className: 'dsh-tp-desc' }, `${chosen.name} is a git repository: once live, the skill file shows among its changes and could be committed with it.`) : null,
          form.scope === 'everywhere' ? h('p', { className: 'dsh-tp-desc' }, 'Everywhere: it shows in every thread of every mode that uses skills, and adds a line to each request there.') : null,
          h('div', { className: 'dsh-tp-actions' },
            h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: busy || !form.name || !form.description || !form.text, onClick: saveDraft }, 'Save as a draft'),
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => setForm(null) }, 'Cancel')));
      const exam = skills?.exam ?? {};
      const running = exam.running ?? null;
      const examBlocked = busy || Boolean(running) || Boolean(exam.problem);
      const modelList = Array.isArray(exam.choices) ? exam.choices : [];
      const routeKey = (route) => (route ? `${route.provider}/${route.model}` : '');
      const pickModel = (role, value) => {
        const chosen = modelList.find((one) => routeKey(one) === value);
        const next = { floor: exam.models?.floor ?? undefined, strong: exam.models?.strong ?? undefined, [role]: chosen ? { provider: chosen.provider, model: chosen.model } : undefined };
        void set('skillExam', next);
      };
      const modelSelect = (role, label) => h('label', { className: 'dsh-tp-field' }, label,
        h('select', { className: 'dsh-tp-select', value: routeKey(exam.models?.[role]), disabled: busy || Boolean(running), onChange: (event) => pickModel(role, event.target.value) },
          h('option', { value: '' }, role === 'floor' && !modelList.some((one) => one.here) ? 'No model on this Mac' : 'Not set'),
          modelList.filter((one) => role !== 'floor' || one.here).map((one) => h('option', { key: routeKey(one), value: routeKey(one) }, `${routeKey(one)}${one.here ? ' (this Mac)' : ''}`))));
      const examBlock = !on ? null : h('div', { className: 'dsh-tp-card' },
        h('b', null, 'The skill exam'),
        h('p', { className: 'dsh-tp-desc' }, 'Three checks before you are asked about a skill: it loads when it should and stays quiet when it should not (on both models below); your held-back tasks of its kind are done better with it than without (on the floor model, which must run on this Mac, so your tasks never leave it); and the skills near it do not get worse. The same exam on any skill, from its Health check button, is a report that changes nothing.'),
        h('div', { className: 'dsh-tp-actions' }, modelSelect('floor', 'Floor model (on this Mac)'), modelSelect('strong', 'Strong model')),
        exam.problem ? h('p', { className: 'dsh-tp-desc' }, exam.problem) : null,
        running ? h('div', { className: 'dsh-tp-actions' },
          h('span', { className: 'dsh-tp-rowdesc' }, `${running.lookOnly ? 'Health check' : 'Exam'} of ${running.name}: ${running.phase} (check ${running.step || 1} of ${running.steps || 3}).`),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillExamStop' }) }, 'Stop')) : null);
      const examLine = (one) => (one.exam ? (one.exam.passed ? 'It passed its exam.' : `It did not pass its exam. ${one.exam.why ?? ''}`) : 'Not examined yet.');
      const originLine = (one) => [
        one.origin?.kind === 'idea' ? `From a skill idea${one.origin.night ? ', drafted by the night shift' : ''}: ${String(one.origin.title ?? '').replace(/^Skill idea: /, '')}.` : '',
        one.origin?.kind === 'chat' ? 'Asked for in a thread.' : '',
        one.origin?.kind === 'bar' ? `Asked for on the bar: "${one.origin.title ?? ''}".` : '',
        ['improve', 'merge', 'split'].includes(one.origin?.kind) ? `From the bar: ${one.origin.title ?? ''}.` : '',
        one.outside ? `Built from outside material: ${one.outside}. Read it in full before it is used.` : '',
      ].filter(Boolean).join(' ');
      const retired = Array.isArray(skills?.retired) ? skills.retired : [];
      const day = (at) => (at ? new Date(at).toLocaleDateString('en-GB') : '');
      const healthText = (row) => {
        const h1 = row.health;
        const used = h1.loads > 0 ? `Loaded ${h1.loads} time${h1.loads === 1 ? '' : 's'} (${h1.well} ended well${h1.owner > 0 ? `, ${h1.owner} by your /${row.name}` : ''}), last ${day(h1.last)}.` : 'Not loaded in the threads counted.';
        const room = `Takes about ${h1.room.tokens} tokens in every request of every mode that uses skills.`;
        const check = h1.check ? ` Last check ${day(h1.check.at)}: ${String(h1.check.line).replace(/^[^:]*: /, '')}` : '';
        const change = row.change?.how === 'in-place' ? ' Improve changes it where it is (with your yes).' : row.change?.how === 'copy' ? ' Improve makes a copy under the same name (the original is not touched).' : row.change ? ` It cannot be changed here: ${row.change.why}.` : '';
        return `${used} ${room}${check}${change}`;
      };
      const cost = skills?.cost ?? null;
      const costBlock = !on || !cost ? null : h('div', { className: 'dsh-tp-card' },
        h('b', null, 'What the list costs'),
        h('p', { className: 'dsh-tp-desc' }, `${cost.skills} skills: about ${cost.tokens} tokens with every request, in every mode that uses skills.${skills.tabs ? ' In a mode you can switch off the skills it never uses: the model there no longer sees them (your /name still works).' : ''} ${skills.healthAt ? `Uses counted ${day(skills.healthAt)} in ${skills.healthCounted} threads Tuner Plus may read (never Recon).` : 'Uses not counted yet.'}`),
        ...(cost.perTab ?? []).slice(0, 8).map((one) => {
          const label = skills.tabs?.labels?.[one.tab] ?? one.tab;
          const off = skills.tabs?.off?.[one.tab] ?? [];
          const never = one.never.filter((name) => !off.includes(name));
          const counted = skills.tabConversations?.[one.tab] ?? 0;
          const may = Boolean(skills.tabs?.labels?.[one.tab]) && never.length > 0;
          if (never.length === 0 && off.length === 0) return null;
          return h('div', { key: one.tab },
            never.length > 0 ? h('p', { className: 'dsh-tp-desc' }, `Never loaded in ${label} (${counted} thread${counted === 1 ? '' : 's'} counted): ${never.slice(0, 12).join(', ')}${never.length > 12 ? ` and ${never.length - 12} more` : ''}.${may && counted < (skills.tabs?.min ?? 10) ? ` Too few threads to propose switching them off (at least ${skills.tabs?.min ?? 10}).` : ''}`) : null,
            off.length > 0 ? h('p', { className: 'dsh-tp-desc' }, `Switched off in ${label}: ${off.join(', ')}.`) : null,
            h('div', { className: 'dsh-tp-actions' },
              may && counted >= (skills.tabs?.min ?? 10) ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillsTabOff', tab: one.tab, names: never }) }, `Switch these off in ${label}`) : null,
              off.length > 0 ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillsTabOn', tab: one.tab, names: [] }) }, `Switch back on in ${label}`) : null));
        }),
        ...(skills.taught ?? []).map((one) => h('div', { key: `taught-${one.name}`, className: 'dsh-tp-actions' },
          h('span', { className: 'dsh-tp-desc' }, `Taught to your model on this Mac: ${one.name} (${one.rows} checked run${one.rows === 1 ? '' : 's'} train the harness adapter without loading it).`),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillTeachStop', name: one.name }) }, 'Stop teaching'))),
        h('div', { className: 'dsh-tp-actions' }, h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillsHealth' }) }, 'Count uses now')));
      const draftCards = !on ? [] : drafts.map((one) => h('div', { key: one.id, className: 'dsh-tp-card' },
        h('b', null, `Draft: ${one.name}`),
        h('div', { className: 'dsh-tp-rowdesc' }, `${one.description}\nGoes to ${one.scope === 'project' ? `the project ${String(one.project).split('/').pop()}` : 'everywhere'}: ${one.file}${one.git ? ' (a git repository)' : ''}.\nWritten by ${one.by === 'owner' ? 'you' : `a model${one.model ? ` (${one.model})` : ''}`}.${originLine(one) ? ` ${originLine(one)}` : ''}\n${examLine(one)}`),
        one.replaces ? h('div', { className: 'dsh-tp-rowdesc' }, `Changes "${one.replaces.name}" ${one.replaces.how === 'in-place' ? 'where it is (its old text is kept)' : 'as a copy under the same name, which the model gets instead of the original (the original is not touched)'}.${(one.retires ?? []).length > 0 ? ' The skill merged into it is retired (kept) when you use it.' : ''}`) : null,
        one.replaces && opened.includes(one.id) ? h('div', { className: 'dsh-tp-answer' }, `Before: ${one.replaces.before?.description ?? ''}\n\n${one.replaces.before?.text ?? ''}`) : null,
        opened.includes(one.id) ? h('div', { className: 'dsh-tp-answer' }, `${one.replaces ? `After: ${one.description}\n\n` : ''}${one.text ?? ''}`) : null,
        h('div', { className: 'dsh-tp-actions' },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => {
            if (opened.includes(one.id)) setOpened((now) => now.filter((id) => id !== one.id));
            // Showing it is recorded: no skill goes live before you have seen its whole text.
            else void act({ action: 'skillShown', id: one.id }).then((ok) => { if (ok) setOpened((now) => [...now, one.id]); });
          } }, opened.includes(one.id) ? 'Hide its text' : 'Show its text'),
          one.exam?.passed === true || (one.by === 'owner' && skills.liveWithoutExam === true)
            ? h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: busy || !opened.includes(one.id), title: opened.includes(one.id) ? '' : 'Read its whole text first (Show its text)', onClick: () => void act({ action: 'skillLive', id: one.id }) }, one.replaces ? 'Use it' : 'Put it live')
            : h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: examBlocked, title: exam.problem || '', onClick: () => void act({ action: 'skillExam', id: one.id }) }, one.exam ? 'Run its exam again' : 'Run its exam'),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillDrop', id: one.id }) }, 'Drop'))));
      return h('div', null,
        h('div', { className: 'dsh-tp-group' }, on ? `Skills (${rows.length})` : 'Skills'),
        h(Row, { title: 'Skills part', desc: on ? 'On. Every skill the app can see, with a mark that says where it came from. Code sets the mark from how the skill arrived; only you re-sort one, here. A model that writes a skill file asks you first.' : 'Off: Tuner Plus does nothing with skills, and works as before.' },
          h(Switch, { on, label: 'Skills part', busy: busy || !enabled, onChange: (value) => void set('skills', value, value ? 'The skills part is on.' : 'The skills part is off.') })),
        on && skills.problem ? h('p', { className: 'dsh-tp-desc', 'data-error': 'true' }, skills.problem) : null,
        on && skills.intact === false ? h(Row, { title: 'The record was changed outside Tuner Plus', desc: 'So the marks its doors stamped, and your own sortings, are not trusted: those skills show as Not sorted. You can start a new record; the old one is kept beside it.' },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillsRestart' }) }, 'Start a new record')) : null,
        examBlock,
        costBlock,
        newSkill,
        ...draftCards,
        on ? h('div', { className: 'dsh-tp-actions', role: 'group', 'aria-label': 'Show' },
          [['all', `All ${rows.length}`], ...Object.entries(marks).map(([id, name]) => [id, `${name} ${skills.counts?.[id] ?? 0}`]), ['shared', `Shared names ${skills.counts?.shared ?? 0}`]].map(([id, label]) => h('button', { key: id, type: 'button', className: 'dsh-tp-btn', 'data-main': filter === id ? 'true' : 'false', 'aria-pressed': filter === id, onClick: () => setFilter(id) }, label))) : null,
        on && filter === 'shared' && ordered.length === 0 ? h('p', { className: 'dsh-tp-desc' }, 'No two skills share a name: the model gets every skill it can see.') : null,
        on && unsorted.length > 0 ? h('p', { className: 'dsh-tp-desc' }, 'Not sorted: nobody can show where these came from. Tick them and say what they are. Until then Tuner Plus treats them as Downloaded.') : null,
        on && picked.length > 0 ? h('div', { className: 'dsh-tp-actions' },
          h('span', { className: 'dsh-tp-rowdesc' }, `Mark the ${picked.length} ticked as:`),
          Object.entries(marks).map(([id, name]) => h('button', { key: id, type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => sortAs(id) }, name))) : null,
        on ? ordered.map((row) => h('div', { key: row.key, className: 'dsh-tp-skill' },
          h('input', { type: 'checkbox', checked: picked.includes(row.key), disabled: busy, 'aria-label': `Pick ${row.name}`, onChange: () => toggle(row.key) }),
          h('div', { className: 'dsh-tp-rowtext' },
            h('div', { className: 'dsh-tp-rowtitle' }, row.name, h('span', { className: 'dsh-tp-mark', 'data-mark': row.mark }, row.markName), row.changed ? h('span', { className: 'dsh-tp-mark' }, 'Changed') : null, row.outside ? h('span', { className: 'dsh-tp-mark', title: `Built from outside material: ${row.outside}` }, 'Outside material') : null, (row.hiddenIn ?? []).length > 0 ? h('span', { className: 'dsh-tp-mark' }, 'Hidden') : null),
            h('div', { className: 'dsh-tp-rowdesc' }, `${row.why}.${row.path ? ` ${row.path}` : ''}`),
            shared(row) ? h('div', { className: 'dsh-tp-rowdesc' }, sharedLine(row)) : null,
            row.copyOf ? h('div', { className: 'dsh-tp-rowdesc' }, `Your copy of "${row.copyOf.name}"${row.behind ? ': the original changed since (see its card)' : row.copyOf.seen === false ? ': its original is not shown beside it here, so a change to it is not seen yet (the check after an update comes in a later step)' : ''}.`) : null,
            row.health ? h('div', { className: 'dsh-tp-rowdesc' }, healthText(row)) : null),
          h('div', { className: 'dsh-tp-actions' },
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: examBlocked, title: exam.problem || 'The skill exam on this skill, look only: a report that changes nothing', onClick: () => void act({ action: 'skillExam', key: row.key }) }, 'Health check'),
            row.change?.how === 'in-place' ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'Switch it off and keep it: Put back brings it back', onClick: () => void act({ action: 'skillRetire', key: row.key }) }, 'Retire') : null))) : null,
        on && retired.length > 0 ? h('div', { className: 'dsh-tp-group' }, `Retired (${retired.length})`) : null,
        on ? retired.map((one) => h(Row, { key: one.id, title: one.name, desc: `Retired ${new Date(one.at).toLocaleDateString('en-GB')}: switched off and kept. It was in ${one.from}.` },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillPutBack', id: one.id }) }, 'Put back'))) : null);
    }
    function Row({ title, desc, children }) {
      return h('div', { className: 'dsh-tp-row' }, h('div', { className: 'dsh-tp-rowtext' }, h('div', { className: 'dsh-tp-rowtitle' }, title), desc ? h('div', { className: 'dsh-tp-rowdesc' }, desc) : null), children);
    }

    /** The run in one sentence, as the server says it (lib/ladder.js runSentence), worked out here for the bar. */
    function sentenceOf(data, bar) {
      const goal = data.goals?.[bar.goal] ?? 'Find what would help most';
      const names = bar.sets.map((id) => data.sets?.[id]?.name ?? id);
      const setText = names.length === 0 ? 'the sets that fit the goal' : names.length === 1 ? `the ${names[0]} set` : `the ${names.slice(0, -1).join(', ')} and ${names.at(-1)} sets`;
      const model = bar.model || 'the model';
      if (bar.lookOnly) return `Look only: report what would help ${model} with "${goal}" and what the exam says today, from ${setText}. Nothing is trained.`;
      const rung = bar.method === 'auto' ? 'the lowest rung that passes the exam' : (data.rungs?.find((step) => String(step.n) === bar.method)?.name ?? '').toLowerCase();
      const minutes = Number(bar.minutes) || 0;
      return `Improve ${model} at "${goal}" with ${rung}, on ${setText}${minutes > 0 ? `, for at most ${minutes >= 60 ? `${Math.round(minutes / 6) / 10} hours` : `${minutes} minutes`}` : ''}, and test it on that set's exam rows before anything is offered to you.`;
    }

    /** The skills run in one sentence, as the server says it (lib/skills/bar.js skillsRunSentence). */
    function skillSentenceOf({ type, names, mark, markName, total, what, where, lookOnly }) {
      if (type === 'check') {
        if (names.length === 0) return 'Pick the skills to check.';
        const kind = mark && mark !== 'all' && markName ? `${markName} ` : '';
        if (names.length === 1) return `Check the skill "${names[0]}" for clashes and wrong loading. Change nothing.`;
        if (total > 0 && names.length === total) return `Check the ${total} ${kind}skills for clashes and wrong loading. Change nothing.`;
        const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
        return `Check ${names.length} skills (${list}) for clashes and wrong loading. Change nothing.`;
      }
      if (type === 'new') {
        const job = String(what ?? '').replace(/\s+/g, ' ').trim();
        if (!job) return 'Say in one line what the new skill is for.';
        return lookOnly ? `Look only: show the skill a model on this Mac would write for "${job}", ${where}. Nothing is written.` : `Write a new skill for "${job}", ${where}, as a draft, and run its exam. Nothing goes live without you.`;
      }
      if (type === 'gaps') return 'Look for jobs you do often that no skill covers, in what Tuner Plus gathered. Change nothing.';
      const listOf = (list) => (list.length <= 3 ? list.join(', ') : `${list.slice(0, 3).join(', ')} and ${list.length - 3} more`);
      if (type === 'improve') {
        if (names.length === 0) return 'Pick the skills to improve.';
        const which = names.length === 1 ? `the skill "${names[0]}"` : `${names.length} skills (${listOf(names)})`;
        return lookOnly ? `Look only: show how a model on this Mac would improve ${which}. Nothing is written.` : `Improve ${which}: a model on this Mac writes a better version and its exam runs; yours change in place, the others get a copy under the same name. Nothing is used before you say yes.`;
      }
      if (type === 'merge') {
        if (names.length === 2) return lookOnly ? `Look only: show "${names[0]}" and "${names[1]}" merged into one skill. Nothing is written.` : `Merge "${names[0]}" and "${names[1]}" into one skill: it keeps the name "${names[0]}", and "${names[1]}" is retired (kept) when you use it. Nothing is used before you say yes.`;
        if (names.length === 1) return lookOnly ? `Look only: show "${names[0]}" split into two skills. Nothing is written.` : `Split "${names[0]}" into two skills: the first keeps its name. Nothing is used before you say yes.`;
        return 'Pick one skill to split, or two to merge.';
      }
      if (type === 'retire') return names.length === 0 ? 'Pick the skills to look at.' : `Find the skills among the ${names.length} picked that were not used for 30 days, and propose to retire them (switched off and kept). Nothing is retired before you say yes.`;
      return 'Pick a run type.';
    }
    /** The bar with the goal "Build or improve a skill" (step 9, as sketched): run type, mark, the skills, where it goes. */
    function SkillBar({ data, bar, setBar, busy, act }) {
      const skills = data.skills ?? {};
      const rows = Array.isArray(skills.rows) ? skills.rows : [];
      const marks = skills.marks ?? {};
      const types = Array.isArray(skills.runTypes) ? skills.runTypes : [];
      const projects = Array.isArray(skills.projects) ? skills.projects : [];
      const running = skills.run ?? null;
      const type = bar.skillType ?? 'check';
      const mark = bar.skillMark ?? 'all';
      const shown = rows.filter((row) => mark === 'all' || row.mark === mark);
      const picked = bar.skillKeys ?? shown.map((row) => row.key);
      const chosen = shown.filter((row) => picked.includes(row.key));
      // Its own Look only: the training bar's stays as it was (the review of step 9).
      const writes = ['new', 'improve', 'merge'].includes(type);
      const lookOnly = writes ? bar.skillLookOnly !== false : true;
      const picks = ['check', 'improve', 'merge', 'retire'].includes(type);
      const place = bar.skillPlace ?? (projects[0]?.path ?? '');
      const placeName = place ? `for the project ${place.split('/').pop()}` : 'for everywhere';
      const sentence = skillSentenceOf({ type, names: [...new Set(chosen.map((row) => row.name))], mark, markName: marks[mark] ?? '', total: shown.length, what: bar.skillWhat ?? '', where: placeName, lookOnly });
      const ready = type === 'merge' ? chosen.length === 1 || chosen.length === 2 : picks ? chosen.length > 0 && (type !== 'improve' || chosen.length <= 10) : type === 'new' ? Boolean(String(bar.skillWhat ?? '').trim()) : type === 'gaps';
      const start = () => void act({ action: 'skillsRun', type, keys: chosen.map((row) => row.key), mark, what: bar.skillWhat ?? '', scope: place ? 'project' : 'everywhere', project: place, lookOnly });
      return h('div', { className: 'dsh-tp-bar' },
        h('label', { className: 'dsh-tp-field' }, 'Run type',
          h('select', { className: 'dsh-tp-select', value: type, onChange: (event) => setBar({ ...bar, skillType: event.target.value }) },
            types.map((one) => h('option', { key: one.id, value: one.id, disabled: !one.ready }, one.ready ? one.name : `${one.name} (a later step)`)))),
        picks ? h('label', { className: 'dsh-tp-field' }, 'Mark',
          h('select', { className: 'dsh-tp-select', value: mark, onChange: (event) => setBar({ ...bar, skillMark: event.target.value, skillKeys: null }) },
            h('option', { value: 'all' }, `All (${rows.length})`),
            Object.entries(marks).map(([id, name]) => h('option', { key: id, value: id }, `${name} (${rows.filter((row) => row.mark === id).length})`)))) : null,
        h('label', { className: 'dsh-tp-field' }, 'Look only',
          h(Switch, { on: lookOnly, label: 'Look only', busy: busy || !writes, onChange: (on) => setBar({ ...bar, skillLookOnly: on }) })),
        picks ? h('div', { className: 'dsh-tp-checks', style: { flexBasis: '100%' } },
          shown.length === 0 ? h('span', { className: 'dsh-tp-rowdesc' }, 'No skill has this mark.') : [
            h('label', { key: '*' }, h('input', { type: 'checkbox', checked: chosen.length === shown.length, onChange: (event) => setBar({ ...bar, skillKeys: event.target.checked ? null : [] }) }), ` All ${shown.length} shown`),
            ...shown.map((row) => h('label', { key: row.key },
              h('input', { type: 'checkbox', checked: picked.includes(row.key), onChange: (event) => setBar({ ...bar, skillKeys: event.target.checked ? [...picked, row.key] : picked.filter((one) => one !== row.key) }) }),
              ` ${row.name} `, h('span', { className: 'dsh-tp-mark', 'data-mark': row.mark }, row.markName))),
          ]) : null,
        type === 'new' ? h('div', { className: 'dsh-tp-actions', style: { flexBasis: '100%' } },
          h('input', { className: 'dsh-tp-input wide', placeholder: 'What the skill is for, like "how I want changelogs written"', maxLength: 300, value: bar.skillWhat ?? '', onChange: (event) => setBar({ ...bar, skillWhat: event.target.value }) }),
          h('label', { className: 'dsh-tp-field' }, 'Where it goes',
            h('select', { className: 'dsh-tp-select', value: place, onChange: (event) => setBar({ ...bar, skillPlace: event.target.value }) },
              projects.map((one) => h('option', { key: one.path, value: one.path }, `This project: ${one.name}`)),
              h('option', { value: '' }, 'Everywhere (your ~/.dsh/skills)')))) : null,
        h('div', { className: 'dsh-tp-sentence' }, sentence),
        running
          ? h('div', { className: 'dsh-tp-actions' }, h('span', { className: 'dsh-tp-rowdesc' }, `Running: ${running.sentence}${running.steps > 1 ? ` (${running.step} of ${running.steps}${running.current ? `: ${running.current}` : ''})` : ''}`), h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'skillsRunStop' }) }, 'Stop'))
          : h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: busy || !data.enabled || !ready || Boolean(skills.exam?.running), title: skills.exam?.problem && type !== 'gaps' ? skills.exam.problem : '', onClick: start }, lookOnly ? 'Look' : 'Start'),
        h('p', { className: 'dsh-tp-desc', style: { flexBasis: '100%' } }, 'Model, Method, Budget and Data sets are not used for this goal: the skill exam\'s floor and strong models do the work. A run reads and changes only the skills it starts with.'));
    }

    function TuningPage() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [bar, setBar] = useState({ model: '', goal: 'harness', sets: [], method: 'auto', minutes: 120, lookOnly: true });
      const [taste, setTaste] = useState(null);
      const [draft, setDraft] = useState({ python: null, modelName: '', modelPath: '', teacher: '', routes: {} });
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        return () => { alive.current = false; };
      }, [load]);
      // Look again every 5 seconds while a run, a skills run or a skill exam goes, every 30 seconds otherwise (and never while hidden).
      const running = Boolean(data?.active || data?.skills?.run || data?.skills?.exam?.running);
      useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) void load(); }, running ? 5000 : 30000);
        return () => clearInterval(timer);
      }, [running, load]);

      if (!data) return h('div', { className: 'dsh-tp-page' }, h('style', null, CSS), h('h2', { className: 'dsh-tp-title' }, 'Tuner Plus'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dsh-tp-desc', 'data-error': 'false' }, 'Loading…')));

      /** @returns {Promise<boolean>} whether the action went through (a form keeps what was typed when it did not). */
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await call(body);
          if (!alive.current) return true;
          setData(next);
          if (next.taste) setTaste(next.taste);
          setNote({ text: next.note || done || '', error: false });
          return true;
        } catch (problem) {
          if (alive.current) setNote({ text: String(problem?.message ?? problem), error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const set = async (field, value, done) => {
        const ok = await act({ action: 'set', field, value }, done ?? 'Saved.');
        // Item 4A: the Cowork sidebar shows Workshop's Tuner Plus row only while Tuner Plus is on; tell it at once.
        if (ok && field === 'enabled') {
          try { window.dispatchEvent(new CustomEvent('dsh-tuning:switched', { detail: { on: value === true } })); } catch { /* no window */ }
        }
        return ok;
      };
      const sets = Object.entries(data.sets ?? {});
      const models = data.models ?? [];
      const route = models.find((one) => `${one.provider}/${one.model}` === bar.model || one.model === bar.model);
      const modelNames = [...new Set([...Object.keys(data.modelPaths ?? {}), ...models.map((one) => one.model)])];

      return h('div', { className: 'dsh-tp-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-tp-title' }, 'Tuner Plus'),
        h('p', { className: 'dsh-tp-desc' }, 'Models that learn from your work. Every checked step (tests that passed, a claim you ruled on, a draft you edited and approved, a device that read back) is kept as a training row with its proof. One row in five goes to a private exam made from your own work, which never trains anything. The rest builds named data sets, from which Tuner Plus proposes the cheapest fix first (instructions, then examples, then a tuned prompt) and only then trains an adapter on this Mac. Nothing is used until it beats the exam and you say yes.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dsh-tp-desc', 'data-error': 'true' }, data.problem) : null,

        h(Row, { title: 'Tuner Plus', desc: data.enabled ? `On. Its folder: ${data.folder}.` : 'Off: nothing is gathered and its tools are not offered in any thread.' },
          h(Switch, { on: data.enabled, label: 'Tuner Plus', busy, onChange: (on) => void set('enabled', on, on ? 'Tuner Plus is on. Switch on the modes it may learn from below.' : 'Tuner Plus is off.') })),

        h('div', { className: 'dsh-tp-group' }, 'What it learns from'),
        h('p', { className: 'dsh-tp-desc' }, 'Each mode starts off. Only checked steps become rows. Recon is never read, nor a thread that received an export from Recon, a helper of either, or a thread you marked "never learn from this" on Learned skills. Your own folders are never read. Passwords and keys are masked before a row is stored.'),
        Object.entries(data.modes ?? {}).map(([mode, about]) => h(Row, { key: mode, title: about.split(':')[0], desc: about.split(':').slice(1).join(':').trim() },
          h(Switch, { on: data.harvest?.[mode], label: about.split(':')[0], busy: busy || !data.enabled, onChange: (on) => void set('harvest', { ...data.harvest, [mode]: on }) }))),
        h('div', { className: 'dsh-tp-actions' },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled, onClick: () => void act({ action: 'harvest' }) }, 'Gather now'),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled, onClick: () => void act({ action: 'lessons' }) }, 'Build add-on lessons'),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !data.enabled || !data.teacher, onClick: () => void act({ action: 'qa' }) }, 'Questions from reference material')),
        data.lastHarvest ? h('p', { className: 'dsh-tp-desc' }, `Last gathered ${when(data.lastHarvest.at)}: ${Object.entries(data.lastHarvest.modes ?? {}).map(([mode, slot]) => `${mode} ${slot.kept} rows, ${slot.exam} to the exam`).join('; ') || 'nothing new'}. ${data.lastHarvest.left?.length ? `${data.lastHarvest.left.length} threads left out (Recon, exports, helpers, marked).` : ''}`) : null,

        h('div', { className: 'dsh-tp-group' }, 'The bar'),
        bar.goal === 'skill' && data.goals?.skill ? h('div', null,
          h('div', { className: 'dsh-tp-bar' },
            h('label', { className: 'dsh-tp-field' }, 'Goal',
              h('select', { className: 'dsh-tp-select', value: bar.goal, onChange: (event) => setBar({ ...bar, goal: event.target.value, sets: [] }) },
                Object.entries(data.goals ?? {}).map(([id, label]) => h('option', { key: id, value: id }, label))))),
          h(SkillBar, { data, bar, setBar, busy, act })) : h('div', { className: 'dsh-tp-bar' },
          h('label', { className: 'dsh-tp-field' }, 'Model',
            h('select', { className: 'dsh-tp-select', value: bar.model, onChange: (event) => setBar({ ...bar, model: event.target.value }) },
              h('option', { value: '' }, 'Pick a model'),
              modelNames.map((name) => h('option', { key: name, value: name }, name)))),
          h('label', { className: 'dsh-tp-field' }, 'Goal',
            h('select', { className: 'dsh-tp-select', value: bar.goal, onChange: (event) => setBar({ ...bar, goal: event.target.value, sets: [] }) },
              Object.entries(data.goals ?? {}).map(([id, label]) => h('option', { key: id, value: id }, label)))),
          h('label', { className: 'dsh-tp-field' }, 'Method',
            h('select', { className: 'dsh-tp-select', value: bar.method, onChange: (event) => setBar({ ...bar, method: event.target.value }) },
              h('option', { value: 'auto' }, 'Auto: the lowest rung that passes'),
              (data.rungs ?? []).filter((step) => step.n >= 1).map((step) => h('option', { key: step.n, value: String(step.n) }, `${step.n}. ${step.name}`)))),
          h('label', { className: 'dsh-tp-field' }, 'Budget (minutes)',
            h('input', { className: 'dsh-tp-input', type: 'number', min: 5, max: 1440, value: bar.minutes, onChange: (event) => setBar({ ...bar, minutes: event.target.value }), style: { width: 90 } })),
          h('label', { className: 'dsh-tp-field' }, 'Look only',
            h(Switch, { on: bar.lookOnly, label: 'Look only', busy, onChange: (on) => setBar({ ...bar, lookOnly: on }) })),
          h('div', { className: 'dsh-tp-checks', style: { flexBasis: '100%' } }, sets.length === 0 ? h('span', { className: 'dsh-tp-rowdesc' }, 'Data sets appear here once something was gathered.') : sets.map(([id, set]) => h('label', { key: id },
            h('input', { type: 'checkbox', checked: bar.sets.includes(id), onChange: (event) => setBar({ ...bar, sets: event.target.checked ? [...bar.sets, id] : bar.sets.filter((one) => one !== id) }) }),
            ` ${set.name} (${set.mayTrain} of ${set.rows})`))),
          h('div', { className: 'dsh-tp-sentence' }, sentenceOf(data, bar)),
          data.active
            ? h('div', { className: 'dsh-tp-actions' }, h('span', { className: 'dsh-tp-rowdesc' }, `Running: ${data.active.phase}${data.active.progress?.iter ? `, step ${data.active.progress.iter}${data.active.progress.loss ? `, loss ${data.active.progress.loss}` : ''}` : ''}.`), h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'stop' }) }, 'Stop'))
            : h('button', { type: 'button', className: 'dsh-tp-btn', 'data-main': 'true', disabled: busy || !data.enabled || (!bar.lookOnly && !bar.model), onClick: () => void act({ action: 'run', model: bar.model, goal: bar.goal, sets: bar.sets, method: bar.method, minutes: Number(bar.minutes) || 0, lookOnly: bar.lookOnly }) }, bar.lookOnly ? 'Look' : 'Start')),

        h('div', { className: 'dsh-tp-group' }, `Results (${(data.cards ?? []).length})`),
        (data.cards ?? []).length === 0 ? h('p', { className: 'dsh-tp-desc' }, 'Nothing yet. Results of runs and of the night shift come here as cards.') : null,
        (data.cards ?? []).map((card) => h('div', { key: card.id, className: 'dsh-tp-card' },
          h('b', null, card.title), h('div', { className: 'dsh-tp-rowdesc' }, card.text),
          h('div', { className: 'dsh-tp-actions' },
            (card.buttons ?? ['later', 'never']).map((button) => h('button', {
              key: button, type: 'button', className: 'dsh-tp-btn', disabled: busy || (button === 'taste' && !route),
              title: button === 'taste' && !route ? 'Pick the model in use on the bar first' : '',
              onClick: () => void (button === 'taste' ? act({ action: 'taste', entry: card.entry, current: route ? { provider: route.provider, model: route.model } : null }) : button === 'draft' ? act({ action: 'skillIdeaDraft', card: card.id }) : button === 'retire' ? act({ action: 'skillsRetire', card: card.id }) : button === 'check' ? act({ action: 'skillsUpdateCheck', card: card.id }) : button === 'teach' ? act({ action: 'skillTeach', card: card.id }) : act({ action: 'card', card: card.id, do: button }, button === 'promote' ? 'Promoted. Switch it on in the shelf below.' : '')),
            }, { taste: 'Taste test', promote: 'Promote', draft: 'Draft it', retire: 'Retire them', check: 'Check them', teach: 'Teach it', later: 'Not now', never: 'Do not suggest this again' }[button] ?? button))))),
        taste ? h('div', { className: 'dsh-tp-card' },
          h('b', null, taste.done ? 'Taste test: done' : 'Taste test: which answer is better? (names hidden)'),
          taste.items.map((item) => h('div', { key: item.n, style: { marginTop: 10 } },
            h('div', { className: 'dsh-tp-rowdesc' }, `${item.n}. ${item.request}`),
            h('div', { className: 'dsh-tp-answer' }, `A: ${item.a}`), h('div', { className: 'dsh-tp-answer' }, `B: ${item.b}`),
            item.pick ? h('div', { className: 'dsh-tp-rowdesc' }, `You picked ${item.pick}${item.candidate ? ` (the candidate was ${item.candidate})` : ''}.`)
              : h('div', { className: 'dsh-tp-actions' }, ['a', 'b', 'same'].map((pick) => h('button', { key: pick, type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'pick', round: taste.id, n: item.n, pick }) }, pick === 'same' ? 'The same' : pick.toUpperCase())))))) : null,

        h('div', { className: 'dsh-tp-group' }, `Data sets (${sets.length})`),
        sets.map(([id, set]) => h(Row, { key: id, title: `${set.name}: ${set.rows} rows, ${set.mayTrain} may train`, desc: `${set.about}. ${set.first ? `From ${when(set.first)} to ${when(set.last)}.` : ''}${Object.keys(set.notTrain ?? {}).length ? ` Not trained on: ${Object.entries(set.notTrain).map(([why, count]) => `${count} (${why})`).join('; ')}.` : ''}${set.usedFor?.length ? ` Used for: ${set.usedFor.join('; ')}.` : ''}` },
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'export', set: id }) }, 'Write out'))),

        h('div', { className: 'dsh-tp-group' }, 'The exam'),
        h('p', { className: 'dsh-tp-desc' }, `${data.exam?.total ?? 0} rows of your own work${Object.keys(data.exam?.byMode ?? {}).length ? ` (${Object.entries(data.exam.byMode).map(([mode, count]) => `${mode} ${count}`).join(', ')})` : ''}. Chosen by code, one in five; never trained on. Each kind is marked by its own check. ${data.canaries ? 'The general canaries come from the Benchmark add-on.' : 'The Benchmark add-on is off, so the canaries cannot run and nothing can be promoted.'} A candidate is offered only when it is better on its exam by a clear margin and not worse on the canaries; then you decide, also with a taste test.`),

        h('div', { className: 'dsh-tp-group' }, `The shelf (${(data.shelf ?? []).length})`),
        (data.shelf ?? []).length === 0 ? h('p', { className: 'dsh-tp-desc' }, 'Empty. Adapters and tuned prompts that were built come here, with their exam results.') : null,
        (data.shelf ?? []).map((entry) => h('div', { key: entry.id, className: 'dsh-tp-card' },
          h('b', null, `${entry.name} · ${entry.state}${entry.due ? ' · due for a rebuild' : ''}`),
          h('div', { className: 'dsh-tp-rowdesc' }, `Base model ${entry.base?.model}; built ${when(entry.built)} from ${entry.sets.join(', ')} (${entry.rows} rows). ${entry.exam?.after ? `Exam: ${pct(entry.exam.after.rate)} against ${pct(entry.exam.before?.rate)} before.` : entry.exam?.decision ? entry.exam.decision.why : ''} Private: built for you and your harness. Its shelf id, for a team role in Settings → Model tiers: ${entry.id}. ${entry.serve?.route ? `Served as ${entry.serve.route.provider}/${entry.serve.route.model}.` : entry.serve?.path ? `Ready to serve: ${entry.serve.path}.` : ''}`),
          h('div', { className: 'dsh-tp-actions' },
            ['promoted', 'on', 'off'].includes(entry.state) ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void act({ action: 'switch', entry: entry.id, on: entry.state !== 'on' }) }, entry.state === 'on' ? 'Switch off' : 'Switch on') : null,
            entry.exam?.decision?.ok ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'Fold the adapter into a new copy of the base model (the base is never changed); any MLX model server serves it as one more model', onClick: () => void act({ action: 'serve', entry: entry.id, way: 'fused' }) }, 'Make a fused copy') : null,
            entry.exam?.decision?.ok ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, title: 'mlx-lm\'s own server with the adapter beside the base model, on this Mac only', onClick: () => void act({ action: entry.serving ? 'stopServing' : 'serve', entry: entry.id, way: 'server' }) }, entry.serving ? 'Stop its server' : 'Serve with mlx-lm') : null),
          entry.exam?.decision?.ok ? h('div', { className: 'dsh-tp-actions' },
            h('input', { className: 'dsh-tp-input', placeholder: 'provider (as in Settings → Models)', value: draft.routes[entry.id]?.provider ?? '', onChange: (event) => setDraft({ ...draft, routes: { ...draft.routes, [entry.id]: { ...draft.routes[entry.id], provider: event.target.value } } }) }),
            h('input', { className: 'dsh-tp-input', placeholder: 'model name there', value: draft.routes[entry.id]?.model ?? '', onChange: (event) => setDraft({ ...draft, routes: { ...draft.routes, [entry.id]: { ...draft.routes[entry.id], model: event.target.value } } }) }),
            h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !draft.routes[entry.id]?.provider || !draft.routes[entry.id]?.model, onClick: () => void act({ action: 'route', entry: entry.id, ...draft.routes[entry.id] }, 'Saved. A team in Settings → Model tiers can now name it for a role.') }, 'Save its address')) : null)),

        h(SkillsSection, { skills: data.skills, busy, act, set, enabled: data.enabled }),

        h('div', { className: 'dsh-tp-group' }, 'Trainer and models on this Mac'),
        h(Row, { title: 'The trainer\'s Python', desc: data.python ? `${data.python}${data.pythonProblem ? ` · ${data.pythonProblem}` : ''}` : 'Not set. Tuner Plus trains with Apple\'s mlx-lm, which you install yourself in a Python of its own (for example "uv venv" then "uv pip install mlx-lm" in a folder you choose), then give its full path here (…/bin/python). Tuner Plus never installs anything and never downloads a model.' },
          h('input', { className: 'dsh-tp-input', placeholder: '/full/path/to/.venv/bin/python', value: draft.python ?? data.python ?? '', onChange: (event) => setDraft({ ...draft, python: event.target.value }) }),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || draft.python === null, onClick: () => void set('python', draft.python ?? '') }, 'Save')),
        h(Row, { title: 'Where each base model\'s files are', desc: Object.entries(data.modelPaths ?? {}).map(([name, path]) => `${name}: ${path}`).join('\n') || 'None yet. Training needs a model\'s MLX folder on this Mac (with config.json); its files are never changed.' },
          h('input', { className: 'dsh-tp-input', placeholder: 'model name', value: draft.modelName, onChange: (event) => setDraft({ ...draft, modelName: event.target.value }), style: { width: 140 } }),
          h('input', { className: 'dsh-tp-input', placeholder: '/full/path/to/model folder', value: draft.modelPath, onChange: (event) => setDraft({ ...draft, modelPath: event.target.value }) }),
          h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy || !draft.modelName || !draft.modelPath, onClick: () => void set('models', { ...(data.modelPaths ?? {}), [draft.modelName]: draft.modelPath }) }, 'Add')),
        h(Row, { title: 'Teacher model', desc: data.teacher ? `${data.teacher.provider}/${data.teacher.model} (runs ${data.teacherWhere}). It writes questions from reference material; a separate run checks each one. Its questions count as its own writing, so its provider's switch below applies to them.${!data.teacherHere && !data.teacherCloud ? ' It does not count as this Mac: tick below before it may read rows.' : ''}` : 'Not set. Used only for questions from reference material.' },
          h('select', { className: 'dsh-tp-select', value: data.teacher ? `${data.teacher.provider}/${data.teacher.model}` : '', onChange: (event) => { const picked = models.find((one) => `${one.provider}/${one.model}` === event.target.value); void set('teacher', picked ? { provider: picked.provider, model: picked.model } : {}); } },
            h('option', { value: '' }, 'None'), models.map((one) => h('option', { key: `${one.provider}/${one.model}`, value: `${one.provider}/${one.model}` }, `${one.provider}/${one.model}`)))),
        h(Row, { title: 'A teacher on the internet may read rows', desc: 'Off: only a teacher on this Mac reads your rows.' },
          h(Switch, { on: data.teacherCloud, label: 'A teacher on the internet may read rows', busy, onChange: (on) => void set('teacherCloud', on) })),
        h(Row, { title: 'Count my own network\'s machines as this Mac', desc: 'Off: only this Mac itself counts when Tuner Plus decides what may be sent to a model (exam rows, recent requests for a taste test, rows for the teacher); a model elsewhere gets only text that was already sent to it. On: a model at a home address (192.168…, .local) counts as this Mac too. Note: a proxy on your network that forwards to a cloud provider cannot be told apart from a model at home.' },
          h(Switch, { on: data.ownNetworkLocal, label: 'Count my own network\'s machines as this Mac', busy, onChange: (on) => void set('ownNetworkLocal', on) })),

        h('div', { className: 'dsh-tp-group' }, 'May it train?'),
        h('p', { className: 'dsh-tp-desc' }, 'Set by code for each row, from who really wrote its text: never Recon, never a signed-in source (a connector), never a row whose secrets could not all be masked (a web address with a password in it counts as that). A row whose writer nobody can say (a research packet, a Mission step that names no provider) trains only narrow tools, never an adapter that writes open-ended text. Each provider has a switch of its own, because each sets its own terms; read each provider\'s own page. A preference pair also needs the switch of whoever wrote its rejected answer.'),
        (data.providers ?? []).map((one) => h(Row, { key: one.provider, title: `Text written by ${one.provider}`, desc: one.on ? 'May train.' : 'Does not train.' },
          h(Switch, { on: one.on, label: `Text written by ${one.provider}`, busy, onChange: (on) => void set('providers', { ...Object.fromEntries((data.providers ?? []).map((item) => [item.provider, item.on])), [one.provider]: on }) }))),
        h(Row, { title: 'Text written by Anthropic\'s models, for adapters that write open-ended text', desc: 'Starts off: Anthropic\'s terms say its outputs may not train models that compete with its own (general chat and open-ended text models); narrow tools such as judges are allowed. The switch is yours; the planner is not a lawyer.' },
          h(Switch, { on: data.anthropicOpenEnded, label: 'Anthropic text for open-ended adapters', busy, onChange: (on) => void set('anthropicOpenEnded', on) })),

        h('div', { className: 'dsh-tp-group' }, 'The night shift'),
        h(Row, { title: 'Work at night on this Mac', desc: `Only while this Mac is on power and has been unused for ${data.night?.idleMinutes ?? 15} minutes; it stops the moment you use it. It gathers, sorts, finds the weakest spot and proposes the lowest rung; it trains only the sets you allow below, and it never promotes anything: you find cards in the morning.${data.night?.last ? ` Last night: ${data.night.last}.` : ''}` },
          h(Switch, { on: data.night?.on, label: 'Night shift', busy: busy || !data.enabled, onChange: (on) => void set('nightShift', on) })),
        data.skills?.on ? h(Row, { title: 'Draft skills at night', desc: 'At most two skill ideas a night: a model on this Mac drafts each from your examples, and it takes its exam with the skill exam\'s two models (as when you press Exam). Nothing goes live and no skill is changed: the drafts wait under Skills for your yes.' },
          h(Switch, { on: data.night?.skills, label: 'Draft skills at night', busy: busy || !data.enabled || !data.night?.on, onChange: (on) => void set('nightSkills', on) })) : null,
        h(Row, { title: 'Sets the night shift may train', desc: (data.night?.train ?? []).map((item) => `${data.sets?.[item.set]?.name ?? item.set} on ${item.model}`).join('; ') || 'None: it trains nothing.' },
          h('select', { className: 'dsh-tp-select', value: '', disabled: busy || !bar.model, title: bar.model ? '' : 'Pick the model on the bar first', onChange: (event) => { if (event.target.value) void set('nightTrain', [...(data.night?.train ?? []).filter((item) => item.set !== event.target.value), { set: event.target.value, model: bar.model }]); } },
            h('option', { value: '' }, 'Allow a set…'), sets.map(([id, set]) => h('option', { key: id, value: id }, set.name))),
          (data.night?.train ?? []).length > 0 ? h('button', { type: 'button', className: 'dsh-tp-btn', disabled: busy, onClick: () => void set('nightTrain', []) }, 'Allow none') : null),

        h('div', { className: 'dsh-tp-group' }, 'Limits you should know'),
        h('ul', { className: 'dsh-tp-list' },
          h('li', null, 'It is a ratchet, not infinity: each gain is smaller than the last, and a small model has a ceiling data cannot lift.'),
          h('li', null, 'One person\'s use makes few rows. A narrow skill needs hundreds of good rows, so some sets take months; the harness set fills fastest.'),
          h('li', null, 'Training does not teach facts well: facts are looked up (retrieval). "Know a subject" builds retrieval first.'),
          h('li', null, 'What a model is trained on can come back out of it: adapters stay private, and your own folders are never used.'),
          h('li', null, 'Training takes the Mac it runs on. A new base model empties the shelf; the sets stay, and everything is rebuilt from them.'),
          h('li', null, 'Your model server may not load adapters: then Tuner Plus makes a fused copy (a new model folder) or runs mlx-lm\'s own server, and you add it in Settings → Models.'),
          h('li', null, 'An exam can be gamed: exam rows never train, the exam keeps growing, and the taste test asks you.')));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'tuning', order: 141, label: () => t('section.title') }, () => h(TuningPage))));
      },
    };
  },
});
