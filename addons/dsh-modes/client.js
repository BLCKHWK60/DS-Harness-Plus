window.__ModuleLoader__.load({
  id: '@local/dsh-modes',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState, useLayoutEffect } = React;

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
        'answer.group': 'Buttons under an answer',
        'web.label': 'Web',
        'depth.label': 'Depth',
        'depth.title': 'Depth',
        'depth.open': 'Depth: {0}. Click to change.',
        'depth.open.lens': 'Depth: {0}, Lens: {1}. Click to change.',
        'lens.title': 'Lens: how the answer is worded',
        'depth.long.title': 'Beyond Thorough',
        'depth.long': 'Long run settings…',
        'depth.long.hint': 'Time, laps and tools for a Long run in this chat, saved. Run (next to Send) starts one with what you typed; Send stays at the depth above.',
        'depth.long.short': 'For the Run button',
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
        'long.group': 'Long run tools',
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
        'web.title': 'Web access',
        'web.open': 'Web access: {0}. Click to change.',
        'web.off': 'Off',
        'web.quick': 'Quick',
        'web.standard': 'Standard',
        'web.thorough': 'Thorough',
        'web.deep': 'Deep',
        'web.off.hint': 'No web search or page reading, and no other tools or programs that go online, such as Finance\'s data tools or an outside image service. Connectors stay on and can still reach the internet. The model answers from what it knows and from your files.',
        'web.quick.hint': 'One search, answer from the results. Fastest.',
        'web.standard.hint': 'A few searches; opens the pages that matter.',
        'web.thorough.hint': 'Several searches; reads at least 5 pages from different sites and cites each.',
        'web.deep.hint': '10+ searches, at least 10 pages read, facts cross-checked between sources. Slower.',
        'web.note': 'For this conversation only: whether the model may go online. How much it searches is set by Depth. In-depth research with many helpers is in the Research tab.',
        'web.on': 'On',
        'web.on.hint': 'The model may search the web, read pages and use other tools and programs that go online. How much it searches is set by Depth.',
        'web.always': 'Always on',
        'web.always.open': 'Web access: {0}. Fixed in this tab.',
        'web.always.hint': 'Always on in this tab: searching is its work. Only the Tools switch takes the web away. How much it searches is set by Depth.',
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
        'long.group': '长时运行的工具',
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
        'web.title': '联网访问',
        'web.open': '联网访问：{0}。点击更改。',
        'web.off': '关闭',
        'web.quick': '快速',
        'web.standard': '标准',
        'web.thorough': '深入',
        'web.deep': '深度',
        'web.off.hint': '不搜索、不读网页，其他联网的工具和程序（例如财经的数据工具或外部图像服务）也会关闭。连接器仍然开启，仍可访问互联网。模型根据已有知识和你的文件回答。',
        'web.quick.hint': '一次搜索，根据结果回答。最快。',
        'web.standard.hint': '几次搜索；打开关键页面。',
        'web.thorough.hint': '多次搜索；阅读至少 5 个不同网站的页面并逐一注明出处。',
        'web.deep.hint': '10 次以上搜索，至少阅读 10 个页面，在不同来源间交叉核实事实。较慢。',
        'web.note': '仅对本对话生效：模型是否可以联网。搜索多少由细致度决定。多助手的深入研究请使用"研究"标签页。',
        'web.on': '开启',
        'web.on.hint': '模型可以搜索网页、阅读页面，并使用其他联网的工具和程序。搜索多少由细致度决定。',
        'web.always': '始终开启',
        'web.always.open': '联网访问：{0}。此标签页中固定。',
        'web.always.hint': '此标签页中始终开启：搜索就是它的工作。只有工具开关能关闭联网。搜索多少由细致度决定。',
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
      // The copy keeps the conversation's own choices too, so the same question runs the same way
      // (with Web Off it stays off): its mode, Web choice and level, Tools switch, helpers' model
      // and the tools it added.
      // A copy that carries earlier turns of an isolated conversation (Recon) is isolated for good
      // too: it holds what that conversation read. A copy of the first question carries none.
      // A copy with earlier turns also has their access level, so it keeps the level to go back to.
      const CARRIED = ['sessionModes', 'sessionWeb', 'sessionSearchDepth', 'sessionDepth', 'sessionLens', 'sessionTools', 'sessionHelpers', 'sessionToolSets', ...(plan.cut !== undefined ? ['sessionIsolated', 'sessionSandboxBase'] : [])];
      const fresh = await load(appCtx);
      const carried = CARRIED.filter((field) => (field === 'sessionIsolated' ? readObject(fresh.value[field])[sessionId] === true : readObject(fresh.value[field])[sessionId] !== undefined));
      if (carried.length > 0) {
        const build = (value) => carried.map((field) => ({ op: 'set', path: [field], value: JSON.stringify({ ...readObject(value[field]), [child]: readObject(fresh.value[field])[sessionId] }) }));
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
@media (hover:hover){.dsh-mt button:hover:not([aria-pressed='true']):not([aria-disabled='true']){background:var(--dsw-alias-interactive-bg-hover)}.dsh-mt .pair[data-fixed] button[aria-pressed='false']{opacity:.5}}
@media (max-width:760px){.dsh-mt button{padding:0 8px}.dsh-mt button .lbl{display:none}}
.dsh-mt svg{flex:none}
.dsh-mt .pair{display:inline-flex;align-items:center}
.dsh-mt .pair > button:first-child{border-top-right-radius:0;border-bottom-right-radius:0}
.dsh-mt .pair > button:only-child{border-radius:14px}
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
.dsh-mt[data-f3] .pair[data-kind='depth'] .lbl{display:none}
.dsh-mt[data-f4] .pair[data-kind='search'] .lbl{display:none}
.dsh-mt[data-f5] button:not(.more){padding:0 6px}
.dsh-mt[data-f5] .pair > button.more{width:16px}
.dsh-mt .pair .lvl{opacity:.8}
.dsh-mt-pop .title{font-size:14px;line-height:22px;font-weight:500}
.dsh-mt-pop .opts{display:flex;flex-direction:column;gap:2px;margin:8px -6px 0}
.dsh-mt-pop .opts button{display:block;width:100%;text-align:left;border:0;border-radius:10px;padding:7px 10px;background:transparent;font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary)}
.dsh-mt-pop .opts button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mt-pop .opts button[aria-current='true']{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)}
.dsh-mt-pop .opts b{display:block;font-size:13px;line-height:18px;font-weight:600}
.dsh-mt-pop .opts small{display:block;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
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
.dsh-mt-pop[data-slim]{width:272px;padding:12px 14px}
.dsh-mt-pop[data-slim] .title{font-size:13px;line-height:20px}
.dsh-mt-pop[data-slim] .opts{margin-top:4px}
.dsh-mt-pop[data-slim] .opts button{display:flex;align-items:baseline;gap:8px;padding:6px 10px}
.dsh-mt-pop[data-slim] .opts b{flex:none}
.dsh-mt-pop[data-slim] .opts small{flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-mt-pop[data-slim] .title + .chips, .dsh-mt-pop[data-slim] .sep{margin-top:10px}
.dsh-mt-pop[data-slim] .sep{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:8px}
.dsh-mt-tip{position:fixed;z-index:1001;box-sizing:border-box;max-width:300px;padding:8px 10px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)));color:var(--dsw-alias-label-primary);font-size:12px;line-height:17px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none}
.dsh-mt-pop .head{margin:12px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-mt-pop .names{display:flex;flex-wrap:wrap;gap:4px}.dsh-mt-pop .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.dsh-mt-pop .chips button{padding:3px 10px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font:inherit;cursor:pointer}.dsh-mt-pop .chips button[aria-selected='true']{background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);border-color:transparent;font-weight:500}.dsh-mt-pop .chips button:hover:not([aria-selected='true']){background:var(--dsw-alias-interactive-bg-hover)}
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
        void refresh();
        const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 4000);
        return () => clearInterval(timer);
      }, [refresh, sessionId]);

      // The buttons shrink to keep the chat box's bottom row on one line: first the step's name goes,
      // then the buttons' names (icons stay), then the padding. It is measured, not guessed from the
      // window's width, because the row also holds the app's own buttons and the model's name.
      const root = useRef(null);
      const shown = state.status === 'ready' && Boolean(sessionId) && state.view?.sessionWeb !== undefined;
      const marks = shown ? `${state.view.searchDepth}|${state.view.sessionSearchDepth}|${state.view.sessionDepth}|${state.view.sessionLens}|${state.view.sessionWeb}|${state.view.sessionTools}` : '';
      useLayoutEffect(() => {
        const el = root.current;
        if (!el) return undefined;
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
            if (first && !crowded(first)) return;
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
      // Research and Scout always have the web and search in their own way: a fixed "Always on" label there.
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

      return h(React.Fragment, null,
        h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
        h('span', { className: 'dsh-mt', ref: root },
          // Research and Scout always have the web (searching is their work): a fixed label, Off only with tools off.
          // A Recon conversation moved into another tab is locked by the host with no tools at all: Off.
          researchTab ? h(WebAlways, { t, off: off || lockedHere }) : h(WebButton, { t, level: webLevelOf(off, web), disabled: off, busy: state.busy, onPick: (picked) => void pickSetting('web', picked) }),
          // Depth: how much work this conversation gets (how much it searches, helpers, planning, checks,
          // reviews; in Research and Scout also the size of a research run). The same in every tab (the
          // owner's rule); only its list texts fit the tab. Not while all tools are off (nothing is sent then).
          off ? null : h(DepthButton, {
            t, depth: sessionDepthNow, kind: depthKind(modeDef), busy: state.busy,
            lens: lensNow(state.view, sessionId), own: ownLensesOf(state.view.ownLenses), webOff: !researchTab && !web,
            onPick: (picked) => void pickSetting('depth', picked),
            onPickLens: (picked) => void pickSetting('lens', picked),
            // The last stop opens Mission's Long run card (Long run part, step 61): every tab but Recon (also a Recon
            // conversation moved elsewhere), and only while Mission is on.
            onLongRun: depthKind(modeDef) !== 'isolated' && !lockedHere && missionHere ? () => window.dispatchEvent(new CustomEvent('dsh-mission:long', { detail: { sessionId } })) : undefined,
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
    /** @returns {'on' | 'off'} what the Web button shows: Off while all tools are off or the web is. */
    function webLevelOf(off, web) {
      return off || !web ? 'off' : 'on';
    }
    /**
     * The settings a pick writes: Web On or Off for this conversation only (how much it searches is
     * Depth); a Depth for this conversation, which is also where new conversations start.
     */
    function settingOps(kind, picked, current, sessionId) {
      if (kind === 'web') {
        const webs = { ...readObject(current.sessionWeb), [sessionId]: picked === 'on' };
        return [{ op: 'set', path: ['sessionWeb'], value: JSON.stringify(webs) }];
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
    // Since 0.59.0 the Web button is only On or Off; how much the model searches is Depth.
    const LEVELS = ['off', 'on'];

    /** The Web button in the chat box, and its list: Off and On. */
    function WebButton({ t, level, disabled, busy, onPick }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      // Placed before the list is drawn, so it never shows for a moment in the corner while the page is busy.
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 332)), bottom: window.innerHeight - rect.top + 8 });
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
      const name = t(`web.${level}`);
      return h('span', { className: 'pair', 'data-kind': 'search' },
        h('button', {
          ref: button, type: 'button', 'aria-pressed': level !== 'off', 'aria-expanded': open, 'aria-haspopup': 'dialog', disabled: disabled || busy,
          title: disabled ? t('tools.blocked') : t('web.open').replace('{0}', name), 'aria-label': t('web.open').replace('{0}', name),
          onClick: () => setOpen(!open),
        }, icon('search'), h('span', { className: 'lbl' }, t('web.label')), h('span', { className: 'lbl lvl' }, `· ${name}`)),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-mt-pop', role: 'dialog', 'aria-label': t('web.title'), style: { left: place.left, bottom: place.bottom } },
                h('style', { dangerouslySetInnerHTML: { __html: TOGGLE_CSS } }),
                h('div', { className: 'title' }, t('web.title')),
                h('div', { className: 'opts', role: 'listbox', 'aria-label': t('web.title') },
                  LEVELS.map((id) => h('button', { key: id, type: 'button', role: 'option', 'aria-selected': id === level, 'aria-current': String(id === level), disabled: busy, onClick: () => { setOpen(false); onPick(id); } },
                    h('b', null, t(`web.${id}`)), h('small', null, t(`web.${id}.hint`))))),
                h('p', { className: 'hint' }, t('web.note'))),
              document.body,
            )
          : null);
    }

    /**
     * Research's and Scout's Web label (step 21): the web is always on there, so it reads "Always on"
     * (Off while the Tools switch is off), has no list, and cannot be changed; its hint says why.
     */
    function WebAlways({ t, off }) {
      const name = t(off ? 'web.off' : 'web.always');
      return h('span', { className: 'pair', 'data-kind': 'search', 'data-fixed': '' },
        h('button', {
          type: 'button', 'aria-pressed': !off, 'aria-disabled': 'true',
          title: off ? t('tools.blocked') : t('web.always.hint'), 'aria-label': t('web.always.open').replace('{0}', name),
          style: { cursor: 'default' },
        }, icon('search'), h('span', { className: 'lbl' }, t('web.label')), h('span', { className: 'lbl lvl' }, `· ${name}`)));
    }

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
      const node = tip ? h('div', { className: 'dsh-mt-tip', role: 'tooltip', style: { top: tip.top, left: tip.left } }, tip.text) : null;
      return { tipFor, tip: node, clear };
    }

    function DepthButton({ t, depth, kind, lens = 'default', own = [], webOff = false, busy, onPick, onPickLens, onLongRun }) {
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
          ref: button, type: 'button', 'aria-expanded': open, 'aria-haspopup': 'dialog', disabled: busy, 'data-depth': depth, 'data-lens': lens,
          title: open_, 'aria-label': open_,
          onClick: () => setOpen(!open),
        }, icon('depth'), h('span', { className: 'lbl' }, t('depth.label')), h('span', { className: 'lbl lvl' }, lens === 'default' ? `· ${name}` : `· ${name} · ${lensName}`)),
        open
          ? ReactDOM.createPortal(
              h(React.Fragment, null,
                h('div', { ref: panel, className: 'dsh-mt-pop', 'data-slim': '', role: 'dialog', 'aria-label': t('depth.title'), style: { left: place.left, bottom: place.bottom, maxHeight: place.maxHeight } },
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
        const timer = setInterval(() => { if (!document.hidden) load(); }, open ? 3000 : 15000);
        return () => { alive = false; clearInterval(timer); };
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
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
      const [answer, setAnswer] = useState({ rerun: true, thumbs: false });
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
        setAnswer({ rerun: view.rerunButton !== false, thumbs: view.hideFeedback === true });
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setLoaded((prev) => ({ ...prev, revision: result.value.revision }));
          void refreshAnswerFlags(appCtx);
        } catch (error) {
          setAnswer((prev) => ({ ...prev, [key]: !on }));
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
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
        h('div', { className: 'dsh-me-group' }, t('own.group')),
        h(OwnLenses, { t, saved: general.ownLenses ?? [], onSave: (list) => saveNow('ownLenses', list) }),
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

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('modes', DICT));
        const t = ctx.locale.bind('modes');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'modes', order: 100, label: () => t('section.title') },
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
