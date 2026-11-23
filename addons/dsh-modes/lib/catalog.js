/**
 * Tool access, part 1: the one list of every tool the app and the add-ons can offer.
 *
 * Each tool has a plain name, a one-line purpose, the add-on it comes from, a group (the eleven
 * groups of Settings → Tool access) and a risk tier from 0 to 4. A tool that is not in the list is
 * "not sorted": state Ask, group "Not sorted", tier 3 (as powerful as bash) until somebody sorts it.
 * Kept apart from the plugin so it can be tested without the app. Never holds a secret.
 */

/** The eleven groups of the grid, in order, plus the one that holds new tools. */
export const GROUPS = [
  { id: 'read', label: 'Read files', about: 'Look at files and folders, PDFs, pictures and your Library.' },
  { id: 'change', label: 'Change files', about: 'Write, edit, move or delete files.' },
  { id: 'run', label: 'Run commands', about: 'Run commands and programs on this Mac.' },
  { id: 'web', label: 'Browse the web', about: 'Search the internet and read web pages.' },
  { id: 'accounts', label: 'Accounts and connectors', about: 'Services you connected (mail, calendar, drives and so on).' },
  { id: 'mac', label: 'Other Mac apps', about: 'Find files anywhere on the Mac and run Shortcuts.' },
  { id: 'helpers', label: 'Helpers and other models', about: 'Start helper agents, swarms and deep research that use other models.' },
  { id: 'make', label: 'Make things', about: 'Draw diagrams, make images, documents and reports.' },
  { id: 'schedule', label: 'Schedule and remember', about: 'Schedules, goals, memory and the step list.' },
  { id: 'devices', label: 'Devices', about: 'Phones, boards, routers and other gear (the Devices space).' },
  { id: 'app', label: 'App and plugins', about: 'Change the app itself: plugins, workflows, Tool access.' },
];
export const UNSORTED_GROUP = { id: 'unsorted', label: 'Not sorted', about: 'New tools nobody has sorted yet. They start on Ask.' };

/** The risk tiers: what the word on the popup says. */
export const TIERS = {
  0: { word: 'Look', says: 'it only shows you something' },
  1: { word: 'Read', says: 'it reads and researches' },
  2: { word: 'Change', says: 'it can change things in your workspace or cost money' },
  3: { word: 'High', says: 'it can change or delete files, run programs, reach other models or services' },
  4: { word: 'Never', says: 'it can only be switched on in Settings by you' },
};
/** Tier of a tool nobody has sorted. */
export const UNSORTED_TIER = 3;

/** Tools only the owner can switch on, in Settings: no request is ever shown for them. */
export const SETTINGS_ONLY = 4;

/** The two tools this feature gives the AI. They are always offered while Tool access is on. */
export const CATALOG_TOOL = 'tools_catalog';
export const REQUEST_TOOL = 'request_tool_access';

