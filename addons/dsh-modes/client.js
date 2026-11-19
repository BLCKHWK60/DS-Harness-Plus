window.__ModuleLoader__.load({
  id: '@local/dsh-modes',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState, useLayoutEffect } = React;
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
    // ---- dsh-poll:begin ---- shared polling helpers; this block is the same in every add-on page file that uses it.
    // The master copy is docs/shared/dsh-poll.js. Change it there, then run `node scripts/sync-kit.mjs` (it copies the block into
    // every client.js that has the two marker lines, and `bash scripts/check.sh` fails when a copy has drifted).
    // Why it exists (review perf-settings-describe, 18 November 2026): every add-on page looked at the app's Settings and at its own
    // routes on its own timer, even in a hidden window. This gives all of them ONE shared Settings copy (read once, renewed when
    // Settings changes or after 30 seconds at the most) and one kind of polling loop that stops while the window is hidden.
    // The first copy of this block to run puts the shared state on `window.__dshPoll`; later copies reuse it, so 30 add-ons share one.
    const dshPoll = (() => {
      const API = 1;
      const root = typeof window !== 'undefined' ? window : globalThis;
      if (root.__dshPoll && root.__dshPoll.api >= API) return root.__dshPoll;

      /** How long a read of Settings stays good: with the change event working, 30 s is only a safety net. */
      const SETTINGS_TTL = 30000;
      /** Without the change event (an older app) the copy is only trusted for a moment. */
      const SETTINGS_TTL_NO_EVENTS = 2000;
      const WRITES = ['mutate', 'update', 'replace'];
      const stats = { settingsCalls: 0, settingsHits: 0, settingsInvalidations: 0, runs: 0, errors: 0 };
      const cache = { value: undefined, at: 0, inflight: null, gen: 0, events: false };
      const changeListeners = new Set();
      const watched = new WeakSet();
      const wrapped = new WeakSet();
      const loops = new Set();

      const isHidden = () => typeof root.document !== 'undefined' && root.document.hidden === true;
      // The page's timers (a test page without any simply never schedules).
      const setTimer = (fn, ms) => (typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(fn, ms) : null);
      const clearTimer = (id) => { if (id === null) return; if (typeof root.clearTimeout === 'function') root.clearTimeout(id); else if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(id); };

      /** Throw the shared copy away: the next read goes to the app. A read still on its way is not kept. */
      function invalidate() {
        stats.settingsInvalidations += 1;
        cache.value = undefined;
        cache.inflight = null;
        cache.gen += 1;
      }

      /** Listen once per page connection for "Settings changed" (the app sends it after every write, from any window). */
      function watch(ctx) {
        const remote = ctx && ctx.remote;
        if (!remote || watched.has(remote)) return;
        watched.add(remote);
        try {
          if (typeof remote.$on === 'function') {
            remote.$on('settings/document-updated', (ns) => {
              invalidate();
              for (const listener of [...changeListeners]) {
                try { listener(ns); } catch { /* one listener's trouble must not stop the others */ }
              }
            });
            cache.events = true;
          }
        } catch { /* no change event here: the short copy time covers it */ }
        try {
          if (typeof ctx.on === 'function') ctx.on('connection/reset', invalidate);
        } catch { /* optional */ }
        // This page's own writes drop the copy before their answer comes back, so a read that follows a write is never behind it.
        const settings = remote.settings;
        if (settings && !wrapped.has(settings)) {
          wrapped.add(settings);
          for (const name of WRITES) {
            const original = settings[name];
            if (typeof original !== 'function') continue;
            try {
              settings[name] = function (...args) {
                invalidate();
                const done = original.apply(this, args);
                return done && typeof done.then === 'function' ? done.then((out) => { invalidate(); return out; }, (error) => { invalidate(); throw error; }) : done;
              };
            } catch { /* a frozen object keeps the plain call */ }
          }
        }
      }

      /**
       * The app's Settings, the same answer as `ctx.remote.settings.describe()`, but read once for the whole page.
       * @param {object} ctx - the add-on's own context (its `remote.settings` makes the call).
       * @param {{fresh?: boolean}} [options] - `fresh: true` skips the shared copy (use it for the read before a save, so a stale
       *   revision cannot cause a conflict; every write drops the copy anyway).
       * @returns {Promise<object>} `{ok, value: {namespaces}}` or `{ok: false, error}`, never rejected for a bad answer.
       */
      function settings(ctx, options) {
        watch(ctx);
        const fresh = options && options.fresh === true;
        const ttl = cache.events ? SETTINGS_TTL : SETTINGS_TTL_NO_EVENTS;
        if (!fresh && cache.value !== undefined && Date.now() - cache.at < ttl) {
          stats.settingsHits += 1;
          return Promise.resolve(cache.value);
        }
        if (!fresh && cache.inflight) {
          stats.settingsHits += 1;
          return cache.inflight;
        }
        stats.settingsCalls += 1;
        const gen = cache.gen;
        const call = Promise.resolve(ctx.remote.settings.describe()).then((result) => {
          if (gen === cache.gen) {
            cache.inflight = null;
            if (result && result.ok !== false) { cache.value = result; cache.at = Date.now(); }
          }
          return result;
        }, (error) => {
          if (gen === cache.gen) cache.inflight = null;
          throw error;
        });
        if (!fresh) cache.inflight = call;
        return call;
      }

      /** One namespace's entry (`{ns, value, revision}`) from the shared copy, or undefined. */
      async function entry(ctx, ns, options) {
        const result = await settings(ctx, options);
        return result && result.ok !== false ? result.value.namespaces.find((item) => item.ns === ns) : undefined;
      }

      /** Be told when Settings changes (from this window or another). Returns the way to stop listening. */
      function onChange(ctx, listener) {
        watch(ctx);
        changeListeners.add(listener);
        return () => { changeListeners.delete(listener); };
      }

      /**
       * A polling loop that waits for its last run to finish, stops while the window is hidden and starts again, at once, when it
       * is shown. One timer per loop, never an interval.
       * @param {() => (Promise<unknown> | unknown)} run - one look. It may return a number (the wait before the next look, in ms),
       *   'idle' (wait `idle`: nothing to watch for now) or anything else (wait `every`).
       * @param {{every: number | (() => number), idle?: number, hidden?: number | (() => number), immediate?: boolean}} options
       *   `every`: wait while there is something to watch; `idle`: wait when the run says 'idle' (default five times `every`);
       *   `hidden`: wait while the window is hidden (default 0 = no looking at all until it is shown);
       *   `immediate`: look right away (default true).
       * @returns {{stop: () => void, poke: () => void, running: () => boolean}} `poke()` looks now (once, even if called often).
       */
      function loop(run, options) {
        const opts = options || {};
        const read = (value, fallback) => (typeof value === 'function' ? value() : typeof value === 'number' ? value : fallback);
        let timer = null;
        let alive = true;
        let busy = false;
        let again = false;
        let failures = 0;
        let next = null;

        const clear = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
        const schedule = (wait) => {
          clear();
          if (!alive) return;
          if (isHidden()) {
            const away = read(opts.hidden, 0);
            if (!(away > 0)) return; // paused: the visibility event starts it again
            wait = Math.max(wait, away);
          }
          timer = setTimer(tick, wait);
        };
        const waitFor = (result) => {
          const every = read(opts.every, 5000);
          if (typeof result === 'number' && result >= 0) return result;
          if (result === 'idle') return read(opts.idle, every * 5);
          return every;
        };
        async function tick() {
          timer = null;
          if (!alive) return;
          if (busy) { again = true; return; }
          busy = true;
          stats.runs += 1;
          let result;
          try {
            result = await run();
            failures = 0;
          } catch {
            stats.errors += 1;
            failures += 1;
            // A failing look backs off (up to a minute) instead of hammering.
            result = Math.min(60000, read(opts.every, 5000) * 2 ** Math.min(failures, 4));
          }
          busy = false;
          if (!alive) return;
          next = waitFor(result);
          if (again) { again = false; schedule(0); } else schedule(next);
        }
        const handle = {
          stop() { alive = false; clear(); loops.delete(handle); },
          poke() { if (!alive) return; if (busy) { again = true; return; } clear(); if (isHidden() && !(read(opts.hidden, 0) > 0)) return; timer = setTimer(tick, 0); },
          running: () => timer !== null || busy,
          // Called by the page-wide visibility listener.
          shown() { if (alive && !busy) { clear(); timer = setTimer(tick, 0); } },
          hiddenNow() { if (!(read(opts.hidden, 0) > 0)) clear(); },
        };
        loops.add(handle);
        if (opts.immediate === false) schedule(read(opts.every, 5000));
        else if (isHidden()) schedule(0);
        else void tick(); // the first look happens now, before this call returns
        return handle;
      }

      if (typeof root.document !== 'undefined' && typeof root.document.addEventListener === 'function') {
        root.document.addEventListener('visibilitychange', () => {
          for (const handle of [...loops]) {
            if (isHidden()) handle.hiddenNow();
            else handle.shown();
          }
        });
      }

      const shared = {
        api: API,
        settings,
        entry,
        onChange,
        invalidate,
        loop,
        stats: () => ({ ...stats, loops: loops.size, events: cache.events }),
      };
      root.__dshPoll = shared;
      return shared;
    })();
    // ---- dsh-poll:end ----

    const NS = 'modes';
    /** The Cowork sidebar's settings, whose tab count Settings → Modes sets. */
    const SHELL_NS = 'cowork-shell';
    const FALLBACK_MODES = [
      { id: 'chat', label: 'Chat' },
      { id: 'cowork', label: 'Cowork' },
      { id: 'code', label: 'Code' },
    ];

    const DICT = {
      en: {
        'composer.mode': 'Mode',
        'composer.failed': 'Could not switch mode',
        'toggle.search': 'Web',
        'toggle.search.on': 'Web search is on for this conversation. Click to switch it off.',
        'toggle.search.off': 'Web search is off for this conversation. Click to switch it on.',
        'toggle.research': 'Deep research',
        'toggle.research.on': 'Deep research is on: questions get a researched, cited report. Click to switch it off.',
        'toggle.research.off': 'Switch on deep research: questions get a researched, cited report.',
        'toggle.tools.on': 'Tools on',
        'toggle.tools.off': 'Tools off',
        'toggle.tools.title': 'What the model can call in this conversation',
        'tools.switch': 'Tools for this conversation',
        'tools.switch.hint': 'Off: the model is offered no tool at all, so it cannot try to call one. The web is off too.',
        'tools.chat': 'In Chat, tools means searching and reading the web. For files and commands, use Cowork or Code.',
        'tools.viaCode': 'This conversation is in PTC mode: the model reaches these tools from inside small programs it writes. The app stops such a program after a few minutes, so long jobs like Deep research suit Standard mode better.',
        'tools.can': 'Can call',
        'tools.cannot': 'Cannot call',
        'tools.later': 'Loaded when needed',
        'tools.later.hint': 'The model adds these itself when a task needs them, and naming them in your message adds them too. Settings → Modes.',
        'tools.notReady': 'Not set up for this conversation\'s model, so not offered: {names}.',
        'tools.none': 'Nothing',
        'tools.next': 'A change applies from your next message.',
        'tools.unknown': 'The list appears once this conversation has started.',
        'tools.blocked': 'Tools are off for this conversation.',
        'depth.quick': 'Quick',
        'depth.standard': 'Standard',
        'depth.thorough': 'Thorough',
        'depth.search.title': 'Search depth',
        'depth.search.open': 'Search depth: {0}. Click to change.',
        'depth.search.quick': 'One search and a short answer. Fastest.',
        'depth.search.standard': 'The model decides how much to search, as before.',
        'depth.search.thorough': 'Several searches, at least five pages read, facts cross-checked between sources. Slower.',
        'depth.research.title': 'Deep research depth',
        'depth.research.open': 'Deep research depth: {0}. Click to change.',
        'depth.research.quick': '1 round of searching, up to 4 helpers at once. At most about 10 minutes.',
        'depth.research.standard': '2 rounds, up to 6 helpers at once. After the first round the findings are reviewed, and the second round searches for what is missing with sharper queries. At most about 25 minutes.',
        'depth.research.thorough': '3 rounds, up to 8 helpers at once. Each round is reviewed and the next digs deeper. At most about 45 minutes, and the most tokens.',
        'depth.research.cap': 'Helpers at once are also held to the sub-agent limit in Settings → Model Tiers.',
        'helpers.one': 'One model',
        'helpers.many': '{n} models',
        'helpers.title.same': 'Helpers use this conversation\'s model. Only one model is loaded.',
        'helpers.title.roles': 'Helpers may use other models: up to {n} models at once.',
        'helpers.head': 'Models for helper agents',
        'helpers.same': 'One model for everything',
        'helpers.roles': 'Different models',
        'helpers.same.hint': 'Every helper agent runs on the model this conversation is on{model}. Nothing else has to be loaded, so this needs the least memory. This covers a /mission run, Deep research, Agent swarm, the Tier tools and Code power.',
        'helpers.roles.hint': 'Helpers run on the models set for their roles. Each different model may be loaded at the same time as the others.',
        'helpers.list': 'Models this conversation may use:',
        'helpers.list.own': 'this conversation',
        'helpers.list.none': 'No other model is set for any role, so everything still runs on this conversation\'s model. Set role models in Settings → Model Tiers, or for runs in Settings → Mission.',
        'helpers.from.tiers': 'Model Tiers, {role}',
        'helpers.from.mission': 'Mission, {role}',
        'helpers.from.project': 'Mission, this project, {role}',
        'helpers.role.plan': 'planner',
        'helpers.role.implement': 'workers',
        'helpers.role.review': 'reviewer',
        'helpers.role.fast': 'fast helpers',
        'helpers.scope': 'This choice is for this conversation.',
        'helpers.usual': 'New conversations start with: {name}.',
        'helpers.usual.set': 'Use this for new conversations too',
        'helpers.next': 'It applies to helpers started from now on.',
        'research.model.title': 'Model for the helpers',
        'research.model.same': 'Same as this conversation',
        'research.model.roles': 'Role models',
        'research.model.same.hint': 'Every helper runs on the model the conversation is on when the research starts.',
        'research.model.roles.hint': 'Helpers run on the role models set in Settings → Model Tiers → Role models: the planner, the reviewer and the writer on "Plan", the searchers on "Fast". A role without a model uses the conversation\'s model.',
        'section.title': 'Modes',
        'head.hint': 'A mode narrows the tools the model sees, can set the file sandbox, can move the conversation to a tier and adds a short prompt. A new conversation takes the mode of the selected sidebar tab (without the sidebar: the mode list in the chat box); /mode switches a conversation\'s mode (with the sidebar on: only after its first message). Changes apply from the next message.',
        'default.label': 'Mode for conversations that have not chosen one',
        'default.extra': '{label} (add-on)',
        'add': 'Add mode',
        'remove': 'Remove',
        'save': 'Save',
        'discard': 'Discard changes',
        'builtin': 'Restore built-in modes',
        'saved': 'Saved.',
        'dirty': 'Unsaved changes',
        'f.id': 'Id',
        'f.label': 'Label',
        'f.tools': 'Tools',
        'f.tools.all': 'All tools',
        'f.tools.none': 'No tools',
        'f.tools.some': 'Only these',
        'f.toolNames': 'Tool names, one per line (names that do not exist are ignored)',
        'f.sandbox': 'File sandbox',
        'f.sandbox.inherit': 'Leave as it is',
        'f.sandbox.read-only': 'Read only',
        'f.sandbox.workspace-write': 'Write in the workspace',
        'f.tier': 'Tier for this mode (optional): new conversations in it and switches to it use it',
        'f.prompt': 'Prompt added while this mode is active',
        'f.prompt.cowork': 'Empty: Plus uses its own working method for Cowork (understand the task, a step list, care with your files, check the result, report plainly). Write here to use your own instead.',
        'new.group': 'New conversations',
        'new.depth': 'Depth for new conversations (and those that never picked one)',
        'new.depth.hint': 'Where the Depth button starts in a new conversation, in every tab. A conversation that never had a Depth picked in the chat box follows it too. Picking a Depth in the chat box sets this too.',
        'new.scheduled': 'Mode for scheduled tasks',
        'new.scheduled.hint': 'A conversation that an Automation task opens starts in this mode, whatever tab is selected. A mode without tools cannot do the task\'s work.',
        'new.scheduled.gone': '{id} (not found: the first mode with all tools is used)',
        'tabs.group': 'Sidebar',
        'tabs.count': 'Tabs in the sidebar',
        'tabs.count.hint': 'How many of the modes below get a tab, in their order. A mode an add-on adds always gets one.',
        'tabs.none': 'No sidebar tab (only the first {n} modes get one), so this mode can only be reached with /mode.',
        'method.group': 'Built-in working methods',
        'method.code': 'Code: Plus\'s working method',
        'method.code.hint': 'Used while the Code mode\'s prompt below is empty: read first, make small changes, run the tests, report plainly.',
        'method.cowork': 'Cowork: Plus\'s working method',
        'method.cowork.hint': 'Used while the Cowork mode\'s prompt below is empty: understand the task, keep a step list, ask before changing your files, check the result, report plainly.',
        'rerun': 'Rerun with the selected model',
        'rerun.busy': 'Starting the rerun…',
        'rerun.none': 'This answer cannot be rerun: its question was not found.',
        'rerun.failed': 'The rerun could not be started',
        'rerun.files': 'Rerun started. Pictures and files attached to the question were not sent again; add them if they are needed.',
        'box.group': 'Chat box',
        'box.uniform': 'Same chat box in every mode',
        'box.uniform.hint': 'The buttons read the same in every mode: how much of their words show (Web · On, Depth, One model, Tools on) depends on the window\'s width alone, and the access button keeps one width. The other controls (the route badge, the Scratch mark and the buttons a mode adds: Creator Plus, Devices rules, Export, Focus, the Finance pill) go on a second line, under the same core buttons, when the row is full. The model button and Run have one width in every mode, Depth stays (greyed) when Tools are off, and Run stays (greyed) where a Long run cannot start. Off: each mode shrinks its own row as before.',
        'answer.group': 'Buttons under an answer',
        'web.label': 'Web',
        'depth.label': 'Depth',
        'depth.title': 'Depth',
        'depth.open': 'Depth: {0}. Click to change.',
        'depth.open.lens': 'Depth: {0}, Lens: {1}. Click to change.',
        'lens.title': 'Lens: how the answer is worded',
        'depth.long.title': 'Beyond Thorough',
        'depth.long': 'Long run settings…',
        'depth.long.hint': 'Time, laps and tools for a Long run in this chat, saved. Long run (next to Send) starts one with what you typed, after one question; Send stays at the depth above.',
        'depth.long.short': 'For the Long run button',
        'depth.quick.short': 'Fast, light checks',
        'depth.standard.short': 'As usual',
        'depth.thorough.short': 'Plan, 10+ searches, review',
        'depth.quick.short.isolated': 'Fast, 1–2 searches',
        'depth.standard.short.isolated': 'As usual',
        'depth.thorough.short.isolated': '10+ searches, checked',
        'depth.quick.short.research': '~10 min, 4 helpers',
        'depth.standard.short.research': '~25 min, 6 helpers',
        'depth.thorough.short.research': '~45 min, 8 helpers',
        'lens.short': 'Lens',
        'lens.web.short': 'Web off: unchecked facts labelled',
        'lens.default': 'Default',
        'lens.blunt': 'Blunt',
        'lens.scientific': 'Scientific',
        'lens.journalistic': 'Journalistic',
        'lens.data-only': 'Data only',
        'lens.skeptic': 'Skeptic',
        'lens.encouraging': 'Encouraging',
        'lens.default.hint': 'Everyday use. Adds nothing.',
        'lens.blunt.hint': 'The plain truth, no cushioning',
        'lens.scientific.hint': 'Health, technology, anything with studies',
        'lens.journalistic.hint': 'Events, people, organisations',
        'lens.data-only.hint': 'Figures you will judge yourself',
        'lens.skeptic.hint': 'Testing a plan, a claim or a source',
        'lens.encouraging.hint': 'When you want momentum',
        'lens.note': 'For this conversation only. A Lens changes how the answer is worded, never which facts are gathered; the tab\'s own rules come first.',
        'lens.web.off': 'Web is Off here: this Lens labels anything it could not check as an inference or a guess. Switch Web on to check facts.',
        'lens.own.hint': 'Your own Lens (Settings → Modes)',
        'own.group': 'Your own Lenses',
        'start.group': 'Starting values for new conversations',
        'start.hint': 'What the Web, Depth, Models and Tools buttons read when a conversation begins in each mode. "Usual" leaves what the mode does now (and the settings above). A button you press in a conversation replaces its starting value. Only that conversation changes, and nothing here widens what a mode may use: its tools, sandbox and blocks stay as set on its card.',
        'start.web': 'Web',
        'start.depth': 'Depth',
        'start.helpers': 'Models',
        'start.tools': 'Tools',
        'start.usual': 'Usual',
        'start.web.off': 'Off',
        'start.web.on': 'On',
        'start.web.verified': 'Verified',
        'start.web.open': 'Open web',
        'start.web.everything': 'Everything',
        'start.helpers.same': 'One model',
        'start.helpers.roles': 'Different models',
        'start.tools.off': 'Off',
        'start.isolated': 'Keeps its own web rules: only Off applies here.',
        'long.group': 'Long run tools',
        'skillsoff.group': 'Skills switched off per tab',
        'skillsoff.hint': 'In these tabs the model does not see these skills and cannot load them; typing /name still works. Tuner Plus proposes them from what each tab never uses.',
        'skillsoff.on': 'Switch back on',
        'long.hint': 'What a Long run may use in each tab, from the start. A run stays in its tab and keeps its way of working; Depth → Long run settings can change these for one chat.',
        'long.files': 'Files and commands',
        'long.web': 'Web',
        'long.isolated': 'Only inside its own room; no commands; its own search tools only',
        'own.hint': 'Lenses you write yourself appear in the chat box\'s Depth list after the six that come with Plus. At most 40, names up to 40 characters, texts up to 4,000. Each gets the same closing lines as every Lens: the tab\'s own rules, labels and order come first, and a required warning is not softening. Kept in Modes\' settings, so Shared settings carries them to your other Mac. A conversation whose Lens you remove goes back to Default.',
        'own.name': 'Name',
        'own.text': 'What the model is told',
        'own.add': 'Add a Lens',
        'own.remove': 'Remove',
        'own.save': 'Save your Lenses',
        'own.saved': 'Saved.',
        'own.full': 'You have 40 Lenses of your own, the most there can be.',
        'own.empty': 'None yet.',
        'own.problem': 'Lens {n} {problem}.',
        'depth.quick.hint': 'One short pass with quick checks; usually one web search. Helpers only when the tier asks for them.',
        'depth.standard.hint': 'As the working method says; the model decides how much to search. Adds nothing.',
        'depth.thorough.hint': 'A short plan first, 10+ searches with facts checked in two sources, its own work checked before finishing, and one review by a helper when helpers are allowed. Slower.',
        'depth.note': 'For this conversation, and where new conversations start in every tab. Depth sets how much work it gets: how much it searches when Web is on, helpers, planning, checks and reviews. A deep research run follows it too (about 10, 25 or 45 minutes; sooner where tools run through programs, the app\'s PTC preset). It adds to the working method and never replaces it. How hard the model thinks is the effort on the model button.',
        'depth.note.isolated': 'For this conversation, and where new conversations start in every tab. Here Depth sets how much it searches with its own tools, planning and checks; its own rules stay as they are. How hard the model thinks is the effort on the model button.',
        'depth.quick.hint.isolated': 'One short pass with quick checks; one or two searches with its own tools.',
        'depth.standard.hint.isolated': 'As its own rules say. Adds nothing.',
        'depth.thorough.hint.isolated': 'A short plan first, ten or more searches, ten sources read, every key fact checked in two sources, its own work checked before finishing. Slower.',
        'depth.note.research': 'For this conversation, and where new conversations start in every tab. Here Depth also sets how long a research run takes and how many helpers work at once (sooner where tools run through programs, the app\'s PTC preset: a run then stops before the app\'s program time limit). It adds to the method and never replaces it. How hard the model thinks is the effort on the model button.',
        'depth.quick.hint.research': 'Short work; a research run takes about 10 minutes, with up to 4 helpers.',
        'depth.standard.hint.research': 'As the method says; a research run takes about 25 minutes, with up to 6 helpers.',
        'depth.thorough.hint.research': 'A short plan and a check before finishing; a research run takes about 45 minutes, with up to 8 helpers. Slower.',
        'ws.title': 'Web sources',
        'ws.open': 'Web: {0}. Click to change.',
        'ws.off': 'Off',
        'ws.all': 'All',
        'ws.off.hint': 'No web for this conversation: no search, no pages, and no other tools or programs that go online. Connectors stay on.',
        'ws.all.hint': 'Every kind of source, as before.',
        'ws.off.research': 'This tab needs the web: searching is its work. Switch Tools off to stop it.',
        'ws.kinds': 'Sources (tick any mix)',
        'ws.nets': 'Recon\'s networks',
        'ws.k.verified': 'Verified sources',
        'ws.k.academic': 'Academic papers',
        'ws.k.news': 'News',
        'ws.k.sites': 'Ordinary sites',
        'ws.k.forums': 'Forums and boards',
        'ws.k.social': 'Social media and channels',
        'ws.k.archives': 'Archives',
        'ws.k.other': 'Other',
        'ws.k.tor': 'Tor (.onion)',
        'ws.k.usenet': 'Usenet',
        'ws.k.i2p': 'I2P',
        'ws.h.verified': 'Official bodies, courts, registers, statistics, wire services, public broadcasters.',
        'ws.h.academic': 'Journals, preprints, PubMed, universities.',
        'ws.h.news': 'News organisations and wire services, with dates.',
        'ws.h.sites': 'Everything else: companies, blogs, shops, documentation.',
        'ws.h.forums': 'Reddit, Stack Exchange, Hacker News and other forums.',
        'ws.h.social': 'X, YouTube, Telegram, Mastodon, Facebook and the like.',
        'ws.h.archives': 'Removed Reddit posts (pullpush, arctic-shift).',
        'ws.h.other': 'Your own sources: sites with a login, a key or a private address.',
        'ws.h.tor': '.onion search and pages, through Tor.',
        'ws.h.usenet': 'Text newsgroups, with your news server account.',
        'ws.h.i2p': 'Not set up yet.',
        'ws.other.none': 'None set up yet: Settings → Web sources.',
        'ws.other.none.recon': 'None allowed in Recon yet: Settings → Web sources.',
        'ws.saved': 'Saved selections',
        'ws.saveAs': 'Save as…',
        'ws.name': 'Name',
        'ws.save': 'Save',
        'ws.saved.done': 'Saved. It is in this list in every tab.',
        'ws.start': 'Use for new {0} conversations',
        'ws.started': 'New {0} conversations start with these.',
        'ws.edit': 'Edit sources…',
        'ws.note': 'For this conversation only. Results of unticked kinds are left out and their pages are not opened. Connectors stay on. How much it searches is set by Depth.',
        'ws.note.recon': 'For this conversation only. Recon\'s tools for unticked sources refuse. Recon keeps all its rules.',
        'wsp.moved': 'Web levels are now the Web selector\'s source ticks. Their lists, your saved selections and your own other sources are on Settings → Web sources.',
        'wsp.open': 'Open Web sources',
        'wsp.loading': 'Loading…',
        'wsp.head': 'What the Web button\'s ticks mean, in every tab. A conversation picks its ticks on the Web button; nothing here changes a conversation until you tick.',
        'wsp.lists': 'Lists',
        'wsp.lists.hint': 'One site or address ending per line (".gov" covers every site ending so). A site can be on more than one list. Forums, social media and the Reddit archives are known by name; anything on no list is an ordinary site.',
        'wsp.saveList': 'Save list',
        'wsp.listSaved': 'List saved.',
        'wsp.saved.hint': 'Selections you saved from the Web button, one click each there. Rename, change or remove them here. Recon\'s networks count only in Recon.',
        'wsp.add': 'Add a selection',
        'wsp.saveSelections': 'Save selections',
        'wsp.saved.bad': 'Each selection needs its own name and at least one tick.',
        'wsp.saved.saved': 'Selections saved.',
        'wsp.starts': 'Starting ticks per tab',
        'wsp.starts.hint': 'Set from the Web button with "Use for new … conversations". A tab without one starts with All.',
        'wsp.starts.none': 'Every tab starts with All.',
        'wsp.starts.clear': 'Back to All',
        'wsp.starts.cleared': 'That tab starts with All again.',
        'wsp.other': 'Other sources',
        'wsp.other.hint': 'Your own sources that others may not have: a site with a login, a key or a private address. Every tab can use them while Other is ticked. The model only ever sees a source\'s name: logins, keys, cookies and private addresses are kept in the app\'s secret store (as Finance\'s keys are) or in the macOS Keychain, your choice per source, and taken out of everything the model reads. Sites that sign in through their own web form are not supported; copy the sign-in cookie from your browser instead.',
        'wsp.o.name': 'Name',
        'wsp.o.login': 'Login',
        'wsp.o.store': 'Secrets kept in',
        'wsp.login.none': 'None',
        'wsp.login.basic': 'User name and password',
        'wsp.login.header': 'Key in a header',
        'wsp.login.cookie': 'Browser cookie',
        'wsp.login.secret-address': 'The address is secret',
        'wsp.store.app': 'The app\'s secret store',
        'wsp.store.keychain': 'macOS Keychain',
        'wsp.o.secretAddress': 'The address is kept as a secret below. Put {query} where search words go, or leave it out for a start page.',
        'wsp.o.search': 'Search address (with {query})',
        'wsp.o.start': 'Start address',
        'wsp.o.header': 'Header name',
        'wsp.o.recon': 'May be used in Recon (only through Recon\'s own WireGuard connection)',
        'wsp.o.keptApp': 'Kept in the app\'s secret store. Typed once, never shown again.',
        'wsp.o.keptKeychain': 'Kept in the macOS Keychain. Typed once, never shown again.',
        'wsp.o.saveFirst': 'Save the sources first; then type its login here.',
        'wsp.part.user': 'User name',
        'wsp.part.basic': 'Password',
        'wsp.part.header': 'Key',
        'wsp.part.cookie': 'Cookie',
        'wsp.part.secret-address': 'Secret address',
        'wsp.o.kept': 'kept',
        'wsp.o.keep': 'Keep',
        'wsp.o.isKept': 'Kept.',
        'wsp.o.notKept': 'Not kept yet.',
        'wsp.o.test': 'Test',
        'wsp.o.remove': 'Remove',
        'wsp.o.tested': 'It answered (status {0}): {1}',
        'wsp.o.failed': 'It did not work: {0}',
        'wsp.o.removed': 'Source removed, and what was kept for it forgotten.',
        'wsp.o.keptNow': 'Kept.',
        'wsp.o.unnamed': 'A source',
        'wsp.o.add': 'Add a source',
        'wsp.o.save': 'Save sources',
        'wsp.o.saved': 'Sources saved.',
        'wsp.recon': 'Recon\'s own networks (Tor, Usenet; I2P not set up yet) are set up on Settings → Recon → Hidden networks, and only Recon uses them.',
        'trim.group': 'Load tools as needed',
        'trim.hint': 'A mode switched on below starts each conversation with the core tools only (files, shell, step list, questions, skills, web) and a tool that adds the others when needed: PDF, data, finance, diagrams, scheduling, helpers and more. Your message adds them too when it names them ("read this PDF"). Requests are far smaller, so local models answer sooner. Added tools stay for the rest of the conversation.',
        'trim.mode': '{mode}: load tools as needed',
        'trim.none': 'No mode has all tools; modes with their own tool list keep that list.',
        'trim.extra': '{mode} (add-on): load tools as needed',
        'answer.rerun': 'Rerun button',
        'answer.rerun.hint': 'Asks the same question again in a fresh copy of the conversation, with the model selected in the chat box. The new model does not see the old answer. The old answer stays in the original conversation.',
        'answer.thumbs': 'Hide thumbs up and thumbs down',
        'answer.thumbs.hint': 'Takes the two feedback buttons away. Feedback in the chat box menu still works.',
        'f.prompt.code': 'Empty: Plus uses its own working method for code (read first, small changes, run the tests, report plainly). Write here to use your own instead.',
        'f.count': '{n} of 4000',
        'e.id': 'Ids use lower-case letters, digits and dashes, and must be unique.',
        'e.none': 'Keep at least one mode.',
        'e.default': 'The default mode must be one of the modes.',
        'e.broken': 'The stored mode list is not valid JSON. Saving replaces it with what you see here (the built-in three until you edit).',
        'e.tools': 'Choose at least one tool name, or pick All or None.',
        'failed': 'Could not read the Modes settings. Is the Modes add-on switched on?',
        'loading': 'Loading modes…',
        'save.failed': 'Could not save',
      },
      zh: {
        'composer.mode': '模式',
        'composer.failed': '无法切换模式',
        'toggle.search': '联网',
        'toggle.search.on': '此对话已开启网页搜索。点击关闭。',
        'toggle.search.off': '此对话已关闭网页搜索。点击开启。',
        'toggle.research': '深度研究',
        'toggle.research.on': '深度研究已开启：问题会得到经过研究、带引用的报告。点击关闭。',
        'toggle.research.off': '开启深度研究：问题会得到经过研究、带引用的报告。',
        'toggle.tools.on': '工具已开',
        'toggle.tools.off': '工具已关',
        'toggle.tools.title': '模型在此对话中可以调用什么',
        'tools.switch': '此对话的工具',
        'tools.switch.hint': '关闭后，模型得不到任何工具，也就不会尝试调用。搜索和深度研究也会关闭。',
        'tools.chat': '在聊天中，工具指搜索和阅读网页。处理文件和命令请使用 Cowork 或 Code。',
        'tools.viaCode': '此对话处于 PTC 模式：模型在它编写的小程序中调用这些工具。应用会在几分钟后停止这样的程序，因此深度研究等耗时任务更适合标准模式。',
        'tools.can': '可以调用',
        'tools.cannot': '不能调用',
        'tools.later': '按需加载',
        'tools.later.hint': '任务需要时模型会自行添加这些工具，消息中提到它们也会添加。设置 → 模式。',
        'tools.notReady': '此对话的模型未配置，因此不提供：{names}。',
        'tools.none': '无',
        'tools.next': '更改从你的下一条消息开始生效。',
        'tools.unknown': '此对话开始后会显示列表。',
        'tools.blocked': '此对话的工具已关闭。',
        'depth.quick': '快速',
        'depth.standard': '标准',
        'depth.thorough': '深入',
        'depth.search.title': '搜索深度',
        'depth.search.open': '搜索深度：{0}。点击更改。',
        'depth.search.quick': '搜索一次，简短回答。最快。',
        'depth.search.standard': '由模型决定搜索多少，与以前相同。',
        'depth.search.thorough': '多次搜索，至少阅读五个页面，并在来源之间核对事实。较慢。',
        'depth.research.title': '深度研究的深度',
        'depth.research.open': '深度研究的深度：{0}。点击更改。',
        'depth.research.quick': '搜索 1 轮，最多 4 个助手同时工作。最多约 10 分钟。',
        'depth.research.standard': '2 轮，最多 6 个助手同时工作。第一轮后审阅结果，第二轮用更准确的查询补充缺失内容。最多约 25 分钟。',
        'depth.research.thorough': '3 轮，最多 8 个助手同时工作。每轮都会审阅，下一轮更深入。最多约 45 分钟，消耗最多。',
        'depth.research.cap': '同时工作的助手数量还受“设置 → 模型档位”中子代理上限的限制。',
        'helpers.one': '单一模型',
        'helpers.many': '{n} 个模型',
        'helpers.title.same': '助手使用此对话的模型。只需加载一个模型。',
        'helpers.title.roles': '助手可能使用其他模型：最多同时 {n} 个模型。',
        'helpers.head': '助手代理所用模型',
        'helpers.same': '全部使用同一模型',
        'helpers.roles': '使用不同模型',
        'helpers.same.hint': '每个助手代理都在此对话所用的模型上运行{model}。无需加载其他模型，占用内存最少。适用于 /mission 运行、深度研究、代理群、层级工具和代码增强。',
        'helpers.roles.hint': '助手在为其角色设置的模型上运行。每个不同的模型都可能与其他模型同时加载。',
        'helpers.list': '此对话可能使用的模型：',
        'helpers.list.own': '此对话',
        'helpers.list.none': '没有为任何角色设置其他模型，因此一切仍在此对话的模型上运行。可在 设置 → 模型层级 中设置角色模型，或在 设置 → Mission 中为运行设置。',
        'helpers.from.tiers': '模型层级，{role}',
        'helpers.from.mission': 'Mission，{role}',
        'helpers.from.project': 'Mission，此项目，{role}',
        'helpers.role.plan': '规划者',
        'helpers.role.implement': '执行者',
        'helpers.role.review': '审阅者',
        'helpers.role.fast': '快速助手',
        'helpers.scope': '此选择仅用于此对话。',
        'helpers.usual': '新对话默认：{name}。',
        'helpers.usual.set': '新对话也使用此设置',
        'helpers.next': '对此后启动的助手生效。',
        'research.model.title': '助手使用的模型',
        'research.model.same': '与此对话相同',
        'research.model.roles': '角色模型',
        'research.model.same.hint': '每个助手都使用研究开始时此对话所用的模型。',
        'research.model.roles.hint': '助手使用“设置 → 模型档位 → 角色模型”中设置的模型：规划、审阅和撰写使用“规划”，搜索使用“快速”。未设置模型的角色使用对话的模型。',
        'section.title': '模式',
        'head.hint': '模式会限制模型可见的工具，可设置文件沙箱、切换档位并附加一小段提示词。新会话使用侧边栏所选标签页的模式（没有侧边栏时：输入框中的模式列表）；/mode 切换会话的模式（开启侧边栏时：仅在第一条消息之后）。修改在下一轮开始时生效。',
        'default.label': '尚未选择模式的会话使用',
        'default.extra': '{label}（插件）',
        'add': '添加模式',
        'remove': '删除',
        'save': '保存',
        'discard': '放弃更改',
        'builtin': '恢复内置模式',
        'saved': '已保存。',
        'dirty': '有未保存的更改',
        'f.id': '标识',
        'f.label': '名称',
        'f.tools': '工具',
        'f.tools.all': '全部工具',
        'f.tools.none': '无工具',
        'f.tools.some': '仅这些',
        'f.toolNames': '工具名称，每行一个（不存在的名称会被忽略）',
        'f.sandbox': '文件沙箱',
        'f.sandbox.inherit': '保持不变',
        'f.sandbox.read-only': '只读',
        'f.sandbox.workspace-write': '可写工作区',
        'f.tier': '此模式的档位（可选）：此模式中的新会话和切换到此模式时使用',
        'f.prompt': '此模式启用时附加的提示词',
        'f.prompt.cowork': '留空：Plus 使用自带的 Cowork 工作方法（先理解任务、步骤列表、谨慎对待你的文件、检查结果、如实报告）。在此填写则使用你自己的。',
        'new.group': '新会话',
        'new.depth': '新会话（及从未选过的会话）的细致度',
        'new.depth.hint': '每个标签中新会话细致度按钮的起始值。从未在输入框中选过细致度的会话也跟随它。在输入框中选择细致度也会设置它。',
        'new.scheduled': '定时任务的模式',
        'new.scheduled.hint': '自动化任务打开的会话以此模式开始，与所选标签页无关。没有工具的模式无法完成任务。',
        'new.scheduled.gone': '{id}（未找到：使用第一个拥有全部工具的模式）',
        'tabs.group': '侧边栏',
        'tabs.count': '侧边栏中的标签页',
        'tabs.count.hint': '下方模式中按顺序有多少个获得标签页。插件添加的模式总会有标签页。',
        'tabs.none': '没有侧边栏标签页（只有前 {n} 个模式有），因此只能用 /mode 进入此模式。',
        'method.group': '内置工作方法',
        'method.code': 'Code：Plus 的工作方法',
        'method.code.hint': '在下方 Code 模式的提示词为空时使用：先阅读、小步修改、运行测试、如实报告。',
        'method.cowork': 'Cowork：Plus 的工作方法',
        'method.cowork.hint': '在下方 Cowork 模式的提示词为空时使用：先理解任务、使用步骤列表、修改你的文件前先询问、检查结果、如实报告。',
        'rerun': '用当前所选模型重新运行',
        'rerun.busy': '正在开始重新运行…',
        'rerun.none': '无法重新运行此回答：找不到对应的问题。',
        'rerun.failed': '无法开始重新运行',
        'rerun.files': '已开始重新运行。问题中附带的图片和文件未再次发送，如有需要请重新添加。',
        'box.group': '聊天框',
        'box.uniform': '所有模式使用相同的聊天框',
        'box.uniform.hint': '各模式中的按钮显示得一样：按钮文字显示多少（Web · On、Depth、One model、Tools on）只取决于窗口宽度，权限按钮保持固定宽度。模式自己添加的按钮（Creator Plus、Devices rules、Export、Focus、Finance 标签）在一行放不下时，会排到第二行，位于相同的核心按钮之后。模型按钮和 Run 在每个模式中宽度相同；工具关闭时 Depth 仍在原处（变灰）；无法开始长时间运行时 Run 也仍在原处（变灰）。关闭：每个模式像以前一样各自收缩。',
        'answer.group': '回答下方的按钮',
        'web.label': '联网',
        'depth.label': '细致度',
        'depth.title': '细致度',
        'depth.open': '细致度：{0}。点击更改。',
        'depth.open.lens': '细致度：{0}，视角：{1}。点击更改。',
        'lens.title': '视角：回答的措辞方式',
        'depth.long.title': '比深入更进一步',
        'depth.long': '长时运行设置…',
        'depth.long.hint': '本对话长时运行的时间、圈数和工具，会被保存。“运行”按钮（在“发送”旁）用你输入的内容开始一次长时运行；“发送”仍按上面的深度。',
        'depth.long.short': '供“运行”按钮使用',
        'depth.quick.short': '快速，轻量检查',
        'depth.standard.short': '照常',
        'depth.thorough.short': '计划、10+ 次搜索、复核',
        'depth.quick.short.isolated': '快速，搜索 1–2 次',
        'depth.standard.short.isolated': '照常',
        'depth.thorough.short.isolated': '10+ 次搜索，核实',
        'depth.quick.short.research': '约 10 分钟，4 个助手',
        'depth.standard.short.research': '约 25 分钟，6 个助手',
        'depth.thorough.short.research': '约 45 分钟，8 个助手',
        'lens.short': '视角',
        'lens.web.short': '联网关闭：未核实的会标出',
        'lens.default': '默认',
        'lens.blunt': '直言',
        'lens.scientific': '科学',
        'lens.journalistic': '新闻',
        'lens.data-only': '只给数据',
        'lens.skeptic': '质疑',
        'lens.encouraging': '鼓励',
        'lens.default.hint': '日常使用。不额外添加内容。',
        'lens.blunt.hint': '直截了当，不加缓冲',
        'lens.scientific.hint': '健康、技术，任何涉及研究的话题',
        'lens.journalistic.hint': '事件、人物、机构',
        'lens.data-only.hint': '只给数据，由你自己判断',
        'lens.skeptic.hint': '检验计划、说法或来源',
        'lens.encouraging.hint': '想要动力的时候',
        'lens.note': '仅对本对话生效。视角只改变回答的措辞，从不改变收集哪些事实；标签页自己的规则优先。',
        'lens.web.off': '此处联网已关闭：此视角会把无法核实的内容标为推断或猜测。开启联网以核实事实。',
        'lens.own.hint': '你自己的视角（设置 → 模式）',
        'own.group': '你自己的视角',
        'start.group': '新对话的起始值',
        'start.hint': '每个模式中的对话开始时，Web、Depth、Models 和 Tools 按钮显示什么。“通常”保持模式现在的做法（以及上面的设置）。你在对话中按下按钮会替换它的起始值，只影响那个对话；这里的设置不会扩大模式可以使用的范围：工具、沙箱和限制仍按它的卡片设置。',
        'start.web': 'Web',
        'start.depth': 'Depth',
        'start.helpers': 'Models',
        'start.tools': 'Tools',
        'start.usual': '通常',
        'start.web.off': '关',
        'start.web.on': '开',
        'start.web.verified': '已验证',
        'start.web.open': '开放网络',
        'start.web.everything': '全部',
        'start.helpers.same': '一个模型',
        'start.helpers.roles': '不同的模型',
        'start.tools.off': '关',
        'start.isolated': '保持自己的网络规则：这里只有“关”有效。',
        'long.group': '长时运行的工具',
        'skillsoff.group': '各标签中关闭的技能',
        'skillsoff.hint': '在这些标签中，模型看不到这些技能，也无法加载它们；输入 /名称 仍然可用。Tuner Plus 会根据各标签从未使用的技能提出建议。',
        'skillsoff.on': '重新打开',
        'long.hint': '每个标签中长时运行一开始可以使用什么。运行留在它的标签里，保持它的工作方式；深度 → 长时运行设置可以为某个对话更改这些。',
        'long.files': '文件和命令',
        'long.web': '联网',
        'long.isolated': '只在它自己的房间里；不能运行命令；只用它自己的搜索工具',
        'own.hint': '你自己写的视角会出现在输入框细致度列表中，排在 Plus 自带的六个之后。最多 40 个，名称最多 40 个字符，文字最多 4,000 个字符。每个都会加上与所有视角相同的结尾：标签页自己的规则、标签和顺序优先，必要的警告不算软化。保存在模式的设置中，因此共享设置会把它们带到你的另一台 Mac。删除某个视角后，使用它的对话会回到默认。',
        'own.name': '名称',
        'own.text': '告诉模型的内容',
        'own.add': '添加视角',
        'own.remove': '删除',
        'own.save': '保存你的视角',
        'own.saved': '已保存。',
        'own.full': '你已有 40 个自己的视角，已达上限。',
        'own.empty': '还没有。',
        'own.problem': '视角 {n} {problem}。',
        'depth.quick.hint': '简短一遍，只做快速检查；通常只搜索一次。仅在层级要求时才使用助手。',
        'depth.standard.hint': '按工作方法进行，由模型决定搜索多少。不额外添加内容。',
        'depth.thorough.hint': '先做简短计划，10 次以上搜索并以两个来源核实事实，完成前检查自己的工作；允许使用助手时，由一个助手复核一次。较慢。',
        'depth.note': '对本对话生效，也是每个标签中新会话的起始值。细致度决定投入多少工作：联网时搜索多少、助手、计划、检查和复核。深度研究的运行也跟随它（约 10、25 或 45 分钟；在通过程序运行工具的对话中（应用的 PTC 预设）会更早结束）。它是对工作方法的补充，从不取代它。模型思考的深浅由模型按钮上的推理强度决定。',
        'depth.note.isolated': '对本对话生效，也是每个标签中新会话的起始值。在这里，细致度决定用它自己的工具搜索多少、计划和检查；它自己的规则保持不变。模型思考的深浅由模型按钮上的推理强度决定。',
        'depth.quick.hint.isolated': '简短一遍，只做快速检查；用它自己的工具搜索一两次。',
        'depth.standard.hint.isolated': '按它自己的规则进行。不额外添加内容。',
        'depth.thorough.hint.isolated': '先做简短计划，十次以上搜索，阅读十个来源，每个关键事实以两个来源核实，完成前检查自己的工作。较慢。',
        'depth.note.research': '对本对话生效，也是每个标签中新会话的起始值。在这里，细致度还决定一次研究运行的时长和同时工作的助手数量（在通过程序运行工具的对话中（应用的 PTC 预设），运行会在应用的程序时间限制之前更早结束）。它是对方法的补充，从不取代它。模型思考的深浅由模型按钮上的推理强度决定。',
        'depth.quick.hint.research': '简短的工作；一次研究运行约 10 分钟，最多 4 个助手。',
        'depth.standard.hint.research': '按方法进行；一次研究运行约 25 分钟，最多 6 个助手。',
        'depth.thorough.hint.research': '先做简短计划，完成前检查；一次研究运行约 45 分钟，最多 8 个助手。较慢。',
        'ws.title': '联网来源',
        'ws.open': '联网：{0}。点击更改。',
        'ws.off': '关闭',
        'ws.all': '全部',
        'ws.off.hint': '本对话不联网：不搜索、不打开网页，也不运行其他联网的工具或程序。连接器保持开启。',
        'ws.all.hint': '所有类型的来源，与以前相同。',
        'ws.off.research': '此标签页需要联网：搜索就是它的工作。关闭"工具"即可停止。',
        'ws.kinds': '来源（可任意组合）',
        'ws.nets': '侦察的网络',
        'ws.k.verified': '已核实来源',
        'ws.k.academic': '学术论文',
        'ws.k.news': '新闻',
        'ws.k.sites': '普通网站',
        'ws.k.forums': '论坛',
        'ws.k.social': '社交媒体和频道',
        'ws.k.archives': '存档',
        'ws.k.other': '其他',
        'ws.k.tor': 'Tor（.onion）',
        'ws.k.usenet': 'Usenet',
        'ws.k.i2p': 'I2P',
        'ws.h.verified': '官方机构、法院、登记处、统计、通讯社、公共广播。',
        'ws.h.academic': '期刊、预印本、PubMed、大学。',
        'ws.h.news': '新闻机构和通讯社，带日期。',
        'ws.h.sites': '其他一切：公司、博客、商店、文档。',
        'ws.h.forums': 'Reddit、Stack Exchange、Hacker News 等论坛。',
        'ws.h.social': 'X、YouTube、Telegram、Mastodon、Facebook 等。',
        'ws.h.archives': '已删除的 Reddit 帖子（pullpush、arctic-shift）。',
        'ws.h.other': '你自己的来源：需要登录、密钥或私密地址的网站。',
        'ws.h.tor': '通过 Tor 搜索和阅读 .onion 网站。',
        'ws.h.usenet': '文本新闻组，使用你的新闻服务器账户。',
        'ws.h.i2p': '尚未设置。',
        'ws.other.none': '尚未设置：设置 → 联网来源。',
        'ws.other.none.recon': '尚无允许在侦察中使用的来源：设置 → 联网来源。',
        'ws.saved': '已保存的组合',
        'ws.saveAs': '另存为…',
        'ws.name': '名称',
        'ws.save': '保存',
        'ws.saved.done': '已保存。它出现在每个标签页的列表中。',
        'ws.start': '用于新的{0}对话',
        'ws.started': '新的{0}对话将以这些来源开始。',
        'ws.edit': '编辑来源…',
        'ws.note': '仅对本对话生效。未勾选类型的结果会被略去，其页面不会被打开。连接器保持开启。搜索多少由细致度决定。',
        'ws.note.recon': '仅对本对话生效。未勾选来源的侦察工具会拒绝。侦察保留其所有规则。',
        'wsp.moved': '联网级别现在是联网选择器中的来源勾选。其列表、你保存的组合和你自己的其他来源在 设置 → 联网来源。',
        'wsp.open': '打开联网来源',
        'wsp.loading': '加载中…',
        'wsp.head': '联网按钮上各个勾选在每个标签页中的含义。对话在联网按钮上选择勾选；在你勾选之前，这里不会改变任何对话。',
        'wsp.lists': '列表',
        'wsp.lists.hint': '每行一个网站或地址结尾（".gov" 涵盖所有以此结尾的网站）。一个网站可以出现在多个列表中。论坛、社交媒体和 Reddit 存档按名称识别；不在任何列表中的是普通网站。',
        'wsp.saveList': '保存列表',
        'wsp.listSaved': '列表已保存。',
        'wsp.saved.hint': '你从联网按钮保存的组合，在那里一键使用。可在此重命名、修改或删除。侦察的网络只在侦察中有效。',
        'wsp.add': '添加组合',
        'wsp.saveSelections': '保存组合',
        'wsp.saved.bad': '每个组合需要自己的名称和至少一个勾选。',
        'wsp.saved.saved': '组合已保存。',
        'wsp.starts': '各标签页的初始勾选',
        'wsp.starts.hint': '在联网按钮上用"用于新的…对话"设置。没有设置的标签页以"全部"开始。',
        'wsp.starts.none': '每个标签页都以"全部"开始。',
        'wsp.starts.clear': '恢复为全部',
        'wsp.starts.cleared': '该标签页重新以"全部"开始。',
        'wsp.other': '其他来源',
        'wsp.other.hint': '别人可能没有的你自己的来源：需要登录、密钥或私密地址的网站。勾选"其他"时，每个标签页都可以使用。模型只看到来源的名称：登录信息、密钥、Cookie 和私密地址保存在应用的密钥存储（与财务的密钥相同）或 macOS 钥匙串中，每个来源由你选择，并从模型读取的所有内容中删除。不支持通过自身网页表单登录的网站；请改为从浏览器复制登录 Cookie。',
        'wsp.o.name': '名称',
        'wsp.o.login': '登录方式',
        'wsp.o.store': '密钥保存在',
        'wsp.login.none': '无',
        'wsp.login.basic': '用户名和密码',
        'wsp.login.header': '请求头中的密钥',
        'wsp.login.cookie': '浏览器 Cookie',
        'wsp.login.secret-address': '地址本身是秘密',
        'wsp.store.app': '应用的密钥存储',
        'wsp.store.keychain': 'macOS 钥匙串',
        'wsp.o.secretAddress': '地址作为秘密保存在下方。在搜索词的位置放 {query}，起始页则不放。',
        'wsp.o.search': '搜索地址（含 {query}）',
        'wsp.o.start': '起始地址',
        'wsp.o.header': '请求头名称',
        'wsp.o.recon': '可在侦察中使用（只通过侦察自己的 WireGuard 线路）',
        'wsp.o.keptApp': '保存在应用的密钥存储中。只输入一次，不再显示。',
        'wsp.o.keptKeychain': '保存在 macOS 钥匙串中。只输入一次，不再显示。',
        'wsp.o.saveFirst': '先保存来源，然后在这里输入其登录信息。',
        'wsp.part.user': '用户名',
        'wsp.part.basic': '密码',
        'wsp.part.header': '密钥',
        'wsp.part.cookie': 'Cookie',
        'wsp.part.secret-address': '私密地址',
        'wsp.o.kept': '已保存',
        'wsp.o.keep': '保存',
        'wsp.o.isKept': '已保存。',
        'wsp.o.notKept': '尚未保存。',
        'wsp.o.test': '测试',
        'wsp.o.remove': '删除',
        'wsp.o.tested': '它有回应（状态 {0}）：{1}',
        'wsp.o.failed': '没有成功：{0}',
        'wsp.o.removed': '来源已删除，为它保存的内容也已清除。',
        'wsp.o.keptNow': '已保存。',
        'wsp.o.unnamed': '一个来源',
        'wsp.o.add': '添加来源',
        'wsp.o.save': '保存来源',
        'wsp.o.saved': '来源已保存。',
        'wsp.recon': '侦察自己的网络（Tor、Usenet；I2P 尚未设置）在 设置 → 侦察 → 隐藏网络 中设置，只有侦察使用它们。',
        'trim.group': '按需加载工具',
        'trim.hint': '在下方开启的模式在每次对话开始时只加载核心工具（文件、终端、步骤列表、提问、技能、网页），并提供一个按需添加其他工具的工具：PDF、数据、财经、图表、日程、助手等。消息中提到时也会自动添加。请求小得多，本地模型响应更快。添加的工具在对话剩余部分保留。',
        'trim.mode': '{mode}：按需加载工具',
        'trim.none': '没有拥有全部工具的模式；有自己工具列表的模式保留其列表。',
        'trim.extra': '{mode}（插件）：按需加载工具',
        'answer.rerun': '重新运行按钮',
        'answer.rerun.hint': '在对话的新副本中用聊天框所选的模型再问一次同样的问题。新模型看不到旧回答，旧回答保留在原对话中。',
        'answer.thumbs': '隐藏点赞和点踩',
        'answer.thumbs.hint': '移除这两个反馈按钮。聊天框菜单中的反馈仍可使用。',
        'f.prompt.code': '留空：Plus 使用自带的编码工作方法（先阅读、小步修改、运行测试、如实报告）。在此填写则使用你自己的。',
        'f.count': '{n} / 4000',
        'e.id': '标识只能用小写字母、数字和连字符，且不能重复。',
        'e.none': '至少保留一个模式。',
        'e.default': '默认模式必须是已有模式之一。',
        'e.broken': '已存储的模式列表不是有效的 JSON。保存会用此处显示的内容替换它（编辑前为内置的三个）。',
        'e.tools': '请至少填写一个工具名称，或选择“全部”或“无”。',
        'failed': '无法读取模式设置。此配置是否加载了模式插件？',
        'loading': '正在加载模式…',
        'save.failed': '无法保存',
      },
    };

    const CSS = `
.dsh-modes-select {
  height: 28px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.dsh-modes-select:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); color: var(--dsw-alias-label-primary); }
.dsh-modes-select[disabled] { opacity: .55; cursor: default; }

.dsh-me-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-me-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-me-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-me-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-me-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: end; }
.dsh-me-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-me-field.wide { grid-column: 1 / -1; }
.dsh-me-field > span { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
/* The page's own setting is a row: text on the left, the control on the right. */
.dsh-me-page > .dsh-me-field { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 0 0 16px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-me-page > .dsh-me-field > span { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsh-me-page > .dsh-me-field > .dsh-me-sel { flex: 0 1 220px; }
.dsh-me-in, .dsh-me-ta, .dsh-me-sel { box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; min-width: 0; }
.dsh-me-in:focus-visible, .dsh-me-ta:focus-visible, .dsh-me-sel:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 0; }
.dsh-me-ta { height: auto; min-height: 76px; padding: 8px 14px; resize: vertical; line-height: 20px; }
.dsh-me-in[data-bad="true"] { outline: 1px solid var(--dsw-alias-state-error-primary); }
.dsh-me-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); width: fit-content; max-width: 100%; }
.dsh-me-seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.dsh-me-seg button:hover { color: var(--dsw-alias-label-primary); }
.dsh-me-seg button[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); color: var(--dsw-alias-label-primary); }
.dsh-me-seg button:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-me-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-me-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-me-btn[disabled] { opacity: .5; cursor: default; }
.dsh-me-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-me-btn.primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-me-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-me-spacer { flex: 1; }
.dsh-me-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-me-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-me-count { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); align-self: flex-end; }
.dsh-me-title { display: flex; align-items: center; gap: 8px; }
.dsh-me-title b { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-me-toggle { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-me-toggle > div { flex: 1; min-width: 0; }
.dsh-me-toggle b { display: block; font-size: 14px; line-height: 22px; font-weight: 400; color: var(--dsw-alias-label-primary); }
.dsh-me-toggle span { display: block; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-me-lts { display: flex; flex: none; gap: 14px; align-items: center; }
.dsh-me-lts[data-wrap] { flex: 1 1 auto; flex-wrap: wrap; justify-content: flex-end; gap: 8px 14px; }
.dsh-me-lt { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-me-sw:disabled { opacity: .4; cursor: default; }
.dsh-me-sw { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease; }
.dsh-me-sw[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-me-sw::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-me-sw[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-me-group { margin: 8px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-me-title code { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-me-toggle > .dsh-me-sel { flex: 0 1 220px; }
.dsh-me-note[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
`;

    /**
     * Parse a JSON object stored in a settings string field.
     * @param {unknown} value - field value.
     * @returns {Record<string, unknown>} object, or an empty one.
     */
    function readObject(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    /**
     * Read the mode list and the session's choice from the settings view.
     * @param {object} view - settings namespace value.
     * @param {string} sessionId - session id.
     * @returns {{modes: Array<{id: string, label: string}>, current: string}} view model.
     */
    function describeModes(view, sessionId) {
      const defined = Object.entries(readObject(view?.modes)).map(([id, value]) => ({
        id,
        label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
      }));
      const modes = defined.length > 0 ? defined : [...FALLBACK_MODES];
      // Modes that other add-ons add come after these and never replace one.
      for (const [id, value] of Object.entries(readObject(view?.extraModes))) {
        if (!modes.some((mode) => mode.id === id)) modes.push({ id, label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id });
      }
      const chosen = readObject(view?.sessionModes)[sessionId];
      const fallback = view?.defaultMode;
      const current = [chosen, fallback].find((id) => modes.some((mode) => mode.id === id)) ?? modes[0].id;
      return { modes, current };
    }

    // `fresh`: a read that a save follows asks the app itself (never the page's shared copy), so the revision it sends is current.
    async function load(ctx, fresh = false) {
      const result = await dshPoll.settings(ctx, { fresh });
      if (!result.ok) throw dshKit.fail(result.error);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw new Error('The Modes settings namespace is not mounted.');
      // While the Cowork sidebar is on, its tabs choose the mode, so the chat-box selector hides.
      const shell = result.value.namespaces.some((item) => item.ns === 'cowork-shell');
      return { value: entry.value, revision: entry.revision, shell };
    }

    // ---- Rerun: the same question again, with the model now selected, in a fresh copy -----------

    const RERUN_CSS = `
.dsh-rr { width: calc(28px + var(--dsh-content-font-delta,0px)); height: calc(28px + var(--dsh-content-font-delta,0px)); padding: 6px; border: 0; border-radius: var(--dsw-radius-sm, 8px); display: flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dsh-rr:hover:not([disabled]) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rr:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-rr[disabled] { cursor: default; opacity: .4; }
.dsh-rr svg { width: calc(17px + var(--dsh-content-font-delta,0px)); height: calc(17px + var(--dsh-content-font-delta,0px)); }
.dsh-rr[data-busy="true"] svg { animation: dsh-rr-spin .9s linear infinite; }
@keyframes dsh-rr-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dsh-rr[data-busy="true"] svg { animation: none; } }
.dsh-rr-note { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 360px; }
.dsh-rr-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
html[data-dsh-nothumbs="true"] [data-slot="conversation.chat.assistant-actions"] > button[aria-pressed] { display: none; }
`;

    /** The two switches from Settings → Modes, shared by every answer on screen. */
    const answerFlags = { rerun: true, thumbs: false, users: 0, timer: 0, listeners: new Set() };
    async function refreshAnswerFlags(ctx) {
      try {
        const { value } = await load(ctx);
        const rerun = value?.rerunButton !== false;
        const thumbs = value?.hideFeedback === true;
        document.documentElement.setAttribute('data-dsh-nothumbs', String(thumbs));
        if (rerun === answerFlags.rerun && thumbs === answerFlags.thumbs) return;
        answerFlags.rerun = rerun;
        answerFlags.thumbs = thumbs;
        for (const listener of answerFlags.listeners) listener();
      } catch {
        /* the settings are read again at the next tick */
      }
    }

    /**
     * Where an answer's question is: the question's own text, and the last event of the turn before it.
     * @param {object[]} events - the conversation's events, oldest first.
     * @param {string} messageId - the answer's closing message.
     * @returns {{text: string, cut: number | undefined, more: boolean} | undefined} the plan; undefined when the answer is not in these events.
     */
    function rerunPlan(events, messageId) {
      const answer = events.find((event) => event?.type === 'assistant/message' && event.data?.message?.id === messageId);
      if (!answer) return undefined;
      const turn = answer.data.turn;
      const start = events.find((event) => event?.type === 'turn/start' && event.data?.turn === turn);
      if (!start) return undefined;
      const asked = events.filter((event) => event?.type === 'user/message' && event.seq > start.seq && event.seq < answer.seq && event.data?.source?.kind === 'user');
      const parts = asked.flatMap((event) => (Array.isArray(event.data?.content) ? event.data.content : []));
      const text = parts.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n\n').trim();
      // The copy ends where the turn before this one ended. A first turn has nothing before it.
      const before = events.filter((event) => event?.type === 'turn/end' && event.seq < start.seq).at(-1);
      return { text, cut: before?.seq, more: parts.some((part) => part?.type !== 'text') };
    }

    async function readEvents(remote, sessionId, messageId) {
      let events = [];
      let beforeSeq;
      // Newest first, a window at a time, until the answer and the turn before it are both in hand.
      for (let round = 0; round < 12; round += 1) {
        const result = await remote.page({ address: { kind: 'session', sessionId }, maxMessages: 200, ...(beforeSeq === undefined ? {} : { beforeSeq }) }, new AbortController().signal);
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message ?? ''}`);
        const page = (result.value.records ?? []).map((record) => record.event).filter(Boolean);
        events = [...page, ...events];
        const plan = rerunPlan(events, messageId);
        if (plan && (plan.cut !== undefined || !result.value.hasMore)) return plan;
        if (!result.value.hasMore || page.length === 0) return plan;
        beforeSeq = page[0].seq;
      }
      return rerunPlan(events, messageId);
    }

    async function startRerun(appCtx, sessionId, messageId) {
      const remote = appCtx.get('remote.session');
      const sessions = appCtx.get('sessions');
      const workspace = appCtx.get('uiWorkspace');
      if (!remote?.page || !sessions?.fork || !workspace?.openSession) throw new Error('this version of the app does not offer what a rerun needs');
      const plan = await readEvents(remote, sessionId, messageId);
      if (!plan || !plan.text) return { ok: false, reason: 'none' };
      // What the copy must carry over: the model selected now, the folder, and the tab.
      const read = await remote.projections({ sessionId });
      const values = read.ok ? read.value?.values ?? read.value ?? {} : {};
      const model = values.modelSelection?.next;
      let child;
      if (plan.cut !== undefined) {
        child = await sessions.fork({ sessionId, atSeq: plan.cut, increaseTitle: true });
      } else {
        const cwd = typeof values.workingDirectory === 'string' ? values.workingDirectory : values.workingDirectory?.cwd ?? values.workingDirectory?.path;
        child = await sessions.create(cwd ? { cwd } : {});
      }
      // The copy keeps the conversation's own choices too, so the same question runs the same way
      // (with Web Off it stays off): its mode, Web choice and level, Tools switch, helpers' model
      // and the tools it added.
      // A copy that carries earlier turns of an isolated conversation (Recon) is isolated for good
      // too: it holds what that conversation read. A copy of the first question carries none.
      // A copy with earlier turns also has their access level, so it keeps the level to go back to.
      const CARRIED = ['sessionModes', 'sessionWeb', 'sessionWebLevel', 'sessionSearchDepth', 'sessionDepth', 'sessionLens', 'sessionTools', 'sessionHelpers', 'sessionToolSets', ...(plan.cut !== undefined ? ['sessionIsolated', 'sessionSandboxBase'] : [])];
      const fresh = await load(appCtx, true);
      const carried = CARRIED.filter((field) => (field === 'sessionIsolated' ? readObject(fresh.value[field])[sessionId] === true : readObject(fresh.value[field])[sessionId] !== undefined));
      if (carried.length > 0) {
        const build = (value) => carried.map((field) => ({ op: 'set', path: [field], value: JSON.stringify({ ...readObject(value[field]), [child]: readObject(fresh.value[field])[sessionId] }) }));
        let saved = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
        if (!saved.ok && saved.error.code === 'settings/conflict') {
          const again = await load(appCtx, true);
          saved = await appCtx.remote.settings.mutate(NS, build(again.value), again.revision);
        }
      }
      if (model?.provider && model?.model) {
        await remote.selectModel({ sessionId: child, provider: model.provider, model: model.model, ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }) });
      }
      let zone;
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { zone = undefined; }
      const sent = await remote.prompt({
        requestId: globalThis.crypto?.randomUUID?.() ?? `rerun-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sessionId: child, mode: 'queue', content: [{ type: 'text', text: plan.text }], ...(zone ? { clientTimeZone: zone } : {}),
      });
      workspace.openSession(child);
      if (!sent.ok) throw new Error(`${sent.error.code}: ${sent.error.message ?? ''}`);
      return { ok: true, more: plan.more };
    }

    function RerunAction({ appCtx, sessionId, messageId }) {
      const t = appCtx.locale.bind('modes');
      const [, bump] = useState(0);
      const [state, setState] = useState({ busy: false, note: '', bad: false });
      useEffect(() => {
        const listener = () => bump((n) => n + 1);
        answerFlags.listeners.add(listener);
        answerFlags.users += 1;
        // One look for every answer on screen: when Settings changes, otherwise every 30 s; none while the window is hidden.
        if (answerFlags.users === 1) {
          const watcher = dshPoll.loop(() => refreshAnswerFlags(appCtx), { every: 30000 });
          const off = dshPoll.onChange(appCtx, (ns) => { if (ns === NS) watcher.poke(); });
          answerFlags.timer = { stop: () => { watcher.stop(); off(); } };
        }
        return () => {
          answerFlags.listeners.delete(listener);
          answerFlags.users -= 1;
          if (answerFlags.users === 0) answerFlags.timer?.stop?.();
        };
      }, [appCtx]);
      if (!answerFlags.rerun || !sessionId || !messageId) return h('style', null, RERUN_CSS);
      const run = async () => {
        if (state.busy) return;
        setState({ busy: true, note: '', bad: false });
        try {
          const done = await startRerun(appCtx, sessionId, messageId);
          setState({ busy: false, note: done.ok ? (done.more ? t('rerun.files') : '') : t('rerun.none'), bad: !done.ok });
        } catch (error) {
          setState({ busy: false, note: `${t('rerun.failed')}: ${String(error?.message ?? error).slice(0, 160)}`, bad: true });
        }
      };
      return h(React.Fragment, null,
        h('style', null, RERUN_CSS),
        h('button', { type: 'button', className: 'dsh-rr', 'aria-label': t('rerun'), title: state.busy ? t('rerun.busy') : t('rerun'), disabled: state.busy, 'data-busy': String(state.busy), onClick: () => void run() },
          h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75' }), h('path', { d: 'M13.4 2.6v2.9h-2.9' }))),
        state.note ? h('span', { className: 'dsh-rr-note', 'data-bad': String(state.bad), role: 'status' }, state.note) : null);
    }

    function ModeControl({ appCtx, sessionId }) {
      const t = appCtx.locale.bind('modes');
      const [state, setState] = useState({ status: 'loading', view: null, revision: 0, busy: false, shell: false });

      const refresh = useCallback(async () => {
        try {
          const loaded = await load(appCtx);
          // A refresh never ends a switch that is still being saved.
          setState((prev) => (prev.busy ? prev : { status: 'ready', view: loaded.value, revision: loaded.revision, busy: false, shell: loaded.shell }));
        } catch {
          setState((prev) => ({ ...prev, status: prev.view ? prev.status : 'error' }));
        }
      }, [appCtx]);
      const shellRef = useRef(false);
      shellRef.current = state.shell;

      // Re-read now and every few seconds, so a switch made with the /mode command shows up.
      // Hidden windows skip it; with the Cowork sidebar on (selector hidden) it checks only every 30 s.
      useEffect(() => {
        // Settings are read once for the whole page and again the moment they change (a /mode switch, a change in another window);
        // every 30 s is only a safety net, and nothing is read while the window is hidden.
        const watcher = dshPoll.loop(() => refresh(), { every: 30000 });
        const off = dshPoll.onChange(appCtx, () => watcher.poke());
        return () => { watcher.stop(); off(); };
      }, [refresh, sessionId]);

      const choose = async (modeId) => {
        if (!sessionId || state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          // Build the write from the latest value, and rebuild it if someone else wrote in between.
          const build = (value) => [{ op: 'set', path: ['sessionModes'], value: JSON.stringify({ ...readObject(value.sessionModes), [sessionId]: modeId }) }];
          let fresh = await load(appCtx, true);
          let result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx, true);
            result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setState((prev) => ({ ...prev, status: 'ready', view: result.value.value, revision: result.value.revision, busy: false }));
        } catch {
          setState((prev) => ({ ...prev, busy: false }));
          void refresh();
        }
      };

      if (state.status !== 'ready' || !sessionId || state.shell) return null;
      const { modes, current } = describeModes(state.view, sessionId);
      return h(
        React.Fragment,
        null,
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'select',
          {
            className: 'dsh-modes-select',
            value: current,
            disabled: state.busy,
            title: t('composer.mode'),
            'aria-label': t('composer.mode'),
            onChange: (event) => choose(event.target.value),
          },
          modes.map((mode) => h('option', { key: mode.id, value: mode.id }, mode.label)),
        ),
      );
    }

    const TOGGLE_CSS = `
.dsh-me-tools{display:inline-flex;gap:6px;align-items:center}
/* Same chat box in every mode (uniformBox): the access button keeps one width, and the other controls of the seat (route badge, Scratch mark, add-on buttons) move to a second line when the row is full. */
[data-dsh-pin] [data-slot="conversation.input.permission"] > *{min-width:156px;display:inline-flex;justify-content:flex-start}
[data-dsh-below]{flex:1 1 0 !important;flex-wrap:wrap !important;row-gap:6px;align-self:flex-start;padding-top:3px}
[data-dsh-below] ~ *{align-self:flex-start}
[data-dsh-below]::after{content:'';order:4;flex:0 0 100%;height:0}
[data-dsh-wrap]{flex-wrap:wrap !important;row-gap:6px}
[data-dsh-below] [data-slot="conversation.input.left"] > :not(.dsh-me-tools):not(style),[data-dsh-wrap] [data-slot="conversation.input.left"] > :not(.dsh-me-tools):not(style){order:5}
/* The same row in every mode (18 November): the model button (its name differs per mode; cut with "…", in full on hover) and
   Run ("Run" or "Running") have one width in every mode, so Run, Export and the gear sit in the same place everywhere. While
   the step is chosen (data-dsh-measure, set for a moment only) the other parts whose width changes from one conversation to
   the next count at one fixed width each: the Web and Depth values ("· Off", "· Always on", "· Thorough"), "One model" / "2 models", "Tools on" / "off". So the step follows the
   box's width alone, and the real parts are never wider than counted (the caps), so the row always fits. */
html[data-dsh-uniform="true"] .dsh-mc-trigger{width:140px;max-width:140px;box-sizing:border-box}
html[data-dsh-uniform="true"] .dsh-mc-trigger .dsh-mc-chevron{margin-left:auto}
html[data-dsh-uniform="true"] .dsh-ms-runbtn{min-width:92px;box-sizing:border-box;justify-content:center}
[data-dsh-narrow] .dsh-ac-inline{display:none !important}
[data-dsh-tiny] .dsh-mc-trigger{width:96px !important;max-width:96px !important}
[data-dsh-tiny] .dsh-ms-runbtn{min-width:0 !important;padding:0 8px !important;gap:0 !important;font-size:0 !important}
[data-dsh-measure] .dsh-me-tools:not([data-f1]) .lvl{display:inline-block !important;width:6.5em !important}
[data-dsh-measure] .dsh-me-tools:not([data-f1]) button[data-helpers] .lbl{display:inline-block;min-width:5em}
[data-dsh-measure] .dsh-me-tools:not([data-f2]) button[data-tools] .lbl{display:inline-block;min-width:4.3em}
html[data-dsh-uniform="true"] .dsh-me-tools .lvl{max-width:6.5em;overflow:hidden;text-overflow:ellipsis}
.dsh-me-tools button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.dsh-me-tools button[aria-pressed='true']{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}
.dsh-me-tools button:disabled{opacity:.5;cursor:default}
@media (hover:hover){.dsh-me-tools button:hover:not([aria-pressed='true']):not([aria-disabled='true']){background:var(--dsw-alias-interactive-bg-hover)}.dsh-me-tools .pair[data-fixed] button[aria-pressed='false']{opacity:.5}}
@media (max-width:760px){.dsh-me-tools button{padding:0 8px}.dsh-me-tools button .lbl{display:none}}
.dsh-me-tools svg{flex:none}
.dsh-me-tools .pair{display:inline-flex;align-items:center}
.dsh-me-tools .pair > button:first-child{border-top-right-radius:0;border-bottom-right-radius:0}
.dsh-me-tools .pair > button:only-child{border-radius:14px}
.dsh-me-tools .pair > button.more{width:20px;padding:0;justify-content:center;margin-left:-1px;border-top-left-radius:0;border-bottom-left-radius:0}
.dsh-me-tools{flex:none;white-space:nowrap}
.dsh-me-tools[data-f1]{gap:4px}
.dsh-me-tools[data-f1] .lvl{display:none}
.dsh-me-tools[data-f1] button:not(.more){padding:0 8px}
.dsh-me-tools[data-f1] .pair > button.more{width:18px}
.dsh-me-tools[data-f1] button[data-helpers] .lbl{display:none}
.dsh-me-tools button[data-helpers='many']{border-color:var(--dsw-alias-state-warning-primary,#d98a00);color:var(--dsw-alias-state-warning-primary,#d98a00)}
.dsh-me-tools[data-f2] button[data-tools] .lbl{display:none}
.dsh-me-tools[data-f3] .pair[data-kind='research'] .lbl{display:none}
.dsh-me-tools[data-f3] .pair[data-kind='depth'] .lbl{display:none}
.dsh-me-tools[data-f4] .pair[data-kind='search'] .lbl{display:none}
.dsh-me-tools[data-f5] button:not(.more){padding:0 6px}
.dsh-me-tools[data-f5] .pair > button.more{width:16px}
.dsh-me-tools .pair .lvl{opacity:.8}
.dsh-me-pop .title{font-size:14px;line-height:22px;font-weight:500}
.dsh-me-pop .opts{display:flex;flex-direction:column;gap:2px;margin:8px -6px 0}
.dsh-me-pop .opts button{display:block;width:100%;text-align:left;border:0;border-radius:10px;padding:7px 10px;background:transparent;font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary)}
.dsh-me-pop .opts button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-me-pop .opts button[aria-current='true']{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)}
.dsh-me-pop .opts b{display:block;font-size:13px;line-height:18px;font-weight:600}
.dsh-me-pop .opts small{display:block;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dsh-me-pop input[type=range]{display:block;width:100%;margin:12px 0 2px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-me-pop .steps{display:flex;justify-content:space-between}
.dsh-me-pop .steps button{border:0;padding:2px 0;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dsh-me-pop .steps button[aria-current='true']{color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-me-pop .seg{display:flex;gap:6px;margin-top:6px}
.dsh-me-pop .seg button{flex:1;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-me-pop .seg button[aria-pressed='true']{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}
.dsh-me-tools button[data-tools='off']{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dsh-me-pop{position:fixed;z-index:1000;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);overflow:auto;padding:14px 16px;border-radius:16px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 8px 28px rgba(0,0,0,.28)}
.dsh-me-pop .row{display:flex;align-items:center;gap:12px}
.dsh-me-pop .row > span:first-child{flex:1;font-size:14px;line-height:22px}
.dsh-me-pop .hint{margin:4px 0 0;color:var(--dsw-alias-label-secondary)}
.dsh-me-pop[data-slim]{width:272px;padding:12px 14px}
.dsh-me-pop[data-slim] .title{font-size:13px;line-height:20px}
.dsh-me-pop[data-slim] .opts{margin-top:4px}
.dsh-me-pop[data-slim] .opts button{display:flex;align-items:baseline;gap:8px;padding:6px 10px}
.dsh-me-pop[data-slim] .opts b{flex:none}
.dsh-me-pop[data-slim] .opts small{flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-me-pop[data-slim] .title + .chips, .dsh-me-pop[data-slim] .sep{margin-top:10px}
.dsh-me-pop[data-slim] .sep{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:8px}
.dsh-me-tip{position:fixed;z-index:1001;box-sizing:border-box;max-width:300px;padding:8px 10px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)));color:var(--dsw-alias-label-primary);font-size:12px;line-height:17px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none}
.dsh-me-pop .head{margin:12px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-me-pop .names{display:flex;flex-wrap:wrap;gap:4px}.dsh-me-pop .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.dsh-me-pop .chips button{padding:3px 10px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font:inherit;cursor:pointer}.dsh-me-pop .chips button[aria-selected='true']{background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);border-color:transparent;font-weight:500}.dsh-me-pop .chips button:hover:not([aria-selected='true']){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-me-pop .names span{padding:0 7px;border-radius:9px;line-height:18px;font-size:11px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}
.dsh-me-pop .names[data-no='true'] span{color:var(--dsw-alias-label-secondary);text-decoration:line-through}
.dsh-me-pop .sw{flex:none;position:relative;width:36px;height:20px;padding:2px;border:0;border-radius:999px;cursor:pointer;background:var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));transition:background .12s ease}
.dsh-me-pop .sw[aria-checked='true']{background:var(--dsw-alias-brand-primary)}
.dsh-me-pop .sw::after{content:'';display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary));transition:transform .12s ease}
.dsh-me-pop .sw[aria-checked='true']::after{transform:translateX(16px);background:var(--dsw-alias-bg-base)}
`;
    const ICON = {
      search: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
      research: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M8 10.5h5M10.5 8v5',
      tools: 'M14.5 6.5a4 4 0 0 0-5.4 5L4 16.6V20h3.4l5.1-5.1a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z',
      // Three bars of rising height: how much care.
      depth: 'M5 19v-4M12 19V10M19 19V5',
      // One chip (a model); two stacked chips (several models).
      one: 'M7 7h10v10H7zM10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3',
      many: 'M9 9h10v10H9zM5 15V5h10M12 19v2M16 19v2M19 12h2M19 16h2',
    };
    const icon = (name) => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: ICON[name] }));

    /**
     * Search and Deep research switches for the open conversation. They are stored per Session in
     * the Modes settings (`sessionWeb`, `sessionResearch`); the host applies them at the next turn boundary.
     */
    function ToggleControl({ appCtx, sessionId }) {
      const t = appCtx.locale.bind('modes');
      const [state, setState] = useState({ status: 'loading', view: null, busy: false });
      // Whether Mission's Long run card can be opened (step 61); a hook, so before any early return.
      const missionHere = useMissionLong();
      const refresh = useCallback(async () => {
        try {
          const loaded = await load(appCtx);
          setState((prev) => ({ ...prev, status: 'ready', view: loaded.value }));
        } catch {
          setState((prev) => ({ ...prev, status: prev.view ? 'ready' : 'error' }));
        }
      }, [appCtx]);
      useEffect(() => {
        const watcher = dshPoll.loop(() => refresh(), { every: 30000 });
        const off = dshPoll.onChange(appCtx, () => watcher.poke());
        return () => { watcher.stop(); off(); };
      }, [refresh, sessionId]);

      // The buttons shrink to keep the chat box's bottom row on one line: first the step's name goes,
      // then the buttons' names (icons stay), then the padding. It is measured, not guessed from the
      // window's width, because the row also holds the app's own buttons and the model's name.
      const root = useRef(null);
      const shown = state.status === 'ready' && Boolean(sessionId) && state.view?.sessionWeb !== undefined;
      const marks = shown ? `${state.view.searchDepth}|${state.view.sessionSearchDepth}|${state.view.sessionDepth}|${state.view.sessionLens}|${state.view.sessionWeb}|${state.view.sessionTools}` : '';
      const uniform = state.view?.uniformBox !== false;
      // The Cowork sidebar's place chip reads this (its order and the folder name only with the switch on).
      useEffect(() => { document.documentElement.setAttribute('data-dsh-uniform', String(uniform)); }, [uniform]);
      useLayoutEffect(() => {
        const el = root.current;
        if (!el) return undefined;
        // Our own second-line marks (set by the last fit) make the left group a wrapping row too: take them off
        // first, or a refit (Tools switched, a new Depth) takes the left group for the row and the core
        // buttons end up on a line of their own.
        el.parentElement?.parentElement?.removeAttribute('data-dsh-below');
        el.parentElement?.parentElement?.removeAttribute('data-dsh-wrap');
        // The row that wraps is the nearest ancestor laid out as a wrapping flex row.
        let row = el.parentElement;
        for (let i = 0; i < 6 && row && getComputedStyle(row).flexWrap !== 'wrap'; i += 1) row = row.parentElement;
        if (!row || getComputedStyle(row).flexWrap !== 'wrap') return undefined;
        // The items of the row's first line (through wrappers that only group, `display: contents`).
        const itemsOf = (parent) => [...parent.children].flatMap((child) => {
          const display = getComputedStyle(child).display;
          return display === 'contents' ? itemsOf(child) : display === 'none' ? [] : [child];
        });
        // A button that may shrink (min-width 0) and is squeezed below its own width: the app's
        // access-level button, whose name then runs under the next one. Others overflow only by
        // what is drawn outside them (an open list), which is no sign of a full line.
        const squeezed = (item) => {
          const style = getComputedStyle(item);
          return style.minWidth === '0px' && Number(style.flexShrink) > 0 && item.scrollWidth > item.clientWidth + 1;
        };
        // The first line overflows, or a button on it is squeezed.
        const crowded = (first) => first.scrollWidth > first.clientWidth + 1 || itemsOf(first).some(squeezed);
        const wrapped = () => {
          const first = row.firstElementChild;
          const last = row.lastElementChild;
          if (!first || !last) return false;
          if (first !== last && last.getBoundingClientRect().top > first.getBoundingClientRect().top + 8) return true;
          return crowded(first);
        };
        // Steps: 1 tighter and no step name, 2 "Tools" as an icon, 3 "Deep research" as an icon,
        // 4 "Search" as an icon, 5 tightest.
        const LEVELS = 5;
        const set = (level) => {
          for (let step = 1; step <= LEVELS; step += 1) el.toggleAttribute(`data-f${step}`, step <= level);
          el.dataset.fit = String(level);
        };
        const fitClassic = () => {
          for (let level = 0; level <= LEVELS; level += 1) {
            set(level);
            if (!wrapped()) return;
          }
          // Nothing fits on one line (the app's own buttons take the room): two lines it is, so give
          // the names back as far as the first line holds them.
          for (let level = 0; level <= LEVELS; level += 1) {
            set(level);
            const first = row.firstElementChild;
            if (first && !crowded(first)) return;
          }
        };
        // The same chat box in every mode (Settings → Modes, "Same chat box in every mode"): the step is
        // chosen on the core buttons alone (what other add-ons put beside them is left out of the
        // measuring, and the access button counts at one fixed width), so it follows the window's width
        // and nothing else. The other controls of the seat (the route badge, the Scratch mark, the buttons
        // add-ons bring) then go on a second line when the row is full. Only a window too narrow even for that falls back to the former shrinking.
        const slot = el.parentElement;
        const left = slot?.parentElement;
        // The parts that differ per conversation (model name, Run or Running, the buttons' values) are
        // measured at one fixed width each (CSS data-dsh-measure), so the same box width gives the same
        // step in every mode (the owner's rule, 18 November). The attribute is there only while measuring.
        const fitUniform = () => {
          row.setAttribute('data-dsh-measure', '');
          try {
            measureUniform();
          } finally {
            row.removeAttribute('data-dsh-measure');
          }
        };
        const measureUniform = () => {
          if (!slot || !left || left !== row.firstElementChild) return fitClassic();
          left.removeAttribute('data-dsh-below');
          left.removeAttribute('data-dsh-wrap');
          // Others' controls in the same seat (the route badge, the Scratch mark, the add-ons' buttons).
          const others = [...slot.children].filter((child) => child !== el && !/^(STYLE|SCRIPT)$/.test(child.tagName));
          const kept = others.map((child) => [child, child.style.display]);
          const hideOthers = () => { for (const child of others) child.style.display = 'none'; };
          const showOthers = () => { for (const [child, display] of kept) child.style.display = display; };
          // The first step at which the core buttons share a line with the right-hand group; -1 if none does.
          const firstFit = () => {
            for (let step = 0; step <= LEVELS; step += 1) {
              set(step);
              if (!wrapped()) return step;
            }
            return -1;
          };
          // The app shows the model's name in full or as an icon by its own measuring; the first try
          // measures with the name in full and the access button at one width, so that what is chosen
          // here does not depend on either and holds in every mode.
          const compact = row.hasAttribute('data-model-compact');
          row.setAttribute('data-dsh-pin', '');
          row.removeAttribute('data-model-compact');
          hideOthers();
          let level = firstFit();
          const roomy = level >= 0;
          if (!roomy) {
            // A narrower window: the model's name takes its own width again (the access button keeps its one
            // width unless the app itself turns it into an icon, below 560 px); the same measuring (core
            // buttons alone), and as far as the first line holds the names. The row then wraps as the app
            // does, with the other controls of the seat under the core buttons.
            if (compact) row.setAttribute('data-model-compact', '');
            if (row.getBoundingClientRect().width < 560) row.removeAttribute('data-dsh-pin');
            level = firstFit();
            if (level < 0) {
              for (let step = 0; step <= LEVELS; step += 1) {
                set(step);
                const first = row.firstElementChild;
                if (first && !crowded(first)) { level = step; break; }
              }
            }
            if (level < 0) level = LEVELS;
            set(level);
            showOthers();
            left.setAttribute('data-dsh-wrap', '');
            return;
          }
          set(level);
          showOthers();
          if (!wrapped()) return;
          // Full: the other controls of the seat move to a second line.
          left.setAttribute('data-dsh-below', '');
          // The core buttons must stay on the first line; if not, one more step down, as far as it goes.
          const add = left.firstElementChild;
          const coreUp = () => !add || el.getBoundingClientRect().top <= add.getBoundingClientRect().top + 8;
          for (let step = level; step <= LEVELS; step += 1) {
            set(step);
            if (!wrapped() && coreUp()) return;
          }
          left.removeAttribute('data-dsh-below');
          row.removeAttribute('data-dsh-pin');
          if (compact) row.setAttribute('data-model-compact', '');
          fitClassic();
        };
        // Narrow window (1.0 review H7): the right-hand group is wider than the row and pushed Send off the screen at 375 px.
        // Below 560 px the activity rings go (the Activity line still shows what is running); below 400 px the model button
        // and Long run shrink too. Send never moves.
        const markNarrow = () => {
          const width = row.getBoundingClientRect().width;
          if (width <= 0) return;
          if (width < 560) row.setAttribute('data-dsh-narrow', ''); else row.removeAttribute('data-dsh-narrow');
          if (width < 400) row.setAttribute('data-dsh-tiny', ''); else row.removeAttribute('data-dsh-tiny');
        };
        const fit = () => (uniform ? fitUniform() : (row.removeAttribute('data-dsh-pin'), left?.removeAttribute('data-dsh-below'), left?.removeAttribute('data-dsh-wrap'), fitClassic()));
        const fitAndMark = () => { markNarrow(); fit(); };
        fitAndMark();
        if (typeof ResizeObserver !== 'function') return undefined;
        let frame = 0;
        const observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(fitAndMark);
        });
        observer.observe(row);
        if (row.lastElementChild) observer.observe(row.lastElementChild);
        // The app's own buttons on the left change width when their text does (a mode, a model version).
        for (const child of row.firstElementChild?.children ?? []) if (!child.contains(el)) observer.observe(child);
        return () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          row.removeAttribute('data-dsh-narrow');
          row.removeAttribute('data-dsh-tiny');
        };
      }, [shown, marks, sessionId, uniform]);

      // Older host halves have no switches; show nothing then.
      if (state.status !== 'ready' || !sessionId || !state.view || state.view.sessionWeb === undefined) return null;
      const { current } = describeModes(state.view, sessionId);
      const modeDef = readObject(state.view.modes)[current] ?? readObject(state.view.extraModes)[current] ?? BUILTIN[current] ?? {};
      const tools = modeDef.tools ?? 'all';
      const chosenWeb = readObject(state.view.sessionWeb)[sessionId];
      const web = typeof chosenWeb === 'boolean'
        ? chosenWeb
        : modeDef.isolated === true ? true
        : tools === 'none' ? false : Array.isArray(tools) ? tools.some((tool) => tool === 'web_search' || tool === 'web_fetch') : true;
      const off = readObject(state.view.sessionTools)[sessionId] === false;
      const research = false;
      const searching = !off && web;
      // No tools at all: switched off here, or a mode without tools and neither switch on.
      const none = off || (tools === 'none' && !searching && !research);

      const flip = async (field, value, more) => {
        if (state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          const build = (current) =>
            [[field, value], ...(more ?? [])].map(([name, wanted]) => {
              const next = { ...readObject(current[name]) };
              if (wanted === undefined) delete next[sessionId];
              else next[sessionId] = wanted;
              return { op: 'set', path: [name], value: JSON.stringify(next) };
            });
          let fresh = await load(appCtx, true);
          let result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx, true);
            result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          setState({ status: 'ready', view: result.value.value, busy: false });
        } catch {
          setState((prev) => ({ ...prev, busy: false }));
          void refresh();
        }
      };

      // The sliders' steps are one setting for all conversations, not one per conversation.
      const setDepth = async (field, value) => {
        if (state.busy) return;
        setState((prev) => ({ ...prev, busy: true, view: { ...prev.view, [field]: value } }));
        try {
          const ops = [{ op: 'set', path: [field], value }];
          let fresh = await load(appCtx, true);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx, true);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          setState({ status: 'ready', view: result.value.value, busy: false });
        } catch {
          setState((prev) => ({ ...prev, busy: false }));
          void refresh();
        }
      };
      // Research and Scout always have the web: their Web selector cannot pick Off.
      // A conversation once isolated (Recon) and now in a tab that is not is locked by the host (heldMode): no tools.
      const lockedHere = readObject(state.view.sessionIsolated)[sessionId] === true && modeDef.isolated !== true;
      const researchTab = Array.isArray(tools) && tools.includes('deep_research');
      const sessionDepthNow = depthNow(state.view, sessionId);
      /** A pick of the Web or Depth button (what it writes: settingOps). */
      const pickSetting = async (kind, picked) => {
        if (state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          const build = (current) => settingOps(kind, picked, current, sessionId);
          let fresh = await load(appCtx, true);
          let result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx, true);
            result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          setState({ status: 'ready', view: result.value.value, busy: false });
        } catch {
          setState((prev) => ({ ...prev, busy: false }));
          void refresh();
        }
      };

      return h(React.Fragment, null,
        h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
        h('span', { className: 'dsh-me-tools', ref: root },
          // The Web selector: the same in every tab (Research and Scout cannot pick Off: searching is their work).
          // A Recon conversation moved into another tab is locked by the host with no tools at all: Off, greyed.
          h(WebSources, {
            t, appCtx, view: state.view, sessionId, modeId: current, modeLabel: modeDef.label ?? current,
            recon: modeDef.isolated === true, research: researchTab, webOn: web || researchTab,
            disabled: off || lockedHere, busy: state.busy, onWrite: (picked) => void pickSetting('sources', picked),
          }),
          // Depth: how much work this conversation gets (how much it searches, helpers, planning, checks,
          // reviews; in Research and Scout also the size of a research run). The same in every tab (the
          // owner's rule); only its list texts fit the tab. While all tools are off nothing is sent: with the same
          // chat box in every mode it stays in its place, greyed out (like Web); without, it goes, as before.
          off && !uniform ? null : h(DepthButton, {
            t, depth: sessionDepthNow, kind: depthKind(modeDef), busy: state.busy, disabled: off,
            lens: lensNow(state.view, sessionId), own: ownLensesOf(state.view.ownLenses), webOff: !researchTab && !web,
            onPick: (picked) => void pickSetting('depth', picked),
            onPickLens: (picked) => void pickSetting('lens', picked),
            // The last stop opens Mission's Long run card (Long run part, step 61): every tab but Recon (also a Recon
            // conversation moved elsewhere), and only while Mission is on.
            // Recon too (16 November): Mission keeps its run inside Recon's rules.
            onLongRun: !lockedHere && missionHere ? () => window.dispatchEvent(new CustomEvent('dsh-mission:long', { detail: { sessionId } })) : undefined,
          }),
          h(HelpersButton, {
            t, sessionId, busy: state.busy,
            chosen: readObject(state.view.sessionHelpers)[sessionId],
            usual: state.view.researchModel === 'roles' ? 'roles' : 'same',
            onPick: (id) => void flip('sessionHelpers', id),
            onUsual: (id) => void setDepth('researchModel', id),
          }),
          h(ToolsButton, {
            t, sessionId, none, off, chat: tools === 'none', busy: state.busy,
            // Off: nothing at all. On: back to what the mode allows; in a mode without tools of its own, that is the web.
            onSwitch: (on) => void (on ? flip('sessionTools', undefined, tools === 'none' && !web && !research ? [['sessionWeb', true]] : []) : flip('sessionTools', false)),
          })));
    }

    const DEPTHS = ['quick', 'standard', 'thorough'];
    /** The Lenses, as Modes' lib/lens.js has them (a test keeps the two the same). */
    const LENS_IDS = ['default', 'blunt', 'scientific', 'journalistic', 'data-only', 'skeptic', 'encouraging'];
    /** The Lenses that deal in facts: with Web Off their list shows a one-line hint. */
    const FACT_LENSES = ['blunt', 'scientific', 'journalistic', 'data-only'];
    /** The shipped Lenses' English names: your own may not take one (Modes' lib/lens.js has the same rule). */
    const LENS_NAMES = ['Default', 'Blunt', 'Scientific', 'Journalistic', 'Data only', 'Skeptic', 'Encouraging'];
    const OWN_MAX = 40;
    const OWN_NAME_MAX = 40;
    const OWN_TEXT_MAX = 4000;
    /** @returns {string} the id of your own Lens with this name (as Modes' lib/lens.js makes it). */
    function ownSlug(name) {
      const slug = String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
      return `own-${slug || 'lens'}`;
    }
    /** @returns {string} what is wrong with one of your own Lenses ('' when it can be saved); the same rules as Modes. */
    function ownLensProblem(entry, others = []) {
      const name = String(entry?.name ?? '').trim();
      const text = String(entry?.text ?? '').trim();
      if (!name) return 'needs a name';
      if (name.length > OWN_NAME_MAX) return `has a name longer than ${OWN_NAME_MAX} characters`;
      if (LENS_NAMES.some((shipped) => shipped.toLowerCase() === name.toLowerCase())) return 'has the name of a Lens that comes with Plus';
      if (!text) return 'needs a text';
      if (text.length > OWN_TEXT_MAX) return `has a text longer than ${OWN_TEXT_MAX} characters`;
      if (others.some((other) => ownSlug(other?.name) === ownSlug(name))) return 'has the same name as another of your Lenses';
      return '';
    }
    /** @returns {Array<{id: string, name: string, text: string}>} your own Lenses that can be used (as Modes reads them). */
    function ownLensesOf(value) {
      let list = value;
      if (typeof list === 'string') {
        try {
          list = JSON.parse(list);
        } catch {
          list = [];
        }
      }
      const out = [];
      for (const entry of Array.isArray(list) ? list : []) {
        if (out.length >= OWN_MAX) break;
        if (ownLensProblem(entry, out)) continue;
        const name = String(entry.name).trim();
        out.push({ id: ownSlug(name), name, text: String(entry.text).trim() });
      }
      return out;
    }
    /** @returns {string} a conversation's Lens: its own pick (a shipped one or one of yours), else Default (also once yours was removed). */
    function lensNow(view, sessionId, own = ownLensesOf(view.ownLenses)) {
      const id = readObject(view.sessionLens)[sessionId];
      return LENS_IDS.includes(id) || own.some((entry) => entry.id === id) ? id : 'default';
    }
    const depthOf = (value) => (DEPTHS.includes(value) ? value : 'standard');
    /** @returns {string} the Depth new conversations start with, from the stored `searchDepth` (the former Web Deep is Thorough). */
    function startDepthOf(value) {
      return depthOf(value === 'deep' ? 'thorough' : value);
    }
    /** @returns {string} a conversation's Depth: its own pick, else where new conversations start. */
    function depthNow(view, sessionId) {
      return depthOf(readObject(view.sessionDepth)[sessionId] ?? startDepthOf(view.searchDepth));
    }
    /**
     * @param {object} mode - the conversation's mode.
     * @returns {'isolated' | 'research' | undefined} which list texts the Depth button shows: Recon's
     *   (an isolated tab, searching with its own tools), a research tab's (Research, Scout: a mode that
     *   lists deep_research, where Depth also sizes a research run), or the usual ones.
     */
    function depthKind(mode) {
      if (mode?.isolated === true) return 'isolated';
      return Array.isArray(mode?.tools) && mode.tools.includes('deep_research') ? 'research' : undefined;
    }
    /**
     * The settings a pick writes: the Web selector's ticks for this conversation (or a saved selection, or a
     * tab's starting ticks); the Lens; a Depth for this conversation, which is also where new conversations start.
     */
    function settingOps(kind, picked, current, sessionId) {
      if (kind === 'sources') {
        // Save the ticks as a named selection (shared by every tab).
        if (picked.save) {
          const saved = { ...readObject(current.webMixes), [picked.save]: picked.ticks };
          return [{ op: 'set', path: ['webMixes'], value: JSON.stringify(saved) }];
        }
        // New conversations in this tab start with these ticks (All: the tab's usual start again).
        if (picked.start) {
          const starts = { ...readObject(current.modeStart) };
          const entry = { ...(starts[picked.start] ?? {}) };
          if (!picked.ticks || wsAll(picked.ticks, picked.recon === true)) delete entry.sources;
          else entry.sources = picked.ticks;
          starts[picked.start] = entry;
          return [{ op: 'set', path: ['modeStart'], value: JSON.stringify(starts) }];
        }
        return wsOps(picked, current, sessionId);
      }
      if (kind === 'lens') {
        // For this conversation only; Default stores nothing.
        const lenses = { ...readObject(current.sessionLens) };
        if (picked === 'default') delete lenses[sessionId];
        else lenses[sessionId] = picked;
        return [{ op: 'set', path: ['sessionLens'], value: JSON.stringify(lenses) }];
      }
      const depths = { ...readObject(current.sessionDepth), [sessionId]: picked };
      return [{ op: 'set', path: ['sessionDepth'], value: JSON.stringify(depths) }, { op: 'set', path: ['searchDepth'], value: picked }];
    }
    /** The Web selector's ticks (Modes' lib/sources.js has the same lists; a test keeps them the same). */
    const WS_KINDS = ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives', 'other'];
    const WS_NETS = ['tor', 'usenet', 'i2p'];
    const WS_NETS_READY = ['tor', 'usenet'];
    const WS_SHORT = { verified: 'Verified', academic: 'Academic', news: 'News', sites: 'Sites', forums: 'Forums', social: 'Social', archives: 'Archives', other: 'Other', tor: 'Tor', usenet: 'Usenet', i2p: 'I2P' };
    /** The older levels and Custom mix lanes, read as ticks (as the host reads them). */
    const WS_LEVEL_TICKS = { verified: ['verified'], open: ['verified', 'academic', 'news', 'sites'], everything: ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives'] };
    const WS_LANE_TICKS = { verified: ['verified'], sites: ['sites'], forums: ['forums'], channels: ['social'], archives: ['archives'] };
    /** @returns {string[]} a stored list as ticks, in the popup's order (an older mix's lanes mapped). */
    function wsTicks(list, recon = false) {
      if (!Array.isArray(list)) return [];
      const out = new Set();
      for (const item of list) {
        const name = String(item);
        if (WS_KINDS.includes(name) || (recon && WS_NETS.includes(name))) out.add(name);
        else for (const kind of WS_LANE_TICKS[name] ?? []) out.add(kind);
      }
      return [...WS_KINDS, ...(recon ? WS_NETS : [])].filter((kind) => out.has(kind));
    }
    /** @returns {boolean} whether ticks are All: every kind, and in Recon every network that can be used. */
    function wsAll(ticks, recon = false) {
      return WS_KINDS.every((kind) => ticks.includes(kind)) && (!recon || WS_NETS_READY.every((net) => ticks.includes(net)));
    }
    /** @returns {Record<string, string[]>} the saved selections (an older Custom mix's lanes read as ticks). */
    function wsSelections(text) {
      const out = {};
      for (const [name, list] of Object.entries(readObject(text)).slice(0, 20)) {
        const clean = String(name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
        const ticks = wsTicks(list, true);
        if (clean && ticks.length > 0) out[clean] = ticks;
      }
      return out;
    }
    /**
     * A conversation's ticks as the selector shows them: its own, else an older level it picked (not in Recon
     * or a research tab), else All (every tick).
     * @returns {string[]}
     */
    function wsNow(view, sessionId, { recon = false, research = false } = {}) {
      const every = [...WS_KINDS, ...(recon ? WS_NETS_READY : [])];
      const own = readObject(view.sessionWebSources)[sessionId];
      if (Array.isArray(own)) return wsTicks(own, recon);
      if (recon || research) return every;
      const picked = readObject(view.sessionWebLevel)[sessionId];
      if (typeof picked === 'string' && WS_LEVEL_TICKS[picked]) return [...WS_LEVEL_TICKS[picked]];
      if (typeof picked === 'string' && picked.startsWith('custom:')) {
        const mix = wsSelections(view.webMixes)[picked.slice(7)];
        if (mix) return wsTicks(mix, false);
      }
      return every;
    }
    /** @returns {string} the chip's value: Off, All, one or two short names, "N sources", or a saved selection's name. */
    function wsLabel(webOn, ticks, recon = false, selections = {}) {
      if (!webOn) return 'Off';
      if (wsAll(ticks, recon)) return 'All';
      const same = Object.entries(selections).find(([, list]) => list.length === ticks.length && list.every((kind) => ticks.includes(kind)));
      if (same) return same[0];
      if (ticks.length <= 2) return ticks.map((kind) => WS_SHORT[kind]).join(' + ');
      return `${ticks.length} sources`;
    }
    /**
     * What a pick in the Web selector writes, for this conversation only.
     * @param {{off?: boolean, ticks?: string[], recon?: boolean}} picked - Off; or ticks (every tick, or none: see below).
     * @returns {Array<{op: 'set', path: string[], value: string}>}
     */
    function wsOps(picked, current, sessionId) {
      const webs = { ...readObject(current.sessionWeb) };
      // Off, or nothing left ticked: the web goes off; the ticks are kept for later.
      if (picked.off || (Array.isArray(picked.ticks) && picked.ticks.length === 0)) {
        webs[sessionId] = false;
        return [{ op: 'set', path: ['sessionWeb'], value: JSON.stringify(webs) }];
      }
      webs[sessionId] = true;
      const sources = { ...readObject(current.sessionWebSources) };
      const ticks = wsTicks(picked.ticks, picked.recon === true);
      if (!picked.ticks || wsAll(ticks, picked.recon === true)) delete sources[sessionId];
      else sources[sessionId] = ticks;
      // An older level of this conversation is replaced by the pick (so All does not bring it back).
      const levels = { ...readObject(current.sessionWebLevel) };
      delete levels[sessionId];
      return [
        { op: 'set', path: ['sessionWeb'], value: JSON.stringify(webs) },
        { op: 'set', path: ['sessionWebSources'], value: JSON.stringify(sources) },
        { op: 'set', path: ['sessionWebLevel'], value: JSON.stringify(levels) },
      ];
    }

    /**
     * The Web selector (18 November 2026): the same chip and popup in every tab, Research, Scout and Recon
     * included. Off, All, and combinable source ticks; in Recon also its networks (Tor, Usenet, I2P not set up
     * yet). Saved selections, "save as", "use for new conversations here", and a door to Settings → Web sources.
     * The chip keeps the shared row's markup (span.pair[data-kind="search"], .lbl and .lbl.lvl), whose width
     * the uniform row caps; the full text is in the title.
     */
    function WebSources({ t, appCtx, view, sessionId, modeId, modeLabel, recon, research, webOn, disabled, busy, onWrite }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const [naming, setNaming] = useState(null);
      const [said, setSaid] = useState('');
      const button = useRef(null);
      const panel = useRef(null);
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        // Above the chip, never past the window's top: the list scrolls inside the room there is.
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 352)), bottom: window.innerHeight - rect.top + 8, room: Math.max(220, rect.top - 20) });
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
      const ticks = wsNow(view, sessionId, { recon, research });
      const selections = wsSelections(view.webMixes);
      const usable = Object.fromEntries(Object.entries(selections).filter(([, list]) => recon || list.some((kind) => WS_KINDS.includes(kind))));
      const value = wsLabel(webOn && !disabled, ticks, recon, usable);
      let ownSources = [];
      try {
        ownSources = JSON.parse(typeof view.otherSources === 'string' ? view.otherSources : '[]');
      } catch {
        ownSources = [];
      }
      const otherCount = (Array.isArray(ownSources) ? ownSources : []).filter((one) => one && (!recon || one.recon === true)).length;
      const full = webOn && !disabled ? (wsAll(ticks, recon) ? t('ws.all.hint') : ticks.map((kind) => t(`ws.k.${kind}`)).join(', ')) : t('ws.off.hint');
      const tick = (kind, on) => onWrite({ ticks: on ? [...ticks, kind] : ticks.filter((one) => one !== kind), recon });
      const row = (kind, extra = {}) => h('label', { key: kind, className: 'ws-tick', 'data-ws-kind': kind, 'aria-disabled': String(Boolean(extra.disabled)) },
        h('input', { type: 'checkbox', checked: webOn && ticks.includes(kind) && !extra.disabled, disabled: busy || extra.disabled, onChange: (event) => tick(kind, event.target.checked) }),
        h('span', null, h('b', null, t(`ws.k.${kind}`)), h('small', null, extra.hint ?? t(`ws.h.${kind}`))));
      const openSettings = () => {
        setOpen(false);
        openWebSourcesPage(appCtx);
      };
      return h('span', { className: 'pair', 'data-kind': 'search', 'data-ws': '' },
        h('button', {
          ref: button, type: 'button', 'aria-pressed': webOn && !disabled, 'aria-expanded': open, 'aria-haspopup': 'dialog', disabled: disabled || busy,
          title: disabled ? t('tools.blocked') : `${t('ws.open').replace('{0}', value)} ${full}`, 'aria-label': t('ws.open').replace('{0}', value),
          onClick: () => { setOpen(!open); setSaid(''); setNaming(null); },
        }, icon('search'), h('span', { className: 'lbl' }, t('web.label')), h('span', { className: 'lbl lvl' }, `· ${value}`)),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-me-pop', 'data-ws-pop': '', role: 'dialog', 'aria-label': t('ws.title'), style: { left: place.left, bottom: place.bottom, width: 340, maxHeight: place.room ?? 'calc(100vh - 120px)' } },
                h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS + WS_CSS } }),
                h('div', { className: 'title' }, t('ws.title')),
                h('div', { className: 'seg', role: 'group', 'aria-label': t('ws.title') },
                  h('button', { type: 'button', 'aria-pressed': !webOn, disabled: busy || research, title: research ? t('ws.off.research') : t('ws.off.hint'), onClick: () => onWrite({ off: true }) }, t('ws.off')),
                  h('button', { type: 'button', 'aria-pressed': webOn && wsAll(ticks, recon), disabled: busy, title: t('ws.all.hint'), onClick: () => onWrite({ ticks: undefined, recon }) }, t('ws.all'))),
                research ? h('p', { className: 'hint' }, t('ws.off.research')) : null,
                h('div', { className: 'head' }, t('ws.kinds')),
                h('div', { className: 'ws-list' }, WS_KINDS.map((kind) => row(kind, kind === 'other' && otherCount === 0 ? { hint: t(recon ? 'ws.other.none.recon' : 'ws.other.none') } : {}))),
                recon ? h('div', { className: 'head' }, t('ws.nets')) : null,
                recon ? h('div', { className: 'ws-list' }, WS_NETS.map((kind) => row(kind, kind === 'i2p' ? { disabled: true, hint: t('ws.h.i2p') } : {}))) : null,
                Object.keys(usable).length > 0 ? h('div', { className: 'head' }, t('ws.saved')) : null,
                Object.keys(usable).length > 0 ? h('div', { className: 'chips' }, Object.entries(usable).map(([name, list]) => h('button', {
                  key: name, type: 'button', 'aria-selected': webOn && list.length === ticks.length && list.every((kind) => ticks.includes(kind)), disabled: busy,
                  title: list.map((kind) => t(`ws.k.${kind}`)).join(', '), onClick: () => onWrite({ ticks: list.filter((kind) => recon || WS_KINDS.includes(kind)), recon }),
                }, name))) : null,
                h('div', { className: 'ws-foot' },
                  naming === null
                    ? h('button', { type: 'button', disabled: busy || !webOn, onClick: () => setNaming('') }, t('ws.saveAs'))
                    : h('span', { className: 'ws-name' },
                        h('input', { value: naming, maxLength: 40, placeholder: t('ws.name'), 'aria-label': t('ws.name'), autoFocus: true, onChange: (event) => setNaming(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && naming.trim()) { onWrite({ save: naming.trim().slice(0, 40), ticks }); setNaming(null); setSaid(t('ws.saved.done')); } } }),
                        h('button', { type: 'button', disabled: busy || !naming.trim(), onClick: () => { onWrite({ save: naming.trim().slice(0, 40), ticks }); setNaming(null); setSaid(t('ws.saved.done')); } }, t('ws.save'))),
                  h('button', { type: 'button', disabled: busy || !modeId, onClick: () => { onWrite({ start: modeId, ticks: webOn ? ticks : undefined, recon }); setSaid(t('ws.started').replace('{0}', modeLabel)); } }, t('ws.start').replace('{0}', modeLabel)),
                  h('button', { type: 'button', onClick: openSettings }, t('ws.edit'))),
                said ? h('p', { className: 'hint', role: 'status' }, said) : null,
                h('p', { className: 'hint' }, t(recon ? 'ws.note.recon' : 'ws.note'))),
              document.body,
            )
          : null);
    }
    /** Opens Settings → Web sources (the window's own store; nothing happens where it cannot be reached). */
    function openWebSourcesPage(appCtx) {
      try {
        const store = appCtx.slots.entries('sidebar.settings').find((item) => item.store)?.store?.create?.();
        const actions = store?.actions;
        if (typeof actions?.openSection === 'function') return void actions.openSection('web-sources');
        if (typeof actions?.open === 'function') actions.open();
        if (typeof actions?.select === 'function') actions.select('web-sources');
      } catch {
        /* the Settings window cannot be opened from here: the hints name the page */
      }
    }
    /** The kinds of login of the owner's own sources, and where their secrets are kept (Modes' lib/other.js). */
    const OS_LOGINS = ['none', 'basic', 'header', 'cookie', 'secret-address'];
    const OS_PARTS = { none: [], basic: ['user', 'secret'], header: ['secret'], cookie: ['secret'], 'secret-address': ['secret'] };
    /** @returns {Array<object>} the stored sources, as rows to edit. */
    function osRows(text) {
      let list = [];
      try {
        list = JSON.parse(typeof text === 'string' ? text || '[]' : '[]');
      } catch {
        list = [];
      }
      return (Array.isArray(list) ? list : []).filter((one) => one && typeof one === 'object').map((one) => ({
        id: String(one.id ?? ''), name: String(one.name ?? ''), search: String(one.search ?? ''), start: String(one.start ?? ''),
        login: OS_LOGINS.includes(one.login) ? one.login : 'none', header: String(one.header ?? ''), store: one.store === 'keychain' ? 'keychain' : 'app', recon: one.recon === true,
      }));
    }
    /** @returns {string} what is wrong with a row ('' when it can be saved); the host checks again. */
    function osProblem(row, rows) {
      const name = row.name.trim();
      if (!name) return 'needs a name';
      if (rows.filter((other) => other.name.trim().toLowerCase() === name.toLowerCase()).length > 1) return 'has the same name as another source';
      const address = (text, query) => {
        if (!text.trim()) return '';
        try {
          const url = new URL(text.trim().replace('{query}', 'q'));
          if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'an address must start with https://';
          if (url.username || url.password) return 'a login goes in the login fields, not in the address';
        } catch {
          return 'has an address that cannot be read';
        }
        return query && !text.includes('{query}') ? 'needs {query} in its search address, where the words go' : '';
      };
      if (row.login !== 'secret-address') {
        if (!row.search.trim() && !row.start.trim()) return 'needs a search address or a start address';
        const bad = address(row.search, true) || address(row.start, false);
        if (bad) return bad;
      }
      if (row.login === 'header' && (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(row.header) || ['host', 'cookie', 'connection', 'content-length'].includes(row.header.toLowerCase()))) return 'needs the name of the header its key is sent in (for example X-Api-Key)';
      return '';
    }

    /** One of the owner's own sources, on Settings → Web sources: what it is, its login, and where that is kept. */
    function OtherSourceCard({ t, row, saved, kept, onChange, onRemove, onKeep, onTest, tested, busy }) {
      const [typed, setTyped] = useState({});
      const field = (key, label, props = {}) => h('label', { className: 'dsh-me-field wide' }, h('span', null, label),
        h('input', { className: 'dsh-me-in', value: row[key], spellCheck: false, onChange: (event) => onChange({ ...row, [key]: event.target.value }), ...props }));
      const parts = OS_PARTS[row.login] ?? [];
      return h('section', { className: 'dsh-me-card', 'data-other-source': row.id },
        h('div', { className: 'dsh-me-row' },
          h('label', { className: 'dsh-me-field' }, h('span', null, t('wsp.o.name')), h('input', { className: 'dsh-me-in', value: row.name, maxLength: 40, onChange: (event) => onChange({ ...row, name: event.target.value }) })),
          h('label', { className: 'dsh-me-field' }, h('span', null, t('wsp.o.login')),
            h('select', { className: 'dsh-me-sel', value: row.login, onChange: (event) => onChange({ ...row, login: event.target.value }) }, OS_LOGINS.map((id) => h('option', { key: id, value: id }, t(`wsp.login.${id}`))))),
          h('label', { className: 'dsh-me-field' }, h('span', null, t('wsp.o.store')),
            h('select', { className: 'dsh-me-sel', value: row.store, disabled: row.login === 'none', onChange: (event) => onChange({ ...row, store: event.target.value }) },
              h('option', { value: 'app' }, t('wsp.store.app')), h('option', { value: 'keychain' }, t('wsp.store.keychain'))))),
        row.login === 'secret-address' ? h('div', { className: 'dsh-me-note' }, t('wsp.o.secretAddress')) : field('search', t('wsp.o.search'), { placeholder: 'https://<SITE>/search?q={query}' }),
        row.login === 'secret-address' ? null : field('start', t('wsp.o.start'), { placeholder: 'https://<SITE>/' }),
        row.login === 'header' ? field('header', t('wsp.o.header'), { placeholder: 'X-Api-Key', maxLength: 64 }) : null,
        h('label', { className: 'dsh-me-lt' }, h('input', { type: 'checkbox', checked: row.recon, onChange: (event) => onChange({ ...row, recon: event.target.checked }) }), ` ${t('wsp.o.recon')}`),
        parts.length > 0 ? h('div', { className: 'dsh-me-note' }, saved ? t(row.store === 'keychain' ? 'wsp.o.keptKeychain' : 'wsp.o.keptApp') : t('wsp.o.saveFirst')) : null,
        saved ? parts.map((part) => h('div', { key: part, className: 'dsh-me-row' },
          h('label', { className: 'dsh-me-field' }, h('span', null, t(`wsp.part.${row.login === 'basic' && part === 'user' ? 'user' : row.login}`)),
            h('input', { className: 'dsh-me-in', type: part === 'user' ? 'text' : 'password', autoComplete: 'off', spellCheck: false, value: typed[part] ?? '', placeholder: kept?.[part] ? t('wsp.o.kept') : '', onChange: (event) => setTyped((prev) => ({ ...prev, [part]: event.target.value })) })),
          h('button', { type: 'button', className: 'dsh-me-btn', disabled: busy || !(typed[part] ?? '').trim(), onClick: async () => { if (await onKeep(part, typed[part])) setTyped((prev) => ({ ...prev, [part]: '' })); } }, t('wsp.o.keep')),
          h('span', { className: 'dsh-me-note' }, kept?.[part] ? t('wsp.o.isKept') : t('wsp.o.notKept')))) : null,
        h('div', { className: 'dsh-me-row' },
          saved ? h('button', { type: 'button', className: 'dsh-me-btn', disabled: busy, onClick: onTest }, t('wsp.o.test')) : null,
          h('button', { type: 'button', className: 'dsh-me-btn', disabled: busy, onClick: onRemove }, t('wsp.o.remove'))),
        tested ? h('div', { className: 'dsh-me-note', 'data-bad': String(!tested.ok) }, tested.ok ? t('wsp.o.tested').replace('{0}', String(tested.status)).replace('{1}', `${tested.title ? `${tested.title}: ` : ''}${tested.text}`.slice(0, 300)) : t('wsp.o.failed').replace('{0}', tested.why)) : null);
    }

    /**
     * Settings → Web sources (18 November 2026): the lists the kinds are judged by, the saved selections, each
     * tab's starting ticks, and the owner's own other sources with their logins (kept in the app's secret store
     * or the macOS Keychain, never in the settings). Recon's own networks are on Settings → Recon.
     */
    function WebSourcesPage({ appCtx }) {
      const t = appCtx.locale.bind('modes');
      const [view, setView] = useState(null);
      const [failed, setFailed] = useState('');
      const [lists, setLists] = useState({});
      const [selections, setSelections] = useState([]);
      const [rows, setRows] = useState([]);
      const [kept, setKept] = useState({});
      const [tested, setTested] = useState({});
      const [note, setNote] = useState(null);
      const [busy, setBusy] = useState(false);
      const refresh = useCallback(async () => {
        try {
          const got = await load(appCtx);
          setView(got.value);
          setLists({ verifiedSources: got.value.verifiedSources ?? '', academicSources: got.value.academicSources ?? '', newsSources: got.value.newsSources ?? '' });
          setSelections(Object.entries(wsSelections(got.value.webMixes)).map(([name, ticks]) => ({ name, ticks })));
          setRows(osRows(got.value.otherSources));
          const status = await fetch(new URL('dsh-modes/other', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
          setKept(status?.kept ?? {});
        } catch (error) {
          setFailed(String(error?.message ?? error));
        }
      }, [appCtx]);
      useEffect(() => void refresh(), [refresh]);
      const save = async (key, value, done) => {
        setBusy(true);
        try {
          const ops = [{ op: 'set', path: [key], value }];
          let fresh = await load(appCtx, true);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx, true);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setView(result.value.value);
          setNote({ bad: false, text: done });
          return true;
        } catch (error) {
          setNote({ bad: true, text: `${t('save.failed')}: ${error?.message ?? error}` });
          return false;
        } finally {
          setBusy(false);
        }
      };
      const post = async (body) => {
        const response = await fetch(new URL('dsh-modes/other', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
        setKept(data.kept ?? {});
        return data;
      };
      if (failed) return h('div', { className: 'dsh-me-page' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, failed));
      if (!view) return h('div', { className: 'dsh-me-page' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), h('div', { className: 'dsh-me-note' }, t('wsp.loading')));
      const savedRows = osRows(view.otherSources);
      const problems = rows.map((row) => osProblem(row, rows));
      const rowsDirty = JSON.stringify(rows) !== JSON.stringify(savedRows);
      const listEditor = (key, label) => h('label', { key, className: 'dsh-me-field wide' }, h('span', null, label),
        h('textarea', { className: 'dsh-me-ta', rows: 6, spellCheck: false, value: lists[key] ?? '', onChange: (event) => setLists((prev) => ({ ...prev, [key]: event.target.value })) }),
        h('div', { className: 'dsh-me-row' }, h('button', { type: 'button', className: 'dsh-me-btn', 'data-main': 'true', disabled: busy || (lists[key] ?? '') === (view[key] ?? ''), onClick: () => void save(key, lists[key] ?? '', t('wsp.listSaved')) }, t('wsp.saveList'))));
      const starts = Object.entries(readObject(view.modeStart)).filter(([, entry]) => Array.isArray(entry?.sources));
      const modeName = (id) => readObject(view.modes)[id]?.label ?? readObject(view.extraModes)[id]?.label ?? BUILTIN[id]?.label ?? id;
      return h('div', { className: 'dsh-me-page', 'data-web-sources-page': '' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-me-head' }, h('h2', null, t('ws.title')), h('p', null, t('wsp.head'))),
        note ? h('div', { className: 'dsh-me-note', 'data-bad': String(note.bad), role: 'status' }, note.text) : null,
        h('div', { className: 'dsh-me-group' }, t('wsp.lists')),
        h('div', { className: 'dsh-me-note' }, t('wsp.lists.hint')),
        listEditor('verifiedSources', t('ws.k.verified')),
        listEditor('academicSources', t('ws.k.academic')),
        listEditor('newsSources', t('ws.k.news')),
        h('div', { className: 'dsh-me-group' }, t('ws.saved')),
        h('div', { className: 'dsh-me-note' }, t('wsp.saved.hint')),
        selections.map((row, index) => h('section', { key: index, className: 'dsh-me-card', 'data-web-mix': '' },
          h('div', { className: 'dsh-me-row' },
            h('label', { className: 'dsh-me-field' }, h('span', null, t('ws.name')), h('input', { className: 'dsh-me-in', value: row.name, maxLength: 40, onChange: (event) => setSelections((prev) => prev.map((item, at) => (at === index ? { ...item, name: event.target.value } : item))) })),
            h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => setSelections((prev) => prev.filter((_, at) => at !== index)) }, t('wsp.o.remove'))),
          h('div', { className: 'dsh-me-row' }, [...WS_KINDS, ...WS_NETS.filter((kind) => kind !== 'i2p')].map((kind) => h('label', { key: kind, className: 'dsh-me-lt' },
            h('input', { type: 'checkbox', checked: row.ticks.includes(kind), onChange: (event) => { const on = event.target.checked; setSelections((prev) => prev.map((item, at) => (at === index ? { ...item, ticks: wsTicks(on ? [...item.ticks, kind] : item.ticks.filter((one) => one !== kind), true) } : item))); } }),
            ` ${t(`ws.k.${kind}`)}`))))),
        h('div', { className: 'dsh-me-row' },
          selections.length >= 20 ? null : h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => setSelections((prev) => [...prev, { name: '', ticks: ['verified'] }]) }, t('wsp.add')),
          h('button', { type: 'button', className: 'dsh-me-btn', 'data-main': 'true', disabled: busy, onClick: () => {
            const names = selections.map((row) => row.name.trim());
            if (names.some((name) => !name) || new Set(names.map((name) => name.toLowerCase())).size !== names.length || selections.some((row) => row.ticks.length === 0)) {
              setNote({ bad: true, text: t('wsp.saved.bad') });
              return;
            }
            void save('webMixes', JSON.stringify(Object.fromEntries(selections.map((row) => [row.name.trim().slice(0, 40), row.ticks]))), t('wsp.saved.saved'));
          } }, t('wsp.saveSelections'))),
        h('div', { className: 'dsh-me-group' }, t('wsp.starts')),
        h('div', { className: 'dsh-me-note' }, t('wsp.starts.hint')),
        starts.length === 0 ? h('div', { className: 'dsh-me-note' }, t('wsp.starts.none')) : starts.map(([id, entry]) => h('div', { key: id, className: 'dsh-me-row' },
          h('span', { className: 'dsh-me-note' }, `${modeName(id)}: ${entry.sources.map((kind) => t(`ws.k.${kind}`)).join(', ') || t('ws.off')}`),
          h('button', { type: 'button', className: 'dsh-me-btn', disabled: busy, onClick: () => { const next = { ...readObject(view.modeStart) }; const one = { ...next[id] }; delete one.sources; next[id] = one; void save('modeStart', JSON.stringify(next), t('wsp.starts.cleared')); } }, t('wsp.starts.clear')))),
        h('div', { className: 'dsh-me-group' }, t('wsp.other')),
        h('div', { className: 'dsh-me-note' }, t('wsp.other.hint')),
        rows.map((row, index) => h(OtherSourceCard, {
          key: row.id, t, row, busy, kept: kept[row.id], tested: tested[row.id],
          saved: savedRows.some((one) => one.id === row.id && one.login === row.login && one.store === row.store) && !problems[index],
          onChange: (next) => setRows((prev) => prev.map((item) => (item.id === row.id ? next : item))),
          onRemove: async () => {
            const next = rows.filter((item) => item.id !== row.id);
            setRows(next);
            if (savedRows.some((one) => one.id === row.id)) {
              if (await save('otherSources', JSON.stringify(next.filter((item) => savedRows.some((one) => one.id === item.id)).map((item) => savedRows.find((one) => one.id === item.id))), t('wsp.o.removed'))) {
                await post({ action: 'forget', id: row.id }).catch(() => undefined);
              }
            }
          },
          onKeep: async (part, value) => {
            setBusy(true);
            try {
              await post({ action: 'secret', id: row.id, part, value });
              setNote({ bad: false, text: t('wsp.o.keptNow') });
              return true;
            } catch (error) {
              setNote({ bad: true, text: String(error?.message ?? error) });
              return false;
            } finally {
              setBusy(false);
            }
          },
          onTest: async () => {
            setBusy(true);
            try {
              const data = await post({ action: 'test', id: row.id });
              setTested((prev) => ({ ...prev, [row.id]: data.tested }));
            } catch (error) {
              setTested((prev) => ({ ...prev, [row.id]: { ok: false, why: String(error?.message ?? error) } }));
            } finally {
              setBusy(false);
            }
          },
        })),
        problems.some(Boolean) ? h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, problems.map((problem, index) => (problem ? `${rows[index].name.trim() || t('wsp.o.unnamed')} ${problem}.` : '')).filter(Boolean).join(' ')) : null,
        h('div', { className: 'dsh-me-row' },
          rows.length >= 30 ? null : h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => setRows((prev) => [...prev, { id: Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, 'x').padEnd(8, '0'), name: '', search: '', start: '', login: 'none', header: '', store: 'app', recon: false }]) }, t('wsp.o.add')),
          h('button', { type: 'button', className: 'dsh-me-btn', 'data-main': 'true', disabled: busy || !rowsDirty || problems.some(Boolean), onClick: async () => {
            // A source whose login or store changed loses what was kept for it, so nothing stays behind in the old place.
            const changed = savedRows.filter((one) => rows.some((row) => row.id === one.id && (row.login !== one.login || row.store !== one.store)));
            const clean = rows.map((row) => ({ id: row.id, name: row.name.trim(), search: row.login === 'secret-address' ? '' : row.search.trim(), start: row.login === 'secret-address' ? '' : row.start.trim(), login: row.login, header: row.login === 'header' ? row.header.trim() : '', store: row.login === 'none' ? 'app' : row.store, recon: row.recon }));
            if (await save('otherSources', JSON.stringify(clean), t('wsp.o.saved'))) {
              for (const one of changed) await post({ action: 'forget', id: one.id }).catch(() => undefined);
              void refresh();
            }
          } }, t('wsp.o.save'))),
        h('div', { className: 'dsh-me-note' }, t('wsp.recon')));
    }

    /** The selector's own look, beside the shared popup's. */
    const WS_CSS = `
.dsh-me-pop[data-ws-pop]{overflow:auto}
.dsh-me-pop .ws-list{display:flex;flex-direction:column;gap:1px;margin:2px -6px 0}
.dsh-me-pop .ws-tick{display:flex;align-items:flex-start;gap:8px;padding:5px 8px;border-radius:10px;cursor:pointer}
.dsh-me-pop .ws-tick:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-me-pop .ws-tick[aria-disabled='true']{opacity:.55;cursor:default}
.dsh-me-pop .ws-tick input{margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary)}
.dsh-me-pop .ws-tick b{display:block;font-size:13px;line-height:18px;font-weight:600}
.dsh-me-pop .ws-tick small{display:block;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-me-pop .ws-foot{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.dsh-me-pop .ws-foot button{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-primary)}
.dsh-me-pop .ws-foot button:disabled{opacity:.5;cursor:default}
.dsh-me-pop .ws-name{display:flex;gap:6px}
.dsh-me-pop .ws-name input{width:130px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:transparent;font:inherit;font-size:12px;color:inherit}
`;

    /**
     * The Depth button in the chat box, and its list: Quick, Standard, Thorough. How much care the
     * conversation wants: Standard adds nothing; Quick and Thorough add a short note to the instructions.
     */
    /** @returns {boolean} whether Mission's Long run card is there to open (it says so on window). */
    function useMissionLong() {
      const [here, setHere] = useState(() => window.__dshMissionLong === true);
      useEffect(() => {
        const update = () => setHere(window.__dshMissionLong === true);
        window.addEventListener('dsh-mission:ready', update);
        update();
        return () => window.removeEventListener('dsh-mission:ready', update);
      }, []);
      return here;
    }

    /** How long the pointer rests on an item of the Depth list before its longer text shows (the owner asked for 3+ seconds). */
    const TIP_MS = 3000;

    /**
     * A slow tooltip: the longer text of an item shows after the pointer has rested on it for TIP_MS.
     * The app's own `title` tooltip comes after about a second, too soon for a list kept this short.
     * @returns {{tipFor: (text: string) => object, tip: object | null}} props for an item, and the tip to draw.
     */
    function useSlowTip() {
      const [tip, setTip] = useState(null);
      const timer = useRef(0);
      const clear = () => {
        window.clearTimeout(timer.current);
        setTip(null);
      };
      useEffect(() => () => window.clearTimeout(timer.current), []);
      const tipFor = (text) => text ? {
        // Screen readers get the longer text at once.
        'aria-description': text,
        onPointerEnter: (event) => {
          const target = event.currentTarget;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            if (!target.isConnected) return;
            const rect = target.getBoundingClientRect();
            const width = Math.min(300, window.innerWidth - 24);
            // Beside the list when there is room on the right, otherwise on the left.
            const right = rect.right + 8 + width <= window.innerWidth - 12;
            setTip({ text, top: Math.max(12, Math.min(rect.top, window.innerHeight - 140)), left: right ? rect.right + 8 : Math.max(12, rect.left - 8 - width) });
          }, TIP_MS);
        },
        onPointerLeave: clear,
        onPointerDown: clear,
      } : {};
      const node = tip ? h('div', { className: 'dsh-me-tip', role: 'tooltip', style: { top: tip.top, left: tip.left } }, tip.text) : null;
      return { tipFor, tip: node, clear };
    }

    function DepthButton({ t, depth, kind, lens = 'default', own = [], webOff = false, busy, disabled = false, onPick, onPickLens, onLongRun }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80, maxHeight: 520 });
      const button = useRef(null);
      const panel = useRef(null);
      const { tipFor, tip, clear } = useSlowTip();
      // Placed before the list is drawn, so it never shows for a moment in the corner while the page is busy.
      useLayoutEffect(() => {
        if (!open) {
          clear();
          return undefined;
        }
        const rect = button.current?.getBoundingClientRect();
        // All the room above the button: Depth's three stops and the Lens chips then show without scrolling.
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 284)), bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(200, rect.top - 24) });
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
      const name = t(`depth.${depth}`);
      const mine = own.find((entry) => entry.id === lens);
      const lensName = mine ? mine.name : t(`lens.${lens}`);
      // "Depth · Thorough · Blunt"; with Default it reads as before. The names go first when the row is narrow.
      const open_ = lens === 'default' ? t('depth.open').replace('{0}', name) : t('depth.open.lens').replace('{0}', name).replace('{1}', lensName);
      const suffix = kind ? `.${kind}` : '';
      // Short words in the list; the full explanations are the slow tooltips (step: "less text in the Depth list").
      return h('span', { className: 'pair', 'data-kind': 'depth' },
        h('button', {
          ref: button, type: 'button', 'aria-expanded': open, 'aria-haspopup': 'dialog', disabled: busy || disabled, 'data-depth': depth, 'data-lens': lens,
          title: disabled ? t('tools.blocked') : open_, 'aria-label': open_,
          onClick: () => setOpen(!open),
        }, icon('depth'), h('span', { className: 'lbl' }, t('depth.label')), h('span', { className: 'lbl lvl' }, lens === 'default' ? `· ${name}` : `· ${name} · ${lensName}`)),
        open
          ? ReactDOM.createPortal(
              h(React.Fragment, null,
                h('div', { ref: panel, className: 'dsh-me-pop', 'data-slim': '', role: 'dialog', 'aria-label': t('depth.title'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
                  h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
                  // The note on what Depth is (Recon, Research and Scout have their own) is the title's tooltip.
                  h('div', { className: 'title', ...tipFor(t(kind ? `depth.note.${kind}` : 'depth.note')) }, t('depth.title')),
                  h('div', { className: 'opts', role: 'listbox', 'aria-label': t('depth.title') },
                    DEPTHS.map((id) => h('button', { key: id, type: 'button', role: 'option', 'aria-selected': id === depth, 'aria-current': String(id === depth), disabled: busy, ...tipFor(t(`depth.${id}.hint${suffix}`)), onClick: () => { setOpen(false); onPick(id); } },
                      h('b', null, t(`depth.${id}`)), h('small', null, t(`depth.${id}.short${suffix}`))))),
                  // The last stop: Mission's Long run card, in every tab but Recon (the owner's choice, 16 November).
                  onLongRun ? h('div', { className: 'opts' },
                    h('button', { type: 'button', 'data-long-run': '', ...tipFor(t('depth.long.hint')), onClick: () => { setOpen(false); onLongRun(); } },
                      h('b', null, t('depth.long')), h('small', null, t('depth.long.short')))) : null,
                  // The Lens (step 28): how the answer is worded, for this conversation only.
                  h('div', { className: 'title sep', ...tipFor(`${t('lens.title')}. ${t('lens.note')}`) }, t('lens.short')),
                  // Seven small chips; each one's use is its slow tooltip.
                  h('div', { className: 'chips', role: 'listbox', 'aria-label': t('lens.title') },
                    LENS_IDS.map((id) => h('button', { key: id, type: 'button', role: 'option', 'aria-selected': id === lens, 'aria-current': String(id === lens), disabled: busy, 'data-lens': id, ...tipFor(t(`lens.${id}.hint`)), onClick: () => { setOpen(false); onPickLens?.(id); } },
                      t(`lens.${id}`))),
                    // Your own Lenses (Settings → Modes) come after the shipped ones.
                    own.map((entry) => h('button', { key: entry.id, type: 'button', role: 'option', 'aria-selected': entry.id === lens, 'aria-current': String(entry.id === lens), disabled: busy, 'data-lens': entry.id, 'data-own': '', ...tipFor(t('lens.own.hint')), onClick: () => { setOpen(false); onPickLens?.(entry.id); } },
                      entry.name))),
                  // Owner's rule: a Lens never switches the web on; a fact-heavy one says what Web Off means.
                  webOff && FACT_LENSES.includes(lens) ? h('p', { className: 'hint', 'data-lens-web': '', ...tipFor(t('lens.web.off')) }, t('lens.web.short')) : null),
                tip),
              document.body,
            )
          : null);
    }

    /**
     * The Tools button and its small panel: one switch for all tools of the conversation, and the
     * list of what the model can and cannot call.
     */
    /**
     * The models chip: at a glance, whether this conversation's helper agents run on its own model
     * (one model loaded) or on other models as well, and the switch between the two.
     */
    function HelpersButton({ t, sessionId, busy, chosen, usual, onPick, onUsual }) {
      const [open, setOpen] = useState(false);
      const [view, setView] = useState(null);
      const [place, setPlace] = useState({ left: 12, bottom: 80, maxHeight: 360 });
      const button = useRef(null);
      const panel = useRef(null);
      const policy = chosen === 'same' || chosen === 'roles' ? chosen : usual;
      // The count comes from the server, which knows the models set for the roles.
      useEffect(() => {
        if (!sessionId) return undefined;
        let alive = true;
        const load = () =>
          fetch(new URL('dsh-modes/tools', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-session': sessionId } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => alive && setView(data?.helpers ?? null))
            .catch(() => {});
        load();
        const timer = dshPoll.loop(() => load(), { every: open ? 3000 : 15000, immediate: false });
        return () => { alive = false; timer.stop(); };
      }, [sessionId, open, policy]);
      // Placed before the list is drawn, so it never shows for a moment in the corner while the page is busy.
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(160, rect.top - 24) });
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

      // Until the server has answered, "different models" shows as two.
      const count = policy === 'same' ? 1 : view && view.policy === 'roles' ? view.count : 2;
      const many = policy === 'roles' && count > 1;
      const label = many ? t('helpers.many', { n: count }) : t('helpers.one');
      const others = (view?.sources ?? []).filter((source) => source.model !== view?.own);
      return h(React.Fragment, null,
        h('button', {
          ref: button, type: 'button', 'data-helpers': many ? 'many' : 'one', 'aria-expanded': open,
          title: many ? t('helpers.title.roles', { n: count }) : t('helpers.title.same'), 'aria-label': `${t('helpers.head')}: ${label}`, onClick: () => setOpen(!open),
        }, icon(many ? 'many' : 'one'), h('span', { className: 'lbl' }, label)),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-me-pop', role: 'dialog', 'aria-label': t('helpers.head'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
                h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
                h('div', { className: 'title' }, t('helpers.head')),
                h('div', { className: 'seg', role: 'group', 'aria-label': t('helpers.head') },
                  ['same', 'roles'].map((id) => h('button', { key: id, type: 'button', 'aria-pressed': policy === id, disabled: busy, onClick: () => onPick(id) }, t(`helpers.${id}`)))),
                h('p', { className: 'hint' }, policy === 'same' ? t('helpers.same.hint', { model: view?.own ? ` (${view.own})` : '' }) : t('helpers.roles.hint')),
                policy === 'roles' ? h(React.Fragment, null,
                  h('div', { className: 'head' }, t('helpers.list')),
                  h('div', { className: 'names' },
                    view?.own ? h('span', null, `${view.own} · ${t('helpers.list.own')}`) : null,
                    others.map((source, index) => h('span', { key: index }, `${source.model} · ${t(`helpers.from.${source.from}`, { role: t(`helpers.role.${source.role}`) })}`))),
                  others.length === 0 ? h('p', { className: 'hint' }, t('helpers.list.none')) : null) : null,
                h('p', { className: 'hint' }, `${t('helpers.scope')} ${t('helpers.usual', { name: t(`helpers.${usual}`) })}`),
                usual !== policy ? h('div', { className: 'seg' }, h('button', { type: 'button', disabled: busy, onClick: () => onUsual(policy) }, t('helpers.usual.set'))) : null,
                h('p', { className: 'hint' }, t('helpers.next'))),
              document.body,
            )
          : null);
    }

    function ToolsButton({ t, sessionId, none, off, chat, busy, onSwitch }) {
      const [open, setOpen] = useState(false);
      const [list, setList] = useState(null);
      const [place, setPlace] = useState({ left: 12, bottom: 80, maxHeight: 360 });
      const button = useRef(null);
      const panel = useRef(null);
      // Placed before the list is drawn, so it never shows for a moment in the corner while the page is busy.
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(160, rect.top - 24) });
        let alive = true;
        const load = () =>
          fetch(new URL('dsh-modes/tools', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { 'x-dsh-session': sessionId } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => alive && setList(data))
            .catch(() => {});
        load();
        const timer = dshPoll.loop(() => load(), { every: 3000, immediate: false });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          alive = false;
          timer.stop();
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open, sessionId]);

      const names = (items, no) => (items.length > 0 ? h('div', { className: 'names', 'data-no': String(Boolean(no)) }, items.map((name) => h('span', { key: name }, name))) : h('div', { className: 'hint', style: { margin: 0 } }, t('tools.none')));
      return h(React.Fragment, null,
        h('button', {
          ref: button, type: 'button', 'data-tools': none ? 'off' : 'on', 'aria-expanded': open, title: t('toggle.tools.title'),
          'aria-label': t(none ? 'toggle.tools.off' : 'toggle.tools.on'), onClick: () => setOpen(!open),
        }, icon('tools'), h('span', { className: 'lbl' }, t(none ? 'toggle.tools.off' : 'toggle.tools.on'))),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-me-pop', role: 'dialog', 'aria-label': t('toggle.tools.title'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
                h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
                h('div', { className: 'row' },
                  h('span', null, t('tools.switch')),
                  h('button', { type: 'button', role: 'switch', className: 'sw', 'aria-checked': !none, 'aria-label': t('tools.switch'), disabled: busy, onClick: () => onSwitch(none) })),
                h('p', { className: 'hint' }, t('tools.switch.hint')),
                chat ? h('p', { className: 'hint' }, t('tools.chat')) : null,
                list?.known
                  ? h(React.Fragment, null,
                      list.viaCode ? h('p', { className: 'hint' }, t('tools.viaCode')) : null,
                      h('div', { className: 'head' }, `${t('tools.can')} (${list.can.length})`),
                      names(list.can, false),
                      // Where tools load as needed, those the model can still add are not "cannot".
                      list.trimmed && Array.isArray(list.later) && list.later.length > 0
                        ? h(React.Fragment, null,
                            h('div', { className: 'head' }, `${t('tools.later')} (${list.later.length})`),
                            h('p', { className: 'hint', style: { margin: '0 0 4px' } }, t('tools.later.hint')),
                            names(list.later, false))
                        : null,
                      h('div', { className: 'head' }, `${t('tools.cannot')} (${list.cannot.length})`),
                      names(list.cannot, true),
                      Array.isArray(list.notReady) && list.notReady.length > 0 ? h('p', { className: 'hint' }, t('tools.notReady', { names: list.notReady.join(', ') })) : null)
                  : h('p', { className: 'hint' }, t('tools.unknown')),
                h('p', { className: 'hint' }, t('tools.next'))),
              document.body,
            )
          : null);
    }

    const BUILTIN = {
      chat: {
        label: 'Chat',
        tools: 'none',
        sandbox: 'read-only',
        defaultTier: '',
        prompt:
          'You are in Chat mode: answer directly in one reply. You cannot read or change files or run commands. If a task needs those, say so and suggest switching to Cowork or Code mode.',
      },
      cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
      code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: '', prompt: '' },
    };
    const SANDBOXES = ['inherit', 'read-only', 'workspace-write'];
    const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
    const PROMPT_MAX = 4000;

    /**
     * Strict parse of the stored mode list: null when it is not a JSON object.
     * @param {unknown} value - stored `modes` field.
     * @returns {Record<string, object> | null} object, or null when invalid.
     */
    function parseModes(value) {
      if (typeof value !== 'string' || value.trim() === '') return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    /**
     * Turn the stored list into editable rows. Each row keeps its original object so fields this
     * editor does not know survive a save.
     * @param {Record<string, object>} stored - parsed modes.
     * @returns {object[]} rows.
     */
    function toRows(stored) {
      return Object.entries(stored).map(([id, value]) => {
        const def = value && typeof value === 'object' ? value : {};
        const list = Array.isArray(def.tools) ? def.tools.filter((x) => typeof x === 'string') : null;
        return {
          key: id,
          id,
          label: typeof def.label === 'string' ? def.label : '',
          toolsKind: def.tools === 'none' ? 'none' : list ? 'some' : 'all',
          toolNames: list ? list.join('\n') : '',
          sandbox: SANDBOXES.includes(def.sandbox) ? def.sandbox : 'inherit',
          defaultTier: typeof def.defaultTier === 'string' ? def.defaultTier : '',
          prompt: typeof def.prompt === 'string' ? def.prompt : '',
          extra: def,
        };
      });
    }

    /**
     * Serialize rows back to the JSON string the host reads.
     * @param {object[]} rows - editable rows.
     * @returns {string} JSON object string.
     */
    function fromRows(rows) {
      const out = {};
      for (const row of rows) {
        const names = row.toolNames.split('\n').map((x) => x.trim()).filter(Boolean);
        out[row.id] = {
          ...row.extra,
          label: row.label.trim() || row.id,
          tools: row.toolsKind === 'none' ? 'none' : row.toolsKind === 'some' ? names : 'all',
          sandbox: row.sandbox,
          defaultTier: row.defaultTier.trim(),
          prompt: row.prompt,
        };
      }
      return JSON.stringify(out);
    }

    /**
     * The modes other add-ons add (Finance, Research, Scout...). They are not edited here, but a
     * sidebar tab of theirs can be the default mode, and those with all tools can load them as needed.
     * @param {object} view - settings namespace value.
     * @returns {Array<{id: string, label: string, all: boolean, isolated: boolean}>} the extra modes.
     */
    function extraModesOf(view) {
      return Object.entries(readObject(view?.extraModes)).filter(([id, value]) => ID_RE.test(id) && value && typeof value === 'object').map(([id, value]) => ({
        id,
        label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
        all: value.tools !== 'none' && !Array.isArray(value.tools),
        isolated: value.isolated === true,
      }));
    }

    /**
     * Problems that block a save, as dictionary keys per row id and for the whole form.
     * @param {object[]} rows - editable rows.
     * @param {string} defaultMode - chosen default.
     * @param {string[]} [extraIds] - ids of the modes other add-ons add, which may be the default too.
     * @returns {{rows: Record<string, string>, form: string[]}} problems.
     */
    function validate(rows, defaultMode, extraIds = []) {
      const byRow = {};
      const form = [];
      const seen = new Set();
      for (const row of rows) {
        if (!ID_RE.test(row.id) || seen.has(row.id)) byRow[row.key] = 'e.id';
        else if (row.toolsKind === 'some' && row.toolNames.trim() === '') byRow[row.key] = 'e.tools';
        seen.add(row.id);
      }
      if (rows.length === 0) form.push('e.none');
      else if (!rows.some((row) => row.id === defaultMode) && !extraIds.includes(defaultMode)) form.push('e.default');
      return { rows: byRow, form };
    }

    /**
     * The mode cards without a sidebar tab: the sidebar shows the first `count` modes of the list
     * (and every mode an add-on adds, which has no card here).
     * @param {object[]} rows - the mode cards, in order.
     * @param {number} count - the sidebar's tab count.
     * @returns {Set<string>} the keys of the cards beyond it.
     */
    function withoutTab(rows, count) {
      return new Set(rows.slice(Math.max(0, count)).map((row) => row.key));
    }

    /**
     * The modes a scheduled task may start in: the cards, then the add-ons' modes that are not isolated.
     * @param {object[]} rows - the mode cards.
     * @param {Array<{id: string, label: string, isolated: boolean}>} extras - the add-ons' modes.
     * @returns {Array<{id: string, label: string, extra: boolean}>} the choices.
     */
    function scheduledChoices(rows, extras) {
      return [
        ...rows.map((row) => ({ id: row.id, label: row.label.trim() || row.id, extra: false })),
        // The Automations tab manages automations; its conversations are no place for one to run (step A5).
        ...extras.filter((extra) => !extra.isolated && extra.id !== 'automations').map((extra) => ({ id: extra.id, label: extra.label, extra: true })),
      ];
    }

    /** Tier ids known to the Tier plugin, best effort: built-in ids plus saved custom ones. */
    function tierIdsOf(namespaces) {
      const entry = namespaces.find((item) => item.ns === 'model-tiers');
      const ids = new Set(Object.keys(entry?.value?.tiers ?? {}));
      try {
        const custom = JSON.parse(entry?.value?.customTiers ?? '[]');
        if (Array.isArray(custom)) for (const tier of custom) if (tier && typeof tier.id === 'string') ids.add(tier.id);
      } catch {
        /* ignore */
      }
      return [...ids];
    }

    async function loadEditor(ctx) {
      const result = await dshPoll.settings(ctx, { fresh: true });
      if (!result.ok) throw dshKit.fail(result.error);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw new Error('The Modes settings namespace is not mounted.');
      // The Cowork sidebar's own settings, while it is on: its tab count is set on this page too.
      const shellEntry = result.value.namespaces.find((item) => item.ns === SHELL_NS);
      const shell = shellEntry ? { revision: shellEntry.revision, maxTabs: Number.isInteger(shellEntry.value?.maxTabs) ? shellEntry.value.maxTabs : 3 } : null;
      return { value: entry.value, revision: entry.revision, tiers: tierIdsOf(result.value.namespaces), shell };
    }

    /**
     * Settings → Modes, "Your own Lenses" (Lens part, step 30): add, edit and remove, then Save. The
     * same rules as Modes reads them (ownLensProblem); nothing is saved while one is wrong.
     */
    function OwnLenses({ t, saved, onSave }) {
      const [rows, setRows] = useState(saved);
      const [note, setNote] = useState(null);
      const savedKey = JSON.stringify(saved);
      useEffect(() => setRows(JSON.parse(savedKey)), [savedKey]);
      const set = (index, patch) => {
        setRows((prev) => prev.map((row, at) => (at === index ? { ...row, ...patch } : row)));
        setNote(null);
      };
      const problems = rows.map((row, index) => ownLensProblem(row, rows.slice(0, index)));
      const first = problems.findIndex(Boolean);
      const save = async () => {
        if (first >= 0) {
          setNote({ bad: true, text: t('own.problem').replace('{n}', String(first + 1)).replace('{problem}', problems[first]) });
          return;
        }
        const ok = await onSave(rows.map((row) => ({ id: ownSlug(row.name), name: String(row.name).trim(), text: String(row.text).trim() })));
        setNote(ok ? { bad: false, text: t('own.saved') } : null);
      };
      return h('div', { className: 'dsh-me-own' },
        h('div', { className: 'dsh-me-note' }, t('own.hint')),
        rows.length === 0 ? h('div', { className: 'dsh-me-note' }, t('own.empty')) : null,
        rows.map((row, index) => h('section', { key: index, className: 'dsh-me-card', 'data-own-lens': '' },
          h('div', { className: 'dsh-me-row' },
            h('label', { className: 'dsh-me-field' }, h('span', null, t('own.name')),
              h('input', { className: 'dsh-me-in', value: row.name ?? '', maxLength: OWN_NAME_MAX, 'data-bad': String(Boolean(problems[index])), onChange: (event) => set(index, { name: event.target.value }) })),
            h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => { setRows((prev) => prev.filter((_, at) => at !== index)); setNote(null); } }, t('own.remove'))),
          h('label', { className: 'dsh-me-field wide' }, h('span', null, t('own.text')),
            h('textarea', { className: 'dsh-me-ta', value: row.text ?? '', maxLength: OWN_TEXT_MAX, rows: 3, onChange: (event) => set(index, { text: event.target.value }) })),
          problems[index] ? h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, t('own.problem').replace('{n}', String(index + 1)).replace('{problem}', problems[index])) : null)),
        h('div', { className: 'dsh-me-row' },
          rows.length >= OWN_MAX
            ? h('div', { className: 'dsh-me-note' }, t('own.full'))
            : h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => { setRows((prev) => [...prev, { name: '', text: '' }]); setNote(null); } }, t('own.add')),
          h('button', { type: 'button', className: 'dsh-me-btn', 'data-main': 'true', disabled: JSON.stringify(rows) === savedKey, onClick: () => void save() }, t('own.save'))),
        note ? h('div', { className: 'dsh-me-note', 'data-bad': String(note.bad) }, note.text) : null);
    }

    function ModesPage({ appCtx }) {
      const t = appCtx.locale.bind('modes');
      const [loaded, setLoaded] = useState({ status: 'loading' });
      const [rows, setRows] = useState([]);
      const [defaultMode, setDefaultMode] = useState('');
      const [broken, setBroken] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);
      const [answer, setAnswer] = useState({ rerun: true, thumbs: false, uniform: true });
      const [trim, setTrim] = useState(['cowork', 'code', 'data']);
      const [extraModes, setExtraModes] = useState([]);
      // Settings that save at once: where new conversations start, and the built-in working methods.
      const [general, setGeneral] = useState({ searchDepth: 'standard', scheduledMode: 'cowork', codeMethod: true, coworkMethod: true });
      // The Cowork sidebar's tab count, while the sidebar is on (null: it is off).
      const [shell, setShell] = useState(null);
      const nextKey = React.useRef(1);

      const adopt = useCallback((view) => {
        const stored = parseModes(view.modes);
        const invalid = stored === null;
        const base = invalid || Object.keys(stored).length === 0 ? BUILTIN : stored;
        setRows(toRows(base));
        setBroken(invalid);
        setDefaultMode(typeof view.defaultMode === 'string' ? view.defaultMode : 'cowork');
        setAnswer({ rerun: view.rerunButton !== false, thumbs: view.hideFeedback === true, uniform: view.uniformBox !== false });
        setTrim(Array.isArray(view.trimModes) ? view.trimModes : ['cowork', 'code', 'data']);
        setExtraModes(extraModesOf(view));
        setGeneral({
          // The Depth start (the former Web Deep is Thorough).
          searchDepth: startDepthOf(view.searchDepth),
          scheduledMode: typeof view.scheduledMode === 'string' && view.scheduledMode ? view.scheduledMode : 'cowork',
          codeMethod: view.codeMethod !== false,
          coworkMethod: view.coworkMethod !== false,
          ownLenses: ownLensesOf(view.ownLenses).map(({ name, text }) => ({ name, text })),
          longTools: typeof view.longTools === 'string' ? view.longTools : '{}',
          modeStart: typeof view.modeStart === 'string' ? view.modeStart : '{}',
          verifiedSources: typeof view.verifiedSources === 'string' ? view.verifiedSources : '',
          webMixes: typeof view.webMixes === 'string' ? view.webMixes : '{}',
          skillsOff: typeof view.skillsOff === 'string' ? view.skillsOff : '{}',
        });
        setDirty(false);
      }, []);

      const refresh = useCallback(async () => {
        try {
          const data = await loadEditor(appCtx);
          setLoaded({ status: 'ready', revision: data.revision, tiers: data.tiers });
          setShell(data.shell);
          adopt(data.value);
        } catch {
          setLoaded({ status: 'error' });
        }
      }, [appCtx, adopt]);

      useEffect(() => {
        void refresh();
      }, [refresh]);

      const edit = (key, patch) => {
        const old = rows.find((row) => row.key === key);
        if (patch.id !== undefined && old && old.id === defaultMode) setDefaultMode(patch.id);
        setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
        setDirty(true);
        setMessage(null);
      };
      const add = () => {
        let n = rows.length + 1;
        while (rows.some((row) => row.id === `mode-${n}`)) n += 1;
        setRows((prev) => [
          ...prev,
          { key: `new-${nextKey.current++}`, id: `mode-${n}`, label: '', toolsKind: 'all', toolNames: '', sandbox: 'inherit', defaultTier: '', prompt: '', extra: {} },
        ]);
        setDirty(true);
        setMessage(null);
      };
      const remove = (key) => {
        setRows((prev) => prev.filter((row) => row.key !== key));
        setDirty(true);
        setMessage(null);
      };
      const restoreBuiltin = () => {
        setRows(toRows(BUILTIN));
        setDefaultMode('cowork');
        setDirty(true);
        setMessage(null);
      };

      // As on the server: a mode an add-on adds counts only where no mode of the list has its id.
      const extras = extraModes.filter((extra) => !rows.some((row) => row.id === extra.id));
      const problems = validate(rows, defaultMode, extras.map((extra) => extra.id));
      const blocked = problems.form.length > 0 || Object.keys(problems.rows).length > 0;

      const save = async () => {
        if (busy || blocked) return;
        setBusy(true);
        setMessage(null);
        try {
          const ops = [
            { op: 'set', path: ['modes'], value: fromRows(rows) },
            { op: 'set', path: ['defaultMode'], value: defaultMode },
          ];
          let result = await appCtx.remote.settings.mutate(NS, ops, loaded.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            const fresh = await loadEditor(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          adopt(result.value.value);
          setMessage({ text: t('saved') });
        } catch (error) {
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        } finally {
          setBusy(false);
        }
      };

      // The two switches save at once; they do not wait for the Save button and leave unsaved mode edits alone.
      const flipTrim = async (modeId, on) => {
        const before = trim;
        const next = on ? [...new Set([...trim, modeId])] : trim.filter((id) => id !== modeId);
        setTrim(next);
        try {
          const ops = [{ op: 'set', path: ['trimModes'], value: next }];
          let fresh = await loadEditor(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await loadEditor(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
        } catch (error) {
          setTrim(before);
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        }
      };
      const flipAnswer = async (field, key, on) => {
        setAnswer((prev) => ({ ...prev, [key]: on }));
        try {
          const ops = [{ op: 'set', path: [field], value: on }];
          let fresh = await loadEditor(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await loadEditor(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          void refreshAnswerFlags(appCtx);
        } catch (error) {
          setAnswer((prev) => ({ ...prev, [key]: !on }));
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        }
      };
      // Skills back on in one tab: from the setting as stored now (Tuner Plus may have changed another tab
      // since this page loaded), so only this tab's list goes.
      const switchBackOn = async (tabId) => {
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const fresh = await loadEditor(appCtx);
            let table = {};
            try {
              table = JSON.parse(typeof fresh.value?.skillsOff === 'string' ? fresh.value.skillsOff : '{}') ?? {};
            } catch {
              table = {};
            }
            delete table[tabId];
            const value = JSON.stringify(table);
            const result = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['skillsOff'], value }], fresh.revision);
            if (result.ok) {
              setGeneral((prev) => ({ ...prev, skillsOff: value }));
              setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
              return;
            }
            if (result.error.code !== 'settings/conflict') throw dshKit.fail(result.error);
          }
          throw new Error('the settings changed meanwhile; try again');
        } catch (error) {
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        }
      };
      // One setting of this page saved at once, apart from the mode list and its Save button.
      const saveNow = async (key, value) => {
        const before = general[key];
        setGeneral((prev) => ({ ...prev, [key]: value }));
        try {
          const ops = [{ op: 'set', path: [key], value }];
          let fresh = await loadEditor(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await loadEditor(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          return true;
        } catch (error) {
          setGeneral((prev) => ({ ...prev, [key]: before }));
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
          return false;
        }
      };
      // The sidebar's tab count belongs to the Cowork sidebar's own settings; it is written there.
      const saveTabs = async (count) => {
        const before = shell;
        setShell((prev) => (prev ? { ...prev, maxTabs: count } : prev));
        try {
          const ops = [{ op: 'set', path: ['maxTabs'], value: count }];
          let fresh = await loadEditor(appCtx);
          if (!fresh.shell) throw new Error('the Cowork sidebar is switched off');
          let result = await appCtx.remote.settings.mutate(SHELL_NS, ops, fresh.shell.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await loadEditor(appCtx);
            if (!fresh.shell) throw new Error('the Cowork sidebar is switched off');
            result = await appCtx.remote.settings.mutate(SHELL_NS, ops, fresh.shell.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setShell((prev) => (prev ? { ...prev, revision: result.value.revision, maxTabs: count } : prev));
        } catch (error) {
          setShell(before);
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        }
      };
      const Toggle = (title, hint, on, onChange) =>
        h('div', { className: 'dsh-me-toggle' }, h('div', null, h('b', null, title), h('span', null, hint)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-me-sw', 'aria-checked': on, 'aria-label': title, onClick: () => onChange(!on) }));
      // A row with a drop-down on the right, like a switch row.
      const Choice = (title, hint, value, options, onChange) =>
        h('div', { className: 'dsh-me-toggle' }, h('div', null, h('b', null, title), h('span', null, hint)),
          h('select', { className: 'dsh-me-sel', value, 'aria-label': title, onChange: (event) => onChange(event.target.value) },
            options.map((option, index) => h('option', { key: `${index}-${option.value}`, value: option.value }, option.label))));

      if (loaded.status === 'loading') return h('div', { className: 'dsh-me-note' }, h('style', null, CSS), t('loading'));
      if (loaded.status === 'error') {
        return h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), t('failed'));
      }

      const tierList = h('datalist', { id: 'dsh-me-tiers' }, (loaded.tiers ?? []).map((id) => h('option', { key: id, value: id })));
      const choices = scheduledChoices(rows, extras);
      // Mode cards beyond the sidebar's tab count have no tab (only while the sidebar is on).
      const tabless = shell ? withoutTab(rows, shell.maxTabs) : new Set();
      const Field = (label, control, wide) =>
        h('label', { className: 'dsh-me-field' + (wide ? ' wide' : '') }, h('span', null, label), control);

      return h(
        'div',
        { className: 'dsh-me-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        tierList,
        h('div', { className: 'dsh-me-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        broken ? h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, t('e.broken')) : null,
        Field(
          t('default.label'),
          h(
            'select',
            {
              className: 'dsh-me-sel',
              value: defaultMode,
              onChange: (event) => {
                setDefaultMode(event.target.value);
                setDirty(true);
                setMessage(null);
              },
            },
            rows.map((row) => h('option', { key: row.key, value: row.id }, row.label.trim() || row.id)),
            extras.map((extra) => h('option', { key: `extra-${extra.id}`, value: extra.id }, t('default.extra', { label: extra.label }))),
          ),
        ),
        h('div', { className: 'dsh-me-group' }, t('new.group')),
        h('div', null,
          Choice(t('new.depth'), t('new.depth.hint'), general.searchDepth,
            DEPTHS.map((id) => ({ value: id, label: t(`depth.${id}`) })),
            (value) => void saveNow('searchDepth', value)),
          Choice(t('new.scheduled'), t('new.scheduled.hint'), general.scheduledMode,
            [
              ...choices.map((choice) => ({ value: choice.id, label: choice.extra ? t('default.extra', { label: choice.label }) : choice.label })),
              ...(choices.some((choice) => choice.id === general.scheduledMode) ? [] : [{ value: general.scheduledMode, label: t('new.scheduled.gone', { id: general.scheduledMode }) }]),
            ],
            (value) => void saveNow('scheduledMode', value))),
        // Starting values per mode: what the Web, Depth, Models and Tools buttons read when a conversation begins in it.
        h('div', { className: 'dsh-me-group' }, t('start.group')),
        h('div', { className: 'dsh-me-note' }, t('start.hint')),
        h('div', null,
          [...rows.map((row) => ({ id: row.id, label: row.label.trim() || row.id, isolated: false })), ...extras.map((extra) => ({ id: extra.id, label: extra.label, isolated: extra.isolated }))]
            .filter((tab) => tab.id)
            .map((tab) => {
              let saved = {};
              try {
                saved = JSON.parse(general.modeStart || '{}') ?? {};
              } catch {
                saved = {};
              }
              const own = saved[tab.id] && typeof saved[tab.id] === 'object' ? saved[tab.id] : {};
              const set = (key, value) => {
                const entry = { ...own, [key]: value };
                if (!value) delete entry[key];
                const next = { ...saved };
                if (Object.keys(entry).length === 0) delete next[tab.id];
                else next[tab.id] = entry;
                void saveNow('modeStart', JSON.stringify(next));
              };
              const pick = (key, values, label) => h('label', { className: 'dsh-me-lt', key },
                h('span', null, t(`start.${key}`)),
                h('select', { className: 'dsh-me-sel', value: own[key] ?? '', 'aria-label': `${tab.label}: ${t(`start.${key}`)}`, onChange: (event) => set(key, event.target.value) },
                  h('option', { value: '' }, t('start.usual')),
                  values.map((value) => h('option', { key: value, value }, label(value)))));
              // An isolated mode (Recon) keeps its own web rules: only Off is a start there.
              const webValues = tab.isolated ? ['off'] : ['off', 'on', 'verified', 'open', 'everything'];
              return h('div', { key: `start-${tab.id}`, className: 'dsh-me-toggle', 'data-start': tab.id },
                h('div', null, h('b', null, tab.label), tab.isolated ? h('span', null, t('start.isolated')) : null),
                h('div', { className: 'dsh-me-lts', 'data-wrap': 'true' },
                  pick('web', webValues, (value) => t(`start.web.${value}`)),
                  pick('depth', ['quick', 'standard', 'thorough'], (value) => t(`depth.${value}`)),
                  pick('helpers', ['same', 'roles'], (value) => t(`start.helpers.${value}`)),
                  pick('tools', ['off'], (value) => t(`start.tools.${value}`))));
            })),
        // The tab count is the Cowork sidebar's: shown only while the sidebar is on.
        shell ? h('div', { className: 'dsh-me-group' }, t('tabs.group')) : null,
        shell
          ? h('div', null,
              Choice(t('tabs.count'), t('tabs.count.hint'), String(shell.maxTabs),
                [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
                (value) => void saveTabs(Number(value))))
          : null,
        h('div', { className: 'dsh-me-group' }, t('method.group')),
        h('div', null,
          Toggle(t('method.code'), t('method.code.hint'), general.codeMethod, (on) => void saveNow('codeMethod', on)),
          Toggle(t('method.cowork'), t('method.cowork.hint'), general.coworkMethod, (on) => void saveNow('coworkMethod', on))),
        // Each tab's starting choice of tools for a Long run (the run's card can change it for one run).
        h('div', { className: 'dsh-me-group' }, t('long.group')),
        h('div', { className: 'dsh-me-note' }, t('long.hint')),
        h('div', null,
          [...rows.map((row) => ({ id: row.id, label: row.label.trim() || row.id, isolated: false })), ...extras.map((extra) => ({ id: extra.id, label: extra.label, isolated: extra.isolated }))]
            // Not in an isolated tab (Recon): a Long run cannot start there yet.
            .filter((tab) => tab.id && !tab.isolated)
            .map((tab) => {
              let saved = {};
              try {
                saved = JSON.parse(general.longTools || '{}') ?? {};
              } catch {
                saved = {};
              }
              const own = saved[tab.id] && typeof saved[tab.id] === 'object' ? saved[tab.id] : {};
              const files = typeof own.files === 'boolean' ? own.files : true;
              const web = tab.isolated ? false : typeof own.web === 'boolean' ? own.web : true;
              const flip = (key, on) => {
                const next = { ...saved, [tab.id]: { files, web, [key]: on } };
                void saveNow('longTools', JSON.stringify(next));
              };
              const sw = (label, on, key, disabled) => h('label', { className: 'dsh-me-lt' }, h('span', null, label),
                h('button', { type: 'button', role: 'switch', className: 'dsh-me-sw', disabled, 'aria-checked': on, 'aria-label': `${tab.label}: ${label}`, onClick: () => flip(key, !on) }));
              return h('div', { key: `long-${tab.id}`, className: 'dsh-me-toggle', 'data-long-tools': tab.id },
                h('div', null, h('b', null, tab.label), tab.isolated ? h('span', null, t('long.isolated')) : null),
                h('div', { className: 'dsh-me-lts' }, sw(t('long.files'), files, 'files', false), sw(t('long.web'), web, 'web', tab.isolated)));
            })),
        // Skills switched off per tab (Tuner Plus's step 14): shown only while some are, with a way back here too.
        (() => {
          let off = {};
          try {
            off = JSON.parse(general.skillsOff || '{}') ?? {};
          } catch {
            off = {};
          }
          const tabs = Object.entries(off).filter(([, names]) => Array.isArray(names) && names.length > 0);
          if (tabs.length === 0) return null;
          const labelOf = (id) => rows.find((row) => row.id === id)?.label?.trim() || extras.find((extra) => extra.id === id)?.label || id;
          return h(React.Fragment, null,
            h('div', { className: 'dsh-me-group' }, t('skillsoff.group')),
            h('div', { className: 'dsh-me-note' }, t('skillsoff.hint')),
            h('div', null, tabs.map(([id, names]) => h('div', { key: `skills-off-${id}`, className: 'dsh-me-toggle', 'data-skills-off': id },
              h('div', null, h('b', null, labelOf(id)), h('span', null, names.join(', '))),
              h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => void switchBackOn(id) }, t('skillsoff.on'))))));
        })(),
        // The web levels moved to their own page (18 November 2026): Settings → Web sources.
        h('div', { className: 'dsh-me-group' }, t('ws.title')),
        h('div', { className: 'dsh-me-note' }, t('wsp.moved')),
        h('div', { className: 'dsh-me-row' }, h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => openWebSourcesPage(appCtx) }, t('wsp.open'))),
        h('div', { className: 'dsh-me-group' }, t('own.group')),
        h(OwnLenses, { t, saved: general.ownLenses ?? [], onSave: (list) => saveNow('ownLenses', list) }),
        h('div', { className: 'dsh-me-group' }, t('box.group')),
        h('div', null,
          Toggle(t('box.uniform'), t('box.uniform.hint'), answer.uniform, (on) => void flipAnswer('uniformBox', 'uniform', on))),
        h('div', { className: 'dsh-me-group' }, t('answer.group')),
        h('div', null,
          Toggle(t('answer.rerun'), t('answer.rerun.hint'), answer.rerun, (on) => void flipAnswer('rerunButton', 'rerun', on)),
          Toggle(t('answer.thumbs'), t('answer.thumbs.hint'), answer.thumbs, (on) => void flipAnswer('hideFeedback', 'thumbs', on))),
        h('div', { className: 'dsh-me-group' }, t('trim.group')),
        h('div', { className: 'dsh-me-note' }, t('trim.hint')),
        h('div', null,
          rows.filter((row) => row.toolsKind === 'all').length === 0 && extras.filter((extra) => extra.all && !extra.isolated).length === 0
            ? h('div', { className: 'dsh-me-note' }, t('trim.none'))
            : [
                ...rows.filter((row) => row.toolsKind === 'all').map((row) => h(React.Fragment, { key: `trim-${row.key}` },
                  Toggle(t('trim.mode', { mode: row.label.trim() || row.id }), '', trim.includes(row.id), (on) => void flipTrim(row.id, on)))),
                // An add-on's mode with all tools (Finance) can load them as needed too; an isolated one keeps its own list.
                ...extras.filter((extra) => extra.all && !extra.isolated).map((extra) => h(React.Fragment, { key: `trim-extra-${extra.id}` },
                  Toggle(t('trim.extra', { mode: extra.label }), '', trim.includes(extra.id), (on) => void flipTrim(extra.id, on)))),
              ]),
        rows.map((row) => {
          const bad = problems.rows[row.key];
          return h(
            'section',
            { key: row.key, className: 'dsh-me-card' },
            h(
              'div',
              { className: 'dsh-me-title' },
              h('b', null, row.label.trim() || row.id),
              h('code', null, row.id),
              h('span', { className: 'dsh-me-spacer' }),
              h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => remove(row.key) }, t('remove')),
            ),
            tabless.has(row.key) ? h('div', { className: 'dsh-me-note', 'data-warn': 'true' }, t('tabs.none', { n: shell.maxTabs })) : null,
            h(
              'div',
              { className: 'dsh-me-row' },
              Field(
                t('f.id'),
                h('input', {
                  className: 'dsh-me-in',
                  value: row.id,
                  spellCheck: false,
                  'data-bad': bad === 'e.id' ? 'true' : 'false',
                  onChange: (event) => edit(row.key, { id: event.target.value.trim() }),
                }),
              ),
              Field(
                t('f.label'),
                h('input', { className: 'dsh-me-in', value: row.label, onChange: (event) => edit(row.key, { label: event.target.value }) }),
              ),
            ),
            bad === 'e.id' ? h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, t('e.id')) : null,
            h(
              'div',
              { className: 'dsh-me-field wide' },
              h('span', null, t('f.tools')),
              h(
                'div',
                { className: 'dsh-me-seg', role: 'group', 'aria-label': t('f.tools') },
                ['all', 'none', 'some'].map((kind) =>
                  h(
                    'button',
                    { key: kind, type: 'button', 'aria-pressed': row.toolsKind === kind, onClick: () => edit(row.key, { toolsKind: kind }) },
                    t(`f.tools.${kind}`),
                  ),
                ),
              ),
            ),
            row.toolsKind === 'some'
              ? Field(
                  t('f.toolNames'),
                  h('textarea', { className: 'dsh-me-ta', value: row.toolNames, spellCheck: false, onChange: (event) => edit(row.key, { toolNames: event.target.value }) }),
                  true,
                )
              : null,
            bad === 'e.tools' ? h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, t('e.tools')) : null,
            h(
              'div',
              { className: 'dsh-me-row' },
              Field(
                t('f.sandbox'),
                h(
                  'select',
                  { className: 'dsh-me-sel', value: row.sandbox, onChange: (event) => edit(row.key, { sandbox: event.target.value }) },
                  SANDBOXES.map((value) => h('option', { key: value, value }, t(`f.sandbox.${value}`))),
                ),
              ),
              Field(
                t('f.tier'),
                h('input', {
                  className: 'dsh-me-in',
                  list: 'dsh-me-tiers',
                  value: row.defaultTier,
                  spellCheck: false,
                  onChange: (event) => edit(row.key, { defaultTier: event.target.value }),
                }),
              ),
            ),
            Field(
              t('f.prompt'),
              h('textarea', {
                className: 'dsh-me-ta',
                value: row.prompt,
                placeholder: row.id === 'code' && general.codeMethod ? t('f.prompt.code') : row.id === 'cowork' && general.coworkMethod ? t('f.prompt.cowork') : undefined,
                maxLength: PROMPT_MAX,
                onChange: (event) => edit(row.key, { prompt: event.target.value }),
              }),
              true,
            ),
            h('span', { className: 'dsh-me-count' }, t('f.count').replace('{n}', String(row.prompt.length))),
          );
        }),
        problems.form.map((key) => h('div', { key, className: 'dsh-me-note', 'data-bad': 'true' }, t(key))),
        h(
          'div',
          { className: 'dsh-me-bar' },
          h('button', { type: 'button', className: 'dsh-me-btn', onClick: add }, t('add')),
          h('button', { type: 'button', className: 'dsh-me-btn', onClick: restoreBuiltin }, t('builtin')),
          h('span', { className: 'dsh-me-spacer' }),
          message ? h('span', { className: 'dsh-me-note', 'data-bad': message.bad ? 'true' : 'false', role: 'status' }, message.text) : null,
          dirty && !message ? h('span', { className: 'dsh-me-note' }, t('dirty')) : null,
          h('button', { type: 'button', className: 'dsh-me-btn', disabled: !dirty || busy, onClick: () => void refresh() }, t('discard')),
          h('button', { type: 'button', className: 'dsh-me-btn primary', disabled: !dirty || busy || blocked, onClick: () => void save() }, t('save')),
        ),
      );
    }

    // ---- sidebar guard (1.0 review H2) ----
    /**
     * Exactly one of the app's own sidebar and the Cowork sidebar may be on. Switching the Cowork row off by itself left the app's
     * sidebar off too (no sidebar at all); switching it on again with the app's sidebar on made two. Which one to switch, or null.
     */
    const sidebarFix = (stockOn, coworkOn) => (stockOn === coworkOn ? (coworkOn ? 'stock-off' : 'stock-on') : null);
    const STOCK_SIDEBAR = '@deepseek-ai/dsh-client-ui-sidebar';
    const COWORK_SIDEBAR = '@local/dsh-cowork-shell';
    /** Watches the two rows every few seconds and puts them right after the same wrong state is seen twice in a row (a switch in progress is not a wrong state). */
    function watchSidebars(manager, log) {
      let wrongTimes = 0;
      let busy = false;
      const look = async () => {
        if (busy || (typeof document !== 'undefined' && document.hidden)) return;
        busy = true;
        try {
          const listed = await manager.listPlugins();
          const rows = Array.isArray(listed) ? listed : listed?.ok === true && Array.isArray(listed.value) ? listed.value : null;
          const stock = rows?.find((row) => row?.moduleName === STOCK_SIDEBAR);
          const cowork = rows?.find((row) => row?.moduleName === COWORK_SIDEBAR);
          // Without the Cowork sidebar installed there is nothing to keep in step.
          const fix = stock && cowork ? sidebarFix(stock.enabled === true, cowork.enabled === true) : null;
          wrongTimes = fix ? wrongTimes + 1 : 0;
          if (fix && wrongTimes >= 2) {
            wrongTimes = 0;
            await manager.setPluginEnabled(stock.entryId, fix === 'stock-on');
            log?.(fix === 'stock-on' ? 'The app\'s own sidebar was switched on again: the Cowork sidebar is off.' : 'The app\'s own sidebar was switched off: the Cowork sidebar is on.');
          }
        } catch { /* the plugin manager is busy or not there: the next look tries again */ } finally { busy = false; }
      };
      // Every five seconds while the window is shown; the loop stops by itself while it is hidden.
      const watcher = dshPoll.loop(() => look(), { every: 5000 });
      return () => watcher.stop();
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('modes', DICT));
        // The sidebar guard: the owner is never left without a sidebar (or with two).
        ctx.inject(['remote.pluginManager'], (inner) => {
          inner.effect(() => watchSidebars(inner.remote.pluginManager, (line) => { try { inner.logger?.info?.(line); } catch { /* no logger in the browser */ } }), 'modes: sidebar guard');
        });
        const t = ctx.locale.bind('modes');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'modes', order: 100, label: () => t('section.title') },
              (props) => h(ModesPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
        // Settings → Web sources (18 November 2026): the one Web selector's lists, saved selections and other sources.
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'web-sources', order: 101, label: () => t('ws.title') },
              (props) => h(WebSourcesPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
        ctx.effect(() =>
          ctx.slots.inject('conversation.input.left', () =>
            ctx.slots.register(
              { name: 'conversation.input.left', id: 'mode-toggles', order: -21, label: () => t('toggle.search') },
              (props) => h(ToggleControl, { ...props, appCtx: ctx }),
            ),
          ),
        );
        ctx.effect(() =>
          ctx.slots.inject('conversation.input.left', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.left',
                id: 'mode-select',
                order: -22,
                label: () => t('composer.mode'),
              },
              (props) => h(ModeControl, { ...props, appCtx: ctx }),
            ),
          ),
        );
        // After the app's own feedback pair (order 10), before Branch.
        ctx.effect(() =>
          ctx.slots.inject('conversation.chat.assistant-actions', () =>
            ctx.slots.register(
              { name: 'conversation.chat.assistant-actions', id: 'modes-rerun', order: 20, inject: (sessionId) => ({ sessionId }) },
              (props) => h(RerunAction, { ...props, appCtx: ctx }),
            ),
          ),
        );
        void refreshAnswerFlags(ctx);
      },
    };
  },
});
