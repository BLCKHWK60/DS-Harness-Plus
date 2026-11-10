window.__ModuleLoader__.load({
  id: '@local/dsh-modes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const NS = 'modes';
    const FALLBACK_MODES = [
      { id: 'chat', label: 'Chat' },
      { id: 'cowork', label: 'Cowork' },
      { id: 'code', label: 'Code' },
    ];

    const DICT = {
      en: {
        'composer.mode': 'Mode',
        'composer.failed': 'Could not switch mode',
        'toggle.search': 'Search',
        'toggle.search.on': 'Web search is on for this conversation. Click to switch it off.',
        'toggle.search.off': 'Web search is off for this conversation. Click to switch it on.',
        'toggle.research': 'Deep research',
        'toggle.research.on': 'Deep research is on: questions get a researched, cited report. Click to switch it off.',
        'toggle.research.off': 'Switch on deep research: questions get a researched, cited report.',
        'section.title': 'Modes',
        'head.hint': 'A mode narrows the tools the model sees, can set the file sandbox, can move the session to a tier and adds a short prompt. Sessions pick a mode in the composer or with /mode. Changes apply at the next turn boundary.',
        'default.label': 'Mode for sessions that have not chosen one',
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
        'f.tier': 'Default tier when switching to this mode (needs the Tier plugin; empty = none)',
        'f.prompt': 'Prompt added while this mode is active',
        'f.count': '{n} of 4000',
        'e.id': 'Ids use lower-case letters, digits and dashes, and must be unique.',
        'e.none': 'Keep at least one mode.',
        'e.default': 'The default mode must be one of the modes.',
        'e.broken': 'The stored mode list is not valid JSON. Saving replaces it with what you see here (the built-in three until you edit).',
        'e.tools': 'Choose at least one tool name, or pick All or None.',
        'failed': 'Could not read the Modes settings. Is the Modes plugin loaded in this profile?',
        'loading': 'Loading modes…',
        'save.failed': 'Could not save',
      },
      zh: {
        'composer.mode': '模式',
        'composer.failed': '无法切换模式',
        'toggle.search': '搜索',
        'toggle.search.on': '此对话已开启网页搜索。点击关闭。',
        'toggle.search.off': '此对话已关闭网页搜索。点击开启。',
        'toggle.research': '深度研究',
        'toggle.research.on': '深度研究已开启：问题会得到经过研究、带引用的报告。点击关闭。',
        'toggle.research.off': '开启深度研究：问题会得到经过研究、带引用的报告。',
        'section.title': '模式',
        'head.hint': '模式会限制模型可见的工具，可设置文件沙箱、切换档位并附加一小段提示词。会话在输入框或用 /mode 选择模式，修改在下一轮开始时生效。',
        'default.label': '尚未选择模式的会话使用',
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
        'f.tier': '切换到此模式时的默认档位（需要 Tier 插件，留空为不切换）',
        'f.prompt': '此模式启用时附加的提示词',
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
  height: 28px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.dsh-modes-select:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-modes-select[disabled] { opacity: .55; cursor: default; }

.dsh-me-page { display: flex; flex-direction: column; gap: 16px; padding: 2px 0 36px; }
.dsh-me-head h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-me-head p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
.dsh-me-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.dsh-me-row { display: flex; flex-wrap: wrap; gap: 10px; }
.dsh-me-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; min-width: 0; }
.dsh-me-field.wide { flex-basis: 100%; }
.dsh-me-page > .dsh-me-field, .dsh-me-card > .dsh-me-field { flex: none; max-width: 100%; }
.dsh-me-page > .dsh-me-field { max-width: 360px; }
.dsh-me-field > span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-me-in, .dsh-me-ta, .dsh-me-sel { font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 6px 8px; min-width: 0; }
.dsh-me-in, .dsh-me-sel { height: 30px; padding-top: 0; padding-bottom: 0; }
.dsh-me-ta { min-height: 64px; resize: vertical; line-height: 1.45; }
.dsh-me-in:focus-visible, .dsh-me-ta:focus-visible, .dsh-me-sel:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
.dsh-me-in[data-bad="true"] { border-color: var(--dsw-alias-state-error-primary); }
.dsh-me-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; width: fit-content; }
.dsh-me-seg button { height: 28px; padding: 0 10px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-me-seg button + button { border-left: 1px solid var(--dsw-alias-border-l1); }
.dsh-me-seg button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-me-btn { height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-me-btn:hover:not([disabled]) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-me-btn[disabled] { opacity: .5; cursor: default; }
.dsh-me-btn.primary { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-secondary); }
.dsh-me-btn:focus-visible, .dsh-me-seg button:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
.dsh-me-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-me-spacer { flex: 1; }
.dsh-me-note { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-me-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-me-count { font-size: 11px; color: var(--dsw-alias-label-secondary); align-self: flex-end; }
.dsh-me-title { display: flex; align-items: center; gap: 8px; }
.dsh-me-title b { font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsh-me-title code { font-size: 11px; color: var(--dsw-alias-label-secondary); }
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
      const modes = defined.length > 0 ? defined : FALLBACK_MODES;
      const chosen = readObject(view?.sessionModes)[sessionId];
      const fallback = view?.defaultMode;
      const current = [chosen, fallback].find((id) => modes.some((mode) => mode.id === id)) ?? modes[0].id;
      return { modes, current };
    }

    async function load(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw new Error('The Modes settings namespace is not mounted.');
      // While the Cowork sidebar is on, its tabs choose the mode, so the chat-box selector hides.
      const shell = result.value.namespaces.some((item) => item.ns === 'cowork-shell');
      return { value: entry.value, revision: entry.revision, shell };
    }

    function ModeControl({ appCtx, sessionId }) {
      const t = appCtx.locale.bind('modes');
      const [state, setState] = useState({ status: 'loading', view: null, revision: 0, busy: false, shell: false });

      const refresh = useCallback(async () => {
        try {
          const loaded = await load(appCtx);
          setState({ status: 'ready', view: loaded.value, revision: loaded.revision, busy: false, shell: loaded.shell });
        } catch {
          setState((prev) => ({ ...prev, status: 'error', busy: false }));
        }
      }, [appCtx]);

      // Re-read now and every few seconds, so a switch made with the /mode command shows up.
      useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), 3000);
        return () => clearInterval(timer);
      }, [refresh, sessionId]);

      const choose = async (modeId) => {
        if (!sessionId || state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          let fresh = await load(appCtx);
          const next = { ...readObject(fresh.value.sessionModes), [sessionId]: modeId };
          const op = [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }];
          let result = await appCtx.remote.settings.mutate(NS, op, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx);
            result = await appCtx.remote.settings.mutate(NS, op, fresh.revision);
          }
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
.dsh-mt{display:inline-flex;gap:6px;align-items:center}
.dsh-mt button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.dsh-mt button[aria-pressed='true']{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}
.dsh-mt button:disabled{opacity:.5;cursor:default}
@media (hover:hover){.dsh-mt button:hover:not([aria-pressed='true']){background:var(--dsw-alias-interactive-bg-hover)}}
@media (max-width:760px){.dsh-mt button{padding:0 8px}.dsh-mt button .lbl{display:none}}
.dsh-mt svg{flex:none}
`;
    const ICON = {
      search: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
      research: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M8 10.5h5M10.5 8v5',
    };
    const icon = (name) => h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: ICON[name] }));

    /**
     * Search and Deep research switches for the open conversation. They are stored per Session in
     * the Modes settings (`sessionWeb`, `sessionResearch`); the host applies them at the next turn boundary.
     */
    function ToggleControl({ appCtx, sessionId }) {
      const t = appCtx.locale.bind('modes');
      const [state, setState] = useState({ status: 'loading', view: null, busy: false });
      const refresh = useCallback(async () => {
        try {
          const loaded = await load(appCtx);
          setState((prev) => ({ ...prev, status: 'ready', view: loaded.value }));
        } catch {
          setState((prev) => ({ ...prev, status: prev.view ? 'ready' : 'error' }));
        }
      }, [appCtx]);
      useEffect(() => {
        void refresh();
        const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 4000);
        return () => clearInterval(timer);
      }, [refresh, sessionId]);

      // Older host halves have no switches; show nothing then.
      if (state.status !== 'ready' || !sessionId || !state.view || state.view.sessionWeb === undefined) return null;
      const { current } = describeModes(state.view, sessionId);
      const modeDef = readObject(state.view.modes)[current] ?? BUILTIN[current] ?? {};
      const tools = modeDef.tools ?? 'all';
      const chosenWeb = readObject(state.view.sessionWeb)[sessionId];
      const web = typeof chosenWeb === 'boolean'
        ? chosenWeb
        : tools === 'none' ? false : Array.isArray(tools) ? tools.some((tool) => tool === 'web_search' || tool === 'web_fetch') : true;
      const research = readObject(state.view.sessionResearch)[sessionId] === true;

      const flip = async (field, value) => {
        if (state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          let fresh = await load(appCtx);
          const next = { ...readObject(fresh.value[field]) };
          if (value === undefined) delete next[sessionId];
          else next[sessionId] = value;
          const op = [{ op: 'set', path: [field], value: JSON.stringify(next) }];
          let result = await appCtx.remote.settings.mutate(NS, op, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx);
            result = await appCtx.remote.settings.mutate(NS, op, fresh.revision);
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
        h('span', { className: 'dsh-mt' },
          h('button', {
            type: 'button', 'aria-pressed': web, disabled: state.busy, title: t(web ? 'toggle.search.on' : 'toggle.search.off'),
            onClick: () => void flip('sessionWeb', !web),
            'aria-label': t('toggle.search'),
          }, icon('search'), h('span', { className: 'lbl' }, t('toggle.search'))),
          h('button', {
            type: 'button', 'aria-pressed': research, disabled: state.busy, title: t(research ? 'toggle.research.on' : 'toggle.research.off'),
            onClick: () => void flip('sessionResearch', research ? undefined : true),
            'aria-label': t('toggle.research'),
          }, icon('research'), h('span', { className: 'lbl' }, t('toggle.research')))));
    }

    const BUILTIN = {
      chat: {
        label: 'Chat',
        tools: 'none',
        sandbox: 'read-only',
        defaultTier: '',
        prompt:
          'You are in Chat mode: answer directly in one reply. No tools are available. If a task needs files, commands or the web, say so and suggest switching to Cowork or Code mode.',
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
     * Problems that block a save, as dictionary keys per row id and for the whole form.
     * @param {object[]} rows - editable rows.
     * @param {string} defaultMode - chosen default.
     * @returns {{rows: Record<string, string>, form: string[]}} problems.
     */
    function validate(rows, defaultMode) {
      const byRow = {};
      const form = [];
      const seen = new Set();
      for (const row of rows) {
        if (!ID_RE.test(row.id) || seen.has(row.id)) byRow[row.key] = 'e.id';
        else if (row.toolsKind === 'some' && row.toolNames.trim() === '') byRow[row.key] = 'e.tools';
        seen.add(row.id);
      }
      if (rows.length === 0) form.push('e.none');
      else if (!rows.some((row) => row.id === defaultMode)) form.push('e.default');
      return { rows: byRow, form };
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
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const entry = result.value.namespaces.find((item) => item.ns === NS);
      if (!entry) throw new Error('The Modes settings namespace is not mounted.');
      return { value: entry.value, revision: entry.revision, tiers: tierIdsOf(result.value.namespaces) };
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
      const nextKey = React.useRef(1);

      const adopt = useCallback((view) => {
        const stored = parseModes(view.modes);
        const invalid = stored === null;
        const base = invalid || Object.keys(stored).length === 0 ? BUILTIN : stored;
        setRows(toRows(base));
        setBroken(invalid);
        setDefaultMode(typeof view.defaultMode === 'string' ? view.defaultMode : 'cowork');
        setDirty(false);
      }, []);

      const refresh = useCallback(async () => {
        try {
          const data = await loadEditor(appCtx);
          setLoaded({ status: 'ready', revision: data.revision, tiers: data.tiers });
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

      const problems = validate(rows, defaultMode);
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          adopt(result.value.value);
          setMessage({ text: t('saved') });
        } catch (error) {
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        } finally {
          setBusy(false);
        }
      };

      if (loaded.status === 'loading') return h('div', { className: 'dsh-me-note' }, h('style', null, CSS), t('loading'));
      if (loaded.status === 'error') {
        return h('div', { className: 'dsh-me-note', 'data-bad': 'true' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), t('failed'));
      }

      const tierList = h('datalist', { id: 'dsh-me-tiers' }, (loaded.tiers ?? []).map((id) => h('option', { key: id, value: id })));
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
          ),
        ),
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

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('modes', DICT));
        const t = ctx.locale.bind('modes');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'modes', order: 20, label: () => t('section.title') },
              (props) => h(ModesPage, { ...props, appCtx: ctx }),
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
      },
    };
  },
});
