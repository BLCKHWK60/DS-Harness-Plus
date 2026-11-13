window.__ModuleLoader__.load({
  id: '@local/dsh-modes',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState, useLayoutEffect } = React;

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
        'toggle.tools.on': 'Tools on',
        'toggle.tools.off': 'Tools off',
        'toggle.tools.title': 'What the model can call in this conversation',
        'tools.switch': 'Tools for this conversation',
        'tools.switch.hint': 'Off: the model is offered no tool at all, so it cannot try to call one. Search and Deep research are off too.',
        'tools.chat': 'In Chat, tools means searching and reading the web. For files and commands, use Cowork or Code.',
        'tools.viaCode': 'This conversation is in PTC mode: the model reaches these tools from inside small programs it writes. The app stops such a program after a few minutes, so long jobs like Deep research suit Standard mode better.',
        'tools.can': 'Can call',
        'tools.cannot': 'Cannot call',
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
        'depth.note': 'Applies to all conversations, from your next message.',
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
        'head.hint': 'A mode narrows the tools the model sees, can set the file sandbox, can move the conversation to a tier and adds a short prompt. A conversation picks a mode in the chat box or with /mode. Changes apply from the next message.',
        'default.label': 'Mode for conversations that have not chosen one',
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
        'f.tier': 'Tier to switch to with this mode (optional)',
        'f.prompt': 'Prompt added while this mode is active',
        'rerun': 'Rerun with the selected model',
        'rerun.busy': 'Starting the rerun…',
        'rerun.none': 'This answer cannot be rerun: its question was not found.',
        'rerun.failed': 'The rerun could not be started',
        'rerun.files': 'Rerun started. Pictures and files attached to the question were not sent again; add them if they are needed.',
        'answer.group': 'Buttons under an answer',
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
        'toggle.search': '搜索',
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
        'depth.note': '适用于所有对话，从下一条消息开始。',
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
        'rerun': '用当前所选模型重新运行',
        'rerun.busy': '正在开始重新运行…',
        'rerun.none': '无法重新运行此回答：找不到对应的问题。',
        'rerun.failed': '无法开始重新运行',
        'rerun.files': '已开始重新运行。问题中附带的图片和文件未再次发送，如有需要请重新添加。',
        'answer.group': '回答下方的按钮',
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
.dsh-me-sw { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease; }
.dsh-me-sw[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-me-sw::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-me-sw[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-me-group { margin: 8px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-me-title code { font-size: 12px; color: var(--dsw-alias-label-secondary); }
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

    async function load(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
      const fresh = await load(appCtx);
      const mode = readObject(fresh.value.sessionModes)[sessionId];
      if (mode) {
        const build = (value) => [{ op: 'set', path: ['sessionModes'], value: JSON.stringify({ ...readObject(value.sessionModes), [child]: mode }) }];
        let saved = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
        if (!saved.ok && saved.error.code === 'settings/conflict') {
          const again = await load(appCtx);
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
        if (answerFlags.users === 1) answerFlags.timer = setInterval(() => { if (!document.hidden) void refreshAnswerFlags(appCtx); }, 8000);
        void refreshAnswerFlags(appCtx);
        return () => {
          answerFlags.listeners.delete(listener);
          answerFlags.users -= 1;
          if (answerFlags.users === 0) clearInterval(answerFlags.timer);
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
        void refresh();
        let ticks = 0;
        const timer = setInterval(() => {
          ticks += 1;
          // With the Cowork sidebar on, only check now and then whether it was switched off.
          if (!document.hidden && (!shellRef.current || ticks % 10 === 0)) void refresh();
        }, 3000);
        return () => clearInterval(timer);
      }, [refresh, sessionId]);

      const choose = async (modeId) => {
        if (!sessionId || state.busy) return;
        setState((prev) => ({ ...prev, busy: true }));
        try {
          // Build the write from the latest value, and rebuild it if someone else wrote in between.
          const build = (value) => [{ op: 'set', path: ['sessionModes'], value: JSON.stringify({ ...readObject(value.sessionModes), [sessionId]: modeId }) }];
          let fresh = await load(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx);
            result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
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
.dsh-mt .pair{display:inline-flex;align-items:center}
.dsh-mt .pair > button:first-child{border-top-right-radius:0;border-bottom-right-radius:0}
.dsh-mt .pair > button.more{width:20px;padding:0;justify-content:center;margin-left:-1px;border-top-left-radius:0;border-bottom-left-radius:0}
.dsh-mt{flex:none;white-space:nowrap}
.dsh-mt[data-f1]{gap:4px}
.dsh-mt[data-f1] .lvl{display:none}
.dsh-mt[data-f1] button:not(.more){padding:0 8px}
.dsh-mt[data-f1] .pair > button.more{width:18px}
.dsh-mt[data-f1] button[data-helpers] .lbl{display:none}
.dsh-mt button[data-helpers='many']{border-color:var(--dsw-alias-state-warning-primary,#d98a00);color:var(--dsw-alias-state-warning-primary,#d98a00)}
.dsh-mt[data-f2] button[data-tools] .lbl{display:none}
.dsh-mt[data-f3] .pair[data-kind='research'] .lbl{display:none}
.dsh-mt[data-f4] .pair[data-kind='search'] .lbl{display:none}
.dsh-mt[data-f5] button:not(.more){padding:0 6px}
.dsh-mt[data-f5] .pair > button.more{width:16px}
.dsh-mt .pair .lvl{opacity:.8}
.dsh-mt-pop .title{font-size:14px;line-height:22px;font-weight:500}
.dsh-mt-pop input[type=range]{display:block;width:100%;margin:12px 0 2px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-mt-pop .steps{display:flex;justify-content:space-between}
.dsh-mt-pop .steps button{border:0;padding:2px 0;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dsh-mt-pop .steps button[aria-current='true']{color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-mt-pop .seg{display:flex;gap:6px;margin-top:6px}
.dsh-mt-pop .seg button{flex:1;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-mt-pop .seg button[aria-pressed='true']{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}
.dsh-mt button[data-tools='off']{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dsh-mt-pop{position:fixed;z-index:1000;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);overflow:auto;padding:14px 16px;border-radius:16px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 8px 28px rgba(0,0,0,.28)}
.dsh-mt-pop .row{display:flex;align-items:center;gap:12px}
.dsh-mt-pop .row > span:first-child{flex:1;font-size:14px;line-height:22px}
.dsh-mt-pop .hint{margin:4px 0 0;color:var(--dsw-alias-label-secondary)}
.dsh-mt-pop .head{margin:12px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-mt-pop .names{display:flex;flex-wrap:wrap;gap:4px}
.dsh-mt-pop .names span{padding:0 7px;border-radius:9px;line-height:18px;font-size:11px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}
.dsh-mt-pop .names[data-no='true'] span{color:var(--dsw-alias-label-secondary);text-decoration:line-through}
.dsh-mt-pop .sw{flex:none;position:relative;width:36px;height:20px;padding:2px;border:0;border-radius:999px;cursor:pointer;background:var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));transition:background .12s ease}
.dsh-mt-pop .sw[aria-checked='true']{background:var(--dsw-alias-brand-primary)}
.dsh-mt-pop .sw::after{content:'';display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary));transition:transform .12s ease}
.dsh-mt-pop .sw[aria-checked='true']::after{transform:translateX(16px);background:var(--dsw-alias-bg-base)}
`;
    const ICON = {
      search: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
      research: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M8 10.5h5M10.5 8v5',
      tools: 'M14.5 6.5a4 4 0 0 0-5.4 5L4 16.6V20h3.4l5.1-5.1a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z',
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

      // The buttons shrink to keep the chat box's bottom row on one line: first the step's name goes,
      // then the buttons' names (icons stay), then the padding. It is measured, not guessed from the
      // window's width, because the row also holds the app's own buttons and the model's name.
      const root = useRef(null);
      const shown = state.status === 'ready' && Boolean(sessionId) && state.view?.sessionWeb !== undefined;
      const marks = shown ? `${state.view.searchDepth}|${state.view.researchDepth}|${state.view.sessionTools}` : '';
      useLayoutEffect(() => {
        const el = root.current;
        if (!el) return undefined;
        // The row that wraps is the nearest ancestor laid out as a wrapping flex row.
        let row = el.parentElement;
        for (let i = 0; i < 6 && row && getComputedStyle(row).flexWrap !== 'wrap'; i += 1) row = row.parentElement;
        if (!row || getComputedStyle(row).flexWrap !== 'wrap') return undefined;
        const wrapped = () => {
          const first = row.firstElementChild;
          const last = row.lastElementChild;
          if (!first || !last) return false;
          if (first !== last && last.getBoundingClientRect().top > first.getBoundingClientRect().top + 8) return true;
          return first.scrollWidth > first.clientWidth + 1;
        };
        // Steps: 1 tighter and no step name, 2 "Tools" as an icon, 3 "Deep research" as an icon,
        // 4 "Search" as an icon, 5 tightest.
        const LEVELS = 5;
        const set = (level) => {
          for (let step = 1; step <= LEVELS; step += 1) el.toggleAttribute(`data-f${step}`, step <= level);
          el.dataset.fit = String(level);
        };
        const fit = () => {
          for (let level = 0; level <= LEVELS; level += 1) {
            set(level);
            if (!wrapped()) return;
          }
          // Nothing fits on one line (the app's own buttons take the room): two lines it is, so give
          // the names back as far as the first line holds them.
          for (let level = 0; level <= LEVELS; level += 1) {
            set(level);
            const first = row.firstElementChild;
            if (first && first.scrollWidth <= first.clientWidth + 1) return;
          }
        };
        fit();
        if (typeof ResizeObserver !== 'function') return undefined;
        let frame = 0;
        const observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(fit);
        });
        observer.observe(row);
        if (row.lastElementChild) observer.observe(row.lastElementChild);
        // The app's own buttons on the left change width when their text does (a mode, a model version).
        for (const child of row.firstElementChild?.children ?? []) if (!child.contains(el)) observer.observe(child);
        return () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
        };
      }, [shown, marks, sessionId]);

      // Older host halves have no switches; show nothing then.
      if (state.status !== 'ready' || !sessionId || !state.view || state.view.sessionWeb === undefined) return null;
      const { current } = describeModes(state.view, sessionId);
      const modeDef = readObject(state.view.modes)[current] ?? readObject(state.view.extraModes)[current] ?? BUILTIN[current] ?? {};
      const tools = modeDef.tools ?? 'all';
      const chosenWeb = readObject(state.view.sessionWeb)[sessionId];
      const web = typeof chosenWeb === 'boolean'
        ? chosenWeb
        : tools === 'none' ? false : Array.isArray(tools) ? tools.some((tool) => tool === 'web_search' || tool === 'web_fetch') : true;
      const off = readObject(state.view.sessionTools)[sessionId] === false;
      const research = !off && readObject(state.view.sessionResearch)[sessionId] === true;
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
          let fresh = await load(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, build(fresh.value), fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx);
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
          let fresh = await load(appCtx);
          let result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            fresh = await load(appCtx);
            result = await appCtx.remote.settings.mutate(NS, ops, fresh.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          setState({ status: 'ready', view: result.value.value, busy: false });
        } catch {
          setState((prev) => ({ ...prev, busy: false }));
          void refresh();
        }
      };
      const searchDepth = depthOf(state.view.searchDepth);
      const researchDepth = depthOf(state.view.researchDepth);
      // The step is named on the button only when it is not the usual one.
      const level = (depth) => (depth === 'standard' ? null : h('span', { className: 'lbl lvl' }, `· ${t(`depth.${depth}`)}`));

      return h(React.Fragment, null,
        h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
        h('span', { className: 'dsh-mt', ref: root },
          h('span', { className: 'pair', 'data-kind': 'search' },
            h('button', {
              type: 'button', 'aria-pressed': searching, disabled: state.busy || off, title: off ? t('tools.blocked') : t(web ? 'toggle.search.on' : 'toggle.search.off'),
              onClick: () => void flip('sessionWeb', !web),
              'aria-label': t('toggle.search'),
            }, icon('search'), h('span', { className: 'lbl' }, t('toggle.search')), level(searchDepth)),
            h(DepthButton, { t, kind: 'search', depth: searchDepth, pressed: searching, disabled: off, busy: state.busy, onPick: (depth) => void setDepth('searchDepth', depth) })),
          h('span', { className: 'pair', 'data-kind': 'research' },
            h('button', {
              type: 'button', 'aria-pressed': research, disabled: state.busy || off, title: off ? t('tools.blocked') : t(research ? 'toggle.research.on' : 'toggle.research.off'),
              onClick: () => void flip('sessionResearch', research ? undefined : true),
              'aria-label': t('toggle.research'),
            }, icon('research'), h('span', { className: 'lbl' }, t('toggle.research')), level(researchDepth)),
            h(DepthButton, { t, kind: 'research', depth: researchDepth, pressed: research, disabled: off, busy: state.busy, onPick: (depth) => void setDepth('researchDepth', depth) })),
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
    const depthOf = (value) => (DEPTHS.includes(value) ? value : 'standard');

    /**
     * The small arrow beside the Search and the Deep research button, and its panel: a slider with
     * three steps (Quick, Standard, Thorough) and one line saying what the chosen step does.
     */
    function DepthButton({ t, kind, depth, pressed, disabled, busy, onPick, model, onModel }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 120, window.innerWidth - 332)), bottom: window.innerHeight - rect.top + 8 });
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
      const title = t(`depth.${kind}.title`);
      return h(React.Fragment, null,
        h('button', {
          ref: button, type: 'button', className: 'more', 'aria-pressed': pressed, 'aria-expanded': open, 'aria-haspopup': 'dialog', disabled,
          title: t(`depth.${kind}.open`).replace('{0}', t(`depth.${depth}`)), 'aria-label': t(`depth.${kind}.open`).replace('{0}', t(`depth.${depth}`)),
          onClick: () => setOpen(!open),
        }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M2 6.5 5 3.5 8 6.5' }))),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-mt-pop', role: 'dialog', 'aria-label': title, 'data-depth-kind': kind, style: { left: place.left, bottom: place.bottom } },
                h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
                h('div', { className: 'title' }, title),
                h('input', {
                  type: 'range', min: 0, max: 2, step: 1, value: DEPTHS.indexOf(depth), disabled: busy, 'aria-label': title, 'aria-valuetext': t(`depth.${depth}`),
                  onChange: (event) => onPick(DEPTHS[Number(event.target.value)] ?? 'standard'),
                }),
                h('div', { className: 'steps' }, DEPTHS.map((id) => h('button', { key: id, type: 'button', 'aria-current': String(id === depth), disabled: busy, onClick: () => onPick(id) }, t(`depth.${id}`)))),
                h('p', { className: 'hint' }, t(`depth.${kind}.${depth}`)),
                kind === 'research' ? h('p', { className: 'hint' }, t('depth.research.cap')) : null,
                kind === 'research' && onModel
                  ? h(React.Fragment, null,
                      h('div', { className: 'head' }, t('research.model.title')),
                      h('div', { className: 'seg', role: 'group', 'aria-label': t('research.model.title') },
                        ['same', 'roles'].map((id) => h('button', { key: id, type: 'button', 'aria-pressed': model === id, disabled: busy, onClick: () => onModel(id) }, t(`research.model.${id}`)))),
                      h('p', { className: 'hint' }, t(`research.model.${model}.hint`)))
                  : null,
                h('p', { className: 'hint' }, t('depth.note'))),
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
        const timer = setInterval(() => { if (!document.hidden) load(); }, open ? 3000 : 15000);
        return () => { alive = false; clearInterval(timer); };
      }, [sessionId, open, policy]);
      useEffect(() => {
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
              h('div', { ref: panel, className: 'dsh-mt-pop', role: 'dialog', 'aria-label': t('helpers.head'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
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
      useEffect(() => {
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
        const timer = setInterval(load, 3000);
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          alive = false;
          clearInterval(timer);
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
              h('div', { ref: panel, className: 'dsh-mt-pop', role: 'dialog', 'aria-label': t('toggle.tools.title'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
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
                      h('div', { className: 'head' }, `${t('tools.cannot')} (${list.cannot.length})`),
                      names(list.cannot, true))
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
      const [answer, setAnswer] = useState({ rerun: true, thumbs: false });
      const nextKey = React.useRef(1);

      const adopt = useCallback((view) => {
        const stored = parseModes(view.modes);
        const invalid = stored === null;
        const base = invalid || Object.keys(stored).length === 0 ? BUILTIN : stored;
        setRows(toRows(base));
        setBroken(invalid);
        setDefaultMode(typeof view.defaultMode === 'string' ? view.defaultMode : 'cowork');
        setAnswer({ rerun: view.rerunButton !== false, thumbs: view.hideFeedback === true });
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

      // The two switches save at once; they do not wait for the Save button and leave unsaved mode edits alone.
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          void refreshAnswerFlags(appCtx);
        } catch (error) {
          setAnswer((prev) => ({ ...prev, [key]: !on }));
          setMessage({ text: `${t('save.failed')}: ${error?.message ?? error}`, bad: true });
        }
      };
      const Toggle = (title, hint, on, onChange) =>
        h('div', { className: 'dsh-me-toggle' }, h('div', null, h('b', null, title), h('span', null, hint)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-me-sw', 'aria-checked': on, 'aria-label': title, onClick: () => onChange(!on) }));

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
        h('div', { className: 'dsh-me-group' }, t('answer.group')),
        h('div', null,
          Toggle(t('answer.rerun'), t('answer.rerun.hint'), answer.rerun, (on) => void flipAnswer('rerunButton', 'rerun', on)),
          Toggle(t('answer.thumbs'), t('answer.thumbs.hint'), answer.thumbs, (on) => void flipAnswer('hideFeedback', 'thumbs', on))),
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
                placeholder: row.id === 'code' ? t('f.prompt.code') : undefined,
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
