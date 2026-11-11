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
        'new.other': 'New session',
        'pages.label': '{tab} sections',
        'more': 'More',
        'toggle.open': 'Open sidebar',
        'toggle.collapse': 'Collapse sidebar',
        'brand': 'DeepSeek Harness',
        'tab.failed': 'Could not switch to {tab}',
        'connectors.title': 'Connectors',
        'connectors.hint': 'Apps and data sources the assistant can use, through MCP servers. A switched-off connector keeps its settings.',
        'connectors.empty': 'No connectors yet. Add one below, or copy one from the MCP starter pack (templates/mcp-starter in DeepSeek Harness Plus).',
        'connectors.unavailable': 'The connector list could not be read.',
        'connectors.on': 'On',
        'connectors.noSwitch': 'The app\'s plugin switch is not available here; use the Plugins page.',
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
        'move.to': 'Move to {tab}',
        'move.label': 'Move "{title}" to another tab',
        'move.failed': 'Could not move the conversation.',
        'proj.move': 'Move all conversations of "{title}" to another tab',
        'proj.new': 'New conversation in this project',
        'show.more': 'Show {n} more',
        'lib.title.chat': 'Recent chats',
        'lib.title.cowork': 'Recent tasks',
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
        'move.to': '移到 {tab}',
        'move.label': '把“{title}”移到其他标签页',
        'move.failed': '无法移动该对话。',
        'proj.move': '把“{title}”的所有对话移到其他标签页',
        'proj.new': '在此项目中新建对话',
        'show.more': '再显示 {n} 个',
        'lib.title.chat': '最近的聊天',
        'lib.title.cowork': '最近的任务',
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
        "chips": []
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
.cws-pop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;padding:4px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-sidebar-fill)}
.cws-lead{display:flex;align-items:center;gap:8px}
.cws-page{height:100%;overflow-y:auto;box-sizing:border-box;padding:28px clamp(16px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px}
.cws-page-in{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.cws-page h1{margin:0;font-size:22px;font-weight:600}
.cws-page .cws-hint{margin:4px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.5}
.cws-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.cws-card{border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:4px 14px}
.cws-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l3)}
.cws-item:first-child{border-top:0}
.cws-item-main{flex:1;min-width:0}
.cws-item-name{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-item-sub{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.cws-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cws-chip[data-tone=good]{color:var(--dsw-alias-state-success-primary,inherit);border-color:currentColor}
.cws-chip[data-tone=bad]{color:var(--dsw-alias-state-error-primary,inherit);border-color:currentColor}
.cws-btn{height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.cws-btn:disabled{opacity:.5;cursor:default}
.cws-switch{position:relative;width:34px;height:20px;flex:none;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer;padding:0}
.cws-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-inverted,#fff);transition:left .15s}
.cws-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#3b82f6)}
.cws-switch[aria-checked=true]::after{left:16px}
.cws-switch:disabled{opacity:.5;cursor:default}
.cws-form{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:10px 12px;align-items:center;padding:12px 0}
.cws-form label{color:var(--dsw-alias-label-secondary);font-size:13px}
.cws-form input,.cws-form textarea,.cws-form select,.cws-search{width:100%;box-sizing:border-box;padding:6px 9px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.cws-form textarea{min-height:64px;resize:vertical;font-family:var(--ds-font-family-code,monospace)}
.cws-yaml{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
.cws-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cws-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
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
.cws-chip-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 16px 0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:17px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:14px}
@media (hover:hover){.cws-chip-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}}
.cws-chip-btn svg{color:var(--dsw-alias-label-secondary)}
.cws-chip-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,currentColor);outline-offset:2px}
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
.cws-movepop{position:absolute;right:0;top:calc(100% + 2px);z-index:50;min-width:150px;padding:4px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-overlay);box-shadow:0 6px 24px #0004}
.cws-moveitem{display:block;width:100%;padding:6px 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;text-align:left;white-space:nowrap}
.cws-more-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:4px 12px;text-align:left}
@media (hover:hover){.cws-proj-main:hover,.cws-conv-main:hover,.cws-mini:hover,.cws-moveitem:hover,.cws-link:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.cws-error{margin:0 4px 8px;color:var(--dsw-alias-state-business-primary, inherit);font-size:12px}
@media (hover:hover){.cws-icon:hover,.cws-tab:hover:not([aria-selected='true']),.cws-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.cws-new:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}}
.cws-root :is(button):focus-visible,.cws-lead button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,currentColor);outline-offset:-2px}
`;

    /** Plain line icons used when the app's icon set is not reachable. */
    const PATHS = {
      chat: 'M4 5h16v10H9l-5 4z',
      cowork: 'M4 7h16v12H4zM9 7V5h6v2',
      code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
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
      return modeId === 'chat' || modeId === 'code' || modeId === 'cowork' ? modeId : 'dot';
    }

    /**
     * Shared state: the modes (from the Modes add-on's settings), the selected tab and this add-on's
     * tab layout. One store for the whole page, refreshed on demand and every 10 seconds.
     */
    function createModel(ctx) {
      let state = { modes: FALLBACK_MODES, selected: readLocal(), tabs: DEFAULT_TABS, maxTabs: 3, modesOn: false, error: '', sessionModes: {} };
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
          }
          if (modesNs) {
            const defined = Object.entries(readObject(modesNs.value?.modes)).map(([id, value]) => ({
              id,
              label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
            }));
            patch.modes = defined.length > 0 ? defined : FALLBACK_MODES;
            patch.modesOn = true;
            if (started === clicks) patch.sessionModes = readObject(modesNs.value?.sessionModes);
            const current = modesNs.value?.defaultMode;
            if (started === clicks && typeof current === 'string' && patch.modes.some((m) => m.id === current)) {
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
        try {
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

      return {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => state,
        refresh,
        select,
        move,
      };
    }

    /** Snapshot of every plugin's sidebar page row, ordered like the app's own sidebar. */
    function createPages(ctx) {
      let snapshot = [];
      const read = () => ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => ({
        id: options.id,
        order: options.order ?? 0,
        label: typeof options.label === 'function' ? String(options.label()) : String(options.label ?? options.id),
      })).sort((a, b) => a.order - b.order);
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
    function MoreMenu({ wide, label, entries, onOpen, renderSlot }) {
      const [open, setOpen] = useState(false);
      const onDismiss = () => setOpen(false);
      const button = h('button', {
        type: 'button', className: 'cws-row', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: () => setOpen((v) => !v),
      }, h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'grid', size: wide ? 16 : 18 })),
      wide ? h('span', { className: 'cws-label' }, label) : null);
      const rows = renderSlot('sidebar.panellist.actions', { entries, onOpen: (id) => { onDismiss(); onOpen(id); }, onPinnedChange: () => {}, onDismiss });
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
      let snapshot = { ok: false, workspaces: [], byId: {}, pinned: [], archived: [], currentId: null };
      let version = 0;
      const read = () => {
        const ws = get('workspaces')?.list?.getSnapshot?.();
        const ss = get('sessions')?.list?.getSnapshot?.();
        if (!ws || !ss || ws.phase !== 'ready' || ss.phase !== 'ready') return { ...snapshot, ok: false };
        let currentId = null;
        try { currentId = get('uiWorkspace')?.selection?.getSnapshot?.()?.sessionId ?? null; } catch { currentId = null; }
        return {
          ok: true,
          workspaces: Array.isArray(ws.items) ? ws.items : [],
          byId: ss.byId ?? {},
          pinned: Array.isArray(ws.pinnedSessionIds) ? ws.pinnedSessionIds : [],
          archived: Array.isArray(ws.archivedSessionIds) ? ws.archivedSessionIds : [],
          currentId,
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
          ];
          // Titles and times change without always notifying; refresh gently.
          const timer = setInterval(update, 5000);
          return () => { clearInterval(timer); for (const off of offs) { try { off?.(); } catch { /* ignore */ } } };
        },
      };
    }

    const LIST_KEY = 'dsh-cowork-shell.listAll';

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

    function MoveMenu({ t, tabs, current, onMove, label }) {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        if (!open) return undefined;
        const close = () => setOpen(false);
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
      }, [open]);
      return h('span', { className: 'cws-move', onPointerDown: (e) => e.stopPropagation() },
        h('button', {
          type: 'button', className: 'cws-mini', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open, title: label,
          onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); },
        }, '⋯'),
        open ? h('div', { className: 'cws-movepop', role: 'menu' },
          tabs.filter((m) => m.id !== current).map((m) => h('button', {
            key: m.id, type: 'button', role: 'menuitem', className: 'cws-moveitem',
            onClick: (e) => { e.stopPropagation(); setOpen(false); onMove(m.id); },
          }, t('move.to', { tab: m.label })))) : null);
    }

    /** The open tab's conversations, grouped under their projects. */
    function TabLibrary({ appCtx, model, library, tabs, selected, onShowAll }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const [open, setOpen] = useState({});
      const [more, setMore] = useState({});
      const tabIds = tabs.map((m) => m.id);
      const uw = (() => { try { return appCtx.get('uiWorkspace'); } catch { return null; } })();

      const archived = new Set(lib.archived);
      const pinned = new Set(lib.pinned);
      const placed = new Set();
      // An empty new conversation shows only while it is the open one.
      const sortRows = (ids) => ids
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !archived.has(id) && (!lib.byId[id].blank || id === lib.currentId))
        .sort((a, b) => (pinned.has(b) - pinned.has(a)) || ((lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0)));

      const projects = [];
      for (const ws of lib.workspaces) {
        const ids = sortRows(ws.sessionIds ?? []);
        for (const id of ws.sessionIds ?? []) placed.add(id);
        const mine = ids.filter((id) => tabOfSession(id, lib.byId[id], ws, state, tabIds) === selected.id);
        if (mine.length > 0) projects.push({ ws, ids: mine, all: ids, latest: Math.max(...mine.map((id) => lib.byId[id].updatedAt ?? 0)) });
      }
      projects.sort((a, b) => b.latest - a.latest);
      const loose = sortRows(Object.keys(lib.byId).filter((id) => !placed.has(id)))
        .filter((id) => tabOfSession(id, lib.byId[id], null, state, tabIds) === selected.id);

      const openSession = (id) => {
        try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
        uw?.openSession?.(id);
      };

      const row = (id, ws) => {
        const sess = lib.byId[id];
        const title = (!sess.blank && sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
        const current = lib.currentId === id;
        return h('div', { key: id, className: 'cws-conv', 'aria-current': current ? 'page' : undefined },
          h('button', { type: 'button', className: 'cws-conv-main', onClick: () => openSession(id), title },
            sess.running ? h('span', { className: 'cws-dot', role: 'img', 'aria-label': t('running'), title: t('running') }) : null,
            pinned.has(id) ? h('span', { className: 'cws-pin', 'aria-hidden': true }, '•') : null,
            h('span', { className: 'cws-label' }, title),
            h('span', { className: 'cws-time' }, ago(t, sess.updatedAt))),
          sess.blank ? null : h(MoveMenu, {
            t, tabs, current: tabOfSession(id, sess, ws, state, tabIds),
            label: t('move.label', { title }),
            onMove: (modeId) => void model.move([id], modeId),
          }));
      };

      const list = (ids, key, ws) => {
        const limit = more[key] ? ids.length : 8;
        return h(React.Fragment, null, ids.slice(0, limit).map((id) => row(id, ws)),
          ids.length > limit ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, [key]: true })) }, t('show.more', { n: ids.length - limit })) : null);
      };

      const empty = projects.length === 0 && loose.length === 0;
      return h('div', { className: 'cws-lib' },
        h('div', { className: 'cws-lib-head' },
          h('span', null, t('lib.title.' + (['chat', 'cowork', 'code'].includes(selected.id) ? selected.id : 'other'), { tab: selected.label })),
          h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all'))),
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
              h(MoveMenu, { t, tabs, current: selected.id, label: t('proj.move', { title: ws.title || '' }), onMove: (modeId) => void model.move(all.filter((id) => !lib.byId[id]?.blank), modeId) })),
            isOpen ? h('div', { className: 'cws-proj-list' }, list(ids, ws.workspaceId, ws)) : null);
        }),
        loose.length ? h(React.Fragment, null,
          h('div', { className: 'cws-lib-head' }, h('span', null, t('lib.loose'))),
          list(loose, '__loose', null)) : null);
    }

    function CoworkSidebar(props) {
      const { collapsed, width, drawer, renderSlot, renderFactorySlot, usePanelInfo, appCtx, model, pages, library } = props;
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
      const tabs = state.modes.slice(0, state.maxTabs);
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

      const startSession = () => {
        try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
        appCtx.uiWorkspace.startSession();
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
        void model.select(tabs[next].id, tabs[next].label);
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

      const tabList = h('div', { ref: tabsRef, className: 'cws-tabs', role: 'tablist', 'aria-label': t('tabs.label'), 'aria-orientation': wide ? 'horizontal' : 'vertical', onKeyDown: onTabKey },
        tabs.map((m) => h(Tooltip, { key: m.id, label: m.label, show: !wide },
          h('button', {
            type: 'button', role: 'tab', className: 'cws-tab', 'aria-selected': m.id === selected.id,
            tabIndex: m.id === selected.id ? 0 : -1, 'aria-label': wide ? undefined : m.label,
            onClick: () => { if (m.id !== selected.id) void model.select(m.id, m.label); },
          }, h(Glyph, { name: glyphFor(m.id), size: wide ? 15 : 18 }), wide ? h('span', null, m.label) : null))));

      const more = entryActions
        ? h(MoreMenu, {
          wide, label: t('more'), renderSlot,
          entries: allPages.filter((p) => p.id !== 'plugins').map((p) => ({ id: p.id, label: p.label, pinned: true, active: p.id === active })),
          onOpen: (id) => appCtx.layout.selectPanel(id),
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
        h('div', { className: 'cws-brand', 'data-window-drag': darwin ? '' : undefined },
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
            ? h(TabLibrary, { appCtx, model, library, tabs, selected, onShowAll: () => setShowAll(true) })
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
    function Leading({ appCtx, model }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const key = ['chat', 'cowork', 'code'].includes(state.selected) ? 'new.' + state.selected : 'new.other';
      return h('div', { className: 'cws-lead' },
        h('button', { type: 'button', className: 'cws-icon', 'data-sidebar-opener': '', 'aria-label': t('toggle.open'), onClick: () => appCtx.layout.toggleSidebar() }, h(Glyph, { name: 'panel', size: 16 })),
        h('button', { type: 'button', className: 'cws-icon', 'aria-label': t(key), onClick: () => { try { appCtx.layout.selectPanel(null); } catch { /* already there */ } appCtx.uiWorkspace.startSession(); } }, h(Glyph, { name: 'plus', size: 16 })));
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
      const tabs = state.modes.slice(0, state.maxTabs);
      const selected = tabs.find((m) => m.id === state.selected) ?? tabs[0];
      const greeting = String(tabEntry(state, selected.id).greeting || '').slice(0, 120);
      const mark = UI.FishLogo ? h(UI.FishLogo, { size: size ?? 34 }) : null;
      if (!greeting) return mark;
      return h('span', { className: 'cws-hero', 'data-cws-hero': '' }, mark, h('span', { className: 'cws-hero-text' }, greeting));
    }

    /** Suggestion chips: each fills the chat box with a starter prompt. */
    function HeroChips({ appCtx, model }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const tabs = state.modes.slice(0, state.maxTabs);
      const selected = tabs.find((m) => m.id === state.selected) ?? tabs[0];
      const chips = tabEntry(state, selected.id).chips
        .filter((chip) => chip && typeof chip.label === 'string' && chip.label.trim())
        .slice(0, 12);
      if (chips.length === 0) return null;
      return h('div', { className: 'cws-chips', role: 'group', 'aria-label': appCtx.locale.bind(NS)('chips.label') },
        chips.map((chip) => h('button', {
          key: chip.label, type: 'button', className: 'cws-chip-btn',
          onClick: () => appCtx.uiWorkspace.startSession(undefined, { prompt: String(chip.prompt ?? chip.label), whenDraftExists: 'replace' }),
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
        const shared = () => ({ appCtx: ctx, model, pages, library });

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
