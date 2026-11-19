/**
 * Mission, browser half: the Settings > Mission page, the run card above the chat box and the Long run
 * setup card. The Settings page has the switch, the mode that
 * `/mission on` uses, the models for the three roles of a run (for every project, and per
 * project), and a run's limits. Everything else happens through the `/mission` command.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-mission',
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
    const PlainNote = dshKit.makeNote(React);
    const { ask: askInPage } = dshKit;

    const NS = 'mission';
    const DICT = { en: { 'section.title': 'Mission' }, zh: { 'section.title': '任务' } };
    const MODES = [
      { id: 'restricted', label: 'Restricted', text: 'Nothing outside the conversation\'s folder is read or changed, and you are never asked for it. Inside, the assistant creates new files freely and asks you once per existing file before changing it.' },
      { id: 'ask', label: 'Ask-Auto', text: 'The same inside the folder. When it needs to read or change something outside, it has to ask you first.' },
      { id: 'auto', label: 'Full Auto', text: 'Inside the folder it works without asking. For anything outside the folder it must still ask you.' },
    ];

    const ROLES = [
      { id: 'plan', label: 'Planner', text: 'Reads the project and writes the checklist. Also takes over an item that two tries did not finish.' },
      { id: 'implement', label: 'Workers', text: 'Do the checklist items, one at a time.' },
      { id: 'review', label: 'Reviewer', text: 'Reads the changes against the goal at the end.' },
    ];
    const LIMITS = [
      { id: 'maxItems', label: 'Checklist items', text: 'Most items a plan may have.', fallback: 12, min: 1, max: 30 },
      { id: 'maxTries', label: 'Tries per item', text: 'The last try goes to the planner\'s model.', fallback: 3, min: 1, max: 8 },
      { id: 'maxReviews', label: 'Review passes', text: '0 leaves the review out.', fallback: 2, min: 0, max: 5 },
      { id: 'maxSteps', label: 'Steps in all', text: 'A run stops and reports when it gets here.', fallback: 60, min: 5, max: 300 },
      { id: 'waitMinutes', label: 'Minutes to wait for your yes', text: 'After this an item that needs your approval is set aside and the run carries on. 0 waits without end.', fallback: 3, min: 0, max: 60 },
    ];
    const LONG_FIELDS = [
      { id: 'longMinutes', kind: 'number', label: 'Time', text: 'Minutes a long run may take. It stops between steps, so it can go over by the step under way.', fallback: 120, min: 10, max: 720 },
      { id: 'longLaps', kind: 'number', label: 'Laps', text: 'Most laps. A lap is work on the open items, the overall commands and a review.', fallback: 10, min: 1, max: 50 },
      { id: 'longFullTime', kind: 'switch', label: 'Use the full time', text: 'Off: a run whose list is done stops after two laps in a row find nothing more to do. On: it keeps looking until the time or the laps are up.', fallback: false },
      { id: 'longKeepAwake', kind: 'switch', label: 'Keep the Mac awake', text: 'While a long run is on and the Mac is on power. The screen may still turn off; closing a laptop\'s lid still puts it to sleep.', fallback: true },
      { id: 'longBattery', kind: 'switch', label: 'Also on battery', text: 'Keep it awake on battery too. That drains the battery.', fallback: false },
      { id: 'longRetry', kind: 'switch', label: 'Try again by itself', text: 'When your model server does not answer and the app stops giving the run rounds, try again up to three times, 2, 5 and 10 minutes later. Never after you paused it, and never after the app restarted: then it waits for you.', fallback: true },
      { id: 'longEffort', kind: 'switch', label: 'Think by role', text: 'Planner and reviewer think hard (High), workers less (Medium). Same model, so nothing more is loaded. Off: every helper uses the tier\'s effort.', fallback: true },
    ];
    const parse = (value) => {
      try {
        const read = typeof value === 'string' ? JSON.parse(value || '{}') : value;
        return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
      } catch {
        return {};
      }
    };
    /** Only whole choices are kept, so an emptied row leaves nothing behind. */
    const tidyRoles = (roles) => Object.fromEntries(ROLES.map((role) => [role.id, roles?.[role.id]]).filter(([, pick]) => pick && pick.provider && pick.model));

    const CSS = `
.dsh-ms-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ms-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ms-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ms-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ms-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-rowtext { flex: 1; min-width: 0; }
.dsh-ms-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ms-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ms-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ms-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-ms-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ms-radio { flex: none; width: 18px; height: 18px; margin-top: 2px; padding: 0; border-radius: 50%; cursor: pointer; background: transparent; border: 1.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-ms-radio[aria-checked="true"] { border: 5px solid var(--dsw-alias-brand-primary); }
.dsh-ms-radio:focus-visible, .dsh-ms-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-field {
  flex: none; box-sizing: border-box; height: 32px; max-width: 260px; padding: 0 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
input.dsh-ms-field { width: 76px; cursor: text; text-align: right; }
.dsh-ms-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ms-row[data-center="true"] { align-items: center; }
.dsh-ms-card { margin-top: 12px; padding: 4px 14px 2px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-card .dsh-ms-row:last-child { border-bottom: 0; }
.dsh-ms-cardhead { display: flex; align-items: center; gap: 12px; padding: 10px 0 2px; }
.dsh-ms-cardhead b { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.dsh-ms-cardhead span { display: block; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 9px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-ms-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ms-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-list code { font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); }
.dsh-ms-run { box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px)); max-width: var(--dsh-composer-card-max-width, 100%); margin: 0 auto 8px; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); }
/* As wide as the chat box, also with Cowork's wide chat (which lets the box use the window less 32px). */
html[data-cws-wide] .dsh-ms-run { max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 32px); }
.dsh-ms-run-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-ms-run-head b { font-weight: 600; }
.dsh-ms-run-meta { color: var(--dsw-alias-label-secondary); }
.dsh-ms-run-actions { margin-left: auto; display: flex; gap: 6px; }
.dsh-ms-run-list { margin: 6px 0 0; padding: 0; list-style: none; max-height: 96px; overflow: auto; }
.dsh-ms-run-list li { display: flex; gap: 6px; }
.dsh-ms-run-mark { flex: none; min-width: 74px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-run-mark[data-ok="true"] { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary)); }
.dsh-ms-run-note { margin-top: 6px; color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.dsh-ms-run-report { margin-top: 6px; white-space: pre-wrap; max-height: 220px; overflow: auto; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-ms-modal-back { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.dsh-ms-modal { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; padding: 18px 20px; border-radius: 16px; background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.dsh-ms-modal textarea { box-sizing: border-box; width: 100%; min-height: 72px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: inherit; font: inherit; font-size: 13px; resize: vertical; }
.dsh-ms-ticks { margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; line-height: 18px; }
.dsh-ms-ticks li { display: flex; gap: 6px; }
.dsh-ms-ticks span[data-ok="false"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ms-ticks span[data-ok="null"] { color: var(--dsw-alias-label-secondary); }
.dsh-ms-ticks span[data-ok="warn"] { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }
.dsh-ms-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
html[data-dsh-long-run] [data-goal-bar] { display: none !important; }
.dsh-ms-runbtn-wrap { position: relative; display: inline-flex; }
.dsh-ms-runbtn {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 14px; cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
}
.dsh-ms-runbtn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ms-runbtn:disabled { cursor: default; opacity: .55; }
.dsh-ms-runbtn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-runbtn svg { flex: none; }
.dsh-ms-runtip {
  position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 50; width: max-content; max-width: 260px; padding: 6px 9px; border-radius: 9px;
  font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l2);
  box-shadow: 0 4px 14px rgba(0,0,0,.18);
}
`;

    /** The tabs where the owner switched the work loop on. */
    function loopTabsOf(text) {
      try {
        const value = JSON.parse(String(text ?? '') || '[]');
        return Array.isArray(value) ? value.map(String) : [];
      } catch {
        return [];
      }
    }

    async function read(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('The Mission add-on is not running.');
      return view;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    /** Pick a model from the app's own list; the first entry stands for "not chosen here". */
    function ModelSelect({ catalog, pick, none, label, disabled, onPick }) {
      const groups = catalog?.groups ?? [];
      const value = pick?.provider && pick?.model ? `${pick.provider}\u0000${pick.model}` : '';
      const known = groups.some((group) => group.id === pick?.provider && group.models.some((item) => item.id === pick?.model));
      return h('select', {
        className: 'dsh-ms-field', value, 'aria-label': label, disabled,
        onChange: (event) => {
          const [provider, model] = event.target.value.split('\u0000');
          onPick(provider && model ? { provider, model } : undefined);
        },
      },
      h('option', { value: '' }, none),
      value && !known ? h('option', { value }, `${pick.model} (not available now)`) : null,
      groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, item.name)))));
    }

    /** A number that is saved when the field is left, kept inside its range. */
    function NumberField({ value, min, max, label, disabled, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      const [seen, setSeen] = useState(value);
      if (value !== seen) {
        setSeen(value);
        setDraft(String(value));
      }
      const commit = () => {
        const number = Math.round(Number(draft));
        if (!Number.isFinite(number)) { setDraft(String(value)); return; }
        const next = Math.min(max, Math.max(min, number));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', { className: 'dsh-ms-field', type: 'number', inputMode: 'numeric', min, max, value: draft, 'aria-label': label, disabled, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); } });
    }

    function MissionPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [catalog, setCatalog] = useState(null);
      const [folders, setFolders] = useState([]);
      // A project that was added but has no model picked yet; it is not saved until it has one.
      const [drafts, setDrafts] = useState([]);
      // The tabs the app has (from the Modes settings), for the work loop's switches.
      const [tabs, setTabs] = useState([]);
      // Where Benchmark's scorecard showed the loop pays, as you accepted it there (plan step S7).
      const [pays, setPays] = useState({});
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const view = await read(appCtx);
          if (alive.current) { setData(view.value ?? {}); setError(''); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, [appCtx]);
      useEffect(() => {
        alive.current = true;
        void load();
        // The models and the projects the app knows, for the pickers.
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (alive.current && result?.ok) setCatalog(result.value);
          } catch {
            /* the pickers then show only what is already chosen */
          }
          try {
            const described = await appCtx.remote.settings.describe();
            const modes = described.ok ? described.value.namespaces.find((entry) => entry.ns === 'modes')?.value : undefined;
            const table = (text) => { try { const value = JSON.parse(String(text ?? '') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
            const found = { chat: 'Chat', cowork: 'Cowork', code: 'Code' };
            // Research is left out: there only Ultra Code puts the loop on (its Long runs).
            for (const [id, mode] of Object.entries({ ...table(modes?.modes), ...table(modes?.extraModes) })) if (/^[a-z0-9-]{1,40}$/.test(id) && !mode?.isolated && id !== 'research') found[id] = String(mode?.label ?? id).slice(0, 40);
            if (alive.current) setTabs(Object.entries(found).map(([id, label]) => ({ id, label })));
            const bench = described.ok ? described.value.namespaces.find((entry) => entry.ns === 'benchmark')?.value : undefined;
            if (alive.current) setPays(table(bench?.acceptedMethods));
          } catch {
            /* no list: the switches already saved still show */
          }
          try {
            const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items;
            if (alive.current && Array.isArray(items)) setFolders(items.filter((item) => typeof item?.path === 'string' && item.path).map((item) => ({ path: item.path, title: String(item.title || item.path.split('/').pop()) })));
          } catch {
            /* no list: projects already saved still show */
          }
        })();
        return () => { alive.current = false; };
      }, [load, appCtx]);
      const save = useCallback(async (values, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((before) => ({ ...before, ...values }));
          setNote({ text: done, error: false });
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [appCtx]);

      const roles = parse(data?.roles);
      const projects = parse(data?.projects);
      const shownProjects = [...new Set([...Object.keys(projects), ...drafts])];
      const titleOf = (folder) => folders.find((item) => item.path === folder)?.title ?? folder.split('/').pop();
      const setRole = (role, pick) => void save({ roles: JSON.stringify(tidyRoles({ ...roles, [role]: pick })) }, 'Saved. It applies from the next run.');
      const setProjectRole = (folder, role, pick) => {
        const own = tidyRoles({ ...projects[folder], [role]: pick });
        const next = { ...projects };
        if (Object.keys(own).length > 0) next[folder] = own;
        else delete next[folder];
        // An emptied project stays on the page until it is removed, so the pickers do not vanish under the cursor.
        if (Object.keys(own).length === 0 && !drafts.includes(folder)) setDrafts((list) => [...list, folder]);
        void save({ projects: JSON.stringify(next) }, 'Saved. It applies from the next run in that project.');
      };
      const removeProject = (folder) => {
        setDrafts((list) => list.filter((item) => item !== folder));
        if (!projects[folder]) return;
        const { [folder]: _gone, ...rest } = projects;
        void save({ projects: JSON.stringify(rest) }, 'Removed. That project follows the choices above again.');
      };
      const free = folders.filter((item) => !shownProjects.includes(item.path));

      const loaded = Boolean(data);
      const enabled = loaded && data.enabled !== false;
      const chosen = loaded && MODES.some((mode) => mode.id === data.defaultMode) ? data.defaultMode : 'restricted';

      return h('div', { className: 'dsh-ms-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ms-title' }, 'Mission'),
        h('p', { className: 'dsh-ms-desc' }, 'Keeps the assistant inside a conversation\'s folder, in one of three permission modes, and takes checkpoints of the folder that you can go back to. You switch it on per conversation by typing /mission in the chat box.'),
        !loaded ? (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dsh-ms-desc', 'data-error': 'false' }, 'Loading…')) : null,
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        loaded ? h('div', { className: 'dsh-ms-row' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, 'Mission'),
            h('div', { className: 'dsh-ms-rowdesc' }, 'Off takes the /mission command away and lifts every mode that is on. Checkpoints already taken stay in their folders.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': enabled, 'aria-label': 'Mission', disabled: busy, onClick: () => void save({ enabled: !enabled }, enabled ? 'Switched off.' : 'Switched on.') })) : null,

        h('div', { className: 'dsh-ms-group' }, 'The mode /mission on uses'),
        MODES.map((mode) => h('div', { key: mode.id, className: 'dsh-ms-row' },
          h('button', { type: 'button', role: 'radio', className: 'dsh-ms-radio', 'aria-checked': chosen === mode.id, 'aria-label': mode.label, disabled: busy || !loaded, onClick: () => void save({ defaultMode: mode.id }, `/mission on now switches on ${mode.label}.`) }),
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, mode.label),
            h('div', { className: 'dsh-ms-rowdesc' }, mode.text)))),

        h('div', { className: 'dsh-ms-group' }, 'Models for a run'),
        h('p', { className: 'dsh-ms-desc' }, 'A run (/mission followed by a goal) uses three roles. By default all three run on the conversation\'s own model, so only one model has to be loaded. The choices below apply only in a conversation whose models chip (in the chat box) is set to "Different models". Then: pick a model for a role here, or leave it to Model Tiers, which uses the plan, implement or review model of the conversation\'s tier.'),
        ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, role.label),
            h('div', { className: 'dsh-ms-rowdesc' }, role.text)),
          h(ModelSelect, { catalog, pick: roles[role.id], none: 'Follow Model Tiers', label: `Model for the ${role.label.toLowerCase()}`, disabled: busy || !loaded, onPick: (pick) => setRole(role.id, pick) }))),

        h('div', { className: 'dsh-ms-group' }, 'Per project'),
        h('p', { className: 'dsh-ms-desc' }, 'A project can have its own models. What is picked here wins over the choices above, for runs in that project\'s folder only.'),
        shownProjects.map((folder) => h('div', { key: folder, className: 'dsh-ms-card' },
          h('div', { className: 'dsh-ms-cardhead' },
            h('b', null, titleOf(folder), h('span', null, folder)),
            h('button', { type: 'button', className: 'dsh-ms-btn', disabled: busy, onClick: () => removeProject(folder) }, 'Remove')),
          ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
            h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, role.label)),
            h(ModelSelect, { catalog, pick: projects[folder]?.[role.id], none: 'As above', label: `${role.label} for ${titleOf(folder)}`, disabled: busy, onPick: (pick) => setProjectRole(folder, role.id, pick) }))))),
        loaded ? h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowdesc' }, free.length > 0 ? 'Add a project to give it models of its own.' : folders.length === 0 ? 'The app lists no project folders yet. Open a conversation in a folder first.' : 'Every project the app knows is listed above.')),
          free.length > 0 ? h('select', { className: 'dsh-ms-field', value: '', 'aria-label': 'Add a project', disabled: busy, onChange: (event) => { const folder = event.target.value; if (folder) setDrafts((list) => [...list, folder]); } },
            h('option', { value: '' }, 'Add a project…'),
            free.map((item) => h('option', { key: item.path, value: item.path }, item.title))) : null) : null,

        h('div', { className: 'dsh-ms-group' }, 'How far a run may go'),
        LIMITS.map((limit) => h('div', { key: limit.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, limit.label),
            h('div', { className: 'dsh-ms-rowdesc' }, limit.text)),
          h(NumberField, { value: Number.isFinite(Number(data?.[limit.id])) ? Number(data[limit.id]) : limit.fallback, min: limit.min, max: limit.max, label: limit.label, disabled: busy || !loaded, onCommit: (number) => void save({ [limit.id]: number }, 'Saved. It applies from the next run.') }))),

        h('div', { className: 'dsh-ms-group' }, 'Long runs'),
        h('p', { className: 'dsh-ms-desc' }, 'A long run is a Mission run with a clock: it works in laps (work, the overall commands, a review), keeps going after the list is done to look for weak spots, and undoes a lap that breaks a command that passed before. Start one from the Depth list in the chat box (Code and Cowork). /mission runs are not changed by these settings.'),
        LONG_FIELDS.map((field) => h('div', { key: field.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, field.label),
            h('div', { className: 'dsh-ms-rowdesc' }, field.text)),
          field.kind === 'number'
            ? h(NumberField, { value: Number.isFinite(Number(data?.[field.id])) ? Number(data[field.id]) : field.fallback, min: field.min, max: field.max, label: field.label, disabled: busy || !loaded, onCommit: (number) => void save({ [field.id]: number }, 'Saved. It applies to the next long run.') })
            : h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': loaded ? (data[field.id] ?? field.fallback) === true : field.fallback, 'aria-label': field.label, disabled: busy || !loaded, onClick: () => void save({ [field.id]: !((data[field.id] ?? field.fallback) === true) }, 'Saved. It applies to the next long run.') }))),

        h('div', { className: 'dsh-ms-group' }, 'Work loop (Ultra Code)'),
        h('p', { className: 'dsh-ms-desc' }, 'Off unless switched on. It is on for a run when Ultra Code is switched on in the conversation\'s model panel (beside Effort), or for every run in a tab you switch on here. With it on, a run follows a recipe for its kind of task (plain files in the app\'s data folder, mission/recipes, which you can edit; five starters are written once), each step ends in a fixed shape, a separate checker checks it (sources really opened for research, a fixed shape for an extraction, separate tries that agree for a question with one answer, a reader for writing; commands for code and data, as always), a step that fails twice goes to the strongest model of the tier\'s team (Settings → Model Tiers), and with Ultra Code several attempts at text work run side by side and a judge picks. Only one helper ever changes files. Slower, and more tokens. Recon runs keep their own model and get only the checks the app runs itself.'),
        Object.keys(pays).length > 0
          ? h('p', { className: 'dsh-ms-desc' }, `Benchmark found that the loop pays for: ${Object.entries(pays).map(([kind, way]) => `${kind} (${String(way).replace(/^small-loop-/, '').replace(/-/g, ' ')})`).join(', ')}. You accepted this on Settings → Benchmark; switch the loop on below for the tabs where you do that kind of work.`)
          : h('p', { className: 'dsh-ms-desc' }, 'Settings → Benchmark → Compare ways of working runs your own tasks three ways and says where the loop pays. Nothing is switched on by itself.'),
        tabs.map((tab) => {
          const on = loopTabsOf(data?.loopTabs).includes(tab.id);
          return h('div', { key: `loop-${tab.id}`, className: 'dsh-ms-row', 'data-center': 'true' },
            h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, `${tab.label}: the loop for every run`), h('div', { className: 'dsh-ms-rowdesc' }, on ? 'On: every run started in this tab uses the work loop, also with Ultra Code off.' : 'Off: only Ultra Code puts it on here.')),
            h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': on, 'aria-label': `${tab.label}: the work loop for every run`, disabled: busy || !loaded, onClick: () => { const list = loopTabsOf(data?.loopTabs); void save({ loopTabs: JSON.stringify(on ? list.filter((id) => id !== tab.id) : [...list, tab.id]) }, 'Saved. It applies from the next run.'); } }));
        }),
        h('p', { className: 'dsh-ms-desc' }, 'In Research a Long run uses the loop only when Ultra Code is on in that conversation; without it, it runs as before.'),
        (catalog?.groups ?? []).length > 0 ? h('p', { className: 'dsh-ms-desc' }, 'Calls at once, per model server (1 to 16, 4 unless you change it). A server that runs one request at a time: set it to 1, and side by side means one after another there.') : null,
        (catalog?.groups ?? []).slice(0, 12).map((group) => h('div', { key: `calls-${group.id}`, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, `${group.name ?? group.id}: calls at once`)),
          h(NumberField, { value: Number(parse(data?.callsAtOnce)[group.id] ?? 4), min: 1, max: 16, label: `${group.name ?? group.id}: calls at once`, disabled: busy || !loaded, onCommit: (number) => void save({ callsAtOnce: JSON.stringify({ ...parse(data?.callsAtOnce), [group.id]: number }) }, 'Saved. It applies from the next step.') }))),

        h('div', { className: 'dsh-ms-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'Open a conversation in a folder (Code or Cowork) and type ', h('code', null, '/mission restricted'), ', ', h('code', null, '/mission ask'), ' or ', h('code', null, '/mission auto'), '. ', h('code', null, '/mission on'), ' uses the mode chosen above; ', h('code', null, '/mission off'), ' lifts it.'),
          h('li', null, 'To have several models work on a goal, type ', h('code', null, '/mission'), ' followed by the goal, for example ', h('code', null, '/mission make every test pass and add a --json option'), '. A mode named first applies to the run: ', h('code', null, '/mission auto …'), '. The run plans, works through a checklist, proves each item with a real command where it can, has the result reviewed, and ends with a report.'),
          h('li', null, h('code', null, '/mission stop'), ' pauses a run, ', h('code', null, '/mission resume'), ' carries on (also with items that waited for your yes), ', h('code', null, '/mission end'), ' closes it with a report, ', h('code', null, '/mission report'), ' shows how it stands.'),
          h('li', null, 'A question from the assistant appears as the app\'s approval card. A yes to a file holds for that file for the rest of the conversation.'),
          h('li', null, h('code', null, '/mission checkpoints'), ' lists the checkpoints. ', h('code', null, '/mission back 12'), ' puts the folder back as it was at checkpoint 12. Going back is itself kept as a checkpoint, so it can be undone.'),
          h('li', null, h('code', null, '/mission'), ' alone shows the mode that is on and the commands.')),

        h('div', { className: 'dsh-ms-group' }, 'Good to know'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'While a mode is on, the conversation uses the app\'s Workspace Write permission. The app\'s own sandbox then stops any change outside the folder, whatever a command tries.'),
          h('li', null, 'A checkpoint is taken at the start of every turn and before every terminal command. In Restricted and Ask-Auto, if a command changes or deletes an existing file you have not approved, that file is put back at once and the assistant has to ask.'),
          h('li', null, 'Checkpoints live in a hidden folder named .dsh-mission inside the conversation\'s folder. They need git, which comes with Apple\'s command line tools. Your project\'s own git history is not touched.'),
          h('li', null, 'Files your project ignores (in .gitignore), and node_modules, are not part of a checkpoint: they are neither protected nor put back.'),
          h('li', null, 'Reading outside the folder is checked from the text of a command. A script could still read a file elsewhere on the Mac without naming it; it cannot change one.'),
          h('li', null, 'In a run, "PASSED" means a command was really run and passed. "REVIEWED" means no command could prove the item and the reviewer model judged it done. Nothing counts as done on a worker\'s word alone.'),
          h('li', null, 'A run works on one item at a time, so two models never change the same files at once. Each run keeps its log and every model\'s answer in .dsh-mission/runs inside the folder.'),
          h('li', null, 'While a run is on, the conversation\'s own model only keeps the run moving. Pause the run to work with it yourself.'),
          h('li', null, 'Mission is not available in Data and Research, which run Read Only by your choice: a mode or a run would lift that. Move the conversation to Cowork or Code to use it.'),
          h('li', null, 'Mission is not available in an isolated conversation (Recon). A run needs helper models: on a tier with Sub-agents off (Settings → Model Tiers), a run does not start or carry on, and one under way is paused. The modes and checkpoints still work there.'),
          h('li', null, 'Changes you make yourself in an editor are never undone by Mission, but a later "go back" returns the folder to the checkpoint, including your changes since then.')));
    }

    // ---- Long run: the card above the chat box and the setup card (Long run part, steps 56, 60, 61, 63) ----

    const MARKS = { verified: 'PASSED', reviewed: 'REVIEWED', unverified: 'NOT VERIFIED', stuck: 'NOT FINISHED', aside: 'NEEDS YOU', open: 'to do' };
    async function longCall(method, body) {
      const url = new URL('dsh-mission/long', document.baseURI);
      if (method === 'GET') url.searchParams.set('sessionId', body.sessionId);
      const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      return json;
    }
    /** Runs whose finished card you closed (kept for this browser). */
    const DISMISSED_KEY = 'dsh-mission.dismissed';
    const dismissedRuns = () => { try { return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); } };
    const dismissRun = (id) => { try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedRuns(), id].slice(-200))); } catch { /* private mode */ } };
    const timeLeft = (deadline) => {
      const minutes = Math.round((deadline - Date.now()) / 60000);
      return minutes > 0 ? `${minutes} min left` : 'time is up after this step';
    };

    /** The run card (step 60): checklist, lap, time and tokens, with Pause, Finish this lap and End. */
    function RunCard({ sessionId }) {
      const [card, setCard] = useState(null);
      const [note, setNote] = useState('');
      const [showReport, setShowReport] = useState(false);
      // The card stays one line high over the chat box; the checklist opens on request.
      const [showList, setShowList] = useState(false);
      const [, bump] = useState(0);
      const load = useCallback(async () => {
        if (!sessionId) return null;
        try {
          const got = await longCall('GET', { sessionId });
          setCard(got);
          return got;
        } catch {
          setCard(null);
          return null;
        }
      }, [sessionId]);
      useEffect(() => {
        // Every 5 s while a run is going or about to start; otherwise every 30 s (a run started from the Run button, or by
        // typing, looks at once); none while the window is hidden.
        const watcher = dshPoll.loop(async () => {
          const got = await load();
          return got && (got.run?.status === 'running' || got.armed === true || waitingStart.goal) ? undefined : 'idle';
        }, { every: 5000, idle: 30000 });
        const changed = (event) => { if (!event?.detail?.sessionId || event.detail.sessionId === sessionId) watcher.poke(); };
        const onKey = (event) => { if (event.key === 'Enter' && !event.shiftKey) setTimeout(() => watcher.poke(), 400); };
        window.addEventListener('dsh-mission:changed', changed);
        document.addEventListener('keydown', onKey, true);
        return () => { watcher.stop(); window.removeEventListener('dsh-mission:changed', changed); document.removeEventListener('keydown', onKey, true); };
      }, [load, sessionId]);
      const run = card?.run;
      const long = run?.kind === 'long';
      const live = run?.status === 'running';
      // The app's own goal strip is hidden while a long run's card shows (its Edit and Clear would confuse a run).
      useEffect(() => {
        const root = document.documentElement;
        if (long && live) root.setAttribute('data-dsh-long-run', '');
        else root.removeAttribute('data-dsh-long-run');
        return () => root.removeAttribute('data-dsh-long-run');
      }, [long, live]);
      if (!run || (!long && live)) return null; // a running /mission run keeps the app's own strip, as before
      if (!live && (dismissedRuns().has(run.id) || Date.now() - (run.endedAt || 0) > 24 * 3600000)) return null;
      const act = async (action) => {
        setNote('');
        try {
          const next = await longCall('POST', { sessionId, action });
          setCard(next);
          if (next.said) setNote(next.said.split('\n')[0]);
        } catch (error) {
          setNote(String(error?.message ?? error));
        }
      };
      const done = run.items.filter((item) => item.status === 'verified' || item.status === 'reviewed').length;
      const paused = live && run.goalPhase !== 'active';
      const stopped = live && Boolean(run.stalled);
      const head = live
        ? `${long ? 'Long run' : 'Mission run'}: lap ${Math.min((run.lap ?? 0) + 1, run.laps ?? 1)} of ${run.laps ?? '?'}`
        : `${long ? 'Long run' : 'Mission run'} ${run.status === 'complete' ? 'complete' : run.status === 'stopped' ? 'stopped' : 'ended'}`;
      return h('div', { className: 'dsh-ms-run', role: 'region', 'aria-label': head },
        h('style', null, CSS),
        h('div', { className: 'dsh-ms-run-head' },
          h('b', null, head),
          h('span', { className: 'dsh-ms-run-meta' }, [
            `${done} of ${run.items.length} done`,
            live && long ? timeLeft(run.deadline) : `${run.minutesUsed} min`,
            run.tokens > 0 ? `${Math.round(run.tokens / 1000)}k tokens` : '',
            live && run.working ? `now: ${run.working}` : '',
            run.finishLap && live ? 'finishing this lap' : '',
          ].filter(Boolean).join(' · ')),
          h('span', { className: 'dsh-ms-run-actions' },
            live && !paused ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('pause'), title: 'No new step starts; the step under way stops and is taken again on resume.' }, 'Pause') : null,
            live && (paused || stopped) ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('resume') }, 'Resume') : null,
            h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-expanded': showList, onClick: () => setShowList((v) => !v) }, showList ? 'Hide list' : `Checklist (${run.items.length})`),
            live && long && !run.finishLap ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('finish-lap'), title: 'Let the lap under way end, then write the report.' }, 'Finish this lap') : null,
            live ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => { void askInPage({ text: 'End the run now and write its report?', ok: 'End the run' }).then((yes) => { if (yes) void act('end'); }); } }, 'End') : null,
            !live ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => setShowReport((v) => !v) }, showReport ? 'Hide report' : 'Report') : null,
            !live ? h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-label': 'Close', onClick: () => { dismissRun(run.id); bump((n) => n + 1); } }, '×') : null)),
        // The morning report (step 63): the summary line at the top of a finished run.
        !live && run.report ? h('div', { className: 'dsh-ms-run-meta' }, run.report.split('\n')[0]) : null,
        stopped ? h('div', { className: 'dsh-ms-run-note', role: 'alert' }, run.stalled) : null,
        !showList ? null : h('ul', { className: 'dsh-ms-run-list' },
          run.items.map((item) => h('li', { key: item.id },
            h('span', { className: 'dsh-ms-run-mark', 'data-ok': String(item.status === 'verified' || item.status === 'reviewed') }, MARKS[item.status] ?? item.status),
            h('span', null, `${item.id}. ${item.title}`)))),
        showReport && run.report ? h('div', { className: 'dsh-ms-run-report' }, run.report) : null,
        // Not twice: after End the card's summary line already says what the button said.
        note && !(!live && run.report && run.report.split('\n')[0] === note) ? h('div', { className: 'dsh-ms-run-meta', role: 'status' }, note) : null);
    }

    /**
     * This chat's Long run settings (step 64), opened from Depth → Long run settings: time, laps, file
     * changes, tools and the rest, saved for the chat. The Run button in the chat box uses them.
     */
    function LongSetup({ sessionId, onClose }) {
      const [card, setCard] = useState(null);
      const [values, setValues] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      useEffect(() => {
        let alive = true;
        longCall('GET', { sessionId }).then((next) => {
          if (!alive) return;
          setCard(next);
          const saved = next.saved ?? { ...next.defaults, mode: next.mode, tools: next.tools };
          setValues({ ...saved, files: saved.tools?.files !== false, web: saved.tools?.web === true });
        }).catch((error) => alive && setNote(String(error?.message ?? error)));
        return () => { alive = false; };
      }, [sessionId]);
      const set = (key, value) => setValues((before) => ({ ...before, [key]: value }));
      const save = async () => {
        setBusy(true);
        setNote('');
        try {
          const { files, web, tools: _tools, ...rest } = values ?? {};
          await longCall('POST', { sessionId, action: 'save', ...rest, tools: { files: files !== false, web: web === true } });
          window.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId } }));
          onClose();
        } catch (error) {
          setNote(String(error?.message ?? error));
        } finally {
          setBusy(false);
        }
      };
      const ticks = card?.preflight?.ticks ?? [];
      const number = (key, label, min, max, hint) => h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
        h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, label), h('div', { className: 'dsh-ms-rowdesc' }, hint)),
        h('input', { type: 'number', className: 'dsh-ms-field', min, max, value: values?.[key] ?? '', 'aria-label': label, onChange: (event) => set(key, Number(event.target.value)) }));
      const toggle = (key, label, hint) => h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
        h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, label), h('div', { className: 'dsh-ms-rowdesc' }, hint)),
        h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': values?.[key] === true, 'aria-label': label, onClick: () => set(key, !(values?.[key] === true)) }));
      return h('div', { className: 'dsh-ms-modal-back', onClick: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'dsh-ms-modal', role: 'dialog', 'aria-label': 'Long run settings' },
          h('style', null, CSS),
          h('h2', { className: 'dsh-ms-title' }, 'Long run settings'),
          h('p', { className: 'dsh-ms-desc' }, 'For this chat. Type what it should do in the chat box and press Long run (next to Send): after one question, that starts a Long run with these settings. Send stays a normal message at your Depth.'),
          h('ul', { className: 'dsh-ms-ticks' }, ticks.map((tick) => h('li', { key: tick.key },
            h('span', { 'data-ok': tick.warn ? 'warn' : String(tick.ok) }, tick.ok === true ? '✓' : tick.warn ? '!' : tick.ok === false ? '✗' : '–'),
            h('span', null, tick.text)))),
          values ? h(React.Fragment, null,
            number('minutes', 'Time (minutes)', 10, 720, 'It stops between steps, so it can go over by the step under way.'),
            number('laps', 'Laps', 1, 50, 'A lap: work, the overall commands, a review.'),
            h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
              h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, 'File changes'), h('div', { className: 'dsh-ms-rowdesc' }, MODES.find((mode) => mode.id === values.mode)?.text ?? '')),
              h('select', { className: 'dsh-ms-field', value: values.mode, 'aria-label': 'File changes', onChange: (event) => set('mode', event.target.value) }, MODES.map((mode) => h('option', { key: mode.id, value: mode.id }, mode.label)))),
            // The run's tools in this tab (starting choice: Settings → Modes → Long run tools).
            toggle('files', 'Files and commands', 'The run may read and change files in this folder and run commands, whatever this tab allows otherwise.'),
            toggle('web', 'Web', 'The run may search and read the web.'),
            toggle('fullTime', 'Use the full time', 'Off: it stops after two laps in a row find nothing more to do.'),
            toggle('keepAwake', 'Keep the Mac awake', 'While it runs and the Mac is on power.'),
            toggle('battery', 'Also on battery', 'Drains the battery.'),
            toggle('retry', 'Try again by itself', 'Up to three times if your model server stops answering.'),
            toggle('effort', 'Think by role', 'Planner and reviewer High, workers Medium.'),
            number('tokenCap', 'Token allowance', 0, 10000000000, '0 sets none. With one, the run ends with its report once it has used this many tokens. Budget guard still stops a single round that runs away.')) : null,
          note ? h('p', { className: 'dsh-ms-desc', 'data-error': 'true', role: 'alert' }, note) : null,
          h('div', { className: 'dsh-ms-modal-foot' },
            h('button', { type: 'button', className: 'dsh-ms-btn', onClick: onClose }, 'Cancel'),
            h('button', { type: 'button', className: 'dsh-ms-btn', disabled: busy || !values, onClick: () => void save() }, busy ? 'Saving…' : 'Save'))));
    }

    /**
     * The app's own Send button in the same chat box as `from`: the composer's primary button (its CSS
     * module class `…_primary`, with aria-busy; the model menu's button also carries aria-busy).
     * @returns {HTMLButtonElement | null}
     */
    const sendButtonNear = (from) => {
      for (let node = from?.parentElement; node && node !== document.body; node = node.parentElement) {
        const found = [...node.querySelectorAll('button[aria-busy][class*="_primary"]')].filter((button) => !button.closest('.dsh-ms-runbtn-wrap'));
        if (found.length === 0) continue;
        const button = found[found.length - 1];
        // Only a plain Send: never the same button while it is Stop (a square), sending (a circle) or Continue.
        if (button.disabled || button.getAttribute('aria-busy') === 'true' || button.querySelector('rect, circle, [class*="continueIcon"]')) return null;
        // And only with something typed in that chat box.
        const editor = node.querySelector('[contenteditable="true"], textarea');
        if (editor && String(editor.textContent || editor.value || '').trim() === '') return null;
        return button;
      }
      return null;
    };

    /** Plain words for what a Long run does and how long it can last, from this chat's saved settings (or the usual ones). */
    const longWords = (saved) => {
      const minutes = Number(saved?.minutes) > 0 ? Number(saved.minutes) : 120;
      const laps = Number(saved?.laps) > 0 ? Number(saved.laps) : 10;
      const length = minutes >= 120 && minutes % 60 === 0 ? `${minutes / 60} hours` : minutes >= 90 ? `${Math.round(minutes / 6) / 10} hours` : `${minutes} minutes`;
      const tools = saved?.tools ? [saved.tools.files ? 'change files in the folder' : '', saved.tools.web ? 'use the web' : ''].filter(Boolean).join(' and ') : '';
      return { minutes, laps, length, tools };
    };
    /** The question before a Long run starts: it works alone, for a long time, and can use many tokens. */
    const askLong = (saved) => {
      const { length, laps, tools } = longWords(saved);
      return askInPage({
        title: 'Start a Long run?',
        text: `What you typed becomes the goal. The assistant then keeps working on it by itself, in up to ${laps} rounds (laps), for as long as ${length}.${tools ? ` It may ${tools}.` : ''}\n\nIt can use many tokens. You can stop it at any time with End, or let the lap under way finish with Finish this lap.`,
        ok: 'Start the Long run',
      });
    };
    /** A conversation that was not ready when Run was pressed: its message goes first, then the run starts from the same words. */
    // The goal belongs to the chat box where Run was pressed (`owner`) and then to the conversation that box turned into
    // (`id`): no other chat or Split pane takes it, and the server starts a run only in a conversation that got those very words.
    // ---- waiting-start:begin (the tests run this block on its own) ----
    const WAIT_MS = 180000;
    const waitingStart = { goal: '', at: 0, owner: null, id: '', orphan: false };
    const clearWaiting = () => { waitingStart.goal = ''; waitingStart.at = 0; waitingStart.owner = null; waitingStart.id = ''; waitingStart.orphan = false; };
    /** What a chat box should do with the waiting goal: 'none', 'drop' (forget it), 'wait' (not yet) or 'start' (now, in this conversation). */
    const waitingStep = (me, sessionId, got, now) => {
      if (!waitingStart.goal) return 'none';
      if (now - waitingStart.at >= WAIT_MS) return 'drop';
      // Only the chat box where it was pressed (or, if that box went away, whichever conversation really got the words: the server checks).
      if (waitingStart.owner !== me && !waitingStart.orphan) return 'none';
      if (!waitingStart.id && waitingStart.owner === me) waitingStart.id = sessionId;
      if (waitingStart.id && waitingStart.id !== sessionId) return waitingStart.owner === me ? 'drop' : 'none';
      if (got.runButton !== true || got.run?.status === 'running' || got.armed === true || got.busy === true) return 'wait';
      return 'start';
    };
    // ---- waiting-start:end ----

    /**
     * Run (step 64), beside Send: what is in the chat box starts a Long run with this chat's saved settings.
     * It tells Mission that the next message is a run's goal, then presses the app's own Send, so the
     * message shows in the chat as usual. While a run works, Send talks to it.
     */
    function RunButton({ sessionId }) {
      const [card, setCard] = useState(null);
      const [tip, setTip] = useState('');
      const [busy, setBusy] = useState(false);
      // Mission switched off in its settings: no Run in any mode (the row stays the same everywhere).
      const [off, setOff] = useState(false);
      const ref = useRef(null);
      const me = useRef({});
      // Starts the Long run that waited for this chat's first message, once the conversation is done answering.
      const maybeStartWaiting = async (got) => {
        const step = waitingStep(me.current, sessionId, got, Date.now());
        if (step === 'drop') clearWaiting();
        if (step !== 'start') return;
        const goal = waitingStart.goal;
        try {
          await longCall('POST', { sessionId, action: 'start', goal, afterMessage: true });
          clearWaiting();
          setTimeout(() => window.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId } })), 300);
        } catch (problem) {
          // A failed start is dropped, never kept for another conversation. (A claim by a chat that did not get those words changes nothing.)
          const wrongChat = /did not get those words/.test(String(problem?.message ?? ''));
          if (!(wrongChat && waitingStart.orphan && waitingStart.owner !== me.current)) { clearWaiting(); setTip(`The Long run did not start: ${String(problem?.message ?? problem)}`); }
        }
      };
      const startRef = useRef(maybeStartWaiting);
      startRef.current = maybeStartWaiting;
      useEffect(() => () => { if (waitingStart.owner === me.current) { waitingStart.orphan = true; } }, []);
      const load = useCallback(async () => {
        if (!sessionId) return null;
        try {
          const got = await longCall('GET', { sessionId });
          setCard(got);
          setOff(false);
          await startRef.current(got);
          return got;
        } catch (failure) {
          setCard(null);
          setOff(/switched off/i.test(String(failure?.message ?? '')));
          return /switched off/i.test(String(failure?.message ?? '')) ? { off: true } : null;
        }
      }, [sessionId]);
      useEffect(() => {
        // Every 5 s while a run is going or waiting to start; otherwise every 30 s (the Run button and Enter look at once),
        // a minute when Mission is switched off; none while the window is hidden.
        const watcher = dshPoll.loop(async () => {
          const got = await load();
          if (got?.off) return 60000;
          return got && (got.run?.status === 'running' || got.armed === true || waitingStart.goal) ? undefined : 'idle';
        }, { every: 5000, idle: 30000 });
        const changed = (event) => { if (!event?.detail?.sessionId || event.detail.sessionId === sessionId) watcher.poke(); };
        const onKey = (event) => { if (event.key === 'Enter' && !event.shiftKey) setTimeout(() => watcher.poke(), 400); };
        window.addEventListener('dsh-mission:changed', changed);
        document.addEventListener('keydown', onKey, true);
        return () => { watcher.stop(); window.removeEventListener('dsh-mission:changed', changed); document.removeEventListener('keydown', onKey, true); };
      }, [load, sessionId]);
      useEffect(() => {
        if (!tip) return undefined;
        const timer = setTimeout(() => setTip(''), 6000);
        return () => clearTimeout(timer);
      }, [tip]);
      // A press whose run did not start says why, once.
      const error = card?.startError;
      const [shownError, setShownError] = useState(0);
      useEffect(() => {
        if (error?.at && error.at !== shownError && Date.now() - error.at < 120000) {
          setShownError(error.at);
          setTip(`The Long run did not start: ${error.text}`);
        }
      }, [error?.at]);
      if (!card || card.runButton !== true) {
        // The same chat box in every mode (Modes, Settings → Modes → Chat box): Run keeps its place in every
        // mode, greyed out where a Long run cannot start, and says why. With that switch off: hidden, as before.
        const uniform = typeof document !== 'undefined' && document.documentElement.getAttribute('data-dsh-uniform') === 'true';
        if (off || !uniform) return null;
        const why = card
          ? 'A Long run cannot start in this conversation: Recon keeps runs out unless its settings allow them, and a helper\'s conversation never starts one.'
          : 'Start a Long run with what is in the chat box. This conversation is not ready yet, so your message goes first and the run starts right after it.';
        // Not ready yet (no conversation open on the server): Run still works. Where a run can never start, it stays greyed.
        const notReady = !card;
        const pressNew = async () => {
          if (busy) return;
          const send = sendButtonNear(ref.current);
          if (!send) { setTip('Type what the run should do in the chat box first.'); return; }
          const editor = send.closest('[class*="_composerStack"], form, div')?.querySelector?.('[contenteditable="true"], textarea');
          const goal = String(editor?.textContent || editor?.value || '').trim();
          if (goal.split(/\s+/).length < 3) { setTip('Say what the run should do in a few words.'); return; }
          setBusy(true);
          try {
            if (!(await askLong(null))) return;
            const again = sendButtonNear(ref.current) ?? send;
            waitingStart.goal = goal;
            waitingStart.at = Date.now();
            waitingStart.owner = me.current;
            waitingStart.id = '';
            waitingStart.orphan = false;
            again.click();
            setTip('Starting the conversation, then the Long run…');
          } finally {
            setBusy(false);
          }
        };
        return h('span', { className: 'dsh-ms-runbtn-wrap', ref, 'data-dsh-run-idle': '', title: why },
          h('style', null, CSS),
          h('button', { type: 'button', className: 'dsh-ms-runbtn', disabled: !notReady || busy, title: why, 'aria-label': notReady ? `Long run. ${why}` : `Long run (not available here). ${why}`, onMouseDown: notReady ? (event) => event.preventDefault() : undefined, onClick: notReady ? () => void pressNew() : undefined },
            h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true }, h('path', { d: 'M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2c.5-.3.5-1 0-1.3l-8-5.2c-.5-.3-1.2 0-1.2.7z', fill: 'currentColor' })),
            'Long run'),
          tip ? h('div', { className: 'dsh-ms-runtip', role: 'status' }, tip) : null);
      }
      const live = card.run?.status === 'running';
      const s = card.saved ?? {};
      const summary = `${s.minutes ?? '?'} min, ${s.laps ?? '?'} laps${s.tools ? `, ${[s.tools.files ? 'files' : '', s.tools.web ? 'web' : ''].filter(Boolean).join(' and ') || 'no extra tools'}` : ''}`;
      const title = live
        ? 'A Long run is working here. Send talks to it: it reads your message at its next step.'
        : `Start a Long run with what is in the chat box (${summary}). Change the settings in Depth → Long run settings.`;
      const press = async () => {
        if (busy || live) return;
        const send = sendButtonNear(ref.current);
        if (!send) {
          setTip('Type what the run should do in the chat box first (and wait until the conversation is done answering).');
          return;
        }
        setBusy(true);
        setTip('');
        try {
          // One click must not start a 2-hour autonomous run: say what it does first.
          if (!(await askLong(card.saved))) return;
          await longCall('POST', { sessionId, action: 'arm' });
          (sendButtonNear(ref.current) ?? send).click();
          setTip('Starting the Long run…');
          setTimeout(() => void load(), 1500);
        } catch (failure) {
          setTip(String(failure?.message ?? failure));
        } finally {
          setBusy(false);
        }
      };
      return h('span', { className: 'dsh-ms-runbtn-wrap', ref },
        h('style', null, CSS),
        h('button', { type: 'button', className: 'dsh-ms-runbtn', disabled: busy || live || card.armed === true, title, 'aria-label': live ? 'Long run (working)' : 'Start a Long run', onMouseDown: (event) => event.preventDefault(), onClick: () => void press() },
          h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true }, h('path', { d: 'M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2c.5-.3.5-1 0-1.3l-8-5.2c-.5-.3-1.2 0-1.2.7z', fill: 'currentColor' })),
          live ? 'Running' : 'Long run'),
        tip ? h('div', { className: 'dsh-ms-runtip', role: 'status' }, tip) : null);
    }

    /** Opens the setup card when the Depth list asks (the `dsh-mission:long` event names the conversation). */
    function LongOverlay() {
      const [sessionId, setSessionId] = useState('');
      useEffect(() => {
        const open = (event) => setSessionId(String(event?.detail?.sessionId ?? ''));
        window.addEventListener('dsh-mission:long', open);
        window.__dshMissionLong = true;
        window.dispatchEvent(new Event('dsh-mission:ready'));
        return () => {
          window.removeEventListener('dsh-mission:long', open);
          window.__dshMissionLong = false;
          window.dispatchEvent(new Event('dsh-mission:ready'));
        };
      }, []);
      return sessionId ? h(LongSetup, { sessionId, onClose: () => setSessionId('') }) : null;
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'mission', order: 400, label: () => t('section.title') }, (props) => h(MissionPage, { ...props, appCtx: ctx }))),
        );
        // Before the Activity monitor (order 5): it pulls itself down onto the chat box, over anything between the two.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'mission-run', order: 3 }, (props) => h(RunCard, { sessionId: props?.sessionId }))));
        // Run, beside Send (step 64).
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'mission-run-button', order: 50 }, (props) => h(RunButton, { sessionId: props?.sessionId }))));
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'mission-long', order: 81 }, () => h(LongOverlay))));
      },
    };
  },
});
