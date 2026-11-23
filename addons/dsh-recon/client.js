/**
 * Recon, browser half: the Settings > Recon page, with the switch for the Recon tab and a plain
 * account of what the isolation does and does not do; and the status bar on the Recon tab's start
 * page (Tor, Usenet, the conversation's model and whether it may receive what Recon finds).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-recon',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
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

    const NS = 'recon';
    const SPACE_IDS = ['chat', 'code', 'devices', 'recon', 'workshop'];
    const DICT = {
      en: { 'section.title': 'Recon', 'offer.group': 'The mode', 'offer.title': 'Offer the Recon mode', 'offer.desc': 'Adds the Recon mode and the Recon space beside Chat and Code. Threads started there are sealed for good.', 'offer.on': 'Switched on. The Recon mode and the Recon space appear in a moment.', 'offer.off': 'Switched off. The Recon mode and the Recon space are taken away in a moment. Recon threads you already had stay locked: they have no tools.', 'space.chat': 'Chat', 'space.code': 'Code', 'space.devices': 'Devices', 'space.recon': 'Recon', 'space.workshop': 'Workshop' },
    };

    const CSS = `
.dsh-rc-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-rc-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-rc-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rc-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-rc-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-rc-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rc-rowtext { flex: 1; min-width: 0; }
.dsh-rc-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-rc-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rc-btn {
  flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-rc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rc-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-rc-btn:disabled { opacity: .5; cursor: default; }
.dsh-rc-btns { flex: none; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.dsh-rc-btn[data-on="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-rc-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-rc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-rc-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-rc-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-rc-input { margin-top: 8px; width: 100%; max-width: 360px; height: 30px; padding: 0 10px; box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-rc-account { padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rc-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.dsh-rc-fields .dsh-rc-input { flex: 1 1 150px; max-width: 240px; margin-top: 0; }
.dsh-rc-fields .dsh-rc-port { flex: 0 0 84px; }
.dsh-rc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.dsh-rc-tag { margin-left: 8px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 500; vertical-align: 1px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.dsh-rc-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-rc-sql { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }

/* The status bar on the start page: only while the Recon tab, or (Item 4A, stage 6a) the Recon space, is selected. */
.dsh-rc-bar { display: none; }
html[data-cws-tab="recon"] .dsh-rc-bar, html[data-cws-space="recon"] .dsh-rc-bar {
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;
}
html[data-cws-tab="recon"] [class*='_composerHero']:has(.dsh-rc-bar), html[data-cws-space="recon"] [class*='_composerHero']:has(.dsh-rc-bar) { position: relative; }
html[data-cws-tab="recon"] [class*='_composerHero']:has(.dsh-rc-bar) .cws-chips, html[data-cws-space="recon"] [class*='_composerHero']:has(.dsh-rc-bar) .cws-chips { margin-top: calc(var(--dsh-rc-bar, 60px) + 36px); }
.dsh-rc-pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; white-space: nowrap;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-rc-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.dsh-rc-pill[data-state="ok"]::before { background: var(--dsw-alias-state-success-primary); }
.dsh-rc-pill[data-state="warn"]::before { background: var(--dsw-alias-state-warn-primary); }
.dsh-rc-pill[data-state="error"]::before { background: var(--dsw-alias-state-error-primary); }
.dsh-rc-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rc-hint[data-error="true"] { color: var(--dsw-alias-state-warn-primary); }
`;

    /** The add-on's route. `session` names the start page's conversation, for the status bar. */
    // ---- the export door (step C8): only the user starts an export, from a Recon conversation ---------

    const DOOR_CSS = `
