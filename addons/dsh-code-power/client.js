/**
 * Browser half of Code power: the "Reviews and fixes" settings.
 *
 * Shown as a tab of the Code tools page (Code map's page) when Code map is installed, and as a page of its own
 * (Settings → Code tools: reviews and fixes) when it is not. Saved through the app's settings channel.
 * Colours come only from the app's variables (docs/UI-STYLE.md).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-code-power',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;
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

    /* dsh-merge:begin */
    /* Shared by the add-ons whose settings pages are merged (host page shows partner parts). Keep every copy identical. */
    const dshMerge = (() => {
      const reg = (window.__dshMerge = window.__dshMerge || { hosts: {}, parts: {}, want: {}, subs: new Set() });
      const tell = () => { for (const fn of [...reg.subs]) { try { fn(); } catch {} } };
      const api = {
        /** A host page announces itself; the returned function withdraws it. */
        host(hostId) {
          reg.hosts[hostId] = (reg.hosts[hostId] || 0) + 1;
          tell();
          let done = false;
          return () => { if (done) return; done = true; reg.hosts[hostId] -= 1; if (!reg.hosts[hostId]) delete reg.hosts[hostId]; tell(); };
        },
        hasHost: (hostId) => Boolean(reg.hosts[hostId]),
        /** A partner offers a part ({label: () => string, order, render: (props) => element}) to a host page. */
        part(hostId, partId, spec) {
          const list = (reg.parts[hostId] = reg.parts[hostId] || {});
          list[partId] = spec;
          tell();
          return () => { if (list[partId] === spec) { delete list[partId]; tell(); } };
        },
        parts: (hostId) => Object.entries(reg.parts[hostId] || {}).map(([id, spec]) => ({ id, ...spec })).sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
        subscribe(fn) { reg.subs.add(fn); return () => reg.subs.delete(fn); },
        /** Settings search asks a host page to show one tab ('main' or a part id). */
        openTab(hostId, tabId) { reg.want[hostId] = tabId; tell(); },
        /** React hook: the host's current tab ('main' first), and a setter. Re-renders when parts or hosts change. */
        useTab(React, hostId, first = 'main') {
          const [tab, setTab] = React.useState(first);
          const [, bump] = React.useState(0);
          React.useEffect(() => api.subscribe(() => {
            const wanted = reg.want[hostId];
            if (wanted) { delete reg.want[hostId]; setTab(wanted); }
            bump((n) => n + 1);
          }), []);
          React.useEffect(() => { const wanted = reg.want[hostId]; if (wanted) { delete reg.want[hostId]; setTab(wanted); } }, []);
          const ids = ['main', ...api.parts(hostId).map((p) => p.id)];
          return [ids.includes(tab) ? tab : 'main', setTab];
        },
        /** A partner shows its own page only while no host page shows it. `register()` registers the page and returns its remover. */
        ownPageUnlessHosted(hostId, register) {
          let off;
          const sync = () => {
            const need = !api.hasHost(hostId);
            if (need && !off) off = register();
            else if (!need && off) { off(); off = undefined; }
          };
          sync();
          const unsub = api.subscribe(sync);
          return () => { unsub(); if (off) { off(); off = undefined; } };
        },
      };
      return api;
    })();
    /* dsh-merge:end */

    const NS = 'code-power';

    const DICT = {
      en: {
        'section.title': 'Code tools: reviews and fixes',
        'tab.title': 'Reviews and fixes',
        'head.title': 'Reviews and fixes',
        'head.hint': 'Four step-by-step guides for the assistant (type / in the chat box to pick one, or just ask), and a judge that compares several solutions without knowing who wrote which.',
        'note.restart': 'Switching this on or off, and the review lanes, round limit and check command, take effect when the app starts again. The judge settings apply at once.',
        'row.enabled': 'Use reviews and fixes',
        'row.enabled.hint': 'Offers the four guides and the judge tool to the assistant. Needs an app restart to change.',
        'group.review': 'Pull request review',
        'review.lanes': 'Review lanes',
        'review.lanes.hint': 'The angles a review looks from, separated by commas, for example correctness, security, tests.',
        'group.best': 'Best of several',
        'best.n': 'Attempts',
        'best.n.hint': 'How many independent approaches to try. 2 to 5.',
        'best.role': 'Judge model role',
        'best.role.hint': 'Which model the judge uses: the name of a role in Model Tiers, such as review. When helper models are set to "same", the conversation\'s own model is used.',
        'best.criteria': 'Judging criteria',
        'best.criteria.hint': 'What the judge scores, separated by commas.',
        'best.check': 'Judge twice, in reversed order',
        'best.check.hint': 'Catches a judge that prefers whatever it sees first. If the two rounds disagree the result is a tie.',
        'group.ci': 'Fix until the checks pass',
        'ci.rounds': 'Most rounds',
        'ci.rounds.hint': 'The assistant stops and reports after this many tries. 1 to 50.',
        'ci.command': 'Check command',
        'ci.command.hint': 'The command that runs your tests or checks. Leave empty and the assistant looks for it in the project, or asks you.',
        'group.skills': 'The guides',
        'skill.pr-review': 'Review a branch or pull request in lanes and report ranked findings. Reads only.',
        'skill.ci-fix-loop': 'Run the checks, fix one failure at a time, and stop when they pass or the round limit is reached.',
        'skill.best-of-n': 'Try several approaches in separate copies of the project, then pick one with the blind judge.',
        'skill.hunk-review': 'Go through the current changes piece by piece and undo only what you reject.',
        'saved': 'Saved',
        'saving': 'Saving…',
        'unavailable': 'The page could not load its data. Restart the app once after installing.',
      },
    };

    const CSS = `
.dsh-cp2-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-cp2-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-cp2-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cp2-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-cp2-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cp2-rowtext { flex: 1; min-width: 0; }
.dsh-cp2-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-cp2-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cp2-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease; }
.dsh-cp2-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-cp2-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-cp2-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-cp2-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cp2-field { box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-cp2-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-cp2-num { flex: none; width: 120px; }
.dsh-cp2-wide { flex: none; width: min(260px, 45%); }
.dsh-cp2-list { margin: 0; padding: 0; list-style: none; }
.dsh-cp2-list li { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cp2-list li b { display: block; font-size: 14px; line-height: 22px; font-weight: 400; color: var(--dsw-alias-label-primary); }
.dsh-cp2-status { margin-top: 16px; min-height: 18px; }
@media (max-width: 560px) { .dsh-cp2-row { flex-wrap: wrap; } .dsh-cp2-wide { width: 100%; } }
`;

    /** Load this add-on's settings through the app's settings channel. */
    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw dshKit.fail('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    /** Write settings; on a conflict, reload once and try again. */
    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    const DEFAULTS = {
      enabled: true,
      prReview: { lanes: ['correctness', 'security', 'tests'] },
      bestOfN: { n: 3, judgeRole: 'review', criteria: ['correctness', 'completeness', 'simplicity', 'test coverage'], consistencyCheck: true },
      ciFix: { maxRounds: 5, command: '' },
    };
    /** @param {string} text @returns {string[]} the comma-separated words, trimmed, without empty ones. */
    const words = (text) => String(text).split(',').map((word) => word.trim()).filter(Boolean).slice(0, 12);

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-cp2-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    /** A field that saves when you leave it or press Enter. `kind` is 'number' or 'text'. */
    function Field({ value, kind, min, max, label, wide, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const commit = () => {
        if (kind === 'number') {
          const number = Math.round(Number(draft));
          if (!Number.isFinite(number)) return setDraft(String(value));
          const next = Math.min(max, Math.max(min, number));
          setDraft(String(next));
          if (next !== value) onCommit(next);
        } else if (draft !== value) onCommit(draft);
      };
      return h('input', {
        className: `dsh-cp2-field ${wide ? 'dsh-cp2-wide' : 'dsh-cp2-num'}`,
        type: kind === 'number' ? 'number' : 'text',
        ...(kind === 'number' ? { min, max, step: 1 } : { maxLength: 400, spellCheck: false }),
        value: draft,
        'aria-label': label,
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
          }
        },
      });
    }

    function CodePowerPage({ appCtx, embedded }) {
      const t = appCtx.locale.bind('codePower');
      const [settings, setSettings] = useState(null);
      const [note, setNote] = useState({ text: '', error: null });

      useEffect(() => {
        let alive = true;
        loadSettings(appCtx).then(
          (loaded) => alive && setSettings(loaded),
          () => alive && setNote({ text: t('unavailable'), error: null }),
        );
        return () => {
          alive = false;
        };
      }, [appCtx]);

      /** Save one top-level setting (a whole value, so a group is never half written). */
      const save = async (field, value) => {
        if (!settings) return;
        setNote({ text: t('saving'), error: null });
        try {
          setSettings(await mutateSettings(appCtx, [{ op: 'set', path: [field], value }], settings.revision));
          setNote({ text: t('saved'), error: null });
        } catch (error) {
          setNote({ text: '', error });
        }
      };

      const value = settings?.value ?? {};
      const best = { ...DEFAULTS.bestOfN, ...(value.bestOfN ?? {}) };
      const ci = { ...DEFAULTS.ciFix, ...(value.ciFix ?? {}) };
      const lanes = Array.isArray(value.prReview?.lanes) ? value.prReview.lanes : DEFAULTS.prReview.lanes;
      const criteria = Array.isArray(best.criteria) ? best.criteria : DEFAULTS.bestOfN.criteria;
      const row = (title, hint, control) =>
        h('div', { className: 'dsh-cp2-row' }, h('div', { className: 'dsh-cp2-rowtext' }, h('div', { className: 'dsh-cp2-rowtitle' }, title), h('div', { className: 'dsh-cp2-rowdesc' }, hint)), control);

      return h(
        'div',
        { className: 'dsh-cp2-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        embedded ? null : h('h2', { className: 'dsh-cp2-title' }, t('head.title')),
        h('p', { className: 'dsh-cp2-desc', style: embedded ? { marginTop: 12 } : undefined }, t('head.hint')),
        h('p', { className: 'dsh-cp2-desc' }, t('note.restart')),
        row(t('row.enabled'), t('row.enabled.hint'), h(Switch, { checked: value.enabled !== false, label: t('row.enabled'), onChange: (next) => save('enabled', next) })),

        h('div', { className: 'dsh-cp2-group' }, t('group.review')),
        row(t('review.lanes'), t('review.lanes.hint'), h(Field, { kind: 'text', wide: true, value: lanes.join(', '), label: t('review.lanes'), onCommit: (text) => words(text).length && save('prReview', { lanes: words(text) }) })),

        h('div', { className: 'dsh-cp2-group' }, t('group.best')),
        row(t('best.n'), t('best.n.hint'), h(Field, { kind: 'number', min: 2, max: 5, value: Number(best.n) || 3, label: t('best.n'), onCommit: (n) => save('bestOfN', { ...best, criteria, n }) })),
        row(t('best.role'), t('best.role.hint'), h(Field, { kind: 'text', wide: true, value: String(best.judgeRole ?? ''), label: t('best.role'), onCommit: (text) => text.trim() && save('bestOfN', { ...best, criteria, judgeRole: text.trim() }) })),
        row(t('best.criteria'), t('best.criteria.hint'), h(Field, { kind: 'text', wide: true, value: criteria.join(', '), label: t('best.criteria'), onCommit: (text) => words(text).length && save('bestOfN', { ...best, criteria: words(text) }) })),
        row(t('best.check'), t('best.check.hint'), h(Switch, { checked: best.consistencyCheck !== false, label: t('best.check'), onChange: (next) => save('bestOfN', { ...best, criteria, consistencyCheck: next }) })),

        h('div', { className: 'dsh-cp2-group' }, t('group.ci')),
        row(t('ci.rounds'), t('ci.rounds.hint'), h(Field, { kind: 'number', min: 1, max: 50, value: Number(ci.maxRounds) || 5, label: t('ci.rounds'), onCommit: (maxRounds) => save('ciFix', { ...ci, maxRounds }) })),
        row(t('ci.command'), t('ci.command.hint'), h(Field, { kind: 'text', wide: true, value: String(ci.command ?? ''), label: t('ci.command'), onCommit: (command) => save('ciFix', { ...ci, command: command.trim() }) })),

        h('div', { className: 'dsh-cp2-group' }, t('group.skills')),
        h('ul', { className: 'dsh-cp2-list' }, ['pr-review', 'ci-fix-loop', 'best-of-n', 'hunk-review'].map((id) => h('li', { key: id }, h('b', null, `/${id}`), t(`skill.${id}`)))),

        h('div', { className: 'dsh-cp2-status' }, note.error ? h(PlainNote, { error: note.error }) : note.text ? h('div', { className: 'dsh-kit-note', role: 'status' }, note.text) : null),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('codePower', DICT));
        const t = ctx.locale.bind('codePower');
        // Offered to the "Code tools" page (Code map) as a tab.
        ctx.effect(() => dshMerge.part('code-map', 'code-power', { label: () => t('tab.title'), order: 200, render: (props) => h(CodePowerPage, { ...props, appCtx: ctx, embedded: true }) }));
        // Alone (no Code map page), it has a page of its own.
        ctx.effect(() =>
          dshMerge.ownPageUnlessHosted('code-map', () =>
            ctx.effect(() =>
              ctx.slots.inject('settings.section', () =>
                ctx.slots.register({ name: 'settings.section', id: 'code-power', order: 531, label: () => t('section.title') }, (props) => h(CodePowerPage, { ...props, appCtx: ctx })),
              ),
            ),
          ),
        );
      },
    };
  },
});
