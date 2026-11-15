/**
 * The words Modes adds to a conversation's system prompt, and how they are put together from what
 * applies to the conversation. Kept apart from the plugin so it can be tested without the app.
 */
import { WEB_TOOLS, researchTab } from './mask.js';

/**
 * How to work in Code mode. Used while the Code mode has no instructions of its own
 * (Settings → Modes), and the `codeMethod` setting is on.
 */
export const CODE_METHOD = `You are in Code mode: a software engineer working in this project's folder, with the user following your work.

How to work:
1. Understand before you change. Read the files a task touches, and the project's own instructions (AGENTS.md, CLAUDE.md, README), before editing. Follow the conventions, libraries and style the project already uses. Do not bring in a new dependency without saying why.
2. Plan in the open. For anything with more than two steps, keep a step list with todo_write: one step in progress at a time, tick each off when it is done, and change the list when the plan changes.
3. Make small, exact changes. Prefer editing an existing file to writing a new one. Change only what the task needs: do not reformat, rename or tidy code nobody asked about. Never write secrets into files.
4. Prove it works. After a change, run what shows it is right: the tests, the build, the linter, or the program itself. Read the output. If something fails, find the cause and fix it. Never hide a failure, skip a test or weaken a check to get a pass. If you could not run something, say so.
5. Be careful with what cannot be undone. Ask before deleting files, rewriting history, force-pushing, changing shared settings or touching anything outside the project. Commit or push only when the user asks.
6. Search widely, read narrowly. Use the search tools (grep, glob, and the code map's code_map_* tools; where tools load as needed and those are not offered yet, tools_find("code") adds them) to find where things are, then read only the parts you need.
7. When you are stuck after two real attempts at the same problem, stop and say what you tried, what you saw and what you think is going on.

How to report:
- Before each group of steps, say in one short line what you are about to do, so the user can follow.
- Refer to code as path:line, so the user can open it.
- At the end: what changed and in which files, what you ran and what it showed, and anything not done or not verified. Say it plainly, without praise for your own work.
- Answer a question about the code with the answer first, then where in the code it comes from. Do not change files when the user only asked a question.`;

/** Added while the conversation's tools are switched off. */
export const TOOLS_OFF_PROMPT =
  'Tools are switched off for this conversation. Answer from what you know and do not try to call a tool. If the task cannot be done without tools, say so in one sentence.';

/** Added while a conversation loads its tools as needed. */
export const TRIM_PROMPT =
  'Tools load as needed in this conversation: only the core tools are offered at first. If a task needs others (PDF, data and charts, finance, diagrams, scheduling, helpers, goals, Library, memory, Mac, code map, learning, missions, connectors, plugins, Office files), call tools_find first. Never tell the user a tool is missing before checking with tools_find.';

/**
 * The Web levels in an isolated mode (Recon), which searches with its own tools: the same levels,
 * in words that fit any search tool.
 */
export const ISOLATED_LEVEL_PROMPTS = {
  quick: 'Search effort is Quick: one or two searches with your search tools; read only the sources needed to answer; keep it short.',
  standard: '',
  thorough: 'Search effort is Thorough: several searches with different wording across the sources you have; read at least five sources; cross-check names, figures and dates between them; cite each source.',
  deep: 'Search effort is Deep: at least ten searches with different wording across every source you have; read at least ten sources in full; check every key fact in at least two independent sources; say where they disagree; cite each source. Take the time this needs.',
};
export const ISOLATED_OFF_PROMPT = 'Searching is switched off for this conversation (Web · Off): your search and reading tools are not available. Work only with what is already in this conversation, and tell the user to switch Web on in the chat box to search.';
/**
 * An isolated mode under the app's PTC preset: its guard refuses `run_code`, the only tool the model
 * could call there, so the conversation cannot reach its tools at all. Programs stay refused on purpose.
 */
export const ISOLATED_PTC_PROMPT = 'This conversation runs in the app\'s PTC preset, where tools are called from inside run_code programs. This isolated tab runs no programs, so none of its tools can be used here. Do not call run_code. Tell the user that this tab works only in the Standard preset, and to start the conversation again with the Standard preset.';

/**
 * What the model is told about how hard to search, per step. Standard is how it searches without
 * being told anything, so it adds no words.
 */
export const SEARCH_DEPTH_PROMPTS = {
  quick: 'Search depth is set to Quick: when you look something up on the web, one search is usually enough. Answer from the results, and open a page only when the results do not answer the question. Keep it short and name the source.',
  standard: '',
  deep: 'Web level is Deep: for anything you look up, run at least ten searches with different wording, open and read at least ten pages from different sites with web_fetch (a search result\'s snippet is not a source), cross-check every key fact, figure and date in at least two independent sources, say plainly where sources disagree, and cite each source with its date. Take the time this needs.',
  thorough: 'Search depth is set to Thorough: when you look something up on the web, run several searches with different wording, open at least five pages from different sites and read them (a search result\'s snippet is not a source), prefer primary sources, cross-check figures and dates between sources, say where sources disagree, and cite each source you used with its date.',
};