// name or prefix -> entry. `names` first, then `prefix`; the first match wins, so list specific before general.
const E = (group, tier, plain, purpose, addon, match) => ({ group, tier, plain, purpose, addon, ...match });
const ENTRIES = [
  // ---- read files ----
  E('read', 1, 'Read a file', 'Reads a file inside the thread\'s folder.', 'app', { names: ['read'] }),
  E('read', 1, 'Find files by name', 'Lists files that match a pattern.', 'app', { names: ['glob'] }),
  E('read', 1, 'Search inside files', 'Searches the text of files in the folder.', 'app', { names: ['grep'] }),
  E('read', 0, 'Look at a picture', 'Reads an image file so the AI can see it.', 'app', { names: ['read_image'] }),
  E('read', 0, 'Folder in use', 'Says which folder the thread works in.', 'app', { names: ['working_directory'] }),
  E('read', 1, 'Read a PDF', 'Reads, searches and looks at PDF files.', 'dsh-pdf', { prefix: 'pdf_' }),
  E('read', 1, 'Your Library', 'Searches and reads your own documents in the Library.', 'dsh-library', { prefix: 'library_' }),
  E('read', 1, 'Code map', 'Overview of a codebase: files, symbols, what uses what.', 'dsh-code-map', { prefix: 'code_map_' }),
  E('read', 1, 'Look at data files', 'Lists, profiles and queries data files.', 'dsh-data', { names: ['data_files', 'data_profile', 'data_query', 'data_text', 'data_analyses', 'data_chart'] }),
  E('read', 1, 'Company figures and news', 'Reads public company, price and economy data (goes online).', 'dsh-finance', { prefix: 'finance_' }),
  E('read', 1, 'Learning tutor', 'Study plans, lessons and reviews.', 'dsh-learn', { prefix: 'learn_' }),
  // ---- change files ----
  E('change', 2, 'Write a file', 'Creates or replaces a file in the folder.', 'app', { names: ['write'] }),
  E('change', 2, 'Edit a file', 'Changes part of a file.', 'app', { names: ['edit', 'multi_edit', 'apply_patch', 'str_replace_editor', 'notebook_edit'] }),
  E('change', 3, 'Move or delete files', 'Moves, renames or removes files.', 'app', { names: ['move', 'delete', 'remove'] }),
  E('change', 2, 'Save an analysis', 'Saves or reruns a data analysis.', 'dsh-data', { names: ['data_save_analysis', 'data_rerun_analysis'] }),
  E('change', 2, 'Save a finance profile', 'Saves the figures and choices of the Finance helper for later.', 'dsh-finance', { names: ['finance_profile_save'] }),
  E('change', 2, 'Office files', 'Makes or converts Word, Excel and PowerPoint files.', 'app', { prefix: 'office_' }),
  // ---- run commands ----
  E('run', 3, 'Run a command in Terminal', 'Runs a command on this Mac. It can change or delete files and run programs.', 'app', { names: ['bash', 'terminal', 'shell', 'pwsh'] }),
  E('run', 3, 'Run a program', 'Runs a small program (code) in one go.', 'app', { names: ['run_code', 'data_python'] }),
  E('run', 2, 'Watch a running command', 'Shows, lists or stops commands that run in the background.', 'app', { names: ['job_output', 'job_list', 'job_kill'] }),
  // ---- browse the web ----
  E('web', 1, 'Search the web', 'Searches the internet.', 'app', { names: ['web_search'] }),
  E('web', 1, 'Read a web page', 'Opens a web page and reads it.', 'app', { names: ['web_fetch'] }),
  E('web', 1, 'Your own sources', 'Searches and reads the web sources you set up yourself.', 'dsh-modes', { names: ['other_search', 'other_read'] }),
  E('web', 1, 'Weather and other searches', 'Search tools of the Free Search plugin.', 'plugin', { names: ['weather', 'multi_search', 'advanced_search', 'platform_search', 'video_search', 'cache_search', 'domain_search', 'research', 'search_web_pages', 'web_search_exa', 'zhihu_search', 'global_search', 'search_pro', 'free_search_test'] }),
  E('web', 1, 'Job and posting search', 'Searches job and demand sources.', 'dsh-scout', { prefix: 'scout' }),
  // ---- accounts and connectors ----
  E('accounts', 3, 'Connector tool', 'A tool of a service you connected (mail, calendar, drive, store…).', 'connector', { prefix: 'mcp__' }),
  E('accounts', 1, 'Connector lists', 'Lists what a connector holds.', 'app', { names: ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'] }),
  // ---- other Mac apps ----
  E('mac', 1, 'Find files on the Mac', 'Finds files anywhere on this Mac with Spotlight.', 'dsh-mac', { names: ['mac_find_files'] }),
  E('mac', 3, 'Run a Shortcut', 'Runs a Mac Shortcut, which can do almost anything.', 'dsh-mac', { names: ['mac_shortcuts'] }),
  E('mac', 3, 'Other Mac app tool', 'A tool that drives another app on this Mac.', 'dsh-mac', { prefix: 'mac_' }),
  // ---- helpers and other models ----
  E('helpers', 3, 'Start a helper', 'Starts a helper agent that works on its own.', 'app', { names: ['subagent', 'subagent_fork', 'list_agents', 'wait_agent', 'send_message', 'list_subagent_models', 'delegate_role', 'review_lanes', 'run_pipeline', 'judge_candidates'] }),
  E('helpers', 3, 'Swarm of helpers', 'Fans a task out to many helpers.', 'dsh-agent-swarm', { names: ['run_swarm'] }),
  E('helpers', 3, 'Deep research', 'Parallel helpers research a question and write a cited report.', 'dsh-deep-research', { names: ['deep_research'] }),
  E('helpers', 3, 'Engines', 'Hands work to another engine or coding tool.', 'dsh-engines', { names: ['engine'] }),
  // ---- make things ----
  E('make', 0, 'Draw a diagram', 'Draws a flow chart, tree, timeline or chart in the thread.', 'dsh-diagram', { names: ['diagram_draw', 'present'] }),
  E('make', 2, 'Make an image', 'Makes or edits a picture with an image service (can cost money).', 'dsh-media-tools', { names: ['generate_image', 'edit_image'] }),
  E('make', 2, 'Write content', 'Plans, drafts and checks written content in Content mode.', 'dsh-content', { prefix: 'content_' }),
  // Creator Plus tools write and change add-ons (code that then runs): as powerful as the Terminal.
  E('make', 3, 'Build a skill or tool', 'Creator Plus tools that scaffold and change add-ons.', 'dsh-creator-plus', { prefix: 'creator_' }),
  E('make', 2, 'Reports', 'Writes results or reports.', 'dsh-automations', { names: ['automation_results'] }),
  // ---- schedule and remember ----
  E('schedule', 0, 'Step list', 'Keeps a list of steps for the thread.', 'app', { names: ['todo_write'] }),
  E('schedule', 0, 'Ask you a question', 'Asks you a question and waits.', 'app', { names: ['ask_user_question'] }),
  E('schedule', 0, 'Skills', 'Loads a skill (a written how-to).', 'app', { names: ['skill'] }),
  E('schedule', 0, 'Leave plan mode', 'Ends plan mode.', 'app', { names: ['exit_plan_mode'] }),
  E('schedule', 2, 'Schedules', 'Creates, changes and lists automations.', 'app', { prefix: 'schedule_' }),
  E('schedule', 2, 'Remember', 'Saves something for later threads.', 'dsh-memory', { names: ['remember'] }),
  E('schedule', 0, 'Goals', 'Sets a goal, reads it, updates progress.', 'app', { names: ['create_goal', 'get_goal', 'update_goal'] }),
  E('schedule', 0, 'Load more tools', 'Lists and adds families of tools.', 'dsh-modes', { names: ['tools_find'] }),
  // ---- devices ----
  E('devices', 3, 'Devices tool', 'Reads or talks to a phone, board, router or other device.', 'dsh-bench', { prefix: 'bench_' }),
  // ---- app and plugins ----
  E('app', 3, 'Plugin manager', 'Lists and changes the app\'s plugins.', 'app', { names: ['plugin_manager'] }),
  E('app', 3, 'Workflows', 'Runs workflows made of many agents.', 'app', { names: ['workflow'] }),
  E('app', 1, 'Tool catalogue', 'Lists the tools the AI could ask for.', 'dsh-modes', { names: [CATALOG_TOOL] }),
  E('app', 0, 'Ask for a tool', 'Asks you to allow one more tool.', 'dsh-modes', { names: [REQUEST_TOOL] }),
  E('app', 3, 'Skills and tuning', 'Works on how the AI is instructed.', 'dsh-tuning', { prefix: 'tuning_' }),
  E('app', 3, 'Skill architect', 'Writes and changes skills.', 'dsh-skill-architect', { names: ['skills'] }),
  // ---- tier 4: never self-grantable ----
  E('app', 4, 'Mission', 'Runs a long mission with checkpoints. Switched on only in Settings.', 'dsh-mission', { names: ['mission', 'mission_step', 'mission_request'], prefix: 'mission_' }),
  E('app', 4, 'Recon', 'Recon\'s own research tools. They never leave the Recon space.', 'dsh-recon', { prefix: 'recon_', names: ['recon'] }),
  E('app', 4, 'Secrets and keys', 'The secret store, the Keychain and keys. Never given to the AI.', 'app', { prefix: 'credentials', names: ['keychain', 'secrets', 'secret_store'] }),
  E('app', 4, 'Access level', 'Changes how much the app may touch (sandbox, permission level).', 'app', { names: ['set_access_level', 'permission_mode', 'sandbox_policy'] }),
  E('app', 4, 'Tool access itself', 'Changes what is allowed. Only you do that, in Settings.', 'dsh-modes', { names: ['tool_access', 'set_tool_access'] }),
  E('app', 4, 'Git push', 'Sends changes to a remote or forces them.', 'app', { names: ['git_push', 'git_force_push'] }),
  E('app', 4, 'Install a plugin', 'Installs new plugins.', 'app', { names: ['plugin_install'] }),
];

/** Bench tools that write to a device or change levels: tier 4 (Devices' own rules, not for the AI to open). */
export const DEVICE_RISKY = ['bench_firmware', 'bench_serial_send', 'bench_undo', 'bench_esp32', 'bench_jlink', 'bench_openocd', 'bench_stm32', 'bench_rp2040', 'bench_arduino', 'bench_router', 'bench_server', 'bench_network', 'bench_net_scan', 'bench_firmware_extract'];

/** Modes whose tool list is fixed by their own safety rules: shown as Locked, not changeable in the grid. */
export const LOCKED_MODES = ['recon', 'bench', 'devices', 'creator-plus'];

/** Tools Recon may never ask for or be given: the secret store, the Keychain and Recon's private route rules. */
export const RECON_NEVER = ['keychain', 'secrets', 'secret_store', 'credentials', 'recon_routes', 'recon_route_rules'];

/** Write and command tools: Mission's and Split Plus's two lists in one (each used its own before). */
export const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'notebook_edit', 'str_replace_editor', 'move', 'delete', 'remove']);
export const COMMAND_TOOLS = new Set(['bash', 'terminal', 'shell', 'pwsh']);

