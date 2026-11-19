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
    const { ask: askInPage } = dshKit;

    const NS = 'automations';
    const DICT = {
      en: { 'panel.title': 'Automations', 'section.title': 'Alerts' },
      zh: { 'panel.title': '自动任务', 'section.title': '提醒' },
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
  flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-au-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-au-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
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
.dsh-au-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 18px 0 4px; }
.dsh-au-tile { padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-au-tilenum { font-size: 20px; line-height: 28px; font-weight: 500; }
.dsh-au-tilenum[data-warn="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-tilelabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-au-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.dsh-au-chip { height: 26px; padding: 0 10px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dsh-au-chip[aria-pressed="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dsh-au-detail { margin: 0 0 8px; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.dsh-au-detail label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-au-detail textarea, .dsh-au-detail input[type=text], .dsh-au-detail input[type=number], .dsh-au-detail select {
  box-sizing: border-box; width: 100%; padding: 8px 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-detail input[type=number] { width: 90px; }
.dsh-au-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-au-lane { display: flex; align-items: center; gap: 10px; height: 26px; }
.dsh-au-lanename { flex: none; width: 160px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-au-track { position: relative; flex: 1; height: 100%; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-au-mark { position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.dsh-au-mark[data-kind="done"] { background: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dsh-au-mark[data-kind="failed"] { background: var(--dsw-alias-state-error-primary); }
.dsh-au-mark[data-kind="missed"] { background: transparent; border: 1.5px solid var(--dsw-alias-state-warn-primary, #d9822b); box-sizing: border-box; }
.dsh-au-mark[data-kind="upcoming"] { background: transparent; border: 1.5px solid var(--dsw-alias-label-secondary); box-sizing: border-box; }
.dsh-au-mark[data-kind="running"], .dsh-au-mark[data-kind="waiting"] { background: var(--dsw-alias-brand-primary); }
.dsh-au-now { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-brand-primary); }
.dsh-au-axis { display: flex; justify-content: space-between; margin-left: 170px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-au-bar { display: flex; flex-direction: column; gap: 10px; }
.dsh-au-bar .dsh-au-tiles { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.dsh-au-bar .dsh-au-tilenum { font-size: 16px; line-height: 22px; }
html[data-cws-tab="automations"] .dsh-au-bar { position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; }
html[data-cws-tab="automations"] [class*='_composerHero']:has(.dsh-au-bar) { position: relative; }
.dsh-au-tag { font-size: 11px; line-height: 16px; padding: 1px 6px; border-radius: 6px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
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
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    async function revision(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return view.revision;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok) throw dshKit.fail(result.error);
    }

    /** The page's data, read now and every few seconds while the page is shown. */
    function useData(everyMs) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      const load = () => call()
        .then((next) => { if (alive.current) setData(next); })
        .catch((error) => { if (alive.current) setNote({ text: `Could not load: ${error.message}`, details: error.details ?? '', error: true }); });
      useEffect(() => {
        alive.current = true;
        load();
        // Looks again every few seconds while the page is shown, never while the window is hidden.
        const timer = everyMs ? dshPoll.loop(() => load(), { every: everyMs, immediate: false }) : null;
        return () => { alive.current = false; if (timer) timer.stop(); };
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
      // Step A2: a run that came long after its time says so, and why only when Plus knows.
      const late = run.late && run.dueAt ? `Ran late: due ${when(run.dueAt)}${run.whenOpened ? ', ran when the app opened' : ''}.` : '';
      if (!live && run.endedAt) facts.push(`took ${took(run.endedAt - run.startedAt)}`);
      if (run.steps) facts.push(`${num(run.steps)} ${run.steps === 1 ? 'step' : 'steps'}`);
      if (run.tokens) facts.push(`${num(run.tokens)} tokens`);
      const again = (run.state === 'failed' || run.state === 'stopped') && run.tasks.length === 1;
      return h('div', { className: 'dsh-au-row', 'data-top': 'true' },
        h(Badge, { state: run.state }),
        h('div', { className: 'dsh-au-rowtext' },
          h('div', { className: 'dsh-au-rowtitle' }, runName(run)),
          h('div', { className: 'dsh-au-rowdesc' }, facts.join(' · ')),
          late ? h('div', { className: 'dsh-au-rowdesc' }, late) : null,
          run.state === 'waiting' ? h('div', { className: 'dsh-au-rowdesc' }, `It ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}.`) : null,
          run.detail ? h('div', { className: 'dsh-au-rowdesc', 'data-error': String(run.state === 'failed') }, run.detail) : null,
          run.text ? h('div', { className: 'dsh-au-words', 'data-open': String(open), onClick: () => setOpen((value) => !value), title: open ? 'Show less' : 'Show more' }, run.text) : null),
        h('div', { className: 'dsh-au-btns' },
          again ? h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: () => onAgain(run.tasks[0].id) }, 'Run again') : null,
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open')));
    }

    const TARGET_WORDS = {
      session: 'Writes every run into one conversation.',
      new_once: 'Opens one conversation at its first run, then reuses it.',
      new: 'Opens a new conversation at every run.',
    };
    const tabName = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
    const ALERT_KEYS = [['failed', 'Fails or is stopped'], ['needs', 'Needs you'], ['finished', 'Finishes']];

    /** One automation's details (step A7): what the app stores, its runs, its own alerts and keep rule. */
    function Detail({ task, runs, data, busy, act, appCtx }) {
      const [title, setTitle] = useState(task.title);
      const [prompt, setPrompt] = useState(task.prompt);
      // The version the drafts started from: Save sends it, so a change made elsewhere meanwhile is refused
      // instead of undone (review finding 6). Untouched drafts follow the latest version.
      const [base, setBase] = useState({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt });
      useEffect(() => {
        if (task.updatedAt === base.updatedAt) return;
        if (title === base.title && prompt === base.prompt) {
          setTitle(task.title);
          setPrompt(task.prompt);
          setBase({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt });
        }
      }, [task.updatedAt]);
      const keep = task.keep ?? task.keepDefault ?? { days: 31, count: 0 };
      const [days, setDays] = useState(String(keep.days));
      const [count, setCount] = useState(String(keep.count));
      const own = runs.filter((run) => run.tasks.some((item) => item.id === task.id)).slice(0, 10);
      const changed = title.trim() !== base.title || prompt.trim() !== base.prompt;
      const saveText = () => act({
        action: 'edit', id: task.id, expectedUpdatedAt: base.updatedAt,
        ...(title.trim() !== base.title ? { title } : {}), ...(prompt.trim() !== base.prompt ? { prompt } : {}),
      }, 'Saved.').then((ok) => { if (ok) setBase({ updatedAt: undefined, title: title.trim(), prompt: prompt.trim() }); });
      const toTrash = data.settings?.deletedToTrash !== false && data.trash;
      const remove = () => {
        const text = toTrash
          ? `Delete "${task.title || 'this automation'}"?\n\nIt goes to the trash for 30 days, where Put back makes it again. Its list of past deliveries in the app is deleted for good.`
          : `Delete "${task.title || 'this automation'}" for good?\n\nIt cannot be put back, and its list of past deliveries is deleted too.`;
        void askInPage({ text, ok: 'Delete', danger: true }).then((yes) => { if (yes) act({ action: 'delete', id: task.id, expectedUpdatedAt: task.updatedAt }, 'Deleted.'); });
      };
      return h('div', { className: 'dsh-au-detail' },
        h('label', null, 'Name', h('input', { type: 'text', value: title, maxLength: 120, onChange: (e) => setTitle(e.target.value) })),
        h('label', null, 'Instruction (sent at every run)', h('textarea', { rows: 5, value: prompt, onChange: (e) => setPrompt(e.target.value) })),
        h('div', { className: 'dsh-au-inline' },
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || !changed, onClick: saveText }, 'Save'),
          changed ? h('button', { type: 'button', className: 'dsh-au-link', onClick: () => { setTitle(task.title); setPrompt(task.prompt); setBase({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt }); } }, 'Undo changes') : null),
        h('div', null,
          h('div', null, h('b', null, 'When: '), task.rule || 'A custom rule'),
          h('div', null, h('b', null, 'Where: '), TARGET_WORDS[task.target] ?? 'Its conversation.', task.cwd ? ` Folder: ${task.cwd}` : ''),
          h('div', null, h('b', null, 'Tab: '), tabName(task.tab), task.createdIn ? ` (created in ${tabName(task.createdIn)})` : ' (where it was created is not known)')),
        task.sessionId ? h('div', null, h('button', { type: 'button', className: 'dsh-au-link', onClick: () => openConversation(appCtx, task.sessionId) }, 'Open its conversation')) : null,
        h('div', null, h('b', null, 'Alerts for this automation'), h('div', { className: 'dsh-au-rowdesc' }, 'Default follows Settings → Alerts.')),
        h('div', { className: 'dsh-au-inline' }, ALERT_KEYS.map(([key, label]) => h('label', { key, style: { flexDirection: 'row', alignItems: 'center' } }, `${label}: `,
          h('select', {
            value: task.alerts?.[key] === true ? 'on' : task.alerts?.[key] === false ? 'off' : 'default',
            disabled: busy,
            onChange: (e) => {
              const next = { ...(task.alerts ?? {}) };
              if (e.target.value === 'default') delete next[key];
              else next[key] = e.target.value === 'on';
              act({ action: 'alerts', id: task.id, alerts: next }, 'Saved.');
            },
            style: { width: 'auto' },
          }, h('option', { value: 'default' }, 'Default'), h('option', { value: 'on' }, 'Alert'), h('option', { value: 'off' }, 'No alert'))))),
        h('div', null, h('b', null, 'Keep past runs'), h('div', { className: 'dsh-au-rowdesc' },
          task.target === 'new' && data.settings?.oldRunsToTrash !== false
            ? 'Older runs leave the list, and their conversations go to the trash for 30 days.'
            : 'Older runs leave this list. Its conversation is never touched.',
          task.keep ? '' : ' Starting values, from how often it runs.')),
        h('div', { className: 'dsh-au-inline' },
          h('label', { style: { flexDirection: 'row', alignItems: 'center' } }, 'Days ', h('input', { type: 'number', min: 0, max: 3650, value: days, onChange: (e) => setDays(e.target.value) })),
          h('label', { style: { flexDirection: 'row', alignItems: 'center' } }, 'Runs ', h('input', { type: 'number', min: 0, max: 1000, value: count, onChange: (e) => setCount(e.target.value) })),
          h('span', { className: 'dsh-au-rowdesc' }, '0 = no limit'),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: () => act({ action: 'keep', id: task.id, keep: { days: Number(days) || 0, count: Number(count) || 0 } }, 'Saved.') }, 'Save'),
          task.keep ? h('button', { type: 'button', className: 'dsh-au-link', disabled: busy, onClick: () => act({ action: 'keep', id: task.id, keep: null }, 'Back to the starting values.') }, 'Starting values') : null),
        own.length > 0 ? h('div', null, h('b', null, 'Its last runs'), own.map((run) => h(RunRow, { key: run.id, run, appCtx, busy, onAgain: () => act({ action: 'run', id: task.id }, 'Started.') }))) : null,
        h('div', { className: 'dsh-au-inline' },
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'schedules') }, "Open in the app's editor"),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: remove }, 'Delete…')));
    }

    const MARK_WORDS = { done: 'Finished', failed: 'Failed or stopped', missed: 'Missed', upcoming: 'Coming', running: 'Running', waiting: 'Needs you' };
    /** The timeline (step A16): one lane per automation; runs, missed times and times to come. */
    function Timeline() {
      const [span, setSpan] = useState('week');
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      useEffect(() => {
        let live = true;
        const load = () => call({ action: 'timeline', span })
          .then((next) => { if (live) { setData(next.timeline); setError(''); } })
          .catch((e) => { if (live) setError(`Could not load: ${e.message}`); });
        load();
        const timer = dshPoll.loop(() => load(), { every: 60000, immediate: false });
        return () => { live = false; timer.stop(); };
      }, [span]);
      const pos = (at) => `${Math.max(0, Math.min(100, ((at - data.from) / (data.to - data.from)) * 100))}%`;
      const label = (at) => {
        const d = new Date(at);
        return span === 'day' ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      };
      return h('div', null,
        h('div', { className: 'dsh-au-chips' }, ['day', 'week', 'month'].map((id) => h('button', { key: id, type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(span === id), onClick: () => setSpan(id) }, id === 'day' ? 'Day' : id === 'week' ? 'Week' : 'Month'))),
        error ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, error) : null,
        !data ? h('p', { className: 'dsh-au-desc' }, 'Loading…') : data.lanes.length === 0 ? h('p', { className: 'dsh-au-desc' }, 'Nothing ran or is due in this time.') : h('div', null,
          data.lanes.map((lane) => h('div', { key: lane.id, className: 'dsh-au-lane' },
            h('div', { className: 'dsh-au-lanename', title: lane.title }, lane.title || 'Untitled'),
            h('div', { className: 'dsh-au-track' },
              h('div', { className: 'dsh-au-now', style: { left: pos(data.now) }, title: 'Now' }),
              lane.marks.map((mark, index) => h('span', { key: index, className: 'dsh-au-mark', 'data-kind': mark.kind, style: { left: pos(mark.at) }, title: `${MARK_WORDS[mark.kind] ?? mark.kind}${mark.late ? ', late' : ''}: ${when(mark.at)}` }))))),
          h('div', { className: 'dsh-au-axis' }, h('span', null, label(data.from)), h('span', null, 'now'), h('span', null, label(data.to))),
          h('p', { className: 'dsh-au-desc' }, 'Filled green: finished. Red: failed or stopped. Orange ring: missed. Grey ring: coming. Point at a mark for its time.')));
    }

    /** When a saved Creator Plus run repeats: every day, every weekday, or one day of the week (ISO: 1 = Monday). */
    const CREATOR_DAYS = [['', 'Every day', []], ['weekdays', 'Every weekday', [1, 2, 3, 4, 5]], ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => [String(index + 1), `Every ${day}`, [index + 1]])];

    /**
     * Creator Plus's saved runs, offered here (Creator Plus, the owner's answer of 16 November): Schedule makes
     * a Creator Plus conversation in Scratch for the run and an automation that sends the run there. The run
     * changes nothing in the real setup without the user's yes: Creator Plus's own rules hold in that conversation.
     */
    function CreatorRuns({ runs, busy, act, appCtx }) {
      const [plan, setPlan] = useState({});
      const [working, setWorking] = useState('');
      const [problem, setProblem] = useState('');
      const of = (name) => plan[name] ?? { time: '09:00', days: '' };
      const schedule = async (run) => {
        setWorking(run.name);
        setProblem('');
        try {
          const sessions = appCtx.get('sessions');
          if (!sessions?.create) throw new Error('this version of the app cannot make a conversation from here');
          const scratch = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const place = scratch.ok ? String((await scratch.json()).place ?? '') : '';
          if (!place) throw new Error('Scratch is not available here (it needs the Cowork sidebar)');
          const sessionId = await sessions.create({ cwd: place });
          const claim = await fetch(new URL('dsh-creator-plus/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'claim', sessionId, run: run.name }) });
          if (!claim.ok) throw new Error((await claim.json().catch(() => ({}))).error || 'the conversation could not become a Creator Plus one');
          const chosen = of(run.name);
          const days = CREATOR_DAYS.find(([id]) => id === chosen.days)?.[2] ?? [];
          await act({ action: 'creatorRun', name: run.name, sessionId, time: chosen.time, weekdays: days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, `Scheduled "${run.name}". It runs in its own Creator Plus conversation and changes nothing without your yes.`);
        } catch (error) {
          setProblem(`It did not work: ${error.message}`);
        } finally {
          setWorking('');
        }
      };
      return h(React.Fragment, null,
        h('div', { className: 'dsh-au-group' }, 'Creator Plus saved runs'),
        h('p', { className: 'dsh-au-desc' }, 'Runs you saved on the Creator Plus bar. A scheduled one works in a Creator Plus conversation of its own, as a Long run would: it prepares changes in the trial copy only and lists them, with its questions, for you. Nothing in your setup changes without your yes.'),
        problem ? h('p', { className: 'dsh-au-desc', 'data-error': 'true', role: 'status' }, problem) : null,
        runs.map((run) => h('div', { key: run.name, className: 'dsh-au-row' },
          h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, run.name, ' ', h('span', { className: 'dsh-au-tag' }, 'Creator Plus')), h('div', { className: 'dsh-au-rowdesc' }, run.sentence)),
          h('div', { className: 'dsh-au-btns' },
            h('select', { value: of(run.name).days, disabled: busy || Boolean(working), 'aria-label': `When ${run.name} runs`, onChange: (e) => setPlan({ ...plan, [run.name]: { ...of(run.name), days: e.target.value } }) }, CREATOR_DAYS.map(([id, label]) => h('option', { key: id, value: id }, label))),
            h('input', { type: 'time', value: of(run.name).time, disabled: busy || Boolean(working), 'aria-label': `Time for ${run.name}`, onChange: (e) => setPlan({ ...plan, [run.name]: { ...of(run.name), time: e.target.value } }) }),
            h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || Boolean(working) || !/^\d\d:\d\d$/.test(of(run.name).time), onClick: () => void schedule(run) }, working === run.name ? 'Scheduling…' : 'Schedule')))));
    }

    function RunsPage({ appCtx }) {
      const { data, setData, note, setNote, alive } = useData(5000);
      const [busy, setBusy] = useState(false);
      const [all, setAll] = useState(false);
      const [open, setOpen] = useState('');
      const [tab, setTab] = useState('');

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Automations'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      /** Send one change, show the answer, refresh. */
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await call(body);
          if (!alive.current) return;
          setData(next);
          setNote({ text: done, error: false });
          setTimeout(() => { if (alive.current) setNote((now) => (now.error ? now : { text: '', error: false })); }, 6000);
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: `It did not work: ${error.message}`, details: error.details ?? '', error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const runNow = (id) => act({ action: 'run', id }, 'Started. It appears under Last runs in a moment.');

      const runs = Array.isArray(data.runs) ? data.runs : [];
      const waiting = runs.filter((run) => run.state === 'waiting');
      const lastOf = (taskId) => runs.find((run) => run.tasks.some((task) => task.id === taskId));
      // A task that has ended and has no recorded run has nothing to show here.
      const every = (Array.isArray(data.tasks) ? data.tasks : []).filter((task) => task.status !== 'ended' || lastOf(task.id));
      const tabs = [...new Set(every.map((task) => task.tab).filter(Boolean))];
      const tasks = tab ? every.filter((task) => task.tab === tab) : every;
      const missed = every.flatMap((task) => (task.missed ?? []).map((at) => ({ task, at }))).sort((a, b) => b.at - a.at);
      const shown = all ? runs : runs.slice(0, 20);
      const alerts = data.alerts ?? {};
      const where = [alerts.mac ? 'on this Mac' : '', alerts.phone && !alerts.phoneProblem ? 'on your phone' : ''].filter(Boolean).join(' and ');
      const tiles = data.tiles ?? {};
      const tile = (n, label, warn) => h('div', { className: 'dsh-au-tile' }, h('div', { className: 'dsh-au-tilenum', 'data-warn': String(Boolean(warn)) }, n), h('div', { className: 'dsh-au-tilelabel' }, label));

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('div', { className: 'dsh-au-head' },
          h('div', { className: 'dsh-au-headtext' },
            h('h2', { className: 'dsh-au-title' }, 'Automations'),
            h('p', { className: 'dsh-au-desc' }, 'Your scheduled tasks, how each run ended, and what needs you. To make a new one, ask the assistant ("do this every weekday at 9") or use the app\'s editor.')),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'schedules') }, "App's editor")),
        data.enabled === false ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, 'Recording is switched off in Settings → Alerts, so new runs do not appear here.') : null,
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        h('div', { className: 'dsh-au-tiles' },
          tile(num(tiles.on), 'Switched on'),
          tile(num(tiles.ranToday), 'Ran today'),
          tile(num(tiles.missed), 'Missed (7 days)', tiles.missed > 0),
          tile(num(tiles.failed), 'Failed (7 days)', tiles.failed > 0),
          tile(tiles.nextAt ? when(tiles.nextAt) : '—', 'Next run')),

        waiting.length > 0 ? h('div', { className: 'dsh-au-group' }, `Needs you (${waiting.length})`) : null,
        waiting.map((run) => h('div', { key: run.id, className: 'dsh-au-card', role: 'status' },
          h('div', { className: 'dsh-au-rowtext' }, h('b', null, runName(run)), ` ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}. Started ${when(run.startedAt)}.`),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open'))),

        missed.length > 0 ? h('div', { className: 'dsh-au-group' }, `Missed while the app was closed (${missed.length})`) : null,
        missed.length > 0 ? h('p', { className: 'dsh-au-desc' }, 'When the app opens, it runs each automation once for its latest missed time. These earlier times did not run. Run now runs the instruction now, not for the missed time.') : null,
        missed.slice(0, 20).map(({ task, at }) => h('div', { key: `${task.id}-${at}`, className: 'dsh-au-row' },
          h('span', { className: 'dsh-au-badge', 'data-state': 'stopped' }, 'Missed'),
          h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, task.title || 'Untitled'), h('div', { className: 'dsh-au-rowdesc' }, `Was due ${when(at)}`)),
          h('div', { className: 'dsh-au-btns' }, h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || task.running || task.status !== 'active', onClick: () => runNow(task.id) }, 'Run now')))),

        h('div', { className: 'dsh-au-group' }, 'Your automations'),
        tabs.length > 1 ? h('div', { className: 'dsh-au-chips' },
          h('button', { type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(!tab), onClick: () => setTab('') }, 'All tabs'),
          tabs.map((id) => h('button', { key: id, type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(tab === id), onClick: () => setTab(id) }, tabName(id)))) : null,
        tasks.length === 0
          ? h('p', { className: 'dsh-au-desc' }, data.scheduler === false ? 'The app\'s scheduler is not running, so there are no automations to show.' : 'No automations yet. Ask the assistant to "do this every weekday at 9", or use the app\'s editor.')
          : tasks.map((task) => {
            const last = lastOf(task.id);
            const lines = [task.rule || 'A custom rule'];
            if (task.status === 'active' && task.nextAt) lines.push(`next ${when(task.nextAt)}`);
            else if (task.status !== 'active') lines.push(TASK_WORDS[task.status] ?? task.status);
            lines.push(last ? `last: ${STATE_WORDS[last.state] ?? last.state}, ${when(last.startedAt)}` : task.deliveredAt ? `last started ${when(task.deliveredAt)}` : 'no run yet');
            const on = task.status === 'active';
            return h(React.Fragment, { key: task.id },
              h('div', { className: 'dsh-au-row' },
                task.status === 'ended' ? h('span', { className: 'dsh-au-badge' }, 'Ended') : h('button', {
                  type: 'button', role: 'switch', className: 'dsh-au-switch', 'aria-checked': String(on), disabled: busy,
                  'aria-label': on ? `Pause ${task.title}` : `Switch on ${task.title}`,
                  title: on ? 'On. Click to pause.' : 'Paused. Switching it on moves it to its next time; missed times do not run.',
                  onClick: () => act({ action: on ? 'pause' : 'resume', id: task.id, expectedUpdatedAt: task.updatedAt }, on ? 'Paused.' : 'Switched on. It runs next at its next time.'),
                }),
                h('div', { className: 'dsh-au-rowtext' },
                  h('div', { className: 'dsh-au-rowtitle' }, task.title || 'Untitled', ' ', task.tab ? h('span', { className: 'dsh-au-tag' }, tabName(task.tab)) : null),
                  h('div', { className: 'dsh-au-rowdesc' }, lines.join(' · '))),
                h('div', { className: 'dsh-au-btns' },
                  last ? h(Badge, { state: last.state }) : null,
                  h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || task.running || task.status === 'ended', onClick: () => runNow(task.id) }, task.running ? 'Running…' : 'Run now'),
                  h('button', { type: 'button', className: 'dsh-au-btn', 'aria-expanded': String(open === task.id), onClick: () => setOpen(open === task.id ? '' : task.id) }, open === task.id ? 'Close' : 'Details'))),
              open === task.id ? h(Detail, { task, runs, data, busy, act, appCtx }) : null);
          }),

        Array.isArray(data.creatorRuns) && data.creatorRuns.length > 0 ? h(CreatorRuns, { runs: data.creatorRuns, busy, act, appCtx }) : null,

        h('div', { className: 'dsh-au-group' }, 'Timeline'),
        h(Timeline),

        h('div', { className: 'dsh-au-group' }, 'Last runs'),
        runs.length === 0
          ? h('p', { className: 'dsh-au-desc' }, 'No run recorded yet. Runs appear here from now on; ones from before this add-on was installed are not listed.')
          : shown.map((run) => h(RunRow, { key: run.id, run, appCtx, busy, onAgain: runNow })),
        runs.length > shown.length ? h('p', { className: 'dsh-au-desc' }, h('button', { type: 'button', className: 'dsh-au-link', onClick: () => setAll(true) }, `Show all ${runs.length}`)) : null,

        h('div', { className: 'dsh-au-group' }, 'Good to know'),
        h('ul', { className: 'dsh-au-list' },
          h('li', null, where ? `You are alerted ${where} when a task fails or needs you. Change this in Settings → Alerts, or for one automation under Details.` : 'Alerts are switched off. Switch them on in Settings → Alerts.'),
          h('li', null, 'Automations run only while the app is running. When the window is closed, the app stays in the Dock. Nothing runs while the Mac sleeps.'),
          h('li', null, 'When the app opens after being closed, it runs each automation once for its latest missed time, marked "Ran late". Earlier missed times are listed under Missed.'),
          h('li', null, '"Stopped" means a limit or a rule ended the run before it finished, for example the Budget guard.'),
          h('li', null, data.trash && data.settings?.deletedToTrash !== false ? 'A deleted automation, on any page or by archiving its conversation, stays in the trash for 30 days.' : 'Deleting an automation is final.'),
          h('li', null, 'Past runs are kept per automation (Details → Keep past runs).')));
    }

    /** The open sidebar tab, from the Cowork sidebar's mark on the page. */
    function useOpenTab() {
      const read = () => document.documentElement.getAttribute('data-cws-tab') || '';
      const [tab, setTab] = useState(read);
      useEffect(() => {
        const watch = new MutationObserver(() => setTab(read()));
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cws-tab'] });
        return () => watch.disconnect();
      }, []);
      return tab;
    }

    /** The Automations tab's start page (step A5): its tiles, and the way to the full page. */
    function TabTiles({ appCtx }) {
      const { data } = useData(15000);
      const tiles = data?.tiles ?? {};
      const waiting = (data?.runs ?? []).filter((run) => run.state === 'waiting').length;
      const tile = (n, label, warn) => h('div', { className: 'dsh-au-tile' }, h('div', { className: 'dsh-au-tilenum', 'data-warn': String(Boolean(warn)) }, n), h('div', { className: 'dsh-au-tilelabel' }, label));
      return h('div', { className: 'dsh-au-bar' },
        h('style', null, CSS),
        h('div', { className: 'dsh-au-tiles', style: { margin: 0 } },
          tile(data ? num(tiles.on) : '…', 'Switched on'),
          tile(data ? num(tiles.ranToday) : '…', 'Ran today'),
          tile(data ? num(waiting) : '…', 'Need you', waiting > 0),
          tile(data ? num(tiles.missed) : '…', 'Missed (7 days)', tiles.missed > 0),
          tile(data ? num(tiles.failed) : '…', 'Failed (7 days)', tiles.failed > 0),
          tile(data && tiles.nextAt ? when(tiles.nextAt) : '—', 'Next run')),
        h('div', { className: 'dsh-au-inline', style: { justifyContent: 'center' } },
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'automations') }, 'Open Automations'),
          h('span', { className: 'dsh-au-rowdesc' }, 'Or ask here: "every weekday at 8, summarise my inbox", "what did the morning brief say on Monday?"')));
    }
    function TabStart({ appCtx }) {
      return useOpenTab() === 'automations' ? h(TabTiles, { appCtx }) : null;
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

    /** A part another add-on adds to this page (Notify); a part that fails to draw leaves the rest of the page alone. */
    class PartBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false }; }
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, 'This part could not be shown. Restart the app and try again.') : this.props.children; }
    }

    function AlertsPage({ appCtx }) {
      dshMerge.useTab(React, 'alerts'); // draws the page again when another add-on adds or removes a part
      const { data, setData, note, setNote, alive } = useData(0);
      const [busy, setBusy] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Alerts'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const alerts = data.alerts ?? {};
      // The page's names for the settings, and the names they are saved under.
      const KEYS = { failed: 'alertFailed', needs: 'alertNeeds', finished: 'alertFinished', others: 'alertOthers', runs: 'alertRuns' };
      const save = async (values) => {
        try {
          await setSettings(appCtx, Object.fromEntries(Object.entries(values).map(([key, value]) => [KEYS[key] ?? key, value])));
          if (!alive.current) return;
          setData((d) => ({ ...d, ...('enabled' in values ? { enabled: values.enabled } : {}), alerts: { ...d.alerts, ...values } }));
          setNote({ text: 'Saved.', error: false });
          // Read it back, so a problem with the new values shows at once.
          call().then((next) => { if (alive.current) setData(next); }).catch(() => {});
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      /** This add-on's own switches (not alerts). */
      const saveOwn = async (values) => {
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, settings: { ...d.settings, ...values } }));
          setNote({ text: 'Saved.', error: false });
          call().then((next) => { if (alive.current) setData(next); }).catch(() => {});
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
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
          if (alive.current) setNote({ text: `Could not send the test: ${error.message}`, details: error.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-au-title' }, 'Alerts'),
        h('p', { className: 'dsh-au-desc' }, 'A short line when a task fails, needs you or finishes, so you can walk away. The line has the task\'s name and what happened, for example "Morning brief failed". It never has your instruction or the answer in it.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        h('div', { className: 'dsh-au-group' }, 'Alert me when'),
        h(Row, { title: 'A task failed or was stopped' }, h(Switch, { on: alerts.failed, label: 'A task failed or was stopped', onChange: (on) => save({ failed: on }) })),
        h(Row, { title: 'A task needs me', hint: 'It waits for your approval, your answer to a question, or your review of its plan.' }, h(Switch, { on: alerts.needs, label: 'A task needs me', onChange: (on) => save({ needs: on }) })),
        h(Row, { title: 'A task finished' }, h(Switch, { on: alerts.finished, label: 'A task finished', onChange: (on) => save({ finished: on }) })),

        h('div', { className: 'dsh-au-group' }, 'For which tasks'),
        h(Row, { title: 'Scheduled tasks', hint: 'Always, when alerts are on. The alert names the task.' }, null),
        h(Row, { title: 'Mission and long runs', hint: 'When a run ends, needs your yes, or stops by itself (also after the app closed during a run). Never for each round. The alert names the project folder, never the run\'s goal.' }, h(Switch, { on: alerts.runs !== false, label: 'Mission and long runs', onChange: (on) => save({ runs: on }) })),
        h(Row, { title: 'Also conversations I start myself', hint: 'The alert names the project folder, not the conversation. The rounds of a running Mission or long run never alert one by one.' }, h(Switch, { on: alerts.others, label: 'Also conversations I start myself', onChange: (on) => save({ others: on }) })),
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

        dshMerge.parts('alerts').map((part) => h(React.Fragment, { key: part.id },
          h('div', { className: 'dsh-au-group' }, typeof part.label === 'function' ? part.label() : String(part.label ?? part.id)),
          h(PartBoundary, null, part.render({ appCtx })))),

        h('div', { className: 'dsh-au-group' }, 'Everything'),
        h(Row, { title: 'Record runs and send alerts', hint: 'Off records no runs on the Automations page and sends no alerts.' }, h(Switch, { on: data.enabled !== false, label: 'Record runs and send alerts', onChange: (on) => save({ enabled: on }) })),

        h('div', { className: 'dsh-au-group' }, 'Automations'),
        h(Row, { title: 'The Automations tab', hint: data.tabProblem || 'A tab of its own in the sidebar, whose chat makes and changes automations and answers questions about their results.' }, h(Switch, { on: data.settings?.tab !== false, label: 'The Automations tab', onChange: (on) => saveOwn({ tab: on }) })),
        h(Row, { title: 'Keep deleted automations in the trash', hint: 'For 30 days, with Put back. Off: deleting an automation is final, as in the app.' }, h(Switch, { on: data.settings?.deletedToTrash !== false, label: 'Keep deleted automations in the trash', onChange: (on) => saveOwn({ deletedToTrash: on }) })),
        h(Row, { title: 'Old runs\' conversations to the trash', hint: 'For an automation that opens a new conversation at every run: runs older than its keep rule go to the trash. A shared conversation is never touched.' }, h(Switch, { on: data.settings?.oldRunsToTrash !== false, label: 'Old runs\' conversations to the trash', onChange: (on) => saveOwn({ oldRunsToTrash: on }) })),

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
        // The Alerts page shows the parts other add-ons offer it (Notify); with none it is as before.
        ctx.effect(() => dshMerge.host('alerts'));
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'alerts', order: 430, label: () => t('section.title') }, (props) => h(AlertsPage, { ...props, appCtx: ctx }))),
        );
        // A full page with its own sidebar row (the Cowork sidebar lists it under the Cowork tab).
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'automations' }, () => h(RunsPanel, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'automations-start', order: 44 }, () => h(TabStart, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'automations', order: 21, label: () => t('panel.title') }, RunsIcon)));
      },
    };
  },
});
