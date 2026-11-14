// Cowork sidebar: the browser half. It fills the layout's `sidebar` seat (the app's own sidebar is
// switched off by this bundle's patch while this row is on) and declares the same child seats, so
// the app's Projects list (`sidebar.workspaces`), Settings (`sidebar.settings`), footer actions,
// brand, More menu actions and every plugin's page row (`sidebar.panellist`) keep working inside it.
window.__ModuleLoader__.load({
  id: '@local/dsh-cowork-shell',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    /** The app's UI library when the page exposes it; every use has a plain fallback. */
    let UI = {};
    try {
      UI = require('@deepseek-ai/dsh-client-ui-primitives') || {};
    } catch {
      UI = {};
    }

    const NS = 'coworkShell';
    const SETTINGS_NS = 'cowork-shell';
    const MODES_NS = 'modes';
    const LOCAL_KEY = 'dsh-cowork-shell.tab';

    const DICT = {
      en: {
        'tabs.label': 'Workspace type',
        'new.chat': 'New chat',
        'new.cowork': 'New task',
        'new.code': 'New code task',
        'new.other': 'New conversation',
        'pages.label': '{tab} sections',
        'more': 'More',
        'look.logos.hide': 'Hide DeepSeek logos',
        'look.logos.show': 'Show DeepSeek logos',
        'look.title.date': 'Show the date as the title',
        'look.title.greeting': 'Show the greeting as the title',
        'look.chat.wide': 'Wide chat area',
        'look.chat.normal': 'Normal chat area',
        'look.failed': 'Could not save that setting.',
        'toggle.open': 'Open sidebar',
        'toggle.collapse': 'Collapse sidebar',
        'brand': 'DeepSeek Harness',
        'tab.failed': 'Could not switch to {tab}',
        'connectors.title': 'Connectors',
        'connectors.hint': 'Apps and data sources the assistant can use, through MCP servers. A switched-off connector keeps its settings.',
        'connectors.empty': 'No connectors yet. Add one below, or copy one from the MCP starter pack (templates/mcp-starter in DeepSeek Harness Plus).',
        'connectors.unavailable': 'The connector list could not be read.',
        'connectors.on': 'On',
        'connectors.noSwitch': 'The on/off switch is not available here; use the Plugins page.',
        'connectors.failed': 'Could not switch: {message}',
        'connectors.restartNeeded': 'Saved. Restart DeepSeek Harness for this to take effect.',
        'connectors.switchFailed': 'The app could not apply the switch.',
        'connectors.overridden': 'Your settings file overrides this switch.',
        'status.connected': 'Connected · {n} tools',
        'status.connected.one': 'Connected · 1 tool',
        'status.notConnected': 'No tools yet',
        'status.notConnected.hint': 'Still starting, or it failed to start. Check the program or address, and any key it needs.',
        'status.disabled': 'Off',
        'add.title': 'Add a connector',
        'add.name': 'Name (letters, digits, - or _)',
        'add.kind': 'Type',
        'add.kind.stdio': 'Program on this Mac',
        'add.kind.http': 'Web address',
        'add.command': 'Program to run (for example npx)',
        'add.args': 'Arguments, one per line',
        'add.url': 'Address (https://…)',
        'add.make': 'Make the settings lines',
        'add.paste': 'Quit DeepSeek Harness, paste these lines at the end of ~/.dsh/profiles/desktop/cordis.patch.yml (keep a copy of the file first), and open the app again. The connector then appears above with its own switch.',
        'add.copy': 'Copy',
        'add.copied': 'Copied.',
        'add.note': 'Keys and tokens never go in this form. If a connector needs one, add it to the settings lines as ${credential:NAME} and store the key in Settings → Models or your keychain.',
        'add.bad.name': 'Use 1–32 letters, digits, - or _, not already used.',
        'add.bad.target': 'Fill in the program or the address.',
        'skills.title': 'Skills',
        'skills.hint': 'Instructions the assistant can load for a kind of task. You can also start one by typing / in the chat box. These are the skills found for your default folder; a project can add its own.',
        'skills.search': 'Search skills',
        'skills.empty': 'No skills found.',
        'skills.unavailable': 'The skill list could not be read.',
        'skills.model': 'assistant can use',
        'skills.user': '/ command',
        'refresh': 'Refresh',
        'chips.label': 'Suggestions',
        'untitled': 'New conversation',
        'running': 'Running',
        'needs.title': 'Needs you ({n})',
        'needs.approval': 'Waiting for your approval',
        'needs.plan-review': 'Plan waiting for your review',
        'needs.question': 'Waiting for your answer',
        'move.to': 'Move to {tab}',
        'move.label': 'Move "{title}" to another tab',
        'move.failed': 'Could not move the conversation.',
        'archive': 'Archive',
        'archive.failed': 'Could not archive the conversation.',
        'archive.running': 'This conversation is still working. Stop it and archive it?',
        'archived.title': 'Archived ({n})',
        'archived.restore': 'Restore',
        'archived.restore.label': 'Restore "{title}"',
        'archived.restore.failed': 'Could not restore the conversation.',
        'delete': 'Delete',
        'delete.label': 'Delete "{title}"',
        'delete.confirm': 'Delete "{title}"?\n\nIt goes to the trash. You can put it back for 30 days. After that it is gone for good.',
        'delete.running': 'This conversation is still working. Stop it and delete it?',
        'delete.failed': 'Could not delete the conversation.',
        'trash.title': 'Trash ({n})',
        'trash.left': '{n}d left',
        'trash.back': 'Put back',
        'trash.back.label': 'Put "{title}" back',
        'trash.back.failed': 'Could not put the conversation back.',
        'promote.to': 'Promote to {tab}',
        'promote.label': 'Promote or continue "{title}"',
        'continue.open': 'Continue in a project…',
        'continue.title': 'Continue in a project',
        'continue.as': 'Start as',
        'continue.none': 'No projects yet. Add one from the Cowork or Code tab.',
        'continue.back': 'Back',
        'continue.prompt': 'Continue from my chat {mention}. ',
        'continue.failed': 'Could not start the new conversation.',
        'proj.move': 'Move all conversations of "{title}" to another tab',
        'proj.new': 'New conversation in this project',
        'proj.add': 'New',
        'proj.add.path': 'The full path of the project\'s folder:',
        'proj.add.hint': 'Pick a folder. It becomes a project with its own files, instructions and conversations.',
        'proj.add.failed': 'The project could not be added: {message}',
        'proj.open': 'Project page: files and instructions',
        'proj.page.none': 'Pick a project in the sidebar, or add one with + New.',
        'proj.page.folder': 'Folder',
        'proj.page.newconv': 'New conversation',
        'proj.page.name': 'Name',
        'proj.page.rename': 'Rename',
        'proj.page.tab': 'Shows under',
        'proj.page.instr': 'Instructions',
        'proj.page.instr.hint': 'What the assistant should know and do in every conversation of this project. A file named AGENTS.md or CLAUDE.md in the folder is read as well.',
        'proj.page.instr.place': 'For example: who this work is for, the tone to write in, what to check before finishing.',
        'proj.page.save': 'Save',
        'proj.page.saved': 'Saved. New messages in this project use it.',
        'proj.page.failed': 'That did not work: {message}',
        'proj.page.files': 'Files',
        'proj.page.files.hint': 'The files in the project folder. Files you add are copied into that folder; your originals stay where they are.',
        'proj.page.files.add': 'Add files',
        'proj.page.files.none': 'The folder has no files yet.',
        'proj.page.files.more': 'Only the newest {n} files are listed.',
        'proj.page.files.added': 'Added: {names}',
        'proj.page.files.busy': 'Copying…',
        'proj.page.convs': 'Conversations',
        'proj.page.convs.none': 'No conversations in this project yet.',
        'type.title': 'Type',
        'type.title.new': 'What kind of project is this?',
        'type.hint': 'A type gives the project ready-made instructions for that kind of work. They are a starting point: change them as you like. Blank adds nothing.',
        'type.applied': '{name}: its instructions are in place. Change them below as you like.',
        'type.blank': 'Blank: no instructions from a type.',
        'type.only': 'The type is now {name}. Your instructions were left as they are.',
        'type.preview': 'The instructions of "{name}". You already have instructions of your own:',
        'type.replace': 'Replace mine with these',
        'type.keep': 'Keep mine, only change the type',
        'type.cancel': 'Cancel',
        'type.own': 'yours',
        'type.remove': 'Remove this preset',
        'type.remove.sure': 'Remove your preset "{name}"?\n\nProjects that use it keep their instructions.',
        'type.removed': 'Preset removed.',
        'type.keepas': 'Save as my preset…',
        'type.keepas.name': 'A name for the preset',
        'type.keepas.save': 'Save preset',
        'type.keepas.done': 'Saved as your preset "{name}". It is offered for every new project.',
        'type.keepas.hint': 'Keeps these instructions as a type of your own, for other projects.',
        'type.tool.data.on': 'This type uses the Data tools for tables (CSV, Excel). They are available.',
        'type.tool.data.off': 'This type can use the Data tools for tables (CSV, Excel). They are switched off: Settings → Data → Show the Data tab.',
        'type.tool.finance.on': 'This type uses the Finance tools for company and economy figures. They are available.',
        'type.tool.finance.off': 'This type can use the Finance tools for company and economy figures. They are switched off: Settings → Finance → Show the Finance tab.',
        'type.search.off': 'New conversations in this project start with Search and Deep research off, so your papers do not turn into web queries. You can switch them on in the chat box.',
        'gen.open': 'Generate with a model…',
        'gen.title': 'Write the instructions with a model',
        'gen.hint': 'A model reads a summary of this folder and the project\'s type, and writes instructions for this project. It gets no tools: it cannot open, change or delete anything. You see the result before anything is saved.',
        'gen.model': 'Model',
        'gen.model.none': 'Pick a model…',
        'gen.what.full': 'File names and the start of text files',
        'gen.what.names': 'File names only',
        'gen.sent': 'What would be sent: the names of {files} files{more}, and the start of {included} text files. About {chars} characters in all.',
        'gen.sent.names': 'What would be sent: the names of {files} files{more}. No contents. About {chars} characters in all.',
        'gen.sent.empty': 'The folder is empty. The instructions will be written from the project\'s type alone.',
        'gen.sent.more': ' (and more)',
        'gen.sent.files': 'Text taken from: {names}',
        'gen.secrets': 'Left out because they look like secrets: {names}',
        'gen.guides': '{names} is in the folder. The app already gives it to the assistant; it is sent along so the new instructions fit beside it.',
        'gen.where.local': 'This model runs on this computer. Nothing leaves it.',
        'gen.where.network': 'This model runs at {host}, in your own network.',
        'gen.where.cloud': 'This model runs on the internet ({host}). Everything listed above will be sent to it.',
        'gen.where.unknown': 'Plus cannot tell where this model runs. Treat it as a service on the internet: everything listed above may leave this computer.',
        'gen.agree': 'Yes, send this to {name}',
        'gen.run': 'Generate',
        'gen.running': 'The model is writing… this can take a minute.',
        'gen.close': 'Close',
        'gen.result': 'What {model} wrote. Lines marked + are new, lines marked − would go. Nothing is saved yet.',
        'gen.result.first': 'What {model} wrote. Nothing is saved yet.',
        'gen.same': 'The model wrote the same instructions you already have.',
        'gen.ideas': 'Ideas for this project',
        'gen.use': 'Use these instructions',
        'gen.used': 'The new instructions are in the box. Change them if you like, then press Save.',
        'gen.discard': 'Discard',
        'gen.drift': 'The folder has changed since these instructions were generated ({added} files new, {removed} gone). You may want to generate them again.',
        'ver.open': 'Earlier versions ({n})',
        'ver.title': 'Earlier versions',
        'ver.by.you': 'You',
        'ver.by.type': 'Type',
        'ver.by.model': 'Model',
        'ver.current': 'in use',
        'ver.back': 'Put back',
        'ver.backed': 'That version is in the box. Press Save to use it.',
        'proj.title': 'Project',
        'show.more': 'Show {n} more',
        'lib.title.chat': 'Recent chats',
        'lib.title.cowork': 'Projects',
        'lib.title.code': 'Code projects',
        'lib.title.other': '{tab}',
        'lib.all': 'Show all',
        'lib.all.hint': 'Show every project and conversation, with search and the app\'s menus',
        'lib.showingAll': 'All conversations',
        'lib.mine': '{tab} only',
        'lib.empty': 'Nothing in {tab} yet. New conversations you start here show up in this list.',
        'lib.loose': 'Other conversations',
        'ago.now': 'now',
        'ago.m': '{n}m',
        'ago.h': '{n}h',
        'ago.d': '{n}d',
      },
      zh: {
        'tabs.label': '工作区类型',
        'new.chat': '新对话',
        'new.cowork': '新任务',
        'new.code': '新编码任务',
        'new.other': '新会话',
        'pages.label': '{tab} 分区',
        'more': '更多',
        'look.logos.hide': '隐藏 DeepSeek 标志',
        'look.logos.show': '显示 DeepSeek 标志',
        'look.title.date': '用日期作标题',
        'look.title.greeting': '用问候语作标题',
        'look.chat.wide': '加宽对话区域',
        'look.chat.normal': '恢复对话区域宽度',
        'look.failed': '无法保存该设置。',
        'toggle.open': '打开侧边栏',
        'toggle.collapse': '收起侧边栏',
        'brand': 'DeepSeek Harness',
        'tab.failed': '无法切换到 {tab}',
        'connectors.title': '连接器',
        'connectors.hint': '助手可通过 MCP 服务器使用的应用和数据源。关闭的连接器会保留设置。',
        'connectors.empty': '还没有连接器。在下方添加，或从 MCP 入门包复制（DeepSeek Harness Plus 的 templates/mcp-starter）。',
        'connectors.unavailable': '无法读取连接器列表。',
        'connectors.on': '开启',
        'connectors.noSwitch': '这里无法使用应用的插件开关，请到插件页面操作。',
        'connectors.failed': '无法切换：{message}',
        'connectors.restartNeeded': '已保存。重启 DeepSeek Harness 后生效。',
        'connectors.switchFailed': '应用无法完成切换。',
        'connectors.overridden': '你的设置文件覆盖了这个开关。',
        'status.connected': '已连接 · {n} 个工具',
        'status.connected.one': '已连接 · 1 个工具',
        'status.notConnected': '暂无工具',
        'status.notConnected.hint': '仍在启动，或启动失败。请检查程序或地址，以及所需的密钥。',
        'status.disabled': '已关闭',
        'add.title': '添加连接器',
        'add.name': '名称（字母、数字、- 或 _）',
        'add.kind': '类型',
        'add.kind.stdio': '本机程序',
        'add.kind.http': '网址',
        'add.command': '要运行的程序（例如 npx）',
        'add.args': '参数，每行一个',
        'add.url': '地址（https://…）',
        'add.make': '生成设置内容',
        'add.paste': '退出 DeepSeek Harness，把这些行粘贴到 ~/.dsh/profiles/desktop/cordis.patch.yml 末尾（先备份该文件），再打开应用。连接器会出现在上方，并有自己的开关。',
        'add.copy': '复制',
        'add.copied': '已复制。',
        'add.note': '不要在此表单中输入密钥或令牌。如需密钥，在设置内容中写 ${credential:名称}，并把密钥保存在 设置 → 模型 或钥匙串中。',
        'add.bad.name': '请使用 1–32 个字母、数字、- 或 _，且不能重复。',
        'add.bad.target': '请填写程序或地址。',
        'skills.title': '技能',
        'skills.hint': '助手可按任务类型加载的说明。也可以在聊天框输入 / 来使用。这里列出默认文件夹可用的技能；项目可以有自己的技能。',
        'skills.search': '搜索技能',
        'skills.empty': '没有找到技能。',
        'skills.unavailable': '无法读取技能列表。',
        'skills.model': '助手可用',
        'skills.user': '/ 命令',
        'refresh': '刷新',
        'chips.label': '建议',
        'untitled': '新对话',
        'running': '运行中',
        'needs.title': '等你处理（{n}）',
        'needs.approval': '等待你的批准',
        'needs.plan-review': '计划等待你审阅',
        'needs.question': '等待你的回答',
        'move.to': '移到 {tab}',
        'move.label': '把“{title}”移到其他标签页',
        'move.failed': '无法移动该对话。',
        'archive': '归档',
        'archive.failed': '无法归档该对话。',
        'archive.running': '该对话仍在运行。要停止并归档吗？',
        'archived.title': '已归档（{n}）',
        'archived.restore': '恢复',
        'archived.restore.label': '恢复“{title}”',
        'archived.restore.failed': '无法恢复该对话。',
        'delete': '删除',
        'delete.label': '删除“{title}”',
        'delete.confirm': '删除“{title}”？\n\n它会进入废纸篓，30 天内可以放回，之后将永久删除。',
        'delete.running': '该对话仍在运行。要停止并删除吗？',
        'delete.failed': '无法删除该对话。',
        'trash.title': '废纸篓（{n}）',
        'trash.left': '剩 {n} 天',
        'trash.back': '放回',
        'trash.back.label': '放回“{title}”',
        'trash.back.failed': '无法放回该对话。',
        'promote.to': '升级为 {tab}',
        'promote.label': '升级或继续“{title}”',
        'continue.open': '在项目中继续…',
        'continue.title': '在项目中继续',
        'continue.as': '开始为',
        'continue.none': '还没有项目。请在 Cowork 或 Code 标签页中添加。',
        'continue.back': '返回',
        'continue.prompt': '接着我的聊天 {mention} 继续。',
        'continue.failed': '无法开始新对话。',
        'proj.move': '把“{title}”的所有对话移到其他标签页',
        'proj.new': '在此项目中新建对话',
        'proj.add': '新建',
        'proj.add.path': '项目文件夹的完整路径：',
        'proj.add.hint': '选择一个文件夹。它会成为一个项目，拥有自己的文件、指令和对话。',
        'proj.add.failed': '无法添加项目：{message}',
        'proj.open': '项目页面：文件和指令',
        'proj.page.none': '在侧边栏选择一个项目，或用“新建项目”添加。',
        'proj.page.folder': '文件夹',
        'proj.page.newconv': '新对话',
        'proj.page.name': '名称',
        'proj.page.rename': '重命名',
        'proj.page.tab': '显示在',
        'proj.page.instr': '指令',
        'proj.page.instr.hint': '助手在此项目的每个对话中应了解和遵守的内容。文件夹中名为 AGENTS.md 或 CLAUDE.md 的文件也会被读取。',
        'proj.page.instr.place': '例如：这项工作为谁而做、写作语气、完成前要检查什么。',
        'proj.page.save': '保存',
        'proj.page.saved': '已保存。此项目中的新消息会使用它。',
        'proj.page.failed': '操作失败：{message}',
        'proj.page.files': '文件',
        'proj.page.files.hint': '项目文件夹中的文件。添加的文件会复制到该文件夹；原文件保持不变。',
        'proj.page.files.add': '添加文件',
        'proj.page.files.none': '文件夹中还没有文件。',
        'proj.page.files.more': '仅列出最新的 {n} 个文件。',
        'proj.page.files.added': '已添加：{names}',
        'proj.page.files.busy': '正在复制…',
        'proj.page.convs': '对话',
        'proj.page.convs.none': '此项目中还没有对话。',
        'type.title': '类型',
        'type.title.new': '这是什么类型的项目？',
        'type.hint': '类型为项目提供适合该类工作的现成指令。它们只是起点，可以随意修改。“空白”不添加任何内容。',
        'type.applied': '{name}：其指令已就位，可在下方随意修改。',
        'type.blank': '空白：不使用类型指令。',
        'type.only': '类型已改为 {name}。你的指令保持不变。',
        'type.preview': '“{name}”的指令。你已有自己的指令：',
        'type.replace': '用这些替换我的指令',
        'type.keep': '保留我的指令，只更改类型',
        'type.cancel': '取消',
        'type.own': '我的',
        'type.remove': '删除此预设',
        'type.remove.sure': '删除你的预设“{name}”？\n\n使用它的项目会保留其指令。',
        'type.removed': '预设已删除。',
        'type.keepas': '保存为我的预设…',
        'type.keepas.name': '预设名称',
        'type.keepas.save': '保存预设',
        'type.keepas.done': '已保存为你的预设“{name}”。新建项目时可选用。',
        'type.keepas.hint': '把这些指令保存为你自己的类型，供其他项目使用。',
        'type.tool.data.on': '此类型使用数据工具处理表格（CSV、Excel）。工具可用。',
        'type.tool.data.off': '此类型可使用数据工具处理表格（CSV、Excel）。工具已关闭：设置 → 数据 → 显示数据标签页。',
        'type.tool.finance.on': '此类型使用财经工具获取公司和经济数据。工具可用。',
        'type.tool.finance.off': '此类型可使用财经工具获取公司和经济数据。工具已关闭：设置 → 财经 → 显示财经标签页。',
        'type.search.off': '此项目中的新对话默认关闭搜索和深度研究，以免你的文件内容变成网络查询。可在聊天框中开启。',
        'gen.open': '用模型生成…',
        'gen.title': '用模型撰写指令',
        'gen.hint': '模型会阅读此文件夹的摘要和项目类型，为该项目撰写指令。它没有任何工具，无法打开、修改或删除任何内容。保存前你会先看到结果。',
        'gen.model': '模型',
        'gen.model.none': '选择模型…',
        'gen.what.full': '文件名和文本文件的开头',
        'gen.what.names': '仅文件名',
        'gen.sent': '将发送：{files} 个文件的名称{more}，以及 {included} 个文本文件的开头。共约 {chars} 个字符。',
        'gen.sent.names': '将发送：{files} 个文件的名称{more}。不含内容。共约 {chars} 个字符。',
        'gen.sent.empty': '文件夹为空。将仅根据项目类型撰写指令。',
        'gen.sent.more': '（及更多）',
        'gen.sent.files': '文本取自：{names}',
        'gen.secrets': '因看起来像机密而排除：{names}',
        'gen.guides': '文件夹中有 {names}。应用已把它交给助手；一并发送是为了让新指令与之配合。',
        'gen.where.local': '此模型在本机运行。不会有任何内容离开本机。',
        'gen.where.network': '此模型运行于 {host}，在你自己的网络中。',
        'gen.where.cloud': '此模型在互联网上运行（{host}）。上面列出的所有内容都会发送给它。',
        'gen.where.unknown': 'Plus 无法判断此模型在哪里运行。请把它当作互联网服务：上面列出的内容可能离开本机。',
        'gen.agree': '是的，发送给 {name}',
        'gen.run': '生成',
        'gen.running': '模型正在撰写…可能需要一分钟。',
        'gen.close': '关闭',
        'gen.result': '{model} 撰写的内容。带 + 的行是新增的，带 − 的行将被删除。尚未保存。',
        'gen.result.first': '{model} 撰写的内容。尚未保存。',
        'gen.same': '模型撰写的指令与现有的相同。',
        'gen.ideas': '此项目的点子',
        'gen.use': '使用这些指令',
        'gen.used': '新指令已放入输入框。可随意修改，然后按“保存”。',
        'gen.discard': '放弃',
        'gen.drift': '自这些指令生成以来，文件夹已有变化（新增 {added} 个文件，减少 {removed} 个）。可以考虑重新生成。',
        'ver.open': '历史版本（{n}）',
        'ver.title': '历史版本',
        'ver.by.you': '你',
        'ver.by.type': '类型',
        'ver.by.model': '模型',
        'ver.current': '使用中',
        'ver.back': '恢复',
        'ver.backed': '该版本已放入输入框。按“保存”即可使用。',
        'proj.title': '项目',
        'show.more': '再显示 {n} 个',
        'lib.title.chat': '最近的聊天',
        'lib.title.cowork': '项目',
        'lib.title.code': '代码项目',
        'lib.title.other': '{tab}',
        'lib.all': '显示全部',
        'lib.all.hint': '显示所有项目和对话，包括搜索和应用菜单',
        'lib.showingAll': '全部对话',
        'lib.mine': '仅 {tab}',
        'lib.empty': '{tab} 中还没有内容。在这里新建的对话会出现在此列表。',
        'lib.loose': '其他对话',
        'ago.now': '刚刚',
        'ago.m': '{n} 分钟',
        'ago.h': '{n} 小时',
        'ago.d': '{n} 天',
      },
    };

    /** The tabs: the first modes up to the limit, then the modes other add-ons added. */
    const tabsOf = (state) => [...state.modes.slice(0, state.maxTabs), ...(state.extra ?? [])];

    const FALLBACK_MODES = [
      { id: 'chat', label: 'Chat' },
      { id: 'cowork', label: 'Cowork' },
      { id: 'code', label: 'Code' },
    ];
    const DEFAULT_TABS = {
      "chat": {
        "newLabel": "New chat",
        "pages": [
          "model-arena"
        ],
        "greeting": "Let's knock something off your list",
        "chips": []
      },
      "cowork": {
        "newLabel": "New task",
        "pages": [
          "schedules",
          "automations",
          "connectors",
          "skills"
        ],
        "greeting": "Let's knock something off your list",
        "chips": [
          {
            "label": "Create slides",
            "icon": "slides",
            "prompt": "Create a slide deck about: "
          },
          {
            "label": "Build website",
            "icon": "website",
            "prompt": "Build a website for: "
          },
          {
            "label": "Develop apps",
            "icon": "app",
            "prompt": "Help me develop an app that: "
          },
          {
            "label": "Spreadsheet",
            "icon": "spreadsheet",
            "prompt": "Make a spreadsheet that: "
          },
          {
            "label": "Visualization",
            "icon": "chart",
            "prompt": "Make a chart or visual that shows: "
          },
          {
            "label": "Wide research",
            "icon": "research",
            "prompt": "Research a list of items and put the findings in a table: "
          },
          {
            "label": "Create games",
            "icon": "game",
            "prompt": "Create a small game: "
          }
        ]
      },
      "code": {
        "newLabel": "New code task",
        "pages": [
          "connectors",
          "skills"
        ],
        "greeting": "What should we build?",
        "chips": [
          {
            "label": "Create slides",
            "icon": "slides",
            "prompt": "Create a slide deck about: "
          },
          {
            "label": "Build website",
            "icon": "website",
            "prompt": "Build a website for: "
          },
          {
            "label": "Develop apps",
            "icon": "app",
            "prompt": "Help me develop an app that: "
          },
          {
            "label": "Spreadsheet",
            "icon": "spreadsheet",
            "prompt": "Make a spreadsheet that: "
          },
          {
            "label": "Visualization",
            "icon": "chart",
            "prompt": "Make a chart or visual that shows: "
          },
          {
            "label": "Wide research",
            "icon": "research",
            "prompt": "Research a list of items and put the findings in a table: "
          },
          {
            "label": "Create games",
            "icon": "game",
            "prompt": "Create a small game: "
          }
        ]
      },
      "data": {
        "newLabel": "New analysis",
        "pages": [],
        "greeting": "What do you want to find out from your data?",
        "chips": [
          {
            "label": "What is here",
            "icon": "folder",
            "prompt": "List the data files in this folder and profile the tables: what each holds, how many rows, and anything that looks wrong."
          },
          {
            "label": "Summarise",
            "icon": "spreadsheet",
            "prompt": "Summarise the main table in this folder: the key figures, how they are spread, and what stands out."
          },
          {
            "label": "Trends",
            "icon": "chart",
            "prompt": "Show how the main figures in this data change over time, with a chart."
          },
          {
            "label": "Compare groups",
            "icon": "chart",
            "prompt": "Compare the main groups in this data with each other and say which differences matter."
          },
          {
            "label": "Check quality",
            "icon": "spark",
            "prompt": "Check this data for problems: empty cells, duplicates, outliers, odd formats and values that cannot be right."
          },
          {
            "label": "Run saved",
            "icon": "research",
            "prompt": "Run my saved analyses for this folder again and tell me what moved."
          }
        ]
      },
      "finance": {
        "newLabel": "New research",
        "pages": [],
        "greeting": "What do you want to look into?",
        "chips": [
          {
            "label": "Deep dive",
            "icon": "research",
            "prompt": "Do a full deep dive on the selected subject."
          },
          {
            "label": "Earnings review",
            "icon": "spreadsheet",
            "prompt": "Review the latest earnings of the selected company."
          },
          {
            "label": "News and mood",
            "icon": "spark",
            "prompt": "What are the news and social media saying about the selected subject right now?"
          },
          {
            "label": "Compare",
            "icon": "chart",
            "prompt": "Compare the selected company with its closest competitors."
          },
          {
            "label": "Sector scan",
            "icon": "research",
            "prompt": "Scan the sector of the selected subject: who is gaining, who is losing, and why?"
          },
          {
            "label": "Economy brief",
            "icon": "chart",
            "prompt": "Give me an economy brief for the selected market."
          },
          {
            "label": "What changed",
            "icon": "spark",
            "prompt": "What has changed for the selected subject in the last month?"
          }
        ]
      }
    };

    const CSS = `
.cws-root{--cws-pad:8px;display:flex;flex-direction:column;height:100%;padding:6px var(--cws-pad);box-sizing:border-box;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary);font-size:14px;overflow:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
html[data-platform='darwin'] .cws-root{background:transparent}
.cws-strip{flex:none;display:flex;align-items:center;justify-content:flex-end;height:52px;box-sizing:border-box;margin:-6px calc(-1 * var(--cws-pad)) 0;padding:0 12px 2px}
html[data-fullscreen] .cws-strip{justify-content:flex-start}
.cws-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit}
.cws-brand{display:flex;align-items:center;gap:8px;min-height:28px;padding:0 6px 10px;font-weight:600;font-size:13px;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.cws-strip + .cws-brand{margin-top:-8px}
.cws-tabs{display:flex;gap:2px;padding:3px;margin:0 0 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md)}
.cws-tab{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.cws-tab > span{overflow:hidden;text-overflow:ellipsis}
/* Wide chat: the app keeps messages and the message box in a centred column; this lets both use the window's width. The start page keeps its own size. */
html[data-cws-wide] [class*='_scrollBody'] [class*='_column']{max-width:calc(100% - 64px) !important}
html[data-cws-wide] [class*='_composerStack']:not([class*='_composerHero'] *) [class*='_card']{max-width:calc(100% - 32px) !important}
/* More than three tabs: rows of three, so every name has room. */
.cws-tabs[data-many='true']{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.cws-tabs[data-many='true'] .cws-tab{gap:5px;padding:0 4px}
.cws-tab[aria-selected='true']{background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font-weight:500}
.cws-new{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;margin:0 0 8px;padding:0 8px 0 12px;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-weight:500;text-align:left}
.cws-new .cws-glyph{color:inherit}
.cws-kbd{flex:none;display:inline-flex;align-items:center;gap:1px;padding:1px 5px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent);border-radius:5px;font-size:11px;line-height:16px;opacity:.9}
.cws-pages{display:flex;flex-direction:column;gap:2px;margin:0 0 6px}
.cws-row{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 9px;box-sizing:border-box;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left}
.cws-row[aria-current='page']{background:var(--dsw-alias-interactive-bg-hover);font-weight:500}
.cws-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;color:var(--dsw-alias-label-secondary)}
.cws-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin:0 calc(-1 * var(--cws-pad));padding:0 var(--cws-pad)}
.cws-foot{flex:none;display:flex;flex-direction:column;gap:2px;padding-top:6px}
.cws-rail{align-items:center;padding:6px 10px}
.cws-rail .cws-strip{justify-content:center;margin:-6px -10px 0;padding:0}
.cws-rail .cws-icon{width:36px;height:36px;margin-bottom:12px}
.cws-rail .cws-tabs{flex-direction:column;border:0;padding:0;margin:0 0 12px;gap:6px}
.cws-rail .cws-tab{flex:none;width:36px;height:36px;padding:0}
.cws-rail .cws-row{width:36px;justify-content:center;padding:0;min-height:36px}
.cws-rail .cws-scroll{margin:0;padding:0;width:100%;display:flex;flex-direction:column;align-items:center}
.cws-rail .cws-foot{align-items:center}
.cws-more{position:relative}
.cws-pop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;padding:4px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-specific-sidebar-fill));box-shadow:0 14px 36px color-mix(in srgb,#000 28%,transparent)}
.cws-lead{display:flex;align-items:center;gap:8px}
.cws-page{height:100%;overflow-y:auto;box-sizing:border-box;padding:28px clamp(16px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px}
.cws-page-in{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.cws-page h1{margin:0;font-size:16px;line-height:24px;font-weight:500}
.cws-page .cws-hint{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;max-width:72ch}
.cws-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.cws-card{border:0.5px solid var(--dsw-alias-border-l2);border-radius:20px;padding:4px 16px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.cws-item{display:flex;align-items:center;gap:12px;padding:14px 0;border-top:0.5px solid var(--dsw-alias-border-l1)}
.cws-item:first-child{border-top:0}
.cws-item-main{flex:1;min-width:0}
.cws-item-name{font-size:14px;line-height:22px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-item-sub{margin-top:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.cws-chip{display:inline-flex;align-items:center;height:24px;box-sizing:border-box;padding:0 9px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cws-chip[data-tone=good]{color:var(--dsw-alias-state-success-primary,inherit);border-color:currentColor}
.cws-chip[data-tone=bad]{color:var(--dsw-alias-state-error-primary,inherit);border-color:currentColor}
.cws-btn{box-sizing:border-box;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;line-height:18px;white-space:nowrap}
@media (hover:hover){.cws-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}}
.cws-btn:disabled{opacity:.5;cursor:default}
.cws-switch{position:relative;box-sizing:border-box;width:36px;height:20px;flex:none;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;padding:0}
.cws-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,var(--dsw-alias-label-secondary));transition:left .15s}
.cws-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.cws-switch[aria-checked=true]::after{left:18px;background:var(--dsw-alias-bg-base)}
.cws-switch:disabled{opacity:.5;cursor:default}
.cws-form{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:10px 12px;align-items:center;padding:12px 0}
.cws-form label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cws-form input,.cws-form textarea,.cws-form select,.cws-search{width:100%;box-sizing:border-box;height:36px;padding:0 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
.cws-form input:focus-visible,.cws-form textarea:focus-visible,.cws-form select:focus-visible,.cws-search:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:0}
.cws-form textarea{height:auto;min-height:72px;padding:8px 14px;resize:vertical;font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px}
.cws-yaml{margin:0;padding:10px 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
.cws-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cws-area{width:100%;box-sizing:border-box;min-height:140px;padding:10px 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;resize:vertical}
.cws-area:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:0}
.cws-sec{display:flex;flex-direction:column;gap:8px;padding:12px 0}
.cws-sec-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cws-sec-head h2{margin:0;font-size:14px;line-height:20px;font-weight:500}
.cws-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cws-inline input,.cws-inline select{height:32px;padding:0 12px;border:0;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;min-width:0}
.cws-inline input{flex:1 1 220px}
.cws-filelist{display:flex;flex-direction:column;max-height:320px;overflow-y:auto}
.cws-file{display:flex;gap:12px;align-items:baseline;padding:5px 0;border-top:0.5px solid var(--dsw-alias-border-l1);font-size:13px}
.cws-file:first-child{border-top:0}
.cws-file > :first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-file > span + span{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px}
.cws-file button{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-drop[data-over='true']{outline:1px dashed var(--dsw-alias-brand-primary);outline-offset:2px}
.cws-lib-links{display:inline-flex;gap:2px;align-items:center;flex:none;white-space:nowrap}
.cws-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cws-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.cws-type{display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;min-width:0}
.cws-type:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cws-type:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cws-type[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.cws-type b{font-size:13px;line-height:20px;font-weight:500}
.cws-type b i{font-style:normal;font-weight:400;font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:6px}
.cws-type span{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.cws-preview{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.cws-warn{padding:8px 10px;border-radius:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d98a00) 16%,transparent)}
.cws-check{display:flex;gap:8px;align-items:center;font-size:12px;line-height:18px;cursor:pointer}
.cws-diff{margin:0;max-height:320px;overflow:auto;font:inherit;font-size:12px;line-height:18px}
.cws-diff div{white-space:pre-wrap;overflow-wrap:anywhere;padding:0 6px;border-radius:4px}
.cws-diff div[data-k="+"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 18%,transparent)}
.cws-diff div[data-k="-"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 16%,transparent);text-decoration:line-through;color:var(--dsw-alias-label-secondary)}
.cws-diff div[data-k=" "]{color:var(--dsw-alias-label-secondary)}
.cws-ideas{margin:0;padding-left:18px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
.cws-ver{display:flex;gap:10px;align-items:center;font-size:12px;line-height:18px;padding:4px 0}
.cws-ver span:first-child{flex:none;color:var(--dsw-alias-label-secondary);width:150px}
.cws-ver span:nth-child(2){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-preview pre{margin:0;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cws-msg{font-size:12px;color:var(--dsw-alias-label-secondary)}
.cws-msg[data-tone=bad]{color:var(--dsw-alias-state-error-primary,inherit)}
@media (max-width:640px){.cws-form{grid-template-columns:1fr}.cws-item{flex-wrap:wrap}}
[class*='_fishHitbox']:has([data-cws-hero]){width:auto;height:auto;display:inline-flex;align-items:center}
[class*='_fishHitbox']:has([data-cws-hero]) + [class*='_titleGroup']{display:none}
.cws-hero{display:inline-flex;align-items:center;gap:14px;white-space:normal;max-width:100%}
.cws-hero-text{font:inherit;color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow-wrap:anywhere;text-align:left}
[class*='_headline']:has([data-cws-hero]){max-width:100%;flex-wrap:wrap;justify-content:center}
[class*='_composerHero']:has(.cws-chips){position:relative}
.cws-chips{position:absolute;top:100%;left:0;right:0;margin-top:22px;display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.cws-chip-btn{display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;height:36px;padding:0 16px 0 13px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:18px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:14px}
@media (hover:hover){.cws-chip-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}}
.cws-chip-btn svg{color:var(--dsw-alias-label-secondary)}
.cws-chip-btn:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.cws-lib{display:flex;flex-direction:column;gap:1px;padding-bottom:8px}
.cws-lib-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 6px 4px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}
.cws-lib-allbar{padding-top:4px}
.cws-link{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-size:12px;padding:2px 4px;border-radius:4px}
.cws-lib-empty{margin:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.cws-proj-row,.cws-conv{display:flex;align-items:center;border-radius:var(--dsw-radius-sm);position:relative}
.cws-proj-main,.cws-conv-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 6px 4px 9px;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;border-radius:var(--dsw-radius-sm)}
.cws-conv-main{padding-left:12px;color:var(--dsw-alias-label-primary)}
.cws-proj-list .cws-conv-main{padding-left:34px}
.cws-conv[aria-current='page']{background:var(--dsw-alias-interactive-bg-hover)}
.cws-conv[aria-current='page'] .cws-conv-main{font-weight:500}
.cws-count,.cws-time{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
.cws-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.cws-pin{flex:none;color:var(--dsw-alias-label-secondary)}
.cws-mini{flex:none;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px;line-height:1;opacity:0}
.cws-proj-row:hover .cws-mini,.cws-conv:hover .cws-mini,.cws-mini:focus-visible,.cws-mini[aria-expanded='true']{opacity:1}
@media (hover:none){.cws-mini{opacity:1}}
.cws-move{position:relative;display:inline-flex}
.cws-movepop{position:absolute;right:0;top:calc(100% + 2px);z-index:50;min-width:150px;padding:4px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 14px 36px color-mix(in srgb,#000 28%,transparent)}
.cws-moveitem{display:block;box-sizing:border-box;width:100%;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;text-align:left;white-space:nowrap}
.cws-movehead{display:flex;align-items:center;gap:6px;padding:4px 6px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;white-space:nowrap}
.cws-movehead .cws-link{padding:2px 6px}
.cws-moveas{display:flex;align-items:center;gap:4px;padding:0 6px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.cws-moveas button{box-sizing:border-box;height:24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:0 10px}
.cws-moveas button[aria-pressed='true']{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.cws-movelist{max-height:220px;overflow-y:auto;max-width:230px}
.cws-movelist .cws-moveitem{overflow:hidden;text-overflow:ellipsis}
.cws-archived .cws-label{color:var(--dsw-alias-label-secondary)}
.cws-trashed{cursor:default}
.cws-dot-wait{background:var(--dsw-alias-state-warn-primary,#d9822b) !important;animation:none !important}
.cws-needs{margin-bottom:6px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d9822b) 9%,transparent)}
.cws-needs-head{color:var(--dsw-alias-label-primary);padding-top:8px}
.cws-needs-row{align-items:flex-start}
.cws-needs-row .cws-dot{margin-top:6px}
.cws-needs-text{display:flex;flex-direction:column;min-width:0;flex:1;text-align:left}
.cws-needs-why{color:var(--dsw-alias-label-secondary);font-size:11px}
.cws-archived-head{display:block;width:100%;margin-top:8px}
.cws-movesep{height:0.5px;margin:4px 6px;background:var(--dsw-alias-border-l2)}
html[data-cws-plain-chat] [class*='_heroWorkspaceRow'] > button[aria-haspopup='menu'],html[data-cws-plain-chat] [data-slot='conversation.hero.workspace']{display:none !important}
.cws-more-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:4px 12px;text-align:left}
@media (hover:hover){.cws-proj-main:hover,.cws-conv-main:hover,.cws-mini:hover,.cws-moveitem:hover,.cws-link:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.cws-error{margin:0 4px 8px;color:var(--dsw-alias-state-error-primary, inherit);font-size:12px}
@media (hover:hover){.cws-icon:hover,.cws-tab:hover:not([aria-selected='true']),.cws-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.cws-new:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}}
.cws-root :is(button):focus-visible,.cws-lead button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,currentColor);outline-offset:-2px}
`;

    /** Plain line icons used when the app's icon set is not reachable. */
    const PATHS = {
      chat: 'M4 5h16v10H9l-5 4z',
      cowork: 'M4 7h16v12H4zM9 7V5h6v2',
      code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
      finance: 'M4 18l5-6 4 3 7-9M15 6h5v5',
      recon: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l4.5 4.5',
      data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
      plus: 'M12 5v14M5 12h14',
      panel: 'M4 5h16v14H4zM9 5v14',
      grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
      dot: 'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1',
      link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
      sparkle: 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z',
      folder: 'M3 7h6l2 2h10v10H3z',
      folderOpen: 'M3 7h6l2 2h10v3M3 7v12h15l3-7H6l-3 7',
    };
    function Glyph({ name, size = 16 }) {
      const map = {
        chat: 'IconNewChatOutlineRegular',
        code: 'IconCodeOutlineRegular',
        cowork: 'IconWorkspaceTreeOutlineRegular',
        plus: 'IconNewChatOutlineRegular',
        panel: 'IconPanelLeftOutlineRegular',
        grid: 'IconAppsAddOutlineRegular',
        link: 'IconLinkOutlineRegular',
        sparkle: 'IconSparkleRegular',
        folder: 'IconFolderCloseRegular',
        folderOpen: 'IconFolderOpenRegular',
      };
      const Native = UI[map[name]];
      if (typeof Native === 'function' || (Native && typeof Native === 'object')) return h(Native, { size });
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: PATHS[name] || PATHS.dot }));
    }

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

    function glyphFor(modeId) {
      return modeId === 'chat' || modeId === 'code' || modeId === 'cowork' || modeId === 'finance' || modeId === 'data' || modeId === 'recon' ? modeId : 'dot';
    }

    /**
     * Shared state: the modes (from the Modes add-on's settings), the selected tab and this add-on's
     * tab layout. One store for the whole page, refreshed on demand and every 10 seconds.
     */
    function createModel(ctx) {
      let state = { modes: FALLBACK_MODES, extra: [], selected: readLocal(), tabs: DEFAULT_TABS, maxTabs: 3, hideLogos: false, dateTitle: false, wideChat: false, modesOn: false, error: '', sessionModes: {} };
      const listeners = new Set();
      const emit = () => { for (const l of listeners) l(); };
      const set = (patch) => { state = { ...state, ...patch }; emit(); };

      function readLocal() {
        try { return window.localStorage.getItem(LOCAL_KEY) || 'chat'; } catch { return 'chat'; }
      }
      function writeLocal(id) {
        try { window.localStorage.setItem(LOCAL_KEY, id); } catch { /* private mode */ }
      }

      async function describe() {
        const result = await ctx.remote.settings.describe();
        if (!result.ok) throw new Error(result.error.code);
        return result.value.namespaces;
      }

      // Bumped by every tab click: a refresh that started before a click must not undo it.
      let clicks = 0;
      // While a tab click is being saved, the stored tab is still the old one: a refresh must not read it.
      let selecting = 0;
      let saving = Promise.resolve();
      async function refresh() {
        const started = clicks;
        try {
          const spaces = await describe();
          const modesNs = spaces.find((item) => item.ns === MODES_NS);
          const mine = spaces.find((item) => item.ns === SETTINGS_NS);
          const patch = {};
          if (mine) {
            const tabs = readObject(mine.value?.tabs);
            if (Object.keys(tabs).length > 0) patch.tabs = tabs;
            if (Number.isFinite(mine.value?.maxTabs)) patch.maxTabs = mine.value.maxTabs;
            patch.hideLogos = mine.value?.hideLogos === true;
            patch.dateTitle = mine.value?.dateTitle === true;
            patch.wideChat = mine.value?.wideChat === true;
          }
          if (modesNs) {
            const defined = Object.entries(readObject(modesNs.value?.modes)).map(([id, value]) => ({
              id,
              label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
            }));
            patch.modes = defined.length > 0 ? defined : FALLBACK_MODES;
            // Modes that other add-ons add: each gets a tab after the usual ones, whatever the tab limit.
            patch.extra = Object.entries(readObject(modesNs.value?.extraModes))
              .filter(([id]) => !patch.modes.some((m) => m.id === id))
              .map(([id, value]) => ({ id, label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id }));
            patch.modesOn = true;
            if (started === clicks) patch.sessionModes = readObject(modesNs.value?.sessionModes);
            const current = modesNs.value?.defaultMode;
            if (started === clicks && selecting === 0 && typeof current === 'string' && [...patch.modes, ...patch.extra].some((m) => m.id === current)) {
              patch.selected = current;
              writeLocal(current);
            }
          }
          set(patch);
        } catch {
          // Keep what we have; the tabs still switch sections locally.
        }
      }

      /** Select a tab: with the Modes add-on, it becomes the mode new conversations start in. */
      async function select(id, label) {
        const before = state.selected;
        clicks += 1;
        writeLocal(id);
        set({ selected: id, error: '' });
        if (!state.modesOn) return;
        selecting += 1;
        // One save at a time and in click order, so the stored tab ends as the last one clicked.
        const turn = saving;
        let done;
        saving = new Promise((resolve) => { done = resolve; });
        await turn;
        try {
          if (state.selected !== id) return;
          const op = [{ op: 'set', path: ['defaultMode'], value: id }];
          let spaces = await describe();
          let entry = spaces.find((item) => item.ns === MODES_NS);
          let result = await ctx.remote.settings.mutate(MODES_NS, op, entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            spaces = await describe();
            entry = spaces.find((item) => item.ns === MODES_NS);
            result = await ctx.remote.settings.mutate(MODES_NS, op, entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
        } catch {
          writeLocal(before);
          set({ selected: before, error: ctx.locale.bind(NS)('tab.failed', { tab: label }) });
        } finally {
          done();
          selecting -= 1;
          // Refreshes that began before the save finished carry the old tab.
          clicks += 1;
        }
      }

      /**
       * Move conversations to a tab: their recorded mode becomes the tab's mode (the Modes add-on applies
       * it at the next turn), so they show under that tab from now on.
       */
      async function move(sessionIds, modeId) {
        if (!state.modesOn || sessionIds.length === 0) return false;
        clicks += 1;
        const before = state.sessionModes;
        const optimistic = { ...before };
        for (const id of sessionIds) optimistic[id] = modeId;
        set({ sessionModes: optimistic, error: '' });
        try {
          let spaces = await describe();
          let entry = spaces.find((item) => item.ns === MODES_NS);
          const build = (value) => {
            const next = { ...readObject(value?.sessionModes) };
            for (const id of sessionIds) next[id] = modeId;
            return [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }];
          };
          let result = await ctx.remote.settings.mutate(MODES_NS, build(entry.value), entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            spaces = await describe();
            entry = spaces.find((item) => item.ns === MODES_NS);
            result = await ctx.remote.settings.mutate(MODES_NS, build(entry.value), entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          return true;
        } catch {
          set({ sessionModes: before, error: ctx.locale.bind(NS)('move.failed') });
          return false;
        }
      }

      /** Switch one of this add-on's own on/off settings (`hideLogos`, `dateTitle`, `wideChat`). */
      async function setOption(key, value) {
        const before = state[key];
        set({ [key]: value, error: '' });
        try {
          const op = [{ op: 'set', path: [key], value }];
          let entry = (await describe()).find((item) => item.ns === SETTINGS_NS);
          let result = await ctx.remote.settings.mutate(SETTINGS_NS, op, entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            entry = (await describe()).find((item) => item.ns === SETTINGS_NS);
            result = await ctx.remote.settings.mutate(SETTINGS_NS, op, entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
        } catch {
          set({ [key]: before, error: ctx.locale.bind(NS)('look.failed') });
        }
      }

      return {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => state,
        refresh,
        select,
        move,
        setOption,
        fail: (message) => set({ error: String(message) }),
      };
    }

    /** Snapshot of every plugin's sidebar page row, ordered like the app's own sidebar. */
    function createPages(ctx) {
      let snapshot = [];
      const read = () => ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => ({
        id: options.id,
        order: options.order ?? 0,
        label: typeof options.label === 'function' ? String(options.label()) : String(options.label ?? options.id),
      })).filter((page) => page.id !== 'project').sort((a, b) => a.order - b.order);
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          snapshot = read();
          const off = ctx.slots.subscribe('sidebar.panellist', () => { snapshot = read(); listener(); });
          const offLocale = ctx.locale.subscribe?.(() => { snapshot = read(); listener(); });
          return () => { off?.(); offLocale?.(); };
        },
      };
    }

    function Tooltip({ label, show, children }) {
      if (show && UI.Tooltip) return h(UI.Tooltip, { label, delayMs: 500, side: 'right' }, children);
      return children;
    }

    /** The More launcher: the rows other plugins register (`sidebar.panellist.actions`). */
    function MoreMenu({ wide, label, entries, onOpen, renderSlot, extra }) {
      const [open, setOpen] = useState(false);
      const onDismiss = () => setOpen(false);
      const button = h('button', {
        type: 'button', className: 'cws-row', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: () => setOpen((v) => !v),
      }, h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'grid', size: wide ? 16 : 18 })),
      wide ? h('span', { className: 'cws-label' }, label) : null);
      const rows = h(React.Fragment, null,
        renderSlot('sidebar.panellist.actions', { entries, onOpen: (id) => { onDismiss(); onOpen(id); }, onPinnedChange: () => {}, onDismiss }),
        (extra ?? []).length > 0 ? h('div', { className: 'cws-movesep', role: 'separator' }) : null,
        (extra ?? []).map((item) => h('button', {
          key: item.key, type: 'button', role: 'menuitem', className: 'cws-moveitem',
          onClick: () => { onDismiss(); item.run(); },
        }, item.label)));
      if (UI.Menu) {
        return h(UI.Menu, { open, onClose: onDismiss, portal: true, autoFocus: true, anchor: h(Tooltip, { label, show: !wide }, button) }, rows);
      }
      return h('div', { className: 'cws-more' }, button, open ? h('div', { className: 'cws-pop', role: 'menu' }, rows) : null);
    }

    /** The app's own New Session shortcut (shown as a badge), or null when the app does not expose it. */
    function useNewSessionShortcut(appCtx) {
      const catalog = (() => {
        try {
          return appCtx.get?.('shortcuts')?.catalog ?? null;
        } catch {
          return null;
        }
      })();
      const subscribe = useCallback((listener) => (catalog?.subscribe ? catalog.subscribe(listener) : () => {}), [catalog]);
      const rows = useSyncExternalStore(subscribe, () => (catalog?.getSnapshot ? catalog.getSnapshot() : null));
      const row = Array.isArray(rows) ? rows.find((r) => r && r.id === 'session.new') : null;
      return row && Array.isArray(row.keys) && row.keys.length > 0 ? row : null;
    }

    const SCROLLER = { bindScrollerRef: () => {} };
    const HOOK_CONTEXT = { useSectionScroller: () => SCROLLER };


    /**
     * The app's own project and conversation lists (read-only views of its client services), kept as
     * one snapshot. Missing services make `ok` false; the sidebar then shows the app's own list.
     */
    function createLibrary(ctx) {
      const get = (name) => { try { return ctx.get(name) ?? null; } catch { return null; } };
      let snapshot = { ok: false, workspaces: [], byId: {}, pinned: [], archived: [], currentId: null, waiting: {} };
      let version = 0;
      const read = () => {
        const ws = get('workspaces')?.list?.getSnapshot?.();
        const ss = get('sessions')?.list?.getSnapshot?.();
        if (!ws || !ss || ws.phase !== 'ready' || ss.phase !== 'ready') return { ...snapshot, ok: false };
        let currentId = null;
        try { currentId = get('uiWorkspace')?.selection?.getSnapshot?.()?.sessionId ?? null; } catch { currentId = null; }
        // Which conversations wait for the user, and for what: the app's own status, as its sidebar reads it.
        const waiting = {};
        try {
          const statuses = get('uiSession')?.sessionStatus?.getSnapshot?.();
          if (statuses && typeof statuses.forEach === 'function') {
            statuses.forEach((status, id) => {
              const kind = status?.pendingInteraction?.kind;
              if (kind === 'approval' || kind === 'plan-review' || kind === 'question') waiting[id] = kind;
            });
          }
        } catch { /* no status service: nothing is shown as waiting */ }
        return {
          ok: true,
          workspaces: Array.isArray(ws.items) ? ws.items : [],
          byId: ss.byId ?? {},
          pinned: Array.isArray(ws.pinnedSessionIds) ? ws.pinnedSessionIds : [],
          archived: Array.isArray(ws.archivedSessionIds) ? ws.archivedSessionIds : [],
          currentId,
          waiting,
        };
      };
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          const update = () => { version += 1; snapshot = read(); listener(); };
          snapshot = read();
          const offs = [
            get('workspaces')?.list?.subscribe?.(update),
            get('sessions')?.list?.subscribe?.(update),
            get('uiWorkspace')?.selection?.subscribe?.(update),
            get('uiSession')?.sessionStatus?.subscribe?.(update),
          ];
          // Titles and times change without always notifying; refresh gently.
          const timer = setInterval(update, 5000);
          return () => { clearInterval(timer); for (const off of offs) { try { off?.(); } catch { /* ignore */ } } };
        },
      };
    }

    /** What Plus keeps about projects (tab, instructions), and the project page's file calls. */
    function createProjects() {
      const url = (query) => {
        const u = new URL('dsh-cowork-shell/projects', document.baseURI);
        for (const [key, value] of Object.entries(query ?? {})) u.searchParams.set(key, String(value));
        return u;
      };
      let snapshot = { projects: [], presets: [], shared: {}, focus: null };
      const listeners = new Set();
      const emit = () => { for (const listener of listeners) listener(); };
      const call = async (query, init) => {
        const response = await fetch(url(query), { headers: { accept: 'application/json' }, ...init });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error ?? response.status));
        if (Array.isArray(data?.projects)) { snapshot = { ...snapshot, projects: data.projects, presets: Array.isArray(data.presets) ? data.presets : snapshot.presets, shared: data.shared && typeof data.shared === 'object' ? data.shared : snapshot.shared }; emit(); }
        return data;
      };
      let timer;
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          if (listeners.size === 1) { void call().catch(() => {}); timer = setInterval(() => void call().catch(() => {}), 20000); }
          return () => { listeners.delete(listener); if (listeners.size === 0) clearInterval(timer); };
        },
        refresh: () => call(),
        save: (path, patch) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', path, ...patch }) }),
        files: async (path) => (await call({ files: path })).files ?? { files: [], more: false },
        digest: (path, contents, provider) => call({ digest: path, contents: contents ? '1' : '0', ...(provider ? { provider } : {}) }),
        generate: (body) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'generate', ...body }) }),
        presetSave: (preset) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preset-save', ...preset }) }),
        presetRemove: (id) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preset-remove', id }) }),
        upload: (path, file) => call({ upload: '1', path, name: file.name }, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/octet-stream' }, body: file }),
        focus: (workspaceId) => { snapshot = { ...snapshot, focus: workspaceId }; emit(); },
      };
    }

    function sizeText(bytes) {
      if (!Number.isFinite(bytes)) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    /**
     * The lines of two texts side by side: kept (' '), gone ('-') and new ('+').
     * @param {string} before - the text now.
     * @param {string} after - the new text.
     * @returns {{k: string, text: string}[] | null} the lines; null when the texts are too long to compare line by line.
     */
    function lineDiff(before, after) {
      const a = String(before ?? '').split('\n');
      const b = String(after ?? '').split('\n');
      if (a.length > 700 || b.length > 700) return null;
      const width = b.length + 1;
      const table = new Uint16Array((a.length + 1) * width);
      for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      const out = [];
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { out.push({ k: ' ', text: a[i] }); i += 1; j += 1; }
        else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { out.push({ k: '-', text: a[i] }); i += 1; }
        else { out.push({ k: '+', text: b[j] }); j += 1; }
      }
      for (; i < a.length; i += 1) out.push({ k: '-', text: a[i] });
      for (; j < b.length; j += 1) out.push({ k: '+', text: b[j] });
      return out;
    }

    /** The panel that writes a project's instructions with a model: choose, see what would be sent, agree, read the result. */
    function GeneratePanel({ t, gen, setGen, catalog, current, onRun, onUse }) {
      const groups = catalog?.groups ?? [];
      const value = gen.provider && gen.model ? `${gen.provider}\u0000${gen.model}` : '';
      const digest = gen.digest;
      const where = gen.where?.where;
      const outside = where === 'cloud' || where === 'unknown';
      const made = gen.result;
      const set = (patch) => setGen((now) => (now ? { ...now, ...patch } : now));
      if (made) {
        const diff = current.trim() ? lineDiff(current.trim(), made.instructions) : null;
        const same = current.trim() === made.instructions.trim();
        return h('div', { className: 'cws-preview' },
          h('div', { className: 'cws-note' }, same ? t('gen.same') : t(diff ? 'gen.result' : 'gen.result.first', { model: made.model })),
          same ? null : diff
            ? h('div', { className: 'cws-diff' }, diff.map((line, index) => h('div', { key: index, 'data-k': line.k }, `${line.k === ' ' ? ' ' : line.k === '+' ? '+' : '−'} ${line.text}`)))
            : h('pre', null, made.instructions),
          made.ideas.length > 0 ? h('div', { className: 'cws-note' }, t('gen.ideas')) : null,
          made.ideas.length > 0 ? h('ul', { className: 'cws-ideas' }, made.ideas.map((idea, index) => h('li', { key: index }, idea))) : null,
          h('div', { className: 'cws-inline' },
            same ? null : h('button', { type: 'button', className: 'cws-btn', onClick: onUse }, t('gen.use')),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => setGen(null) }, t(same ? 'gen.close' : 'gen.discard'))));
      }
      return h('div', { className: 'cws-preview' },
        h('div', { className: 'cws-sec-head' }, h('h2', null, t('gen.title'))),
        h('div', { className: 'cws-note' }, t('gen.hint')),
        h('div', { className: 'cws-inline' },
          h('select', {
            value, 'aria-label': t('gen.model'), disabled: gen.busy,
            onChange: (event) => { const [provider, model] = event.target.value.split('\u0000'); set({ provider: provider || '', model: model || '', agreed: false, where: null, error: '' }); },
          },
          h('option', { value: '' }, t('gen.model.none')),
          groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, item.name))))),
          h('select', { value: gen.contents ? '1' : '0', 'aria-label': t('gen.what.full'), disabled: gen.busy, onChange: (event) => set({ contents: event.target.value === '1', agreed: false, digest: null }) },
            h('option', { value: '1' }, t('gen.what.full')),
            h('option', { value: '0' }, t('gen.what.names')))),
        digest ? h('div', { className: 'cws-note' }, digest.files === 0 ? t('gen.sent.empty')
          : t(digest.contents ? 'gen.sent' : 'gen.sent.names', { files: digest.files, more: digest.more ? t('gen.sent.more') : '', included: digest.included.length, chars: digest.chars.toLocaleString() })) : null,
        digest && digest.included.length > 0 ? h('div', { className: 'cws-note' }, t('gen.sent.files', { names: digest.included.map((file) => file.name).join(', ') })) : null,
        digest && digest.guides.length > 0 ? h('div', { className: 'cws-note' }, t('gen.guides', { names: digest.guides.join(', ') })) : null,
        digest && digest.secrets.length > 0 ? h('div', { className: 'cws-note' }, t('gen.secrets', { names: digest.secrets.join(', ') })) : null,
        gen.provider && where === 'local' ? h('div', { className: 'cws-note' }, t('gen.where.local')) : null,
        gen.provider && where === 'network' ? h('div', { className: 'cws-note' }, t('gen.where.network', { host: gen.where.host })) : null,
        gen.provider && outside ? h('div', { className: 'cws-warn', role: 'alert' }, where === 'cloud' ? t('gen.where.cloud', { host: gen.where.host || gen.where.name }) : t('gen.where.unknown')) : null,
        gen.provider && outside ? h('label', { className: 'cws-check' },
          h('input', { type: 'checkbox', checked: gen.agreed, disabled: gen.busy, onChange: (event) => set({ agreed: event.target.checked }) }),
          t('gen.agree', { name: gen.where.name || gen.model })) : null,
        gen.error ? h('div', { className: 'cws-msg', 'data-tone': 'bad', role: 'status' }, gen.error) : null,
        gen.busy ? h('div', { className: 'cws-note', role: 'status' }, t('gen.running')) : null,
        h('div', { className: 'cws-inline' },
          h('button', { type: 'button', className: 'cws-btn', disabled: gen.busy || !gen.provider || !gen.model || !gen.where || !digest || (outside && !gen.agreed), onClick: onRun }, t('gen.run')),
          h('button', { type: 'button', className: 'cws-btn', disabled: gen.busy, onClick: () => setGen(null) }, t('gen.close'))));
    }

    /** A project's page: its name, the tab it shows under, its instructions, its files, its conversations. */
    function ProjectPage({ appCtx, model, library, projects }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const meta = useSyncExternalStore(projects.subscribe, projects.get);
      const ws = lib.workspaces.find((item) => item.workspaceId === meta.focus) ?? null;
      const record = meta.projects.find((item) => item.workspaceId === meta.focus) ?? null;
      const [text, setText] = useState('');
      const [name, setName] = useState('');
      const [note, setNote] = useState({ text: '', tone: '' });
      const [files, setFiles] = useState({ files: [], more: false });
      const [busy, setBusy] = useState(false);
      const [over, setOver] = useState(false);
      // A type that was picked while the project already has instructions of its own: shown first, applied on a yes.
      const [pending, setPending] = useState(null);
      const [keepName, setKeepName] = useState(null);
      // The generate panel: closed (null), or what is chosen in it and what came back.
      const [gen, setGen] = useState(null);
      const [catalog, setCatalog] = useState(null);
      const [versions, setVersions] = useState([]);
      const [showVersions, setShowVersions] = useState(false);
      const [drifted, setDrifted] = useState(null);
      // Where the text in the box came from, so a save can say so: the model, a type, or the user.
      const origin = useRef({ by: 'you', note: '', text: '', mark: undefined });
      const picker = useRef(null);
      const path = ws?.path ?? '';
      const loadedFor = useRef('');
      useEffect(() => {
        // Fill the boxes once per project, when its record has arrived; later refreshes must not undo typing.
        if (!ws || !record || loadedFor.current === ws.workspaceId) return;
        loadedFor.current = ws.workspaceId;
        setText(record.instructions ?? '');
        setName(ws.title ?? '');
        setNote({ text: '', tone: '' });
        setPending(null);
        setKeepName(null);
        setGen(null);
        setShowVersions(false);
        origin.current = { by: 'you', note: '', text: '', mark: undefined };
      }, [ws?.workspaceId, record !== null]);
      // The versions kept for this project, and whether the folder moved since instructions were last generated.
      useEffect(() => {
        setVersions([]);
        setDrifted(null);
        if (!path) return undefined;
        let live = true;
        projects.digest(path, false).then((data) => {
          if (!live) return;
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (data?.digest?.generatedBefore && data.digest.drift?.much) setDrifted(data.digest.drift);
        }).catch(() => {});
        return () => { live = false; };
      }, [path, projects]);
      // The look at "what would be sent" follows the choices in the panel.
      const genKey = gen ? `${gen.provider}\u0000${gen.contents}` : '';
      useEffect(() => {
        if (!gen || !path) return undefined;
        let live = true;
        projects.digest(path, gen.contents, gen.provider).then((data) => {
          if (live) setGen((now) => (now ? { ...now, digest: data?.digest ?? null, where: data?.where ?? null } : now));
        }).catch((error) => { if (live) setGen((now) => (now ? { ...now, error: String(error?.message ?? error) } : now)); });
        return () => { live = false; };
      }, [genKey, path, projects]);
      useEffect(() => {
        if (!gen || catalog) return;
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (result?.ok) setCatalog(result.value);
          } catch { /* the picker stays empty */ }
        })();
      }, [gen !== null, catalog, appCtx]);
      const loadFiles = useCallback(async () => {
        if (!path) return;
        try { setFiles(await projects.files(path)); } catch { setFiles({ files: [], more: false }); }
      }, [path, projects]);
      useEffect(() => { setFiles({ files: [], more: false }); void loadFiles(); }, [loadFiles]);
      useEffect(() => { if (meta.focus && !record) void projects.refresh().catch(() => {}); }, [meta.focus, record === null]);
      if (!ws) return h(PageFrame, { title: t('proj.title') }, h('p', { className: 'cws-note' }, t('proj.page.none')));

      const fail = (error) => setNote({ text: t('proj.page.failed', { message: String(error?.message ?? error) }), tone: 'bad' });
      const saveText = async () => {
        try {
          // Text that came from the model or a type and was not changed since is recorded as theirs.
          const from = origin.current.text && origin.current.text === text ? origin.current : { by: 'you', note: '' };
          const data = await projects.save(path, { instructions: text, by: from.by, note: from.note, ...(from.by === 'model' ? { mark: from.mark } : {}) });
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (from.by === 'model') setDrifted(null);
          origin.current = { by: 'you', note: '', text: '', mark: undefined };
          setNote({ text: t('proj.page.saved'), tone: '' });
        } catch (error) { fail(error); }
      };
      const openGen = () => {
        // The conversation's usual model is not known here; the user picks one.
        setGen({ provider: '', model: '', contents: true, agreed: false, busy: false, digest: null, where: null, result: null, error: '' });
        setShowVersions(false);
      };
      const runGen = async () => {
        if (!gen?.provider || !gen.model || gen.busy) return;
        setGen((now) => ({ ...now, busy: true, error: '', result: null }));
        try {
          const data = await projects.generate({ path, provider: gen.provider, model: gen.model, contents: gen.contents, agreed: gen.agreed, current: text });
          setGen((now) => (now ? { ...now, busy: false, result: data?.generated ?? null } : now));
        } catch (error) {
          setGen((now) => (now ? { ...now, busy: false, error: String(error?.message ?? error) } : now));
        }
      };
      const useGen = () => {
        const made = gen?.result;
        if (!made) return;
        setText(made.instructions);
        origin.current = { by: 'model', note: made.model, text: made.instructions, mark: made.mark };
        setGen(null);
        setNote({ text: t('gen.used'), tone: '' });
      };
      const putBack = (version) => {
        setText(version.text);
        origin.current = { by: version.by, note: version.note, text: version.text, mark: undefined };
        setShowVersions(false);
        setNote({ text: t('ver.backed'), tone: '' });
      };
      const rename = async () => {
        const next = name.trim();
        if (!next || next === ws.title) return;
        try { await appCtx.get('workspaces').rename(ws.workspaceId, next); setNote({ text: '', tone: '' }); } catch (error) { fail(error); }
      };
      const setTab = async (tab) => {
        try { await projects.save(path, { tab }); } catch (error) { fail(error); }
      };
      const add = async (list) => {
        const picked = Array.from(list ?? []).filter((file) => file && typeof file.name === 'string');
        if (picked.length === 0) return;
        setBusy(true);
        const done = [];
        try {
          for (const file of picked) {
            const data = await projects.upload(path, file);
            if (data?.saved) done.push(data.saved);
            if (data?.files) setFiles(data.files);
          }
          setNote({ text: t('proj.page.files.added', { names: done.join(', ') }), tone: '' });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(false);
          void loadFiles();
        }
      };
      const start = (prompt) => {
        try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
        const tab = record?.tab;
        if (tab && tab !== state.selected) {
          const mode = tabsOf(state).find((m) => m.id === tab);
          if (mode) void model.select(mode.id, mode.label);
        }
        appCtx.uiWorkspace.startSession(ws.workspaceId, prompt ? { prompt, whenDraftExists: 'replace' } : undefined);
      };
      const archived = new Set(lib.archived);
      const convs = (ws.sessionIds ?? [])
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !lib.byId[id].blank && !archived.has(id))
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      const tabChoices = tabsOf(state).filter((m) => m.id !== 'chat');

      // Types are Cowork's: the other tabs have their own instructions and tools.
      const presets = Array.isArray(meta.presets) ? meta.presets : [];
      const typed = (record?.tab || state.selected) === 'cowork' && presets.length > 0;
      const currentType = presets.find((preset) => preset.id === (record?.preset || 'blank')) ?? presets[0];
      const fresh = !record?.preset && !(record?.instructions ?? '').trim();
      const applyType = async (preset, withText) => {
        try {
          const data = await projects.save(path, withText ? { preset: preset.id, instructions: preset.instructions, by: 'type', note: preset.name } : { preset: preset.id });
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (withText) setText(preset.instructions);
          setPending(null);
          setNote({ text: withText ? (preset.instructions ? t('type.applied', { name: preset.name }) : t('type.blank')) : t('type.only', { name: preset.name }), tone: '' });
        } catch (error) { fail(error); }
      };
      const pickType = (preset) => {
        if (preset.id === currentType?.id && record?.preset) { setPending(null); return; }
        // Nothing of the user's own would be lost: no instructions yet, or the current type's, untouched.
        const mine = text.trim();
        const untouched = mine === '' || (mine === (currentType?.instructions ?? '').trim() && mine === (record?.instructions ?? '').trim());
        if (untouched) void applyType(preset, true);
        else setPending(preset);
      };
      const removeType = async (preset) => {
        if (!window.confirm(t('type.remove.sure', { name: preset.name }))) return;
        try { await projects.presetRemove(preset.id); setPending(null); setNote({ text: t('type.removed'), tone: '' }); } catch (error) { fail(error); }
      };
      const keepAs = async () => {
        const label = (keepName ?? '').trim();
        if (!label || !text.trim()) return;
        try {
          const data = await projects.presetSave({ name: label, description: '', tools: currentType?.tools ?? [], searchOff: currentType?.searchOff === true, instructions: text });
          // The project is of that type from now on, and its instructions are saved with it.
          await projects.save(path, { preset: data?.saved, instructions: text });
          setKeepName(null);
          setNote({ text: t('type.keepas.done', { name: label }), tone: '' });
        } catch (error) { fail(error); }
      };

      return h(PageFrame, {
        title: ws.title || t('untitled'), hint: path,
        actions: h('button', { type: 'button', className: 'cws-btn', onClick: () => start('') }, t('proj.page.newconv')),
      },
      note.text ? h('div', { className: 'cws-msg', 'data-tone': note.tone, role: 'status' }, note.text) : null,
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-inline' },
            h('input', { value: name, 'aria-label': t('proj.page.name'), onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') void rename(); } }),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => void rename(), disabled: !name.trim() || name.trim() === ws.title }, t('proj.page.rename')),
            h('span', { className: 'cws-note' }, t('proj.page.tab')),
            h('select', { value: record?.tab || state.selected, 'aria-label': t('proj.page.tab'), onChange: (e) => void setTab(e.target.value) },
              tabChoices.map((m) => h('option', { key: m.id, value: m.id }, m.label)))))),
      typed ? h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, fresh ? t('type.title.new') : t('type.title')),
            currentType?.own && !pending ? h('button', { type: 'button', className: 'cws-btn', onClick: () => void removeType(currentType) }, t('type.remove')) : null),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('type.hint')),
          h('div', { className: 'cws-types', role: 'group', 'aria-label': t('type.title') }, presets.map((preset) => h('button', {
            key: preset.id, type: 'button', className: 'cws-type', 'aria-pressed': (pending ? pending.id : currentType?.id) === preset.id, onClick: () => pickType(preset),
          }, h('b', null, preset.name, preset.own ? h('i', null, t('type.own')) : null), preset.description ? h('span', null, preset.description) : null))),
          pending ? h('div', { className: 'cws-preview' },
            h('div', { className: 'cws-note' }, t('type.preview', { name: pending.name })),
            pending.instructions ? h('pre', null, pending.instructions) : null,
            h('div', { className: 'cws-inline' },
              h('button', { type: 'button', className: 'cws-btn', onClick: () => void applyType(pending, true) }, t('type.replace')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => void applyType(pending, false) }, t('type.keep')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => setPending(null) }, t('type.cancel')))) : null,
          !pending ? (currentType?.tools ?? []).map((tool) => h('p', { key: tool, className: 'cws-note', style: { margin: 0 } }, t(`type.tool.${tool}.${meta.shared?.[tool] ? 'on' : 'off'}`))) : null,
          !pending && currentType?.searchOff ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('type.search.off')) : null)) : null,
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.instr')),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => void saveText(), disabled: text === (record?.instructions ?? '') }, t('proj.page.save'))),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.instr.hint')),
          h('textarea', { className: 'cws-area', value: text, maxLength: 12000, placeholder: t('proj.page.instr.place'), 'aria-label': t('proj.page.instr'), onChange: (e) => setText(e.target.value) }),
          drifted && !gen ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('gen.drift', { added: drifted.added, removed: drifted.removed })) : null,
          keepName === null ? h('div', { className: 'cws-inline' },
            typed && !gen ? h('button', { type: 'button', className: 'cws-btn', onClick: openGen }, t('gen.open')) : null,
            typed && text.trim() ? h('button', { type: 'button', className: 'cws-btn', title: t('type.keepas.hint'), onClick: () => setKeepName('') }, t('type.keepas')) : null,
            versions.length > 1 ? h('button', { type: 'button', className: 'cws-btn', 'aria-expanded': showVersions, onClick: () => setShowVersions(!showVersions) }, t('ver.open', { n: versions.length - 1 })) : null) : null,
          showVersions ? h('div', { className: 'cws-preview' },
            h('div', { className: 'cws-note' }, t('ver.title')),
            versions.map((version, index) => h('div', { key: version.at, className: 'cws-ver' },
              h('span', null, new Date(version.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), ' · ', t(`ver.by.${version.by}`), version.note ? ` (${version.note})` : ''),
              h('span', { title: version.text.slice(0, 600) }, version.text.replace(/\s+/g, ' ').slice(0, 140)),
              index === 0 && version.text === (record?.instructions ?? '').trim() ? h('span', { className: 'cws-note' }, t('ver.current'))
                : h('button', { type: 'button', className: 'cws-btn', onClick: () => putBack(version) }, t('ver.back'))))) : null,
          gen ? h(GeneratePanel, { t, gen, setGen, catalog, current: text, onRun: () => void runGen(), onUse: useGen }) : null,
          typed && text.trim() && keepName !== null ? (
            h('div', { className: 'cws-inline' },
              h('input', { value: keepName, maxLength: 40, placeholder: t('type.keepas.name'), 'aria-label': t('type.keepas.name'), autoFocus: true, onChange: (e) => setKeepName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') void keepAs(); if (e.key === 'Escape') setKeepName(null); } }),
              h('button', { type: 'button', className: 'cws-btn', disabled: !keepName.trim(), onClick: () => void keepAs() }, t('type.keepas.save')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => setKeepName(null) }, t('type.cancel')))) : null)),
      h('div', {
        className: 'cws-card cws-drop', 'data-over': over ? 'true' : undefined,
        onDragOver: (e) => { e.preventDefault(); setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer?.files); },
      },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.files')),
            h('button', { type: 'button', className: 'cws-btn', disabled: busy, onClick: () => picker.current?.click() }, busy ? t('proj.page.files.busy') : t('proj.page.files.add'))),
          h('input', { ref: picker, type: 'file', multiple: true, hidden: true, onChange: (e) => { const list = e.target.files; void add(list).then(() => { e.target.value = ''; }); } }),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.hint')),
          files.files.length === 0 ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.none'))
            : h('div', { className: 'cws-filelist' }, files.files.map((file) => h('div', { key: file.name, className: 'cws-file' },
              h('span', { title: file.name }, file.name), h('span', null, sizeText(file.size)), h('span', null, ago(t, file.modified))))),
          files.more ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.more', { n: files.files.length })) : null)),
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.convs'))),
          convs.length === 0 ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.convs.none'))
            : h('div', { className: 'cws-filelist' }, convs.map((id) => {
              const title = (lib.byId[id].displayTitle && String(lib.byId[id].displayTitle).trim()) || t('untitled');
              return h('div', { key: id, className: 'cws-file' },
                h('button', { type: 'button', title, onClick: () => { try { appCtx.layout.selectPanel(null); } catch { /* */ } appCtx.get('uiWorkspace').openSession(id); } }, title),
                h('span', null, ago(t, lib.byId[id].updatedAt)));
            })))));
    }

    /** The trash of deleted conversations, read from and changed through this add-on's host route. */
    function createTrash() {
      const url = () => new URL('dsh-cowork-shell/trash', document.baseURI);
      let snapshot = { items: [], keepMs: 0 };
      const listeners = new Set();
      const install = (data) => {
        snapshot = { items: Array.isArray(data?.items) ? data.items : [], keepMs: Number(data?.keepMs) || 0 };
        for (const listener of listeners) listener();
      };
      const call = async (init) => {
        const response = await fetch(url(), { headers: { accept: 'application/json', ...(init ? { 'content-type': 'application/json' } : {}) }, ...init });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error ?? response.status));
        install(data);
      };
      const post = (action, sessionId, title) => call({ method: 'POST', body: JSON.stringify({ action, sessionId, title }) });
      let timer;
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          if (listeners.size === 1) { void call().catch(() => {}); timer = setInterval(() => void call().catch(() => {}), 60000); }
          return () => { listeners.delete(listener); if (listeners.size === 0) clearInterval(timer); };
        },
        remove: (id, title) => post('delete', id, title),
        restore: (id) => post('restore', id),
      };
    }

    const LIST_KEY = 'dsh-cowork-shell.listAll';
    const LAST_KEY = 'dsh-cowork-shell.lastOpen';
    /** Tab id -> the conversation last open in that tab. Kept in this browser only. */
    function readLast() {
      try {
        const value = JSON.parse(window.localStorage.getItem(LAST_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch { return {}; }
    }
    function writeLast(tab, id) {
      try {
        const all = readLast();
        if (all[tab] === id) return;
        window.localStorage.setItem(LAST_KEY, JSON.stringify({ ...all, [tab]: id }));
      } catch { /* private mode: tabs then open their start page */ }
    }

    function ago(t, ms) {
      if (!Number.isFinite(ms)) return '';
      const s = Math.max(0, (Date.now() - ms) / 1000);
      if (s < 60) return t('ago.now');
      if (s < 3600) return t('ago.m', { n: Math.floor(s / 60) });
      if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) });
      return t('ago.d', { n: Math.floor(s / 86400) });
    }

    /**
     * Which tab a conversation belongs to: its recorded mode when there is one; an empty new conversation
     * follows the open tab; otherwise a guess from where it lives: no project = Chat, the app's default
     * workspace = Cowork, any other project folder = Code.
     */
    function tabOfSession(id, session, workspace, state, tabIds) {
      const recorded = state.sessionModes?.[id];
      if (typeof recorded === 'string' && tabIds.includes(recorded)) return recorded;
      if (session?.blank) return state.selected;
      let guess;
      if (!workspace) guess = 'chat';
      else if (/(^|\/)default-workspace\/?$/.test(String(workspace.path ?? '')) || workspace.title === 'default-workspace') guess = 'cowork';
      else guess = 'code';
      return tabIds.includes(guess) ? guess : tabIds[0];
    }

    /** The app's default workspace (the folder Chat lives in), or null when there is none. */
    function defaultWorkspace(workspaces) {
      return (Array.isArray(workspaces) ? workspaces : []).find((ws) => ws
        && (/(^|[\\/])default-workspace[\\/]?$/.test(String(ws.path ?? '')) || ws.title === 'default-workspace')) ?? null;
    }

    /** The app's own mention of another conversation, as its chat box and server read it. */
    function sessionMention(id, title) {
      const bytes = new TextEncoder().encode(JSON.stringify(String(id)));
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      // The chat box only shows a mention as a chip when its label has no brackets.
      const label = String(title).replace(/[\[\]\\\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat';
      return `@[${label}](dsh-session:${payload})`;
    }

    /**
     * The `⋯` menu of a conversation or project: move it to another tab. On the Chat tab (`promote`) the
     * entries read "Promote to …", and `onContinue` adds "Continue in a project…", a second pane that
     * lists the projects and starts a new conversation there.
     */
    function MoveMenu({ t, tabs, current, onMove, label, promote, projects, onContinue, extra }) {
      const [open, setOpen] = useState(false);
      const [pane, setPane] = useState('root');
      const targets = tabs.filter((m) => m.id !== current);
      const [as, setAs] = useState(() => (targets.find((m) => m.id === 'code') ?? targets[targets.length - 1])?.id);
      useEffect(() => {
        if (!open) { setPane('root'); return undefined; }
        const close = () => setOpen(false);
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
      }, [open]);
      const asMode = targets.find((m) => m.id === as) ?? targets[targets.length - 1];
      const root = () => h(React.Fragment, null,
        targets.map((m) => h('button', {
          key: m.id, type: 'button', role: 'menuitem', className: 'cws-moveitem',
          onClick: (e) => { e.stopPropagation(); setOpen(false); onMove(m.id); },
        }, t(promote ? 'promote.to' : 'move.to', { tab: m.label }))),
        onContinue && asMode ? h(React.Fragment, null,
          h('div', { className: 'cws-movesep', role: 'separator' }),
          h('button', { type: 'button', role: 'menuitem', className: 'cws-moveitem', 'aria-haspopup': 'menu', onClick: (e) => { e.stopPropagation(); setPane('projects'); } }, t('continue.open'))) : null,
        (extra ?? []).length > 0 ? h(React.Fragment, null,
          h('div', { className: 'cws-movesep', role: 'separator' }),
          extra.map((item) => h('button', {
            key: item.key, type: 'button', role: 'menuitem', className: 'cws-moveitem',
            onClick: (e) => { e.stopPropagation(); setOpen(false); item.run(); },
          }, item.label))) : null);
      const projectPane = () => h(React.Fragment, null,
        h('div', { className: 'cws-movehead' },
          h('button', { type: 'button', className: 'cws-link', onClick: (e) => { e.stopPropagation(); setPane('root'); } }, '‹ ' + t('continue.back')),
          h('span', null, t('continue.title'))),
        targets.length > 1 ? h('div', { className: 'cws-moveas', role: 'group', 'aria-label': t('continue.as') },
          h('span', null, t('continue.as')),
          targets.map((m) => h('button', { key: m.id, type: 'button', 'aria-pressed': m.id === asMode.id, onClick: (e) => { e.stopPropagation(); setAs(m.id); } }, m.label))) : null,
        h('div', { className: 'cws-movelist' },
          (projects ?? []).length === 0 ? h('p', { className: 'cws-lib-empty' }, t('continue.none')) : null,
          (projects ?? []).map((ws) => h('button', {
            key: ws.workspaceId, type: 'button', role: 'menuitem', className: 'cws-moveitem', title: ws.path || ws.title || '',
            onClick: (e) => { e.stopPropagation(); setOpen(false); onContinue(ws, asMode); },
          }, ws.title || ws.path || t('untitled')))));
      return h('span', { className: 'cws-move', onPointerDown: (e) => e.stopPropagation() },
        h('button', {
          type: 'button', className: 'cws-mini', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open, title: label,
          onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); },
        }, '⋯'),
        open ? h('div', { className: 'cws-movepop', role: 'menu' }, pane === 'projects' ? projectPane() : root()) : null);
    }

    /** The open tab's conversations: one flat list on the Chat tab, grouped under their projects elsewhere. */
    function TabLibrary({ appCtx, model, library, trash, projectStore, tabs, selected, onShowAll }) {
      const t = appCtx.locale.bind(NS);
      const meta = useSyncExternalStore(projectStore.subscribe, projectStore.get);
      // Projects that were given to this tab show here even before their first conversation.
      const assigned = new Set(selected.id === 'chat' ? [] : meta.projects.filter((item) => item.tab === selected.id).map((item) => item.workspaceId));
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const bin = useSyncExternalStore(trash.subscribe, trash.get);
      // A deleted conversation is hidden at once, also while its files have not moved yet.
      const deleted = new Set(bin.items.map((item) => item.id));
      const [open, setOpen] = useState({});
      const [more, setMore] = useState({});
      const tabIds = tabs.map((m) => m.id);
      const uw = (() => { try { return appCtx.get('uiWorkspace'); } catch { return null; } })();

      const archived = new Set(lib.archived);
      const pinned = new Set(lib.pinned);
      const placed = new Set();
      // An empty new conversation shows only while it is the open one.
      const sortRows = (ids) => ids
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !archived.has(id) && !deleted.has(id) && (!lib.byId[id].blank || id === lib.currentId))
        .sort((a, b) => (pinned.has(b) - pinned.has(a)) || ((lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0)));

      const projects = [];
      for (const ws of lib.workspaces) {
        const ids = sortRows(ws.sessionIds ?? []);
        for (const id of ws.sessionIds ?? []) placed.add(id);
        const mine = ids.filter((id) => tabOfSession(id, lib.byId[id], ws, state, tabIds) === selected.id);
        if (mine.length > 0 || assigned.has(ws.workspaceId)) projects.push({ ws, ids: mine, all: ids, latest: mine.length > 0 ? Math.max(...mine.map((id) => lib.byId[id].updatedAt ?? 0)) : (Date.parse(ws.updatedAt ?? '') || 0) });
      }
      projects.sort((a, b) => b.latest - a.latest);
      const loose = sortRows(Object.keys(lib.byId).filter((id) => !placed.has(id)))
        .filter((id) => tabOfSession(id, lib.byId[id], null, state, tabIds) === selected.id);

      // A conversation's tab is recorded at its first message; read it right away, so the row does not
      // drop out of its tab until the next 10-second refresh.
      const openBlank = lib.currentId ? !!lib.byId[lib.currentId]?.blank : null;
      useEffect(() => {
        if (openBlank !== false) return undefined;
        void model.refresh();
        const timer = setTimeout(() => void model.refresh(), 1500);
        return () => clearTimeout(timer);
      }, [lib.currentId, openBlank, model]);

      // Chat is not about projects: one list, pinned first, then newest first.
      const flat = selected.id === 'chat';
      const wsOf = {};
      if (flat) for (const p of projects) for (const id of p.ids) wsOf[id] = p.ws;
      const flatIds = flat ? sortRows([...projects.flatMap((p) => p.ids), ...loose]) : [];

      const openSession = (id) => {
        try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
        uw?.openSession?.(id);
      };

      const openProject = (workspaceId) => {
        projectStore.focus(workspaceId);
        try { appCtx.layout.selectPanel('project'); } catch { /* the page is not there */ }
      };
      /** New project: pick a folder; the app lists it as a project and Plus files it under this tab. */
      const addProject = async () => {
        try {
          const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
          const native = desktop && typeof desktop.pick === 'function';
          let picked = null;
          try { picked = native ? await desktop.pick() : await uw.pickDirectory(); } catch (error) { if (native) throw error; }
          // In a web browser there may be no folder chooser: ask for the path instead.
          if (!picked && !native) picked = window.prompt(t('proj.add.path'));
          const path = (typeof picked === 'string' ? picked : picked?.path ?? '').trim();
          if (!path) return;
          const ws = await appCtx.get('workspaces').create({ path });
          await projectStore.save(ws?.path ?? path, { tab: selected.id });
          if (ws?.workspaceId) openProject(ws.workspaceId);
        } catch (error) {
          model.fail(t('proj.add.failed', { message: String(error?.message ?? error) }));
        }
      };

      /** A new conversation in a project, with this chat attached the app's own way (an @ mention). */
      const continueIn = async (id, title, ws, mode) => {
        try {
          if (mode.id !== state.selected) await model.select(mode.id, mode.label);
          try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
          uw.startSession(ws.workspaceId, { prompt: t('continue.prompt', { mention: sessionMention(id, title) }), whenDraftExists: 'replace' });
        } catch {
          model.fail(t('continue.failed'));
        }
      };

      /** Archive a conversation the app's own way. One that is still working asks first. */
      const archiveQuietly = async (id, question) => {
        const service = (() => { try { return appCtx.get('workspaces'); } catch { return null; } })();
        try {
          await service.archiveSession(id);
        } catch (error) {
          if (error?.rpcError?.code !== 'workspace/session-active') throw error;
          if (!window.confirm(question)) return false;
          await service.archiveSession(id, { stopActivity: true });
        }
        if (id === lib.currentId) startNew(appCtx, library, selected.id);
        return true;
      };
      const archive = async (id) => {
        try {
          await archiveQuietly(id, t('archive.running'));
        } catch {
          model.fail(t('archive.failed'));
        }
      };
      /** Delete: archive it (the app then stops using it), then move its files to the trash. */
      const remove = async (id, title) => {
        if (!window.confirm(t('delete.confirm', { title }))) return;
        try {
          if (archived.has(id)) {
            if (id === lib.currentId) startNew(appCtx, library, selected.id);
          } else if (!(await archiveQuietly(id, t('delete.running')))) return;
          await trash.remove(id, title);
        } catch {
          model.fail(t('delete.failed'));
        }
      };
      const putBack = async (id) => {
        try {
          await trash.restore(id);
        } catch {
          model.fail(t('trash.back.failed'));
        }
      };
      const restore = async (id) => {
        try {
          await appCtx.get('workspaces').unarchiveSession(id);
        } catch {
          model.fail(t('archived.restore.failed'));
        }
      };

      // Archived conversations of this tab, newest first.
      const wsById = {};
      for (const ws of lib.workspaces) for (const id of ws.sessionIds ?? []) wsById[id] = ws;
      const archivedIds = lib.archived
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !lib.byId[id].blank && !deleted.has(id)
          && tabOfSession(id, lib.byId[id], wsById[id] ?? null, state, tabIds) === selected.id)
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      // Every conversation that waits for the user, from all tabs: an approval, a plan review or a question.
      const needsIds = Object.keys(lib.waiting)
        .filter((id) => lib.byId[id] && !archived.has(id) && !deleted.has(id))
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      const needsSection = () => {
        if (needsIds.length === 0) return null;
        return h('div', { className: 'cws-needs', role: 'region', 'aria-label': t('needs.title', { n: needsIds.length }) },
          h('div', { className: 'cws-lib-head cws-needs-head' }, h('span', null, t('needs.title', { n: needsIds.length }))),
          needsIds.map((id) => {
            const sess = lib.byId[id];
            const title = (sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
            const why = t('needs.' + lib.waiting[id]);
            return h('div', { key: id, className: 'cws-conv', 'aria-current': lib.currentId === id ? 'page' : undefined },
              h('button', { type: 'button', className: 'cws-conv-main cws-needs-row', onClick: () => openSession(id), title: title + ' · ' + why },
                h('span', { className: 'cws-dot cws-dot-wait', 'aria-hidden': true }),
                h('span', { className: 'cws-needs-text' },
                  h('span', { className: 'cws-label' }, title),
                  h('span', { className: 'cws-needs-why' }, why))));
          }));
      };
      const trashSection = () => {
        if (bin.items.length === 0) return null;
        const shown = !!open.__trash;
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'cws-more-btn cws-archived-head', 'aria-expanded': shown, onClick: () => setOpen((o) => ({ ...o, __trash: !shown })) },
            (shown ? '▾ ' : '▸ ') + t('trash.title', { n: bin.items.length })),
          shown ? bin.items.map((item) => {
            const title = item.title || t('untitled');
            const left = Math.max(0, Math.ceil((item.deletedAt + bin.keepMs - Date.now()) / 86400000));
            return h('div', { key: item.id, className: 'cws-conv cws-archived' },
              h('span', { className: 'cws-conv-main cws-trashed', title },
                h('span', { className: 'cws-label' }, title),
                h('span', { className: 'cws-time' }, t('trash.left', { n: left }))),
              h('button', { type: 'button', className: 'cws-link', 'aria-label': t('trash.back.label', { title }), onClick: () => void putBack(item.id) }, t('trash.back')));
          }) : null);
      };
      const archivedSection = () => {
        if (archivedIds.length === 0) return trashSection();
        const shown = !!open.__archived;
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'cws-more-btn cws-archived-head', 'aria-expanded': shown, onClick: () => setOpen((o) => ({ ...o, __archived: !shown })) },
            (shown ? '▾ ' : '▸ ') + t('archived.title', { n: archivedIds.length })),
          shown ? archivedIds.map((id) => {
            const sess = lib.byId[id];
            const title = (sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
            return h('div', { key: id, className: 'cws-conv cws-archived', 'aria-current': lib.currentId === id ? 'page' : undefined },
              h('button', { type: 'button', className: 'cws-conv-main', onClick: () => openSession(id), title },
                h('span', { className: 'cws-label' }, title),
                h('span', { className: 'cws-time' }, ago(t, sess.updatedAt))),
              h('button', { type: 'button', className: 'cws-link', 'aria-label': t('archived.restore.label', { title }), onClick: () => void restore(id) }, t('archived.restore')),
              h('button', { type: 'button', className: 'cws-link', 'aria-label': t('delete.label', { title }), onClick: () => void remove(id, title) }, t('delete')));
          }) : null,
          trashSection());
      };

      const row = (id, ws) => {
        const sess = lib.byId[id];
        const title = (!sess.blank && sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
        const current = lib.currentId === id;
        return h('div', { key: id, className: 'cws-conv', 'aria-current': current ? 'page' : undefined },
          h('button', { type: 'button', className: 'cws-conv-main', onClick: () => openSession(id), title },
            lib.waiting[id]
              ? h('span', { className: 'cws-dot cws-dot-wait', role: 'img', 'aria-label': t('needs.' + lib.waiting[id]), title: t('needs.' + lib.waiting[id]) })
              : sess.running ? h('span', { className: 'cws-dot', role: 'img', 'aria-label': t('running'), title: t('running') }) : null,
            pinned.has(id) ? h('span', { className: 'cws-pin', 'aria-hidden': true }, '•') : null,
            h('span', { className: 'cws-label' }, title),
            h('span', { className: 'cws-time' }, ago(t, sess.updatedAt))),
          sess.blank ? null : h(MoveMenu, {
            t, tabs, current: tabOfSession(id, sess, ws, state, tabIds),
            label: t(flat ? 'promote.label' : 'move.label', { title }),
            onMove: (modeId) => void model.move([id], modeId),
            promote: flat,
            projects: flat ? lib.workspaces : undefined,
            onContinue: flat && typeof uw?.startSession === 'function' ? (target, mode) => void continueIn(id, title, target, mode) : undefined,
            extra: [{ key: 'archive', label: t('archive'), run: () => void archive(id) }, { key: 'delete', label: t('delete'), run: () => void remove(id, title) }],
          }));
      };

      const list = (ids, key, ws) => {
        const limit = more[key] ? ids.length : 8;
        return h(React.Fragment, null, ids.slice(0, limit).map((id) => row(id, ws)),
          ids.length > limit ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, [key]: true })) }, t('show.more', { n: ids.length - limit })) : null);
      };

      const empty = projects.length === 0 && loose.length === 0;
      if (flat) {
        return h('div', { className: 'cws-lib' },
          needsSection(),
          h('div', { className: 'cws-lib-head' },
            h('span', null, t('lib.title.chat', { tab: selected.label })),
            h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all'))),
          empty ? h('p', { className: 'cws-lib-empty' }, t('lib.empty', { tab: selected.label })) : null,
          h(React.Fragment, null, flatIds.slice(0, more.__flat ? flatIds.length : 30).map((id) => row(id, wsOf[id] ?? null)),
            flatIds.length > 30 && !more.__flat ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, __flat: true })) }, t('show.more', { n: flatIds.length - 30 })) : null),
          archivedSection());
      }
      return h('div', { className: 'cws-lib' },
        needsSection(),
        h('div', { className: 'cws-lib-head' },
          h('span', null, t('lib.title.' + (['chat', 'cowork', 'code'].includes(selected.id) ? selected.id : 'other'), { tab: selected.label })),
          h('span', { className: 'cws-lib-links' },
            h('button', { type: 'button', className: 'cws-link', onClick: () => void addProject(), title: t('proj.add.hint') }, '+ ' + t('proj.add')),
            h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all')))),
        empty ? h('p', { className: 'cws-lib-empty' }, t('lib.empty', { tab: selected.label })) : null,
        projects.map(({ ws, ids, all }) => {
          const isOpen = open[ws.workspaceId] ?? ids.includes(lib.currentId);
          return h('div', { key: ws.workspaceId, className: 'cws-proj' },
            h('div', { className: 'cws-proj-row' },
              h('button', { type: 'button', className: 'cws-proj-main', 'aria-expanded': isOpen, onClick: () => setOpen((o) => ({ ...o, [ws.workspaceId]: !isOpen })) },
                h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: isOpen ? 'folderOpen' : 'folder', size: 16 })),
                h('span', { className: 'cws-label' }, ws.title || ws.path || t('untitled')),
                h('span', { className: 'cws-count' }, String(ids.length))),
              h('button', { type: 'button', className: 'cws-mini', title: t('proj.new'), 'aria-label': t('proj.new'), onClick: () => { try { appCtx.layout.selectPanel(null); } catch { /* */ } uw?.startSession?.(ws.workspaceId); } }, '+'),
              h('button', { type: 'button', className: 'cws-mini', title: t('proj.open'), 'aria-label': t('proj.open'), onClick: () => openProject(ws.workspaceId) }, '⚙'),
              h(MoveMenu, { t, tabs, current: selected.id, label: t('proj.move', { title: ws.title || '' }), onMove: (modeId) => void model.move(all.filter((id) => !lib.byId[id]?.blank), modeId) })),
            isOpen ? h('div', { className: 'cws-proj-list' }, list(ids, ws.workspaceId, ws)) : null);
        }),
        loose.length ? h(React.Fragment, null,
          h('div', { className: 'cws-lib-head' }, h('span', null, t('lib.loose'))),
          list(loose, '__loose', null)) : null,
        archivedSection());
    }

    /** The New button: on the Chat tab it always starts in the app's default workspace, when there is one. */
    /**
     * A new conversation of an isolated tab that has a folder of its own (Recon): it starts in that
     * folder, never in one of the user's, so the model is told no path of theirs. The add-on names
     * its folder at `<tab id>/state` as `room`. Falls back to the usual start when it has none.
     */
    async function startInRoom(appCtx, library, tabId) {
      const response = await fetch(new URL(`dsh-${tabId}/state`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const room = response.ok ? String((await response.json()).room ?? '') : '';
      if (!room) return false;
      const same = (path) => String(path ?? '').replace(/^\/private(?=\/tmp\/)/, '').replace(/\/+$/, '') === room.replace(/^\/private(?=\/tmp\/)/, '').replace(/\/+$/, '');
      let ws = (library.get().workspaces ?? []).find((entry) => entry && same(entry.path));
      if (!ws) {
        ws = await appCtx.get('workspaces').create({ path: room });
        try { await appCtx.get('workspaces').rename(ws.workspaceId, 'Recon room'); } catch { /* the folder's own name is fine */ }
      }
      if (!ws?.workspaceId) return false;
      appCtx.uiWorkspace.startSession(ws.workspaceId);
      return true;
    }

    function startNew(appCtx, library, tabId) {
      try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
      if (tabId === 'recon') {
        startInRoom(appCtx, library, tabId).then((done) => { if (!done) appCtx.uiWorkspace.startSession(undefined); }, () => appCtx.uiWorkspace.startSession(undefined));
        return;
      }
      let home = null;
      if (tabId === 'chat') { try { home = defaultWorkspace(library.get().workspaces); } catch { home = null; } }
      appCtx.uiWorkspace.startSession(home ? home.workspaceId : undefined);
    }

    function CoworkSidebar(props) {
      const { collapsed, width, drawer, renderSlot, renderFactorySlot, usePanelInfo, appCtx, model, pages, library, trash, projects } = props;
      const libSnap = useSyncExternalStore(library.subscribe, library.get);
      const libReady = libSnap.ok && model.get().modesOn;
      const [showAll, setShowAllState] = useState(() => { try { return window.localStorage.getItem(LIST_KEY) === '1'; } catch { return false; } });
      const setShowAll = (value) => { setShowAllState(value); try { window.localStorage.setItem(LIST_KEY, value ? '1' : '0'); } catch { /* private mode */ } };
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const allPages = useSyncExternalStore(pages.subscribe, pages.get);
      const active = typeof usePanelInfo === 'function' ? usePanelInfo((info) => info.activePanelId) : null;
      const entryActions = useSyncExternalStore(
        useCallback((l) => appCtx.slots.subscribe('sidebar.panellist.actions', l), []),
        () => appCtx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
      );
      const tabsRef = useRef(null);
      const shortcut = useNewSessionShortcut(appCtx);

      useEffect(() => {
        void model.refresh();
        const timer = setInterval(() => void model.refresh(), 10000);
        return () => clearInterval(timer);
      }, [model]);

      const wide = drawer || !collapsed;
      const darwin = document.documentElement.getAttribute('data-platform') === 'darwin';
      const tabs = tabsOf(state);
      const selected = tabs.find((m) => m.id === state.selected) ?? tabs[0];
      const layout = state.tabs;
      const claimed = new Set(Object.values(layout).flatMap((tab) => (Array.isArray(tab?.pages) ? tab.pages : [])));
      const own = (Array.isArray(layout[selected.id]?.pages) ? layout[selected.id].pages : [])
        .map((id) => allPages.find((p) => p.id === id)).filter(Boolean);
      const shared = allPages.filter((p) => !claimed.has(p.id));
      const rows = [...own, ...shared];
      const newLabel = (typeof layout[selected.id]?.newLabel === 'string' && layout[selected.id].newLabel.trim())
        || (['chat', 'cowork', 'code'].includes(selected.id) ? t('new.' + selected.id) : t('new.other'));
      const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse');

      const startSession = () => startNew(appCtx, library, selected.id);
      // Chat does not choose a folder: while the open tab is Chat and the open conversation lives in the
      // app's default workspace (or nothing is open), the start page's folder picker is hidden by CSS.
      // The preset picker (Standard, PTC, ...) stays: it changes how the model calls tools, so it must be visible.
      const home = defaultWorkspace(libSnap.workspaces);
      const currentWs = libSnap.currentId ? libSnap.workspaces.find((ws) => (ws.sessionIds ?? []).includes(libSnap.currentId)) : null;
      const plainChat = selected.id === 'chat' && libSnap.ok && !!home && (!currentWs || currentWs.workspaceId === home.workspaceId);
      useEffect(() => {
        const root = document.documentElement;
        if (plainChat) root.setAttribute('data-cws-plain-chat', '');
        else root.removeAttribute('data-cws-plain-chat');
        return () => root.removeAttribute('data-cws-plain-chat');
      }, [plainChat]);
      // Wide chat: the conversation and the message box use the window's width.
      useEffect(() => {
        const root = document.documentElement;
        if (state.wideChat) root.setAttribute('data-cws-wide', '');
        else root.removeAttribute('data-cws-wide');
        return () => root.removeAttribute('data-cws-wide');
      }, [state.wideChat]);
      // Other add-ons show or hide their start-page parts by the selected tab.
      useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-cws-tab', selected.id);
        return () => root.removeAttribute('data-cws-tab');
      }, [selected.id]);
      // Each tab remembers the conversation that was open in it. Coming back to a tab opens that
      // conversation again; a tab with nothing to come back to opens its start page.
      const selectedRef = useRef(selected.id);
      selectedRef.current = selected.id;
      useEffect(() => {
        const id = libSnap.currentId;
        if (!id || !libSnap.ok) return;
        const sess = libSnap.byId[id];
        if (!sess || sess.origin === 'subagent') return;
        const ws = libSnap.workspaces.find((item) => (item.sessionIds ?? []).includes(id)) ?? null;
        const now = model.get();
        const tab = tabOfSession(id, sess, ws, now, tabs.map((m) => m.id));
        // A conversation opened from another tab's list (Needs you, Show all) is remembered for its own tab.
        writeLast(sess.blank ? selectedRef.current : tab, id);
      }, [libSnap.currentId, libSnap.ok]);
      const switchTab = (m) => {
        void model.select(m.id, m.label);
        const snap = library.get();
        if (!snap.ok) return;
        const last = readLast()[m.id];
        const sess = last ? snap.byId[last] : null;
        const gone = !sess || snap.archived.includes(last) || trash.get().items.some((item) => item.id === last);
        try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
        if (!gone && last !== snap.currentId) {
          try { appCtx.get('uiWorkspace').openSession(last); return; } catch { /* fall through to a new one */ }
        }
        if (gone) startNew(appCtx, library, m.id);
      };
      const onTabKey = (event) => {
        const index = tabs.findIndex((m) => m.id === selected.id);
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        event.preventDefault();
        switchTab(tabs[next]);
        tabsRef.current?.querySelectorAll('[role=tab]')[next]?.focus();
      };

      const toggle = h(Tooltip, { label: toggleLabel, show: true },
        h('button', { type: 'button', className: 'cws-icon', 'data-sidebar-toggle': '', 'aria-label': toggleLabel, onClick: () => appCtx.layout.toggleSidebar() },
          h(Glyph, { name: 'panel', size: wide ? 16 : 18 })));

      const pageRow = (p) => h(Tooltip, { key: p.id, label: p.label, show: !wide },
        h('button', {
          type: 'button', className: 'cws-row', 'aria-label': wide ? undefined : p.label,
          'aria-current': active === p.id ? 'page' : undefined, onClick: () => appCtx.layout.selectPanel(p.id),
        },
        h('span', { className: 'cws-glyph', 'aria-hidden': true }, renderFactorySlot('sidebar.panel.icon', { id: p.id, size: wide ? 16 : 18, active: active === p.id })),
        wide ? h('span', { className: 'cws-label' }, p.label) : null));

      const tabList = h('div', { ref: tabsRef, className: 'cws-tabs', 'data-many': wide && tabs.length > 3 ? 'true' : undefined, role: 'tablist', 'aria-label': t('tabs.label'), 'aria-orientation': wide ? 'horizontal' : 'vertical', onKeyDown: onTabKey },
        tabs.map((m) => h(Tooltip, { key: m.id, label: m.label, show: !wide },
          h('button', {
            type: 'button', role: 'tab', className: 'cws-tab', 'aria-selected': m.id === selected.id,
            tabIndex: m.id === selected.id ? 0 : -1, 'aria-label': wide ? undefined : m.label,
            onClick: () => { if (m.id !== selected.id) switchTab(m); },
          }, h(Glyph, { name: glyphFor(m.id), size: wide ? 15 : 18 }), wide ? h('span', null, m.label) : null))));

      const more = entryActions
        ? h(MoreMenu, {
          wide, label: t('more'), renderSlot,
          entries: allPages.filter((p) => p.id !== 'plugins').map((p) => ({ id: p.id, label: p.label, pinned: true, active: p.id === active })),
          onOpen: (id) => appCtx.layout.selectPanel(id),
          extra: [
            { key: 'logos', label: t(state.hideLogos ? 'look.logos.show' : 'look.logos.hide'), run: () => void model.setOption('hideLogos', !state.hideLogos) },
            { key: 'title', label: t(state.dateTitle ? 'look.title.greeting' : 'look.title.date'), run: () => void model.setOption('dateTitle', !state.dateTitle) },
            { key: 'wide', label: t(state.wideChat ? 'look.chat.normal' : 'look.chat.wide'), run: () => void model.setOption('wideChat', !state.wideChat) },
          ],
        })
        : null;

      if (!wide) {
        return h('div', { className: 'cws-root cws-rail', 'data-cowork-shell': 'rail' },
          h('div', { className: 'cws-strip' }, toggle),
          h(Tooltip, { label: newLabel, show: true },
            h('button', { type: 'button', className: 'cws-icon', 'aria-label': newLabel, onClick: startSession }, h(Glyph, { name: 'plus', size: 18 }))),
          tabList,
          h('div', { className: 'cws-scroll' }, h('nav', { className: 'cws-pages', 'aria-label': t('pages.label', { tab: selected.label }) }, rows.map(pageRow), more)),
          h('div', { className: 'cws-foot' }, renderSlot('sidebar.footer.action', { wide: false }), renderSlot('sidebar.settings', { wide: false })));
      }

      return h('div', { className: 'cws-root', 'data-cowork-shell': 'wide', style: { width } },
        h('div', { className: 'cws-strip', 'data-window-drag': darwin ? '' : undefined }, toggle),
        state.hideLogos ? null : h('div', { className: 'cws-brand', 'data-window-drag': darwin ? '' : undefined },
          renderSlot('sidebar.brand.mark', { size: 20 }, { fallback: UI.FishLogo ? h(UI.FishLogo, { size: 20 }) : null }),
          renderSlot('sidebar.brand.name', {}, { fallback: h('span', null, t('brand')) })),
        tabList,
        state.error ? h('div', { className: 'cws-error', role: 'status' }, state.error) : null,
        h('button', { type: 'button', className: 'cws-new', onClick: startSession, 'aria-keyshortcuts': shortcut?.aria },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'plus', size: 16 })), h('span', { className: 'cws-label' }, newLabel),
          shortcut ? h('span', { className: 'cws-kbd', 'aria-hidden': true }, UI.ShortcutKeys ? h(UI.ShortcutKeys, { keys: shortcut.keys }) : shortcut.keys.join('')) : null),
        h('div', { className: 'cws-scroll', 'data-sidebar-scrollport': '' },
          rows.length > 0 || more ? h('nav', { className: 'cws-pages', 'aria-label': t('pages.label', { tab: selected.label }) }, rows.map(pageRow), more) : null,
          libReady && !showAll
            ? h(TabLibrary, { appCtx, model, library, trash, projectStore: projects, tabs, selected, onShowAll: () => setShowAll(true) })
            : h(React.Fragment, null,
              libReady ? h('div', { className: 'cws-lib-head cws-lib-allbar' },
                h('span', null, t('lib.showingAll')),
                h('button', { type: 'button', className: 'cws-link', onClick: () => setShowAll(false) }, t('lib.mine', { tab: selected.label }))) : null,
              renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => { if (collapsed) appCtx.layout.toggleSidebar(); } }, { hookContext: HOOK_CONTEXT }))),
        h('div', { className: 'cws-foot' }, renderSlot('sidebar.footer.action', { wide: true }), renderSlot('sidebar.settings', { wide: true })));
    }

    /** Same job as the app's: a page row's icon comes from that page's own registration. */
    function PanelIcon({ id, size, active, renderSlot }) {
      return renderSlot('sidebar.panellist', { size, active }, { only: id });
    }

    /** macOS desktop: while the sidebar is hidden, the frame shows these beside the traffic lights. */
    function Leading({ appCtx, model, library }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      useSyncExternalStore(library.subscribe, library.get); // keeps the project list fresh for the New button
      const key = ['chat', 'cowork', 'code'].includes(state.selected) ? 'new.' + state.selected : 'new.other';
      return h('div', { className: 'cws-lead' },
        h('button', { type: 'button', className: 'cws-icon', 'data-sidebar-opener': '', 'aria-label': t('toggle.open'), onClick: () => appCtx.layout.toggleSidebar() }, h(Glyph, { name: 'panel', size: 16 })),
        h('button', { type: 'button', className: 'cws-icon', 'aria-label': t(key), onClick: () => startNew(appCtx, library, state.selected) }, h(Glyph, { name: 'plus', size: 16 })));
    }


    /** Unwrap a remote result envelope `{ ok, value | error }`; pass plain values through. */
    function unwrap(result) {
      if (result && typeof result === 'object' && typeof result.ok === 'boolean' && ('value' in result || 'error' in result)) {
        if (!result.ok) throw new Error(`${result.error?.code ?? 'error'}: ${result.error?.message ?? ''}`);
        return result.value;
      }
      return result;
    }

    function fill(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined ? '' : String(values[key])));
    }

    function PageFrame({ title, hint, actions, children }) {
      return h('div', { className: 'cws-page' },
        h('div', { className: 'cws-page-in' },
          h('div', { className: 'cws-head' },
            h('div', null, h('h1', null, title), hint ? h('p', { className: 'cws-hint' }, hint) : null),
            actions || null),
          children));
    }

    const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
    /**
     * The app's plugin on/off switch, filled in only when the page can reach the plugin manager.
     * It is an optional dependency on purpose: the sidebar itself must load even without it.
     */
    const PLUGIN_SWITCH = { set: null };

    /** YAML for one MCP server row, ready to paste at the end of the profile's cordis.patch.yml. */
    function rowYaml(form) {
      const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
      const lines = ['- insert:', `    - id: mcp-${form.name}`, "      name: '@deepseek-ai/dsh-mcp-client'", '      config:',
        `        serverName: ${form.name}`];
      if (form.kind === 'http') {
        lines.push('        transport: streamable-http', `        url: ${q(form.url.trim())}`);
      } else {
        const args = form.args.split('\n').map((a) => a.trim()).filter(Boolean);
        lines.push('        transport: stdio', `        command: ${q(form.command.trim())}`);
        if (args.length) lines.push(`        args: [${args.map(q).join(', ')}]`);
      }
      return lines.join('\n') + '\n';
    }

    function ConnectorsPage({ appCtx }) {
      const t = appCtx.locale.bind(NS);
      const [state, setState] = useState({ status: 'loading', servers: [] });
      const [busy, setBusy] = useState('');
      const [notes, setNotes] = useState({});
      const [form, setForm] = useState({ name: '', kind: 'stdio', command: '', args: '', url: '', error: '', yaml: '', copied: false });

      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-cowork-shell/connectors', document.baseURI), { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error(String(response.status));
          const data = await response.json();
          setState({ status: 'ready', servers: Array.isArray(data.servers) ? data.servers : [] });
        } catch {
          setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', servers: [] }));
        }
      }, []);

      useEffect(() => {
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => clearInterval(timer);
      }, [load]);

      const note = (id, text, tone) => setNotes((prev) => ({ ...prev, [id]: { text, tone } }));

      /** On/off goes through the app's own plugin switch (the same one the Plugins page uses). */
      const toggle = async (server, on) => {
        setBusy(server.entryId);
        try {
          if (!PLUGIN_SWITCH.set) throw new Error(t('connectors.noSwitch'));
          const result = unwrap(await PLUGIN_SWITCH.set(server.entryId, on));
          if (result?.application === 'restart-required' || result?.restartRequired) note(server.entryId, t('connectors.restartNeeded'), '');
          else if (result?.application === 'failed') note(server.entryId, t('connectors.switchFailed'), 'bad');
          else if (result?.application === 'overridden') note(server.entryId, t('connectors.overridden'), 'bad');
          else note(server.entryId, '', '');
          setTimeout(() => void load(), 1500);
          await load();
        } catch (error) {
          note(server.entryId, fill(t('connectors.failed'), { message: error.message }), 'bad');
        } finally {
          setBusy('');
        }
      };

      const makeYaml = () => {
        const name = form.name.trim();
        if (!NAME_RE.test(name) || state.servers.some((s) => s.serverName === name || s.id === `mcp-${name}`)) {
          setForm((prev) => ({ ...prev, error: t('add.bad.name'), yaml: '' }));
          return;
        }
        if (form.kind === 'http' ? !/^https?:\/\/\S+$/.test(form.url.trim()) : !form.command.trim()) {
          setForm((prev) => ({ ...prev, error: t('add.bad.target'), yaml: '' }));
          return;
        }
        setForm((prev) => ({ ...prev, name, error: '', yaml: rowYaml({ ...prev, name }), copied: false }));
      };

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(form.yaml);
          setForm((prev) => ({ ...prev, copied: true }));
        } catch {
          setForm((prev) => ({ ...prev, copied: false }));
        }
      };

      const rows = state.servers.map((server) => {
        const n = notes[server.entryId];
        const chip = !server.enabled
          ? h('span', { className: 'cws-chip' }, t('status.disabled'))
          : server.toolCount > 0
            ? h('span', { className: 'cws-chip', 'data-tone': 'good' }, server.toolCount === 1 ? t('status.connected.one') : fill(t('status.connected'), { n: server.toolCount }))
            : h('span', { className: 'cws-chip', 'data-tone': 'bad', title: t('status.notConnected.hint') }, t('status.notConnected'));
        return h('div', { key: server.entryId, className: 'cws-item' },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'link', size: 16 })),
          h('div', { className: 'cws-item-main' },
            h('div', { className: 'cws-item-name' }, server.serverName),
            h('div', { className: 'cws-item-sub' }, [server.transport === 'streamable-http' ? t('add.kind.http') : t('add.kind.stdio'), server.target].filter(Boolean).join(' · ')),
            n && n.text ? h('div', { className: 'cws-msg', 'data-tone': n.tone, role: 'status' }, n.text) : null),
          chip,
          h('button', {
            type: 'button', role: 'switch', className: 'cws-switch', 'aria-checked': server.enabled,
            'aria-label': `${t('connectors.on')}: ${server.serverName}`, disabled: busy === server.entryId,
            onClick: () => void toggle(server, !server.enabled),
          }));
      });

      const field = (label, input) => [h('label', { key: label + 'l' }, label), h('div', { key: label + 'i' }, input)];
      const set = (patch) => setForm((prev) => ({ ...prev, ...patch, error: '', yaml: '' }));
      const addForm = h('div', { className: 'cws-card' },
        h('div', { className: 'cws-item-name', style: { paddingTop: 12 } }, t('add.title')),
        h('div', { className: 'cws-form' },
          ...field(t('add.name'), h('input', { value: form.name, onChange: (e) => set({ name: e.target.value }), 'aria-label': t('add.name') })),
          ...field(t('add.kind'), h('select', { value: form.kind, onChange: (e) => set({ kind: e.target.value }), 'aria-label': t('add.kind') },
            h('option', { value: 'stdio' }, t('add.kind.stdio')), h('option', { value: 'http' }, t('add.kind.http')))),
          ...(form.kind === 'http'
            ? field(t('add.url'), h('input', { value: form.url, placeholder: 'https://', onChange: (e) => set({ url: e.target.value }), 'aria-label': t('add.url') }))
            : [...field(t('add.command'), h('input', { value: form.command, onChange: (e) => set({ command: e.target.value }), 'aria-label': t('add.command') })),
              ...field(t('add.args'), h('textarea', { value: form.args, onChange: (e) => set({ args: e.target.value }), 'aria-label': t('add.args') }))]),
          h('div', { key: 'go-l' }),
          h('div', { key: 'go-i', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
            h('button', { type: 'button', className: 'cws-btn', onClick: makeYaml }, t('add.make')),
            form.error ? h('span', { className: 'cws-msg', 'data-tone': 'bad', role: 'status' }, form.error) : null)),
        form.yaml ? h('div', { style: { paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('add.paste')),
          h('pre', { className: 'cws-yaml' }, form.yaml),
          h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
            h('button', { type: 'button', className: 'cws-btn', onClick: () => void copy() }, t('add.copy')),
            form.copied ? h('span', { className: 'cws-msg', role: 'status' }, t('add.copied')) : null)) : null,
        h('p', { className: 'cws-note', style: { margin: '0 0 12px' } }, t('add.note')));

      return h(PageFrame, {
        title: t('connectors.title'), hint: t('connectors.hint'),
        actions: h('button', { type: 'button', className: 'cws-btn', onClick: () => void load() }, t('refresh')),
      },
      state.status === 'error' ? h('p', { className: 'cws-note' }, t('connectors.unavailable')) : null,
      state.status === 'ready' ? h('div', { className: 'cws-card' }, rows.length ? rows : h('p', { className: 'cws-note', style: { margin: '12px 0' } }, t('connectors.empty'))) : null,
      addForm);
    }

    function SkillsPage({ appCtx }) {
      const t = appCtx.locale.bind(NS);
      const [state, setState] = useState({ status: 'loading', data: null });
      const [query, setQuery] = useState('');
      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-cowork-shell/skills', document.baseURI), { headers: { accept: 'application/json' } });
          if (!response.ok) throw new Error(String(response.status));
          setState({ status: 'ready', data: await response.json() });
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null }));
        }
      }, []);
      useEffect(() => { void load(); }, [load]);
      const words = query.trim().toLowerCase();
      const skills = (state.data?.skills ?? []).filter((skill) => !words
        || `${skill.name} ${skill.description} ${skill.whenToUse}`.toLowerCase().includes(words));
      return h(PageFrame, {
        title: t('skills.title'), hint: t('skills.hint'),
        actions: h('button', { type: 'button', className: 'cws-btn', onClick: () => void load() }, t('refresh')),
      },
      h('input', { className: 'cws-search', type: 'search', placeholder: t('skills.search'), 'aria-label': t('skills.search'), value: query, onChange: (e) => setQuery(e.target.value) }),
      state.status === 'error' ? h('p', { className: 'cws-note' }, t('skills.unavailable')) : null,
      state.status === 'ready' ? h('div', { className: 'cws-card' },
        skills.length ? skills.map((skill) => h('div', { key: skill.name, className: 'cws-item' },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'sparkle', size: 16 })),
          h('div', { className: 'cws-item-main' },
            h('div', { className: 'cws-item-name' }, skill.name),
            skill.description ? h('div', { className: 'cws-item-sub cws-clamp', title: skill.description }, skill.description) : null,
            skill.path ? h('div', { className: 'cws-item-sub', title: skill.path }, skill.path) : null),
          skill.userInvocable ? h('span', { className: 'cws-chip' }, t('skills.user')) : null,
          skill.modelInvocable ? h('span', { className: 'cws-chip' }, t('skills.model')) : null))
          : h('p', { className: 'cws-note', style: { margin: '12px 0' } }, t('skills.empty'))) : null);
    }

    /** Today's date as a title: "11 November, 2026" in English, the language's own long date otherwise. */
    function todayTitle(appCtx, now = new Date()) {
      let lang = 'en';
      try { lang = String(appCtx.locale?.current ?? appCtx.locale?.language ?? document.documentElement.lang ?? 'en') || 'en'; } catch { lang = 'en'; }
      try {
        if (/^en\b/i.test(lang)) return `${now.getDate()} ${now.toLocaleDateString('en', { month: 'long' })}, ${now.getFullYear()}`;
        return now.toLocaleDateString(lang, { dateStyle: 'long' });
      } catch {
        return now.toDateString();
      }
    }

    /** The tab's layout entry with defaults filled in field by field. */
    function tabEntry(state, id) {
      const own = state.tabs?.[id] ?? {};
      const base = DEFAULT_TABS[id] ?? {};
      return {
        greeting: typeof own.greeting === 'string' ? own.greeting : (base.greeting ?? ''),
        chips: Array.isArray(own.chips) ? own.chips : (base.chips ?? []),
      };
    }

    /**
     * Start page greeting. It fills the start page's logo seat and, while it shows a greeting, the
     * stock title next to it is hidden by CSS, so switching the add-on off restores the stock title.
     */
    function HeroGreeting({ size, appCtx, model }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const tabs = tabsOf(state);
      const selected = tabs.find((m) => m.id === state.selected) ?? tabs[0];
      // The date changes at midnight; look again once a minute while it is the title.
      const [, tick] = useState(0);
      useEffect(() => {
        if (!state.dateTitle) return undefined;
        const timer = setInterval(() => tick((n) => n + 1), 60000);
        return () => clearInterval(timer);
      }, [state.dateTitle]);
      const greeting = state.dateTitle ? todayTitle(appCtx) : String(tabEntry(state, selected.id).greeting || '').slice(0, 120);
      const mark = !state.hideLogos && UI.FishLogo ? h(UI.FishLogo, { size: size ?? 34 }) : null;
      if (!greeting) return mark;
      return h('span', { className: 'cws-hero', 'data-cws-hero': '' }, mark, h('span', { className: 'cws-hero-text' }, greeting));
    }

    /** Suggestion chips: each fills the chat box with a starter prompt. */
    function HeroChips({ appCtx, model, library }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const tabs = tabsOf(state);
      const selected = tabs.find((m) => m.id === state.selected) ?? tabs[0];
      const chips = tabEntry(state, selected.id).chips
        .filter((chip) => chip && typeof chip.label === 'string' && chip.label.trim())
        .slice(0, 12);
      if (chips.length === 0) return null;
      return h('div', { className: 'cws-chips', role: 'group', 'aria-label': appCtx.locale.bind(NS)('chips.label') },
        chips.map((chip) => h('button', {
          key: chip.label, type: 'button', className: 'cws-chip-btn',
          onClick: () => {
            let home = null;
            if (selected.id === 'chat') { try { home = defaultWorkspace(library.get().workspaces); } catch { home = null; } }
            appCtx.uiWorkspace.startSession(home ? home.workspaceId : undefined, { prompt: String(chip.prompt ?? chip.label), whenDraftExists: 'replace' });
          },
        }, h(ChipIcon, { name: typeof chip.icon === 'string' ? chip.icon : 'spark' }), chip.label)));
    }

    const CHIP_ICONS = {"slides": "M4 5h16v11H4zM12 16v4M8 20h8", "website": "M4 5h16v14H4zM4 9h16M7 7h.01M9 7h.01", "app": "M8 3h8v18H8zM11 18h2", "spreadsheet": "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14", "chart": "M5 19V9M10 19V5M15 19v-7M20 19v-4M4 19h17", "research": "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20", "game": "M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-2a3 3 0 0 1 3-3zM8 11v2M7 12h2M16 12h.01M18 12h.01", "spark": "M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"};
    function ChipIcon({ name }) {
      const d = CHIP_ICONS[name] ?? CHIP_ICONS.spark;
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
    }

    function LinkIcon({ size }) { return h(Glyph, { name: 'link', size }); }
    function SparkleIcon({ size }) { return h(Glyph, { name: 'sparkle', size }); }

    return {
      inject: ['slots', 'layout', 'uiWorkspace', 'locale', 'remote', 'remote.settings'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const style = document.createElement('style');
        style.setAttribute('data-cowork-shell-style', '');
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        const model = createModel(ctx);
        const pages = createPages(ctx);
        const library = createLibrary(ctx);
        const trash = createTrash();
        const projects = createProjects();
        const shared = () => ({ appCtx: ctx, model, pages, library, trash, projects });

        ctx.effect(() => ctx.slots.inject('sidebar', function* () {
          yield ctx.slots.registerFactory({
            name: 'sidebar.panel.icon', scope: 'root',
            children: { 'sidebar.panellist': { kind: 'list', scope: 'root' } },
          }, PanelIcon);
          yield ctx.slots.register({
            name: 'sidebar',
            locale: NS,
            children: {
              'sidebar.brand.mark': { kind: 'single', scope: 'root' },
              'sidebar.brand.name': { kind: 'single', scope: 'root' },
              'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
              'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
              'sidebar.workspaces': {
                kind: 'single', scope: 'root',
                inject: { hooks: { sectionScroller: (_standard, hookContext) => hookContext.useSectionScroller } },
              },
              'sidebar.settings': { kind: 'single', scope: 'root' },
              'sidebar.footer.action': { kind: 'list', scope: 'root' },
            },
            inject: shared,
          }, CoworkSidebar);
        }, 'cowork-shell: sidebar'));
        ctx.inject(['remote.pluginManager'], (inner) => {
          PLUGIN_SWITCH.set = (entryId, on) => inner.remote.pluginManager.setPluginEnabled(entryId, on);
          inner.effect(() => () => { PLUGIN_SWITCH.set = null; }, 'cowork-shell: plugin switch');
        });
        // Full pages with their own sidebar rows (listed per tab by the tab layout).
        const tPage = ctx.locale.bind(NS);
        for (const page of [
          { key: 'connectors', order: 30, label: () => tPage('connectors.title'), Page: ConnectorsPage, Icon: LinkIcon },
          { key: 'skills', order: 31, label: () => tPage('skills.title'), Page: SkillsPage, Icon: SparkleIcon },
        ]) {
          ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: page.key }, () => h(page.Page, { appCtx: ctx }))), `cowork-shell: ${page.key} page`);
          ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: page.key, order: page.order, label: page.label,
          }, page.Icon)), `cowork-shell: ${page.key} row`);
        }
        // The project page: opened from a project's row, so it has no row of its own in the page list.
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'project' }, () => h(ProjectPage, { appCtx: ctx, model, library, projects }))), 'cowork-shell: project page');
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'project', order: 99, label: () => tPage('proj.title'),
        }, function ProjectIcon({ size }) { return h(Glyph, { name: 'folder', size }); })), 'cowork-shell: project page entry');
        // Start page: greeting next to the logo and suggestion chips.
        ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
          name: 'conversation.hero.brand.mark', inject: shared,
        }, HeroGreeting)), 'cowork-shell: start page greeting');
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options', id: 'cowork-chips', order: 50, inject: shared,
        }, HeroChips)), 'cowork-shell: suggestion chips');
        ctx.effect(() => ctx.slots.inject('shell.leading', () => ctx.slots.register({
          name: 'shell.leading', locale: NS, inject: shared,
        }, Leading)), 'cowork-shell: macOS hidden-sidebar controls');
      },
    };
  },
});
