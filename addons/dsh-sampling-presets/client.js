/**
 * Browser half of Sampling presets: a "Sampling" page in Settings that edits the presets, the task
 * categories, the per-mode choice, the default category, the delivery strategy and the optional
 * per-model rules. It reads and writes through the settings channel (like Tier and Modes do), so it
 * needs no host route. The six fields it edits are volatile in the host half, so a save applies at
 * once without reloading the plugin.
 *
 * The page enforces the same references the host checks at load (a category names a real preset,
 * a mode names a real category, and so on) before it lets you save.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-sampling-presets',
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

    const NS = 'sampling-presets';
    const STRATEGIES = ['in-dsh', 'server-alias', 'mixed'];
    const ROUTE_RE = /^[^/]+\/.+$/;

    const DICT = {
      en: {
        'section.title': 'Sampling',
        'head.hint': 'A preset is a named temperature and output limit. A category (code, plan, chat…) picks a preset; a conversation gets its category from /sampling, from its mode, or from the default. A value you set yourself in the chat box’s model panel always wins. Nothing applies until you add a preset and a category.',
        'presets.title': 'Presets',
        'presets.add': 'Add preset',
        'presets.empty': 'No presets yet.',
        'p.name': 'Name',
        'p.temperature': 'Temperature (0 to 2)',
        'p.maxTokens': 'Max output tokens',
        'p.notes': 'Note (why this preset)',
        'categories.title': 'Categories',
        'categories.hint': 'Which preset each kind of task uses.',
        'categories.add': 'Add category',
        'categories.empty': 'No categories yet.',
        'c.name': 'Category',
        'c.preset': 'Preset',
        'modes.title': 'Per mode',
        'modes.hint': 'With the Modes add-on, a conversation in a mode uses that category unless you chose one with /sampling.',
        'modes.add': 'Add mode rule',
        'modes.empty': 'No mode rules.',
        'm.mode': 'Mode id',
        'm.category': 'Category',
        'default.title': 'Default category',
        'default.none': 'None (no preset unless a mode or /sampling picks one)',
        'strategy.title': 'How presets reach the model',
        'strategy.in-dsh': 'In dsh',
        'strategy.server-alias': 'Server alias',
        'strategy.mixed': 'Both',
        'strategy.in-dsh.hint': 'dsh sends the temperature and max tokens with each request. This is the safe choice.',
        'strategy.server-alias.hint': 'dsh switches to a model id that your server maps to its own sampling settings (set below). The switch can discard the server cache.',
        'strategy.mixed.hint': 'Both of the above.',
        'perModel.title': 'Per model (optional)',
        'perModel.hint': 'Limit which presets a model may use, and name the server alias that carries a preset on that model. Leave empty to apply every preset to every model.',
        'perModel.add': 'Add model rule',
        'perModel.empty': 'No model rules.',
        'pm.route': 'Model, as provider/model',
        'pm.allowed': 'Allowed presets (none ticked = all)',
        'pm.aliases': 'Server alias per preset (a model id; empty = none)',
        'remove': 'Remove',
        'save': 'Save',
        'discard': 'Discard changes',
        'saved': 'Saved.',
        'dirty': 'Unsaved changes',
        'save.failed': 'Could not save',
        'failed': 'Could not read the Sampling settings. Is the Sampling presets add-on switched on?',
        'loading': 'Loading sampling presets…',
        'e.name': 'Names must be filled in and unique.',
        'e.temperature': 'Temperature must be a number from 0 to 2.',
        'e.maxTokens': 'Max tokens must be a whole number from 1 to 1,000,000.',
        'e.preset': 'This names a preset that does not exist.',
        'e.category': 'This names a category that does not exist.',
        'e.route': 'Use the form provider/model.',
        'e.default': 'The default category does not exist.',
        'e.used': 'Fix the highlighted rows, then save.',
      },
      zh: {
        'section.title': '采样',
        'head.hint': '预设是一组命名的温度与输出上限。类别（代码、规划、聊天…）选择预设；会话的类别来自 /sampling、其模式或默认类别。你在 Tier 输入框中亲自设置的值始终优先。添加预设和类别之前不会生效。',
        'presets.title': '预设',
        'presets.add': '添加预设',
        'presets.empty': '还没有预设。',
        'p.name': '名称',
        'p.temperature': '温度（0 到 2）',
        'p.maxTokens': '最大输出 token',
        'p.notes': '备注（为何使用此预设）',
        'categories.title': '类别',
        'categories.hint': '每类任务使用哪个预设。',
        'categories.add': '添加类别',
        'categories.empty': '还没有类别。',
        'c.name': '类别',
        'c.preset': '预设',
        'modes.title': '按模式',
        'modes.hint': '配合模式插件，处于某模式的会话使用该类别，除非你用 /sampling 另行选择。',
        'modes.add': '添加模式规则',
        'modes.empty': '没有模式规则。',
        'm.mode': '模式标识',
        'm.category': '类别',
        'default.title': '默认类别',
        'default.none': '无（除非模式或 /sampling 指定，否则不使用预设）',
        'strategy.title': '预设如何到达模型',
        'strategy.in-dsh': '由 dsh 发送',
        'strategy.server-alias': '服务器别名',
        'strategy.mixed': '两者',
        'strategy.in-dsh.hint': 'dsh 在每次请求中发送温度和最大 token，这是最安全的选择。',
        'strategy.server-alias.hint': 'dsh 切换到服务器自行映射采样设置的模型 id（在下方设置）。切换可能丢弃服务器缓存。',
        'strategy.mixed.hint': '以上两者。',
        'perModel.title': '按模型（可选）',
        'perModel.hint': '限制某模型可用的预设，并指明在该模型上承载预设的服务器别名。留空则所有预设适用于所有模型。',
        'perModel.add': '添加模型规则',
        'perModel.empty': '没有模型规则。',
        'pm.route': '模型，格式 provider/model',
        'pm.allowed': '允许的预设（都不勾选 = 全部）',
        'pm.aliases': '每个预设的服务器别名（模型 id，留空为无）',
        'remove': '删除',
        'save': '保存',
        'discard': '放弃更改',
        'saved': '已保存。',
        'dirty': '有未保存的更改',
        'save.failed': '无法保存',
        'failed': '无法读取采样设置。此配置是否加载了采样预设插件？',
        'loading': '正在加载采样预设…',
        'e.name': '名称不能为空且不能重复。',
        'e.temperature': '温度必须是 0 到 2 之间的数字。',
        'e.maxTokens': '最大 token 必须是 1 到 1,000,000 的整数。',
        'e.preset': '这里引用的预设不存在。',
        'e.category': '这里引用的类别不存在。',
        'e.route': '请使用 provider/model 格式。',
        'e.default': '默认类别不存在。',
        'e.used': '请修正高亮的行后再保存。',
      },
    };

    const CSS = `
.dsh-smp-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-smp-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-smp-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-smp-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-smp-card > h3 { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-smp-hint { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-smp-item { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-smp-item > .dsh-smp-note { flex-basis: 100%; }
.dsh-smp-item:first-of-type { border-top: 0; padding-top: 0; }
.dsh-smp-field { display: flex; flex-direction: column; gap: 6px; flex: 1 1 170px; min-width: 0; }
.dsh-smp-field.narrow { flex: 0 1 140px; }
.dsh-smp-field.wide { flex-basis: 100%; }
.dsh-smp-card > .dsh-smp-field { flex: none; max-width: 420px; }
.dsh-smp-field > span { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-smp-in, .dsh-smp-sel { box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; min-width: 0; }
.dsh-smp-in:focus-visible, .dsh-smp-sel:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 0; }
.dsh-smp-in[data-bad="true"], .dsh-smp-sel[data-bad="true"] { outline: 1px solid var(--dsw-alias-state-error-primary); }
.dsh-smp-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-smp-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-smp-btn[disabled] { opacity: .5; cursor: default; }
.dsh-smp-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-smp-item > .dsh-smp-btn { margin-bottom: 4px; }
.dsh-smp-btn.primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-smp-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); width: fit-content; max-width: 100%; }
.dsh-smp-seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.dsh-smp-seg button:hover { color: var(--dsw-alias-label-primary); }
.dsh-smp-seg button[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); color: var(--dsw-alias-label-primary); }
.dsh-smp-seg button:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-smp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-smp-chip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-smp-chip[data-on="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-smp-chip input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.dsh-smp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-smp-spacer { flex: 1; }
.dsh-smp-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-smp-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-smp-alias { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-smp-alias > b { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary); min-width: 80px; }
.dsh-smp-alias .dsh-smp-in { flex: 1 1 180px; }
`;

    /**
     * Read an object stored by the settings view (a plain object, or a JSON string).
     * @param {unknown} value - stored value.
     * @returns {Record<string, any>} object or {}.
     */
    function obj(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value === 'string' && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
          /* fall through */
        }
      }
      return {};
    }

    /** Mode ids from the Modes plugin, best effort. */
    function modeIdsOf(namespaces) {
      const entry = namespaces.find((item) => item.ns === 'modes');
      const ids = Object.keys(obj(entry?.value?.modes));
      return ids.length > 0 ? ids : entry ? ['chat', 'cowork', 'code'] : [];
    }

    let uid = 1;
    const newKey = () => `k${uid++}`;

    /**
     * Turn the stored view into editable rows. `extra` keeps unknown fields so a save never drops them.
     * @param {object} view - namespace value.
     * @returns {object} form model.
     */
    function toForm(view) {
      const presets = Object.entries(obj(view.presets)).map(([name, p]) => ({
        key: newKey(),
        name,
        temperature: String(p?.temperature ?? ''),
        maxTokens: String(p?.maxTokens ?? ''),
        notes: typeof p?.notes === 'string' ? p.notes : '',
        extra: p && typeof p === 'object' ? p : {},
      }));
      const categories = Object.entries(obj(view.categories)).map(([name, preset]) => ({ key: newKey(), name, preset: String(preset) }));
      const byMode = Object.entries(obj(view.byMode)).map(([mode, category]) => ({ key: newKey(), mode, category: String(category) }));
      const perModel = Object.entries(obj(view.perModel)).map(([route, m]) => ({
        key: newKey(),
        route,
        allowed: Array.isArray(m?.allowedPresets) ? m.allowedPresets.map(String) : [],
        aliases: Object.entries(obj(m?.aliases)).map(([preset, alias]) => ({ preset, alias: String(alias) })),
        extra: m && typeof m === 'object' ? m : {},
      }));
      return {
        presets,
        categories,
        byMode,
        perModel,
        defaultCategory: typeof view.defaultCategory === 'string' ? view.defaultCategory : '',
        strategy: STRATEGIES.includes(view.strategy) ? view.strategy : 'mixed',
      };
    }

    /**
     * Rows back to the structures the host reads.
     * @param {object} form - form model.
     * @returns {object} values for the six fields.
     */
    function fromForm(form) {
      const presets = {};
      for (const p of form.presets) {
        presets[p.name] = { ...p.extra, temperature: Number(p.temperature), maxTokens: Number(p.maxTokens), notes: p.notes };
      }
      const categories = {};
      for (const c of form.categories) categories[c.name] = c.preset;
      const byMode = {};
      for (const m of form.byMode) byMode[m.mode] = m.category;
      const perModel = {};
      for (const m of form.perModel) {
        const aliases = {};
        for (const a of m.aliases) if (a.alias.trim()) aliases[a.preset] = a.alias.trim();
        perModel[m.route] = { ...m.extra, allowedPresets: m.allowed, aliases };
      }
      return { presets, categories, byMode, perModel, defaultCategory: form.defaultCategory, strategy: form.strategy };
    }

    /**
     * Find every problem that blocks a save.
     * @param {object} form - form model.
     * @returns {Record<string, string>} problem key (row key or `row:field`) to dictionary key.
     */
    function validate(form) {
      const bad = {};
      const names = (rows, field) => {
        const seen = new Set();
        for (const row of rows) {
          const value = String(row[field]).trim();
          if (!value || seen.has(value)) bad[`${row.key}:${field}`] = 'e.name';
          seen.add(value);
        }
      };
      names(form.presets, 'name');
      names(form.categories, 'name');
      names(form.byMode, 'mode');
      names(form.perModel, 'route');
      for (const p of form.presets) {
        const t = Number(p.temperature);
        if (p.temperature.trim() === '' || !Number.isFinite(t) || t < 0 || t > 2) bad[`${p.key}:temperature`] = 'e.temperature';
        const m = Number(p.maxTokens);
        if (p.maxTokens.trim() === '' || !Number.isInteger(m) || m < 1 || m > 1000000) bad[`${p.key}:maxTokens`] = 'e.maxTokens';
      }
      const presetNames = new Set(form.presets.map((p) => p.name));
      const categoryNames = new Set(form.categories.map((c) => c.name));
      for (const c of form.categories) if (!presetNames.has(c.preset)) bad[`${c.key}:preset`] = 'e.preset';
      for (const m of form.byMode) if (!categoryNames.has(m.category)) bad[`${m.key}:category`] = 'e.category';
      if (form.defaultCategory && !categoryNames.has(form.defaultCategory)) bad.default = 'e.default';
      for (const m of form.perModel) {
        if (!ROUTE_RE.test(m.route)) bad[`${m.key}:route`] = 'e.route';
        for (const preset of [...m.allowed, ...m.aliases.map((a) => a.preset)]) {
          if (!presetNames.has(preset)) bad[`${m.key}:allowed`] = 'e.preset';
        }
      }
      return bad;
    }

    async function loadAll(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw new Error('The Sampling presets settings namespace is not mounted.');
      return { value: entry.value, revision: entry.revision, modeIds: modeIdsOf(result.value.namespaces) };
    }

    function SamplingPage({ appCtx, embedded }) {
      const t = appCtx.locale.bind('samplingPresets');
      const [status, setStatus] = useState('loading');
      const [revision, setRevision] = useState(0);
      const [modeIds, setModeIds] = useState([]);
      const [form, setForm] = useState(null);
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);
      const raw = useRef({});

      const adopt = useCallback((view) => {
        raw.current = view;
        setForm(toForm(view));
        setDirty(false);
      }, []);

      const refresh = useCallback(async () => {
        try {
          const data = await loadAll(appCtx);
          setRevision(data.revision);
          setModeIds(data.modeIds);
          adopt(data.value);
          setStatus('ready');
        } catch {
          setStatus('error');
        }
      }, [appCtx, adopt]);

      useEffect(() => {
        void refresh();
      }, [refresh]);

      /** Change the form and mark it dirty. `fn` receives a shallow copy and returns the next form. */
      const change = (fn) => {
        setForm((prev) => fn({ ...prev }));
        setDirty(true);
        setMessage(null);
      };
      const setRow = (list, key, patch) => change((f) => ({ ...f, [list]: f[list].map((row) => (row.key === key ? { ...row, ...patch } : row)) }));
      const dropRow = (list, key) => change((f) => ({ ...f, [list]: f[list].filter((row) => row.key !== key) }));
      const addRow = (list, row) => change((f) => ({ ...f, [list]: [...f[list], { key: newKey(), ...row }] }));

      /** Rename a preset and follow every reference to it. */
      const renamePreset = (key, name) =>
        change((f) => {
          const old = f.presets.find((p) => p.key === key)?.name;
          return {
            ...f,
            presets: f.presets.map((p) => (p.key === key ? { ...p, name } : p)),
            categories: f.categories.map((c) => (c.preset === old ? { ...c, preset: name } : c)),
            perModel: f.perModel.map((m) => ({
              ...m,
              allowed: m.allowed.map((x) => (x === old ? name : x)),
              aliases: m.aliases.map((a) => (a.preset === old ? { ...a, preset: name } : a)),
            })),
          };
        });
      /** Rename a category and follow every reference to it. */
      const renameCategory = (key, name) =>
        change((f) => {
          const old = f.categories.find((c) => c.key === key)?.name;
          return {
            ...f,
            categories: f.categories.map((c) => (c.key === key ? { ...c, name } : c)),
            byMode: f.byMode.map((m) => (m.category === old ? { ...m, category: name } : m)),
            defaultCategory: f.defaultCategory === old ? name : f.defaultCategory,
          };
        });

      const problems = form ? validate(form) : {};
      const blocked = Object.keys(problems).length > 0;
      const flag = (id) => (problems[id] ? 'true' : 'false');

      const save = async () => {
        if (busy || blocked || !form) return;
        setBusy(true);
        setMessage(null);
        try {
          const values = fromForm(form);
          const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
          let result = await appCtx.remote.settings.mutate(NS, ops, revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            const fresh = await loadAll(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw dshKit.fail(result.error);
          setRevision(result.value.revision);
          adopt(result.value.value);
          setMessage({ text: t('saved') });
        } catch (error) {
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        } finally {
          setBusy(false);
        }
      };

      if (status === 'loading') return h('div', { className: 'dsh-smp-note' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), t('loading'));
      if (status === 'error') {
        return h('div', { className: 'dsh-smp-note', 'data-bad': 'true' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), t('failed'));
      }

      const presetNames = form.presets.map((p) => p.name).filter(Boolean);
      const categoryNames = form.categories.map((c) => c.name).filter(Boolean);
      const field = (label, control, cls) => h('label', { className: `dsh-smp-field${cls ? ` ${cls}` : ''}` }, h('span', null, label), control);
      const note = (id) => (problems[id] ? h('div', { className: 'dsh-smp-note', 'data-bad': 'true' }, t(problems[id])) : null);
      const select = (value, options, onChange, bad, empty) =>
        h(
          'select',
          { className: 'dsh-smp-sel', value, 'data-bad': bad, onChange: (event) => onChange(event.target.value) },
          empty !== undefined ? h('option', { value: '' }, empty) : null,
          // Keep a value that no longer resolves visible instead of silently showing another one.
          value && !options.includes(value) ? h('option', { value }, value) : null,
          options.map((option) => h('option', { key: option, value: option }, option)),
        );
      const remove = (onClick) => h('button', { type: 'button', className: 'dsh-smp-btn', onClick }, t('remove'));
      const add = (label, onClick) => h('button', { type: 'button', className: 'dsh-smp-btn', onClick }, label);
      const card = (title, hint, ...children) =>
        h('section', { className: 'dsh-smp-card' }, h('h3', null, title), hint ? h('p', { className: 'dsh-smp-hint' }, hint) : null, ...children);

      const firstOr = (list) => list[0] ?? '';
      const freshName = (prefix, rows) => {
        let n = rows.length + 1;
        while (rows.some((row) => row.name === `${prefix}-${n}`)) n += 1;
        return `${prefix}-${n}`;
      };

      return h(
        'div',
        { className: 'dsh-smp-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-smp-head' }, embedded ? null : h('h2', null, t('section.title')), h('p', null, t('head.hint'))),

        card(
          t('presets.title'),
          null,
          form.presets.length === 0 ? h('div', { className: 'dsh-smp-note' }, t('presets.empty')) : null,
          form.presets.map((p) =>
            h(
              'div',
              { key: p.key, className: 'dsh-smp-item' },
              field(t('p.name'), h('input', { className: 'dsh-smp-in', value: p.name, spellCheck: false, 'data-bad': flag(`${p.key}:name`), onChange: (e) => renamePreset(p.key, e.target.value.trim()) })),
              field(t('p.temperature'), h('input', { className: 'dsh-smp-in', value: p.temperature, inputMode: 'decimal', 'data-bad': flag(`${p.key}:temperature`), onChange: (e) => setRow('presets', p.key, { temperature: e.target.value }) }), 'narrow'),
              field(t('p.maxTokens'), h('input', { className: 'dsh-smp-in', value: p.maxTokens, inputMode: 'numeric', 'data-bad': flag(`${p.key}:maxTokens`), onChange: (e) => setRow('presets', p.key, { maxTokens: e.target.value }) }), 'narrow'),
              field(t('p.notes'), h('input', { className: 'dsh-smp-in', value: p.notes, onChange: (e) => setRow('presets', p.key, { notes: e.target.value }) })),
              remove(() => dropRow('presets', p.key)),
              note(`${p.key}:name`) || note(`${p.key}:temperature`) || note(`${p.key}:maxTokens`),
            ),
          ),
          h('div', { className: 'dsh-smp-bar' }, add(t('presets.add'), () => addRow('presets', { name: freshName('preset', form.presets), temperature: '0.7', maxTokens: '4096', notes: '', extra: {} }))),
        ),

        card(
          t('categories.title'),
          t('categories.hint'),
          form.categories.length === 0 ? h('div', { className: 'dsh-smp-note' }, t('categories.empty')) : null,
          form.categories.map((c) =>
            h(
              'div',
              { key: c.key, className: 'dsh-smp-item' },
              field(t('c.name'), h('input', { className: 'dsh-smp-in', value: c.name, spellCheck: false, 'data-bad': flag(`${c.key}:name`), onChange: (e) => renameCategory(c.key, e.target.value.trim()) })),
              field(t('c.preset'), select(c.preset, presetNames, (value) => setRow('categories', c.key, { preset: value }), flag(`${c.key}:preset`))),
              remove(() => dropRow('categories', c.key)),
              note(`${c.key}:name`) || note(`${c.key}:preset`),
            ),
          ),
          h('div', { className: 'dsh-smp-bar' }, add(t('categories.add'), () => addRow('categories', { name: freshName('category', form.categories), preset: firstOr(presetNames) }))),
        ),

        card(
          t('modes.title'),
          t('modes.hint'),
          form.byMode.length === 0 ? h('div', { className: 'dsh-smp-note' }, t('modes.empty')) : null,
          form.byMode.map((m) =>
            h(
              'div',
              { key: m.key, className: 'dsh-smp-item' },
              field(
                t('m.mode'),
                h('input', { className: 'dsh-smp-in', list: 'dsh-smp-modes', value: m.mode, spellCheck: false, 'data-bad': flag(`${m.key}:mode`), onChange: (e) => setRow('byMode', m.key, { mode: e.target.value.trim() }) }),
              ),
              field(t('m.category'), select(m.category, categoryNames, (value) => setRow('byMode', m.key, { category: value }), flag(`${m.key}:category`))),
              remove(() => dropRow('byMode', m.key)),
              note(`${m.key}:mode`) || note(`${m.key}:category`),
            ),
          ),
          h('datalist', { id: 'dsh-smp-modes' }, modeIds.map((id) => h('option', { key: id, value: id }))),
          h('div', { className: 'dsh-smp-bar' }, add(t('modes.add'), () => addRow('byMode', { mode: modeIds.find((id) => !form.byMode.some((m) => m.mode === id)) ?? '', category: firstOr(categoryNames) }))),
        ),

        card(
          t('default.title'),
          null,
          h('div', { className: 'dsh-smp-field' }, select(form.defaultCategory, categoryNames, (value) => change((f) => ({ ...f, defaultCategory: value })), flag('default'), t('default.none'))),
          note('default'),
        ),

        card(
          t('strategy.title'),
          t(`strategy.${form.strategy}.hint`),
          h(
            'div',
            { className: 'dsh-smp-seg', role: 'group', 'aria-label': t('strategy.title') },
            STRATEGIES.map((s) => h('button', { key: s, type: 'button', 'aria-pressed': form.strategy === s, onClick: () => change((f) => ({ ...f, strategy: s })) }, t(`strategy.${s}`))),
          ),
        ),

        card(
          t('perModel.title'),
          t('perModel.hint'),
          form.perModel.length === 0 ? h('div', { className: 'dsh-smp-note' }, t('perModel.empty')) : null,
          form.perModel.map((m) =>
            h(
              'div',
              { key: m.key, className: 'dsh-smp-item' },
              field(t('pm.route'), h('input', { className: 'dsh-smp-in', value: m.route, spellCheck: false, 'data-bad': flag(`${m.key}:route`), onChange: (e) => setRow('perModel', m.key, { route: e.target.value.trim() }) }), 'wide'),
              note(`${m.key}:route`),
              h(
                'div',
                { className: 'dsh-smp-field wide' },
                h('span', null, t('pm.allowed')),
                h(
                  'div',
                  { className: 'dsh-smp-chips' },
                  presetNames.map((name) => {
                    const on = m.allowed.includes(name);
                    return h(
                      'label',
                      { key: name, className: 'dsh-smp-chip', 'data-on': on ? 'true' : 'false' },
                      h('input', {
                        type: 'checkbox',
                        checked: on,
                        onChange: () => setRow('perModel', m.key, { allowed: on ? m.allowed.filter((x) => x !== name) : [...m.allowed, name] }),
                      }),
                      name,
                    );
                  }),
                ),
              ),
              h(
                'div',
                { className: 'dsh-smp-field wide' },
                h('span', null, t('pm.aliases')),
                presetNames.map((name) => {
                  const current = m.aliases.find((a) => a.preset === name)?.alias ?? '';
                  return h(
                    'div',
                    { key: name, className: 'dsh-smp-alias' },
                    h('b', null, name),
                    h('input', {
                      className: 'dsh-smp-in',
                      value: current,
                      spellCheck: false,
                      onChange: (e) => {
                        const value = e.target.value;
                        const rest = m.aliases.filter((a) => a.preset !== name);
                        setRow('perModel', m.key, { aliases: value === '' ? rest : [...rest, { preset: name, alias: value }] });
                      },
                    }),
                  );
                }),
              ),
              note(`${m.key}:allowed`),
              remove(() => dropRow('perModel', m.key)),
            ),
          ),
          h('div', { className: 'dsh-smp-bar' }, add(t('perModel.add'), () => addRow('perModel', { route: '', allowed: [], aliases: [], extra: {} }))),
        ),

        blocked ? h('div', { className: 'dsh-smp-note', 'data-bad': 'true' }, t('e.used')) : null,
        h(
          'div',
          { className: 'dsh-smp-bar' },
          h('span', { className: 'dsh-smp-spacer' }),
          message ? h('span', { className: 'dsh-smp-note', 'data-bad': message.bad ? 'true' : 'false', role: 'status' }, message.text) : null,
          dirty && !message ? h('span', { className: 'dsh-smp-note' }, t('dirty')) : null,
          h('button', { type: 'button', className: 'dsh-smp-btn', disabled: !dirty || busy, onClick: () => void refresh() }, t('discard')),
          h('button', { type: 'button', className: 'dsh-smp-btn primary', disabled: !dirty || busy || blocked, onClick: () => void save() }, t('save')),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('samplingPresets', DICT));
        const t = ctx.locale.bind('samplingPresets');
        // Shown as the "Sampling" tab of the Model Tiers page; its own page appears only without Model Tiers.
        ctx.effect(() => dshMerge.part('model-tiers', 'sampling-presets', { label: () => t('section.title'), order: 300, render: (props) => h(SamplingPage, { ...props, appCtx: ctx, embedded: true }) }));
        ctx.effect(() =>
          dshMerge.ownPageUnlessHosted('model-tiers', () =>
            ctx.effect(() =>
              ctx.slots.inject('settings.section', () =>
                ctx.slots.register(
                  { name: 'settings.section', id: 'sampling-presets', order: 210, label: () => t('section.title') },
                  (props) => h(SamplingPage, { ...props, appCtx: ctx }),
                ),
              ),
            ),
          ),
        );
      },
    };
  },
});