/**
 * Added in a mode with its own tools (for example Chat) while Web is on: it names only the web tools
 * the step really offers.
 * @param {string[]} names - the web tools on offer.
 * @param {'none' | string[]} tools - the mode's own tools.
 * @returns {string} the note, or '' when no web tool is on offer.
 */
export function webPrompt(names, tools) {
  const offered = WEB_TOOLS.filter((name) => names.includes(name));
  if (offered.length === 0) return '';
  const rest = tools === 'none' ? ', even though file and command tools are unavailable in this mode' : '';
  const noSearch = offered.includes('web_search') ? '' : ' There is no web search here, so open only pages whose address you know or are given.';
  return `Web is on for this conversation: you may use ${offered.join(' and ')} to look things up${rest}.${noSearch}`;
}

/**
 * Added while Web is Off in a mode that has tools: the model is told what went, instead of finding
 * out from tools that are simply missing.
 * @param {string[]} [offline] - the other tools that go online and are taken away with the web.
 * @returns {string} the note.
 */
export function webOffPrompt(offline = []) {
  const finance = offline.some((name) => name.startsWith('finance_')) ? ' (such as the finance_* data tools)' : '';
  return `Web is off for this conversation: web_search, web_fetch, deep_research and the other tools that go online${finance} are not available. When an answer needs current information you cannot fetch, say so rather than guessing.`;
}

/**
 * The text of Modes' section in a conversation's system prompt.
 * @param {object} want - what applies to the agent.
 * @param {object} want.mode - its conversation's mode.
 * @param {boolean} [want.child] - the agent is a helper: it gets no mode wording ("answer in one reply, no tools" would stop a searcher), only the note about programs.
 * @param {boolean} [want.off] - the conversation's tools are switched off.
 * @param {boolean} [want.alone] - the model version stands alone: the mode's own wording is left out, except an isolated mode's, whose rules always hold.
 * @param {boolean} [want.web] - the conversation has the web.
 * @param {string[]} [want.stepWeb] - the web tools this step offers; undefined when the app does not say (an inspection).
 * @param {string} [want.level] - the conversation's Web level.
 * @param {boolean} [want.webOff] - an isolated conversation's Web button is on Off.
 * @param {boolean} [want.codeMethod] - the Code mode gets its working method while it has no prompt of its own.
 * @param {boolean} [want.trimmed] - the conversation loads its tools as needed.
 * @param {string[]} [want.offline] - the other tools that go online that the app knows.
 * @param {string} [want.programs] - the note for an agent that reaches its tools through programs.
 * @param {boolean} [want.programOnly] - the agent reaches its tools only through programs (the PTC preset).
 * @returns {string} the section's text.
 */
export function promptText({ mode, child = false, off = false, alone = false, web = false, stepWeb, level = 'standard', webOff = false, codeMethod = true, trimmed = false, offline = [], programs = '', programOnly = false }) {
  if (child) return programs;
  const join = (parts) => parts.filter(Boolean).join('\n\n');
  // A mode without tools, and an isolated one (its rules on untrusted text hold with tools off too), keep their own words.
  if (off) return join([mode.tools === 'none' || mode.isolated ? mode.prompt : '', TOOLS_OFF_PROMPT]);
  const own = mode.prompt || (mode.id === 'code' && codeMethod ? CODE_METHOD : '');
  if (mode.isolated) {
    // Its tools are its own, never reached through programs: under PTC it says it cannot work there.
    return join([own, webOff ? ISOLATED_OFF_PROMPT : ISOLATED_LEVEL_PROMPTS[level], programOnly ? ISOLATED_PTC_PROMPT : '']);
  }
  // A research tab (Research, Scout) has no Web button and works by its own method: no web note, no Web level.
  const ownSearch = researchTab(mode.tools);
  // The web tools on offer: those the step admits (a provider without a key is not), or all while it is not known.
  const webTools = !web ? [] : Array.isArray(stepWeb) ? WEB_TOOLS.filter((name) => stepWeb.includes(name)) : WEB_TOOLS;
  const webNote = !ownSearch && web && mode.tools !== 'all' ? webPrompt(webTools, mode.tools) : '';
  // With Web Off, only a mode that would otherwise go online is told what went.
  const couldGoOnline = mode.tools === 'all' || (Array.isArray(mode.tools) && mode.tools.some((name) => WEB_TOOLS.includes(name) || offline.includes(name)));
  let levelNote = '';
  if (!ownSearch && web && webTools.includes('web_search')) levelNote = SEARCH_DEPTH_PROMPTS[level] ?? '';
  else if (!ownSearch && !web && couldGoOnline) levelNote = webOffPrompt(offline);
  return join([alone ? '' : own, webNote, levelNote, trimmed ? TRIM_PROMPT : '', programs]);
}