const byName = new Map();
for (const entry of ENTRIES) for (const name of entry.names ?? []) if (!byName.has(name)) byName.set(name, entry);

/**
 * What the list knows about a tool.
 *
 * A name is matched by its prefix only where that is safe: the prefix of an add-on's own tools (pdf_, office_, library_,
 * code_map_, finance_, learn_, scout, content_, creator_, schedule_) counts only for the names that add-on really
 * has (ADDON_NAMES), so a third-party tool that merely starts the same way (`pdf_upload`) is "Not sorted" at tier 3
 * and never inherits the lower risk of "Read a PDF". Prefixes that already stand for tier 3 or 4 stay open: a
 * new name under them can only be rated too high, never too low.
 * @param {string} name - the tool's raw name.
 * @returns {{name: string, plain: string, purpose: string, addon: string, group: string, tier: number, sorted: boolean}} the entry; a tool nobody has sorted comes back in the "Not sorted" group at tier 3.
 */
export function classify(name) {
  const raw = String(name ?? '');
  if (DEVICE_RISKY.includes(raw)) return { name: raw, plain: 'Devices tool that writes or changes levels', purpose: 'Writes to a device or changes how a device is set up. Devices\' own rules guard it.', addon: 'dsh-bench', group: 'devices', tier: 4, sorted: true };
  let entry = byName.get(raw);
  if (!entry) entry = ENTRIES.find((one) => one.prefix && raw.startsWith(one.prefix) && (one.tier >= 3 || !ADDON_PREFIXES.has(one.prefix) || ADDON_SET.has(raw)));
  if (!entry) return { name: raw, plain: raw, purpose: 'A tool nobody has sorted yet.', addon: '', group: UNSORTED_GROUP.id, tier: UNSORTED_TIER, sorted: false };
  return { name: raw, plain: entry.plain, purpose: entry.purpose, addon: entry.addon, group: entry.group, tier: entry.tier, sorted: true };
}

