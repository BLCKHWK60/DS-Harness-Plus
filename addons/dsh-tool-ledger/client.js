/**
 * Browser half of the Tool ledger: the "Tool use" page in Settings.
 * Reads the fenced `GET dsh-tool-ledger/summary` route (same origin, login cookie), saves its two settings through
 * the app's settings service, and offers the records as a table file (`GET dsh-tool-ledger/export`). The one thing it
 * changes is "Start fresh" (`POST dsh-tool-ledger/clear`), and only after asking. Suggestion buttons only open the
 * right Settings page; nothing changes there without the owner's own click.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-tool-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;
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
    // ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips, (i) pop-up, state line, error note); the same block in every page file that uses it.
    // The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
    // All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
    // React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
    // Pass ReactDOM too (`dshUi.makeParts(React, ReactDOM)`) where an (i) needs `portal: true` (its pop-up then goes to the page body).
    const dshUi = (() => {
      const STYLE_ID = 'dsh-ui-style';
      const CSS = `
    .dshu-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
    .dshu-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
    .dshu-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dshu-group { margin: 24px 0 8px; font-size: 12px; line-height: 18px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
    .dshu-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
    .dshu-rowtext { flex: 1; min-width: 0; }
    .dshu-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
    .dshu-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-side { flex: none; display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    @media (max-width: 560px) { .dshu-row { flex-wrap: wrap; } .dshu-side { margin-left: auto; } }
    .dshu-btn { flex: none; height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
    .dshu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-btn:disabled { opacity: .5; cursor: default; }
    .dshu-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dshu-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dshu-field { flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dshu-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dshu-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
    .dshu-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); }
    .dshu-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
    .dshu-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
    .dshu-switch[data-danger="true"][aria-checked="true"] { background: var(--dsw-alias-state-error-primary); }
    .dshu-switch:disabled { opacity: .5; cursor: default; }
    @media (prefers-reduced-motion: no-preference) { .dshu-switch { transition: background .12s ease; } .dshu-switch::after { transition: transform .12s ease; } }
    .dshu-btn:focus-visible, .dshu-switch:focus-visible, .dshu-chip:focus-visible, .dshu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dshu-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 16px 0 0; padding: 16px; border-radius: 20px; border: 0.5px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
    .dshu-empty-title { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
    .dshu-empty-text { margin: 0; overflow-wrap: anywhere; }
    .dshu-empty .dshu-chips { margin-top: 8px; }
    .dshu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .dshu-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dshu-chip:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dshu-wait { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dshu-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .dshu-infowrap { display: inline-flex; vertical-align: middle; margin-left: 4px; }
    .dshu-info { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
    .dshu-info:hover, .dshu-info[aria-expanded="true"] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-info svg { display: block; width: 12px; height: 12px; }
    .dshu-info:focus-visible, .dshu-pop:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dshu-pop { position: fixed; z-index: 2147482000; box-sizing: border-box; width: max-content; max-width: min(320px, calc(100vw - 16px)); overflow: auto; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font-size: 12px; line-height: 18px; font-weight: 400; text-align: left; text-transform: none; white-space: normal; overflow-wrap: anywhere; cursor: auto; }
    .dshu-pop:focus:not(:focus-visible) { outline: none; }
    .dshu-pop-title { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 600; }
    .dshu-pop-line { margin: 6px 0 0; }
    .dshu-pop-title + .dshu-pop-line { margin-top: 0; }
    .dshu-pop-head { display: block; font-weight: 600; color: var(--dsw-alias-label-secondary); }
    .dshu-state { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
    .dshu-state-dot { flex: none; align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
    .dshu-state[data-state="ok"] .dshu-state-dot { background: var(--dsw-alias-state-success-primary); }
    .dshu-state[data-state="busy"] .dshu-state-dot { background: var(--dsw-alias-brand-primary); }
    .dshu-state[data-state="warn"] .dshu-state-dot { background: var(--dsw-alias-state-warn-primary); }
    .dshu-state[data-state="error"] .dshu-state-dot { background: var(--dsw-alias-state-error-primary); }
    .dshu-state[data-state="off"] .dshu-state-dot { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-label-secondary); }
    .dshu-state-next { color: var(--dsw-alias-label-secondary); }
    .dshu-errnote { margin: 8px 0 0; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
    .dshu-errnote-what { margin: 0; color: var(--dsw-alias-state-error-primary); }
    .dshu-errnote-fix { margin: 2px 0 0; color: var(--dsw-alias-label-primary); }
    .dshu-errnote-act { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
    .dshu-errnote-act .dshu-link { font-size: 12px; }
    .dshu-errnote-details { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-secondary); font: 11px/16px ui-monospace, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; user-select: text; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Copies text and says so. Resolves true when it worked. */
      const copyText = async (text) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(String(text)); return true; }
        } catch { /* fall through to the old way */ }
        try {
          const area = document.createElement('textarea');
          area.value = String(text);
          area.setAttribute('readonly', '');
          area.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(area);
          area.select();
          const done = document.execCommand('copy');
          area.remove();
          return done === true;
        } catch { return false; }
      };

      /** The three fixed heads of an (i) pop-up, in this order. `changes` is accepted as another name for `change`. */
      const INFO_HEADS = [['what', 'What it does'], ['when', 'When to use it'], ['change', 'If you change it']];
      /** The same heads, and the button's "About". Plus is English only: every page gets these words. */
      const INFO_WORDS = {
        en: { what: 'What it does', when: 'When to use it', change: 'If you change it', about: (name) => (name ? `About ${name}` : 'About this') },
      };
      /** @returns {object} the (i)'s fixed words. `lang` is still accepted (older callers pass it) but every language gets English. */
      const infoWords = () => INFO_WORDS.en;
      /** What an (i) pop-up shows: the title and only the lines that were given. `lang` is accepted and ignored (English only). */
      const infoLines = ({ title, label, what, when, change, changes } = {}) => {
        const given = { what, when, change: change ?? changes };
        const words = infoWords();
        const blank = (v) => v == null || v === false || (typeof v === 'string' && v.trim() === '');
        return {
          title: blank(title) ? (blank(label) ? '' : label) : title,
          lines: INFO_HEADS.filter(([key]) => !blank(given[key])).map(([key]) => ({ key, head: words[key], text: given[key] })),
        };
      };

      /**
       * Where a pop-up goes: below its button, or above when there is more room there; its left edge follows the button
       * and is pulled in so the whole panel stays on screen. Sizes in pixels; returns { top, left, side, maxHeight }.
       */
      const placePop = ({ anchor, pop, view, gap = 6, margin = 8 }) => {
        const below = view.height - anchor.bottom - gap - margin;
        const above = anchor.top - gap - margin;
        const side = pop.height <= below || below >= above ? 'below' : 'above';
        const maxHeight = Math.max(80, Math.floor(side === 'below' ? below : above));
        const height = Math.min(pop.height, maxHeight);
        const top = side === 'below' ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height);
        const left = Math.max(margin, Math.min(anchor.left, view.width - margin - pop.width));
        return { top: Math.round(top), left: Math.round(left), side, maxHeight };
      };

      /**
       * A failed call as { text, details }: the plain sentence and the raw text. Uses the error helper's wording
       * (dshKit.plain) when the page also carries the dsh-kit block, so the two never say different things.
       */
      const explainError = (raw) => {
        try {
          // eslint-disable-next-line no-undef
          if (typeof dshKit !== 'undefined' && dshKit && typeof dshKit.plain === 'function') return dshKit.plain(raw);
        } catch { /* no error helper on this page */ }
        const message = typeof raw === 'string' ? raw : String(raw?.message ?? raw?.error ?? '');
        const details = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : message;
        // A message that reads as a sentence is said as it is (as the error helper does); a bare code is not.
        const said = message.trim();
        if (/\s/.test(said) && !/^[a-z][\w-]*(?:\/[\w.-]+)+:/i.test(said)) return { text: said, details: details === message ? '' : details };
        return { text: 'Something went wrong. Try again; the Details say what the app reported.', details };
      };

      /** Raw details as text to show behind Details. */
      const detailText = (details) => {
        if (details == null || details === '') return '';
        if (typeof details === 'string') return details;
        if (details instanceof Error) return details.stack || String(details.message);
        try { return JSON.stringify(details, null, 2); } catch { return String(details); }
      };

      let infoCount = 0;

      /**
       * The words of a row title for its (i): the text itself, or the text written directly inside a simple element
       * title (`h('span', null, 'Keep awake', badge)` gives "Keep awake"; the badge is left out). Anything else gives
       * undefined: then pass `info.label`, or the (i) is only "About this".
       */
      const plainTitle = (title) => {
        if (typeof title === 'string') return title;
        if (typeof title === 'number') return String(title);
        if (!title || typeof title !== 'object') return undefined;
        const kids = [].concat(title.props?.children ?? title.children ?? []);
        const text = kids.filter((kid) => typeof kid === 'string' || typeof kid === 'number').join(' ').replace(/\s+/g, ' ').trim();
        return text || undefined;
      };

      const makeParts = (React, ReactDOM) => {
        ensureStyle();
        // The pop-up of an (i) with `portal: true` is drawn in the page body, out of a box that clips it or moves fixed
        // children (a header with container-type, say). Without ReactDOM it stays where it is, as before.
        const portalTo = (node) => (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(node, document.body) : node);
        const h = React.createElement;
        /** The page frame: a title, one sentence under it, then the page. */
        const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
          title ? h('h2', { className: 'dshu-title' }, title) : null,
          desc ? h('p', { className: 'dshu-desc' }, desc) : null,
          children);
        const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
        /** A short line in the page's description style; `error` draws it in the error colour. */
        const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
        /** One setting: text on the left, the control(s) on the right. `info` ({ what, when, change }) adds an (i) after the title. */
        const Row = ({ title, desc, info, children }) => h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, title, info ? h(Info, { title: plainTitle(title), ...info }) : null),
            desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
          children);
        const Side = ({ children }) => h('div', { className: 'dshu-side' }, children);
        /** `danger`: when it is on, the switch is drawn in the error colour (a safety rule that has been turned off). */
        const Switch = ({ on, label, onChange, disabled, danger }) => h('button', {
          type: 'button', role: 'switch', className: 'dshu-switch', 'data-danger': danger ? 'true' : undefined, 'aria-checked': on === true, 'aria-label': label, disabled: disabled === true, onClick: () => onChange(!on),
        });
        const Button = ({ main, danger, children, ...rest }) => h('button', { type: 'button', className: 'dshu-btn', 'data-main': main ? 'true' : undefined, 'data-danger': danger ? 'true' : undefined, ...rest }, children);
        const Field = (props) => h('input', { className: 'dshu-field', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', ...props });
        /** A button that copies `text` and shows "Copied" for a moment (a timer only while it is showing). */
        const CopyButton = ({ text, label = 'Copy', ...rest }) => {
          const [done, setDone] = React.useState(false);
          const timer = React.useRef(0);
          React.useEffect(() => () => clearTimeout(timer.current), []);
          return h(Button, { ...rest, 'aria-live': 'polite', onClick: async () => {
            if (await copyText(typeof text === 'function' ? text() : text)) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1500); }
          } }, done ? 'Copied' : label);
        };
        /** A row of small choices (starter chips). `items` are strings or { label, value }; `onPick(value)`. */
        const Chips = ({ items, onPick, label }) => h('div', { className: 'dshu-chips', role: 'group', 'aria-label': label ?? 'Suggestions' },
          items.map((item) => { const entry = typeof item === 'string' ? { label: item, value: item } : item; return h('button', { key: entry.label, type: 'button', className: 'dshu-chip', onClick: () => onPick(entry.value ?? entry.label) }, entry.label); }));
        /** What a list shows when it has nothing yet: what it is for, then what to do first (optionally as starter chips). */
        const Empty = ({ title, text, chips, onPick, children }) => h('div', { className: 'dshu-empty', role: 'status' },
          title ? h('p', { className: 'dshu-empty-title' }, title) : null,
          text ? h('p', { className: 'dshu-empty-text' }, text) : null,
          chips && chips.length > 0 ? h(Chips, { items: chips, onPick: onPick ?? (() => {}) }) : null,
          children);
        const Wait = ({ children }) => h('p', { className: 'dshu-wait', role: 'status' }, children ?? 'Loading…');

        const useLayout = React.useLayoutEffect ?? React.useEffect;
        // The (i) drawn as a ring with an "i" in the text colour, like the app's own info icon.
        const infoIcon = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' },
          h('circle', { cx: 8, cy: 8, r: 6.6 }),
          h('path', { d: 'M8 7.3v4' }),
          h('circle', { cx: 8, cy: 4.9, r: 0.45, fill: 'currentColor' }));
        /**
         * A small (i) button that opens a pop-up saying what a control does, when to use it and what changes if you change it.
         * `title` is the bold first line, `label` names the control for screen readers ("About <label>"; defaults to the title).
         * Opens on click, Enter or Space; Esc, a click outside or Tab away closes it; Esc puts the focus back on the (i).
         * `more` is one last line, or a list of lines. `portal: true` draws the pop-up in the page body (needs ReactDOM in makeParts).
         * `lang` is accepted and ignored: the heads and button name are always English.
         */
        const Info = (props) => {
          const { label, more, side, portal } = props;
          const extra = (Array.isArray(more) ? more : [more]).filter((line) => line != null && line !== false && line !== '');
          const { title, lines } = infoLines(props);
          const [open, setOpen] = React.useState(false);
          const [place, setPlace] = React.useState(null);
          const wrap = React.useRef(null);
          const button = React.useRef(null);
          const pop = React.useRef(null);
          const autoId = React.useId ? React.useId() : null;
          const fallbackId = React.useRef(null);
          if (!autoId && fallbackId.current == null) { infoCount += 1; fallbackId.current = `dshu-info-${infoCount}`; }
          const id = `dshu-pop-${String(autoId ?? fallbackId.current).replace(/[^\w-]/g, '')}`;
          const name = label ?? (typeof title === 'string' ? title : '');
          const about = infoWords().about;
          const measure = () => {
            const b = button.current; const p = pop.current;
            if (!b || !p || typeof window === 'undefined') return;
            const r = b.getBoundingClientRect();
            const found = placePop({ anchor: r, pop: { width: p.offsetWidth, height: p.scrollHeight }, view: { width: window.innerWidth, height: window.innerHeight } });
            // `side: 'above'` asks for the top first; it still flips when it does not fit.
            setPlace(side === 'above' && r.top - 6 - 8 >= p.scrollHeight ? { ...found, side: 'above', top: Math.round(r.top - 6 - p.scrollHeight) } : found);
          };
          useLayout(() => {
            if (!open) { setPlace(null); return undefined; }
            measure();
            try { pop.current?.focus({ preventScroll: true }); } catch { /* the panel is gone */ }
            return undefined;
          }, [open]);
          React.useEffect(() => {
            if (!open || typeof document === 'undefined') return undefined;
            // The pop-up may sit in the page body (portal): a click in it is not outside.
            const inPop = (node) => Boolean(pop.current) && typeof pop.current.contains === 'function' && pop.current.contains(node);
            const inside = (node) => Boolean(node) && ((wrap.current && wrap.current.contains(node)) || inPop(node));
            const onDown = (event) => { if (wrap.current && !inside(event.target)) setOpen(false); };
            const onKey = (event) => {
              if (event.key !== 'Escape') return;
              // Only while the focus is in the (i) or its pop-up; then only the pop-up closes, not the dialog or menu
              // around it. On the window, first in the capture phase, so it runs before the panels' own Esc listeners
              // on the document; stopImmediatePropagation keeps every later listener from seeing it.
              const focused = typeof document !== 'undefined' ? document.activeElement : null;
              if (!wrap.current || !focused || !inside(focused)) return;
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
              setOpen(false);
              try { button.current?.focus(); } catch { /* the button is gone */ }
            };
            const onMove = () => measure();
            document.addEventListener('pointerdown', onDown, true);
            window.addEventListener('keydown', onKey, true);
            window.addEventListener('resize', onMove);
            window.addEventListener('scroll', onMove, true);
            return () => {
              document.removeEventListener('pointerdown', onDown, true);
              window.removeEventListener('keydown', onKey, true);
              window.removeEventListener('resize', onMove);
              window.removeEventListener('scroll', onMove, true);
            };
          }, [open]);
          // Clicks inside never reach a row or menu item the (i) sits in; nor do the keys such a row or menu acts on.
          const stop = (event) => { event.stopPropagation(); };
          const stopKeys = (event) => { if (['Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation(); };
          return h('span', {
            ref: wrap, className: 'dshu-infowrap', onClick: stop, onPointerDown: stop, onMouseDown: stop, onKeyDown: stopKeys,
            onBlur: (event) => { if (open && wrap.current && event.relatedTarget && !wrap.current.contains(event.relatedTarget) && !(pop.current && typeof pop.current.contains === 'function' && pop.current.contains(event.relatedTarget))) setOpen(false); },
          },
          h('button', {
            ref: button, type: 'button', className: 'dshu-info', 'aria-label': about(name), 'aria-expanded': open,
            'aria-haspopup': 'dialog', 'aria-controls': open ? id : undefined, onClick: () => setOpen(!open),
          }, infoIcon()),
          open ? (portal ? portalTo : (node) => node)(h('div', {
            ref: pop, id, className: 'dshu-pop', role: 'dialog', tabIndex: -1, 'data-side': place?.side,
            'aria-label': title ? undefined : about(name), 'aria-labelledby': title ? `${id}-t` : undefined,
            style: place ? { top: place.top, left: place.left, maxHeight: place.maxHeight } : { top: 0, left: 0, visibility: 'hidden' },
          },
          title ? h('p', { id: `${id}-t`, className: 'dshu-pop-title' }, title) : null,
          lines.map((line) => h('p', { key: line.key, className: 'dshu-pop-line' }, h('span', { className: 'dshu-pop-head' }, line.head), line.text)),
          extra.map((line, index) => h('p', { key: `more-${index}`, className: 'dshu-pop-line' }, line)))) : null);
        };

        const STATES = ['ok', 'busy', 'idle', 'off', 'warn', 'error'];
        /**
         * One line that says in words what is happening and what to do next: a coloured dot, `words`, then `next`
         * (text or a button). `state` is ok, busy, idle, off, warn or error; anything else counts as idle.
         * `live: false` keeps the line out of screen readers' announcements (for words that change every few
         * seconds, such as a step count); then announce only the changes that matter somewhere else.
         */
        const StateLine = ({ state, words, next, live = true, children }) => {
          const shown = STATES.includes(state) ? state : 'idle';
          return h('p', { className: 'dshu-state', 'data-state': shown, role: live === false ? undefined : shown === 'error' ? 'alert' : 'status' },
            h('span', { className: 'dshu-state-dot', 'aria-hidden': 'true' }),
            words ? h('span', { className: 'dshu-state-words' }, words) : null,
            next ? h('span', { className: 'dshu-state-next' }, next) : null,
            children);
        };

        /**
         * An error in plain words: what went wrong (`what`), what to do or click (`fix`, and any buttons as children),
         * and the raw text only behind a Details toggle. Give `error` instead of `what` to word a failed call the way
         * the error helper does; `details` (text or an object) wins over the raw text it keeps.
         */
        const ErrorNote = ({ what, fix, details, error, children }) => {
          const [open, setOpen] = React.useState(false);
          const hasError = error !== undefined && error !== null && error !== '';
          const fromError = hasError ? explainError(error) : { text: '', details: '' };
          // With your own `what`, the raw error itself goes behind Details.
          const rawError = hasError ? (fromError.details || (typeof error === 'string' ? error : error.details || error.message || error)) : '';
          const text = what || fromError.text;
          const raw = detailText(details ?? (what ? rawError : fromError.details));
          if (!text && !fix && !raw) return null;
          return h('div', { className: 'dshu-errnote', role: 'alert' },
            h('p', { className: 'dshu-errnote-what' }, text || 'Something went wrong.'),
            fix ? h('p', { className: 'dshu-errnote-fix' }, fix) : null,
            children || raw ? h('div', { className: 'dshu-errnote-act' },
              children,
              raw ? h('button', { type: 'button', className: 'dshu-link', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null) : null,
            open && raw ? h('pre', { className: 'dshu-errnote-details' }, raw) : null);
        };
        return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait, Info, StateLine, ErrorNote };
      };
      return { makeParts, ensureStyle, copyText, infoLines, placePop, explainError };
    })();
    // ---- dsh-ui:end ----

    const NS = 'tool-ledger';
    const RANGES = [['30d', 'Last 30 days'], ['6m', 'Last 6 months'], ['all', 'All']];
    const KEEP = [[30, '30 days'], [90, '90 days'], [182, '6 months'], [365, '1 year'], [730, '2 years'], [1825, '5 years'], [3650, '10 years']];
    const STATE_WORDS = { on: 'On', ask: 'Ask', off: 'Off', locked: 'Locked' };
    /** Who refused, in plain words, and which page holds that setting. */
    const RULES = {
      'web-sources': ['its address is of a kind not ticked in Web sources', 'web-sources', 'Web sources'],
      'web-off': ['Web is off in this thread', 'modes', 'Modes'],
      secrets: ['it named where your secrets are kept', 'web-sources', 'Web sources'],
      'no-programs': ['this mode has no tools a program could use', 'modes', 'Modes'],
      isolated: ['this mode keeps to its own tools', 'modes', 'Modes'],
      'depth-check': ['the check before finishing does not start work over', 'modes', 'Modes'],
      'skill-off': ['the skill is switched off in this mode', 'modes', 'Modes'],
      'one-model': ['this thread uses one model for everything', 'modes', 'Modes'],
      'not-offered': ['this mode does not offer it', 'tool-access', 'Tool access'],
      approval: ['you said no', 'tool-access', 'Tool access'],
      'approval-cancelled': ['the question was cancelled', 'tool-access', 'Tool access'],
      'no-approval-channel': ['nobody could be asked', 'tool-access', 'Tool access'],
      denied: ['you said no', 'tool-access', 'Tool access'],
      timeout: ['nobody answered in time', 'tool-access', 'Tool access'],
      unavailable: ['nobody could be asked', 'tool-access', 'Tool access'],
      unattended: ['nobody was there to ask', 'tool-access', 'Tool access'],
      off: ['Tool access is off', 'tool-access', 'Tool access'],
      'mission-conductor': ['a Mission run leaves that work to its helpers', '', ''],
      // Mission stage D (20 November): helpers at once, approvals parked in the Mission's card, one writer per file.
      'mission-approval': ['it waits for your yes in the Mission\'s card', '', ''],
      'mission-file-held': ['another helper of the Mission was changing that file', '', ''],
      'mission-folder-busy': ['another helper\'s command was changing files', '', ''],
      'mission-said-no': ['you said no to it earlier in the Mission', '', ''],
      'mission-outside-change': ['a Mission\'s helpers cannot change anything outside the folder', '', ''],
      'mission-item-tool': ['it was allowed for another item of the Mission only', '', ''],
      'mission-background': ['several helpers work at once, so a command that may change files must run in the foreground', '', ''],
      'mission-not-asked': ['it needed your yes, and this Mission runs on Full auto, which never asks', '', ''],
      // Mission stage E (20 November): the repair helper's own limits, and the assistant while a Mission is paused.
      'mission-repair': ['the Mission\'s repair helper may not ask for more access, start helpers or work in the background', '', ''],
      'mission-assistant': ['a Mission is paused in this thread, and its settings let the assistant only talk or look things up', '', ''],
      unknown: ['another add-on refused it', '', ''],
      executor: ['the app refused it', '', ''],
      // Answers to the assistant's request for a tool (the codes of Tool access), each under its own key.
      'request:unknown': ['it asked for a tool that does not exist', '', ''],
      'request:self': ['it asked for a tool it already had', '', ''],
      'request:tools-off': ['tools were switched off in that thread', '', ''],
      'request:locked': ['this mode has fixed tools', 'modes', 'Modes'],
      'request:never': ['only you can switch it on, in Settings', 'tool-access', 'Tool access'],
      'request:addon-off': ['the add-on that brings it is switched off', '', ''],
      'request:recon-limit': ['Recon only allows tools that stay on this Mac', '', ''],
      'request:already': ['it was already on', '', ''],
      'request:off': ['you switched it off in this mode', 'tool-access', 'Tool access'],
      'request:access-off': ['Tool access was switched off', 'tool-access', 'Tool access'],
      'request:fenced': ['another setting keeps it out, for example Web off', 'modes', 'Modes'],
      'request:dont-ask': ['you chose not to be asked again', 'tool-access', 'Tool access'],
      'request:denied-recently': ['you said no a moment before', 'tool-access', 'Tool access'],
      'request:unanswered-recently': ['nobody answered a moment before', 'tool-access', 'Tool access'],
      'request:parked': ['it waits for your yes in the Mission\'s card', '', ''],
      'request:once-only': ['it can only be allowed one call at a time, which a Mission\'s helper cannot wait for', '', ''],
      'request:not-asked': ['a Mission on Full auto never asks for your yes', '', ''],
      'request:too-many-noes': ['you had already said no to several requests', 'tool-access', 'Tool access'],
      'request:helper-limit': ['a helper that reads web pages may only ask for tools that look or read', '', ''],
      'request:recon-export': ['the thread holds material from Recon', '', ''],
      'request:too-many': ['too many requests were waiting for you', '', ''],
      'request:unattended': ['nobody was there to ask', 'tool-access', 'Tool access'],
      'request:cancelled': ['the turn was stopped', '', ''],
      'request:timeout': ['nobody answered in time', 'tool-access', 'Tool access'],
      'request:unavailable': ['nobody could be asked', 'tool-access', 'Tool access'],
      'request:denied': ['you said no', 'tool-access', 'Tool access'],
      'request:error': ['the request could not be made', '', ''],
    };
    /** What each control and list on the page does, for its (i). */
    const INFO = {
      record: {
        what: 'Notes each tool the assistant uses, asks for or is refused, in every mode and helper. Only names and counts, never what a tool was given or gave back.',
        when: 'Keep it on to see which tools each mode really needs.',
        change: 'Off: nothing new is noted, and what was noted stays. You can switch it on again at any time.',
      },
      keep: {
        what: 'How long records are kept. Older months are removed once a day.',
        when: 'A longer time to compare many months; a shorter one to keep less.',
        change: 'A shorter time removes the older months for good at the next clean-up. A longer time keeps what is still there.',
      },
      range: {
        what: 'Which period the lists and the table count, and which records Save a copy downloads.',
        when: 'Last 30 days for how things are now; All for everything kept.',
        change: 'Only changes what this page shows. No record changes.',
      },
      tab: {
        what: 'Shows the lists and the table for one mode only. All modes shows every mode together.',
        when: 'When you tune the tools of one mode.',
        change: 'Only changes what this page shows. Save a copy still holds every mode.',
      },
      refresh: {
        what: 'Reads the records again.',
        when: 'After using the assistant while this page was open. The page also reads them again when you come back to this window.',
      },
      csv: {
        what: 'Downloads the records of the chosen period as a table file.',
        when: 'To open them in a spreadsheet or in Data mode.',
        change: 'Nothing changes here. The records stay.',
      },
      json: {
        what: 'Downloads the same records as a data file.',
        when: 'For another app or tool that reads data files.',
        change: 'Nothing changes here. The records stay.',
      },
      fresh: {
        what: 'Removes every tool record, for every mode. Your settings stay as they are.',
        when: 'When a test period is over, or to count from today.',
        change: 'It asks first. Removed records cannot be brought back, so save a copy first if you want them.',
      },
      asked: {
        what: 'Tools the assistant asked for, or tried while they were Off or not on offer in that mode, at least twice. Mission\'s step tool is left out when the mode did not offer it, because it is only offered while a Mission runs.',
        when: 'To find a tool a mode is missing.',
        change: 'The button opens Tool access, where you can switch the tool on for that mode. This list changes nothing by itself.',
      },
      idle: {
        what: 'Tools on offer in at least 3 threads or helpers of a mode that the assistant never got to use there: it never called them, or every call was stopped or turned down.',
        when: 'To trim a mode. Fewer tools on offer leave the assistant more room.',
        change: 'The button opens Tool access, where you can switch the tool off for that mode. This list changes nothing by itself.',
      },
      reserve: {
        what: 'Tools a mode keeps in reserve that the assistant fetched in at least half of its threads and helpers.',
        when: 'To choose which tools should be on offer from the start.',
        change: 'The button opens Modes, where "Load tools as needed" is. This list changes nothing by itself.',
      },
      refused: {
        what: 'Calls that a rule stopped, or that you said no to or did not answer, with the reason. Mission\'s step tool is left out when the mode did not offer it, because it is only offered while a Mission runs. When something else stopped it, it is listed.',
        when: 'To find a rule that gets in the way more than it should.',
        change: 'The button opens the page that holds the rule. This list changes nothing by itself.',
      },
      every: {
        what: 'Each tool with how often it was called, ran, failed, was refused, or needed your answer.',
        when: 'To see the whole picture. Use the mode filter for one mode.',
      },
    };
    const ruleWords = (rule) => RULES[rule]?.[0] ?? (String(rule ?? '').startsWith('request:') ? 'its request was not granted' : 'a rule refused it');

    const CSS = `
.dsh-tl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 20px 0 4px; }
.dsh-tl-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-tl-seg button { height: 28px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-tl-seg button[aria-pressed="true"] { background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); }
.dsh-tl-seg button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-tl-select { flex: none; width: auto; min-width: 140px; }
.dsh-tl-spacer { flex: 1; }
.dsh-tl-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-tl-tool { font-variant-numeric: tabular-nums; }
.dsh-tl-name { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); margin-left: 6px; }
.dsh-tl-more { margin-top: 8px; }
.dsh-tl-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dsh-tl-table th { text-align: right; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 0 0 8px 10px; white-space: nowrap; }
.dsh-tl-table th:first-child, .dsh-tl-table td:first-child { text-align: left; padding-left: 0; }
.dsh-tl-table td { text-align: right; padding: 8px 0 8px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.dsh-tl-table td:first-child { overflow-wrap: anywhere; }
.dsh-tl-zero { color: var(--dsw-alias-label-secondary); }
.dsh-tl-link { display: inline-flex; align-items: center; box-sizing: border-box; text-decoration: none; }
`;
    const ensureStyle = () => {
      if (typeof document === 'undefined' || document.getElementById('dsh-tl-style')) return;
      const style = document.createElement('style');
      style.id = 'dsh-tl-style';
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    };

    /** Open a Settings page: through Settings Plus when it is there, else through the Settings window's own store. */
    function openPage(appCtx, id, label) {
      try {
        if (typeof window !== 'undefined' && typeof window.__dshSettingsPlus?.openPage === 'function' && window.__dshSettingsPlus.openPage(appCtx, id, label) === true) return true;
        const actions = appCtx.slots.entries('sidebar.settings').find((item) => item.store)?.store?.create?.()?.actions;
        if (typeof actions?.openSection === 'function') { actions.openSection(id); return true; }
        if (typeof actions?.select === 'function') { actions.select(id); return true; }
      } catch {
        /* the button's words say where to go */
      }
      return false;
    }

    async function loadSettings(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }
    async function setSetting(ctx, field, value) {
      const ops = [{ op: 'set', path: [field], value }];
      let result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await loadSettings(ctx)).revision);
      if (!result.ok) throw dshKit.fail(result.error);
    }

    const route = (path) => new URL(`dsh-tool-ledger/${path}`, document.baseURI);
    const sumOutcomes = (outcomes, keys) => keys.reduce((total, key) => total + (outcomes?.[key] ?? 0), 0);

    /** A short list with "Show all" when it is longer. */
    function ShortList({ items, render, first = 5 }) {
      const [all, setAll] = useState(false);
      const ui = dshUi.makeParts(React);
      const shown = all ? items : items.slice(0, first);
      return h(React.Fragment, null,
        shown.map(render),
        items.length > first ? h('div', { className: 'dsh-tl-more' }, h(ui.Button, { onClick: () => setAll(!all) }, all ? 'Show fewer' : `Show all ${items.length}`)) : null);
    }

    function ToolUsePage({ appCtx }) {
      ensureStyle();
      const ui = useMemo(() => dshUi.makeParts(React), []);
      const PlainNote = useMemo(() => dshKit.makeNote(React), []);
      const [range, setRange] = useState('30d');
      const [tab, setTab] = useState('');
      const [state, setState] = useState({ loading: true, data: null, error: null });
      const [note, setNote] = useState(null);
      const [busy, setBusy] = useState(false);
      const [allTools, setAllTools] = useState(false);

      const load = useCallback(async () => {
        try {
          const response = await fetch(route(`summary?range=${range}`), { cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) throw dshKit.fail(String(response.status));
          const data = await response.json();
          setState({ loading: false, data, error: null });
        } catch (error) {
          setState((old) => ({ loading: false, data: old.data, error }));
        }
      }, [range]);
      useEffect(() => { void load(); }, [load]);
      // Fresh numbers when the window comes back: shown again after it was hidden, or clicked into again from
      // another window (that leaves it visible, so only 'focus' tells). Nothing runs while it is hidden.
      useEffect(() => {
        const onShow = () => { if (!document.hidden) void load(); };
        document.addEventListener('visibilitychange', onShow);
        window.addEventListener('focus', onShow);
        return () => {
          document.removeEventListener('visibilitychange', onShow);
          window.removeEventListener('focus', onShow);
        };
      }, [load]);

      const data = state.data;
      const tabs = data?.tabs ?? [];
      const tabLabel = (id) => tabs.find((one) => one.id === id)?.label ?? (id === 'unknown' ? 'No mode' : id);
      const toolLabel = (tool) => {
        const plainName = data?.plain?.[tool];
        return plainName ? h(React.Fragment, null, plainName, h('span', { className: 'dsh-tl-name' }, tool)) : h('span', { className: 'dsh-tl-tool' }, tool);
      };
      const inTab = (row) => !tab || row.tab === tab;

      const save = async (field, value, words) => {
        setBusy(true);
        try {
          await setSetting(appCtx, field, value);
          setNote({ text: words });
          setTimeout(() => void load(), 400);
        } catch (error) {
          setNote({ error });
        } finally {
          setBusy(false);
        }
      };
      const startFresh = async () => {
        const yes = await dshKit.ask({ title: 'Start fresh?', text: 'Every tool record is removed for good, for every mode. Your settings stay as they are. Recording goes on from now.', ok: 'Remove all records', danger: true });
        if (!yes) return;
        setBusy(true);
        try {
          const response = await fetch(route('clear'), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'start fresh' }) });
          if (!response.ok) throw dshKit.fail(String(response.status));
          setNote({ text: 'All records were removed. Recording goes on from now.' });
          void load();
        } catch (error) {
          setNote({ error });
        } finally {
          setBusy(false);
        }
      };
      const goButton = (page, label) => (page ? h(ui.Button, { onClick: () => { if (!openPage(appCtx, page, label)) setNote({ text: `Open Settings → ${label} to change this.` }); } }, `Open ${label}`) : null);

      const enabled = data ? data.enabled !== false : true;
      const keep = data?.keepDays ?? 365;
      const keepOptions = KEEP.some(([days]) => days === keep) ? KEEP : [...KEEP, [keep, `${keep} days`]].sort((a, b) => a[0] - b[0]);

      let body;
      if (state.loading && !data) body = h(ui.Wait, null, 'Reading the records…');
      else if (!data) body = h(PlainNote, { error: state.error ?? 'error 404' });
      else {
        const asked = data.askedButOff.filter(inTab);
        const idle = data.loadedNeverUsed.filter(inTab);
        const reserve = data.reserveAlwaysCalled.filter(inTab);
        const refused = data.refusedMost.filter(inTab);
        const tools = data.tools
          .map((row) => {
            const part = tab ? row.tabs?.[tab] : { total: row.total, outcomes: row.outcomes };
            return part ? { tool: row.tool, total: part.total, outcomes: part.outcomes } : null;
          })
          .filter((row) => row && row.total > 0);
        const view = (title, info, desc, items, render) => h(React.Fragment, null,
          h(ui.Group, null, title, h(ui.Info, { title, ...info })),
          h(ui.Desc, null, desc),
          items.length === 0 ? h(ui.Desc, null, 'Nothing here in this period.') : h(ShortList, { items, render }));
        const cellOf = (value) => h('td', { className: value ? undefined : 'dsh-tl-zero' }, value);
        body = h(React.Fragment, null,
          h(ui.Desc, null, data.totals.calls === 0
            ? 'No tool calls recorded in this period yet.'
            : `${data.totals.calls} tool calls in ${data.totals.conversations} threads${data.totals.helpers ? ` and ${data.totals.helpers} helpers` : ''}${data.totals.requests ? `, and ${data.totals.requests} requests for a tool` : ''}${data.since ? `, first one ${new Date(data.since).toLocaleDateString('en-GB')}` : ''}.`),
          state.error ? h(PlainNote, { error: state.error }) : null,
          view('Asked for often but off', INFO.asked, 'Tools the assistant asked for, or tried while they were Off or not on offer in that mode.', asked, (row) =>
            h(ui.Row, { key: `${row.tab}-${row.tool}`, title: toolLabel(row.tool), desc: `${tabLabel(row.tab)}: asked for ${row.count} times${row.allowed ? `, allowed ${row.allowed}` : ''}${STATE_WORDS[row.state] ? `. It is ${STATE_WORDS[row.state]} there now.` : '.'}` }, goButton('tool-access', 'Tool access'))),
          view('Loaded but never used', INFO.idle, 'Tools on offer in many threads of a mode that the assistant never got to use. Fewer tools on offer leave the assistant more room.', idle, (row) =>
            h(ui.Row, { key: `${row.tab}-${row.tool}`, title: toolLabel(row.tool), desc: `${tabLabel(row.tab)}: on offer in ${row.conversations} threads and helpers, never used.` }, goButton('tool-access', 'Tool access'))),
          view('Held in reserve but always called', INFO.reserve, 'Tools a mode keeps in reserve that the assistant fetched in most of its threads. Such a tool could be on offer from the start.', reserve, (row) =>
            h(ui.Row, { key: `${row.tab}-${row.tool}`, title: toolLabel(row.tool), desc: `${tabLabel(row.tab)}: fetched from the reserve in ${row.conversations} of ${row.of} threads and helpers.` }, goButton('modes', 'Modes'))),
          view('Refused most', INFO.refused, 'Calls that a rule stopped, or that you said no to or did not answer.', refused, (row) =>
            h(ui.Row, { key: `${row.tab}-${row.tool}-${row.rule}`, title: toolLabel(row.tool), desc: `${tabLabel(row.tab)}: ${row.count} times, because ${ruleWords(row.rule)}.` }, goButton(RULES[row.rule]?.[1] ?? '', RULES[row.rule]?.[2] ?? ''))),
          h(ui.Group, null, 'Every tool', h(ui.Info, { title: 'Every tool', ...INFO.every })),
          tools.length === 0 ? h(ui.Desc, null, 'Nothing here in this period.') : h('table', { className: 'dsh-tl-table' },
            h('thead', null, h('tr', null, ['Tool', 'Calls', 'Ran', 'Failed', 'Refused', 'Asked you'].map((head) => h('th', { key: head, scope: 'col' }, head)))),
            h('tbody', null, (allTools ? tools : tools.slice(0, 15)).map((row) => h('tr', { key: row.tool },
              h('td', null, toolLabel(row.tool)),
              h('td', null, row.total),
              cellOf(row.outcomes.ran ?? 0),
              cellOf(row.outcomes.error ?? 0),
              cellOf(sumOutcomes(row.outcomes, ['refused'])),
              cellOf(sumOutcomes(row.outcomes, ['asked', 'allowed', 'denied', 'parked'])))))),
          tools.length > 15 ? h('div', { className: 'dsh-tl-more' }, h(ui.Button, { onClick: () => setAllTools(!allTools) }, allTools ? 'Show fewer' : `Show all ${tools.length}`)) : null);
      }

      return h(ui.Page, { title: 'Tool use', desc: 'Which tools the assistant used, asked for or was refused, in every mode and helper. Only tool names and counts are kept, never what a tool was given or gave back. Nothing here changes a setting by itself.' },
        h(ui.Row, { title: 'Record tool use', info: INFO.record, desc: enabled ? 'On. Every tool call is noted.' : 'Off. Nothing new is noted; what was noted stays.' },
          h(ui.Switch, { on: enabled, label: 'Record tool use', disabled: busy || !data, onChange: (value) => void save('enabled', value, value ? 'Saved. Tool use is recorded.' : 'Saved. Recording is off.') })),
        h(ui.Row, { title: 'Keep records for', info: INFO.keep, desc: 'Older months are removed once a day.' },
          h('select', { className: 'dshu-field dsh-tl-select', value: keep, disabled: busy || !data, 'aria-label': 'Keep records for', onChange: (event) => void save('keepDays', Number(event.target.value), 'Saved.') },
            keepOptions.map(([days, label]) => h('option', { key: days, value: days }, label)))),
        note ? h(PlainNote, note.error ? { error: note.error } : { text: note.text }) : null,
        h('div', { className: 'dsh-tl-bar' },
          h('div', { className: 'dsh-tl-seg', role: 'group', 'aria-label': 'Time range' },
            RANGES.map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': range === id, onClick: () => setRange(id) }, label))),
          h(ui.Info, { title: 'Time range', ...INFO.range }),
          h('select', { className: 'dshu-field dsh-tl-select', value: tab, 'aria-label': 'Mode', onChange: (event) => setTab(event.target.value) },
            h('option', { value: '' }, 'All modes'),
            tabs.map((one) => h('option', { key: one.id, value: one.id }, one.label))),
          h(ui.Info, { title: 'Mode', ...INFO.tab }),
          h('span', { className: 'dsh-tl-spacer' }),
          h(ui.Button, { onClick: () => void load() }, 'Refresh'),
          h(ui.Info, { title: 'Refresh', ...INFO.refresh })),
        body,
        h(ui.Group, null, 'Your records'),
        h(ui.Row, { title: 'Save a copy', desc: 'The records of the chosen period as a table file, for Data mode or a spreadsheet.' },
          h('a', { className: 'dshu-btn dsh-tl-link', href: route(`export?range=${range}&format=csv`).href, download: '' }, 'Table (CSV)'),
          h(ui.Info, { title: 'Table (CSV)', ...INFO.csv }),
          h('a', { className: 'dshu-btn dsh-tl-link', href: route(`export?range=${range}&format=json`).href, download: '' }, 'Data (JSON)'),
          h(ui.Info, { title: 'Data (JSON)', ...INFO.json })),
        h(ui.Row, { title: 'Start fresh', info: INFO.fresh, desc: 'Removes every record, for example when the test period is over. Asks first.' },
          h(ui.Button, { danger: true, disabled: busy, onClick: () => void startFresh() }, 'Start fresh')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'tool-ledger', order: 104, label: () => 'Tool use' },
              (props) => h(ToolUsePage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
