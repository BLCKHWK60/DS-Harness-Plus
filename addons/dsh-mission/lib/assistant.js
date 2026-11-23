/**
 * Stage E (point 8, 20 November 2026): what the conversation's own assistant may do while its Mission is on but paused
 * (by you, a problem or a restart). While the Mission works, its model only keeps it moving (the conductor guard); the
 * Mission's helpers are never affected by this. Pure, so it is tested without the app.
 *
 *   look  Talk and look things up (the default): reading and searching, also the web; no file changes, no commands, no
 *         helpers, no settings.
 *   talk  Only talk: no tools at all.
 */

/** The choices, the default first. */
export const ASSISTANT_CHOICES = Object.freeze(['look', 'talk']);

/** @returns {'look' | 'talk'} a saved or given choice; anything unknown reads as 'look'. */
export function readAssistant(value) {
  return value === 'talk' ? 'talk' : 'look';
}

/** Tools that only read or show, when Modes cannot say how a tool is sorted. */
export const LOOK_NAMES = new Set(['read', 'glob', 'grep', 'read_image', 'working_directory', 'web_search', 'web_fetch', 'other_search', 'other_read', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource', 'mac_find_files', 'diagram_draw', 'present', 'skill', 'tools_find']);
/** Tools that show something or load a how-to (tier 0), allowed with Talk and look things up. */
const SHOW = new Set(['diagram_draw', 'present', 'skill', 'tools_find']);
/** Never with Talk and look things up, whatever their sorting says. */
const NEVER = /^(write|edit|multi_edit|apply_patch|notebook_edit|str_replace_editor|move|delete|remove|bash|terminal|shell|pwsh|request_tool_access|mission_request_files|create_goal|update_goal|get_goal|todo_write|remember|run_in_background)$|^schedule_|^(subagent|delegate|agent_swarm|swarm|run_swarm|deep_research|engine|workflow|review_lanes|run_pipeline|judge_candidates|send_message|wait_agent)/;
/**
 * Review of stage E: tools that Modes sorts as reading (tier 0 or 1 of a reading group) but that save something: the
 * owner's Scout profile and reports, a chart file, an analysis, the learner's records, a finance profile, a page picture.
 */
export const LOOK_WRITES = new Set(['scout_profile', 'scout_report', 'data_chart', 'data_save_analysis', 'data_rerun_analysis', 'learn_plan', 'learn_mark', 'learn_end', 'learn_review', 'finance_profile_save', 'pdf_page_image']);
/** A sorted tool whose name says it saves, sets or sends something (a word between underscores): never with look. */
const WRITE_WORDS = /(^|_)(save|saves|write|mark|plan|end|report|add|put|set|delete|remove|create|make|import|export|record|update|rerun|chart|image|review|upload|send|post|install)($|_)/;
/** A program whose whole code is the Mission's step (the PTC preset's way to call mission_step): nothing else runs. */
const STEP_PROGRAM = /^\s*(return\s+)?(await\s+)?tools\.mission_step\(\s*(\{\s*\})?\s*\)\s*;?\s*$/;
/** @returns {boolean} whether a run_code program only calls the Mission's step. */
export const stepOnlyProgram = (args) => STEP_PROGRAM.test(String(args?.code ?? ''));
/** Recon's own reading tools (Recon's own rules still apply to them). */
const RECON_LOOK = /^recon_.*_(search|read|find|groups)$|^recon_cite$/;
/** The groups whose tier 0 and 1 tools only read or search. */
const LOOK_GROUPS = new Set(['read', 'web', 'accounts', 'mac']);

/** Said to the model when a tool is refused because the settings say Only talk. */
export const TALK_ONLY = 'A Mission is paused in this thread, and its settings say the assistant only talks meanwhile (Mission settings: While a Mission runs, the assistant can). Answer in words. The Mission does the work when the user presses Resume.';
/** Said to the model when a tool that changes something is refused with Talk and look things up. */
export const LOOK_ONLY = 'A Mission is paused in this thread: meanwhile the assistant may only read and search (Mission settings: While a Mission runs, the assistant can). This tool changes files, runs commands, starts helpers or changes settings, so it was not run. Say in words what you would do; the Mission does the work when the user presses Resume.';
/**
 * Item 7 (owner, 21 November 2026): said when a program is refused while the Mission works or waits and its settings say
 * Only talk. Under the PTC preset the step is reached from a program, so that one program still runs; nothing else does.
 */
export const TALK_PROGRAM = 'A Mission is working in this thread, and its settings say the assistant only talks meanwhile (Mission settings: While a Mission runs, the assistant can). Only the Mission\'s step runs as a program: return await tools.mission_step({}). This program was not run. Call the step as above, or answer the user in words.';
/** Said when a program is refused with Talk and look things up: a program can change files and run commands by itself. */
export const LOOK_PROGRAM = 'A Mission is on in this thread: meanwhile the assistant may only read and search (Mission settings: While a Mission runs, the assistant can). A program can change files and run commands by itself, so none is run now. Answer the user in words.';


/** What the conversation's model is told while its Mission is paused or stopped by a problem (or a restart). */
export const ASSISTANT_NOTE = Object.freeze({
  talk: (goal) => `A Mission is on in this thread and is paused (goal: ${goal}). Talk with the user and use no tools. Do not carry on the Mission's work yourself: it carries on when the user presses Resume.`,
  look: (goal) => `A Mission is on in this thread and is paused (goal: ${goal}). Talk with the user. You may read files and search, also the web, to answer; change no files, run no commands and start no helpers. Do not carry on the Mission's work yourself: it carries on when the user presses Resume.`,
});
/** Added to the conductor's rules while the Mission works or waits, with Talk and look things up. */
export const LOOK_WORKING_NOTE = 'If the user asks you something meanwhile, you may read files and search, also the web, to answer them; change no files, run no commands and start no helpers yourself.';

/**
 * Whether the conversation's own assistant may use a tool while its Mission is on (paused, or with `working` while it
 * works or waits: then only reading and searching besides mission_step, never a question to the user; the conductor
 * guard gives its own words for anything refused then).
 * @param {object} call - the call.
 * @param {'look' | 'talk'} call.choice - the Mission's setting.
 * @param {string} call.name - the tool.
 * @param {{group?: string, tier?: number, sorted?: boolean} | undefined} [call.kind] - Modes' sorting of the tool (undefined: Modes cannot say).
 * @param {boolean} [call.isolated] - a Recon conversation.
 * @param {object} [call.args] - the call's arguments (run_code: its program).
 * @param {boolean} [call.working] - the Mission works or waits (not paused): the conductor's own step stays allowed.
 * @returns {string} the refusal ('' when it may).
 */
export function assistantRefusal({ choice, name, kind, isolated = false, args, working = false }) {
  const tool = String(name ?? '');
  const talk = readAssistant(choice) === 'talk';
  if (tool === 'mission_step') return '';
  // While it works: Only talk keeps the conductor to its step; a question to the user goes through the Mission's card.
  // Item 7: under the PTC preset the step is a program, so with Only talk only a program whose whole code is the step runs.
  if (working && talk && tool === 'run_code') return stepOnlyProgram(args) ? '' : TALK_PROGRAM;
  if (working && (talk || tool === 'ask_user_question')) return TALK_ONLY;
  if (tool === 'ask_user_question') return '';
  if (talk) return TALK_ONLY;
  if (NEVER.test(tool)) return LOOK_ONLY;
  // Review of stage E: a program can change files and run commands by itself (only its tools.* calls are checked one by
  // one), so with look only a program whose whole code is the Mission's step runs.
  if (tool === 'run_code') return stepOnlyProgram(args) ? '' : LOOK_PROGRAM;
  if (isolated) return RECON_LOOK.test(tool) ? '' : LOOK_ONLY;
  if (SHOW.has(tool)) return '';
  if (LOOK_WRITES.has(tool)) return LOOK_ONLY;
  if (kind && typeof kind === 'object') {
    const tier = Number(kind.tier);
    const reads = kind.sorted === true && Number.isFinite(tier) && tier <= 1 && LOOK_GROUPS.has(String(kind.group ?? ''));
    return reads && (LOOK_NAMES.has(tool) || !WRITE_WORDS.test(tool)) ? '' : LOOK_ONLY;
  }
  return LOOK_NAMES.has(tool) ? '' : LOOK_ONLY;
}