/** Whether a tool is one of the two Tool access tools (always on while Tool access is on; never part of the grid). */
export const isOwnTool = (name) => name === CATALOG_TOOL || name === REQUEST_TOOL;

/** @returns {{id: string, label: string, about: string}} a group, or the "Not sorted" one. */
export function groupOf(id) {
  return GROUPS.find((group) => group.id === id) ?? UNSORTED_GROUP;
}

/** Tools never listed or requestable anywhere: nothing about them reaches the AI. */
export const HIDDEN_FROM_AI = (name) => /^(credentials|keychain|secrets?|secret_store)/.test(String(name ?? ''));

/** The add-on package folder an entry's `addon` names, or '' for the app itself, plugins and connectors. */
const ADDON_LIVE = (addon) => /^dsh-/.test(addon);

/**
 * The catalogue: every known tool with its entry and whether it can be had now.
 * @param {string[]} known - the tools the app knows (those of switched-off add-ons are not among them).
 * @param {object} [options] - what else is known.
 * @param {(addon: string) => boolean} [options.addonOn] - whether an add-on is switched on (default: yes).
 * @param {string[]} [options.extraNames] - tools to list even though the app does not know them (the add-ons that are off).
 * @returns {object[]} entries with `addonOff` set where the tool's add-on is off.
 */