.dsh-rc-ctl { display: inline-flex; align-items: center; gap: 4px; height: calc(28px + var(--dsh-content-font-delta,0px)); padding: 0 8px; border: 0; border-radius: var(--dsw-radius-sm, 8px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-rc-ctl:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rc-door { position: fixed; z-index: 1000; box-sizing: border-box; width: 420px; max-width: calc(100vw - 24px); overflow-y: auto; padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-rc-door h3 { margin: 0 0 6px; font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-rc-door fieldset { border: 0; margin: 8px 0 0; padding: 0; }
.dsh-rc-door legend { font-weight: 600; margin-bottom: 2px; }
.dsh-rc-door label { display: flex; gap: 6px; align-items: flex-start; margin: 2px 0; }
.dsh-rc-door select, .dsh-rc-door input[type=text] { max-width: 100%; margin-left: 22px; padding: 4px 6px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: inherit; font: inherit; }
.dsh-rc-door ul { margin: 4px 0 0; padding-left: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-rc-door .warn { color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-secondary)); }
.dsh-rc-door .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.dsh-rc-door .err { color: var(--dsw-alias-state-error-primary); margin-top: 8px; }
`;

    async function door(body, query) {
      const address = new URL('dsh-recon/door', document.baseURI);
      for (const [key, value] of Object.entries(query ?? {})) address.searchParams.set(key, String(value));
      const response = await fetch(address, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    /** A new conversation in Scratch (never Recon's room, never a folder of yours), made a conversation of the picked tab, with the export as its first message. */
    async function sendToNew(appCtx, done) {
      const sessions = appCtx.get('sessions');
      const remote = appCtx.get('remote.session');
      const workspace = appCtx.get('uiWorkspace');
      if (!sessions?.create || !remote?.prompt || !workspace?.openSession) throw new Error('this version of the app cannot open a thread from here; send it to a folder instead');
      const scratch = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const place = scratch.ok ? String((await scratch.json()).place ?? '') : '';
      if (!place) throw new Error('Scratch is not available here (it needs the Left panel add-on); send it to a folder instead');
      const child = await sessions.create({ cwd: place });
      await door({ action: 'claim', id: done.id, sessionId: child, tab: done.tab });
      const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `export-${Date.now()}`, sessionId: child, mode: 'queue', content: [{ type: 'text', text: done.message }] });
      workspace.openSession(child);
      if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the export was not sent');
    }

    async function sendToExisting(appCtx, done) {
      const remote = appCtx.get('remote.session');
      if (!remote?.prompt) throw new Error('this version of the app cannot send from here; send it to a folder instead');
      const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `export-${Date.now()}`, sessionId: done.target, mode: 'queue', content: [{ type: 'text', text: done.message }] });
      if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the export was not sent');
    }

    /**
     * Item 4A, stage 6a fix: the language of the names shown on the page. Plus is English only (decision 28, stage 7),
     * so this is always 'en', also when the app is set to Chinese.
     */
    function pageLang() {
      return 'en';
    }

    /** Item 4A, stage 6a fix: a mode's name as Modes gives it in English, else the Modes list's name. */
    function tabLabel(one, tw) {
      const named = one?.names?.[pageLang(tw)]?.mode;
      return (typeof named === 'string' && named.trim()) || String(one?.label ?? '');
    }

    /**
     * Item 4A, stage 6a: ' (Space · Mode)' after an export target's title: the space's name
     * and the mode's name from the Modes list; never an id (an unknown space is left out).
     */
    function targetNote(one, tw) {
      // Item 4A, stage 6a fix: the names Modes gives first (`names.en`), then Recon's own copy.
      const own = one?.names?.[pageLang(tw)] ?? {};
      const space = (typeof own.space === 'string' && own.space.trim()) || (SPACE_IDS.includes(one?.space) ? tw(`space.${one.space}`) : '');
      const mode = (typeof own.mode === 'string' && own.mode.trim()) || String(one?.mode ?? '').trim();
      const parts = [space, mode].filter(Boolean);
      return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
    }

    function ExportDoor({ sessionId, appCtx }) {
      const tw = (key) => {
        try {
          return appCtx.locale.bind(NS)(key);
        } catch {
          return DICT.en[key] ?? key;
        }
      };
      const [recon, setRecon] = useState(false);
      const [open, setOpen] = useState(false);
      const [what, setWhat] = useState('report');
      const [to, setTo] = useState('new');
      const [tab, setTab] = useState('content');
      const [target, setTarget] = useState('');
      const [folder, setFolder] = useState('');
      const [preview, setPreview] = useState(null);
      const [state, setState] = useState({ busy: false, error: '', done: '' });
      const [place, setPlace] = useState({ right: 12, bottom: 80 });
      const [ticked, setTicked] = useState({});
      const [panes, setPanes] = useState([]);
      const button = useRef(null);
      // Recon stays sealed while it runs (the owner's answer of 17 November 2026): the button waits.
      const statusSource = appCtx.get('uiSession')?.sessionStatus;
      const running = React.useSyncExternalStore(
        React.useCallback((listener) => (statusSource?.subscribe ? statusSource.subscribe(listener) : () => {}), [statusSource]),
        React.useCallback(() => statusSource?.getSnapshot?.()?.get?.(sessionId)?.running === true, [statusSource, sessionId]),
      );
      // Split Plus can open this window from its Send to (a send out of Recon is this door, nothing else).
      useEffect(() => {
        const onAsk = (event) => { if (event?.detail?.sessionId === sessionId) setOpen(true); };
        window.addEventListener('dsh-split-plus:recon-export', onAsk);
        return () => window.removeEventListener('dsh-split-plus:recon-export', onAsk);
      }, [sessionId]);
      useEffect(() => {
        let alive = true;
        // Another conversation: Export… goes at once and comes back only if this one is a Recon conversation
        // (it lingered on other tabs).
        setRecon(false);
        setOpen(false);
        if (!sessionId) return undefined;
        call(undefined, sessionId).then((data) => { if (alive) setRecon(data?.conversation?.recon === true); }, () => {});
        return () => { alive = false; };
      }, [sessionId]);
      useEffect(() => {
        if (!open || !sessionId) return;
        let alive = true;
        setPreview(null);
        door(undefined, { session: sessionId, what }).then((data) => {
          if (!alive) return;
          setPreview(data);
          setTicked(Object.fromEntries((data.files ?? []).map((file) => [file.path, file.text === true])));
          fetch(new URL('dsh-split-plus/data?openPanes=1', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : {})).then((value) => { if (alive) setPanes(Array.isArray(value.openPanes) ? value.openPanes : []); }, () => {});
          if (!folder) setFolder(data.folder ?? '');
          if (!target && data.targets?.[0]) setTarget(data.targets[0].id);
          if (!(data.tabs ?? []).some((one) => one.id === tab) && data.tabs?.[0]) setTab(data.tabs[0].id);
        }, (problem) => { if (alive) setState({ busy: false, error: problem.message, done: '' }); });
        return () => { alive = false; };
      }, [open, what, sessionId]);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 432)), bottom: window.innerHeight - rect.top + 8 });
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('keydown', key, true);
        return () => document.removeEventListener('keydown', key, true);
      }, [open]);
      // With the Cowork sidebar the selected tab is the conversation's mode, known at once: another tab never shows the door.
      const shownTab = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement.getAttribute('data-cws-tab') : null;
      // Item 4A, stage 6a: any mode in the Recon space is a Recon thread, so the door shows there too.
      const shownSpace = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement.getAttribute('data-cws-space') : null;
      const otherTab = shownSpace !== 'recon' && Boolean(shownTab) && shownTab !== 'recon';
      if (!recon || otherTab) return h('style', null, DOOR_CSS);
      const go = async () => {
        setState({ busy: true, error: '', done: '' });
        try {
          const files = Object.entries(ticked).filter(([, on]) => on).map(([path]) => path);
          const done = await door({ action: 'export', session: sessionId, what, to, tab, target, folder, files });
          if (to === 'new') await sendToNew(appCtx, done);
          else if (to === 'existing') await sendToExisting(appCtx, done);
          setState({ busy: false, error: '', done: to === 'folder' ? `Exported to ${done.where}.` : `Exported (${done.id}).` });
        } catch (problem) {
          setState({ busy: false, error: `Not exported: ${problem.message}`, done: '' });
        }
      };
      const radio = (name, value, current, set, label) => h('label', null, h('input', { type: 'radio', name, checked: current === value, onChange: () => set(value) }), label);
      return h(React.Fragment, null,
        h('style', null, DOOR_CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-rc-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, disabled: running && !open, title: running ? 'Recon is running; export when it is done' : 'Export what this Recon thread found: only you can, and only this way', onClick: () => { setState({ busy: false, error: '', done: '' }); setOpen(!open); } }, 'Export…'),
        open ? ReactDOM.createPortal(h('div', { className: 'dsh-rc-door', role: 'dialog', 'aria-label': 'Export from Recon', style: { left: place.left, bottom: place.bottom, maxHeight: `calc(100vh - ${(place.bottom ?? 80) + 12}px)` } },
          h('style', null, DOOR_CSS),
          h('h3', null, 'Export from Recon'),
          h('div', null, 'The one way out of a Recon thread. Recon\'s model cannot start it; the app copies plain text.'),
          h('fieldset', null, h('legend', null, 'What goes'),
            radio('dsh-rc-what', 'report', what, setWhat, 'The newest report and the sources it cites (the packet)'),
            radio('dsh-rc-what', 'conversation', what, setWhat, 'The whole thread: every report, your messages, every source')),
          h('fieldset', null, h('legend', null, 'Where it goes'),
            radio('dsh-rc-to', 'new', to, setTo, 'A new thread in'),
            to === 'new' ? h('select', { value: tab, 'aria-label': 'Mode', onChange: (event) => setTab(event.target.value) }, (preview?.tabs ?? [{ id: 'content', label: 'Content' }]).map((one) => h('option', { key: one.id, value: one.id }, tabLabel(one, tw)))) : null,
            radio('dsh-rc-to', 'existing', to, setTo, 'A thread that exists'),
            // Item 4A, stage 6a: each conversation is labelled '(Space · Mode)' in the page's language, never with ids.
            to === 'existing' ? h('select', { value: target, 'aria-label': 'Thread', onChange: (event) => setTarget(event.target.value) }, [...(preview?.targets ?? [])].sort((a, b) => Number(panes.includes(b.id)) - Number(panes.includes(a.id))).map((one) => h('option', { key: one.id, value: one.id }, `${panes.includes(one.id) ? 'Open pane: ' : ''}${one.title}${targetNote(one, tw)}`))) : null,
            radio('dsh-rc-to', 'folder', to, setTo, 'A folder on this Mac (full path)'),
            to === 'folder' ? h('input', { type: 'text', spellCheck: false, value: folder, 'aria-label': 'Folder', onChange: (event) => setFolder(event.target.value) }) : null),
          preview && (preview.files ?? []).length > 0 ? h('fieldset', null, h('legend', null, `Files in Recon's room (${preview.files.length})`),
            h('div', { style: { color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, 'Text files Recon wrote go in the export, quoted as material. Any other file is copied unopened into the export\'s folder: tick one only if you know it is safe.'),
            preview.files.map((file) => h('label', { key: file.path, style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
              h('input', { type: 'checkbox', checked: ticked[file.path] === true, onChange: (event) => setTicked({ ...ticked, [file.path]: event.target.checked }) }),
              h('span', null, file.path),
              h('span', { style: { color: file.text ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-state-error-primary)' } }, file.text ? `text, ${Math.ceil(file.size / 1024)} KB` : `not text, ${Math.ceil(file.size / 1024)} KB: copied unopened`)))) : null,
          preview?.running ? h('div', { className: 'err' }, 'Recon is running in this thread: export when the run is done.') : null,
          preview ? h('div', null,
            h('fieldset', null, h('legend', null, 'What leaves Recon'), h('ul', null, preview.leaves.map((line) => h('li', { key: line }, line)))),
            h('div', { style: { marginTop: 4, color: 'var(--dsw-alias-label-secondary)' } }, preview.notKept),
            preview.restartNote ? h('div', { style: { marginTop: 4 } }, preview.restartNote) : null,
            h('fieldset', null, h('legend', null, 'What never leaves'), h('ul', null, preview.never.map((line) => h('li', { key: line }, line)))),
            h('fieldset', null, h('legend', null, 'Once it is out, Recon\'s rules no longer hold for the copy'), h('ul', { className: 'warn' }, preview.warnings.map((line) => h('li', { key: line }, line)))),
            h('div', { style: { marginTop: 6 } }, 'In the thread it goes to, its addresses are citations: an onion address is never opened outside Recon, any other is opened only after you say yes, and nothing from it goes into Memory.'),
            preview.tooLong && to !== 'folder' ? h('div', { className: 'err' }, 'This is too long for one message: send it to a folder.') : null)
            : h('div', { style: { marginTop: 8 } }, 'Reading what would leave…'),
          state.error ? h('div', { className: 'err', role: 'alert' }, state.error) : null,
          state.done ? h('div', { role: 'status', style: { marginTop: 8 } }, state.done) : null,
          h('div', { className: 'row' },
            h('button', { type: 'button', className: 'dsh-rc-btn', onClick: () => setOpen(false) }, state.done ? 'Close' : 'Cancel'),
            h('button', { type: 'button', className: 'dsh-rc-btn', disabled: state.busy || !preview || running || preview.running === true || Boolean(state.done) || (preview.tooLong && to !== 'folder') || (to === 'existing' && !target), onClick: () => void go() }, state.busy ? 'Exporting…' : 'Export'))), document.body) : null);
    }

    async function call(body, session) {
      const address = new URL('dsh-recon/state', document.baseURI);
      if (session) address.searchParams.set('session', String(session));
      const response = await fetch(address, {
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

    /** A news server's name, as a Usenet provider gives it. */
    const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
    /** As many accounts as the add-on takes. */
    const MAX = 8;
    /** @returns {number | undefined} the port, when what was typed is one. Nothing typed is 563. */
    const portOf = (typed) => {
      const text = String(typed ?? '').trim();
      if (text === '') return 563;
      const port = Math.trunc(Number(text));
      return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : undefined;
    };
    /** An id for a new account: short, and the Keychain item it names stays readable. */
    const newId = () => {
      const bytes = new Uint8Array(6);
      try {
        window.crypto.getRandomValues(bytes);
      } catch {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      }
      return `a${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    };
    /** The accounts as the configuration takes them: only the four fields it knows. */
    const stored = (accounts) => (Array.isArray(accounts) ? accounts : []).map((one) => ({ id: String(one.id ?? ''), label: String(one.label ?? ''), host: String(one.host ?? ''), port: Number(one.port) || 563 }));

    /** One Usenet account: what it is called, which server it is, and where its login stands. */
    function AccountRow({ account, busy, isDefault, onSave, onDefault, onRemove }) {
      const [label, setLabel] = useState(account.label ?? '');
      const [host, setHost] = useState(account.host ?? '');
      const [port, setPort] = useState(String(account.port ?? 563));
      const saved = JSON.stringify([account.label ?? '', account.host ?? '', account.port ?? 563]);
      const seen = useRef(saved);
      useEffect(() => {
        if (seen.current === saved) return;
        seen.current = saved;
        setLabel(account.label ?? '');
        setHost(account.host ?? '');
        setPort(String(account.port ?? 563));
      }, [saved, account.label, account.host, account.port]);
      const name = label.trim().slice(0, 40);
      const server = host.trim().toLowerCase();
      const portNumber = portOf(port);
      const changed = name !== (account.label ?? '') || server !== (account.host ?? '') || portNumber !== (account.port ?? 563);
      const usable = HOST.test(server) && portNumber !== undefined;
      return h('div', { className: 'dsh-rc-account' },
        h('div', { className: 'dsh-rc-rowtitle' }, name || account.host || 'This account has no server yet', isDefault ? h('span', { className: 'dsh-rc-tag' }, 'default') : null),
        h('div', { className: 'dsh-rc-rowdesc' }, account.hasLogin
          ? 'Login stored in the Keychain. Recon reads it only to sign in; it is never shown, saved in a file or given to the model.'
          : 'No login stored in the Keychain yet. Recon can sign in to this account only once you have stored it.'),
        h('div', { className: 'dsh-rc-fields' },
          h('input', { className: 'dsh-rc-input', type: 'text', value: label, placeholder: 'Name (optional)', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'Account name', onChange: (event) => setLabel(event.target.value) }),
          h('input', { className: 'dsh-rc-input', type: 'text', value: host, placeholder: 'news.example.com', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'News server', onChange: (event) => setHost(event.target.value) }),
          h('input', { className: 'dsh-rc-input dsh-rc-port', type: 'text', value: port, inputMode: 'numeric', placeholder: '563', spellCheck: false, 'aria-label': 'Port', onChange: (event) => setPort(event.target.value) })),
        h('div', { className: 'dsh-rc-actions' },
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || !changed || !usable, title: usable ? 'Save this account' : 'A server name like news.example.com, and a port from 1 to 65535', onClick: () => onSave({ id: account.id, label: name, host: server, port: portNumber }) }, 'Save'),
          isDefault ? null : h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, title: 'Use this account when a request names none', onClick: onDefault }, 'Make default'),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, title: 'Take this account out of Settings. Its login stays in the Keychain.', onClick: onRemove }, 'Remove')),
        account.hasLogin
          ? h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To remove this account\'s login from the Keychain, type this in the Terminal:'), h('div', { className: 'dsh-rc-sql' }, account.removeCommand ?? ''))
          : h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To store this account\'s login, type this in the Terminal with your user name in place of YOUR_USERNAME. It asks for the password, which stays hidden:'), h('div', { className: 'dsh-rc-sql' }, account.storeCommand ?? '')));
    }

    /**
     * What the start page's status bar says, from the route's data: Tor, Usenet, the Internet
     * Archive's route while it is on, and the conversation's model and whether it may receive what
     * Recon finds ("not known yet" while the app has not loaded the conversation, "No model picked"
     * when it has none). Agreeing to a cloud model stays typed (/recon cloud): there is no button for it.
     * @param {object} data - the route's answer for one conversation.
     * @returns {{pills: {key: string, text: string, state: string, title: string}[], hint: string, warn: boolean}}
     */
    function barOf(data) {
      const tor = data?.tor ?? {};
      const usenet = data?.usenet ?? {};
      const more = data?.more ?? {};
      const talk = data?.conversation ?? {};
      const pills = [];
      if (!tor.path) pills.push({ key: 'tor', text: 'Tor not installed', state: 'error', title: 'Recon needs the tor program. In the Terminal: brew install tor' });
      else if (tor.state === 'ready') pills.push({ key: 'tor', text: 'Tor connected', state: 'ok', title: 'Recon\'s own Tor is running.' });
      else if (tor.state === 'starting') pills.push({ key: 'tor', text: `Tor connecting ${tor.percent || 0}%`, state: 'warn', title: 'Recon\'s own Tor is connecting to its network.' });
      else if (tor.state === 'failed') pills.push({ key: 'tor', text: 'Tor did not connect', state: 'error', title: 'Settings → Recon → Test Tor shows why.' });
      else pills.push({ key: 'tor', text: 'Tor starts with the first search', state: 'ok', title: 'Recon starts its own Tor when a search or a page needs it.' });
      const accounts = Array.isArray(usenet.accounts) ? usenet.accounts : [];
      if (usenet.route !== 'direct') pills.push({ key: 'usenet', text: 'Usenet off', state: 'none', title: 'Switch it on in Settings → Recon → Usenet.' });
      else if (accounts.length === 0) pills.push({ key: 'usenet', text: 'Usenet on, no account yet', state: 'warn', title: 'Add an account in Settings → Recon → Usenet.' });
      else pills.push({ key: 'usenet', text: `Usenet on, ${accounts.length} account${accounts.length === 1 ? '' : 's'}`, state: 'ok', title: 'Direct encrypted connections to your news servers, not through Tor.' });
      // WireGuard: Recon's way out for everything that is not Tor (the ordinary web, Usenet, your own sources).
      const vpn = data?.vpn ?? {};
      const vpnState = vpn.status?.state ?? 'off';
      const tried = Array.isArray(vpn.status?.tried) ? vpn.status.tried.map((one) => `${one.name}: ${one.why}`).join('; ') : '';
      if (!Array.isArray(vpn.configs) || vpn.configs.length === 0) pills.push({ key: 'wireguard', text: 'WireGuard not set up', state: 'none', title: 'Nothing outside Tor is sent until a WireGuard configuration is added in Settings → Recon → WireGuard (or a thread allows /recon direct).' });
      else if (vpnState === 'ready') pills.push({ key: 'wireguard', text: 'WireGuard connected', state: 'ok', title: `Through ${vpn.status.name || 'your tunnel'}.` });
      else if (vpnState === 'starting') pills.push({ key: 'wireguard', text: 'WireGuard connecting', state: 'warn', title: 'Recon is starting its tunnel.' });
      else if (vpnState === 'failed') pills.push({ key: 'wireguard', text: 'WireGuard did not connect', state: 'error', title: tried ? `Tried: ${tried}. Settings → Recon → WireGuard → Test.` : 'Settings → Recon → WireGuard → Test shows why.' });
      else pills.push({ key: 'wireguard', text: 'WireGuard starts when needed', state: 'ok', title: `${vpn.configs.length} configuration${vpn.configs.length === 1 ? '' : 's'} set up; Recon starts the tunnel when something outside Tor is needed.` });
      // I2P: shown so the list is complete; a later step builds it.
      pills.push({ key: 'i2p', text: 'I2P not set up yet', state: 'none', title: 'A later step adds I2P to Recon.' });
      // Your own sources allowed in Recon (Settings → Web sources → May be used in Recon): read through WireGuard only.
      const noTunnel = !Array.isArray(vpn.configs) || vpn.configs.length === 0 || vpnState === 'failed';
      for (const own of Array.isArray(data?.others) ? data.others : []) {
        const key = `other-${own.name}`;
        if (!own.kept) pills.push({ key, text: own.name, state: 'none', title: 'Its login is not kept yet: Settings → Web sources → Other sources.' });
        else if (own.last && own.last.ok === false) pills.push({ key, text: own.name, state: 'error', title: `The last read did not work: ${own.last.why}` });
        else if (noTunnel) pills.push({ key, text: own.name, state: 'none', title: 'Read only through WireGuard, which is not working or not set up.' });
        else pills.push({ key, text: own.name, state: 'ok', title: own.last?.ok ? 'Your own source. The last read worked, through WireGuard.' : 'Your own source, ready: read through WireGuard when a thread asks.' });
      }
      if (more.archive === true) pills.push({ key: 'archive', text: more.archiveDirect ? 'Internet Archive read directly' : 'Internet Archive through Tor', state: 'none', title: more.archiveDirect ? 'Copies are read straight from the Archive, which sees this Mac\'s internet address. Settings → Recon → More sources.' : 'Copies are read through Tor; the Archive refuses most such reads. Settings → Recon → More sources.' });
      let hint = 'Sealed: nothing from other threads comes in, and nothing of it goes to them. Type /recon for details.';
      let warn = false;
      if (!talk.known) {
        // The app has not loaded this conversation yet, so its model cannot be asked: not the same as none picked.
        pills.push({ key: 'model', text: 'Model not known yet', state: 'none', title: 'Shown once the app has loaded this thread.' });
        hint = 'The model shows here once the app has loaded this thread. A model on this Mac or in your own network gets what Recon finds; a cloud model only after you agree.';
      } else if (!talk.model) {
        pills.push({ key: 'model', text: 'No model picked', state: 'warn', title: 'Pick a model in the chat box.' });
        hint = 'Pick a model in the chat box. A model on this Mac or in your own network gets what Recon finds; a cloud model only after you agree.';
      } else {
        const where = talk.where === 'local' ? 'on this Mac' : talk.where === 'network' ? 'in your network' : talk.where === 'cloud' ? 'in the cloud' : 'place unknown';
        pills.push({ key: 'model', text: `${talk.model}, ${where}`, state: talk.may ? 'ok' : 'warn', title: talk.provider ? `Provider: ${talk.provider}` : '' });
        pills.push({ key: 'findings', text: talk.may ? 'Findings go to this model' : 'Findings held back', state: talk.may ? 'ok' : 'warn', title: talk.may ? (talk.agreed ? (data?.cloudModels === 'always' ? 'Settings → Recon → Models allows cloud models without asking.' : 'You agreed with /recon cloud, for this thread and this model.') : 'This model runs on your own machines.') : data?.cloudModels === 'never' ? 'Cloud models are switched off in Settings → Recon → Models.' : 'Type /recon cloud to agree for this thread.' });
        if (!talk.may) {
          hint = data?.cloudModels === 'never' ? 'What Recon finds is not sent to this model: cloud models are switched off in Settings → Recon → Models. Pick a model on this Mac or in your own network.' : 'What Recon finds is not sent to this model. Type /recon cloud to agree for this thread, or pick a model on this Mac or in your own network.';
          warn = true;
        }
      }
      if (talk.known && talk.inRoom === false) {
        hint = 'This thread is not in Recon\'s own folder, so its tools are off. Start one with the New button in the Recon space.';
        warn = true;
      }
      return { pills, hint, warn };
    }

    /** The status bar under the chat box on the Recon tab's start page. */
    function ReconBar({ sessionId }) {
      const [data, setData] = useState(null);
      const alive = useRef(true);
      const bar = useRef(null);
      useEffect(() => {
        alive.current = true;
        const look = () => {
          // The bar sits on every tab's start page and shows only on the Recon tab (Item 4A, stage 6a: or in the
          // Recon space, whatever the mode): ask only there.
          const root = document.documentElement;
          if (document.hidden || (root?.getAttribute?.('data-cws-tab') !== 'recon' && root?.getAttribute?.('data-cws-space') !== 'recon')) return;
          call(undefined, sessionId).then((next) => { if (alive.current) setData(next); }, () => {});
        };
        look();
        const timer = setInterval(look, 4000);
        // Ask at once when the Recon tab is picked, not at the next round.
        const picked = typeof MutationObserver === 'function' ? new MutationObserver(look) : null;
        picked?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cws-tab', 'data-cws-space'] });
        return () => { alive.current = false; clearInterval(timer); picked?.disconnect(); };
      }, [sessionId]);
      const shown = Boolean(data && data.enabled === true);
      // Before the first return, so the hook order never changes.
      useEffect(() => {
        const node = bar.current;
        if (!node || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-rc-bar', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-rc-bar'); };
      }, [shown]);
      if (!shown) return h('style', null, CSS);
      const { pills, hint, warn } = barOf(data);
      return h('div', { ref: bar, className: 'dsh-rc-bar', role: 'status', 'aria-label': 'Recon status' },
        h('style', null, CSS),
        pills.map((pill) => h('span', { key: pill.key, className: 'dsh-rc-pill', 'data-state': pill.state, title: pill.title }, pill.text)),
        h('div', { className: 'dsh-rc-hint', 'data-error': String(warn) }, hint));
    }

    function ReconPage({ appCtx }) {
      const tw = appCtx.locale.bind(NS);
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const alive = useRef(true);
      const [add, setAdd] = useState({ label: '', host: '', port: '' });
      const [addVpn, setAddVpn] = useState('');
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
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      // While a test of Tor runs, look again every second. Before the first return, so the hook order never changes.
      const testing = data?.tor?.test?.state === 'running' || data?.vpn?.test?.state === 'running' || data?.vpn?.status?.state === 'starting';
      useEffect(() => {
        if (!testing) return undefined;
        const timer = setInterval(() => void load(), 1000);
        return () => clearInterval(timer);
      }, [testing, load]);

      if (!data) {
        return h('div', { className: 'dsh-rc-page' }, h('style', null, CSS), h('h2', { className: 'dsh-rc-title' }, 'Recon'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dsh-rc-desc', 'data-error': 'false' }, 'Loading…')));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? tw('offer.on') : tw('offer.off'), error: false });
          setTimeout(() => void load(), 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not change it: ${String(problem?.message ?? problem)}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const tor = data.tor ?? {};
      const usenet = data.usenet ?? {};
      const more = data.more ?? {};
      const accounts = usenet.accounts ?? [];
      const save = async (values, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (alive.current) setNote({ text: done, error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${String(problem?.message ?? problem)}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      /** Save the accounts, and make sure the one server of older versions does not come back. */
      const saveAccounts = (next, done, more) => void save({ usenetAccounts: stored(next), usenetHost: '', ...(more ?? {}) }, done);
      const removeAccount = (account) => saveAccounts(
        accounts.filter((one) => one.id !== account.id),
        `Removed ${account.label || account.host}. Its login stays in the Keychain; to delete it, type this in the Terminal: ${account.removeCommand ?? ''}`,
        // The default account must not point at one that is gone.
        account.id === usenet.defaultAccount ? { usenetDefaultAccount: '' } : {},
      );
      const makeDefault = (account) => void save({ usenetDefaultAccount: account.id }, `${account.label || account.host} is the default account.`);
      const addPort = portOf(add.port);
      const addOk = HOST.test(add.host.trim().toLowerCase()) && addPort !== undefined && accounts.length < MAX;
      const addAccount = () => {
        const id = newId();
        const name = add.label.trim().slice(0, 40);
        const server = add.host.trim().toLowerCase();
        const values = { usenetAccounts: stored([...accounts, { id, label: name, host: server, port: addPort }]), usenetHost: '' };
        // The first account is the default one until the user picks another.
        if (!usenet.defaultAccount) values.usenetDefaultAccount = id;
        setAdd({ label: '', host: '', port: '' });
        void save(values, `Added ${name || server}. Store its login in the Keychain as shown, then it is ready.`);
      };
      const vpn = data.vpn ?? {};
      const vpns = Array.isArray(vpn.configs) ? vpn.configs : [];
      /** The configurations as the settings keep them: ids and names, in order. */
      const saveVpns = (next, done) => void save({ vpnConfigs: next.map((one) => ({ id: String(one.id), label: String(one.label ?? '') })) }, done);
      const moveVpn = (index, by) => {
        const next = [...vpns];
        const [one] = next.splice(index, 1);
        next.splice(Math.max(0, Math.min(next.length, index + by)), 0, one);
        saveVpns(next, `${one.name} is now ${index + by <= 0 ? 'the primary' : `backup ${index + by}`}.`);
      };
      const testVpn = async () => {
        try {
          const next = await call({ action: 'vpn-test' });
          if (alive.current) setData(next);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not test WireGuard: ${String(problem?.message ?? problem)}`, error: true });
        }
      };
      const testTor = async () => {
        try {
          const next = await call({ action: 'tor-test' });
          if (alive.current) setData(next);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not test Tor: ${String(problem?.message ?? problem)}`, error: true });
        }
      };
      const item = (text) => h('li', null, text);
      return h('div', { className: 'dsh-rc-page' }, h('style', null, CSS),
        h('h2', { className: 'dsh-rc-title' }, 'Recon'),
        h('p', { className: 'dsh-rc-desc' }, 'A sealed space, with its own mode, for research on .onion sites and Usenet text newsgroups. It searches and reads .onion sites through Tor and text newsgroups through your Usenet accounts, as text only.'),
        data.problem ? h('p', { className: 'dsh-rc-desc', 'data-error': 'true' }, data.problem) : null,
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, tw('offer.title')),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Adds the Recon mode and the Recon space beside Chat and Code. Threads started there are sealed for good.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(data.enabled), 'aria-label': tw('offer.title'), disabled: busy, onClick: () => void flip(!data.enabled) })),
        note.text ? h('p', { className: 'dsh-rc-desc', 'data-error': String(note.error) }, note.text) : null,

        // Hidden networks (the one Web selector, 18 November 2026): what only Recon reaches. Set up as before in
        // the groups below; a conversation picks which ones it uses with the Web button's ticks.
        h('div', { className: 'dsh-rc-group', 'data-rc-hidden-networks': '' }, 'Hidden networks: Tor, Usenet, I2P'),
        h('p', { className: 'dsh-rc-desc' }, 'Only Recon ever reaches these; no other space has them. Tor is set up under Connection, Usenet under Usenet, and what leaves Tor goes through WireGuard, all as before. Which of them a Recon thread uses is ticked on its Web button, under "Recon\'s networks", beside the same source ticks every thread has (verified sources, forums, your own other sources and so on). Your own other sources are set up on Settings → Web sources; only those with "May be used in Recon" switched on are read here, and only through WireGuard.'),
        h('div', { className: 'dsh-rc-row', 'data-rc-i2p': '' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'I2P'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Not set up yet. A later step adds it; until then its tick on the Web button is greyed out.'))),

        h('div', { className: 'dsh-rc-group' }, 'Connection'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Tor'),
            h('div', { className: 'dsh-rc-rowdesc' }, tor.path
              ? `Found: ${tor.path}${tor.version ? ` (version ${tor.version})` : ''}. Recon starts its own copy when it needs one and deletes its temporary folder when it stops.`
              : 'The tor program is not installed. Plus does not install it. In the Terminal: brew install tor'),
            tor.test?.text ? h('div', { className: 'dsh-rc-rowdesc', 'data-error': String(tor.test.state === 'failed') }, tor.test.state === 'running' ? `Connecting… ${tor.percent || 0}%` : tor.test.text) : null),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: !data.enabled || !tor.path || tor.test?.state === 'running', title: 'Connects this Mac to the Tor network, opens no site, then stops', onClick: () => void testTor() }, tor.test?.state === 'running' ? 'Testing…' : 'Test Tor')),
        h('p', { className: 'dsh-rc-desc' }, 'The test connects this Mac to the Tor network and opens no site. Your internet provider can see that Tor was used.'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Blocklist of banned sites'),
            h('div', { className: 'dsh-rc-rowdesc' }, data.blocklist?.size > 0
              ? `${data.blocklist.size.toLocaleString('en-US')} banned sites, fetched ${new Date(data.blocklist.at).toLocaleString('en-GB')}. Fetched again through Tor when it is older than a day.`
              : 'Not fetched yet. It is fetched through Tor before the first search or page. Without it nothing is searched or read.'))),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Search engine'),
            h('div', { className: 'dsh-rc-rowdesc' }, data.engine?.other && data.engine?.host
              ? `Another engine is set in the configuration file: ${data.engine.host}. The blocklist and the word screen still apply.`
              : `The built-in filtered index (Ahmia), at its .onion address: ${data.engine?.builtIn ?? ''}. It filters abuse material from its index. Another engine can be set in the configuration file (otherEngine, engineHost).`))),

        h('div', { className: 'dsh-rc-group' }, 'WireGuard'),
        h('p', { className: 'dsh-rc-desc' }, 'Everything Recon sends outside Tor (Internet Archive copies read directly, Usenet, and the ordinary web) goes through a WireGuard tunnel: the first configuration below that works, the others are backups, tried in order. Only Recon uses the tunnel; your Mac\'s own network is not changed. If none is set up or none works, nothing is sent, and a thread tells you so: typing /recon direct there allows direct connections for that thread (the sites then see this Mac\'s internet address), /recon block takes it back.'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'wireproxy'),
            h('div', { className: 'dsh-rc-rowdesc' }, vpn.bin
              ? `Found: ${vpn.bin}. It runs WireGuard for Recon alone, through a port on this Mac, while Recon uses it.`
              : 'The wireproxy program is not installed. Plus does not install it: download wireproxy for macOS from its releases page (github.com/pufferffish/wireproxy) and put it at /usr/local/bin/wireproxy, or give its place in the configuration file (wireproxyPath).'),
            vpn.status?.state === 'ready' ? h('div', { className: 'dsh-rc-rowdesc' }, `Running now: ${vpn.status.name}.`) : null,
            vpn.test?.text ? h('div', { className: 'dsh-rc-rowdesc', 'data-error': String(vpn.test.state === 'failed') }, vpn.test.state === 'running' ? 'Starting WireGuard…' : vpn.test.text) : null),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: !data.enabled || !vpn.bin || vpns.length === 0 || vpn.test?.state === 'running', title: 'Starts the tunnel with the first configuration that passes traffic, and leaves it running', onClick: () => void testVpn() }, vpn.test?.state === 'running' ? 'Testing…' : 'Test WireGuard')),
        vpns.map((one, index) => h('div', { key: one.id, className: 'dsh-rc-account' },
          h('div', { className: 'dsh-rc-rowtitle' }, one.name, h('span', { className: 'dsh-rc-tag' }, index === 0 ? 'primary' : `backup ${index}`)),
          h('div', { className: 'dsh-rc-rowdesc' }, one.stored
            ? 'Its file is in the Keychain. Recon reads it only to start the tunnel, writes it for that moment into a folder only you can open, and deletes it at once. It is never shown, logged or given to the model.'
            : 'Its file is not in the Keychain yet: this configuration is skipped until it is.'),
          h('div', { className: 'dsh-rc-actions' },
            index > 0 ? h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, onClick: () => moveVpn(index, -index) }, 'Make primary') : null,
            index > 0 ? h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, onClick: () => moveVpn(index, -1) }, 'Up') : null,
            index < vpns.length - 1 ? h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, onClick: () => moveVpn(index, 1) }, 'Down') : null,
            h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, title: 'Take it out of Settings. Its file stays in the Keychain.', onClick: () => saveVpns(vpns.filter((other) => other.id !== one.id), `Removed ${one.name}. Its file stays in the Keychain; to delete it, type this in the Terminal: ${one.removeCommand ?? ''}`) }, 'Remove')),
          one.stored
            ? h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To remove its file from the Keychain, type this in the Terminal:'), h('div', { className: 'dsh-rc-sql' }, one.removeCommand ?? ''))
            : h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To store its file, type this in the Terminal with the path of your WireGuard file (the .conf your VPN provider gave you) in place of ~/PATH/TO/YOUR-FILE.conf:'), h('div', { className: 'dsh-rc-sql' }, one.storeCommand ?? '')))),
        vpns.length < 20
          ? h('div', { className: 'dsh-rc-row' },
            h('div', { className: 'dsh-rc-rowtext' },
              h('div', { className: 'dsh-rc-rowtitle' }, vpns.length === 0 ? 'Add a WireGuard configuration' : 'Add a backup'),
              h('div', { className: 'dsh-rc-rowdesc' }, 'A name for it here; its file goes into the Keychain with the command shown once it is added.'),
              h('div', { className: 'dsh-rc-fields' },
                h('input', { className: 'dsh-rc-input', type: 'text', value: addVpn, placeholder: 'Name (for example the server\'s country)', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'New WireGuard configuration name', onChange: (event) => setAddVpn(event.target.value) }))),
            h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || !data.enabled, onClick: () => { const label = addVpn.trim().slice(0, 60); setAddVpn(''); saveVpns([...vpns, { id: `wg-${newId().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || Date.now().toString(36)}`, label }], `Added ${label || 'a WireGuard configuration'}. Store its file in the Keychain as shown.`); } }, 'Add'))
          : null,

        h('div', { className: 'dsh-rc-group' }, 'Usenet'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Connect to Usenet'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Off: Usenet is not reached at all. On: an encrypted connection to the news server of the account a request names, through the WireGuard tunnel (above), or straight only where a thread allowed it with /recon direct. The server knows that account, as with any newsreader. Tor is not used for Usenet.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(usenet.route === 'direct'), 'aria-label': 'Connect to Usenet', disabled: busy || !data.enabled, onClick: () => void save({ usenetRoute: usenet.route === 'direct' ? 'off' : 'direct' }, usenet.route === 'direct' ? 'Usenet is off.' : 'Usenet is on, through an encrypted connection over the WireGuard tunnel (or straight where a thread allowed /recon direct).') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, accounts.length === 1 ? 'Usenet account' : 'Usenet accounts'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Each account is a news server with its own login in the Keychain. A search or a read names the account to use; one that names none uses the default account, or the first. Up to ${MAX}.`))),
        accounts.map((account) => h(AccountRow, {
          key: account.id,
          account,
          busy,
          isDefault: account.id === (usenet.defaultAccount || accounts[0]?.id),
          onSave: (next) => saveAccounts(accounts.map((one) => (one.id === next.id ? next : one)), 'Saved.'),
          onDefault: () => makeDefault(account),
          onRemove: () => removeAccount(account),
        })),
        accounts.length < MAX
          ? h('div', { className: 'dsh-rc-row' },
            h('div', { className: 'dsh-rc-rowtext' },
              h('div', { className: 'dsh-rc-rowtitle' }, 'Add another account'),
              h('div', { className: 'dsh-rc-rowdesc' }, 'The server name your provider gives you, for encrypted connections. Each account needs its own login in the Keychain.'),
              h('div', { className: 'dsh-rc-fields' },
                h('input', { className: 'dsh-rc-input', type: 'text', value: add.label, placeholder: 'Name (optional)', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'New account name', onChange: (event) => setAdd({ ...add, label: event.target.value }) }),
                h('input', { className: 'dsh-rc-input', type: 'text', value: add.host, placeholder: 'news.example.com', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'New news server', onChange: (event) => setAdd({ ...add, host: event.target.value }) }),
                h('input', { className: 'dsh-rc-input dsh-rc-port', type: 'text', value: add.port, inputMode: 'numeric', placeholder: '563', spellCheck: false, 'aria-label': 'New port', onChange: (event) => setAdd({ ...add, port: event.target.value }) }))),
            h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || !addOk, onClick: addAccount }, 'Add'))
          : null,

        h('div', { className: 'dsh-rc-group' }, 'Missions'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Let a Mission check its work, without the internet'),
            h('div', { className: 'dsh-rc-rowdesc' }, more.longChecks === true
              ? 'On: after each step the Mission proves its work with a small command on its files (does the notes file exist, does it name the source). Mission runs it inside a macOS sandbox with no internet and no name lookups, unable to start another program or app, unable to read your home folder, and able to write only in the Mission\'s own folder in Recon\'s room. Mission\'s settings form says so before it starts.'
              : 'Off (the default): a Mission here runs no commands at all, as Recon always has. The reviewer judges each step by reading the files. On lets small checks run, with no internet and only in the Mission\'s own folder.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.longChecks === true), 'aria-label': 'Let a Mission check its work, without the internet', disabled: busy || !data.enabled, onClick: () => void save({ longChecks: more.longChecks !== true }, more.longChecks === true ? 'Missions in Recon run no commands again.' : 'Missions in Recon now check their work, without the internet.') })),

        h('div', { className: 'dsh-rc-group' }, 'More sources'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'The ordinary web'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Search the web (DuckDuckGo, then Mojeek, then Marginalia) and read its pages as text: forums, boards, blogs, news. With it, the back channels search engines miss, through their public read-only interfaces: 4chan and its archives (desuarchive, b4k, palanq), Reddit (PullPush, Arctic Shift), public Telegram channels, Hacker News, Lemmy, Mastodon hashtags, GitHub issues, and Have I Been Pwned\'s list of known breaches. Discord, Bluesky and paste searches need a login or a key, so they are only found through the web search. Only through the WireGuard tunnel above, or straight where a thread allowed /recon direct; never otherwise. Only addresses a search, a page or your own message showed are opened. The search engine sees the search words.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.web !== false), 'aria-label': 'The ordinary web', disabled: busy || !data.enabled, onClick: () => void save({ webOn: more.web === false }, more.web === false ? 'The ordinary web is on.' : 'The ordinary web is off.') })),
        h('p', { className: 'dsh-rc-desc' }, 'Two services on the normal web, reached only at their own addresses and as text. GDELT always goes through Recon\'s own Tor; the Internet Archive goes directly or through Tor, as set below. Both limit automated use, and more so through Tor: expect "asked to slow down" or "refused" now and then. Recon does not try another way.'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Internet Archive'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Dated copies of web pages (${more.archiveHost ?? ''}). The assistant can list the copies of a page and read one as text. This is the only way a page from the normal web is read in Recon. The Archive sees which page was asked for.`)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.archive === true), 'aria-label': 'Internet Archive', disabled: busy || !data.enabled, onClick: () => void save({ archiveOn: more.archive !== true }, more.archive === true ? 'The Internet Archive is off.' : 'The Internet Archive is on.') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Read Internet Archive copies directly (not through Tor)'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'On: the Archive\'s list of copies and the copies themselves are fetched from the Archive through the WireGuard tunnel (or straight where a thread allowed /recon direct), as text only, with the same filters and limits. Off: through Recon\'s Tor, where the Archive refuses most reads. GDELT and .onion sites always go through Tor.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.archiveDirect === true), 'aria-label': 'Read Internet Archive copies directly (not through Tor)', disabled: busy || !data.enabled, onClick: () => void save({ archiveDirect: more.archiveDirect !== true }, more.archiveDirect === true ? 'Internet Archive copies are read through Tor.' : 'Internet Archive copies are read through the WireGuard tunnel, not through Tor.') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'GDELT news index'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Where a topic was reported, worldwide (${more.newsHost ?? ''}). It gives titles, addresses, publishers and dates, not the articles; an article is read as an Internet Archive copy. GDELT allows one request every five seconds, and sees your search words come from Tor.`)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.news === true), 'aria-label': 'GDELT news index', disabled: busy || !data.enabled, onClick: () => void save({ newsOn: more.news !== true }, more.news === true ? 'GDELT is off.' : 'GDELT is on.') })),

        h('div', { className: 'dsh-rc-group' }, 'Export, and End and wipe'),
        h('ul', { className: 'dsh-rc-list' },
          item(`/recon export writes one text file with the research log, every source with its citation and text, and the assistant's notes. Everything from sources and from the assistant is quoted and marked as untrusted, so it cannot act as instructions if you give the file to another thread. Exports go to: ${data.exportFolder ?? ''}`),
          item('The export door: the Export… button in a Recon thread\'s chat box is the one way out, and only you can use it. It copies the newest report and the sources it cites (or the whole thread) as plain text, sources as citations only, never the text of a page, each marked origin: Recon, to a new thread in a mode you pick (Content first; never Recon), to a thread that exists, or to a folder. The window says what leaves and what never does before anything leaves. Afterwards, in every space, an onion address is never opened outside Recon, an address from the export only after you say yes, and nothing of it goes into Memory.'),
          item('/recon end confirm ends a thread for good (/recon end alone only asks): what it read is forgotten, Tor is stopped and its folder deleted, the thread is closed and its files are deleted. They do not go to the trash. An open thread is held by the app, so its files go as soon as the app lets go, at the latest at the next start.'),
          item(data.waitingToWipe > 0 ? `Waiting to be deleted: ${data.waitingToWipe} ended thread${data.waitingToWipe === 1 ? '' : 's'}.` : 'No ended thread is waiting to be deleted.'),
          item('Recon keeps no copy of its own. After a restart it rebuilds a thread\'s sources, the addresses it was shown and the assistant\'s notes from the saved thread, so earlier [S3] numbers, links and exports keep working. /recon end deletes the thread, and with it all of this.'),
          item(`Every Recon thread runs in Recon's own empty folder (${data.room ?? ''}), not in a folder of yours, so the model is told no path of yours. Start one with the New button in the Recon space. A Recon thread in another folder has its tools switched off.`)),

        h('div', { className: 'dsh-rc-group' }, 'What a Recon thread has'),
        h('ul', { className: 'dsh-rc-list' },
          item(`Only these tools: ${(data.tools ?? []).join(', ')}.`),
          item('No programs, no shell, no files, no memory, no skills and no Deep research. The ordinary web only through Recon\'s own web tools and the WireGuard tunnel. Helpers only in a Mission, inside Recon\'s rules.'),
          item('No project instructions, no AGENTS.md, no notes from other add-ons.'),
          item('It never changes space or mode in place. Move to in its ⋯ menu in the left panel opens it as a new, ordinary thread in the mode you pick, with this thread and a copy of its own files; this one stays here, unchanged. A thread in another space can never become a Recon thread.'),
          item('If Recon is switched off, its old threads stay locked with no tools at all.')),

        h('div', { className: 'dsh-rc-group' }, 'Searching and reading'),
        h('ul', { className: 'dsh-rc-list' },
          item('Text only. A page is asked for by itself: its pictures, scripts and styles are never requested, no cookies are kept, nothing is posted, nothing is logged in to.'),
          item('Only .onion addresses, and only ones that came from a search result, from a page already read, or from your own message.'),
          item('Filters: the filtered index, its blocklist of banned sites, and a word screen on searches, results, addresses and pages. A match is left out: not shown, not kept, not tried again. Only the count is reported. No filter is perfect.'),
          item('Every source gets a number like [S3], with its address, the time it was retrieved and a fingerprint of its text. Ask the assistant to cite a source, or type /recon log for every search and source.'),
          item('What was read is kept in memory while the app runs, and in the thread itself. After a restart, Recon rebuilds the sources from the thread the first time it is used; a source whose whole text is no longer in the thread is read again when more of it is needed. /recon stop stops Tor.')),

        h('div', { className: 'dsh-rc-group' }, 'Models'),
        h('ul', { className: 'dsh-rc-list' },
          item('A model on this Mac or in your own network gets what Recon finds without a question.'),
          item('Any other model counts as cloud. What it gets is set just below: by default Recon hands over nothing until you type /recon cloud in that thread. The agreement holds for that thread and that model, and is forgotten when the app is closed.'),
          item('A thread that already holds what Recon found takes no step on a cloud model you did not agree to, also after switching models, in a Rerun copy, or once its history was condensed. The step stops with a message; nothing is sent. Condensing a long thread itself sends the history to the model the app uses for condensing, which Recon does not check: use a local one for it.'),
          item('Your own questions go to whichever model you picked, as in every space.'),
          item('Type /recon in a Recon thread to see its model and what is allowed.')),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Cloud models'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Whether a model outside your own machines gets what Recon finds. Ask each time (the default): only after you type /recon cloud in that thread. Always: without asking, in every Recon thread. Never: not even after /recon cloud. A model on this Mac or in your own network always gets it.')),
          h('div', { className: 'dsh-rc-btns', role: 'radiogroup', 'aria-label': 'Cloud models' },
            [['ask', 'Ask each time'], ['always', 'Always'], ['never', 'Never']].map(([value, label]) => h('button', {
              key: value, type: 'button', role: 'radio', className: 'dsh-rc-btn', 'aria-checked': String((data.cloudModels ?? 'ask') === value), 'data-on': String((data.cloudModels ?? 'ask') === value), disabled: busy || !data.enabled,
              onClick: () => void save({ cloudModels: value }, value === 'always' ? 'Cloud models get what Recon finds without asking.' : value === 'never' ? 'Cloud models never get what Recon finds.' : 'Cloud models get what Recon finds only after /recon cloud in that thread.'),
            }, label)))),

        h('div', { className: 'dsh-rc-group' }, 'Good to know'),
        h('ul', { className: 'dsh-rc-list' },
          item('Until you end it with /recon end, the app keeps a Recon thread on disk like any other, and writes its title with the model set for titles.'),
          item('Add-ons from other makers are not covered by these rules. Plus\'s own add-ons are.'),
          item('Usenet: text newsgroups only. Groups that hold files are never listed or opened, file postings are skipped, and an article that carries a file is refused before its text is fetched. Usenet has no full-text search: subject, author and date are matched.'),
          item('Not built yet: saved searches.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'recon', order: 114, label: () => t('section.title') }, (props) => h(ReconPage, { ...props, appCtx: ctx }))),
        );
        // The start page's status bar; it shows only while the Recon tab is selected.
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'recon-bar', order: 43 }, (props) => h(ReconBar, { sessionId: props?.sessionId }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'recon-export', order: -17, label: () => 'Export' }, (props) => h(ExportDoor, { sessionId: props?.sessionId, appCtx: ctx }))));
      },
    };
  },
});
