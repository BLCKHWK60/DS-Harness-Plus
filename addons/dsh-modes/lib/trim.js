/**
 * Tool trimming: a conversation in a mode with all tools starts with a small core set and the
 * `tools_find` tool. Other tools come in families, added when the model asks for them or when the
 * user's message mentions them, and stay for the rest of the conversation.
 * Kept apart from the plugin so it can be tested without the app.
 */

/** The tool that lists and adds the other families. */
export const FIND_TOOL = 'tools_find';

/**
 * Always there: files, the shell and its jobs, the step list, questions, skills, images, and the
 * end of plan mode (the app offers that one only while /plan is on).
 */
export const CORE = [
  'read', 'write', 'edit', 'glob', 'grep', 'bash', 'job_output', 'job_list', 'job_kill',
  'todo_write', 'ask_user_question', 'skill', 'read_image', 'working_directory', 'exit_plan_mode', FIND_TOOL,
];

/**
 * The families. `names` are tools by name; `prefixes` catch the rest of a family; `words` are what
 * in a user's message switches the family on before the model starts.
 */
export const FAMILIES = [
  { id: 'pdf', about: 'PDF files: read, search, page pictures, text from scans', prefixes: ['pdf_'], words: /\bpdfs?\b/i },
  { id: 'data', about: 'Data files and analysis: profile, query, charts, Python, saved analyses', prefixes: ['data_'], words: /\b(csv|xlsx?|excel|spreadsheets?|parquet|dataset|pivot|regression|chart|graph|plot)\b/i },
  { id: 'finance', about: 'Company figures and filings, economies, prices, financial news and social mood', prefixes: ['finance_'], words: /\b(stocks?|shares?|ticker|earnings|revenue|market cap|10-k|sec filing|dividend|valuation|gdp|inflation)\b/i },
  { id: 'visual', about: 'Diagrams and charts drawn in the thread, and presenting a file', names: ['diagram_draw', 'present'], words: /\b(diagram|flow ?chart|mind ?map|draw|visuali[sz]e|present)\b/i },
  { id: 'schedule', about: 'Automations (scheduled and recurring): create, change, list', names: ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view'], prefixes: ['schedule_'], words: /\b(schedule|every (day|morning|evening|week|monday|hour)|daily|weekly|recurring|remind me|automation)\b/i },
  { id: 'helpers', about: 'Helper agents: start, fork, message and wait for them; swarms, pipelines, review lanes; deep research', names: ['subagent', 'subagent_fork', 'list_agents', 'wait_agent', 'send_message', 'list_subagent_models', 'delegate_role', 'run_swarm', 'run_pipeline', 'review_lanes', 'judge_candidates', 'deep_research'], words: /\b(sub-?agents?|helpers?|in parallel|swarm|delegate|deep research)\b/i },
  { id: 'goals', about: 'Goals: set one, read it, update progress', names: ['create_goal', 'get_goal', 'update_goal'], words: /\bgoals?\b/i },
  { id: 'library', about: 'The Library: search and read your own documents', prefixes: ['library_'], words: /\b(library|my documents|my notes|my files)\b/i },
  { id: 'memory', about: 'Memory: remember something for later threads', names: ['remember'], words: /\b(remember|memory|don'?t forget)\b/i },
  { id: 'mac', about: 'The Mac: find files anywhere, run Shortcuts', prefixes: ['mac_'], words: /\b(shortcuts?|spotlight|finder|on my mac)\b/i },
  { id: 'code', about: 'The code map: overview of a codebase, find symbols, related files', prefixes: ['code_map_'], words: /\b(codebase|code ?base|repository|repo|refactor|code map)\b/i },
  { id: 'learn', about: 'Learning: plans, lessons, review, progress', prefixes: ['learn_'], words: /\b(teach me|learn|lesson|quiz|course|study)\b/i },
  { id: 'mission', about: 'Missions: long multi-step runs with checkpoints', prefixes: ['mission_'], words: /\bmissions?\b/i },
  { id: 'connectors', about: 'Connectors (MCP): their tools and resources', names: ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'], prefixes: ['mcp__'], words: /\b(mcp|connectors?)\b/i },
  { id: 'app', about: 'The app itself: plugins and workflows', names: ['plugin_manager', 'workflow'], words: /\b(plugins?|workflows?)\b/i },
  { id: 'office', about: 'Office files: render, convert, recalculate; bundled Python for documents; presenting the file', names: ['load_workspace_dependencies', 'present'], prefixes: ['office_'], words: /\b(slides?|slide deck|powerpoint|pptx|docx|word document|xlsx|excel (?:files?|sheets?|workbooks?)|spreadsheets?)\b/i },
];

/** Skills whose loading brings a family: the app's Office skills say their tools appear next step. */
const SKILL_FAMILIES = [{ skill: /^office(?:-|$)/, family: 'office' }];

const byId = new Map(FAMILIES.map((family) => [family.id, family]));
/** Words too common to say which tools are meant. */
const COMMON = new Set(['from', 'with', 'that', 'this', 'make', 'have', 'into', 'about', 'what', 'some', 'need', 'want', 'file', 'files', 'tool', 'tools', 'them', 'then', 'will', 'your', 'more', 'other', 'like', 'please', 'help', 'using', 'used', 'read', 'write', 'show', 'list', 'find', 'text', 'data', 'search', 'something', 'anything', 'everything', 'thing', 'things', 'later', 'work']);
const meaningful = (terms) => terms.filter((term) => term.length >= 4 && !COMMON.has(term));
const wordIn = (text, term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);

/** The family a tool belongs to, or undefined for core and unknown tools. */
export function familyOf(name) {
  const tool = String(name ?? '');
  return FAMILIES.find((family) => family.names?.includes(tool) || family.prefixes?.some((prefix) => tool.startsWith(prefix)))?.id;
}

/**
 * The tools a conversation may use: the core, the families it has, and any single tools it added.
 * @param {string[]} known - every tool the app knows.
 * @param {string[]} added - families and single tool names added in this conversation.
 * @returns {string[]} the names to allow.
 */
export function allowed(known, added) {
  const families = new Set(added.filter((entry) => byId.has(entry)));
  const single = added.filter((entry) => !byId.has(entry));
  const fromFamilies = [];
  for (const id of families) {
    const family = byId.get(id);
    fromFamilies.push(...(family.names ?? []));
    fromFamilies.push(...known.filter((name) => family.prefixes?.some((prefix) => name.startsWith(prefix))));
  }
  return [...new Set([...CORE, ...fromFamilies, ...single])];
}

/** Tools the app knows that are neither core nor in a family: listed by name in the catalog. */
export function others(known) {
  // The two Tool access tools are never offered through the finder: they are there on their own while Tool access is on, and not at all while it is off.
  return known.filter((name) => !CORE.includes(name) && !familyOf(name) && !['web_search', 'web_fetch', 'run_code', 'other_search', 'other_read', 'tools_catalog', 'request_tool_access'].includes(name));
}

/** Whether a tool is one of a family's. */
export function inFamily(id, name) {
  const family = byId.get(id);
  const tool = String(name ?? '');
  return Boolean(family) && (family.names?.includes(tool) || family.prefixes?.some((prefix) => tool.startsWith(prefix)) === true);
}

/**
 * Whether adding a family or a single tool brings anything: a tool of its own among those it would
 * offer. A family whose add-on is off, or a tool the conversation's switches take away, brings nothing.
 * @param {string} entry - a family id or a tool name.
 * @param {string[]} offered - the tools the conversation would be offered with it added.
 * @returns {boolean}
 */
export function brings(entry, offered) {
  return offered.some((name) => !CORE.includes(name) && (name === entry || inFamily(entry, name)));
}

/** The line the app writes above a loaded skill's own words when the skill lives in a folder. */
const FOLDER_LINE = 'Base directory for this skill: ';

/**
 * Whether a skill's folder is one of the app's own Office skills, inside the app's package:
 * <app>/Contents/Resources/…/dsh-skill-office/assets/office[-docx|-pptx|-xlsx]. A skill of the same
 * name anywhere else (a file in a project or in the shared folder, which wins over the app's) is not.
 * @param {unknown} folder - the skill's folder.
 * @param {string} contents - the app's Contents folder.
 * @returns {boolean} true for the app's own.
 */
export function appOfficeFolder(folder, contents) {
  const value = String(folder ?? '');
  const root = String(contents ?? '').replace(/\/+$/, '');
  if (!root || !value.startsWith(`${root}/Resources/`) || value.split('/').includes('..')) return false;
  return /\/dsh-skill-office\/assets\/office(?:-[a-z]+)?$/.test(value);
}

/**
 * The folder the app names in a loaded skill's text, read only from the part the app writes above
 * the skill's own words (<skill_resources>), so a skill's text cannot claim another folder.
 * @param {unknown} text - the text of the message the app added.
 * @returns {string} the folder, or ''.
 */
export function skillFolderIn(text) {
  const value = String(text ?? '');
  const start = value.indexOf('<skill_resources>');
  const end = value.indexOf('</skill_resources>');
  const words = value.indexOf('<skill_instructions>');
  if (start < 0 || end < start || (words >= 0 && words < end)) return '';
  // Only the first line the app writes there, and only when it names a folder: another kind of
  // skill (a web address, a description) could hold a line that looks like it (the review, 17 November).
  const first = value.slice(start + '<skill_resources>'.length, end).replace(/^\n/, '').split('\n')[0] ?? '';
  return first.startsWith(FOLDER_LINE) ? first.slice(FOLDER_LINE.length).trim() : '';
}

/** The families a loaded skill brings with it. */
export function skillFamilies(skill) {
  const name = String(skill ?? '');
  return SKILL_FAMILIES.filter((entry) => entry.skill.test(name)).map((entry) => entry.family);
}

/** The families whose words a text mentions. */
export function mentioned(text) {
  const value = String(text ?? '');
  if (!value) return [];
  return FAMILIES.filter((family) => family.words?.test(value)).map((family) => family.id);
}

/**
 * Which families or tools a request names: family ids, tool names, or words matched against the
 * families' descriptions and the tools' own descriptions.
 * @param {string} query - what the model asked for.
 * @param {{name: string, description?: string}[]} definitions - the tools the app knows, with descriptions.
 * @returns {string[]} family ids and single tool names.
 */
export function resolveRequest(query, definitions) {
  const text = String(query ?? '').toLowerCase().trim();
  if (!text) return [];
  const found = new Set();
  const terms = text.split(/[\s,;]+/).filter(Boolean);
  for (const term of terms) {
    if (byId.has(term)) found.add(term);
    else if (definitions.some((definition) => definition.name === term)) found.add(familyOf(term) ?? term);
  }
  if (found.size > 0) return [...found];
  const strong = meaningful(terms);
  // A family's own words are the surest sign; its description only when none of them matched.
  for (const family of FAMILIES) if (family.words?.test(text) || terms.includes(family.id)) found.add(family.id);
  if (found.size === 0) for (const family of FAMILIES) if (strong.some((term) => wordIn(family.about, term))) found.add(family.id);
  if (found.size > 0) return [...found].filter((entry) => !CORE.includes(entry));
  // Nothing in the families' own words: the tools' descriptions decide.
  for (const definition of definitions) {
    const hay = `${definition.name.replace(/_/g, ' ')} ${definition.description ?? ''}`;
    if (strong.some((term) => wordIn(hay, term))) found.add(familyOf(definition.name) ?? definition.name);
  }
  return [...found].filter((entry) => !CORE.includes(entry));
}

/**
 * Lab re-check fix (6a, problem 3): whether a space closes a family (or a single tool) for this thread. A family is
 * closed when every tool of it that no other family shares is refused, and at least one is (Office in Devices: its
 * `office_*` tools and its bundled-Python loader are refused; `present`, which Office shares with the diagrams, does not
 * keep it open). A family with nothing installed is not closed (it is "not available").
 * @param {string} entry - a family id or a tool name.
 * @param {string[]} known - every tool the app knows.
 * @param {(name: string) => boolean} refused - whether the space refuses a tool for this thread.
 * @returns {boolean}
 */
export function closedHere(entry, known, refused) {
  if (!byId.has(entry)) return known.includes(entry) && refused(entry);
  const own = known.filter((name) => inFamily(entry, name) && !FAMILIES.some((other) => other.id !== entry && inFamily(other.id, name)));
  return own.length > 0 && own.every((name) => refused(name));
}

/**
 * The catalog shown by `tools_find` without arguments, and in its description.
 * @param {string[]} known - the tools to list.
 * @param {string[]} [added] - families already added.
 * @param {string[]} [leaveOut] - families not to list (those the thread's space closes).
 * @returns {string}
 */
export function catalog(known, added = [], leaveOut = []) {
  const have = new Set(added);
  const lines = FAMILIES
    .filter((family) => !leaveOut.includes(family.id))
    .filter((family) => (family.names ?? []).some((name) => known.includes(name)) || known.some((name) => family.prefixes?.some((prefix) => name.startsWith(prefix))))
    .map((family) => `- ${family.id}${have.has(family.id) ? ' (added)' : ''}: ${family.about}`);
  const rest = others(known);
  if (rest.length > 0) lines.push(`- other single tools: ${rest.join(', ')}`);
  return lines.join('\n');
}