export function catalogue(known, { addonOn = () => true, extraNames = [] } = {}) {
  const names = [...new Set([...(Array.isArray(known) ? known : []), ...extraNames])];
  const live = new Set(known);
  return names.map((name) => {
    const entry = classify(name);
    const addonOff = ADDON_LIVE(entry.addon) && (!live.has(name) || addonOn(entry.addon) === false);
    return { ...entry, addonOff };
  }).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

/**
 * The tool names of the add-ons that list them by prefix (found by reading each add-on), so the catalogue can name
 * them even while the add-on is switched off. A tool added later is still found by its prefix once the add-on is on.
 */
const ADDON_NAMES = [
  'pdf_info pdf_read pdf_search pdf_page_image pdf_ocr',
  'library_search library_read',
  'code_map_overview code_map_file code_map_find code_map_related code_map_read',
  'finance_prices finance_news finance_social finance_company_figures finance_company_filings finance_economy finance_source_get',
  'learn_plan learn_mark learn_review learn_status learn_end',
  'scout_sources scout_search scout_titles scout_demand scout_pay scout_posting scout_assess scout_files scout_profile scout_report scout_reports',
  'content_reports content_ledger content_rule content_plan content_formats content_draft content_check content_approve content_correct content_library content_continue content_inventory content_setup content_save content_conversations content_bring_in',
  'creator_map creator_passport creator_recipe creator_interview creator_plan creator_scaffold creator_check creator_change creator_upkeep creator_improve creator_note creator_handoff creator_learn creator_selftest',
  'bench_devices bench_catalogue bench_usb_info bench_serial_watch bench_log bench_monitor bench_dashboard bench_requirements bench_recipe',
  'tuning_status tuning_plan tuning_start tuning_export_set tuning_skill_draft tuning_skills_run',
  'data_files data_profile data_query data_chart data_python data_text data_save_analysis data_rerun_analysis data_analyses',
  'schedule_create schedule_edit schedule_list schedule_view',
  'mac_find_files mac_shortcuts',
  'office_render office_convert office_recalculate',
].flatMap((line) => line.split(' '));

const ADDON_SET = new Set(ADDON_NAMES);
/** Prefixes that belong to one add-on's own tools: trusted only for the names that add-on has. */
const ADDON_PREFIXES = new Set(['pdf_', 'library_', 'code_map_', 'finance_', 'learn_', 'scout', 'content_', 'creator_', 'schedule_', 'office_']);

/** Every name the list holds (for the "tools of switched-off add-ons" part of the catalogue). */
export function listedNames() {
  return [...new Set([...byName.keys(), ...ADDON_NAMES])];
}
