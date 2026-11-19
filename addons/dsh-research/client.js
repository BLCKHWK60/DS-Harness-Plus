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
.dsh-rs-btn.dsh-rs-btn-small { height: 22px; padding: 0 8px; font-size: 11px; margin-left: 6px; }
.dsh-rs-btn:disabled { opacity: .5; cursor: default; }
.dsh-rs-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-rs-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rs-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-rs-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-rs-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-rs-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-rs-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-rs-adv { margin-top: 24px; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rs-advhead { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; }
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
.dsh-rs-ctl:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
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
.dsh-rs-dock { box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px)); max-width: var(--dsh-composer-card-max-width, 100%); margin: 0 auto 8px; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, transparent); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
/* As wide as the chat box, also with Cowork's wide chat (which lets the box use the window less 32px). */
html[data-cws-wide] .dsh-rs-dock { max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 32px); }
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

    // ---- "Continue in Content" (step C2): a new Content conversation that brings the report in -------

    /** Whether the Content tab is on (its own page data); false when it cannot be told. */
    async function contentOn() {
      try {
        const response = await fetch(new URL('dsh-content/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        return response.ok && (await response.json()).enabled === true;
      } catch {
        return false;
      }
    }

    /**
     * Open a new Content conversation in Scratch (never in a folder of yours, never in Recon's room) and
     * send it the message that brings the report in. Content makes it a Content conversation first.
     */
    async function continueInContent(appCtx, file) {
      const report = String(file ?? '').split('/').pop();
      const sessions = appCtx.get('sessions');
      const remote = appCtx.get('remote.session');
      const workspace = appCtx.get('uiWorkspace');
      if (!sessions?.create || !remote?.prompt || !workspace?.openSession) throw new Error('this version of the app cannot open a conversation from here');
      if (!(await contentOn())) throw new Error('the Content tab is off: switch it on in Settings → Content');
      const scratch = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const place = scratch.ok ? String((await scratch.json()).place ?? '') : '';
      if (!place) throw new Error('Scratch is not available here (it needs the Cowork sidebar)');
      const child = await sessions.create({ cwd: place });
      const answer = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'continue', sessionId: child, report }) });
      const data = await answer.json().catch(() => ({}));
      if (!answer.ok) throw new Error(data.error || `error ${answer.status}`);
      const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `continue-${Date.now()}`, sessionId: child, mode: 'queue', content: [{ type: 'text', text: data.continued.text }] });
      workspace.openSession(child);
      if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the message was not sent');
    }

    /** Whether the Content tab is on, asked once for the component that shows the buttons. */
    function useContentOn(active = true) {
      const [on, setOn] = useState(false);
      useEffect(() => {
        if (!active) return undefined;
        let alive = true;
        void contentOn().then((value) => { if (alive) setOn(value); });
        return () => { alive = false; };
      }, [active]);
      return on;
    }

    function ContinueButton({ appCtx, file, onNote, compact = false }) {
      const [busy, setBusy] = useState(false);
      if (!file) return null;
      const go = async () => {
        setBusy(true);
        try {
          await continueInContent(appCtx, file);
        } catch (problem) {
          onNote?.(`Could not continue in Content: ${problem.message}`);
        } finally {
          setBusy(false);
        }
      };
      return h('button', { type: 'button', className: compact ? 'dsh-rs-btn dsh-rs-btn-small' : 'dsh-rs-btn', disabled: busy, title: 'A new Content conversation with this report as its material, and its packet (claims, contradictions, timeline, leads) when it has one', onClick: () => void go() }, busy ? 'Opening…' : 'Continue in Content');
    }

    const STEPS = [['planning', 'Plan'], ['searching', 'Search'], ['reviewing', 'Review'], ['writing', 'Write'], ['done', 'Done']];

    async function readData() {
      const response = await fetch(new URL('dsh-research/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw dshKit.fail(`error ${response.status}`);
      return response.json();
    }
    async function post(body, query = '') {
      const response = await fetch(new URL(`dsh-research/data${query}`, document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }
    async function setIn(ctx, ns, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      const revisionOf = async () => {
        const result = await ctx.remote.settings.describe();
        if (!result.ok) throw dshKit.fail(result.error);
        const view = result.value.namespaces.find((entry) => entry.ns === ns);
        if (!view) throw new Error(`${ns} is not running`);
        return view.revision;
      };
      let result = await ctx.remote.settings.mutate(ns, ops, await revisionOf());
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(ns, ops, await revisionOf());
      if (!result.ok) throw dshKit.fail(result.error);
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
      // Depth and the sources are the chat box's own buttons (Modes); here only what needs saying.
      if (!data.problem) return h('style', null, CSS);
      return h('div', { ref: bar, className: 'dsh-rs-bar', role: 'status' },
        h('style', null, CSS),
        h('div', { className: 'dsh-rs-hint', 'data-error': 'true' }, data.problem));
    }

    // The Focus dropdown that sat in the chat box is gone (18 November 2026): Focus is the Web selector's ticks.

    /** The latest Deep research run of a conversation. */
    function useRun(sessionId) {
      const [run, setRun] = useState(null);
      useEffect(() => {
        if (!sessionId) { setRun(null); return undefined; }
        let alive = true;
        // Every 2 s while a run goes, every 8 s otherwise; none while the window is hidden.
        const watcher = dshPoll.loop(async () => {
          let next = null;
          try {
            const response = await fetch(new URL(`dsh-deep-research/progress?session=${encodeURIComponent(sessionId)}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
            if (response.ok) next = (await response.json()).run ?? null;
          } catch {
            next = null;
          }
          if (!alive) return undefined;
          setRun(next);
          return next && !['done', 'failed', 'stopped'].includes(next.stage) ? 2000 : 8000;
        }, { every: 8000 });
        return () => { alive = false; watcher.stop(); };
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
      // Asked only once a run is done with a saved report; with Content off, nothing changes in the dock.
      const contentIsOn = useContentOn(Boolean(run && run.stage === 'done' && run.file));
      if (!run) return null;
      const key = `${sessionId}:${run.startedAt}`;
      const busy = !['done', 'failed', 'stopped'].includes(run.stage);
      const recent = Date.now() - (run.endedAt || 0) < 6 * 60 * 60 * 1000;
      if (!busy && (dismissed.has(key) || !recent)) return null;
      // Once done, the dock stays for its follow-up questions and, with a saved report, "Continue in Content".
      const canContinue = run.stage === 'done' && Boolean(run.file) && contentIsOn;
      if (!busy && run.stage === 'done' && run.followups.length === 0 && !canContinue) return null;
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
        !busy && canContinue ? h('div', { className: 'dsh-rs-follow' }, h(ContinueButton, { appCtx, file: run.file, onNote: setNote })) : null,
        note ? h('div', null, note) : null);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-rs-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** Opens Settings → Web sources (Modes' page), through the Settings window's own store. */
    function openWebSources(appCtx) {
      try {
        const actions = appCtx.slots.entries('sidebar.settings').find((item) => item.store)?.store?.create?.()?.actions;
        if (typeof actions?.openSection === 'function') return void actions.openSection('web-sources');
        if (typeof actions?.select === 'function') actions.select('web-sources');
      } catch {
        /* the page names where to go */
      }
    }

    /** The parts other add-ons offer to this page (Deep research's engine settings), behind one "Advanced" button. */
    function AdvancedParts({ appCtx }) {
      const [open, setOpen] = useState(false);
      // Settings search asks for the part's tab (dshMerge.openTab): open the group, whether the page was already open or mounts afterwards.
      const [tab] = dshMerge.useTab(React, 'research');
      useEffect(() => { if (tab !== 'main') setOpen(true); }, [tab]);
      const parts = dshMerge.parts('research');
      if (parts.length === 0) return null;
      return h('div', { className: 'dsh-rs-adv', 'data-dsh-merge-parts': 'research' }, parts.map((part) => h('div', { key: part.id },
        h('div', { className: 'dsh-rs-advhead' }, h('div', { className: 'dsh-rs-rowtitle' }, part.label()), h('button', { type: 'button', className: 'dsh-rs-btn', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide' : 'Show')),
        open ? part.render({ appCtx }) : null)));
    }

    function ResearchPage({ appCtx }) {
      const { data, setData, error, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      const contentIsOn = useContentOn(true);
      if (!data) return h('div', { className: 'dsh-rs-page' }, h('style', null, CSS), h('h2', { className: 'dsh-rs-title' }, 'Research'), h('p', { className: 'dsh-rs-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      const save = async (ns, values, done) => {
        try {
          await setIn(appCtx, ns, values);
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          tell();
          setTimeout(load, 1500);
        } catch (problem) {
          setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        }
      };
      return h('div', { className: 'dsh-rs-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-rs-title' }, 'Research'),
        h('p', { className: 'dsh-rs-desc' }, 'A tab for researching a question in depth. The assistant plans sub-questions, searches and reads many sources with helpers working at once, reviews what is missing and searches again, then writes a report that cites its sources by number. Every citation is checked to be in the source list, and each source is marked "read", "seen only in search results, not read" or "not read, and not seen in search results"; claims are not compared with the pages. You see each stage as it happens, and the report ends with follow-up questions you can ask with one click.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dsh-rs-desc', 'data-error': 'true' }, data.problem) : null,
        h('div', { className: 'dsh-rs-group' }, 'The tab'),
        h('div', { className: 'dsh-rs-row' },
          h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Show the Research tab'), h('div', { className: 'dsh-rs-rowdesc' }, 'Needs the Deep research add-on. Off takes the tab away; saved reports are kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Research tab', onChange: (on) => void save(NS, { enabled: on }, on ? 'Switched on. The Research tab appears in the sidebar in a moment.' : 'Switched off.') })),
        h('div', { className: 'dsh-rs-group' }, 'Depth and focus'),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Depth'), h('div', { className: 'dsh-rs-rowdesc' }, `The same Depth as in every tab: pick it with the Depth button in the chat box; Settings → Modes sets where new conversations start. For a research run it sets how long the run takes and how many helpers work at once: ${(data.depths ?? []).map((item) => `${item.label}, ${item.about.charAt(0).toLowerCase()}${item.about.slice(1)}`).join(' ')}${data.programMinutes ? ` ${programNote(data.programMinutes)}` : ''}`))),
        // Focus is now the Web selector's ticks (18 November 2026): the same Web button as every tab.
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Sources (formerly Focus)'), h('div', { className: 'dsh-rs-rowdesc' }, 'Pick them with the Web button in the chat box, the same as in every tab: tick Academic papers, News or any mix. Its "Use for new Research conversations" sets where new ones start. A run\'s helpers are told which kinds count, and results of other kinds are left out. Each conversation\'s earlier Focus was carried over: News is now News and verified sources, Academic is Academic papers and verified sources.')),
          h('button', { type: 'button', className: 'dsh-rs-btn', onClick: () => openWebSources(appCtx) }, 'Web sources…')),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }, h('div', { className: 'dsh-rs-rowtitle' }, 'Model for the helpers'), h('div', { className: 'dsh-rs-rowdesc' }, (data.helperModels ?? []).find((item) => item.id === data.helperModel)?.hint ?? '')),
          h(Segments, { items: data.helperModels ?? [], value: data.helperModel, label: 'Model for the helpers', onPick: (id) => void save('modes', { researchModel: id }, 'Saved. It also applies to Mission, Agent swarm and the other helper tools, unless a conversation chose otherwise.') })),
        h('div', { className: 'dsh-rs-group' }, 'Saved reports'),
        h('p', { className: 'dsh-rs-desc' }, `Every report from the Research tab is saved as a Markdown file in ${data.folder}.`),
        (data.reports ?? []).length === 0 ? h('p', { className: 'dsh-rs-desc' }, 'No report saved yet.') : h('ul', { className: 'dsh-rs-list' }, data.reports.map((report) => h('li', { key: report.name }, `${report.name} (${report.date}) `, contentIsOn ? h(ContinueButton, { appCtx, file: report.name, compact: true, onNote: (text) => setNote({ text, error: true }) }) : null))),
        h('p', { className: 'dsh-rs-desc' }, 'Beside each report Research also writes its packet (a folder of the same name): the claims table with who says each claim, its passage, source, grade and whether it was read, the contradictions, a timeline and the leads still open. It is made from the run\'s own findings, so it costs no time. With the Content tab on, "Continue in Content" opens a new Content conversation that brings the report and its packet in.'),
        h('div', { className: 'dsh-rs-row' }, h('div', { className: 'dsh-rs-rowtext' }), h('button', { type: 'button', className: 'dsh-rs-btn', onClick: () => void post({ action: 'reveal' }).catch((problem) => setNote({ text: problem.message, details: problem.details ?? '', error: true })) }, 'Show in Finder')),
        h(AdvancedParts, { appCtx }),
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
        ctx.effect(() => dshMerge.host('research'));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'research', order: 110, label: () => t('section.title') }, (props) => h(ResearchPage, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'research-bar', order: 42 }, () => h(ResearchBar, { appCtx: ctx }))));
        // The Focus dropdown (research-controls) is gone from the chat box: Focus is the Web selector's ticks now.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'research-progress', order: 4 }, (props) => h(ProgressDock, { ...props, appCtx: ctx }))));
      },
    };
  },
});
